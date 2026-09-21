import {
  OpenRouteServiceAdapter,
  RoutingError,
  type LatLng,
  type Position,
  type RouteOption,
  type RoutingAdapter,
} from '@railrover/shared';

import { env } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import type { CrossingRow } from '@/lib/crossings';

/**
 * Route options with their crossing counts (SOW M4 "Destination Search and Route Options").
 *
 * This is the product's differentiating feature: two routes with similar travel times are not
 * equivalent if one passes six crossings and the other passes one. The count comes from
 * `crossings_on_route`, so the corridor rule lives in exactly one place — the database — and the
 * app cannot drift from the route-conflict logic that later reads the same corridor (ADR 0003).
 */

let adapter: RoutingAdapter | null = null;

/** Test seam, and where a local Valhalla adapter would be bound (ADR 0009). */
export const __setRoutingAdapter = (next: RoutingAdapter | null): void => {
  adapter = next;
};

function getAdapter(): RoutingAdapter {
  if (adapter) return adapter;
  if (!env.orsApiKey) {
    // Typed, so the UI can explain the real cause instead of showing a generic failure. The key
    // is free and self-service, which makes "not configured" a setup step rather than a defect.
    throw new RoutingError(
      'network_error',
      'Routing is not configured: this build has no OpenRouteService key.',
    );
  }
  adapter = new OpenRouteServiceAdapter(env.orsApiKey);
  return adapter;
}

/** GeoJSON LineString for the route-corridor query. */
const toLineString = (coordinates: Position[]) => ({
  type: 'LineString' as const,
  coordinates,
});

async function countCrossingsOn(coordinates: Position[]): Promise<{
  total: number;
  blocked: number;
}> {
  const { data, error } = await getSupabase().rpc('crossings_on_route', {
    route_geojson: toLineString(coordinates),
  });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as CrossingRow[];
  return {
    total: rows.length,
    // Only RED counts as blocked. Yellow is "blocked but unconfirmed" and green is confirmed
    // clear, so folding either into this number would overstate what the driver is choosing
    // between (ADR 0002).
    blocked: rows.filter((row) => row.color === 'red').length,
  };
}

/**
 * Route options from origin to destination, each annotated with its crossing counts.
 *
 * Counts are fetched per route rather than in one query because each route has its own corridor;
 * a crossing on route A is frequently not on route B, which is the entire point of showing them.
 */
export async function fetchRouteOptions(
  origin: LatLng,
  destination: LatLng,
  signal?: AbortSignal,
): Promise<RouteOption[]> {
  const routes = await getAdapter().getRoutes(origin, destination, {
    // ORS caps alternatives at 3, and three cards is already at the limit of what a driver will
    // compare before setting off.
    alternatives: 3,
    ...(signal ? { signal } : {}),
  });

  return Promise.all(
    routes.map(async (route, index) => {
      const counts = await countCrossingsOn(route.coordinates);
      return {
        id: `route-${index}`,
        coordinates: route.coordinates,
        durationSeconds: route.durationSeconds,
        distanceMeters: route.distanceMeters,
        totalCrossings: counts.total,
        blockedCrossings: counts.blocked,
      } satisfies RouteOption;
    }),
  );
}

/**
 * Driver-facing copy for a routing failure.
 *
 * SOW M4-AC4 requires a not-found destination and a no-route result to be handled gracefully, and
 * the free tier's quota limits are a genuine mid-pilot failure mode (risk register) — telling a
 * driver something true beats a spinner that never resolves.
 */
export function describeRoutingError(error: unknown): string {
  if (!(error instanceof RoutingError)) {
    return 'Could not work out a route. Check your connection and try again.';
  }

  switch (error.code) {
    case 'destination_not_found':
      return 'That destination could not be found. Try refining the search.';
    case 'no_route_available':
      return 'No driving route could be generated to that destination.';
    case 'route_too_long_for_alternatives':
      return 'That trip is too long to compare route options. A single route is still available.';
    case 'route_too_long_for_avoidance':
      return 'That trip is too long to route around a blocked crossing.';
    case 'quota_exceeded_daily':
      return 'Route planning is unavailable for the rest of today. Reporting still works.';
    case 'quota_exceeded_rate':
      return 'Too many route requests just now. Wait a moment and try again.';
    case 'cancelled':
      return 'Route request cancelled.';
    case 'network_error':
    default:
      return error.message;
  }
}

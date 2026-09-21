import { avoidancePolygon, type LatLng, type Position } from '@railrover/shared';

import { fetchConflictsAhead, type RouteConflictRow } from '@/lib/conflicts';
import { getRoutingAdapter } from '@/lib/routes';

/**
 * Rerouting around a blocked crossing (SOW M4 "Reroute", ADR 0005).
 *
 * This is route AVOIDANCE, not navigation: ask the routing service for a route that avoids a
 * small polygon around the blocked crossing. MVP avoids ONE crossing — avoiding several at once
 * compounds detours in ways that stop resembling a route a driver would accept.
 */

/**
 * Side length of the avoidance square, in metres.
 *
 * Big enough to exclude the crossing and its approach, small enough that the detour stays local.
 * ORS caps avoid polygons at 200 km² and 20 km on a side, so this is far inside the limits.
 */
const AVOIDANCE_SIDE_METERS = 300;

/** One retry at a wider polygon before giving up (roadmap 8d). */
const WIDENED_SIDE_METERS = 700;

export type RerouteOutcome =
  | { kind: 'rerouted'; coordinates: Position[]; durationSeconds: number; distanceMeters: number }
  /** A route exists but still passes a fresh blocked crossing — offering it would be a lie. */
  | { kind: 'no_better_route' }
  | { kind: 'failed'; message: string };

/**
 * Compute an alternate that avoids `conflict`, and verify it before returning it.
 *
 * Two things here are load-bearing and easy to skip:
 *
 *  1. **The alternate is re-checked with `conflicts_ahead` before being offered.** A route that
 *     avoids one blocked crossing by driving through another is worse than no reroute, and the
 *     driver has no way to tell. The SOW calls this out explicitly.
 *  2. **A too-small polygon is retried once, wider.** If the avoidance square does not actually
 *     force a detour, the service cheerfully returns the same road and the "reroute" changes
 *     nothing.
 */
export async function computeReroute(
  origin: LatLng,
  destination: LatLng,
  conflict: RouteConflictRow,
  signal?: AbortSignal,
): Promise<RerouteOutcome> {
  const crossing: LatLng = { latitude: conflict.latitude, longitude: conflict.longitude };

  try {
    for (const side of [AVOIDANCE_SIDE_METERS, WIDENED_SIDE_METERS]) {
      const alternate = await getRoutingAdapter().getRouteAvoiding(
        origin,
        destination,
        avoidancePolygon(crossing, side),
        signal ? { signal } : undefined,
      );

      if (!alternate) continue;

      // Does the alternate still pass the crossing we are trying to avoid? If the polygon was too
      // small to force a detour the service returns essentially the same road.
      const remaining = await fetchConflictsAhead(alternate.coordinates, origin);
      const stillBlocked = remaining.some((row) => row.crossing_id === conflict.crossing_id);
      if (stillBlocked) continue;

      // And does it route the driver into a DIFFERENT fresh blocked crossing?
      if (remaining.length > 0) return { kind: 'no_better_route' };

      return {
        kind: 'rerouted',
        coordinates: alternate.coordinates,
        durationSeconds: alternate.durationSeconds,
        distanceMeters: alternate.distanceMeters,
      };
    }

    // Both the normal and the widened polygon failed to produce a clean alternate. Say so plainly
    // and keep the current route — a driver who is told "no better route" can still decide to
    // wait or take their own detour, which is more use than a spinner.
    return { kind: 'no_better_route' };
  } catch (cause) {
    return {
      kind: 'failed',
      message:
        cause instanceof Error ? cause.message : 'Could not work out a route around the blockage.',
    };
  }
}

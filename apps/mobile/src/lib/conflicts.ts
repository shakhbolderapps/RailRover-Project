import type { LatLng, Position } from '@railrover/shared';

import { getSupabase } from '@/lib/supabase';

/**
 * Route conflict detection (SOW M4 "Route Conflict Detection").
 *
 * The algorithm lives in `conflicts_ahead()` in Postgres, not here. That is deliberate: the
 * corridor rule, the ahead-of-driver test and the freshness window are the same ones the route
 * cards and the status colours use, and a second implementation in TypeScript would be a second
 * thing to keep correct. This module only transports.
 */

export interface RouteConflictRow {
  crossing_id: string;
  dot_id: string;
  name: string | null;
  road: string | null;
  latitude: number;
  longitude: number;
  last_reported_at: string | null;
  /** Distance along the route from the driver. Orders the list; never gates an alert (ADR 0003). */
  meters_ahead: number;
}

/**
 * Fresh blocked crossings ahead of the driver, nearest first.
 *
 * Returns every one of them, however far ahead — there is no proximity filter here or in the RPC.
 * A driver warned 200 feet from a blocked crossing has already lost.
 */
export async function fetchConflictsAhead(
  route: Position[],
  driver: LatLng,
): Promise<RouteConflictRow[]> {
  const { data, error } = await getSupabase().rpc('conflicts_ahead', {
    route_geojson: { type: 'LineString', coordinates: route },
    driver_lat: driver.latitude,
    driver_lng: driver.longitude,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as RouteConflictRow[];
}

/**
 * Whether a position has moved far enough to be worth re-checking the route.
 *
 * SOW M4 wants the check re-run as the driver moves, but a GPS fix arrives far more often than
 * the answer can change. Re-querying on every fix would spend battery and quota to recompute the
 * same list; 100 m is roughly four seconds at highway speed and cannot skip past a conflict,
 * because conflicts are flagged however far ahead they are rather than at a proximity threshold.
 */
export const MOVEMENT_RECHECK_METERS = 100;

/**
 * How often to re-check regardless of movement or reports.
 *
 * The safety net the roadmap asks for. Realtime covers new reports and movement covers the
 * driver, but a report can also AGE OUT of the freshness window while the driver sits still in
 * traffic — nothing pushes that, and without this the alert would linger after it stopped being
 * true.
 */
export const PERIODIC_RECHECK_MS = 60_000;

/**
 * Record that a driver was shown an alert (SOW M5 analytics).
 *
 * Fire-and-forget: analytics must never delay or block a safety alert, and a failed log is a
 * missing data point rather than a missing warning.
 */
export async function logAlertShown(
  crossingId: string,
  deviceId: string,
  metersAhead: number,
): Promise<void> {
  await getSupabase()
    .rpc('log_alert_shown', {
      p_crossing_id: crossingId,
      p_device_id: deviceId,
      p_meters_ahead: metersAhead,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

/**
 * Record the OUTCOME of a reroute, including the ones that produced no detour.
 *
 * "No better route" and "declined" are the interesting numbers: they say whether the feature is
 * useful or merely present, which is exactly what a pilot is meant to find out.
 */
export async function logReroute(
  crossingId: string,
  deviceId: string,
  outcome: 'rerouted' | 'no_better_route' | 'declined',
): Promise<void> {
  await getSupabase()
    .rpc('log_reroute', {
      p_crossing_id: crossingId,
      p_device_id: deviceId,
      p_outcome: outcome,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

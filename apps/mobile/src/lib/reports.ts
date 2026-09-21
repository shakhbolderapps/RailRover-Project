import type { ReportStatus, SubmitReportResult } from '@railrover/shared';

import { getSupabase } from '@/lib/supabase';
import type { CrossingRow } from '@/lib/crossings';

/**
 * The report write path (SOW M3).
 *
 * Both calls go through Postgres RPCs. `submit_report` is the ONLY way a report is written — the
 * client has no insert policy on `reports` at all, because a distance or rate-limit check that a
 * client could skip is decoration (ADR 0004). This module is a thin transport layer on purpose:
 * every rule lives in the database, where it cannot be bypassed.
 */

/**
 * The nearest reportable crossing, or null when the driver is too far from any of them.
 *
 * Defaults to the configured report radius server-side, so "nearest crossing" and "nearest
 * crossing I am allowed to report" are the same question — the UI never has to know the radius.
 */
/** `nearest_crossing` returns everything `crossing_status` has, plus the distance to the driver. */
export interface NearestCrossing extends CrossingRow {
  meters_away: number;
}

export async function fetchNearestCrossing(
  latitude: number,
  longitude: number,
): Promise<NearestCrossing | null> {
  const { data, error } = await getSupabase().rpc('nearest_crossing', {
    lat: latitude,
    lng: longitude,
  });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as NearestCrossing[];
  return rows[0] ?? null;
}

/**
 * Submit a report.
 *
 * Returns the rejection as a VALUE rather than throwing, because "too far" and "rate limited" are
 * ordinary outcomes the UI has to explain, not exceptional ones. Only transport failures throw.
 * The shape matches SubmitReportResult in packages/shared, which the RPC builds directly.
 */
export async function submitReport(params: {
  crossingId: string;
  status: ReportStatus;
  deviceId: string;
  latitude: number;
  longitude: number;
}): Promise<SubmitReportResult> {
  const { data, error } = await getSupabase().rpc('submit_report', {
    p_crossing_id: params.crossingId,
    p_status: params.status,
    p_device_id: params.deviceId,
    p_lat: params.latitude,
    p_lng: params.longitude,
  });

  if (error) throw new Error(error.message);
  return data as SubmitReportResult;
}

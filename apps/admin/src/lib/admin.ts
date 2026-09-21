import { getSupabase } from './supabase';

/**
 * The admin data layer (SOW M5).
 *
 * Every write goes through an RPC that re-checks `is_admin()` server-side. Nothing here is a
 * security boundary — hiding a button is a courtesy to the operator, not a control — and the
 * pgTAP suite asserts each action refuses a non-admin caller.
 */

export interface PilotMetrics {
  active_reports: number;
  total_reports: number;
  alerts_shown: number;
  reroutes_taken: number;
  reroutes_offered: number;
}

export interface BlockedCrossing {
  crossing_id: string;
  dot_id: string;
  name: string | null;
  road: string | null;
  city: string | null;
  blocked_count: number;
  current_color: string;
}

export interface ReportRow {
  id: string;
  crossing_id: string;
  status: 'blocked' | 'clear';
  device_id: string;
  reported_at: string;
  is_removed: boolean;
}

/** Whether the signed-in account may use the panel at all. */
export async function isAdmin(): Promise<boolean> {
  const { data } = await getSupabase().auth.getUser();
  if (!data.user) return false;

  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  return profile?.role === 'admin';
}

export async function fetchMetrics(since: Date): Promise<PilotMetrics | null> {
  const { data, error } = await getSupabase().rpc('pilot_metrics', {
    p_since: since.toISOString(),
  });
  if (error) throw new Error(error.message);
  // No rows means "not an admin" — the function filters rather than raising, so an operator whose
  // role was revoked sees an empty dashboard instead of a stack trace.
  return ((data ?? []) as PilotMetrics[])[0] ?? null;
}

export async function fetchMostBlocked(since: Date, limit = 10): Promise<BlockedCrossing[]> {
  const { data, error } = await getSupabase().rpc('most_blocked_crossings', {
    p_since: since.toISOString(),
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BlockedCrossing[];
}

/** The review queue: most recent first, including already-removed rows for audit. */
export async function fetchRecentReports(limit = 50): Promise<ReportRow[]> {
  const { data, error } = await getSupabase()
    .from('reports')
    .select('id, crossing_id, status, device_id, reported_at, is_removed')
    .order('reported_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportRow[];
}

export async function removeReport(reportId: string): Promise<void> {
  const { error } = await getSupabase().rpc('admin_remove_report', { p_report_id: reportId });
  if (error) throw new Error(error.message);
}

export async function setDeviceSuspended(deviceId: string, suspended: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_device_suspended', {
    p_device_id: deviceId,
    p_suspended: suspended,
  });
  if (error) throw new Error(error.message);
}

export async function broadcast(title: string, body: string): Promise<void> {
  const { error } = await getSupabase().rpc('admin_broadcast', { p_title: title, p_body: body });
  if (error) throw new Error(error.message);
}

/** Time windows for the dashboard (SOW M5 Analytics AC3). */
export const TIME_WINDOWS = [
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
] as const;

export const windowStart = (hours: number, now: Date = new Date()): Date =>
  new Date(now.getTime() - hours * 3_600_000);

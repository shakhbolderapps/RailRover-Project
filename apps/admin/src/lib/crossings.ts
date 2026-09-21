import { getSupabase } from './supabase';

/**
 * Crossing inventory management (SOW M5).
 *
 * Writes go straight to the table under the `crossings_admin_write` RLS policy rather than through
 * an RPC. There is nothing to validate beyond what the schema already enforces — the at-grade
 * CHECK cannot be bypassed from here any more than it can from the ingest — and adding an RPC
 * would be a second place for the rules to live.
 */

export interface AdminCrossing {
  id: string;
  dot_id: string;
  name: string | null;
  road: string | null;
  city: string | null;
  state: string | null;
  railroad: string | null;
  latitude: number;
  longitude: number;
  is_active: boolean;
  color: string;
  report_count: number;
}

/**
 * EWKT for a coordinate pair.
 *
 * POINT(longitude latitude) — the opposite order to how these read everywhere else, and the same
 * trap that put every crossing in the wrong hemisphere during the ingest. Written once, here.
 */
export const toEwktPoint = (latitude: number, longitude: number): string =>
  `SRID=4326;POINT(${longitude} ${latitude})`;

/** Search the inventory. Reads the view, so the status column is the same one drivers see. */
export async function searchCrossings(query: string, limit = 25): Promise<AdminCrossing[]> {
  let request = getSupabase()
    .from('crossing_status')
    .select('id, dot_id, name, road, city, state, railroad, latitude, longitude, is_active, color, report_count')
    .limit(limit);

  if (query.trim().length > 0) {
    const term = `%${query.trim()}%`;
    request = request.or(`name.ilike.${term},road.ilike.${term},city.ilike.${term},dot_id.ilike.${term}`);
  }

  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminCrossing[];
}

export async function updateCrossing(
  id: string,
  changes: {
    name?: string | null;
    road?: string | null;
    city?: string | null;
    state?: string | null;
    latitude?: number;
    longitude?: number;
  },
): Promise<void> {
  const { latitude, longitude, ...fields } = changes;
  const payload: Record<string, unknown> = { ...fields };

  if (latitude !== undefined && longitude !== undefined) {
    payload.geom = toEwktPoint(latitude, longitude);
  }

  const { error } = await getSupabase().from('crossings').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addCrossing(crossing: {
  dot_id: string;
  name: string;
  road: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  const { latitude, longitude, ...fields } = crossing;
  const { error } = await getSupabase()
    .from('crossings')
    .insert({ ...fields, geom: toEwktPoint(latitude, longitude), source: 'admin' });
  if (error) throw new Error(error.message);
}

/**
 * Retire a crossing rather than deleting it.
 *
 * Reports reference crossings, and that history is the audit trail that makes abuse review
 * possible. `is_active = false` removes it from the map, from nearest-crossing selection and from
 * the route logic immediately, which is what "remove" means to an operator.
 */
export async function setCrossingActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().from('crossings').update({ is_active: active }).eq('id', id);
  if (error) throw new Error(error.message);
}

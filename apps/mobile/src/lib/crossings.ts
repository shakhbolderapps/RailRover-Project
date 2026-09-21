import type { CrossingColor, CrossingStatus } from '@railrover/shared';

import { getSupabase } from '@/lib/supabase';

/**
 * Reading the crossing inventory for the map (SOW M2).
 *
 * The map NEVER fetches the whole inventory. Even the 50-mile development set is ~1,700 rows and
 * the full pilot radius is ~13,000; pulling all of them would stall the first render and then ask
 * MapLibre to lay out thousands of markers. `crossings_in_bounds` returns only what is inside the
 * current viewport, capped server-side, and clustering handles the rest.
 */

/** One row of the `crossing_status` view, as PostgREST serialises it. */
export interface CrossingRow {
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
  last_status: 'blocked' | 'clear' | null;
  last_reported_at: string | null;
  report_count: number;
  color: CrossingColor;
}

export interface Bounds {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
}

/**
 * Crossings inside a viewport.
 *
 * `maxRows` mirrors the RPC's own cap. A zoomed-out map degrades to a capped result rather than
 * pulling the entire inventory — the markers are meaningless at that zoom anyway, which is what
 * clustering is for.
 */
export async function fetchCrossingsInBounds(
  bounds: Bounds,
  maxRows = 2000,
): Promise<CrossingRow[]> {
  const { data, error } = await getSupabase().rpc('crossings_in_bounds', {
    min_lat: bounds.minLatitude,
    min_lng: bounds.minLongitude,
    max_lat: bounds.maxLatitude,
    max_lng: bounds.maxLongitude,
    max_rows: maxRows,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as CrossingRow[];
}

/**
 * Fold a freshly reported crossing back into the loaded rows.
 *
 * `submit_report` returns the RECOMPUTED status, so the marker flips the moment the report lands
 * rather than waiting for the next viewport reload. The shapes differ by design: the RPC speaks
 * camelCase because it is a contract with the client (SubmitReportResult in packages/shared),
 * while these rows are the `crossing_status` view as PostgREST serialises it.
 *
 * A crossing that is not in `rows` is left out rather than appended — it is outside the current
 * viewport, and adding it would draw a marker where the map is not looking.
 */
export function applyReportedCrossing(
  rows: CrossingRow[],
  updated: CrossingStatus,
): CrossingRow[] {
  return rows.map((row) =>
    row.id === updated.id
      ? {
          ...row,
          color: updated.color,
          last_status: updated.lastStatus,
          last_reported_at: updated.lastReportedAt,
          report_count: updated.reportCount,
        }
      : row,
  );
}

/** GeoJSON, which is what MapLibre's ShapeSource consumes. */
export interface CrossingFeatureCollection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    id: string;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: {
      id: string;
      color: CrossingColor;
      name: string;
      road: string | null;
      reportCount: number;
      lastReportedAt: string | null;
    };
  }[];
}

/**
 * Rows to GeoJSON.
 *
 * Note the coordinate order flip: GeoJSON is [longitude, latitude], the reverse of how the rows
 * read and of `LatLng` everywhere else in this codebase. It is done here, once, rather than at
 * each call site.
 */
export function toFeatureCollection(rows: CrossingRow[]): CrossingFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rows.map((row) => ({
      type: 'Feature',
      id: row.id,
      geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
      properties: {
        id: row.id,
        color: row.color,
        name: row.name ?? row.road ?? row.dot_id,
        road: row.road,
        reportCount: row.report_count,
        lastReportedAt: row.last_reported_at,
      },
    })),
  };
}

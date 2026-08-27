/** Domain types shared by the mobile app, the admin panel, and Node scripts. */

/** A geographic point. Order is always (latitude, longitude) in TS; GeoJSON order is flipped. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/** GeoJSON position — [longitude, latitude]. Kept distinct from LatLng to prevent swaps. */
export type Position = [longitude: number, latitude: number];

/** A railroad crossing from the FRA inventory (SOW M2). */
export interface Crossing {
  id: string;
  /** FRA Crossing Inventory ID (Form 71). Natural key — ingest upserts on this. */
  dotId: string;
  name: string | null;
  road: string | null;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  isActive: boolean;
}

/** What a driver can report. There is no third option and no note field (SOW M3). */
export type ReportStatus = 'blocked' | 'clear';

export interface Report {
  id: string;
  crossingId: string;
  status: ReportStatus;
  deviceId: string;
  userId: string | null;
  reportedAt: string;
  isRemoved: boolean;
}

/**
 * Displayed crossing status.
 *
 * - `red`    — a FRESH blocked report (inside the freshness window)
 * - `yellow` — a blocked report that has AGED PAST the freshness window with no clear report;
 *              blocked but unconfirmed
 * - `green`  — a clear report was received. The ONLY way to green. Never on a timer.
 * - `unknown`— no reports at all. Unconfirmed, NOT clear. A distinct fourth state.
 *
 * SOW M2 Crossing Detail edge case: a crossing with no reports "shows as unconfirmed with no
 * recent report time" — that is not green.
 *
 * See decisions/0002-crossing-status-computed-at-read-time.md
 */
export type CrossingColor = 'red' | 'yellow' | 'green' | 'unknown';

/** A crossing joined with its computed status. Mirrors the `crossing_status` DB view. */
export interface CrossingStatus extends Crossing {
  color: CrossingColor;
  lastStatus: ReportStatus | null;
  lastReportedAt: string | null;
  reportCount: number;
}

/** A crossing found on the active route, with its position along it. */
export interface RouteConflict {
  crossingId: string;
  name: string | null;
  road: string | null;
  /** Distance along the route from the driver to the crossing, in metres. */
  metersAhead: number;
  lastReportedAt: string | null;
}

/** A route option offered for a destination (SOW M4). */
export interface RouteOption {
  id: string;
  /** Decoded route geometry, GeoJSON order. */
  coordinates: Position[];
  durationSeconds: number;
  distanceMeters: number;
  /** Total crossings within the corridor of this route. */
  totalCrossings: number;
  /** How many of those are currently red. */
  blockedCrossings: number;
}

/** Why a report was rejected. Returned by `submit_report` so the UI can say something true. */
export type ReportRejectionReason =
  | 'too_far_from_crossing'
  | 'rate_limited'
  | 'device_suspended'
  | 'crossing_not_found';

export type SubmitReportResult =
  | { ok: true; crossing: CrossingStatus }
  | { ok: false; reason: ReportRejectionReason; message: string };

import type { CrossingColor, ReportStatus } from './types';

/**
 * Compute a crossing's displayed status.
 *
 * This is a PURE FUNCTION of (latest report status, latest report timestamp, now,
 * freshness window). The colour is never stored in the database — the `crossing_status` view
 * computes it with the same rules in SQL, and this module is the client-side mirror used for
 * optimistic UI and for tests.
 *
 * Why read-time and not a stored column: if the colour were stored, a background job would be
 * needed to flip red -> yellow at the freshness boundary, and the freshness window would stop
 * being genuinely configurable — which the SOW requires, since these defaults are "tuned during
 * the pilot".
 *
 * See decisions/0002-crossing-status-computed-at-read-time.md
 *
 * The rules, verbatim from SOW M2 "Home Map and Crossing Markers":
 *   - red    for a fresh blocked report
 *   - yellow for a blocked report aged past the freshness window without a clear report
 *   - green  once a clear report is received; "status returns to green only on a clear report,
 *            not on a timer"
 *   - and per the Crossing Detail edge case, a crossing with no reports is UNCONFIRMED — a
 *     distinct fourth state, not green.
 */
export function computeCrossingColor(input: {
  /** Status of the most recent non-removed report, or null if there are none. */
  lastStatus: ReportStatus | null;
  /** When that report was made. Null iff lastStatus is null. */
  lastReportedAt: Date | string | null;
  /** Evaluation time. Injected rather than read from the clock so tests never sleep. */
  now: Date | string;
  freshnessWindowMinutes: number;
}): CrossingColor {
  const { lastStatus, lastReportedAt, freshnessWindowMinutes } = input;

  // No reports at all -> unconfirmed. Not clear, not blocked.
  if (lastStatus === null || lastReportedAt === null) return 'unknown';

  // A clear report is the only thing that produces green, and it does so regardless of age.
  // The app does not guess that a crossing has become blocked again over time.
  if (lastStatus === 'clear') return 'green';

  // Blocked: red while fresh, yellow once it ages out. Never green.
  const now = toDate(input.now).getTime();
  const reportedAt = toDate(lastReportedAt).getTime();
  const windowMs = freshnessWindowMinutes * 60_000;

  return reportedAt > now - windowMs ? 'red' : 'yellow';
}

/** True when this colour represents an active conflict for route-alert purposes. */
export function isActiveConflict(color: CrossingColor): boolean {
  // Only a FRESH blocked report counts. Yellow is "blocked but unconfirmed" and does not fire
  // an alert (SOW M4 edge case: "A blocked report ages past the freshness window -> System stops
  // treating the crossing as an active red conflict and shows it yellow").
  return color === 'red';
}

/** Human-readable label for a crossing colour. */
export function describeColor(color: CrossingColor): string {
  switch (color) {
    case 'red':
      return 'Blocked';
    case 'yellow':
      return 'Blocked, unconfirmed';
    case 'green':
      return 'Clear';
    case 'unknown':
      return 'Unconfirmed';
  }
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

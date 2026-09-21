/**
 * Relative time, for "last reported 4 minutes ago" (SOW M2 Crossing Detail AC1).
 *
 * A driver glancing at a crossing needs to know how stale the information is, and "4 minutes ago"
 * answers that in a way "13:42" does not — especially since the whole product turns on a
 * 15-minute freshness window.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Format the gap between `then` and `now` in coarse, glanceable units.
 *
 * Deliberately coarse: a driver does not need "3 minutes 42 seconds", and false precision on a
 * crowd-sourced timestamp implies a confidence the data does not have.
 *
 * Returns null when there is no timestamp, so callers are forced to decide what "never reported"
 * should say — that state reads differently in different places ("unconfirmed" on a marker,
 * "No reports yet" in the detail view) and a single canned string would be wrong in one of them.
 */
export function formatRelativeTime(then: Date | string | null, now: Date = new Date()): string | null {
  if (then === null) return null;

  const at = typeof then === 'string' ? new Date(then) : then;
  const elapsed = now.getTime() - at.getTime();
  if (Number.isNaN(elapsed)) return null;

  // Clock skew between the driver's device and the server can put a report slightly in the
  // future. "in 4 minutes" would look broken, so anything not yet past reads as just now.
  if (elapsed < MINUTE) return 'just now';

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(elapsed / DAY);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

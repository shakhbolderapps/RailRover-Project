import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from './time';

const now = new Date('2026-09-21T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('M2 Crossing-Detail AC1: reports minutes for recent reports', () => {
    // The freshness window is 15 minutes, so minute resolution is the resolution that matters.
    expect(formatRelativeTime(ago(4 * MINUTE), now)).toBe('4 minutes ago');
    expect(formatRelativeTime(ago(14 * MINUTE), now)).toBe('14 minutes ago');
  });

  it('singularises one minute, one hour and one day', () => {
    expect(formatRelativeTime(ago(MINUTE), now)).toBe('1 minute ago');
    expect(formatRelativeTime(ago(HOUR), now)).toBe('1 hour ago');
    expect(formatRelativeTime(ago(DAY), now)).toBe('1 day ago');
  });

  it('steps up to hours and days as the report ages', () => {
    expect(formatRelativeTime(ago(3 * HOUR), now)).toBe('3 hours ago');
    expect(formatRelativeTime(ago(5 * DAY), now)).toBe('5 days ago');
  });

  it('reads anything under a minute as "just now"', () => {
    expect(formatRelativeTime(ago(30_000), now)).toBe('just now');
    expect(formatRelativeTime(ago(0), now)).toBe('just now');
  });

  it('does not say "in 4 minutes" when device and server clocks disagree', () => {
    // A report timestamped slightly in the future is a clock-skew artefact, not a prediction.
    const future = new Date(now.getTime() + 4 * MINUTE);
    expect(formatRelativeTime(future, now)).toBe('just now');
  });

  it('M2 Crossing-Detail edge case: returns null for a crossing with no reports', () => {
    // Null rather than a canned string, because "never reported" reads differently in different
    // places — "unconfirmed" on a marker, "No reports yet" in the detail view.
    expect(formatRelativeTime(null, now)).toBeNull();
  });

  it('returns null rather than "NaN minutes ago" for an unparseable timestamp', () => {
    expect(formatRelativeTime('not a date', now)).toBeNull();
  });

  it('accepts the ISO strings PostgREST actually returns', () => {
    expect(formatRelativeTime('2026-09-21T11:58:00.000Z', now)).toBe('2 minutes ago');
  });
});

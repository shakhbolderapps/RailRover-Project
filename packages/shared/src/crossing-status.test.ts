import { describe, expect, it } from 'vitest';
import { computeCrossingColor, describeColor, isActiveConflict } from './crossing-status';
import { DEFAULT_FRESHNESS_WINDOW_MINUTES } from './config';

/**
 * Assertions derived from SOW acceptance criteria. Criterion numbers are quoted in the test
 * names so a reviewer can trace each one back to the contract.
 *
 * Source: SOW M2 "Home Map and Crossing Markers" AC2, M2 "Crossing Detail" edge case,
 * M3 "Report Clear" AC2, M4 "Route Conflict Detection" AC4 / edge cases.
 *
 * Time is injected, never slept on.
 */

const NOW = new Date('2026-08-25T12:00:00.000Z');
const window_ = DEFAULT_FRESHNESS_WINDOW_MINUTES;

const minutesBefore = (n: number) => new Date(NOW.getTime() - n * 60_000);

describe('computeCrossingColor', () => {
  it('M2-AC2: a fresh blocked report shows RED', () => {
    expect(
      computeCrossingColor({
        lastStatus: 'blocked',
        lastReportedAt: minutesBefore(1),
        now: NOW,
        freshnessWindowMinutes: window_,
      }),
    ).toBe('red');
  });

  it('M2-AC2: a blocked report aged past the freshness window shows YELLOW', () => {
    expect(
      computeCrossingColor({
        lastStatus: 'blocked',
        lastReportedAt: minutesBefore(window_ + 1),
        now: NOW,
        freshnessWindowMinutes: window_,
      }),
    ).toBe('yellow');
  });

  it('M2-AC2: a clear report shows GREEN', () => {
    expect(
      computeCrossingColor({
        lastStatus: 'clear',
        lastReportedAt: minutesBefore(1),
        now: NOW,
        freshnessWindowMinutes: window_,
      }),
    ).toBe('green');
  });

  it('M2 Crossing Detail edge case: a crossing with no reports is UNKNOWN, not green', () => {
    const color = computeCrossingColor({
      lastStatus: null,
      lastReportedAt: null,
      now: NOW,
      freshnessWindowMinutes: window_,
    });
    expect(color).toBe('unknown');
    expect(color).not.toBe('green');
  });

  it('M3 Report-Clear AC2: a crossing NEVER returns to green on a timer', () => {
    // A blocked report left to age for a day is yellow, never green. Only a clear report
    // produces green.
    for (const age of [window_ + 1, 60, 60 * 24, 60 * 24 * 30]) {
      expect(
        computeCrossingColor({
          lastStatus: 'blocked',
          lastReportedAt: minutesBefore(age),
          now: NOW,
          freshnessWindowMinutes: window_,
        }),
      ).toBe('yellow');
    }
  });

  it('a clear report stays GREEN however old it is — the app does not guess re-blocking', () => {
    expect(
      computeCrossingColor({
        lastStatus: 'clear',
        lastReportedAt: minutesBefore(60 * 24 * 7),
        now: NOW,
        freshnessWindowMinutes: window_,
      }),
    ).toBe('green');
  });

  it('boundary: at exactly the freshness window the report is no longer fresh', () => {
    // Reported at T, read at T+15m with a 15m window -> not strictly inside -> yellow.
    expect(
      computeCrossingColor({
        lastStatus: 'blocked',
        lastReportedAt: minutesBefore(window_),
        now: NOW,
        freshnessWindowMinutes: window_,
      }),
    ).toBe('yellow');
    // One second inside the window is still red.
    expect(
      computeCrossingColor({
        lastStatus: 'blocked',
        lastReportedAt: new Date(NOW.getTime() - (window_ * 60_000 - 1000)),
        now: NOW,
        freshnessWindowMinutes: window_,
      }),
    ).toBe('red');
  });

  it('roadmap Phase-2 case: blocked at T reads RED at T+14m and YELLOW at T+16m', () => {
    const reportedAt = new Date('2026-08-25T12:00:00.000Z');
    const at = (m: number) => new Date(reportedAt.getTime() + m * 60_000);
    const color = (m: number) =>
      computeCrossingColor({
        lastStatus: 'blocked',
        lastReportedAt: reportedAt,
        now: at(m),
        freshnessWindowMinutes: window_,
      });
    expect(color(14)).toBe('red');
    expect(color(16)).toBe('yellow');
  });

  it('honours a tuned freshness window — the value is configurable, not baked in', () => {
    const reportedAt = minutesBefore(20);
    expect(
      computeCrossingColor({
        lastStatus: 'blocked',
        lastReportedAt: reportedAt,
        now: NOW,
        freshnessWindowMinutes: 15,
      }),
    ).toBe('yellow');
    expect(
      computeCrossingColor({
        lastStatus: 'blocked',
        lastReportedAt: reportedAt,
        now: NOW,
        freshnessWindowMinutes: 30,
      }),
    ).toBe('red');
  });

  it('accepts ISO strings as well as Dates, since the DB returns strings', () => {
    expect(
      computeCrossingColor({
        lastStatus: 'blocked',
        lastReportedAt: minutesBefore(2).toISOString(),
        now: NOW.toISOString(),
        freshnessWindowMinutes: window_,
      }),
    ).toBe('red');
  });
});

describe('isActiveConflict', () => {
  it('M4-AC4: only a FRESH blocked crossing counts as an active conflict', () => {
    expect(isActiveConflict('red')).toBe(true);
  });

  it('M4 edge case: a crossing aged to yellow stops being an active red conflict', () => {
    expect(isActiveConflict('yellow')).toBe(false);
  });

  it('green and unknown are never conflicts', () => {
    expect(isActiveConflict('green')).toBe(false);
    expect(isActiveConflict('unknown')).toBe(false);
  });
});

describe('describeColor', () => {
  it('never describes an unconfirmed crossing as clear', () => {
    expect(describeColor('unknown')).toBe('Unconfirmed');
    expect(describeColor('green')).toBe('Clear');
    expect(describeColor('yellow')).toBe('Blocked, unconfirmed');
    expect(describeColor('red')).toBe('Blocked');
  });
});

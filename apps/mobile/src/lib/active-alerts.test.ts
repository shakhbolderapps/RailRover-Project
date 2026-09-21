import { buildActiveAlerts } from './active-alerts';
import type { RouteConflictRow } from './conflicts';
import type { CrossingRow } from './crossings';

const now = new Date('2026-09-21T12:00:00Z');
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();

const conflict = (overrides: Partial<RouteConflictRow> = {}): RouteConflictRow => ({
  crossing_id: 'c1',
  dot_id: 'DOT1',
  name: 'On Route Crossing',
  road: 'Route Rd',
  latitude: 41.65,
  longitude: -83.6,
  last_reported_at: minutesAgo(3),
  meters_ahead: 3_000,
  ...overrides,
});

const crossing = (overrides: Partial<CrossingRow> = {}): CrossingRow => ({
  id: 'n1',
  dot_id: 'DOT9',
  name: 'Nearby Crossing',
  road: 'Nearby Rd',
  city: 'Toledo',
  state: 'Ohio',
  railroad: null,
  latitude: 41.66,
  longitude: -83.61,
  is_active: true,
  last_status: 'blocked',
  last_reported_at: minutesAgo(5),
  report_count: 1,
  color: 'red',
  ...overrides,
});

describe('buildActiveAlerts', () => {
  it('M4-ActiveAlerts-AC2: on-route crossings come before merely nearby ones', () => {
    // Not cosmetic. A crossing on the route will affect the journey; one two streets away will
    // not, and interleaving them buries the ones that matter.
    const alerts = buildActiveAlerts([conflict()], [crossing()], now);
    expect(alerts.map((a) => a.onRoute)).toEqual([true, false]);
  });

  it('M4-ActiveAlerts-AC2: on-route conflicts are ordered nearest-first', () => {
    const alerts = buildActiveAlerts(
      [
        conflict({ crossing_id: 'far', name: 'Far', meters_ahead: 9_000 }),
        conflict({ crossing_id: 'near', name: 'Near', meters_ahead: 800 }),
      ],
      [],
      now,
    );
    expect(alerts.map((a) => a.name)).toEqual(['Near', 'Far']);
  });

  it('M4-ActiveAlerts-AC1: only RED crossings appear among the nearby ones', () => {
    // Yellow is "blocked but unconfirmed" and green is confirmed clear. Neither is something
    // demanding the driver's attention right now (ADR 0002).
    const alerts = buildActiveAlerts(
      [],
      [
        crossing({ id: 'r', color: 'red' }),
        crossing({ id: 'y', color: 'yellow' }),
        crossing({ id: 'g', color: 'green' }),
        crossing({ id: 'u', color: 'unknown' }),
      ],
      now,
    );
    expect(alerts.map((a) => a.crossingId)).toEqual(['r']);
  });

  it('does not list the same crossing twice when it is both on-route and on the map', () => {
    const alerts = buildActiveAlerts(
      [conflict({ crossing_id: 'shared' })],
      [crossing({ id: 'shared', color: 'red' })],
      now,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.onRoute).toBe(true);
  });

  it('labels how far ahead an on-route conflict is, and how recently it was reported', () => {
    const [alert] = buildActiveAlerts([conflict({ meters_ahead: 4_000 })], [], now);
    expect(alert?.distanceLabel).toBe('2.5 miles ahead');
    expect(alert?.reportedLabel).toBe('3 minutes ago');
  });

  it('says "Just ahead" rather than a misleading 0.0 miles', () => {
    const [alert] = buildActiveAlerts([conflict({ meters_ahead: 80 })], [], now);
    expect(alert?.distanceLabel).toBe('Just ahead');
  });

  it('gives a nearby crossing no distance label, since it is not on the route', () => {
    const [alert] = buildActiveAlerts([], [crossing()], now);
    expect(alert?.distanceLabel).toBeNull();
  });

  it('M4-ActiveAlerts edge case: returns an empty list when nothing is relevant', () => {
    expect(buildActiveAlerts([], [], now)).toEqual([]);
    expect(buildActiveAlerts([], [crossing({ color: 'green' })], now)).toEqual([]);
  });
});

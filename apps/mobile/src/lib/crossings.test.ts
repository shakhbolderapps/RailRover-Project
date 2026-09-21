import type { CrossingStatus } from '@railrover/shared';

import { applyReportedCrossing, toFeatureCollection, type CrossingRow } from './crossings';

const row = (overrides: Partial<CrossingRow> = {}): CrossingRow => ({
  id: 'c1',
  dot_id: '473988W',
  name: 'Central Ave',
  road: 'Central Ave',
  city: 'Toledo',
  state: 'Ohio',
  railroad: 'Norfolk Southern',
  latitude: 41.6528,
  longitude: -83.5379,
  is_active: true,
  last_status: null,
  last_reported_at: null,
  report_count: 0,
  color: 'unknown',
  ...overrides,
});

describe('toFeatureCollection', () => {
  it('emits GeoJSON [longitude, latitude], not [latitude, longitude]', () => {
    // The same axis-order trap that put every crossing in the wrong hemisphere when the ingest
    // wrote EWKT. A swapped pair still typechecks — both are numbers — so it is asserted
    // literally rather than structurally.
    const [feature] = toFeatureCollection([row()]).features;
    expect(feature?.geometry.coordinates).toEqual([-83.5379, 41.6528]);
  });

  it('M2-AC2: carries the computed colour through to the marker properties', () => {
    // The map styles circles by this property, so the four states have to survive the conversion.
    for (const color of ['red', 'yellow', 'green', 'unknown'] as const) {
      const [feature] = toFeatureCollection([row({ color })]).features;
      expect(feature?.properties.color).toBe(color);
    }
  });

  it('falls back through name -> road -> dot_id so a marker is never nameless', () => {
    // The FRA inventory has no single "crossing name" field and plenty of rows have neither a
    // name nor a street, but an alert saying "blocked crossing on null" is worse than the id.
    expect(toFeatureCollection([row({ name: 'Central Ave' })]).features[0]?.properties.name).toBe(
      'Central Ave',
    );
    expect(
      toFeatureCollection([row({ name: null, road: 'Alexis Rd' })]).features[0]?.properties.name,
    ).toBe('Alexis Rd');
    expect(
      toFeatureCollection([row({ name: null, road: null })]).features[0]?.properties.name,
    ).toBe('473988W');
  });

  it('gives each feature the crossing id, so a tapped marker can be resolved back to a row', () => {
    const [feature] = toFeatureCollection([row({ id: 'abc' })]).features;
    expect(feature?.id).toBe('abc');
    expect(feature?.properties.id).toBe('abc');
  });

  it('produces a valid empty collection rather than throwing on no rows', () => {
    expect(toFeatureCollection([])).toEqual({ type: 'FeatureCollection', features: [] });
  });
});

describe('applyReportedCrossing', () => {
  const reported = (overrides: Partial<CrossingStatus> = {}): CrossingStatus =>
    ({
      id: 'c1',
      color: 'red',
      lastStatus: 'blocked',
      lastReportedAt: '2026-09-21T12:00:00.000Z',
      reportCount: 1,
      ...overrides,
    }) as CrossingStatus;

  it('M3-AC4: flips the reported crossing to its new colour without a viewport reload', () => {
    // SOW M3 step 5: "System updates the crossing to red across the app." submit_report returns
    // the recomputed status precisely so this does not have to wait for the next map query.
    const [updated] = applyReportedCrossing([row({ id: 'c1', color: 'unknown' })], reported());
    expect(updated?.color).toBe('red');
    expect(updated?.last_status).toBe('blocked');
    expect(updated?.report_count).toBe(1);
  });

  it('translates the RPC camelCase contract onto the snake_case view rows', () => {
    // The two shapes differ deliberately: camelCase is the client contract
    // (SubmitReportResult), snake_case is the crossing_status view as PostgREST serialises it.
    const [updated] = applyReportedCrossing(
      [row({ id: 'c1' })],
      reported({ lastReportedAt: '2026-09-21T12:34:00.000Z' }),
    );
    expect(updated?.last_reported_at).toBe('2026-09-21T12:34:00.000Z');
  });

  it('leaves other crossings untouched', () => {
    const rows = [row({ id: 'c1', color: 'unknown' }), row({ id: 'c2', color: 'green' })];
    const [first, second] = applyReportedCrossing(rows, reported({ id: 'c2', color: 'red' }));
    expect(first?.color).toBe('unknown');
    expect(second?.color).toBe('red');
  });

  it('does not append a crossing the map is not currently showing', () => {
    // Reporting from a detail sheet after panning away would otherwise draw a marker outside the
    // viewport the rows describe.
    const rows = [row({ id: 'c1' })];
    expect(applyReportedCrossing(rows, reported({ id: 'somewhere-else' }))).toHaveLength(1);
  });

  it('preserves identity fields the report does not change', () => {
    const [updated] = applyReportedCrossing([row({ id: 'c1' })], reported());
    expect(updated?.dot_id).toBe('473988W');
    expect(updated?.latitude).toBe(41.6528);
  });
});

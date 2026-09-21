import { toFeatureCollection, type CrossingRow } from './crossings';

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

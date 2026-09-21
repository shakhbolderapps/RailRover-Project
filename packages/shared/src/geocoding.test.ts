import { describe, expect, it } from 'vitest';

import { formatPlaceLabel, toSuggestions } from './geocoding';

describe('formatPlaceLabel', () => {
  it('M4-AC1: composes a readable one-line destination', () => {
    expect(
      formatPlaceLabel({ name: 'Toledo Zoo', city: 'Toledo', state: 'Ohio' }),
    ).toBe('Toledo Zoo, Toledo, Ohio');
  });

  it('joins a house number onto its street', () => {
    expect(
      formatPlaceLabel({ housenumber: '2700', street: 'Broadway St', city: 'Toledo', state: 'Ohio' }),
    ).toBe('2700 Broadway St, Toledo, Ohio');
  });

  it('drops missing parts rather than leaving gaps or stray commas', () => {
    // Photon's records are uneven: a POI has a name and no street, a house the reverse.
    expect(formatPlaceLabel({ street: 'Central Ave', state: 'Ohio' })).toBe('Central Ave, Ohio');
    expect(formatPlaceLabel({ city: 'Toledo' })).toBe('Toledo');
  });

  it('does not repeat a part, so a place named after its city reads once', () => {
    // "Toledo, Toledo, Ohio" is a real Photon output for a place whose name IS its city.
    expect(formatPlaceLabel({ name: 'Toledo', city: 'Toledo', state: 'Ohio' })).toBe(
      'Toledo, Ohio',
    );
  });

  it('returns an empty string when there is nothing to show', () => {
    expect(formatPlaceLabel({})).toBe('');
    expect(formatPlaceLabel({ name: '   ' })).toBe('');
  });
});

describe('toSuggestions', () => {
  const feature = (overrides: Record<string, unknown> = {}) => ({
    geometry: { coordinates: [-83.5379, 41.6528] as [number, number] },
    properties: { name: 'Central Ave', city: 'Toledo', state: 'Ohio', osm_id: 1, osm_type: 'W' },
    ...overrides,
  });

  it('reads GeoJSON [longitude, latitude] into the right fields', () => {
    // The axis-order trap again: both are numbers, so a swap type-checks and silently sends the
    // driver to the Indian Ocean.
    const [suggestion] = toSuggestions([feature()]);
    expect(suggestion?.latitude).toBe(41.6528);
    expect(suggestion?.longitude).toBe(-83.5379);
  });

  it('skips a result with no coordinates, which cannot be routed to', () => {
    expect(toSuggestions([feature({ geometry: undefined })])).toHaveLength(0);
    expect(toSuggestions([feature({ geometry: { coordinates: [] } })])).toHaveLength(0);
  });

  it('skips a result with nothing to label it, rather than rendering a blank row', () => {
    expect(toSuggestions([feature({ properties: {} })])).toHaveLength(0);
  });

  it('keeps the good results when some in the same response are unusable', () => {
    const results = toSuggestions([feature({ geometry: undefined }), feature(), feature()]);
    expect(results).toHaveLength(2);
  });

  it('gives every suggestion a distinct id for list rendering', () => {
    const results = toSuggestions([
      feature({ properties: { name: 'A', osm_id: 1, osm_type: 'W' } }),
      feature({ properties: { name: 'B', osm_id: 2, osm_type: 'N' } }),
      feature({ properties: { name: 'C' } }),
    ]);
    expect(new Set(results.map((r) => r.id)).size).toBe(results.length);
  });
});

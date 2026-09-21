import { describe, expect, it } from 'vitest';
import { FILTERS, buildWhere, toCrossingRow, type FraRecord } from './fra';
import { PILOT_CENTER } from '@railrover/shared';

/**
 * Assertions from SOW M2 "Crossing Inventory". Criterion numbers appear in the test names.
 *
 * These cover the transformation and filter construction — the parts that run in Node. The
 * database-side guarantees (the at-grade CHECK constraint, upsert idempotency) are asserted in
 * supabase/tests/, since they are properties of the schema rather than of this script.
 */

const TOLEDO_QUERY = {
  latitude: PILOT_CENTER.latitude,
  longitude: PILOT_CENTER.longitude,
  radiusMiles: 50,
};

/** A record that passes every filter, for mutating in individual tests. */
const validRecord: FraRecord = {
  crossingid: '473988W',
  latitude: '41.6528',
  longitude: '-83.5379',
  street: 'CENTRAL AVE',
  cityname: 'TOLEDO',
  statename: 'OHIO',
  railroadname: 'Ann Arbor Railroad',
  crossingposition: 'At Grade',
  crossingtype: 'Public',
  crossingclosed: 'No',
  crossingpurpose: 'Highway',
  revisiondate: '2019-04-23T00:00:00.000',
};

describe('buildWhere', () => {
  it('M2-AC2: scopes the query to a radius around the pilot centre', () => {
    const where = buildWhere(TOLEDO_QUERY);
    // 50 mi = 80467 m. within_circle is used because latitude/longitude are TEXT columns in
    // this dataset and will not compare numerically.
    expect(where).toContain('within_circle(geocoded_lat_long, 41.6528, -83.5379, 80467)');
  });

  it('M2-AC2: the radius is parameterised, not hardcoded', () => {
    // ADR 0008: develop against 50 miles, expand to the contracted 200 before pilot launch.
    expect(buildWhere({ ...TOLEDO_QUERY, radiusMiles: 200 })).toContain('321869');
    expect(buildWhere({ ...TOLEDO_QUERY, radiusMiles: 50 })).toContain('80467');
  });

  it('applies all four filters by default', () => {
    const where = buildWhere(TOLEDO_QUERY);
    for (const filter of FILTERS) expect(where).toContain(filter.soql);
  });

  it('can build a partial filter chain, for the dry-run stage report', () => {
    expect(buildWhere(TOLEDO_QUERY, 0)).not.toContain('crossingposition');
    const oneStage = buildWhere(TOLEDO_QUERY, 1);
    expect(oneStage).toContain("crossingposition='At Grade'");
    expect(oneStage).not.toContain("crossingtype='Public'");
  });
});

describe('filters', () => {
  /**
   * Risk-register item #2. An overpass can never be blocked by a train; if one reaches the
   * inventory it becomes a marker that never turns red and a bridge the route logic will flag.
   */
  it('M2: grade-separated crossings are rejected', () => {
    const atGrade = FILTERS.find((f) => f.key === 'at-grade')!;
    expect(atGrade.test({ crossingposition: 'At Grade' })).toBe(true);
    expect(atGrade.test({ crossingposition: 'RR Under' })).toBe(false);
    expect(atGrade.test({ crossingposition: 'RR Over' })).toBe(false);
    expect(atGrade.test({})).toBe(false); // unknown position is not assumed to be at-grade
  });

  it('M2: private crossings are rejected', () => {
    const publicOnly = FILTERS.find((f) => f.key === 'public')!;
    expect(publicOnly.test({ crossingtype: 'Public' })).toBe(true);
    expect(publicOnly.test({ crossingtype: 'Private' })).toBe(false);
  });

  it('M2: closed crossings are rejected — crossingclosed=Yes means CLOSED', () => {
    // Verified against the live dataset: 9,666 of Ohio's 20,449 records are closed. Reading
    // this field backwards would roughly double the inventory with crossings that cannot block.
    const open = FILTERS.find((f) => f.key === 'open')!;
    expect(open.test({ crossingclosed: 'No' })).toBe(true);
    expect(open.test({ crossingclosed: 'Yes' })).toBe(false);
  });

  it('M2: pedestrian and pathway crossings are rejected', () => {
    const highway = FILTERS.find((f) => f.key === 'highway')!;
    expect(highway.test({ crossingpurpose: 'Highway' })).toBe(true);
    expect(highway.test({ crossingpurpose: 'Pathway,Ped.' })).toBe(false);
  });

  it('every filter documents why it exists', () => {
    // A filter that silently drops 60% of the source data must justify itself in the code.
    for (const filter of FILTERS) expect(filter.reason.length).toBeGreaterThan(40);
  });
});

describe('toCrossingRow', () => {
  it('M2-AC1: maps identifier, name, location, road and city', () => {
    const result = toCrossingRow(validRecord);
    expect('row' in result).toBe(true);
    if (!('row' in result)) return;

    expect(result.row.dot_id).toBe('473988W');
    // EWKT is POINT(longitude latitude) — the opposite order to the FRA record and to how the
    // coordinates read in every other part of this codebase. Asserted literally, because a
    // swapped pair puts every Toledo crossing in the Indian Ocean and still type-checks.
    expect(result.row.geom).toBe('SRID=4326;POINT(-83.5379 41.6528)');
    expect(result.row.road).toBe('Central Ave');
    expect(result.row.city).toBe('Toledo');
    expect(result.row.state).toBe('Ohio');
    expect(result.row.name).toBeTruthy();
  });

  it('M2-AC1: dot_id is the FRA crossing ID — the natural upsert key', () => {
    // Idempotency depends on this: re-running the ingest, or expanding the radius, must update
    // rather than duplicate.
    const result = toCrossingRow(validRecord);
    if (!('row' in result)) throw new Error('expected a row');
    expect(result.row.dot_id).toBe(validRecord.crossingid);
  });

  it('title-cases the shouty FRA source text so alerts read like a sentence', () => {
    const result = toCrossingRow({ ...validRecord, street: 'W ALEXIS RD', cityname: 'SYLVANIA' });
    if (!('row' in result)) throw new Error('expected a row');
    expect(result.row.road).toBe('W Alexis Rd');
    expect(result.row.city).toBe('Sylvania');
  });

  it('keeps directional and route abbreviations capitalised', () => {
    const result = toCrossingRow({ ...validRecord, street: 'US 20 NE' });
    if (!('row' in result)) throw new Error('expected a row');
    expect(result.row.road).toBe('US 20 NE');
  });

  it('falls back to city, then the FRA id, when the road name is missing', () => {
    const noRoad = toCrossingRow({ ...validRecord, street: undefined });
    if (!('row' in noRoad)) throw new Error('expected a row');
    expect(noRoad.row.name).toBe('Toledo');

    const nothing = toCrossingRow({ ...validRecord, street: undefined, cityname: undefined });
    if (!('row' in nothing)) throw new Error('expected a row');
    expect(nothing.row.name).toBe('473988W');
  });

  it("treats the FRA's literal 'None' string as absent, not as a road named None", () => {
    const result = toCrossingRow({ ...validRecord, street: 'None' });
    if (!('row' in result)) throw new Error('expected a row');
    expect(result.row.road).toBeNull();
  });

  it('rejects a record with no coordinates rather than guessing', () => {
    // Roughly half of all FRA records omit coordinates entirely. An unplaceable crossing is
    // worse than an absent one: it cannot be shown, reported on, or checked against a route.
    expect(toCrossingRow({ ...validRecord, latitude: undefined })).toEqual({
      skip: 'missing or non-numeric coordinates',
    });
    expect(toCrossingRow({ ...validRecord, longitude: 'N/A' })).toEqual({
      skip: 'missing or non-numeric coordinates',
    });
  });

  it('rejects null-island and out-of-range coordinates', () => {
    expect(toCrossingRow({ ...validRecord, latitude: '0', longitude: '0' })).toEqual({
      skip: 'null-island coordinates',
    });
    expect(toCrossingRow({ ...validRecord, latitude: '91.5' })).toEqual({
      skip: 'coordinates out of range',
    });
  });

  it('rejects a record with no FRA id — there would be no key to upsert on', () => {
    expect(toCrossingRow({ ...validRecord, crossingid: undefined })).toEqual({
      skip: 'missing crossingid',
    });
  });

  it('always marks the row at-grade, matching the DB CHECK constraint', () => {
    const result = toCrossingRow(validRecord);
    if (!('row' in result)) throw new Error('expected a row');
    expect(result.row.is_at_grade).toBe(true);
    expect(result.row.is_active).toBe(true);
    expect(result.row.source).toBe('FRA');
  });
});

import { describe, expect, it } from 'vitest';
import {
  avoidancePolygon,
  boundingBoxAround,
  fromPosition,
  haversineMeters,
  polylineLengthMeters,
  toPosition,
} from './geo';
import { DEFAULT_REPORT_RADIUS_METERS, PILOT_CENTER } from './config';

const TOLEDO = PILOT_CENTER;

describe('haversineMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineMeters(TOLEDO, TOLEDO)).toBe(0);
  });

  it('matches a known distance — Toledo to Detroit is about 86 km great-circle', () => {
    const detroit = { latitude: 42.3314, longitude: -83.0458 };
    const km = haversineMeters(TOLEDO, detroit) / 1000;
    expect(km).toBeGreaterThan(84);
    expect(km).toBeLessThan(88);
  });

  it('is symmetric', () => {
    const other = { latitude: 41.7, longitude: -83.6 };
    expect(haversineMeters(TOLEDO, other)).toBeCloseTo(haversineMeters(other, TOLEDO), 6);
  });

  /**
   * SOW M3 acceptance criterion 2 / roadmap Phase-2 case: a driver 0.9 mi away may report,
   * a driver 1.1 mi away may not. The authoritative check is server-side in `submit_report`;
   * this asserts the shared distance math those numbers rely on.
   */
  it('M3-AC2: 0.9 mi is inside the report radius and 1.1 mi is outside', () => {
    const north = (miles: number) => ({
      latitude: TOLEDO.latitude + (miles * 1609.344) / 111_320,
      longitude: TOLEDO.longitude,
    });
    expect(haversineMeters(TOLEDO, north(0.9))).toBeLessThan(DEFAULT_REPORT_RADIUS_METERS);
    expect(haversineMeters(TOLEDO, north(1.1))).toBeGreaterThan(DEFAULT_REPORT_RADIUS_METERS);
  });
});

describe('position conversion', () => {
  it('round-trips LatLng through GeoJSON order without swapping', () => {
    expect(fromPosition(toPosition(TOLEDO))).toEqual(TOLEDO);
  });

  it('puts longitude first, as GeoJSON requires', () => {
    const [lng, lat] = toPosition(TOLEDO);
    expect(lng).toBe(TOLEDO.longitude);
    expect(lat).toBe(TOLEDO.latitude);
    expect(lng).toBeLessThan(0); // Ohio is west of the meridian; catches an accidental swap
  });
});

describe('boundingBoxAround', () => {
  it('contains the centre and is wider in longitude than latitude at this latitude', () => {
    const box = boundingBoxAround(TOLEDO, 1000);
    expect(box.minLatitude).toBeLessThan(TOLEDO.latitude);
    expect(box.maxLatitude).toBeGreaterThan(TOLEDO.latitude);
    const latSpan = box.maxLatitude - box.minLatitude;
    const lngSpan = box.maxLongitude - box.minLongitude;
    expect(lngSpan).toBeGreaterThan(latSpan);
  });

  it('is at least as large as the requested radius in every direction', () => {
    const radius = 1609.344;
    const box = boundingBoxAround(TOLEDO, radius);
    const northEdge = haversineMeters(TOLEDO, {
      latitude: box.maxLatitude,
      longitude: TOLEDO.longitude,
    });
    const eastEdge = haversineMeters(TOLEDO, {
      latitude: TOLEDO.latitude,
      longitude: box.maxLongitude,
    });
    expect(northEdge).toBeGreaterThanOrEqual(radius * 0.99);
    expect(eastEdge).toBeGreaterThanOrEqual(radius * 0.99);
  });
});

describe('avoidancePolygon', () => {
  it('returns a closed ring of five positions', () => {
    const ring = avoidancePolygon(TOLEDO, 300);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it('stays far inside ORS limits — 20 km per side and 200 km² of area', () => {
    const ring = avoidancePolygon(TOLEDO, 300);
    const sw = fromPosition(ring[0]!);
    const se = fromPosition(ring[1]!);
    const nw = fromPosition(ring[3]!);
    const widthMeters = haversineMeters(sw, se);
    const heightMeters = haversineMeters(sw, nw);
    expect(widthMeters).toBeGreaterThan(250);
    expect(widthMeters).toBeLessThan(20_000);
    expect(heightMeters).toBeLessThan(20_000);
    expect((widthMeters / 1000) * (heightMeters / 1000)).toBeLessThan(200);
  });

  it('widening the polygon produces a strictly larger ring — the retry-once path', () => {
    const small = avoidancePolygon(TOLEDO, 300);
    const wide = avoidancePolygon(TOLEDO, 600);
    expect(wide[0]![0]).toBeLessThan(small[0]![0]);
    expect(wide[1]![0]).toBeGreaterThan(small[1]![0]);
  });
});

describe('polylineLengthMeters', () => {
  it('is zero for a degenerate line', () => {
    expect(polylineLengthMeters([toPosition(TOLEDO)])).toBe(0);
    expect(polylineLengthMeters([])).toBe(0);
  });

  it('sums segment lengths', () => {
    const a = { latitude: 41.65, longitude: -83.54 };
    const b = { latitude: 41.66, longitude: -83.54 };
    const c = { latitude: 41.67, longitude: -83.54 };
    const total = polylineLengthMeters([toPosition(a), toPosition(b), toPosition(c)]);
    expect(total).toBeCloseTo(haversineMeters(a, b) + haversineMeters(b, c), 6);
  });
});

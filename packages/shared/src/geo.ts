import type { LatLng, Position } from './types';

const EARTH_RADIUS_METERS = 6_371_008.8;

/** Great-circle distance between two points, in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const φ1 = toRadians(a.latitude);
  const φ2 = toRadians(b.latitude);
  const Δφ = φ2 - φ1;
  const Δλ = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** GeoJSON [lng, lat] from a LatLng. Exists so the order is written down in exactly one place. */
export const toPosition = (p: LatLng): Position => [p.longitude, p.latitude];

/** LatLng from a GeoJSON [lng, lat]. */
export const fromPosition = ([longitude, latitude]: Position): LatLng => ({ latitude, longitude });

export interface BoundingBox {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
}

/**
 * Bounding box around a point, padded by a radius in metres. Used as a cheap prefilter before
 * an exact PostGIS distance test, and to build map-viewport queries.
 */
export function boundingBoxAround(center: LatLng, radiusMeters: number): BoundingBox {
  const latDelta = (radiusMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const cosLat = Math.cos(toRadians(center.latitude));
  // Guard against a divide-by-zero at the poles; irrelevant for Ohio but cheap to be correct.
  const lngDelta = latDelta / Math.max(Math.abs(cosLat), 1e-12);

  return {
    minLatitude: center.latitude - latDelta,
    maxLatitude: center.latitude + latDelta,
    minLongitude: center.longitude - lngDelta,
    maxLongitude: center.longitude + lngDelta,
  };
}

/**
 * Square avoidance polygon centred on a point, `sideMeters` on a side, as a GeoJSON ring.
 *
 * Used to build the `avoid_polygons` payload that forces a reroute around a blocked crossing.
 * ORS limits avoid polygons to 200 km² and 20 km on a side; a 300 m square is trivially inside.
 * See decisions/0005-reroute-is-route-avoidance.md
 */
export function avoidancePolygon(center: LatLng, sideMeters: number): Position[] {
  const half = sideMeters / 2;
  const { minLatitude, maxLatitude, minLongitude, maxLongitude } = boundingBoxAround(center, half);
  return [
    [minLongitude, minLatitude],
    [maxLongitude, minLatitude],
    [maxLongitude, maxLatitude],
    [minLongitude, maxLatitude],
    [minLongitude, minLatitude], // closed ring
  ];
}

/** Total length of a polyline in metres. */
export function polylineLengthMeters(coordinates: Position[]): number {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1];
    const curr = coordinates[i];
    if (!prev || !curr) continue;
    total += haversineMeters(fromPosition(prev), fromPosition(curr));
  }
  return total;
}

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

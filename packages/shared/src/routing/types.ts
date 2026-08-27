import type { LatLng, Position } from '../types';

/**
 * The routing adapter boundary.
 *
 * App code NEVER calls OpenRouteService (or Google, or Valhalla) directly — it depends on this
 * interface. Three reasons, all load-bearing:
 *
 *  1. ORS's free tier is 2,000 directions/day and 40/min. Automated tests must never spend that
 *     budget, so tests bind a fixture or local-Valhalla implementation instead.
 *  2. The day the client funds a Google Maps Platform account (the SOW's original stack), the
 *     swap is one file.
 *  3. Rerouting-by-avoidance is a heuristic on top of a routing service, not a built-in
 *     capability. Keeping it behind an interface stops that heuristic leaking into UI code.
 *
 * See decisions/0009-routing-adapter-boundary.md
 */

export interface RouteRequestOptions {
  /** How many alternatives to ask for. ORS caps this at 3. */
  alternatives?: number;
  /** Abort signal, so a reroute computed in the background can be cancelled. */
  signal?: AbortSignal;
}

export interface RawRoute {
  /** Route geometry in GeoJSON order. */
  coordinates: Position[];
  durationSeconds: number;
  distanceMeters: number;
}

export type RoutingErrorCode =
  | 'destination_not_found'
  | 'no_route_available'
  | 'route_too_long_for_alternatives'
  | 'route_too_long_for_avoidance'
  | 'quota_exceeded_daily'
  | 'quota_exceeded_rate'
  | 'network_error'
  | 'cancelled';

export class RoutingError extends Error {
  constructor(
    readonly code: RoutingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

export interface RoutingAdapter {
  readonly name: string;

  /**
   * Route options from origin to destination. SOW M4 requires the driver be offered options to
   * compare by crossing count, so this returns several where the provider supports it.
   */
  getRoutes(origin: LatLng, destination: LatLng, options?: RouteRequestOptions): Promise<RawRoute[]>;

  /**
   * A route that avoids a polygon — the reroute primitive. `avoidPolygon` is a closed GeoJSON
   * ring, built by `avoidancePolygon()` around the blocked crossing.
   *
   * MVP avoids ONE crossing, not several (SOW M4 acceptance criterion 3).
   */
  getRouteAvoiding(
    origin: LatLng,
    destination: LatLng,
    avoidPolygon: Position[],
    options?: RouteRequestOptions,
  ): Promise<RawRoute | null>;
}

import type { LatLng, Position } from '../types';
import { RoutingError, type RawRoute, type RoutingAdapter, type RouteRequestOptions } from './types';

/**
 * Deterministic routing for tests and offline development.
 *
 * Bound in place of the ORS adapter in every automated test, so the suite never spends the
 * 2,000/day free quota and never depends on the network. Once Docker is available this can be
 * joined by a local Valhalla/OSRM adapter behind the same interface; neither the app nor the
 * tests change. See decisions/0007-no-docker-local-supabase-substitute.md
 */
export class FixtureRoutingAdapter implements RoutingAdapter {
  readonly name = 'fixture';

  /** Requests recorded for assertions — e.g. "the reroute actually passed an avoid polygon". */
  readonly calls: Array<{ kind: 'routes' | 'avoid'; avoidPolygon?: Position[] }> = [];

  constructor(
    private readonly fixtures: {
      routes?: RawRoute[];
      /** Route returned by getRouteAvoiding. `null` models "no better alternate exists". */
      avoidingRoute?: RawRoute | null;
      error?: RoutingError;
    } = {},
  ) {}

  async getRoutes(
    _origin: LatLng,
    _destination: LatLng,
    _options?: RouteRequestOptions,
  ): Promise<RawRoute[]> {
    this.calls.push({ kind: 'routes' });
    if (this.fixtures.error) throw this.fixtures.error;
    if (!this.fixtures.routes || this.fixtures.routes.length === 0) {
      throw new RoutingError('no_route_available', 'A route could not be generated.');
    }
    return this.fixtures.routes;
  }

  async getRouteAvoiding(
    _origin: LatLng,
    _destination: LatLng,
    avoidPolygon: Position[],
    _options?: RouteRequestOptions,
  ): Promise<RawRoute | null> {
    this.calls.push({ kind: 'avoid', avoidPolygon });
    if (this.fixtures.error) throw this.fixtures.error;
    return this.fixtures.avoidingRoute ?? null;
  }
}

import type { LatLng, Position } from '../types';
import {
  RoutingError,
  type RawRoute,
  type RoutingAdapter,
  type RouteRequestOptions,
} from './types';

const ORS_BASE = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

/**
 * ORS limits, from their docs. Exceeding them returns an error we must surface honestly rather
 * than leaving a spinner running (SOW M4 requires "no route is available" be handled gracefully).
 */
const MAX_KM_WITH_ALTERNATIVES = 100;
const MAX_KM_WITH_AVOIDANCE = 150;

/** Production routing. Free tier: 2,000 requests/day, 40/min. */
export class OpenRouteServiceAdapter implements RoutingAdapter {
  readonly name = 'openrouteservice';

  /** Most recent value of the ORS rate-limit header, for quota monitoring. */
  remainingQuota: number | null = null;

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('OpenRouteServiceAdapter requires an API key.');
  }

  async getRoutes(
    origin: LatLng,
    destination: LatLng,
    options: RouteRequestOptions = {},
  ): Promise<RawRoute[]> {
    const alternatives = Math.min(options.alternatives ?? 3, 3);
    const body: Record<string, unknown> = {
      coordinates: [
        [origin.longitude, origin.latitude],
        [destination.longitude, destination.latitude],
      ],
      instructions: false,
    };
    if (alternatives > 1) {
      body.alternative_routes = { target_count: alternatives, share_factor: 0.6 };
    }

    const features = await this.post(body, options.signal, MAX_KM_WITH_ALTERNATIVES);
    return features;
  }

  async getRouteAvoiding(
    origin: LatLng,
    destination: LatLng,
    avoidPolygon: Position[],
    options: RouteRequestOptions = {},
  ): Promise<RawRoute | null> {
    const body = {
      coordinates: [
        [origin.longitude, origin.latitude],
        [destination.longitude, destination.latitude],
      ],
      instructions: false,
      options: {
        avoid_polygons: { type: 'Polygon', coordinates: [avoidPolygon] },
      },
    };

    try {
      const routes = await this.post(body, options.signal, MAX_KM_WITH_AVOIDANCE);
      return routes[0] ?? null;
    } catch (error) {
      // "No alternate exists" is a legitimate outcome the caller must handle by keeping the
      // current route and saying so plainly — not an exception to bubble up.
      if (error instanceof RoutingError && error.code === 'no_route_available') return null;
      throw error;
    }
  }

  private async post(
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
    maxKm: number,
  ): Promise<RawRoute[]> {
    let response: Response;
    try {
      response = await fetch(ORS_BASE, {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/geo+json',
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw new RoutingError('cancelled', 'Route request was cancelled.');
      throw new RoutingError('network_error', `Could not reach the routing service: ${error}`);
    }

    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining !== null) this.remainingQuota = Number(remaining);

    if (response.status === 403) {
      throw new RoutingError(
        'quota_exceeded_daily',
        'Daily routing quota exhausted. Route options are temporarily unavailable.',
      );
    }
    if (response.status === 429) {
      throw new RoutingError(
        'quota_exceeded_rate',
        'Routing service is rate-limiting requests. Retrying shortly.',
      );
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (/exceeds maximum|distance/i.test(text)) {
        throw new RoutingError(
          maxKm === MAX_KM_WITH_AVOIDANCE
            ? 'route_too_long_for_avoidance'
            : 'route_too_long_for_alternatives',
          `Route is longer than the ${maxKm} km limit for this request type.`,
        );
      }
      throw new RoutingError('no_route_available', 'A route could not be generated.');
    }

    const json = (await response.json()) as {
      features?: Array<{
        geometry: { coordinates: Position[] };
        properties: { summary?: { duration?: number; distance?: number } };
      }>;
    };

    const features = json.features ?? [];
    if (features.length === 0) {
      throw new RoutingError('no_route_available', 'A route could not be generated.');
    }

    return features.map((feature) => ({
      coordinates: feature.geometry.coordinates,
      durationSeconds: feature.properties.summary?.duration ?? 0,
      distanceMeters: feature.properties.summary?.distance ?? 0,
    }));
  }
}

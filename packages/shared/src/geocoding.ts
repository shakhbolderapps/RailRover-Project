import type { LatLng } from './types';

/**
 * Destination search (SOW M4 "Destination Search and Route Options").
 *
 * Photon only — deliberately NOT Photon-for-typeahead plus Nominatim-to-resolve as the roadmap
 * originally sketched. Photon returns coordinates in the feature geometry, so the second call
 * would buy nothing, and Nominatim's usage policy (1 request/second, hard IP blocks for
 * offenders) is a live risk-register item. Removing it removes the risk rather than managing it.
 *
 * Photon is keyless and built from the same OpenStreetMap data as the map tiles, so a searched
 * destination and the basemap agree with each other.
 */

const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';

/** Identifies us to the public instance. Being anonymous to a free service is how you get blocked. */
const USER_AGENT = 'RailRover/0.1 (railroad crossing alerts; contact: bolderapps.com)';

export interface PlaceSuggestion {
  /** Stable within a result set; used as a list key, not persisted. */
  id: string;
  /** What the driver reads, e.g. "Central Ave, Toledo, Ohio". */
  label: string;
  latitude: number;
  longitude: number;
}

/** The subset of Photon's feature properties this app uses. */
export interface PhotonProperties {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  osm_id?: number;
  osm_type?: string;
}

/**
 * Compose a one-line label from Photon's parts.
 *
 * Photon returns wildly uneven records — a named POI has `name` and no `street`, a house has
 * `street` and `housenumber` and no `name`, some rural results have only a city. Joining whatever
 * is present, in order, and dropping blanks beats any fixed template. Duplicates are removed
 * because "Toledo, Toledo, Ohio" is a real output otherwise (a place whose name IS its city).
 */
export function formatPlaceLabel(properties: PhotonProperties): string {
  const street = [properties.housenumber, properties.street].filter(Boolean).join(' ');
  const parts = [properties.name, street, properties.city, properties.state].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0,
  );

  const seen = new Set<string>();
  const unique = parts.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.join(', ');
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: PhotonProperties;
}

/**
 * Turn a Photon response into suggestions, dropping anything unusable.
 *
 * A feature with no coordinates cannot be routed to, and one with no label is a blank row the
 * driver cannot evaluate — both are silently skipped rather than rendered as empty list items.
 */
export function toSuggestions(features: PhotonFeature[]): PlaceSuggestion[] {
  const suggestions: PlaceSuggestion[] = [];

  features.forEach((feature, index) => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) return;

    // GeoJSON order: [longitude, latitude].
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const properties = feature.properties ?? {};
    const label = formatPlaceLabel(properties);
    if (label.length === 0) return;

    suggestions.push({
      id: properties.osm_id ? `${properties.osm_type ?? 'x'}${properties.osm_id}` : `i${index}`,
      label,
      latitude,
      longitude,
    });
  });

  return suggestions;
}

export interface SuggestOptions {
  /** Biases results toward the driver, so "Main St" means the one they are near. */
  near?: LatLng;
  limit?: number;
  signal?: AbortSignal;
}

/**
 * Destination suggestions for a partial query.
 *
 * Callers debounce; this does not. A keystroke-per-request typeahead against a free public
 * instance is exactly the behaviour that gets an app blocked.
 */
export async function suggestPlaces(
  query: string,
  options: SuggestOptions = {},
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const url = new URL(PHOTON_ENDPOINT);
  url.searchParams.set('q', trimmed);
  url.searchParams.set('limit', String(options.limit ?? 5));
  if (options.near) {
    url.searchParams.set('lat', String(options.near.latitude));
    url.searchParams.set('lon', String(options.near.longitude));
  }

  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': USER_AGENT },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) throw new Error(`Place search failed (${response.status})`);

  const body = (await response.json()) as { features?: PhotonFeature[] };
  return toSuggestions(body.features ?? []);
}

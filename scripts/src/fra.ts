/**
 * FRA Crossing Inventory (Form 71) source adapter.
 *
 * Dataset `m2f8-22s6` on data.transportation.gov — public domain, Socrata-backed.
 * Docs: https://data.transportation.gov/resource/m2f8-22s6
 *
 * Two facts about this dataset drive everything below, both verified against the live API:
 *
 *  1. `latitude` / `longitude` are TEXT columns, so numeric SoQL comparison on them fails. The
 *     dataset also exposes a real point column, `geocoded_lat_long`, which supports
 *     `within_circle()` — that is what we filter on.
 *
 *  2. **Most of the raw inventory is unusable for this product.** Measured around Toledo:
 *
 *     |                          | 50-mi radius | 200-mi radius |
 *     |--------------------------|-------------:|--------------:|
 *     | raw records in radius    |        3,925 |        34,602 |
 *     | after all four filters   |    **1,696** |    **13,096** |
 *
 *     57–62% is dropped. Skipping the filters would fill the map with markers that can never
 *     turn red and would let the route-conflict logic flag bridges.
 */

export const FRA_DATASET = 'm2f8-22s6';
export const FRA_ENDPOINT = `https://data.transportation.gov/resource/${FRA_DATASET}.json`;

/** Raw Socrata record. Only the fields we consume are typed; the dataset has 79 columns. */
export interface FraRecord {
  crossingid?: string | undefined;
  latitude?: string | undefined;
  longitude?: string | undefined;
  street?: string | undefined;
  cityname?: string | undefined;
  statename?: string | undefined;
  countyname?: string | undefined;
  railroadname?: string | undefined;
  /** 'At Grade' | 'RR Under' | 'RR Over' */
  crossingposition?: string | undefined;
  /** 'Public' | 'Private' */
  crossingtype?: string | undefined;
  /** 'Yes' | 'No' — Yes means the crossing is CLOSED. */
  crossingclosed?: string | undefined;
  /** 'Highway' | 'Pathway,Ped.' | ... */
  crossingpurpose?: string | undefined;
  revisiondate?: string | undefined;
  reportstatus?: string | undefined;
}

/**
 * The four filters, each with the reason it exists. Order matters only for the dry-run report,
 * which shows how many records each stage removes.
 */
export const FILTERS = [
  {
    key: 'at-grade',
    soql: "crossingposition='At Grade'",
    reason:
      'An overpass or underpass can never be blocked by a train. Including grade-separated ' +
      'crossings would fill the map with markers that never turn red and make the route-conflict ' +
      'logic flag bridges. Risk-register item #2.',
    test: (r: FraRecord) => r.crossingposition === 'At Grade',
  },
  {
    key: 'public',
    soql: "crossingtype='Public'",
    reason:
      'Private crossings sit on private land — a driver on a public route will not encounter ' +
      'them, and cannot legally be routed over them.',
    test: (r: FraRecord) => r.crossingtype === 'Public',
  },
  {
    key: 'open',
    soql: "crossingclosed='No'",
    reason:
      'Nearly half the raw inventory is closed crossings retained for historical record. ' +
      'A closed crossing cannot block anyone.',
    test: (r: FraRecord) => r.crossingclosed === 'No',
  },
  {
    key: 'highway',
    soql: "crossingpurpose='Highway'",
    reason:
      'Pedestrian and pathway crossings are not on a driving route. Small in count, but they ' +
      'would be noise on a driver-facing map.',
    test: (r: FraRecord) => r.crossingpurpose === 'Highway',
  },
] as const;

export interface IngestQuery {
  latitude: number;
  longitude: number;
  radiusMiles: number;
}

/** SoQL `$where` clause for a radius query with all filters applied. */
export function buildWhere(query: IngestQuery, throughStage: number = FILTERS.length): string {
  const meters = Math.round(query.radiusMiles * 1609.344);
  const clauses = [
    `within_circle(geocoded_lat_long, ${query.latitude}, ${query.longitude}, ${meters})`,
    ...FILTERS.slice(0, throughStage).map((f) => f.soql),
  ];
  return clauses.join(' AND ');
}

export interface CrossingRow {
  dot_id: string;
  name: string | null;
  road: string | null;
  city: string | null;
  state: string | null;
  railroad: string | null;
  latitude: number;
  longitude: number;
  is_active: boolean;
  is_at_grade: boolean;
  source: string;
  source_updated_at: string | null;
}

/**
 * Map a raw FRA record to a crossings row, or return null with a reason if it is unusable.
 *
 * Rejects rather than guesses. A crossing with no coordinates cannot be placed on a map, and a
 * crossing with no FRA ID has no natural key to upsert on — silently inventing either would
 * produce duplicate or unplaceable markers later.
 */
export function toCrossingRow(record: FraRecord): { row: CrossingRow } | { skip: string } {
  const dotId = record.crossingid?.trim();
  if (!dotId) return { skip: 'missing crossingid' };

  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { skip: 'missing or non-numeric coordinates' };
  }
  if (latitude === 0 && longitude === 0) return { skip: 'null-island coordinates' };
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { skip: 'coordinates out of range' };
  }

  const road = clean(record.street);
  const city = clean(record.cityname);

  return {
    row: {
      dot_id: dotId,
      // The FRA has no single "crossing name" field. The road is what a driver actually reads on
      // an alert ("blocked crossing on Central Ave"), so it becomes the name when present.
      name: road ?? city ?? dotId,
      road,
      city,
      state: clean(record.statename),
      railroad: clean(record.railroadname),
      latitude,
      longitude,
      is_active: true,
      is_at_grade: true, // guaranteed by the at-grade filter; the DB CHECK enforces it too
      source: 'FRA',
      source_updated_at: record.revisiondate ?? null,
    },
  };
}

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') return null;
  // The FRA stores names in caps; title-case them so alerts read like a sentence.
  return trimmed
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Us|Sr|Cr|Ne|Nw|Se|Sw|Rr)\b/g, (m) => m.toUpperCase());
};

/** Fetch all matching records, paging through Socrata's row limit. */
export async function* fetchAll(
  where: string,
  pageSize = 1000,
  appToken?: string,
): AsyncGenerator<FraRecord[]> {
  let offset = 0;
  for (;;) {
    const url =
      `${FRA_ENDPOINT}?$where=${encodeURIComponent(where)}` +
      `&$limit=${pageSize}&$offset=${offset}&$order=crossingid`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Socrata throttles anonymous callers harder than token-holding ones. A token is free
        // and optional; without one this still works, just more slowly at large radii.
        ...(appToken ? { 'X-App-Token': appToken } : {}),
        'User-Agent': 'RailRover/0.1 (crossing inventory ingest; bolderapps.com)',
      },
    });

    if (!response.ok) {
      throw new Error(
        `FRA API returned ${response.status} ${response.statusText}\n` +
          `  ${await response.text().catch(() => '')}`,
      );
    }

    const page = (await response.json()) as FraRecord[];
    if (page.length === 0) return;
    yield page;
    if (page.length < pageSize) return;
    offset += pageSize;
  }
}

/** Count matching records without downloading them. Used by the dry-run stage report. */
export async function count(where: string, appToken?: string): Promise<number> {
  const url = `${FRA_ENDPOINT}?$select=count(*)&$where=${encodeURIComponent(where)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(appToken ? { 'X-App-Token': appToken } : {}),
      'User-Agent': 'RailRover/0.1 (crossing inventory ingest; bolderapps.com)',
    },
  });
  if (!response.ok) throw new Error(`FRA count failed: ${response.status}`);
  const json = (await response.json()) as Array<{ count: string }>;
  return Number(json[0]?.count ?? 0);
}

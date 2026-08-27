/**
 * Tunable operational parameters.
 *
 * The SOW is explicit that these three values "ship at these defaults and are tuned during the
 * pilot". At runtime they are read from the `app_config` table — NEVER from these constants.
 * The values here are the seed defaults and the single place the unit conversions are written
 * down, so no other file has to know that 200 feet is 60.96 metres.
 *
 * See decisions/0003-corridor-width-is-not-alert-distance.md
 */

export const FEET_PER_METER = 3.280839895;
export const METERS_PER_MILE = 1609.344;

/** Convert feet to metres. Storage and all geo math is metric; feet are display-only. */
export const feetToMeters = (feet: number): number => feet / FEET_PER_METER;
/** Convert metres to feet, for display only. */
export const metersToFeet = (meters: number): number => meters * FEET_PER_METER;
/** Convert miles to metres. */
export const milesToMeters = (miles: number): number => miles * METERS_PER_MILE;
/** Convert metres to miles, for display only. */
export const metersToMiles = (meters: number): number => meters / METERS_PER_MILE;

/**
 * How long a blocked report stays "fresh" (red). Past this, the crossing goes YELLOW —
 * blocked but unconfirmed. It never goes green on a timer.
 * SOW §7: "a configurable freshness window on blocked reports (starting at 15 minutes)".
 */
export const DEFAULT_FRESHNESS_WINDOW_MINUTES = 15;

/**
 * WIDTH of the corridor around the route line that decides whether a crossing counts as being
 * ON the route.
 *
 * This is NOT a distance-to-alert threshold. A fresh blocked crossing is flagged however far
 * ahead of the driver it sits. The SOW states this twice because it is the obvious misreading.
 *
 * SOW §7: "point-to-route-line distance within a configurable corridor that decides whether a
 * crossing is on the route (starting at 200 feet)".
 */
export const DEFAULT_ROUTE_CORRIDOR_FEET = 200;
export const DEFAULT_ROUTE_CORRIDOR_METERS = feetToMeters(DEFAULT_ROUTE_CORRIDOR_FEET); // ≈60.96

/**
 * How close a driver must be to a crossing to be allowed to report it — they must be able to
 * actually see it. Enforced SERVER-SIDE in `submit_report`; a client check is decoration.
 * SOW M3: "Reporting is limited to crossings within about a mile of the driver, a configurable
 * distance."
 */
export const DEFAULT_REPORT_RADIUS_MILES = 1;
export const DEFAULT_REPORT_RADIUS_METERS = milesToMeters(DEFAULT_REPORT_RADIUS_MILES); // 1609.344

/** Per-device report rate limit, to deter spam (SOW M3 acceptance criterion 5). */
export const DEFAULT_RATE_LIMIT_MAX_REPORTS = 10;
export const DEFAULT_RATE_LIMIT_WINDOW_MINUTES = 5;

/** Pilot coverage centre — Toledo, Ohio (SOW §8). */
export const PILOT_CENTER = { latitude: 41.6528, longitude: -83.5379 } as const;

/**
 * SOW §8 scopes the pilot to ~200 miles around Toledo. That reaches Detroit, Cleveland,
 * Columbus and Indianapolis — tens of thousands of crossings. The ingest script is
 * parameterised and defaults to 50 miles for fast test cycles; expand before pilot launch.
 * See decisions/0008-pilot-radius-staged-ingest.md
 */
export const PILOT_RADIUS_MILES_TARGET = 200;
export const PILOT_RADIUS_MILES_DEV = 50;

/** Keys in the `app_config` table. Runtime values come from there, not from this module. */
export const APP_CONFIG_KEYS = {
  freshnessWindowMinutes: 'freshness_window_minutes',
  routeCorridorMeters: 'route_corridor_meters',
  reportRadiusMeters: 'report_radius_meters',
  rateLimitMaxReports: 'rate_limit_max_reports',
  rateLimitWindowMinutes: 'rate_limit_window_minutes',
} as const;

export type AppConfigKey = (typeof APP_CONFIG_KEYS)[keyof typeof APP_CONFIG_KEYS];

/** Shape of the runtime config, once loaded from `app_config`. */
export interface AppConfig {
  freshnessWindowMinutes: number;
  routeCorridorMeters: number;
  reportRadiusMeters: number;
  rateLimitMaxReports: number;
  rateLimitWindowMinutes: number;
}

/** Defaults, used to seed `app_config` and as a fallback if the table read fails. */
export const DEFAULT_APP_CONFIG: AppConfig = {
  freshnessWindowMinutes: DEFAULT_FRESHNESS_WINDOW_MINUTES,
  routeCorridorMeters: DEFAULT_ROUTE_CORRIDOR_METERS,
  reportRadiusMeters: DEFAULT_REPORT_RADIUS_METERS,
  rateLimitMaxReports: DEFAULT_RATE_LIMIT_MAX_REPORTS,
  rateLimitWindowMinutes: DEFAULT_RATE_LIMIT_WINDOW_MINUTES,
};

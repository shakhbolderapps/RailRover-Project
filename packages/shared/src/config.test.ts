import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_CONFIG,
  DEFAULT_REPORT_RADIUS_METERS,
  DEFAULT_ROUTE_CORRIDOR_FEET,
  DEFAULT_ROUTE_CORRIDOR_METERS,
  feetToMeters,
  metersToFeet,
  metersToMiles,
  milesToMeters,
} from './config';

/**
 * The corridor-width unit conversion has its own test because misreading it is item #1 on the
 * roadmap's risk register: "Misreading 200 ft as alert distance -> alerts fire far too late;
 * core value lost."
 *
 * See decisions/0003-corridor-width-is-not-alert-distance.md
 */
describe('operational defaults', () => {
  it('SOW §7: the route corridor default is 200 feet, stored as ~60.96 metres', () => {
    expect(DEFAULT_ROUTE_CORRIDOR_FEET).toBe(200);
    expect(DEFAULT_ROUTE_CORRIDOR_METERS).toBeCloseTo(60.96, 2);
  });

  it('SOW M3: the report radius default is one mile, stored as 1609.344 metres', () => {
    expect(DEFAULT_REPORT_RADIUS_METERS).toBeCloseTo(1609.344, 3);
  });

  it('SOW §7: the freshness window default is 15 minutes', () => {
    expect(DEFAULT_APP_CONFIG.freshnessWindowMinutes).toBe(15);
  });

  it('unit conversions round-trip', () => {
    expect(metersToFeet(feetToMeters(200))).toBeCloseTo(200, 9);
    expect(metersToMiles(milesToMeters(1))).toBeCloseTo(1, 9);
  });

  it('the corridor is two orders of magnitude smaller than the report radius', () => {
    // A sanity guard: if someone ever swaps these two values, this fails loudly. The corridor
    // decides "is this crossing on my route"; the radius decides "am I close enough to report".
    expect(DEFAULT_REPORT_RADIUS_METERS / DEFAULT_ROUTE_CORRIDOR_METERS).toBeGreaterThan(20);
  });
});

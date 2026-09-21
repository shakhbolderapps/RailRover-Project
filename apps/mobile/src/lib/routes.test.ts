import { RoutingError } from '@railrover/shared';

import { describeRoutingError } from './routes';

describe('describeRoutingError', () => {
  it('M4-AC4: explains a destination that could not be found', () => {
    expect(
      describeRoutingError(new RoutingError('destination_not_found', 'raw upstream text')),
    ).toContain('refining the search');
  });

  it('M4-AC4: explains a route that could not be generated', () => {
    expect(describeRoutingError(new RoutingError('no_route_available', 'raw'))).toContain(
      'No driving route',
    );
  });

  it('tells the driver reporting still works when the daily routing quota is gone', () => {
    // The free tier is 2,000 routes/day (risk register). Losing routing mid-pilot must not read
    // as the whole app being broken — the crowd-sourced half is unaffected.
    const message = describeRoutingError(new RoutingError('quota_exceeded_daily', 'raw'));
    expect(message).toContain('Reporting still works');
  });

  it('distinguishes the per-minute limit, which is worth retrying, from the daily one', () => {
    expect(describeRoutingError(new RoutingError('quota_exceeded_rate', 'raw'))).toContain(
      'Wait a moment',
    );
  });

  it('never surfaces a raw upstream error string to a driver', () => {
    // Upstream messages are diagnostics. The one exception is network_error, which this module
    // constructs itself with copy already written for a person.
    for (const code of [
      'destination_not_found',
      'no_route_available',
      'quota_exceeded_daily',
      'quota_exceeded_rate',
    ] as const) {
      expect(describeRoutingError(new RoutingError(code, 'ORS 5xx gibberish'))).not.toContain(
        'gibberish',
      );
    }
  });

  it('falls back to actionable copy for a non-routing error', () => {
    expect(describeRoutingError(new Error('socket hang up'))).toContain('Check your connection');
    expect(describeRoutingError(undefined)).toContain('Check your connection');
  });
});

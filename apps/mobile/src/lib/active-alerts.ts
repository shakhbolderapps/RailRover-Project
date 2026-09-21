import { formatRelativeTime, metersToMiles } from '@railrover/shared';

import type { RouteConflictRow } from '@/lib/conflicts';
import type { CrossingRow } from '@/lib/crossings';

/**
 * The Active Alerts list (SOW M4 "Active Alerts").
 *
 * Two sources, deliberately kept apart until here: conflicts on the active route come from
 * `conflicts_ahead` and already carry a distance along the route, while nearby blocked crossings
 * come from whatever the map has loaded. Merging them is a display concern, so it lives in a pure
 * function that can be tested without a map, a route, or a network.
 */

export interface ActiveAlert {
  crossingId: string;
  name: string;
  /** "2.4 miles ahead" for an on-route conflict; null for one that is merely nearby. */
  distanceLabel: string | null;
  reportedLabel: string | null;
  onRoute: boolean;
}

/**
 * Build the list: on-route conflicts first, ordered by how far ahead they are, then other fresh
 * blocked crossings nearby.
 *
 * AC2's ordering is not cosmetic. A crossing on the driver's route will affect their journey; one
 * two streets away will not, and showing them interleaved would bury the ones that matter.
 */
export function buildActiveAlerts(
  conflicts: RouteConflictRow[],
  nearbyCrossings: CrossingRow[],
  now: Date = new Date(),
): ActiveAlert[] {
  const onRoute: ActiveAlert[] = [...conflicts]
    .sort((a, b) => a.meters_ahead - b.meters_ahead)
    .map((conflict) => ({
      crossingId: conflict.crossing_id,
      name: conflict.name ?? conflict.road ?? conflict.dot_id,
      distanceLabel:
        metersToMiles(conflict.meters_ahead) < 0.1
          ? 'Just ahead'
          : `${metersToMiles(conflict.meters_ahead).toFixed(1)} miles ahead`,
      reportedLabel: formatRelativeTime(conflict.last_reported_at, now),
      onRoute: true,
    }));

  const onRouteIds = new Set(onRoute.map((alert) => alert.crossingId));

  // Only RED. Yellow is "blocked but unconfirmed" and belongs on the map, not in a list of things
  // demanding the driver's attention right now (ADR 0002).
  const nearby: ActiveAlert[] = nearbyCrossings
    .filter((crossing) => crossing.color === 'red' && !onRouteIds.has(crossing.id))
    .map((crossing) => ({
      crossingId: crossing.id,
      name: crossing.name ?? crossing.road ?? crossing.dot_id,
      distanceLabel: null,
      reportedLabel: formatRelativeTime(crossing.last_reported_at, now),
      onRoute: false,
    }));

  return [...onRoute, ...nearby];
}

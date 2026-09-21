import type { LatLng, Position } from '@railrover/shared';

import type { RouteConflictRow } from '@/lib/conflicts';
import type { ConflictSource } from '@/stores/conflicts';

/**
 * The route simulator.
 *
 * SOW M4's conflict logic is the one module that cannot be checked by looking at it, and the only
 * honest alternative to this is driving around Ohio while a colleague submits reports by phone.
 * The roadmap calls this tool worth more than every other test in the project, for that reason.
 *
 * It models a trip the way the product sees one: a driver advancing along a route line, a set of
 * crossings with positions along that line, and reports arriving at scripted moments. The
 * behaviours it makes testable — the alert fires once rather than on a loop, a report injected
 * mid-trip is noticed, a crossing behind the driver stops mattering, a clear report ends the
 * alert — are exactly the ones that are invisible in a single-shot query test.
 *
 * Distances are along the route, which is what `conflicts_ahead` returns and what the alert shows.
 * The simulator applies the same three filters as the SQL, deliberately: pgTAP already proves the
 * SQL implements them correctly, so re-testing that here would be duplication. What this proves is
 * that the STORE reacts correctly as those answers change over time.
 */

export interface SimulatedCrossing {
  id: string;
  name: string;
  /** Distance from the route's start, in metres. */
  metersAlongRoute: number;
  /** Perpendicular distance from the route line. Beyond the corridor it is never a conflict. */
  metersOffRoute?: number;
  /** When a blocked report exists, as a step index. Undefined means never blocked. */
  blockedAtStep?: number;
  /** When it is reported clear, as a step index. */
  clearedAtStep?: number;
}

export interface SimulatorOptions {
  crossings: SimulatedCrossing[];
  /** Matches app_config's route_corridor_meters. */
  corridorMeters?: number;
  /** How far the driver advances per step, in metres. */
  metersPerStep?: number;
}

export class RouteSimulator {
  private step = 0;
  private driverMeters = 0;
  private listeners: (() => void)[] = [];

  constructor(private readonly options: SimulatorOptions) {}

  private get corridor(): number {
    return this.options.corridorMeters ?? 60.96;
  }

  /** Conflicts as the database would report them at the current moment. */
  private currentConflicts(): RouteConflictRow[] {
    return this.options.crossings
      .filter((crossing) => {
        // Filter 1: inside the corridor.
        if ((crossing.metersOffRoute ?? 0) > this.corridor) return false;
        // Filter 2: ahead of the driver.
        if (crossing.metersAlongRoute <= this.driverMeters) return false;
        // Filter 3: a blocked report that has not been superseded by a clear one.
        if (crossing.blockedAtStep === undefined || this.step < crossing.blockedAtStep) return false;
        if (crossing.clearedAtStep !== undefined && this.step >= crossing.clearedAtStep) return false;
        return true;
      })
      .map((crossing) => ({
        crossing_id: crossing.id,
        dot_id: crossing.id,
        name: crossing.name,
        road: crossing.name,
        latitude: 41.65,
        longitude: -83.6,
        last_reported_at: new Date().toISOString(),
        meters_ahead: crossing.metersAlongRoute - this.driverMeters,
      }))
      .sort((a, b) => a.meters_ahead - b.meters_ahead);
  }

  /** Bind this into the conflict store in place of Supabase. */
  asConflictSource(): ConflictSource {
    return {
      fetch: async () => this.currentConflicts(),
      subscribeToReports: (onChange) => {
        this.listeners.push(onChange);
        return () => {
          this.listeners = this.listeners.filter((listener) => listener !== onChange);
        };
      },
    };
  }

  /** Advance the trip one step and return the driver's new position. */
  advance(): LatLng {
    this.step += 1;
    this.driverMeters += this.options.metersPerStep ?? 200;
    return this.driverPosition();
  }

  /**
   * Fire the report changefeed, as Supabase Realtime would.
   *
   * Separate from `advance()` on purpose: a report arriving while the driver is stationary is the
   * mid-trip case M4-AC5 is about, and conflating the two would hide it.
   */
  injectReport(): void {
    for (const listener of this.listeners) listener();
  }

  /**
   * The driver's position, projected onto a due-east line at latitude 41.65.
   *
   * Real coordinates rather than an abstract offset, so the store's genuine haversine-based
   * movement throttle is exercised instead of being stubbed out.
   */
  driverPosition(): LatLng {
    const metersPerDegreeLongitude = 83_000;
    return { latitude: 41.65, longitude: -83.6 + this.driverMeters / metersPerDegreeLongitude };
  }

  /** The route line, long enough to cover every crossing in the scenario. */
  routeLine(): Position[] {
    return [
      [-83.6, 41.65],
      [-83.6 + 30_000 / 83_000, 41.65],
    ];
  }
}

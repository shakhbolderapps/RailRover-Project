import { create } from 'zustand';
import { haversineMeters, type LatLng, type Position } from '@railrover/shared';

import {
  fetchConflictsAhead,
  MOVEMENT_RECHECK_METERS,
  PERIODIC_RECHECK_MS,
  type RouteConflictRow,
} from '@/lib/conflicts';
import { getSupabase } from '@/lib/supabase';

/**
 * Live route conflicts during an active trip (SOW M4).
 *
 * Three things trigger a re-check, and all three are needed:
 *
 *  1. **A new report, via Realtime.** M4-AC5: "New reports submitted during an active trip update
 *     the route check in real time" — a driver twenty minutes into a trip must learn about a
 *     crossing another driver has just reported, not only about what was known at departure.
 *  2. **Driver movement**, throttled to 100 m. Crossings fall behind the driver as they pass.
 *  3. **A slow interval.** The one nothing else covers: a blocked report AGEING OUT of the
 *     freshness window while the driver sits in traffic. No event fires for that.
 */
interface ConflictState {
  conflicts: RouteConflictRow[];
  /** Conflicts the driver has dismissed, so an alert does not immediately return. */
  dismissed: string[];
  checking: boolean;

  start: (route: Position[], driver: LatLng) => void;
  updatePosition: (driver: LatLng) => void;
  dismiss: (crossingId: string) => void;
  stop: () => void;
}

interface Watch {
  route: Position[];
  driver: LatLng;
  lastCheckedAt: LatLng;
  channel: { unsubscribe: () => void } | null;
  timer: ReturnType<typeof setInterval> | null;
}

let watch: Watch | null = null;

export const useConflicts = create<ConflictState>((set, get) => {
  const run = async () => {
    if (!watch) return;
    set({ checking: true });
    try {
      const conflicts = await fetchConflictsAhead(watch.route, watch.driver);
      set({ conflicts });
    } catch {
      // A failed check must not clear a standing alert: the last known conflict set is better
      // information than an empty one, and silently going quiet is the dangerous failure here.
    } finally {
      set({ checking: false });
    }
  };

  return {
    conflicts: [],
    dismissed: [],
    checking: false,

    start: (route, driver) => {
      get().stop();

      watch = { route, driver, lastCheckedAt: driver, channel: null, timer: null };
      set({ conflicts: [], dismissed: [] });
      void run();

      /**
       * Subscribed to `reports` rather than to a view, because Postgres changefeeds emit table
       * rows. The payload is ignored entirely — it only says "something changed", and the
       * authoritative answer comes from re-running conflicts_ahead. Trusting the payload would
       * mean reimplementing the corridor and freshness rules on the client.
       *
       * Free tier: 200 concurrent connections and 2M messages/month. One channel per active trip.
       */
      watch.channel = getSupabase()
        .channel('route-conflicts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, () => {
          void run();
        })
        .subscribe();

      watch.timer = setInterval(() => void run(), PERIODIC_RECHECK_MS);
    },

    updatePosition: (driver) => {
      if (!watch) return;
      watch.driver = driver;

      // Throttled by distance, not time: a driver stopped at a level crossing produces a stream
      // of fixes that cannot change which crossings are ahead of them.
      if (haversineMeters(watch.lastCheckedAt, driver) < MOVEMENT_RECHECK_METERS) return;
      watch.lastCheckedAt = driver;
      void run();
    },

    dismiss: (crossingId) =>
      set((state) => ({ dismissed: [...state.dismissed, crossingId] })),

    stop: () => {
      watch?.channel?.unsubscribe();
      if (watch?.timer) clearInterval(watch.timer);
      watch = null;
      set({ conflicts: [], dismissed: [], checking: false });
    },
  };
});

/**
 * The conflict to alert about: the nearest one the driver has not dismissed.
 *
 * SOW M4 "Blocked Crossing Alert": multiple conflicts surface the nearest, and the rest belong in
 * the Active Alerts list rather than in a stack of competing alerts.
 */
export const selectActiveConflict = (state: ConflictState): RouteConflictRow | null =>
  state.conflicts.find((conflict) => !state.dismissed.includes(conflict.crossing_id)) ?? null;

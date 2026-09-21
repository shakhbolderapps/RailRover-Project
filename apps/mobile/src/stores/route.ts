import { create } from 'zustand';
import type { LatLng, PlaceSuggestion, RouteOption } from '@railrover/shared';

import { describeRoutingError, fetchRouteOptions } from '@/lib/routes';

/**
 * The trip: where the driver is going, what the options are, and which one is ACTIVE.
 *
 * "Active" is the load-bearing word. SOW M4-AC3 makes the selected route the one the conflict
 * logic checks against, so Phase 6 reads `activeRoute` from here rather than re-deriving it —
 * two sources of truth for "the route I am on" is how a driver gets alerted about a road they
 * are not driving.
 */
interface RouteState {
  destination: PlaceSuggestion | null;
  options: RouteOption[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;

  planTo: (destination: PlaceSuggestion, origin: LatLng) => Promise<void>;
  select: (id: string) => void;
  /** Replace the active route with a reroute, keeping it selectable alongside the originals. */
  replaceActive: (route: {
    coordinates: RouteOption['coordinates'];
    durationSeconds: number;
    distanceMeters: number;
  }) => void;
  clear: () => void;
}

export const useRoute = create<RouteState>((set, get) => ({
  destination: null,
  options: [],
  selectedId: null,
  loading: false,
  error: null,

  planTo: async (destination, origin) => {
    set({ destination, loading: true, error: null, options: [], selectedId: null });
    try {
      const options = await fetchRouteOptions(origin, {
        latitude: destination.latitude,
        longitude: destination.longitude,
      });
      set({
        options,
        // Preselect the first option so the map has something to draw and the driver can just
        // set off; they override it by tapping another card (M4-AC3 "preview before selecting").
        selectedId: options[0]?.id ?? null,
        loading: false,
      });
    } catch (cause) {
      set({ loading: false, error: describeRoutingError(cause), options: [] });
    }
  },

  select: (id) => set({ selectedId: id }),

  /**
   * A reroute becomes the active route, and is ADDED to the options rather than replacing them.
   *
   * The original route stays selectable on purpose: a driver who takes a detour and then sees the
   * crossing reported clear should be able to go back to the route they actually wanted. Its
   * crossing counts are left at zero because the reroute was verified conflict-free before being
   * offered (lib/reroute.ts) — recounting here would mean a second round trip for an answer we
   * already have.
   */
  replaceActive: (route) => {
    const id = `reroute-${Date.now()}`;
    set((state) => ({
      options: [
        ...state.options,
        {
          id,
          coordinates: route.coordinates,
          durationSeconds: route.durationSeconds,
          distanceMeters: route.distanceMeters,
          totalCrossings: 0,
          blockedCrossings: 0,
        },
      ],
      selectedId: id,
    }));
  },

  clear: () => set({ destination: null, options: [], selectedId: null, error: null }),
}));

/** The route the conflict logic checks against. Null when the driver has not chosen one. */
export const selectActiveRoute = (state: RouteState): RouteOption | null =>
  state.options.find((option) => option.id === state.selectedId) ?? null;

import { create } from 'zustand';

import {
  expoLocationService,
  type LocationFix,
  type LocationPermission,
  type LocationService,
} from '@/lib/location';

/**
 * Live driver position (SOW M1 "Location Permissions and Live Location").
 *
 * The service is injected rather than imported directly by consumers so that enabling background
 * tracking later is a binding change, not a rewrite (AC3) — and so these behaviours are testable
 * without a device.
 */
let service: LocationService = expoLocationService;

/** Test seam, and the swap point for a future background implementation. */
export const __setLocationService = (next: LocationService): void => {
  service = next;
};

interface LocationState {
  permission: LocationPermission;
  fix: LocationFix | null;
  isWatching: boolean;

  refreshPermission: () => Promise<LocationPermission>;
  start: () => Promise<LocationPermission>;
  stop: () => void;
}

let unsubscribe: (() => void) | null = null;

export const useLocation = create<LocationState>((set, get) => ({
  permission: 'undetermined',
  fix: null,
  isWatching: false,

  refreshPermission: async () => {
    const permission = await service.getPermission();
    set({ permission });
    return permission;
  },

  /**
   * Request permission, then begin foreground updates.
   *
   * AC1: nothing is tracked before the prompt — the permission call gates everything below it.
   * The last known fix is seeded first so the map can centre immediately instead of sitting on a
   * default viewport for the several seconds a first GPS fix can take.
   */
  start: async () => {
    if (get().isWatching) return get().permission;

    const existing = await service.getPermission();
    const permission = existing === 'granted' ? existing : await service.requestPermission();
    set({ permission });

    if (permission !== 'granted') return permission;

    const lastKnown = await service.getLastKnown();
    if (lastKnown && !get().fix) set({ fix: lastKnown });

    unsubscribe = await service.watch((fix) => set({ fix }));
    set({ isWatching: true });
    return permission;
  },

  /**
   * Stop updates, but KEEP the last fix.
   *
   * SOW edge case: "Location signal is temporarily lost -> System holds the last known position
   * and resumes when the signal returns." Clearing it here would also blank the map every time
   * the app is backgrounded, which is the same bug wearing a different hat.
   */
  stop: () => {
    unsubscribe?.();
    unsubscribe = null;
    set({ isWatching: false });
  },
}));

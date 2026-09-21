import * as Location from 'expo-location';

/**
 * The location layer (SOW M1 "Location Permissions and Live Location").
 *
 * AC3 requires this to be "structured so always-on background tracking can be enabled in a later
 * phase" — so every consumer depends on the `LocationService` INTERFACE, never on expo-location
 * directly. Adding background tracking later means writing a second implementation backed by
 * expo-task-manager and swapping which one is bound; no screen, store or report flow changes.
 * Calling Location.watchPositionAsync from a component would quietly destroy that property.
 */

export type LocationPermission = 'undetermined' | 'granted' | 'denied';

export interface LocationFix {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in metres, when the platform reports one. */
  accuracyMeters: number | null;
  /** Epoch milliseconds, from the platform's fix — not from the clock when we received it. */
  timestamp: number;
}

export interface LocationService {
  getPermission(): Promise<LocationPermission>;
  requestPermission(): Promise<LocationPermission>;
  getLastKnown(): Promise<LocationFix | null>;
  /** Starts foreground updates. Resolves to an unsubscribe function. */
  watch(onFix: (fix: LocationFix) => void): Promise<() => void>;
}

/**
 * How long a fix stays current before the UI should call it stale.
 *
 * SOW edge case: "Location signal is temporarily lost -> System holds the last known position and
 * resumes when the signal returns." Stale is a DISPLAY state, not a discard: the position is
 * still the best information available, and a driver in a tunnel would otherwise watch the map
 * jump back to nowhere.
 */
export const FIX_STALE_AFTER_MS = 30_000;

export const isFixStale = (fix: LocationFix | null, now: number): boolean => {
  if (!fix) return false; // "no fix yet" is a different state from "stale fix"
  return now - fix.timestamp > FIX_STALE_AFTER_MS;
};

/**
 * Collapse Expo's permission response into the three states the UI actually branches on.
 *
 * `canAskAgain` is what separates "not asked yet" from "denied": on both platforms a denial that
 * cannot be re-prompted in-app is the state that has to send the driver to system settings, and
 * treating it as merely undetermined produces a permission button that silently does nothing.
 */
export function toPermissionState(response: {
  granted: boolean;
  canAskAgain: boolean;
}): LocationPermission {
  if (response.granted) return 'granted';
  return response.canAskAgain ? 'undetermined' : 'denied';
}

const toFix = (position: Location.LocationObject): LocationFix => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracyMeters: position.coords.accuracy ?? null,
  timestamp: position.timestamp,
});

/** Foreground-only implementation. The background one slots in behind the same interface. */
export const expoLocationService: LocationService = {
  getPermission: async () => toPermissionState(await Location.getForegroundPermissionsAsync()),

  // The purpose strings shown at this prompt live in app.config.ts and are declared for BOTH
  // platforms (SOW M1 AC1: "a clear purpose string before any tracking begins").
  requestPermission: async () =>
    toPermissionState(await Location.requestForegroundPermissionsAsync()),

  getLastKnown: async () => {
    const position = await Location.getLastKnownPositionAsync();
    return position ? toFix(position) : null;
  },

  watch: async (onFix) => {
    const subscription = await Location.watchPositionAsync(
      {
        // High, not Balanced. Balanced resolves through the fused/network provider, which is
        // roughly 100 m accurate — too coarse to tell which of two nearby crossings a driver is
        // sitting at, and that choice is the whole basis of a report. It is also why an emulator
        // shows no movement under Balanced: `adb emu geo fix` drives the GPS provider only.
        accuracy: Location.Accuracy.High,
        // A driver at 60 mph covers 27 m/s. Updating every 25 m keeps map centring and
        // nearest-crossing selection current without waking the GPS on every metre travelled.
        distanceInterval: 25,
        timeInterval: 5_000,
      },
      (position) => onFix(toFix(position)),
    );
    return () => subscription.remove();
  },
};

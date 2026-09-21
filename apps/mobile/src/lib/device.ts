import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/**
 * The stable per-install device identifier (SOW M1 AC4).
 *
 * Every report carries this, which is what lets a GUEST report be attributed and rate-limited —
 * a guest has no account, so the device is the only stable handle the server has. `submit_report`
 * counts against it and an administrator can suspend it (ADR 0004).
 *
 * Why generated rather than read from the OS: both platforms deliberately make a true hardware ID
 * unavailable to apps. `expo-application`'s Android ID is reset by a factory reset and is scoped
 * per signing key, and iOS's identifierForVendor returns a NEW value once the last app from a
 * vendor is uninstalled. Generating our own and storing it keeps one code path with identical
 * semantics on both platforms instead of two subtly different ones.
 *
 * SecureStore rather than AsyncStorage: this value is the sole identity behind a guest's reports,
 * so it should not sit in plain app storage that any backup or rooted-device tool can rewrite.
 */
const DEVICE_ID_KEY = 'railrover.device_id';

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
  if (existing) {
    cached = existing;
    return existing;
  }

  const created = Crypto.randomUUID();
  // If the write fails the id is still returned, so a report is never blocked by storage trouble.
  // It will simply be regenerated next launch, costing rate-limit continuity, not correctness.
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created).catch(() => {});
  cached = created;
  return created;
}

/** Test seam. Not used by the app. */
export function __resetDeviceIdCache(): void {
  cached = null;
}

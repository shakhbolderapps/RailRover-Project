import * as SecureStore from 'expo-secure-store';

import { __resetDeviceIdCache, getDeviceId } from './device';

describe('getDeviceId', () => {
  beforeEach(async () => {
    __resetDeviceIdCache();
    await SecureStore.deleteItemAsync('railrover.device_id');
    jest.clearAllMocks();
  });

  it('M1-AC4: produces a device identifier that reports can be attributed to', async () => {
    const id = await getDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('M1-AC4: the identifier is STABLE across launches, or rate limiting means nothing', async () => {
    // A device that gets a fresh id each launch resets its own rate-limit budget at will, which
    // would make the per-device limit in submit_report (SOW M3-AC5) trivially bypassable.
    const first = await getDeviceId();
    __resetDeviceIdCache(); // simulate a cold start with storage intact
    const second = await getDeviceId();
    expect(second).toBe(first);
  });

  it('persists to SecureStore, not to ordinary app storage', async () => {
    await getDeviceId();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'railrover.device_id',
      expect.any(String),
    );
  });

  it('still returns an id when storage is unavailable, rather than blocking a report', async () => {
    // Failing closed here would mean a driver at a blocked crossing cannot report it because of
    // a keychain problem. Losing rate-limit continuity is the lesser cost.
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('keychain unavailable'));
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('keychain unavailable'));
    await expect(getDeviceId()).resolves.toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('reuses an identifier already in storage instead of minting a new one', async () => {
    await SecureStore.setItemAsync('railrover.device_id', 'existing-device-id');
    __resetDeviceIdCache();
    await expect(getDeviceId()).resolves.toBe('existing-device-id');
  });
});

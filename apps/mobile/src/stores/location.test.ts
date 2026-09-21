import type { LocationFix, LocationPermission, LocationService } from '@/lib/location';

import { __setLocationService, useLocation } from './location';

/** A controllable stand-in, which is only possible because consumers depend on the interface. */
function fakeService(overrides: Partial<LocationService> = {}) {
  const emit: { current: ((fix: LocationFix) => void) | null } = { current: null };
  const unsubscribe = jest.fn();

  const service: LocationService = {
    getPermission: jest.fn(async () => 'undetermined' as LocationPermission),
    requestPermission: jest.fn(async () => 'granted' as LocationPermission),
    getLastKnown: jest.fn(async () => null),
    watch: jest.fn(async (onFix: (fix: LocationFix) => void) => {
      emit.current = onFix;
      return unsubscribe;
    }),
    ...overrides,
  };

  return { service, emit, unsubscribe };
}

const fix = (latitude: number, timestamp = 1_000): LocationFix => ({
  latitude,
  longitude: -83.5379,
  accuracyMeters: 8,
  timestamp,
});

beforeEach(() => {
  useLocation.setState({ permission: 'undetermined', fix: null, isWatching: false });
});

describe('location store', () => {
  it('M1-Location-AC1: requests permission BEFORE any tracking begins', async () => {
    const { service } = fakeService();
    __setLocationService(service);

    await useLocation.getState().start();

    expect(service.requestPermission).toHaveBeenCalled();
    // The ordering is the criterion: watching must not start until permission is granted.
    expect(jest.mocked(service.requestPermission).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(service.watch).mock.invocationCallOrder[0]!,
    );
  });

  it('M1-Location-AC1: does NOT start tracking when permission is refused', async () => {
    const { service } = fakeService({
      requestPermission: jest.fn(async () => 'denied' as LocationPermission),
    });
    __setLocationService(service);

    await expect(useLocation.getState().start()).resolves.toBe('denied');
    expect(service.watch).not.toHaveBeenCalled();
    expect(useLocation.getState().isWatching).toBe(false);
  });

  it('M1-Location-AC2: live updates replace the position as the driver moves', async () => {
    const { service, emit } = fakeService();
    __setLocationService(service);

    await useLocation.getState().start();
    emit.current?.(fix(41.7));
    expect(useLocation.getState().fix?.latitude).toBe(41.7);

    emit.current?.(fix(41.8));
    expect(useLocation.getState().fix?.latitude).toBe(41.8);
  });

  it('seeds from the last known position so the map can centre before the first GPS fix', async () => {
    const { service } = fakeService({ getLastKnown: jest.fn(async () => fix(41.5)) });
    __setLocationService(service);

    await useLocation.getState().start();
    expect(useLocation.getState().fix?.latitude).toBe(41.5);
  });

  it('M1-Location edge case: stopping HOLDS the last position instead of clearing it', async () => {
    // "Location signal is temporarily lost -> System holds the last known position and resumes
    // when the signal returns." Clearing on stop would also blank the map on every backgrounding.
    const { service, emit, unsubscribe } = fakeService();
    __setLocationService(service);

    await useLocation.getState().start();
    emit.current?.(fix(41.9));
    useLocation.getState().stop();

    expect(unsubscribe).toHaveBeenCalled();
    expect(useLocation.getState().isWatching).toBe(false);
    expect(useLocation.getState().fix?.latitude).toBe(41.9);
  });

  it('skips the permission prompt when it was already granted', async () => {
    const { service } = fakeService({
      getPermission: jest.fn(async () => 'granted' as LocationPermission),
    });
    __setLocationService(service);

    await useLocation.getState().start();
    expect(service.requestPermission).not.toHaveBeenCalled();
    expect(service.watch).toHaveBeenCalled();
  });

  it('does not open a second subscription when start is called twice', async () => {
    const { service } = fakeService();
    __setLocationService(service);

    await useLocation.getState().start();
    await useLocation.getState().start();
    expect(service.watch).toHaveBeenCalledTimes(1);
  });
});

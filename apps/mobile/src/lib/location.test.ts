import { FIX_STALE_AFTER_MS, isFixStale, toPermissionState, type LocationFix } from './location';

const fixAt = (timestamp: number): LocationFix => ({
  latitude: 41.6528,
  longitude: -83.5379,
  accuracyMeters: 10,
  timestamp,
});

describe('toPermissionState', () => {
  it('M1-Location-AC1: a granted response is granted', () => {
    expect(toPermissionState({ granted: true, canAskAgain: false })).toBe('granted');
  });

  it('separates "not asked yet" from "denied and cannot ask again"', () => {
    // This distinction is what the denied-permission UI hangs on: when we can still prompt, the
    // button should prompt; when we cannot, it must send the driver to system settings instead.
    // Collapsing both to 'denied' produces a prompt that never appears; collapsing both to
    // 'undetermined' produces a button that silently does nothing.
    expect(toPermissionState({ granted: false, canAskAgain: true })).toBe('undetermined');
    expect(toPermissionState({ granted: false, canAskAgain: false })).toBe('denied');
  });
});

describe('isFixStale', () => {
  const now = 1_700_000_000_000;

  it('treats a recent fix as current', () => {
    expect(isFixStale(fixAt(now - 5_000), now)).toBe(false);
  });

  it('M1-Location edge case: an old fix is marked stale rather than discarded', () => {
    // The caller keeps displaying the position; stale is a display state, not a deletion. A
    // driver in a tunnel should see their last known position greyed out, not an empty map.
    expect(isFixStale(fixAt(now - FIX_STALE_AFTER_MS - 1), now)).toBe(true);
  });

  it('does not call "no fix yet" stale — they are different states', () => {
    // Never having had a fix means "still acquiring"; stale means "we had one and it aged out".
    // The UI says different things for each.
    expect(isFixStale(null, now)).toBe(false);
  });

  it('is exclusive at the boundary, so a fix exactly at the window is still current', () => {
    expect(isFixStale(fixAt(now - FIX_STALE_AFTER_MS), now)).toBe(false);
  });
});

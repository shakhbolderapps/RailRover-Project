import type { Session } from '@supabase/supabase-js';

import { statusForSession } from './session';

/**
 * `statusForSession` is the one place the app decides whether a driver is a guest or an account
 * holder, and several screens branch on it. Supabase's `is_anonymous` flag is the source of truth
 * (SOW M1: a guest session is a real session, not a local pretend-state).
 */
const sessionWith = (user: Partial<Session['user']> | null): Session | null =>
  user === null ? null : ({ user } as Session);

describe('statusForSession', () => {
  it('M1-AC1: an anonymous Supabase session counts as a guest, not as signed out', () => {
    // The guest must reach the map and report without an account, so this cannot be 'signed-out'.
    expect(statusForSession(sessionWith({ is_anonymous: true }))).toBe('guest');
  });

  it('M1-AC2: a non-anonymous session counts as an account holder', () => {
    expect(statusForSession(sessionWith({ is_anonymous: false }))).toBe('account');
  });

  it('treats a missing is_anonymous flag as an account, never as a guest', () => {
    // Older sessions predate the flag. Defaulting to 'account' is the safe direction: it keeps a
    // real account holder out of guest-only UI, whereas the reverse would mislabel them.
    expect(statusForSession(sessionWith({}))).toBe('account');
  });

  it('reports signed-out for no session at all', () => {
    expect(statusForSession(null)).toBe('signed-out');
    expect(statusForSession({} as Session)).toBe('signed-out');
  });
});

describe('module loading with no backend configuration', () => {
  it('importing the session store does not throw when Supabase config is missing', () => {
    // The regression this guards: createClient() throws on an empty URL. Building the client at
    // import time therefore crashed the app during module evaluation on any build with a missing
    // .env — before the setup screen could render, producing a white screen with no explanation.
    // Development never shows it, because a populated .env hides it. Hence the lazy getSupabase().
    //
    // Jest runs with no expo-constants `extra`, so reaching this line at all is the assertion:
    // an eager client would have thrown while importing ./session above.
    expect(typeof statusForSession).toBe('function');
  });
});

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/device';
import { toUserFacingAuthError } from '@/lib/auth-errors';

/**
 * Who the driver currently is.
 *
 * `guest` is a REAL Supabase session (signInAnonymously), not a local pretend-state. That matters:
 * RLS policies and report attribution then work identically for guests and account holders
 * instead of needing a parallel device-token scheme, and the SOW's "a guest later creates an
 * account" edge case becomes a platform feature rather than a data migration we write.
 */
export type SessionStatus = 'loading' | 'signed-out' | 'guest' | 'account';

export interface AuthResult {
  ok: boolean;
  error?: string;
}

interface SessionState {
  status: SessionStatus;
  session: Session | null;
  deviceId: string | null;
  initialized: boolean;

  initialize: () => Promise<void>;
  continueAsGuest: () => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

/** Reject after `ms` so a stalled network call cannot hold a screen hostage. */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** A session belongs to a guest when Supabase flags the user as anonymous. */
export const statusForSession = (session: Session | null): SessionStatus => {
  if (!session?.user) return 'signed-out';
  return session.user.is_anonymous ? 'guest' : 'account';
};

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  session: null,
  deviceId: null,
  initialized: false,

  /**
   * Restore any existing session and start listening for changes.
   *
   * The device id is resolved here, once, so every later report submission reads it from memory
   * instead of hitting SecureStore on the critical two-tap path.
   */
  initialize: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    const deviceId = await getDeviceId().catch(() => null);

    try {
      // Bounded, because getSession() can reach the network to refresh an expired token. On a
      // flaky connection it may neither resolve nor reject, and the root layout holds a spinner
      // until this settles — an unbounded await here is an app that never finishes launching.
      const { data } = await withTimeout(getSupabase().auth.getSession(), 8_000);
      set({ deviceId, session: data.session, status: statusForSession(data.session) });
    } catch {
      // Fall back to a usable screen rather than spinning forever. This is self-correcting: if a
      // stored session does exist, onAuthStateChange fires once the client catches up and moves
      // the driver straight to the map.
      set({ deviceId, session: null, status: 'signed-out' });
    }

    // Fires on token refresh, sign-out from another surface, and on the anonymous -> account
    // upgrade, so the UI follows the real session rather than a copy that can drift from it.
    getSupabase().auth.onAuthStateChange((_event, session) => {
      set({ session, status: statusForSession(session) });
    });
  },

  /** SOW M1 AC1: reach the map and report without creating an account. */
  continueAsGuest: async () => {
    const { error } = await getSupabase().auth.signInAnonymously();
    if (error) return { ok: false, error: toUserFacingAuthError(error.message) };
    return { ok: true };
  },

  signIn: async (email, password) => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, error: toUserFacingAuthError(error.message) };
    return { ok: true };
  },

  /**
   * Create an account.
   *
   * SOW M1 edge case: "A guest later creates an account -> System carries the device settings and
   * recent reports into the new account." When the driver is already in an anonymous session,
   * `updateUser` attaches credentials to that SAME user id, so every report already written with
   * that user_id belongs to the new account with nothing to migrate. Signing up fresh instead
   * would mint a second user and orphan the guest's history.
   */
  signUp: async (email, password) => {
    const isGuest = get().status === 'guest';

    const { error } = isGuest
      ? await getSupabase().auth.updateUser({ email: email.trim(), password })
      : await getSupabase().auth.signUp({ email: email.trim(), password });

    if (error) return { ok: false, error: toUserFacingAuthError(error.message) };
    return { ok: true };
  },

  /** SOW M1 edge case: a driver forgets their password. */
  sendPasswordReset: async (email) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim());
    if (error) return { ok: false, error: toUserFacingAuthError(error.message) };
    return { ok: true };
  },

  signOut: async () => {
    await getSupabase().auth.signOut();
    set({ session: null, status: 'signed-out' });
  },
}));

/**
 * Auth error copy.
 *
 * SOW M1 edge case: "An incorrect password is entered -> System responds with 'Email or password
 * is incorrect.'" That exact sentence is contractual, so it lives here as a constant and is
 * asserted in tests rather than being retyped at each call site.
 *
 * It is also deliberately ambiguous about WHICH of the two was wrong. Saying "no account with
 * that email" would turn the sign-in form into an account-existence oracle.
 */
export const AUTH_ERROR = {
  invalidCredentials: 'Email or password is incorrect.',
  emailTaken: 'An account already exists for that email. Try signing in instead.',
  weakPassword: 'Choose a password of at least 6 characters.',
  invalidEmail: 'That does not look like a valid email address.',
  offline: 'No connection. Check your network and try again.',
  unknown: 'Something went wrong. Please try again.',
} as const;

/**
 * Map a Supabase auth error onto copy a driver can act on.
 *
 * Supabase's own strings ("Invalid login credentials", "AuthApiError: ...") are diagnostic, not
 * user-facing, and they change between releases. Matching loosely on substrings and falling back
 * to a generic message means a new upstream string degrades to `unknown` rather than leaking an
 * internal error into the UI.
 */
export function toUserFacingAuthError(raw: string | null | undefined): string {
  if (!raw) return AUTH_ERROR.unknown;
  const message = raw.toLowerCase();

  if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
    return AUTH_ERROR.invalidCredentials;
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return AUTH_ERROR.emailTaken;
  }
  if (message.includes('password should be') || message.includes('weak password')) {
    return AUTH_ERROR.weakPassword;
  }
  if (message.includes('invalid email') || message.includes('unable to validate email')) {
    return AUTH_ERROR.invalidEmail;
  }
  if (message.includes('network') || message.includes('fetch failed')) {
    return AUTH_ERROR.offline;
  }
  return AUTH_ERROR.unknown;
}

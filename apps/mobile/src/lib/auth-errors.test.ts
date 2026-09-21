import { AUTH_ERROR, toUserFacingAuthError } from './auth-errors';

describe('toUserFacingAuthError', () => {
  it('M1 edge case: an incorrect password produces exactly "Email or password is incorrect."', () => {
    // The SOW specifies this sentence verbatim, so assert the literal string rather than the
    // constant — a well-meaning reword of the constant should fail this test.
    expect(toUserFacingAuthError('Invalid login credentials')).toBe(
      'Email or password is incorrect.',
    );
  });

  it('does not reveal whether the email or the password was the wrong one', () => {
    // Distinguishing them would turn the sign-in form into an account-existence oracle.
    const message = toUserFacingAuthError('Invalid login credentials').toLowerCase();
    expect(message).not.toContain('no account');
    expect(message).not.toContain('not found');
    expect(message).not.toContain('does not exist');
  });

  it('maps a duplicate signup to actionable copy', () => {
    expect(toUserFacingAuthError('User already registered')).toBe(AUTH_ERROR.emailTaken);
  });

  it('maps a short password to actionable copy', () => {
    expect(toUserFacingAuthError('Password should be at least 6 characters')).toBe(
      AUTH_ERROR.weakPassword,
    );
  });

  it('falls back to a generic message rather than leaking an unrecognised upstream string', () => {
    // Supabase's error strings change between releases. An unknown one must degrade, not surface.
    expect(toUserFacingAuthError('AuthApiError: unexpected_failure at gotrue/v2')).toBe(
      AUTH_ERROR.unknown,
    );
    expect(toUserFacingAuthError(null)).toBe(AUTH_ERROR.unknown);
    expect(toUserFacingAuthError('')).toBe(AUTH_ERROR.unknown);
  });

  it('never returns an empty string, whatever it is given', () => {
    for (const input of ['', null, undefined, '   ', 'something bizarre']) {
      expect(toUserFacingAuthError(input).length).toBeGreaterThan(0);
    }
  });
});

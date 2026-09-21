# M1 — Guest Access and Account

> **Module 1: Foundation**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

A driver can start using the app immediately as a guest to keep first-run friction low, and can create a lightweight account to retain their settings and report history.

## User Flow

1. Driver opens the app for the first time.
2. Driver chooses to continue as a guest or create an account.
3. A guest is taken straight to the map; a registering driver provides an email and password.
4. System creates the account and an authenticated session, or a guest session tied to the device.
5. On return visits, the driver resumes their session or signs in.

## Edge Cases

- A guest later creates an account -> System carries the device settings and recent reports into the new account.
- An incorrect password is entered -> System responds with "Email or password is incorrect."
- A driver forgets their password -> System sends a reset link to the registered email.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. A driver can reach the map and submit reports as a guest without creating an account.
2. A driver can create an account with email and password and sign in on return visits.
3. Passwords are stored using a one-way salted hash and never in plain text.
4. Each report is tied to a device identifier so guest and account reports can be attributed.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ◐ `stores/session.test.ts` → "M1-AC1: an anonymous Supabase session counts as a guest, not as signed out"; `supabase/tests/060-submit-report.sql` runs its whole suite **as the `anon` role**, which is what proves a guest can actually submit. The two-tap report UI is Phase 4 | ◐ |
| 2 | ◐ `lib/auth-errors.test.ts` covers the sign-in failure copy; sign-up, sign-in and session restore are implemented in `stores/session.ts`. No assertion yet drives a real round trip against GoTrue | ◐ |
| 3 | ◐ Delegated to Supabase Auth (GoTrue), which stores a bcrypt hash — not our code to assert. See note | ◐ |
| 4 | ✅ `lib/device.test.ts` → "M1-AC4: produces a device identifier that reports can be attributed to" + "M1-AC4: the identifier is STABLE across launches, or rate limiting means nothing"; `supabase/tests/060-submit-report.sql` → "M3-AC3: the report records the device identifier" | ✅ |

Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on criterion 3.** The app never hashes anything: the password goes straight from the form
into `supabase.auth.signUp`/`signInWithPassword` over TLS, and GoTrue stores a bcrypt hash. There
is no honest unit test for "the server hashes correctly" from inside this codebase — asserting it
here would be theatre. What *is* ours to get right is that the password is never persisted or
logged client-side, which holds by construction: it lives in component state and is never written
to SecureStore, AsyncStorage, or the session store.

**Note on the guest → account edge case.** "A guest later creates an account → System carries the
device settings and recent reports into the new account" is satisfied by the platform rather than
by a migration: `signUp` calls `updateUser` when the driver is already in an anonymous session, so
credentials attach to the *same* user id and every report already written with that `user_id`
belongs to the new account. Calling `signUp` unconditionally would mint a second user and orphan
the guest's history — see `stores/session.ts`.

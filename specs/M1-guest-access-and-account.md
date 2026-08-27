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
| 1 | _not yet written_ | ☐ |
| 2 | _not yet written_ | ☐ |
| 3 | _not yet written_ | ☐ |
| 4 | _not yet written_ | ☐ |

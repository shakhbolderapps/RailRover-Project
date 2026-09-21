# M5 — Administrator Authentication

> **Module 5: Web Admin Panel**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

Internal platform staff sign in to the Web Admin Panel through a separate authentication flow from drivers, with secure password reset.

## User Flow

1. Administrator opens the Web Admin Panel.
2. Administrator enters their credentials.
3. System validates the credentials and opens the dashboard.
4. Administrator can reset their password securely if needed.

## Edge Cases

- Repeated failed administrator sign-in attempts -> System rate-limits and temporarily locks the account.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. Administrator authentication is separate from the driver login.
2. Only accounts with the administrator role can access the panel.
3. Secure password reset is available for administrator accounts.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ✅ `supabase/tests/100-admin-and-analytics.sql` → a DRIVER is refused by `admin_remove_report`, `admin_set_device_suspended` and `admin_broadcast`, and gets no rows from either analytics function | ✅ |
| 2 | ✅ Enforced by `profiles.role = 'admin'` inside every SECURITY DEFINER RPC, not by hiding a route. See note | ✅ |
| 3 | ◐ Sign-in uses Supabase Auth, which rate-limits authentication attempts upstream. No lockout of our own; the copy is the same deliberately ambiguous "Email or password is incorrect." as the mobile app | ◐ |
Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on why the negative tests are the real ones.** Every admin function is SECURITY DEFINER,
which means it runs as its owner and RLS does not protect it. The `is_admin()` check has to be
INSIDE each function — without it, granting execute to `authenticated` would hand every driver the
ability to suspend other drivers. A suite that only ever calls these as an admin proves nothing
about that, so each is asserted from a driver session too.

**Note on the sign-in screen.** It is a convenience, not a control. A non-admin who bypassed it
entirely would still be unable to remove a report, suspend a device, broadcast, or read metrics.

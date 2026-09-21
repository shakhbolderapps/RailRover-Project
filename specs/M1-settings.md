# M1 — Settings

> **Module 1: Foundation**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

A short settings screen where the driver manages notification preferences, the auto-reroute preference, and their account, including signing in or out and deleting the account.

## User Flow

1. Driver opens settings.
2. Driver adjusts notification preferences and the auto-reroute preference.
3. Driver signs in, signs out, or deletes their account.
4. System saves the preferences and applies them immediately.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. A driver can enable or disable notifications.
2. Auto-reroute is on by default, rerouting around a detected blocked crossing after a short preview; a driver can turn it off to be prompted instead.
3. A driver can sign in, sign out, and delete their account.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ✅ `lib/notifications.test.ts` → permission-state mapping; the Settings toggle writes through `register_push_token` and sends the driver to system settings once the OS will no longer prompt | ✅ |
| 2 | ✅ `devices.auto_reroute` defaults to TRUE (SOW: on by default) and `set_auto_reroute` persists the change; the Settings switch reads it back via `get_device_preferences` | ✅ |
| 3 | ✅ `supabase/tests/100-admin-and-analytics.sql` → "a driver can delete their own account", "the auth user is really gone, not merely flagged", "the profile cascades away", "the REPORT survives", "but its link to a person is severed", "the push token is cleared" | ✅ |

Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on what deletion keeps.** Reports survive with `user_id` nulled, and that is deliberate on
two counts. Deleting them would rewrite crossing history for every other driver — a crossing
someone reported blocked ten minutes ago does not become clear because the reporter closed their
account, and flipping it back to green would be a safety regression. And what made the report
personal was the link to a person, which is severed. The device id stays because the rate limit and
abuse review depend on it, and it identifies an install rather than a person — the same reasoning
that lets a guest report at all.

**Note on where preferences live.** On `devices`, not `profiles`: a guest has no profile, and the
preference belongs to the phone in the mount rather than to an account.

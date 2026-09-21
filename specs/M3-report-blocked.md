# M3 — Report Blocked

> **Module 3: Crowd-Sourced Reporting**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

A fast flow that lets a driver mark a crossing as blocked in a couple of taps, in under five seconds, auto-selecting the nearest crossing. Reporting is limited to crossings within about a mile so a driver reports a crossing they can actually see. No note field, to keep it quick while driving.

## User Flow

1. Driver taps the blocked report action.
2. System auto-selects the nearest crossing within about a mile of the driver.
3. Driver confirms the crossing.
4. System saves the report with the crossing, status, timestamp, and device identifier.
5. System updates the crossing to red across the app.

## Edge Cases

- The driver is not within about a mile of a known crossing -> System does not allow a report, since the driver is too far to observe the crossing.
- The same crossing is reported blocked repeatedly -> System records the latest report and refreshes the freshness timer.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. A blocked report can be submitted in a couple of taps, in under five seconds, with the nearest crossing auto-selected.
2. Reporting is limited to crossings within about a mile of the driver, a configurable distance.
3. Each report saves the crossing, status, timestamp, and device identifier.
4. A new blocked report updates the crossing to red and resets its freshness window.
5. Report submission is rate-limited per device to deter spam.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | _not yet written_ — two-tap flow is Phase 4. **Also requires a stopwatch pass on device**: an under-five-seconds requirement cannot be proven by a unit test, and must be timed separately on iOS once a device exists | ☐ |
| 2 | ✅ `geo.test.ts` → "0.9 mi is inside the report radius and 1.1 mi is outside"; `supabase/tests/040` → nearest_crossing radius bound and app_config default; `supabase/tests/060-submit-report.sql` → "M3-AC2: a driver 0.9 mi from a crossing CAN report it" / "...1.1 mi...CANNOT" | ✅ |
| 3 | ✅ `supabase/tests/060-submit-report.sql` → "M3-AC3: the report records the device identifier" / "...the status" / "...a fresh timestamp" | ✅ |
| 4 | ✅ `supabase/tests/030` → "a new blocked report updates the crossing to red"; `supabase/tests/060-submit-report.sql` → "M3-AC4: a new blocked report shows the crossing as red immediately", plus most-recent-wins asserted end-to-end through `submit_report` itself | ✅ |
| 5 | ✅ `supabase/tests/060-submit-report.sql` → "M3-AC5: the 4th rapid report from the same device trips the rate limit" (limit lowered to 3 for a fast, deterministic test) | ✅ |

Legend: ✅ covered · ◐ partially covered (see note) · ⧗ assertion written but never executed · ☐ not yet written

**Note on criterion 2.** A client-side radius check is decoration (ADR 0004). The shared distance
math and the `nearest_crossing` bound are tested here; the *enforcement* is a pgTAP assertion
against `submit_report`, in `supabase/tests/060-submit-report.sql`. `supabase/tests/050-rls.sql`
asserts the thing that makes that enforcement meaningful: a client cannot insert into `reports`
directly — `submit_report` is the only door.

**Note on criterion 1.** Verified with a stopwatch, phone mounted, from app-open to
report-submitted — a five-second budget is a per-platform claim, so it is timed on Android now
and on iOS when a device arrives.

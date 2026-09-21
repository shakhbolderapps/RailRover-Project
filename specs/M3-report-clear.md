# M3 — Report Clear

> **Module 3: Crowd-Sourced Reporting**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

The same fast flow used to mark a previously blocked crossing as clear, turning it green. A clear report is the only thing that returns a crossing to green, since the app does not guess a crossing is clear on a timer.

## User Flow

1. Driver taps the clear report action.
2. System auto-selects the nearest crossing within about a mile.
3. Driver confirms the crossing.
4. System saves the clear report and updates the crossing to green.

## Edge Cases

- A crossing is reported clear while another driver reports it blocked -> System keeps the most recent report and reflects it in the crossing status.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. A clear report uses the same couple-of-taps flow with the nearest crossing auto-selected.
2. A clear report turns the crossing green and records the time; a crossing returns to green only on a clear report.
3. Reporting is limited to crossings within about a mile of the driver.
4. Clear and blocked reports on the same crossing resolve by most recent report.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | _not yet written_ — shares the Phase 4 flow with Report Blocked | ☐ |
| 2 | `crossing-status.test.ts` → "a crossing NEVER returns to green on a timer"; `supabase/tests/010` → day-old and month-old blocked reports still yellow | ✅ |
| 3 | ✅ `geo.test.ts` distance math + `supabase/tests/040-nearest-crossing.sql` radius bound; `supabase/tests/060-submit-report.sql` → server enforcement via `submit_report` | ✅ |
| 4 | `supabase/tests/030-crossing-status-view.sql` → "blocked then clear 30 seconds later → green" and "clear then blocked → red (most recent wins, in both directions)"; `supabase/tests/060-submit-report.sql` → the same property asserted end-to-end through `submit_report` itself | ✅ |

Legend: ✅ covered · ◐ partially covered (see note) · ⧗ assertion written but never executed · ☐ not yet written

**Note on criterion 2.** This is the criterion that makes `green` mean *someone confirmed it
clear* rather than *we stopped hearing about it*. Covered in the TypeScript mirror (executed,
passing) and in SQL (written, unexecuted).

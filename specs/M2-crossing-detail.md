# M2 — Crossing Detail

> **Module 2: Crossing Map**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

The crossing detail view shows a crossing's current status, the time of the last report, how many reports it has received, and whether it currently affects the driver's active route.

## User Flow

1. Driver taps a crossing marker or list item.
2. System opens the crossing detail.
3. System shows status, last report time, and report count.
4. System indicates whether the crossing affects the active route.
5. Driver can submit a blocked or clear report from the detail view.

## Edge Cases

- A crossing has no reports yet -> System shows it as unconfirmed with no recent report time.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. The detail view shows current status, last report time, and report count.
2. The view indicates whether the crossing is on or near the active route.
3. A driver can report blocked or clear directly from the detail view.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ◐ `crossing-status.test.ts` → "a crossing with no reports is UNKNOWN, not green"; `supabase/tests/030` → report_count and last_reported_at resolution ⧗. Display is Phase 3d | ◐ |
| 2 | _not yet written_ — needs route conflict detection (Phase 6a) | ☐ |
| 3 | _not yet written_ — needs the report flows (Phase 4) | ☐ |

Legend: ✅ covered · ◐ partially covered (see note) · ⧗ assertion written but never executed · ☐ not yet written

**Note on the edge case.** "A crossing has no reports yet → System shows it as unconfirmed with no
recent report time" is why `unknown` is a distinct fourth state rather than green. Asserted in
both implementations: `crossing-status.test.ts` and `supabase/tests/010-crossing-color.sql`.
See ADR 0002.

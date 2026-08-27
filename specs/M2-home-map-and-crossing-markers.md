# M2 — Home Map and Crossing Markers

> **Module 2: Crossing Map**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

The home screen shows a live map centered on the driver with color-coded markers for nearby crossings, a destination search at the top, report and route actions at the bottom, and a short summary line such as the number of blocked crossings on the active route. A crossing shows red for a fresh blocked report, yellow once a blocked report has aged past the freshness window without a clear report, and green once a clear report is received.

## User Flow

1. Driver opens the home map.
2. System centers the map on the driver live location.
3. System displays nearby crossings as red, yellow, or green markers by status.
4. Driver taps a marker to open its detail, or uses the bottom actions to report or enter a destination.
5. System shows a summary line such as "1 blocked crossing on your route" when a route is active.

## Edge Cases

- A crossing has a fresh blocked report -> System shows it red.
- A blocked report ages past the freshness window with no clear report -> System shows the crossing yellow, meaning blocked but unconfirmed.
- A clear report is submitted -> System shows the crossing green; status returns to green only on a clear report, not on a timer.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. The map centers on the driver live location.
2. Crossings display as red, yellow, or green markers: red for a fresh blocked report, yellow for a blocked report aged past the freshness window, green once a clear report is received.
3. Destination search is available at the top and report and route actions at the bottom.
4. A summary line reports the count of blocked crossings on the active route.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | _not yet written_ — needs the live map (Phase 3c) | ☐ |
| 2 | `packages/shared/src/crossing-status.test.ts` → "M2-AC2: a fresh blocked report shows RED" / "…aged past the freshness window shows YELLOW" / "…a clear report shows GREEN" | ✅ |
| 3 | _not yet written_ — needs the home map layout (Phase 3c) | ☐ |
| 4 | _not yet written_ — needs route conflict detection (Phase 6a) | ☐ |

Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on criterion 2.** The colour *rules* are covered in the shared package. The `crossing_status`
SQL view implements the same rules and gets its own pgTAP assertions in Phase 1 — two
implementations of one rule (ADR 0002), so both are tested against this criterion. Marker
*rendering* is Phase 3c.

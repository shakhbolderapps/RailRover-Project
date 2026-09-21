# M5 — Crossing Inventory Management

> **Module 5: Web Admin Panel**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

Internal platform staff add, edit, and remove crossings and correct crossing coordinates so the map, reports, and route checks stay accurate as the pilot area is refined.

## User Flow

1. Administrator opens crossing management.
2. Administrator searches for a crossing or adds a new one.
3. Administrator edits a crossing location, road, or city, or removes it.
4. System applies the change across the app.

## Edge Cases

- An administrator corrects a crossing coordinates -> System updates the marker position and the route checks that depend on it.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. Administrators can add, edit, and remove crossings.
2. Coordinate corrections update the map and the route conflict logic.
3. Inventory changes take effect across the app.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ✅ `supabase/tests/100-admin-and-analytics.sql` → "an ADMIN can add a crossing", "…can edit a crossing", "…can retire a crossing". `050-rls.sql` asserts the other half: a driver cannot | ✅ |
| 2 | ✅ `100-admin-and-analytics.sql` → "a coordinate correction is visible through crossing_status at once" AND "the corrected coordinates reach the ROUTE logic, not just the map" | ✅ |
| 3 | ✅ `100-admin-and-analytics.sql` → "a retired crossing drops out of the route logic immediately" | ✅ |

Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on criterion 2, which is easy to under-test.** "Updates the map and the route conflict
logic" has two halves, and asserting only the first would pass while the second silently broke.
The second assertion runs the corrected coordinates through `crossings_on_route` — the real route
query — rather than trusting that one table means one answer.

**Note on "remove".** Retiring, not deleting. Reports reference crossings, and that history is the
audit trail that makes abuse review possible; `is_active = false` takes the crossing out of the
map, nearest-crossing selection and the route logic immediately, which is what an operator means
by remove.

**Note on what is NOT verified.** The editor builds and lints clean, but has not been opened in a
browser — no Chrome connection was available in this environment. Dragging the marker, saving, and
seeing the driver map update is a manual pass still outstanding.

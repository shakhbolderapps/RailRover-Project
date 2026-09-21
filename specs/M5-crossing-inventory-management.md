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
| 1 | ☐ Not built. Add/edit/remove and coordinate correction need the MapLibre GL editor; the panel currently covers report review, user management, broadcasts and analytics | ☐ |
| 2 | ☐ Not built — see above | ☐ |
| 3 | ◐ The mechanism is proven: `020-crossings-schema.sql` → "M5: a coordinate correction is visible through crossing_status immediately", because every reader queries the same table. The admin UI to perform the edit does not exist yet | ◐ |
Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on what is missing.** This is the one M5 feature not built in Phase 8. It needs a MapLibre
GL JS editor with a draggable marker, and the admin-write RLS policy it depends on already exists
(`crossings_admin_write`). Recorded as not done rather than folded into a partial claim.

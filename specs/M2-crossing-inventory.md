# M2 — Crossing Inventory

> **Module 2: Crossing Map**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

Known railroad crossings for the pilot area are compiled by Bolder Apps from public crossing data, each with its location, road, and city, forming the static set of crossings the app tracks. The pilot covers an approximately 200-mile radius around Toledo, Ohio, and you do not need to supply a crossing list.

## User Flow

1. Bolder Apps compiles the pilot crossing set from public data before launch.
2. System stores each crossing with its identifier, name, location, road, and city.
3. System serves crossings to the map and to the report and route logic.
4. Platform staff correct or extend the inventory through the Web Admin Panel.

## Edge Cases

- A compiled crossing has an inaccurate location -> Platform staff correct its coordinates in the Web Admin Panel so reports and route checks stay accurate.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. The pilot crossing set is compiled from public data with identifier, name, location, road, and city for each crossing.
2. Crossings are scoped to the pilot coverage area, an approximately 200-mile radius around Toledo.
3. The inventory is the single source the map, reporting, and route logic read from.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | `scripts/src/fra.test.ts` → "M2-AC1: maps identifier, name, location, road and city" + "dot_id is the FRA crossing ID"; `supabase/tests/020` → dot_id uniqueness ⧗ | ◐ |
| 2 | `fra.test.ts` → "M2-AC2: scopes the query to a radius around the pilot centre" + "the radius is parameterised". **Ships at 50 mi for development; the contracted 200 mi is a one-flag change before pilot launch** (ADR 0008) | ◐ |
| 3 | `supabase/tests/020-crossings-schema.sql` → "M5: a coordinate correction is visible through crossing_status immediately" ⧗ | ⧗ |

Legend: ✅ covered · ◐ partially covered (see note) · ⧗ assertion written but never executed · ☐ not yet written

**Note on criterion 2.** Deliberate divergence, recorded in ADR 0008: the ingest defaults to a
50-mile radius so development cycles stay fast, and expands to the SOW's 200 with `--radius 200
--yes`. Measured against the live FRA API:

| | 50-mi | 200-mi |
|---|---:|---:|
| raw records in radius | 3,925 | 34,602 |
| usable after filtering | **1,696** | **13,096** |

**Note on the grade-separated filter.** Not a numbered criterion, but risk-register item #2 and
the single most consequential thing in this spec. 57–62% of the raw inventory is dropped:
grade-separated (an overpass can never be blocked), private, closed, and pedestrian crossings.
Asserted twice — in `fra.test.ts` for the ingest filter, and as a `CHECK (is_at_grade)` constraint
in the schema so a bad ingest or a manual insert cannot bypass it.

**⧗ means written but never run.** No database exists yet (ADR 0007), so every pgTAP assertion
here is unverified.

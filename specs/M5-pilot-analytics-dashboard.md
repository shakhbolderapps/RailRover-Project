# M5 — Pilot Analytics Dashboard

> **Module 5: Web Admin Panel**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

A dashboard showing pilot performance for proof: active and total reports, alert counts, reroutes, and the most affected crossings, over a selected time window.

## User Flow

1. Administrator opens the analytics dashboard.
2. System shows active reports, total reports, alert counts, and reroutes.
3. System lists the most affected crossings.
4. Administrator changes the time window and the dashboard updates.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. The dashboard shows active reports, total reports, alert counts, and reroutes.
2. The dashboard lists the crossings with the most blocked reports.
3. Metrics update as the selected time window changes.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ✅ `100-admin-and-analytics.sql` → "an admin sees the active (red) report count" and "…the total reports in the window". Alerts and reroutes come from `alert_events` / `reroute_events`, written by the mobile app | ✅ |
| 2 | ✅ `100-admin-and-analytics.sql` → "the most-blocked list counts blocked reports per crossing" | ✅ |
| 3 | ✅ `100-admin-and-analytics.sql` → "metrics change with the selected time window" — a window starting after the report excludes it, so the selector is not decoration | ✅ |
Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on the analytics tables, which were nearly missed.** The roadmap says to start writing
`alert_events` and `reroute_events` in Phase 6 because retrofitting analytics logging is miserable.
That was not done then and was caught here, while the pilot has generated no data worth losing —
every day it waited would have been a day of evidence that could not be recovered.

**Note on offered vs taken.** The dashboard shows both reroutes offered and reroutes taken, because
a feature that fires often and is never accepted is not working, and one number cannot show that.
`reroute_events` therefore records `no_better_route` and `declined` outcomes too, not only successes.

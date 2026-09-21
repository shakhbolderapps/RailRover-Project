# M5 — Report Review and User Management

> **Module 5: Web Admin Panel**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

Internal platform staff review submitted blocked and clear reports, remove inaccurate or abusive reports, and manage driver accounts, including suspending a driver who submits false reports.

## User Flow

1. Administrator opens the report review queue.
2. System lists recent reports with crossing, status, time, and reporter reference.
3. Administrator removes an inaccurate report or flags a reporter.
4. Administrator searches driver accounts and suspends an abusive reporter where needed.

## Edge Cases

- A driver submits repeated false reports -> System lets staff suspend the account and discount its reports.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. The queue lists recent reports with crossing, status, timestamp, and reporter reference.
2. An administrator can remove an inaccurate report and its effect on crossing state.
3. An administrator can search, suspend, or reinstate driver accounts.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ✅ `100-admin-and-analytics.sql` → "an ADMIN can remove a report"; the panel lists recent reports newest-first, including already-removed rows for audit | ✅ |
| 2 | ✅ `100-admin-and-analytics.sql` → "removing the only report reverts the crossing — no cache to invalidate". See note | ✅ |
| 3 | ✅ `100-admin-and-analytics.sql` → "an ADMIN can suspend a device" and "the device is suspended afterwards, so submit_report will refuse it", which closes the loop with `060-submit-report.sql`'s `device_suspended` rejection | ✅ |
Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on why removal needs no invalidation.** The crossing's colour was never stored — it is a
view over live reports (ADR 0002) — so a removed report changes the answer on the next read with
nothing to expire. This is the payoff for a decision made in Phase 1 that looked like extra work
at the time.

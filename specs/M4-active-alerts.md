# M4 — Active Alerts

> **Module 4: Route Conflict and Alerts**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

A list of the blocked crossings currently relevant to the driver, with crossings on the active route shown first, so the driver can review and act on them in one place.

## User Flow

1. Driver opens the active alerts list.
2. System lists fresh blocked crossings relevant to the driver.
3. System orders on-route crossings first.
4. Driver taps a crossing to view its detail or to reroute.

## Edge Cases

- No crossings are currently relevant -> System shows an empty state.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. The list shows fresh blocked crossings relevant to the driver.
2. Crossings on the active route are shown first.
3. Tapping a crossing opens its detail.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ✅ `apps/mobile/src/lib/active-alerts.test.ts` → "M4-ActiveAlerts-AC1: only RED crossings appear among the nearby ones" and the empty-state case | ✅ |
| 2 | ✅ `active-alerts.test.ts` → "on-route crossings come before merely nearby ones" and "on-route conflicts are ordered nearest-first" | ✅ |
| 3 | ◐ `components/ActiveAlerts.tsx` opens the crossing's detail on tap. Built, not yet exercised on a device | ◐ |

Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on the ordering.** AC2 is not cosmetic. A crossing on the driver's route will affect their
journey; one two streets away will not, and interleaving them buries the ones that matter.

**Note on a crossing the map has not loaded.** An on-route conflict can sit far outside the current
viewport, so no detail row exists for it. Tapping such an entry leaves the list open rather than
opening an empty sheet — fetching the crossing on demand is the better fix and is not done yet.

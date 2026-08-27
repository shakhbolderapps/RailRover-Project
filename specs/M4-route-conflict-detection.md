# M4 — Route Conflict Detection

> **Module 4: Route Conflict and Alerts**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

When a route is active, the app continuously determines whether any crossing with a fresh blocked report sits on the route ahead of the driver, so the driver is warned and rerouted proactively rather than at the last moment. A crossing counts as on the route when it lies within a configurable corridor of the route line, starting at 200 feet. That corridor width decides whether a crossing is on the route; it is not how far ahead the driver is warned.

## User Flow

1. System takes the active route line and the driver position.
2. System loads crossings within the route bounding box plus the corridor.
3. System keeps crossings whose distance to the route line is within the corridor, starting at 200 feet.
4. System removes crossings already behind the driver and orders the rest by distance ahead.
5. System checks the remaining crossings for blocked reports still inside the freshness window, starting at 15 minutes.
6. System flags any fresh blocked crossing ahead on the route, however far ahead, and computes an alternate route in the background so a reroute is ready.

## Edge Cases

- A blocked report ages past the freshness window -> System stops treating the crossing as an active red conflict and shows it yellow.
- A crossing sits outside the route corridor -> System excludes it so off-route crossings do not trigger alerts.
- A new blocked report is submitted while a trip is already active -> System updates the active route check in real time, not only from the data present when the trip started.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. The 200-foot value is the configurable route corridor width that decides whether a crossing is on the route.
2. A fresh blocked crossing anywhere ahead on the active route is flagged, not only when the driver is near it.
3. Crossings behind the driver are excluded and the rest are ordered by distance ahead.
4. Only blocked reports inside the configurable freshness window, starting at 15 minutes, count as active.
5. New reports submitted during an active trip update the route check in real time.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | `config.test.ts` → "SOW §7: the route corridor default is 200 feet, stored as ~60.96 metres" + the guard that the corridor and report radius cannot be swapped | ✅ |
| 2 | _not yet written_ — **must include a crossing 5 km ahead** (ADR 0003). Phase 6a | ☐ |
| 3 | _not yet written_ — `conflicts_ahead()` ordering, Phase 6a | ☐ |
| 4 | ◐ `crossing-status.test.ts` → "M4-AC4: only a FRESH blocked crossing counts as an active conflict" and "a crossing aged to yellow stops being an active red conflict"; the SQL filter is Phase 6a | ◐ |
| 5 | _not yet written_ — realtime re-check during an active trip, Phase 6b | ☐ |

Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on criterion 1.** Risk-register item #1 is misreading 200 ft as an alert distance. The
config test pins the value and its units; ADR 0003 records why; criterion 2's test (a crossing
5 km ahead, asserted to be flagged) is what actually proves the misreading has not happened.
Until that test exists, criterion 2 is genuinely unproven — hence ☐, not ◐.

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
| 1 | ✅ `supabase/tests/080-conflicts-ahead.sql` → "M4-AC1 edge case: a crossing 300 m off the line does not trigger an alert", "the corridor is configurable — at 500 m the off-route crossing comes onto the route", and "with no explicit corridor the width comes from app_config" | ✅ |
| 2 | ✅ `080-conflicts-ahead.sql` → "M4-AC2: a fresh blocked crossing ~14 km ahead is flagged — warning is not proximity-gated", plus a companion assertion proving the fixture really is >10 km away. `route-simulator.test.ts` → "alerts for a blocked crossing far ahead, long before the driver reaches it" | ✅ |
| 3 | ✅ `080-conflicts-ahead.sql` → behind-driver exclusion, nearest-first ordering, and monotonic `meters_ahead`. `route-simulator.test.ts` → "stops alerting once the driver has passed the crossing" | ✅ |
| 4 | ✅ `080-conflicts-ahead.sql` → "a blocked report aged past the freshness window is no longer a conflict" and "the freshness window is configurable". `route-simulator.test.ts` → "clears the alert when the crossing is reported clear" | ✅ |
| 5 | ✅ `080-conflicts-ahead.sql` → "a report submitted DURING the trip immediately changes the conflict set". `route-simulator.test.ts` → "notices a report submitted mid-trip, not only what was known at departure" | ✅ |

Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on why each filter is asserted separately.** conflicts_ahead applies three filters —
corridor, ahead-of-driver, fresh-blocked — and a suite that only checks "the right crossing came
back" passes just as happily when two of them are broken in compensating ways. Each therefore has
its own assertion with the other two held constant.

**Note on the route simulator.** `src/stores/route-simulator.ts` replays a trip through the real
conflict store: the driver advances, reports arrive at scripted steps, and the alert is observed
over time. It exists because these are behaviours rather than answers — "fires once, not on a
loop", "notices a mid-trip report", "clears on a clear report" — and a single-shot query test
cannot see any of them. The roadmap's Phase 6 QA gate calls it worth more than every other test in
the project; the alternative is driving around Ohio while a colleague files reports by phone.

**Note on what is NOT verified.** The alert has not been seen on a device with a real trip in
progress, because that needs either a drive or a GPX replay wired into the app's location layer.
The store's behaviour is covered by the simulator and the SQL by pgTAP; what remains unproven is
the rendering, and the reroute against live ORS.

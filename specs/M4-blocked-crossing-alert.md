# M4 — Blocked Crossing Alert

> **Module 4: Route Conflict and Alerts**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

When a fresh blocked crossing is found ahead on the route, the app warns the driver with the crossing name or road, the time of the last report, and an estimated time to the crossing when available. With auto-reroute on, the default, the app begins rerouting around the crossing after a short preview countdown the driver can cancel to stay on course; with auto-reroute off, the alert offers reroute, keep current route, and view crossing.

## User Flow

1. System detects a fresh blocked crossing ahead on the active route.
2. System presents the alert with the crossing name or road and the last report time.
3. System shows an estimated time to the crossing when it can be calculated.
4. With auto-reroute on, a short preview countdown begins and the app reroutes unless the driver cancels; with it off, the driver chooses reroute, keep current route, or view crossing.

## Edge Cases

- The crossing is reported clear before the driver reaches it -> System updates or dismisses the alert.
- Several blocked crossings sit ahead -> System surfaces the nearest one first and lists the rest in active alerts.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. An alert fires when a fresh blocked report sits on the route ahead of the driver.
2. The alert shows the crossing name or road and the last report time.
3. With auto-reroute on, the app reroutes after a short preview countdown the driver can cancel; with it off, the alert offers reroute, keep current route, and view crossing.
4. The alert clears when the crossing is reported clear or the driver passes it.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | _not yet written_ | ☐ |
| 2 | _not yet written_ | ☐ |
| 3 | _not yet written_ | ☐ |
| 4 | _not yet written_ | ☐ |

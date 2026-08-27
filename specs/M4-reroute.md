# M4 — Reroute

> **Module 4: Route Conflict and Alerts**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

When a blocked crossing is detected ahead, the app generates an alternate route that avoids it, computed in the background so the alternate is ready the moment the driver is alerted. Because avoiding a single point is not a built-in routing capability, the app constructs an avoidance area or alternate waypoints and requests a new route. This is a route-avoidance heuristic on top of the routing service, not turn-by-turn voice navigation. With auto-reroute on, the alternate is applied automatically after a short preview the driver can cancel.

## User Flow

1. System computes an alternate route around the blocked crossing in the background.
2. System builds the alternate by constructing an avoidance area or alternate waypoints and re-requesting the route.
3. With auto-reroute on, the app applies the alternate after a short preview countdown; with it off, the driver chooses to accept it.
4. System shows the alternate route and the reason it may be better.

## Edge Cases

- No reasonable alternate route exists -> System tells the driver no better route was found and keeps the current route.
- The alternate route passes another blocked crossing -> System evaluates the alternate against the same conflict logic before applying it.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. A reroute produces an alternate route that avoids the blocked crossing, computed in the background.
2. With auto-reroute on, the alternate applies automatically after a short preview countdown the driver can cancel; with it off, the driver accepts it.
3. The alternate route is presented with the reason it may be better, and the MVP avoids the single alerted crossing, not multiple crossings at once.
4. The system handles the case where no better alternate exists.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ◐ `geo.test.ts` → "avoidancePolygon returns a closed ring" / "stays far inside ORS limits"; background computation and the ORS call are Phase 6d | ◐ |
| 2 | _not yet written_ — preview countdown and auto-reroute preference, Phase 6c/6d | ☐ |
| 3 | _not yet written_ — MVP avoids ONE crossing; alternate must be re-checked through `conflicts_ahead` before being offered. Phase 6d | ☐ |
| 4 | ◐ `FixtureRoutingAdapter` models "no better alternate exists" as a `null` return; the UI path is Phase 6d | ◐ |

Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on criterion 4.** `getRouteAvoiding()` returning `null` is the normal representation of
"no reasonable alternate exists", not an exception (ADR 0009), so the SOW's requirement to keep
the current route and say so plainly is a handled path rather than an error case.

**Note on the "same route back" failure.** `avoidancePolygon` is tested to widen strictly, which
is the retry-once path for a polygon too small to force a detour.

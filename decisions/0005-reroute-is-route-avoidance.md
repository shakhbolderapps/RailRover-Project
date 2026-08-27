# ADR 0005 — Reroute is route-avoidance, not turn-by-turn navigation

- **Status:** Accepted
- **Date:** 2026-08-25
- **Implements:** SOW M4 "Reroute"

## Context

SOW M4 is candid that this is a heuristic:

> "Because avoiding a single point is not a built-in routing capability, the app constructs an
> avoidance area or alternate waypoints and requests a new route. This is a route-avoidance
> heuristic on top of the routing service, **not turn-by-turn voice navigation**."

## Decision

Build a square avoidance polygon around the blocked crossing (~300 m per side) and re-request the
route with ORS `avoid_polygons`. RailRover does not become a navigation app: no voice guidance, no
lane guidance, no continuous re-snapping.

Sequence, per the SOW:

1. Compute the alternate **in the background, before the driver is alerted**, so it is ready the
   instant the alert fires.
2. Run the alternate through `conflicts_ahead()` **before offering it** — never reroute a driver
   into a second blocked crossing.
3. With auto-reroute ON (the default), apply after a short preview countdown the driver can cancel.
   With it OFF, offer reroute / keep current route / view crossing.
4. If the polygon is too small to force a detour, **widen once and retry**, then stop.
5. If no reasonable alternate exists, keep the current route and **say so plainly**.

**MVP avoids ONE crossing, not several** (SOW M4 AC3).

## Consequences

- ORS constraints respected: polygon ≤ 200 km² and ≤ 20 km per side (a 300 m square is trivially
  inside); total route ≤ 150 km when avoid areas are used. The over-limit case surfaces an honest
  error rather than an endless spinner.
- "Reroute returned the same route" is a real failure mode when the polygon does not straddle
  enough of the road network — hence widen-and-retry, and hence a test asserting the returned
  alternate does not pass through the avoided crossing.
- Because it is a heuristic, the alternate is presented **with the reason it may be better**
  (SOW M4 AC3), not as an instruction.
- RailRover "provides informational guidance and warnings only. It does not control the vehicle"
  (SOW §8). The reroute UI must not read as a command.

# ADR 0003 — 200 feet is the route corridor WIDTH, not an alert distance

- **Status:** Accepted
- **Date:** 2026-08-25
- **Implements:** SOW §7 "Route Conflict Logic", M4 "Route Conflict Detection" AC1–AC2
- **Risk register:** item #1

## Context

The SOW says, twice:

> "A crossing counts as on the route when it lies within a configurable corridor of the route
> line, starting at 200 feet. That corridor width decides whether a crossing is on the route; it
> is **not** how far ahead the driver is warned."

and

> "A fresh blocked crossing anywhere ahead on the active route is flagged, **not only when the
> driver is near it**."

The SOW repeats it because the misreading is natural: 200 feet sounds like a proximity trigger.

## Decision

Two separate concepts, never conflated:

| Concept | Value | Role |
|---|---|---|
| `route_corridor_meters` | ≈60.96 m (200 ft) | Perpendicular distance from the route line inside which a crossing counts as being ON the route |
| *(no such value exists)* | — | There is **no** distance-to-alert threshold |

If a fresh blocked crossing is on the route and ahead of the driver, it is flagged — 200 metres
ahead or 40 kilometres ahead. Early warning is the product's entire value: a driver warned 200
feet from a blocked crossing has already lost.

## Consequences

- Stored in **metres** in `app_config`; feet are display-only. Conversion lives in exactly one
  place, `packages/shared/src/config.ts`.
- Named `ROUTE_CORRIDOR_METERS` / `route_corridor_meters` — never `alertDistance`, never
  `warnRadius`, never `proximityThreshold`. The name is part of the guardrail.
- `conflicts_ahead()` has **no** distance ceiling in its WHERE clause. Only three filters:
  inside the corridor, ahead of the driver, colour = red.
- Tested explicitly with a crossing **5 km ahead** on the route, asserting it is returned.
  A test that only ever places crossings nearby cannot catch this regression.
- `metersAhead` is still computed and returned — for ordering (nearest first) and for the "time to
  crossing" the alert shows. It is never used to suppress an alert.

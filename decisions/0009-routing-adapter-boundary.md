# ADR 0009 — All routing goes through an adapter interface

- **Status:** Accepted
- **Date:** 2026-08-25
- **Risk register:** "ORS 2,000/day cap during a real pilot"

## Context

OpenRouteService's free tier allows 2,000 directions/day and 40/minute. RailRover calls routing on
destination search (up to 3 alternatives), and again on every reroute. A pilot with a handful of
active drivers plus a CI suite that routes on every push would exhaust that.

Separately, the SOW's contracted stack is Google Directions. If the client funds that account, the
provider changes.

## Decision

App code depends on the `RoutingAdapter` interface in `packages/shared/src/routing`, never on a
provider:

```ts
interface RoutingAdapter {
  getRoutes(origin, destination, options): Promise<RawRoute[]>
  getRouteAvoiding(origin, destination, avoidPolygon, options): Promise<RawRoute | null>
}
```

Implementations:

| Adapter | Used by |
|---|---|
| `OpenRouteServiceAdapter` | production / manual dev |
| `FixtureRoutingAdapter` | **all automated tests** — deterministic, offline, zero quota |
| `LocalValhallaAdapter` (future) | dev + CI once Docker exists (ADR 0007) |
| `GoogleDirectionsAdapter` (future) | if the client funds Google Maps Platform |

`getRouteAvoiding` returning `null` is the **normal** representation of "no better alternate
exists" — a case SOW M4 requires be handled by keeping the current route and saying so. It is not
an exception.

## Consequences

- Tests never spend quota and never depend on the network. This is what makes the Phase-6 route
  simulator repeatable.
- Quota exhaustion is a typed, handleable outcome: `quota_exceeded_daily` (403) and
  `quota_exceeded_rate` (429) are distinct `RoutingError` codes, so the app can back off and tell
  the driver something true instead of hanging. Required by roadmap §11.
- `remainingQuota` is read from the `x-ratelimit-remaining` header so quota can be monitored
  before it runs out mid-pilot.
- Swapping providers is one file. The SOW's original Google stack stays a funded-decision away,
  not a rewrite away.

## Never

Never call ORS, Photon or Nominatim directly from `apps/mobile` or `apps/admin`.

# M1 — Location Permissions and Live Location

> **Module 1: Foundation**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

The app requests location permission and tracks the driver's live position during an active trip so it can place the driver on the map, find the nearest crossing for a report, and check crossings ahead on the route. The location layer is built so always-on background tracking can be enabled in a later phase without rework.

## User Flow

1. On first use, the app explains why it needs location and requests permission.
2. Driver grants location access for use while the app is active.
3. System tracks the driver position during an active session and centers the map on it.
4. System uses live position to auto-select the nearest crossing for reports and to evaluate crossings ahead on the route.

## Edge Cases

- A driver denies location permission -> System explains that route alerts and nearest-crossing reporting need location, and offers a path to enable it in settings.
- Location signal is temporarily lost -> System holds the last known position and resumes when the signal returns.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. The app requests location permission with a clear purpose string before any tracking begins.
2. Live position updates while the app is active and drives map centering and nearest-crossing selection.
3. The location layer is structured so always-on background tracking can be enabled in a later phase.
4. Location data handling follows the privacy disclosures presented at permission time.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ✅ `stores/location.test.ts` → "M1-Location-AC1: requests permission BEFORE any tracking begins" (asserted by invocation order, not by reading the code) and "…does NOT start tracking when permission is refused". The purpose strings themselves are in `app.config.ts` for both platforms and are checked by `pnpm parity` | ✅ |
| 2 | ✅ `stores/location.test.ts` → "M1-Location-AC2: live updates replace the position as the driver moves"; the map consumes the same store, and `trackUserLocation` on the MapLibre camera does the centring | ✅ |
| 3 | ✅ `lib/location.ts` defines the `LocationService` interface every consumer depends on; `stores/location.test.ts` substitutes a fake implementation, which is only possible *because* nothing imports expo-location directly. See note | ✅ |
| 4 | ◐ No assertion — this is a claim about conduct, not behaviour. See note | ◐ |

Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on criterion 3.** "Structured so always-on background tracking can be enabled in a later
phase" is an architectural claim, and the test suite is the evidence for it: the location store is
tested against a hand-written fake, which is only possible because consumers depend on the
`LocationService` interface rather than on expo-location. Adding background tracking means writing
a second implementation behind that interface and changing which one is bound — no screen, store
or report flow changes. A component that called `Location.watchPositionAsync` directly would
quietly destroy that property, and the tests would stop compiling, which is the point.

**Note on criterion 4.** "Location data handling follows the privacy disclosures presented at
permission time" cannot be asserted from inside the app — it is a statement about what we do with
the data, not about what the code does. What holds today: the position is used for map centring
and is sent to the server only as `reporter_geom` on a submitted report (kept for abuse review per
ADR 0004). It is never logged, never stored locally, and no background tracking is enabled on
either platform. Revisit when background location or analytics lands.

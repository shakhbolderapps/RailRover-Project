# M4 — Destination Search and Route Options

> **Module 4: Route Conflict and Alerts**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

A driver enters a destination and the app offers route options drawn on the map. Alongside travel time, each option shows how many crossings it passes and how many are currently blocked, so the driver can choose a route that avoids crossings. The driver previews the options before selecting, and the chosen route becomes the active route the alert logic checks against.

## User Flow

1. Driver enters a destination in the search field.
2. System geocodes the destination and requests route options.
3. System draws the options on the map and labels each with travel time, total crossings, and currently blocked crossings, with color-coded crossing markers.
4. Driver previews the options and selects one.
5. System sets the chosen route as active for crossing checks.

## Edge Cases

- A destination cannot be found -> System asks the driver to refine the search.
- No route is available -> System tells the driver a route could not be generated.
- Two routes have a similar time but different crossing counts -> System surfaces the crossing counts so the driver can trade a little time for fewer crossings.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. A driver can enter a destination and see route options drawn on the map.
2. Each route option shows travel time, the number of crossings on it, and the number currently blocked.
3. A driver can preview the options before selecting one, and the selected route becomes active for the route conflict logic.
4. Route requests handle a not-found destination and a no-route result gracefully.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ◐ `packages/shared/src/geocoding.test.ts` → label composition and `[longitude, latitude]` parsing; destination entry verified on the Pixel 7 emulator against the live Photon instance ("Toledo Zoo" → five real suggestions). Route **drawing** is built but unverified — see note | ◐ |
| 2 | ◐ `supabase/tests/070-crossings-on-route.sql` (11 assertions) proves the corridor query the counts are built on, including a crossing 5 km along the route. The route cards render time, total and blocked, but have not been seen with real routes — see note | ◐ |
| 3 | ◐ `stores/route.ts` holds the selected option as the ACTIVE route and `selectActiveRoute` is what Phase 6 will read. Unverified end to end — see note | ◐ |
| 4 | ◐ `apps/mobile/src/lib/routes.test.ts` → not-found, no-route, both quota limits, and "never surfaces a raw upstream error string". The missing-key path was verified on device; the genuine ORS failure codes have not been exercised against the live service | ◐ |

Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on why these are all partial.** Everything except live routing is built and verified:
destination search runs against the real Photon instance, and the crossing-corridor query has 11
pgTAP assertions against the real database. What is missing is an **OpenRouteService API key** —
free and self-service, but absent from this build, so no real route has ever been fetched. The app
says so plainly rather than failing generically. These move to ✅ once a key exists and a known
Toledo A→B pair returns 2–3 options with differing crossing counts, verified against the map.

**Note on the edge case worth watching.** "Toledo" is ambiguous: Photon's location bias is soft,
and a search from Toledo, Ohio still returns results in Toledo, Spain. Harmless but odd-looking,
and specific to this pilot city. Worth a bounding-box filter before the pilot if it bothers
drivers; not worth pre-emptively constraining a driver's legitimate long-distance destinations.

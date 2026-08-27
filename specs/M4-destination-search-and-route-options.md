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
| 1 | _not yet written_ | ☐ |
| 2 | _not yet written_ | ☐ |
| 3 | _not yet written_ | ☐ |
| 4 | _not yet written_ | ☐ |

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
| 1 | _not yet written_ | ☐ |
| 2 | _not yet written_ | ☐ |
| 3 | _not yet written_ | ☐ |
| 4 | _not yet written_ | ☐ |

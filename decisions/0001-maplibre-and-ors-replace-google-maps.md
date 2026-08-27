# ADR 0001 — MapLibre + OpenRouteService replace Google Maps Platform

- **Status:** Accepted
- **Date:** 2026-08-25
- **Deviates from SOW:** yes, §7 "Mapping and Routing" and the Technology Stack table

## Context

The SOW specifies Google Maps SDK and Directions API for map display, geocoding, route options
and rerouting. Every one of those requires a **billing-enabled** Google Cloud account, which the
SOW lists as a client dependency ("A Google Maps Platform account with billing enabled is
provided under your ownership before related development begins").

Development is proceeding under a zero-cost constraint, and that account does not exist yet.

## Decision

Build against keyless / free-tier equivalents, behind adapters:

| Need | Replacement |
|---|---|
| Map display | MapLibre + OpenFreeMap tiles (no API key; attribution required) |
| Route options + alternatives | OpenRouteService free key — 2,000/day, 40/min, `alternative_routes` up to 3 |
| Reroute around a point | ORS `avoid_polygons` |
| Destination typeahead | Photon |
| Destination resolve | Nominatim (≤1 req/s, descriptive User-Agent) |

## Consequences

- **Rerouting is actually better served here than by the SOW's stack.** ORS exposes
  `avoid_polygons` directly; Google has no avoid-a-point primitive, which is why SOW M4 hedges
  about "constructing an avoidance area or alternate waypoints". See ADR 0005.
- ORS's daily cap is a real production risk for a live pilot. Mitigated by ADR 0009 (adapter
  boundary, fixture/local routing in tests, quota monitoring, graceful 403/429 handling).
- Nominatim will block an abusive IP with no warning. Photon handles typeahead; Nominatim is
  called only to resolve a final selection.
- Attribution for OpenFreeMap/OSM must appear in the app and admin panel.
- **This is reversible in one file each.** If the client funds a Google Maps account, swap the
  `RoutingAdapter` implementation and the map component; nothing else changes.

## Client action required

None to proceed. But the SOW's stated stack now differs from what is built — flag it in the next
client update so the deviation is agreed rather than discovered.

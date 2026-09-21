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
| Destination resolve | Photon returns coordinates directly — Nominatim dropped, see update below |

## Update, 2026-09-21 — measured, not assumed

Two things in the table above turned out to be wrong once a real key existed and real calls were
made:

- **The free quota is 200/day, not 2,000.** A live call returned `x-ratelimit-limit: 200`. That is
  10× less headroom than this ADR assumed, and it lands directly on the risk already recorded
  below. One route request with alternatives is one call, and a reroute is another, so a pilot
  with even a handful of active drivers will feel it. **Raise with the client before pilot
  launch**: either a higher ORS tier or the self-hosted Valhalla that ADR 0009's adapter boundary
  already makes a drop-in swap.
- **Nominatim is not used at all.** Photon returns coordinates in the feature geometry, so the
  resolve step bought nothing while taking on Nominatim's 1 req/s policy and its habit of blocking
  IPs without warning. Removing it removes the risk rather than managing it.

Verified working at the same time: a Sylvania → Oregon request returned three options passing 2, 3
and 5 crossings — two of them at identical travel times. That is the SOW's "similar time,
different crossing counts" edge case occurring naturally on the first realistic pair tried, which
is the clearest evidence so far that the feature is worth having.

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

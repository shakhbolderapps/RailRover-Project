# ADR 0002 — Crossing status is computed at read time, never stored

- **Status:** Accepted
- **Date:** 2026-08-25
- **Implements:** SOW M2 "Home Map and Crossing Markers", M2 "Crossing Detail" edge case,
  M3 "Report Clear" AC2

## Context

Each crossing displays as red, yellow or green:

- **red** — a fresh blocked report
- **yellow** — a blocked report aged past the freshness window with no clear report
- **green** — a clear report was received; the SOW states "status returns to green only on a
  clear report, not on a timer"

The obvious implementation is a `color` column updated on write.

## Decision

**Never store the colour.** It is a pure function of
`(latest report status, latest report timestamp, now, freshness_window)`, computed by:

- the `crossing_status` SQL view (authoritative, used by map/report/route logic), and
- `computeCrossingColor()` in `packages/shared` (client mirror, for optimistic UI and tests).

Both implement the same rules and are tested against the same SOW criteria.

Additionally: **`unknown` is a fourth state.** A crossing with no reports is *unconfirmed*, not
clear. SOW M2's Crossing Detail edge case says such a crossing "shows as unconfirmed with no
recent report time". Green means *someone confirmed it clear*. Collapsing these would tell drivers
a crossing is clear when nobody has ever looked at it — the exact failure that would destroy trust
in a crowd-sourced product.

## Consequences

- No background job is needed to flip red → yellow at the 15-minute boundary. It happens for free.
- The freshness window stays **genuinely configurable**, which the SOW requires: these defaults
  "ship at these defaults and are tuned during the pilot". A stored colour would need a full
  recompute on every tuning change.
- Two implementations of one rule is a real duplication risk. Mitigated by testing both against
  the same acceptance criteria, and by keeping the client copy pure and injectable (`now` is a
  parameter, never `Date.now()` internally).
- The map query reads a view, not a table. Indexed on `reports (crossing_id, reported_at desc)`
  to keep the lateral join cheap.

## Never

- Never add a `color`/`status` column to `crossings`.
- Never write a cron job that ages reports.
- Never let a crossing reach green without a clear report.
- Never collapse `unknown` into `green`.

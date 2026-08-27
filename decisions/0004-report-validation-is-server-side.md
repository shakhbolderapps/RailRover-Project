# ADR 0004 — Report distance and rate-limit checks are server-side

- **Status:** Accepted
- **Date:** 2026-08-25
- **Implements:** SOW M3 AC2/AC5, §7 "Security"

## Context

SOW M3 limits reporting to crossings within about a mile of the driver, and requires report
submission to be rate-limited per device to deter spam. A crowd-sourced status product is only as
trustworthy as its write path; a false blocked report reroutes real drivers.

## Decision

Reports are submitted through a **Postgres RPC (`submit_report`)**, never a raw client insert.
The RPC performs, in order:

1. Load the crossing and the live `app_config`.
2. Reject if `ST_Distance(crossing.geom, driver_point) > report_radius_meters`.
3. Reject if this device exceeded the rate limit in the window.
4. Reject if the device or account is suspended.
5. Insert the report.
6. Return the recomputed `crossing_status` row.

Row Level Security is enabled from the first migration. Anonymous sessions may `select` crossings
and call `submit_report`, but may not `insert` into `reports` directly, may not `update` crossings,
and may not soft-delete reports. Only `profiles.role = 'admin'` may do those.

## Consequences

- A client-side radius check is **decoration** — kept only to give instant feedback, never trusted.
  The UI must handle server rejection even when its own check passed.
- `reporter_geom` is stored on each report so an administrator reviewing abuse can audit the
  distance claim after the fact.
- pgTAP tests assert that an anon key **cannot** update a crossing or hard-delete a report. A
  security control with no test is a hope.
- Rejection returns a typed reason (`too_far_from_crossing`, `rate_limited`, …) so the UI can say
  something true. "Too far to report" is not the driver's error — it means *you can't see this
  crossing from here* — and must be worded that way.

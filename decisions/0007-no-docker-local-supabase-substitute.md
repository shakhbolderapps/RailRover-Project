# ADR 0007 — No Docker on this machine: hosted Supabase for dev, fixture routing for tests

- **Status:** Accepted (revisit when Docker is installed)
- **Date:** 2026-08-25
- **Deviates from roadmap:** yes, Phase 0 tasks 3 and 5

## Context

The roadmap's Phase 0 assumes Docker for two things:

1. `supabase start` — a local Postgres+PostGIS as the real dev environment.
2. A local Valhalla or OSRM container, so automated routing tests never spend the ORS quota.

**Docker is not installed on this machine**, and neither is any substitute (colima, podman,
OrbStack).

## Decision

Proceed without Docker, in a way that makes adopting it later a no-op:

- **Database:** use the **hosted Supabase free project** for development. All schema lives in
  `supabase/migrations/` as ordinary SQL, applied with `supabase db push`. Nothing about the
  migrations assumes hosted or local — the day Docker exists, `supabase start` + `supabase db
  reset` works against the same files.
- **Routing in tests:** bind `FixtureRoutingAdapter` instead of ORS. Because app code depends on
  the `RoutingAdapter` interface (ADR 0009), tests never touch the network and never spend quota.
  A `LocalValhallaAdapter` can be added behind the same interface once Docker exists, changing
  neither the app nor the tests.
- `scripts/routing-up.sh` is written and checked in, and **fails with a clear message** explaining
  the Docker prerequisite rather than pretending to work.

## Consequences

- **Cost:** the hosted free project becomes the shared dev database. Two real limits follow:
  it **auto-pauses after 7 days of inactivity** (mitigated by a daily GitHub Actions cron ping),
  and there is no throwaway `db reset` — destructive migration testing needs care.
- **pgTAP tests** need a Postgres to run against. Until Docker exists they run against the hosted
  project in a dedicated schema, in CI only on non-destructive migrations. This is the weakest
  part of the current setup and is the first thing to fix when Docker lands.
- Installing Docker Desktop or colima is a ~10 minute task and materially improves the loop.
  **Recommended, not required.** Tracked as an open item, not silently worked around.

## Revisit when

Docker or colima is installed. At that point: switch dev to `supabase start`, add
`LocalValhallaAdapter`, move pgTAP into CI properly, and supersede this ADR.

## Update, 2026-09-21

Docker Desktop is now installed. `supabase test db --linked` runs the pg_prove harness in a
container against the **hosted** project — the pgTAP suite is no longer unverified; all 69
assertions across 6 files pass. This partially resolves the "pgTAP tests need a Postgres to run
against" consequence above without the fuller revisit (switching dev to `supabase start`,
adding `LocalValhallaAdapter`) — that remains open and this ADR remains otherwise Accepted.

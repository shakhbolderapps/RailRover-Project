# Supabase — schema, functions, tests

## How this is applied

Migrations are ordinary SQL in `migrations/`, applied in filename order.

```bash
npx supabase link --project-ref <ref>   # once
npx supabase db push                    # apply pending migrations
```

**Docker is not installed on this machine**, so `supabase start` (local Postgres) is unavailable
and the hosted free project is the development database. See
[`decisions/0007`](../decisions/0007-no-docker-local-supabase-substitute.md). Nothing in these
migrations assumes hosted or local — when Docker arrives, `supabase start && supabase db reset`
works against the same files.

## Free-tier facts that shape the design

| Limit | Value | Consequence |
|---|---|---|
| Projects | 2 | one dev, one prod/demo |
| Database | 500 MB | fine for the pilot crossing set |
| Auto-pause | **after 7 days of no activity** | mitigated by `.github/workflows/supabase-keepalive.yml` |
| Realtime | 200 concurrent, 2M msgs/month | subscribe narrowly — per active route, never the whole `reports` table |
| PostGIS | available | enabled in migration 0001 |

## Conventions

- **RLS on every table, from the migration that creates it.** Never "add RLS later".
- **Status is never stored.** `crossing_status` is a view. See
  [`decisions/0002`](../decisions/0002-crossing-status-computed-at-read-time.md).
- **Writes that need validation go through an RPC**, not a client insert. The distance and
  rate-limit checks in `submit_report` are server-side or they are worthless. See
  [`decisions/0004`](../decisions/0004-report-validation-is-server-side.md).
- **Distances in metres.** Feet appear only in display code and in `app_config` descriptions.
- Every migration is idempotent where it reasonably can be (`if not exists`, `on conflict do
  nothing`), so re-running against a shared dev database is safe.

## Migrations

| File | Phase | Contents |
|---|---|---|
| `20260825000100_extensions_and_app_config.sql` | 0 | PostGIS + pgcrypto, `app_config` with the SOW's tunable defaults, RLS, typed accessors |

Phase 1 adds: `crossings`, `reports`, `profiles`, `devices`, the `crossing_status` view,
`nearest_crossing()`, `submit_report()`, and the admin-write policies — each with pgTAP tests
asserting the SOW acceptance criteria.

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
| `20260826000200_crossings_reports_schema.sql` | 1 | `crossings`, `reports`, `profiles`, `devices`, `is_admin()`, RLS on every table, `touch_updated_at` trigger |
| `20260826000300_crossing_status_view.sql` | 1 | `crossing_color()`, the `crossing_status` view, `nearest_crossing()`, `crossings_in_bounds()` |
| `20260921000100_fix_touch_updated_at_transaction_time.sql` | 1 (fix) | `touch_updated_at()` switched from `now()` to `clock_timestamp()` — found by the first real pgTAP run against the hosted project |
| `20260921000200_submit_report.sql` | 2 | `submit_report()` — the only legal write path into `reports` (ADR 0004): device suspension, radius, rate limit |

Migrations are pushed to a hosted Supabase project (`supabase link` + `supabase db push`) and the
pgTAP suite runs against it with `supabase test db --linked` (needs Docker locally to run the
`pg_prove` harness, even though the target database is remote — see ADR 0007).

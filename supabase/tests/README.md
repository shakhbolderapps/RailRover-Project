# pgTAP tests

Assertions derived from SOW acceptance criteria, for the parts of the product that live in the
database: the colour rule, the inventory guarantees, status resolution, nearest-crossing lookup,
and RLS.

## Status: written, not yet executed

**These have never been run.** Docker is not installed on this machine, so there is no local
Postgres, and no hosted Supabase project has been provisioned yet
([ADR 0007](../../decisions/0007-no-docker-local-supabase-substitute.md)). They are written now
because the Definition of Done requires the assertion before the implementation, and because
writing them surfaced schema decisions worth making early — the at-grade CHECK constraint came
out of writing `020-crossings-schema.sql`.

Treat every claim these make as **unverified** until the run below is green.

## Running them

Once a database exists:

```bash
supabase link --project-ref <ref>
supabase db push            # apply migrations
supabase test db            # run every file in this directory
```

pgTAP itself needs to be available:

```sql
create extension if not exists pgtap;
```

Each file wraps its fixtures in `begin; … rollback;`, so they leave no residue and can run
against a shared development database.

## Files

| File | Covers |
|---|---|
| `010-crossing-color.sql` | The four-state colour rule, freshness boundary, configurability (M2 AC2, M3 Report-Clear AC2) |
| `020-crossings-schema.sql` | dot_id uniqueness, upsert idempotency, the at-grade CHECK, coordinate corrections (M2 AC1, M5) |
| `030-crossing-status-view.sql` | Most-recent-report-wins, soft-delete fallback, report counts (M3, M5) |
| `040-nearest-crossing.sql` | Auto-selection, the report radius bound, app_config defaults (M3 AC1/AC2) |
| `050-rls.sql` | Anonymous read, no anonymous write, **no direct report insert** (§7, ADR 0004) |

## The one that matters most

`050-rls.sql` asserts that an anonymous key cannot insert into `reports`. The entire server-side
validation argument (ADR 0004) rests on that being true. If that policy ever loosens, the
distance check and the rate limit become decoration, and this test is what catches it.

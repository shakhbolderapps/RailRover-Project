-- 0001 — Extensions and runtime configuration.
--
-- Phase 0. PostGIS is enabled in the first migration because every spatial thing the product does
-- (nearest crossing, corridor distance to a route line, viewport queries) depends on it, and
-- retrofitting a geography column later means rewriting every query that touched it.
--
-- The crossings/reports schema lands in Phase 1 alongside its pgTAP tests.

create extension if not exists postgis;
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------------------------------
-- app_config — the tunable operational parameters.
--
-- SOW §8: "The 15-minute freshness window, the 200-foot route corridor, and the roughly one-mile
-- reporting range ship at these defaults and are tuned during the pilot."
--
-- They live in a table, not in source constants, precisely so tuning during the pilot is a config
-- change rather than an app release. See decisions/0003-corridor-width-is-not-alert-distance.md
-- ---------------------------------------------------------------------------------------------
create table if not exists app_config (
  key         text primary key,
  value       text not null,
  unit        text,
  description text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

comment on table app_config is
  'Runtime-tunable parameters. Read by the map, report and route-conflict logic on every call — '
  'never cached in a way that defeats tuning during the pilot.';

insert into app_config (key, value, unit, description) values
  ('freshness_window_minutes', '15', 'minutes',
   'How long a blocked report stays fresh (red). Past this the crossing shows yellow: blocked but unconfirmed. It NEVER goes green on a timer — only a clear report produces green.'),

  -- 200 ft = 60.96 m. Stored in metres because all geo math is metric; feet are display-only.
  ('route_corridor_meters', '60.96', 'meters',
   'WIDTH of the corridor around the route line that decides whether a crossing counts as ON the route. This is NOT a distance-to-alert threshold: a fresh blocked crossing is flagged however far ahead of the driver it sits.'),

  -- 1 mile = 1609.344 m.
  ('report_radius_meters', '1609.344', 'meters',
   'How close a driver must be to a crossing to be allowed to report it — they must be able to actually see it. Enforced server-side in submit_report; a client-side check is decoration.'),

  ('rate_limit_max_reports', '10', 'reports',
   'Maximum reports a single device may submit inside the rate-limit window, to deter spam (SOW M3 AC5).'),

  ('rate_limit_window_minutes', '5', 'minutes',
   'Window over which rate_limit_max_reports is counted.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------------------------
-- RLS from day one, not later.
--
-- app_config is world-readable (the app needs it on every status computation) and
-- admin-writable only. Tuning the freshness window is an administrative act.
-- ---------------------------------------------------------------------------------------------
alter table app_config enable row level security;

drop policy if exists app_config_read_all on app_config;
create policy app_config_read_all
  on app_config for select
  using (true);

-- The admin-write policy is added in Phase 1, once `profiles.role` exists. Until then the table
-- is read-only to every client key, which is the safe default: no policy = no write.

-- ---------------------------------------------------------------------------------------------
-- Typed accessors, so callers never parse text or guess a default.
-- ---------------------------------------------------------------------------------------------
create or replace function config_number(config_key text, fallback numeric)
returns numeric
language sql
stable
as $$
  select coalesce((select value::numeric from app_config where key = config_key), fallback);
$$;

comment on function config_number is
  'Read a numeric app_config value with an explicit fallback, so a missing row degrades to the '
  'documented SOW default rather than to null.';

create or replace function config_int(config_key text, fallback int)
returns int
language sql
stable
as $$
  select coalesce((select value::int from app_config where key = config_key), fallback);
$$;

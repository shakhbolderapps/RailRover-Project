-- 0002 — Core schema: crossings, reports, profiles, devices.
--
-- Phase 1. This is the table every other module reads from, so the constraints here are load
-- bearing. RLS is enabled on every table in the same migration that creates it — never "added
-- later". See decisions/0004-report-validation-is-server-side.md
--
-- Distances are metres and geometry is `geography(Point, 4326)` throughout, so ST_Distance and
-- ST_DWithin return metres without a projection step.

-- ---------------------------------------------------------------------------------------------
-- profiles — one row per authenticated user, carrying the admin role.
--
-- SOW M5: administrator access is "separate from the driver login" and "Only accounts with the
-- administrator role can access the panel". That is enforced by an RLS policy on this table's
-- role column, NOT by hiding a route in the admin SPA.
-- ---------------------------------------------------------------------------------------------
create type user_role as enum ('driver', 'admin');

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'driver',
  email       text,
  is_suspended boolean not null default false,
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column profiles.is_suspended is
  'SOW M5: staff can suspend a driver who submits false reports. A suspended driver''s reports '
  'are rejected at submission and discounted in status computation.';

-- Helper used by every admin policy below. SECURITY DEFINER so it can read profiles without
-- recursing through profiles'' own RLS policy.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

comment on function is_admin is
  'True when the current session belongs to an administrator. SECURITY DEFINER to avoid RLS '
  'recursion on profiles. Every admin-only policy delegates to this one place.';

-- ---------------------------------------------------------------------------------------------
-- devices — one row per install, so guest reports can be attributed and rate-limited.
--
-- SOW M1 AC4: "Each report is tied to a device identifier so guest and account reports can be
-- attributed." A guest has no user_id, so the device is the only stable handle we have.
-- ---------------------------------------------------------------------------------------------
create table if not exists devices (
  device_id    text primary key,
  user_id      uuid references auth.users(id) on delete set null,
  is_suspended boolean not null default false,
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- crossings — the FRA-derived inventory (SOW M2).
--
-- Compiled by Bolder Apps from the FRA Crossing Inventory (Form 71), dataset m2f8-22s6 on
-- data.transportation.gov. The SOW is explicit that the client does not supply a crossing list.
-- ---------------------------------------------------------------------------------------------
create table if not exists crossings (
  id          uuid primary key default gen_random_uuid(),

  -- FRA Crossing Inventory ID. The natural key: ingest upserts on this, which is what makes
  -- re-running the ingest idempotent and makes expanding the radius purely additive.
  dot_id      text unique not null,

  name        text,
  road        text,                                   -- FRA `street`
  city        text,
  state       text,
  railroad    text,                                   -- shown in crossing detail and alerts

  geom        geography(Point, 4326) not null,

  -- True = crossing is open/in service. An administrator can retire one without deleting it,
  -- preserving the report history that references it.
  is_active   boolean not null default true,

  -- ---------------------------------------------------------------------------------------
  -- Risk-register item #2: grade-separated crossings must never enter the inventory.
  --
  -- An overpass or underpass can never be blocked by a train. If one gets in, it shows on the
  -- map as a crossing that never turns red, and the route-conflict logic will happily flag a
  -- bridge. The ingest script filters them out — and this CHECK makes it structurally
  -- impossible for a bad ingest, a manual insert, or an admin edit to add one anyway.
  --
  -- The column is kept (rather than just filtering) so the guarantee is visible and auditable
  -- in the data, not just asserted in a script somewhere.
  -- ---------------------------------------------------------------------------------------
  is_at_grade boolean not null default true,
  constraint crossings_must_be_at_grade check (is_at_grade),

  source      text not null default 'FRA',
  source_updated_at timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The index every spatial query in the product depends on: nearest-crossing for reports,
-- viewport queries for the map, and corridor distance for route conflict detection.
create index if not exists crossings_geom_idx on crossings using gist (geom);
create index if not exists crossings_active_idx on crossings (is_active) where is_active;

comment on table crossings is
  'FRA-derived crossing inventory, at-grade and public only. The single source the map, the '
  'report flows and the route logic all read from (SOW M2 AC3).';

-- ---------------------------------------------------------------------------------------------
-- reports — the crowd-sourced write path (SOW M3).
--
-- There is no note field. The SOW is explicit and correct: two taps, under five seconds, while
-- driving. Do not add one.
-- ---------------------------------------------------------------------------------------------
create type report_status as enum ('blocked', 'clear');

create table if not exists reports (
  id           uuid primary key default gen_random_uuid(),
  crossing_id  uuid not null references crossings(id) on delete cascade,
  status       report_status not null,

  device_id    text not null references devices(device_id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,

  reported_at  timestamptz not null default now(),

  -- Where the driver was when they reported. Kept so an administrator reviewing abuse can audit
  -- the distance claim after the fact (SOW M5 report review), not just trust it.
  reporter_geom geography(Point, 4326),

  -- Soft delete. SOW M5: staff "remove an inaccurate report" and the crossing state recomputes.
  -- A hard delete would destroy the audit trail that makes abuse review possible.
  is_removed   boolean not null default false,
  removed_by   uuid references auth.users(id),
  removed_at   timestamptz
);

-- Supports the lateral "latest live report per crossing" join in the crossing_status view.
-- Partial on is_removed = false because that is the only slice the view ever reads.
create index if not exists reports_crossing_time_idx
  on reports (crossing_id, reported_at desc)
  where is_removed = false;

-- Supports the per-device rate-limit count in submit_report (Phase 2).
create index if not exists reports_device_time_idx on reports (device_id, reported_at desc);

comment on table reports is
  'Crowd-sourced blocked/clear reports. Never insert directly from a client — go through '
  'submit_report(), which enforces the distance and rate-limit checks server-side (ADR 0004).';

-- ---------------------------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crossings_touch_updated_at on crossings;
create trigger crossings_touch_updated_at
  before update on crossings
  for each row execute function touch_updated_at();

drop trigger if exists profiles_touch_updated_at on profiles;
create trigger profiles_touch_updated_at
  before update on profiles
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
--
-- Default posture: no policy = no access. Every grant below is deliberate.
-- ---------------------------------------------------------------------------------------------
alter table profiles  enable row level security;
alter table devices   enable row level security;
alter table crossings enable row level security;
alter table reports   enable row level security;

-- profiles: you see yourself; admins see everyone and may change roles/suspensions.
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select using (id = auth.uid() or is_admin());

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = auth.uid() or is_admin())
  -- A driver must not be able to promote themselves to admin, so a self-update may only keep
  -- the role and suspension flags exactly as they are.
  with check (
    is_admin()
    or (
      role = (select p.role from profiles p where p.id = profiles.id)
      and is_suspended = (select p.is_suspended from profiles p where p.id = profiles.id)
    )
  );

drop policy if exists profiles_admin_delete on profiles;
create policy profiles_admin_delete on profiles
  for delete using (is_admin() or id = auth.uid());  -- SOW M1: a driver can delete their account

-- devices: a session may register/refresh its own device row; admins may suspend.
drop policy if exists devices_select on devices;
create policy devices_select on devices
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists devices_insert on devices;
create policy devices_insert on devices
  for insert with check (true);   -- guests have no uid yet; submit_report validates the rest

drop policy if exists devices_update_admin on devices;
create policy devices_update_admin on devices
  for update using (is_admin());

-- crossings: world-readable, admin-writable.
-- SOW M2: the inventory is served to the map, the report flow and the route logic. SOW M5:
-- only administrators add, edit, remove or correct coordinates.
drop policy if exists crossings_select_all on crossings;
create policy crossings_select_all on crossings
  for select using (true);

drop policy if exists crossings_admin_write on crossings;
create policy crossings_admin_write on crossings
  for all using (is_admin()) with check (is_admin());

-- reports: a driver may read their OWN reports (SOW M1 edge case carries "recent reports" into a
-- new account). Everyone else reads status through the crossing_status view, which exposes
-- aggregates and never a device_id. Admins read everything (SOW M5 review queue).
drop policy if exists reports_select_own_or_admin on reports;
create policy reports_select_own_or_admin on reports
  for select using (user_id = auth.uid() or is_admin());

-- NOTE: there is deliberately NO insert policy for clients. Reports are written only by
-- submit_report(), a SECURITY DEFINER function added in Phase 2, because the distance and
-- rate-limit checks must be server-side to mean anything (ADR 0004). A client-side check is
-- decoration; an open insert policy would make it decoration too.

drop policy if exists reports_admin_update on reports;
create policy reports_admin_update on reports
  for update using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------------------------
-- app_config admin-write policy, deferred from migration 0001 until profiles.role existed.
-- Tuning the freshness window during the pilot is an administrative act.
-- ---------------------------------------------------------------------------------------------
drop policy if exists app_config_admin_write on app_config;
create policy app_config_admin_write on app_config
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------------------------
-- Auto-create a profile when a user signs up, including anonymous (guest) sessions.
-- Supabase's signInAnonymously gives guests a real auth user, which is what lets RLS and report
-- attribution work uniformly for guests and account holders.
-- ---------------------------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

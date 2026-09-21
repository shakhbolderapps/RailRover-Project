-- 0009 — analytics events and the administrative actions behind the web panel.
--
-- Phase 8/9, SOW M5. Two halves:
--
--   1. `alert_events` / `reroute_events`. The roadmap says to start writing these in Phase 6
--      because retrofitting analytics logging is miserable — it was not done then, and this is
--      that debt being paid while the pilot has generated no data worth losing. Every day this
--      waits is a day of pilot evidence that cannot be recovered.
--   2. The administrative RPCs. Each is SECURITY DEFINER and re-checks is_admin() ITSELF rather
--      than relying on the caller's RLS context, because a SECURITY DEFINER function runs as its
--      owner: without that check, granting execute to `authenticated` would hand every driver
--      the ability to suspend other drivers.

-- ---------------------------------------------------------------------------------------------
-- Analytics events
-- ---------------------------------------------------------------------------------------------
create table if not exists alert_events (
  id           uuid primary key default gen_random_uuid(),
  crossing_id  uuid references crossings(id) on delete set null,
  device_id    text references devices(device_id) on delete set null,
  user_id      uuid references auth.users(id) on delete set null,
  /** How far ahead the conflict was when the driver was warned — the early-warning evidence. */
  meters_ahead double precision,
  created_at   timestamptz not null default now()
);

create index if not exists alert_events_created_idx on alert_events (created_at desc);
create index if not exists alert_events_crossing_idx on alert_events (crossing_id);

comment on table alert_events is
  'One row per blocked-crossing alert shown to a driver. Answers the pilot question the SOW cares '
  'about most: did drivers get warned early enough to act?';

create type reroute_outcome as enum ('rerouted', 'no_better_route', 'declined');

create table if not exists reroute_events (
  id          uuid primary key default gen_random_uuid(),
  crossing_id uuid references crossings(id) on delete set null,
  device_id   text references devices(device_id) on delete set null,
  user_id     uuid references auth.users(id) on delete set null,
  outcome     reroute_outcome not null,
  created_at  timestamptz not null default now()
);

create index if not exists reroute_events_created_idx on reroute_events (created_at desc);

comment on table reroute_events is
  'One row per reroute decision, including the ones that did NOT produce a detour. "No better '
  'route" and "driver declined" are the interesting outcomes: they say whether the feature is '
  'useful or merely present.';

alter table alert_events enable row level security;
alter table reroute_events enable row level security;

-- Drivers write through the RPCs below and never read these; admins read everything.
drop policy if exists alert_events_admin_read on alert_events;
create policy alert_events_admin_read on alert_events for select using (is_admin());

drop policy if exists reroute_events_admin_read on reroute_events;
create policy reroute_events_admin_read on reroute_events for select using (is_admin());

create or replace function log_alert_shown(
  p_crossing_id  uuid,
  p_device_id    text,
  p_meters_ahead double precision
) returns void
language sql
security definer
set search_path = public
as $$
  insert into alert_events (crossing_id, device_id, user_id, meters_ahead)
  values (p_crossing_id, p_device_id, auth.uid(), p_meters_ahead);
$$;

create or replace function log_reroute(
  p_crossing_id uuid,
  p_device_id   text,
  p_outcome     reroute_outcome
) returns void
language sql
security definer
set search_path = public
as $$
  insert into reroute_events (crossing_id, device_id, user_id, outcome)
  values (p_crossing_id, p_device_id, auth.uid(), p_outcome);
$$;

grant execute on function log_alert_shown(uuid, text, double precision) to anon, authenticated;
grant execute on function log_reroute(uuid, text, reroute_outcome) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Administrative actions (SOW M5 "Report Review and User Management")
-- ---------------------------------------------------------------------------------------------

/**
 * Soft-delete a bad report. The crossing's status recomputes on the next read, because the colour
 * is a view over live reports and was never stored (ADR 0002) — there is nothing to invalidate.
 */
create or replace function admin_remove_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  update reports
  set is_removed = true, removed_by = auth.uid(), removed_at = clock_timestamp()
  where id = p_report_id;
end;
$$;

create or replace function admin_set_device_suspended(p_device_id text, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  update devices
  set is_suspended = p_suspended,
      suspended_at = case when p_suspended then clock_timestamp() else null end,
      suspended_by = case when p_suspended then auth.uid() else null end
  where device_id = p_device_id;
end;
$$;

/** SOW M5 "System-Wide Notifications": one row, fanned out to every driver. */
create or replace function admin_broadcast(p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  insert into notifications (kind, title, body, created_by)
  values ('broadcast', p_title, p_body, auth.uid())
  returning id into v_id;

  insert into notification_recipients (notification_id, user_id)
  select v_id, id from auth.users;

  return v_id;
end;
$$;

grant execute on function admin_remove_report(uuid) to authenticated;
grant execute on function admin_set_device_suspended(text, boolean) to authenticated;
grant execute on function admin_broadcast(text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Pilot analytics (SOW M5 "Pilot Analytics Dashboard")
-- ---------------------------------------------------------------------------------------------
create or replace function pilot_metrics(p_since timestamptz)
returns table (
  active_reports   int,
  total_reports    int,
  alerts_shown     int,
  reroutes_taken   int,
  reroutes_offered int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    -- "Active" means currently red: a blocked report still inside the freshness window. Counting
    -- every blocked report ever filed would answer a different, less useful question.
    (select count(*)::int from crossing_status where color = 'red'),
    (select count(*)::int from reports where not is_removed and reported_at >= p_since),
    (select count(*)::int from alert_events where created_at >= p_since),
    (select count(*)::int from reroute_events where created_at >= p_since and outcome = 'rerouted'),
    (select count(*)::int from reroute_events where created_at >= p_since)
  where is_admin();
$$;

comment on function pilot_metrics is
  'Pilot headline numbers since a given time. SECURITY DEFINER so it can read alert/reroute '
  'events, with a WHERE is_admin() that returns NO ROWS to anyone else rather than leaking totals.';

create or replace function most_blocked_crossings(p_since timestamptz, p_limit int default 10)
returns table (
  crossing_id   uuid,
  dot_id        text,
  name          text,
  road          text,
  city          text,
  blocked_count int,
  current_color text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.dot_id, c.name, c.road, c.city,
    count(r.id)::int as blocked_count,
    cs.color
  from crossings c
  join reports r on r.crossing_id = c.id
    and r.status = 'blocked' and not r.is_removed and r.reported_at >= p_since
  join crossing_status cs on cs.id = c.id
  where is_admin()
  group by c.id, c.dot_id, c.name, c.road, c.city, cs.color
  order by blocked_count desc
  limit p_limit;
$$;

grant execute on function pilot_metrics(timestamptz) to authenticated;
grant execute on function most_blocked_crossings(timestamptz, int) to authenticated;

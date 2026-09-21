-- 0008 — notifications and the in-app inbox.
--
-- Phase 7, SOW M1 "Notifications" and M5 "System-Wide Notifications".
--
-- Recipients are keyed on `user_id`, not on `device_id`, and that is an authorization decision
-- rather than a modelling preference. A device id is a client-supplied string: RLS written against
-- it would let anyone who guessed or stole one read another driver's inbox. Every driver has an
-- auth user — guests included, because a guest session is a real anonymous Supabase session
-- (ADR: see stores/session.ts) — so `auth.uid()` is a boundary the client cannot forge.

create type notification_kind as enum ('route_alert', 'broadcast');

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  kind        notification_kind not null,
  title       text not null,
  body        text not null,

  -- Deep-link target (SOW M1 AC3: "Each notification opens its related crossing or alert").
  -- Nulled rather than cascaded on delete: an admin retiring a crossing should not silently
  -- erase the notifications that referenced it.
  crossing_id uuid references crossings(id) on delete set null,

  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_created_idx on notifications (created_at desc);

comment on table notifications is
  'One row per notification event. Fan-out to drivers lives in notification_recipients, so a '
  'broadcast to a thousand drivers is one row here and a thousand there.';

create table if not exists notification_recipients (
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  read_at         timestamptz,
  primary key (notification_id, user_id)
);

-- The inbox query: one driver's unread-first, newest-first list.
create index if not exists notification_recipients_user_idx
  on notification_recipients (user_id, read_at);

-- ---------------------------------------------------------------------------------------------
-- Push tokens live on the device, not the profile: a driver may have several devices, and a
-- guest has no profile at all.
-- ---------------------------------------------------------------------------------------------
alter table devices add column if not exists push_token text;
alter table devices add column if not exists push_enabled boolean not null default true;

comment on column devices.push_token is
  'Expo push token. Null when the driver has not granted notification permission — the in-app '
  'inbox still works in that case (SOW M1 Notifications edge case).';

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table notifications enable row level security;
alter table notification_recipients enable row level security;

-- A driver reads a notification only if it was addressed to them. Admins read everything, for the
-- M5 broadcast audit trail.
drop policy if exists notifications_select_addressed on notifications;
create policy notifications_select_addressed on notifications
  for select using (
    is_admin()
    or exists (
      select 1 from notification_recipients r
      where r.notification_id = notifications.id and r.user_id = auth.uid()
    )
  );

drop policy if exists notifications_admin_write on notifications;
create policy notifications_admin_write on notifications
  for all using (is_admin()) with check (is_admin());

drop policy if exists notification_recipients_select_own on notification_recipients;
create policy notification_recipients_select_own on notification_recipients
  for select using (user_id = auth.uid() or is_admin());

-- A driver may mark their OWN row read. The with-check keeps user_id pinned, so this cannot be
-- used to reassign a notification to someone else.
drop policy if exists notification_recipients_update_own on notification_recipients;
create policy notification_recipients_update_own on notification_recipients
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notification_recipients_admin_write on notification_recipients;
create policy notification_recipients_admin_write on notification_recipients
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------------------------
-- The inbox (SOW M1 Notifications AC2)
-- ---------------------------------------------------------------------------------------------
create or replace function inbox()
returns table (
  id          uuid,
  kind        notification_kind,
  title       text,
  body        text,
  crossing_id uuid,
  created_at  timestamptz,
  read_at     timestamptz
)
language sql
stable
as $$
  select n.id, n.kind, n.title, n.body, n.crossing_id, n.created_at, r.read_at
  from notification_recipients r
  join notifications n on n.id = r.notification_id
  where r.user_id = auth.uid()
  -- Unread first, then newest. A driver opening the inbox wants what they have not seen, not a
  -- strict chronology they have to scan.
  order by (r.read_at is not null), n.created_at desc
  limit 100;
$$;

comment on function inbox is
  'The signed-in driver''s notifications, unread first then newest. Guests included — an '
  'anonymous session is a real auth user.';

grant execute on function inbox() to anon, authenticated;

create or replace function mark_notification_read(p_notification_id uuid)
returns void
language sql
as $$
  update notification_recipients
  set read_at = coalesce(read_at, clock_timestamp())
  where notification_id = p_notification_id and user_id = auth.uid();
$$;

comment on function mark_notification_read is
  'Marks one notification read for the calling driver. coalesce keeps the original timestamp, so '
  'reopening an item does not rewrite when it was first read.';

grant execute on function mark_notification_read(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Registering a push token (SOW M1 Notifications AC1/AC4)
-- ---------------------------------------------------------------------------------------------
create or replace function register_push_token(
  p_device_id text,
  p_token     text,
  p_enabled   boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into devices (device_id, user_id, push_token, push_enabled)
  values (p_device_id, auth.uid(), p_token, p_enabled)
  on conflict (device_id) do update
    set push_token = excluded.push_token,
        push_enabled = excluded.push_enabled,
        user_id = coalesce(devices.user_id, excluded.user_id),
        last_seen_at = clock_timestamp();
end;
$$;

comment on function register_push_token is
  'Stores the Expo push token for a device. SECURITY DEFINER because devices is admin-writable; '
  'a driver registering their own token is not an administrative act.';

grant execute on function register_push_token(text, text, boolean) to anon, authenticated;

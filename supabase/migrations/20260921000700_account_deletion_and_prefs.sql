-- 0010 — account deletion and the auto-reroute preference.
--
-- Phase 10, SOW M1 "Settings" AC2/AC3. Account deletion is also a hard store-submission
-- requirement on both platforms, not merely a nice-to-have.

-- ---------------------------------------------------------------------------------------------
-- Auto-reroute preference (SOW M1-Settings AC2: on by default, a driver can turn it off)
-- ---------------------------------------------------------------------------------------------
alter table devices add column if not exists auto_reroute boolean not null default true;

comment on column devices.auto_reroute is
  'SOW M1-Settings AC2: auto-reroute is ON by default. Stored per device rather than per profile '
  'because a guest has no profile, and because the preference belongs to the phone in the mount.';

create or replace function set_auto_reroute(p_device_id text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into devices (device_id, user_id, auto_reroute)
  values (p_device_id, auth.uid(), p_enabled)
  on conflict (device_id) do update
    set auto_reroute = excluded.auto_reroute,
        last_seen_at = clock_timestamp();
end;
$$;

grant execute on function set_auto_reroute(text, boolean) to anon, authenticated;

create or replace function get_device_preferences(p_device_id text)
returns table (push_enabled boolean, auto_reroute boolean)
language sql
stable
security definer
set search_path = public
as $$
  select d.push_enabled, d.auto_reroute from devices d where d.device_id = p_device_id;
$$;

grant execute on function get_device_preferences(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Account deletion (SOW M1-Settings AC3)
-- ---------------------------------------------------------------------------------------------

/**
 * Delete the calling driver's account.
 *
 * What goes: the auth user, their profile, and their notification recipients — every row that
 * identifies a person. Cascades handle those.
 *
 * What STAYS, deliberately: their reports, with `user_id` nulled by the existing
 * `on delete set null` foreign key. Two reasons, and both matter.
 *
 *   1. Deleting the reports would rewrite history for every OTHER driver. A crossing someone
 *      reported blocked ten minutes ago does not become unblocked because the reporter closed
 *      their account, and silently flipping it back to green would be a safety regression.
 *   2. What actually makes a report personal is the link to a person, and that link is severed.
 *      The remaining row is an anonymous observation about a level crossing.
 *
 * The device id stays on the report because the rate limit and abuse review depend on it, and it
 * identifies an install rather than a person — the same reasoning that lets a guest report at all.
 */
create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Unlink this person's devices before the cascade, so a shared or reused handset does not carry
  -- a dangling reference to a user that no longer exists.
  update devices set user_id = null, push_token = null where user_id = v_user;

  delete from auth.users where id = v_user;
end;
$$;

comment on function delete_my_account is
  'Deletes the calling driver''s account. Reports are kept with user_id nulled: removing them '
  'would rewrite crossing history for every other driver, and severing the link to a person is '
  'what actually makes them non-personal.';

grant execute on function delete_my_account() to authenticated, anon;

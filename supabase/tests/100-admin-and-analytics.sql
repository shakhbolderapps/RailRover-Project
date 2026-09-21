-- pgTAP: administrative actions and pilot analytics (SOW M5).
--
-- Every function here is SECURITY DEFINER, which means it runs as its owner and RLS does not
-- protect it. The check has to be INSIDE the function, and the assertions that matter are
-- therefore the negative ones: a non-admin calling each action and being refused. SOW M5 is
-- explicit that admin access is "separate from the driver login" and enforced by role, not by
-- hiding a route — a test that only ever calls these as an admin proves nothing about that.

begin;
select plan(24);

select has_table('alert_events', 'alert_events table exists');
select has_table('reroute_events', 'reroute_events table exists');
select has_function('pilot_metrics', array['timestamp with time zone'], 'pilot_metrics() exists');
select has_function('admin_remove_report', array['uuid'], 'admin_remove_report() exists');

-- Own the data these metrics count. The live database holds real reports from device testing,
-- and "total reports in the window" is a question about the whole table — the same trap as in
-- 040-nearest-crossing.sql. Undone by the rollback.
delete from alert_events;
delete from reroute_events;
delete from reports;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@example.test'),
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'driver@example.test')
on conflict (id) do nothing;

insert into profiles (id, role, email) values
  ('33333333-3333-4333-8333-333333333333', 'admin', 'admin@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'driver', 'driver@example.test')
on conflict (id) do update set role = excluded.role;

insert into crossings (dot_id, name, geom)
values ('ADMIN-1', 'Admin Test Crossing',
        st_setsrid(st_makepoint(-83.5379, 41.6528), 4326)::geography);

insert into devices (device_id) values ('admin-test-device');

insert into reports (id, crossing_id, status, device_id, reported_at)
values ('bbbbbbbb-0000-4000-8000-000000000001',
        (select id from crossings where dot_id = 'ADMIN-1'),
        'blocked', 'admin-test-device', clock_timestamp());

-- ---------------------------------------------------------------------------------------------
-- A driver must not be able to perform administrative actions. These run as SECURITY DEFINER, so
-- nothing but the in-function check stands between a driver and the whole back office.
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

select throws_ok(
  $$select admin_remove_report('bbbbbbbb-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'SOW M5: a DRIVER cannot remove a report'
);

select throws_ok(
  $$select admin_set_device_suspended('admin-test-device', true)$$,
  '42501',
  null,
  'SOW M5: a DRIVER cannot suspend a device'
);

select throws_ok(
  $$select admin_broadcast('Hello', 'everyone')$$,
  '42501',
  null,
  'SOW M5: a DRIVER cannot broadcast to every user'
);

-- Analytics must not leak either. These return no rows rather than raising, so the assertion is
-- on emptiness — a driver learning the pilot's totals is a smaller breach than suspending someone,
-- but it is still not theirs to see.
select is(
  (select count(*)::int from pilot_metrics(now() - interval '1 day')),
  0,
  'SOW M5: a DRIVER gets no rows from pilot_metrics'
);

select is(
  (select count(*)::int from most_blocked_crossings(now() - interval '1 day')),
  0,
  'SOW M5: a DRIVER gets no rows from most_blocked_crossings'
);

-- ---------------------------------------------------------------------------------------------
-- The same calls as an administrator.
-- ---------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select active_reports from pilot_metrics(now() - interval '1 day')),
  1,
  'M5-Analytics-AC1: an admin sees the active (red) report count'
);

select is(
  (select total_reports from pilot_metrics(now() - interval '1 day')),
  1,
  'M5-Analytics-AC1: an admin sees the total reports in the window'
);

-- M5-Analytics-AC3: the window actually filters. A window that starts after the report must not
-- include it — otherwise the time selector is decoration.
select is(
  (select total_reports from pilot_metrics(now() + interval '1 hour')),
  0,
  'M5-Analytics-AC3: metrics change with the selected time window'
);

select is(
  (select blocked_count from most_blocked_crossings(now() - interval '1 day')),
  1,
  'M5-Analytics-AC2: the most-blocked list counts blocked reports per crossing'
);

-- ---------------------------------------------------------------------------------------------
-- Removing a report recomputes the crossing, because the colour was never stored (ADR 0002).
-- ---------------------------------------------------------------------------------------------
select is(
  (select color from crossing_status where dot_id = 'ADMIN-1'),
  'red',
  'the crossing is red before the bad report is removed'
);

select lives_ok(
  $$select admin_remove_report('bbbbbbbb-0000-4000-8000-000000000001')$$,
  'an ADMIN can remove a report'
);

select is(
  (select color from crossing_status where dot_id = 'ADMIN-1'),
  'unknown',
  'SOW M5: removing the only report reverts the crossing — no cache to invalidate'
);

select lives_ok(
  $$select admin_set_device_suspended('admin-test-device', true)$$,
  'an ADMIN can suspend a device'
);

select ok(
  (select is_suspended from devices where device_id = 'admin-test-device'),
  'the device is suspended afterwards, so submit_report will refuse it'
);

-- ---------------------------------------------------------------------------------------------
-- Crossing inventory management (SOW M5). Admins write `crossings` directly under the
-- crossings_admin_write policy — 050-rls.sql already asserts a driver CANNOT, so the assertions
-- here are the admin half of that same boundary.
-- ---------------------------------------------------------------------------------------------
select lives_ok(
  $$insert into crossings (dot_id, name, road, city, state, geom)
    values ('ADMIN-NEW', 'Added By Admin', 'New Rd', 'Toledo', 'Ohio',
            st_setsrid(st_makepoint(-83.60, 41.70), 4326)::geography)$$,
  'M5-Inventory-AC1: an ADMIN can add a crossing'
);

select lives_ok(
  $$update crossings set name = 'Renamed By Admin' where dot_id = 'ADMIN-NEW'$$,
  'M5-Inventory-AC1: an ADMIN can edit a crossing'
);

-- M5-Inventory-AC2: a coordinate correction must reach everything that reads the inventory.
-- There is only one table, so it does — but "it obviously does" is how this stops being true.
update crossings
set geom = st_setsrid(st_makepoint(-83.55, 41.66), 4326)::geography
where dot_id = 'ADMIN-NEW';

select is(
  (select round(longitude::numeric, 3) from crossing_status where dot_id = 'ADMIN-NEW'),
  round((-83.55)::numeric, 3),
  'M5-Inventory-AC2: a coordinate correction is visible through crossing_status at once'
);

select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.56,41.66],[-83.54,41.66]]}'::jsonb
   ) where dot_id = 'ADMIN-NEW'),
  1,
  'M5-Inventory-AC2: the corrected coordinates reach the ROUTE logic, not just the map'
);

-- Retiring rather than deleting: reports reference crossings, and the history is the audit trail
-- that makes abuse review possible.
select lives_ok(
  $$update crossings set is_active = false where dot_id = 'ADMIN-NEW'$$,
  'M5-Inventory-AC1: an ADMIN can retire a crossing'
);

select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.56,41.66],[-83.54,41.66]]}'::jsonb
   ) where dot_id = 'ADMIN-NEW'),
  0,
  'M5-Inventory-AC3: a retired crossing drops out of the route logic immediately'
);

reset role;
select * from finish();
rollback;

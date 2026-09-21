-- pgTAP: submit_report() (SOW M3 Report Blocked / Report Clear, ADR 0004).
--
-- 050-rls.sql already asserts a direct client insert into `reports` is rejected. These tests
-- call submit_report() exactly as the mobile app will — as the anon role, the real guest-driver
-- case SOW M1 explicitly allows — and switch back to the default (superuser) role only to
-- inspect raw table state that RLS would otherwise hide from an anon session.
--
-- Distances mirror 040-nearest-crossing.sql: 1 degree of latitude ~= 111,320 m.

begin;
select plan(17);

select has_function(
  'submit_report',
  array['uuid', 'report_status', 'text', 'double precision', 'double precision'],
  'submit_report() exists'
);

-- Fixture: two crossings due north of the Toledo pilot centre, at ~0.9 mi and ~1.1 mi —
-- straddling the default 1-mile report_radius_meters.
insert into crossings (dot_id, name, road, city, state, geom) values
  ('SR-NEAR', 'Near Crossing', 'Central Ave', 'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.5379, 41.6528 + (0.9 * 1609.344 / 111320)), 4326)::geography),
  ('SR-FAR',  'Far Crossing',  'Alexis Rd',   'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.5379, 41.6528 + (1.1 * 1609.344 / 111320)), 4326)::geography);

set local role anon;

-- ---------------------------------------------------------------------------------------------
-- M3-AC2: the radius boundary, straddled by two real crossings (roadmap Phase-2 case).
-- ---------------------------------------------------------------------------------------------
select is(
  (select submit_report(
      (select id from crossings where dot_id = 'SR-NEAR'),
      'blocked', 'device-near', 41.6528, -83.5379
   ) ->> 'ok')::boolean,
  true,
  'M3-AC2: a driver 0.9 mi from a crossing CAN report it'
);

select is(
  (select submit_report(
      (select id from crossings where dot_id = 'SR-FAR'),
      'blocked', 'device-far', 41.6528, -83.5379
   ) ->> 'reason'),
  'too_far_from_crossing',
  'M3-AC2: a driver 1.1 mi from a crossing CANNOT report it'
);

reset role;

select is(
  (select count(*)::int from reports r join crossings c on c.id = r.crossing_id
     where c.dot_id = 'SR-FAR'),
  0,
  'a rejected too-far report is never written'
);

-- ---------------------------------------------------------------------------------------------
-- M3-AC3: the report saves the crossing, status, timestamp and device identifier.
-- ---------------------------------------------------------------------------------------------
select is(
  (select device_id from reports r join crossings c on c.id = r.crossing_id
     where c.dot_id = 'SR-NEAR' order by reported_at desc limit 1),
  'device-near',
  'M3-AC3: the report records the device identifier'
);

select is(
  (select status::text from reports r join crossings c on c.id = r.crossing_id
     where c.dot_id = 'SR-NEAR' order by reported_at desc limit 1),
  'blocked',
  'M3-AC3: the report records the status'
);

select ok(
  (select reported_at > clock_timestamp() - interval '1 minute'
     from reports r join crossings c on c.id = r.crossing_id
     where c.dot_id = 'SR-NEAR' order by reported_at desc limit 1),
  'M3-AC3: the report records a fresh timestamp'
);

set local role anon;

-- ---------------------------------------------------------------------------------------------
-- M3-AC4: a new blocked report shows the crossing as red immediately.
-- ---------------------------------------------------------------------------------------------
select is(
  (select submit_report(
      (select id from crossings where dot_id = 'SR-NEAR'),
      'blocked', 'device-near-2', 41.6528, -83.5379
   ) -> 'crossing' ->> 'color'),
  'red',
  'M3-AC4: a new blocked report shows the crossing as red immediately'
);

-- ---------------------------------------------------------------------------------------------
-- Most-recent-wins, end to end through submit_report — not just at the view level (030 already
-- covers the view). Blocked -> clear -> blocked, same crossing, same device.
-- ---------------------------------------------------------------------------------------------
select is(
  (select submit_report(
      (select id from crossings where dot_id = 'SR-NEAR'),
      'clear', 'device-near', 41.6528, -83.5379
   ) -> 'crossing' ->> 'color'),
  'green',
  'M3 Report-Clear AC2/AC4: a clear report turns the crossing green through submit_report'
);

select is(
  (select submit_report(
      (select id from crossings where dot_id = 'SR-NEAR'),
      'blocked', 'device-near', 41.6528, -83.5379
   ) -> 'crossing' ->> 'color'),
  'red',
  'a subsequent blocked report turns it red again — the most recent report always wins'
);

-- ---------------------------------------------------------------------------------------------
-- Unknown and retired crossings.
-- ---------------------------------------------------------------------------------------------
select is(
  (select submit_report(gen_random_uuid(), 'blocked', 'device-missing', 41.6528, -83.5379) ->> 'reason'),
  'crossing_not_found',
  'a nonexistent crossing is rejected as crossing_not_found'
);

reset role;
insert into crossings (dot_id, name, geom, is_active) values
  ('SR-INACTIVE', 'Retired Crossing',
   st_setsrid(st_makepoint(-83.5379, 41.6528), 4326)::geography, false);
set local role anon;

select is(
  (select submit_report(
      (select id from crossings where dot_id = 'SR-INACTIVE'),
      'blocked', 'device-inactive', 41.6528, -83.5379
   ) ->> 'reason'),
  'crossing_not_found',
  'a retired (inactive) crossing is rejected as crossing_not_found — it can never be blocked'
);

-- ---------------------------------------------------------------------------------------------
-- ADR 0004: a suspended device is rejected outright, before the radius or rate-limit checks.
-- ---------------------------------------------------------------------------------------------
reset role;
insert into devices (device_id, is_suspended) values ('device-suspended', true)
  on conflict (device_id) do update set is_suspended = true;
set local role anon;

select is(
  (select submit_report(
      (select id from crossings where dot_id = 'SR-NEAR'),
      'blocked', 'device-suspended', 41.6528, -83.5379
   ) ->> 'reason'),
  'device_suspended',
  'ADR 0004: a suspended device cannot submit a report'
);

-- ---------------------------------------------------------------------------------------------
-- M3-AC5: the per-device rate limit. Lowered to 3 so the test is fast and deterministic.
-- ---------------------------------------------------------------------------------------------
reset role;
update app_config set value = '3' where key = 'rate_limit_max_reports';
set local role anon;

select ok(
  (select submit_report(
      (select id from crossings where dot_id = 'SR-NEAR'),
      'blocked', 'device-ratelimit', 41.6528, -83.5379
   ) ->> 'ok')::boolean,
  'the 1st report from a fresh device is allowed'
);

select ok(
  (select submit_report(
      (select id from crossings where dot_id = 'SR-NEAR'),
      'blocked', 'device-ratelimit', 41.6528, -83.5379
   ) ->> 'ok')::boolean,
  'the 2nd rapid report from the same device is allowed (under the limit)'
);

select ok(
  (select submit_report(
      (select id from crossings where dot_id = 'SR-NEAR'),
      'blocked', 'device-ratelimit', 41.6528, -83.5379
   ) ->> 'ok')::boolean,
  'the 3rd rapid report from the same device is allowed (at the limit)'
);

select is(
  (select submit_report(
      (select id from crossings where dot_id = 'SR-NEAR'),
      'blocked', 'device-ratelimit', 41.6528, -83.5379
   ) ->> 'reason'),
  'rate_limited',
  'M3-AC5: the 4th rapid report from the same device trips the rate limit'
);

reset role;
select * from finish();
rollback;

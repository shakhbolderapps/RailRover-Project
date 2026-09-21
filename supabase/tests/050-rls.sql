-- pgTAP: Row Level Security (SOW §7 Security, M5 admin separation).
--
-- ADR 0004: the distance and rate-limit checks are only meaningful if a client cannot bypass
-- them by writing to `reports` directly. A security control with no test is a hope, so these
-- assert the negative cases explicitly.

begin;
select plan(10);

select ok(
  (select relrowsecurity from pg_class where relname = 'crossings'),
  'RLS is enabled on crossings'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'reports'),
  'RLS is enabled on reports'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'profiles'),
  'RLS is enabled on profiles'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'app_config'),
  'RLS is enabled on app_config'
);

insert into crossings (dot_id, name, geom)
values ('RLS-TEST', 'Test', st_setsrid(st_makepoint(-83.5379, 41.6528), 4326)::geography);

-- ---------------------------------------------------------------------------------------------
-- Anonymous (guest) role — a real, common case: SOW M1 allows reporting without an account.
-- ---------------------------------------------------------------------------------------------
set local role anon;

select lives_ok(
  $$select count(*) from crossings$$,
  'M2-AC3: an anonymous driver CAN read the crossing inventory'
);

select lives_ok(
  $$select count(*) from crossing_status$$,
  'an anonymous driver CAN read computed crossing status'
);

with t as (
  update crossings set name = 'Hacked' where dot_id = 'RLS-TEST' returning 1
)
select is(
  (select count(*)::int from t),
  0,
  'SOW §7: an anonymous key CANNOT update a crossing'
);

select throws_ok(
  $$insert into crossings (dot_id, geom)
    values ('ANON-INSERT', st_setsrid(st_makepoint(-83.5, 41.6), 4326)::geography)$$,
  '42501',
  null,
  'SOW §7: an anonymous key CANNOT insert a crossing'
);

-- The critical one. There is deliberately no client insert policy on reports: every write goes
-- through submit_report(), where the distance and rate-limit checks are enforced (ADR 0004).
select throws_ok(
  $$insert into reports (crossing_id, status, device_id)
    select id, 'blocked', 'nonexistent-device' from crossings limit 1$$,
  '42501',
  null,
  'ADR 0004: a client CANNOT insert a report directly — it must go through submit_report()'
);

with t as (
  update app_config set value = '9999' where key = 'freshness_window_minutes' returning 1
)
select is(
  (select count(*)::int from t),
  0,
  'an anonymous key CANNOT retune the freshness window'
);

reset role;
select * from finish();
rollback;

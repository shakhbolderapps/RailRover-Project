-- pgTAP: crossing_status resolution rules (SOW M2, M3).
--
-- The view answers one question — "what colour is this crossing right now" — and three SOW rules
-- decide it: most recent report wins, a removed report does not count, and green requires a
-- clear report.

begin;
select plan(9);

-- Fixture: one crossing, one device.
insert into crossings (dot_id, name, road, city, state, geom)
values ('TEST-STATUS', 'Central Ave', 'Central Ave', 'Toledo', 'Ohio',
        st_setsrid(st_makepoint(-83.5379, 41.6528), 4326)::geography);

insert into devices (device_id) values ('test-device-1');

-- Convenience: the crossing's id and a report-inserting helper.
create temporary view target as
  select id from crossings where dot_id = 'TEST-STATUS';

-- ---------------------------------------------------------------------------------------------
-- No reports -> unknown
-- ---------------------------------------------------------------------------------------------
select is(
  (select color from crossing_status where dot_id = 'TEST-STATUS'),
  'unknown',
  'M2 Crossing Detail edge case: no reports -> unknown, with no recent report time'
);

select is(
  (select report_count from crossing_status where dot_id = 'TEST-STATUS'),
  0,
  'report_count is 0 before any report'
);

-- ---------------------------------------------------------------------------------------------
-- A fresh blocked report -> red
-- ---------------------------------------------------------------------------------------------
insert into reports (crossing_id, status, device_id, reported_at)
select id, 'blocked', 'test-device-1', now() - interval '2 minutes' from target;

select is(
  (select color from crossing_status where dot_id = 'TEST-STATUS'),
  'red',
  'M3-AC4: a new blocked report updates the crossing to red'
);

-- ---------------------------------------------------------------------------------------------
-- Most recent wins, in both directions.
-- SOW M3 Report-Clear edge case: "A crossing is reported clear while another driver reports it
-- blocked -> System keeps the most recent report and reflects it in the crossing status."
-- ---------------------------------------------------------------------------------------------
insert into reports (crossing_id, status, device_id, reported_at)
select id, 'clear', 'test-device-1', now() - interval '30 seconds' from target;

select is(
  (select color from crossing_status where dot_id = 'TEST-STATUS'),
  'green',
  'M3-AC4: blocked then clear 30 seconds later -> green (most recent wins)'
);

insert into reports (crossing_id, status, device_id, reported_at)
select id, 'blocked', 'test-device-1', now() from target;

select is(
  (select color from crossing_status where dot_id = 'TEST-STATUS'),
  'red',
  'M3-AC4: clear then blocked -> red (most recent wins, in both directions)'
);

select is(
  (select report_count from crossing_status where dot_id = 'TEST-STATUS'),
  3,
  'report_count counts every live report'
);

-- ---------------------------------------------------------------------------------------------
-- Soft delete. SOW M5: an administrator removes an inaccurate report "and its effect on crossing
-- state". Removing the newest blocked report must fall back to the previous report, not to green
-- and not to unknown.
-- ---------------------------------------------------------------------------------------------
update reports
set is_removed = true, removed_at = now()
where crossing_id = (select id from target)
  and status = 'blocked'
  and reported_at >= now() - interval '1 second';

select is(
  (select color from crossing_status where dot_id = 'TEST-STATUS'),
  'green',
  'M5: removing the latest blocked report reverts to what the prior report said'
);

select is(
  (select report_count from crossing_status where dot_id = 'TEST-STATUS'),
  2,
  'M5: a removed report is excluded from report_count'
);

-- Removing every report returns the crossing to unknown — not to green.
update reports set is_removed = true where crossing_id = (select id from target);

select is(
  (select color from crossing_status where dot_id = 'TEST-STATUS'),
  'unknown',
  'M5: removing every report reverts to unknown, NOT to green'
);

select * from finish();
rollback;

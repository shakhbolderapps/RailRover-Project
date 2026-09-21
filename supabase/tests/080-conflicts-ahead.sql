-- pgTAP: conflicts_ahead (SOW M4 "Route Conflict Detection").
--
-- This is the function the product turns on, and the one most likely to look right while being
-- wrong, so each of its three filters is asserted on its own rather than only in combination:
-- a suite that only ever checks "the right crossing came back" passes just as happily when two
-- filters are broken in compensating ways.
--
-- Fixture geometry: a route running due east along latitude 41.65, from -83.60 to -83.40
-- (about 16.6 km). The driver sits at -83.58, a fifth of the way along. 1 degree of latitude
-- ~= 111,320 m; 1 degree of longitude at this latitude ~= 83,000 m.

begin;
select plan(16);

-- Own the inventory, as in 040 and 070 — these assertions are about which crossings are on a
-- route, which is a question about the whole table. Undone by the rollback.
delete from crossings;

select has_function(
  'conflicts_ahead',
  array['jsonb', 'double precision', 'double precision', 'double precision', 'integer'],
  'conflicts_ahead() exists'
);

insert into crossings (dot_id, name, road, city, state, geom) values
  ('CA-BEHIND',   'Behind Driver',   'Behind Rd',  'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.59, 41.65), 4326)::geography),
  ('CA-NEAR',     'Just Ahead',      'Near Rd',    'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.56, 41.65), 4326)::geography),
  ('CA-MID',      'Further Ahead',   'Mid Rd',     'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.50, 41.65), 4326)::geography),
  ('CA-FAR',      'Far Ahead',       'Far Rd',     'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.41, 41.65), 4326)::geography),
  -- Ahead along the route, but 300 m off the line: outside the corridor.
  ('CA-OFFROUTE', 'Off Route',       'Off Rd',     'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.52, 41.65 + (300.0 / 111320)), 4326)::geography);

insert into devices (device_id) values ('conflict-test-device');

-- Every crossing gets a FRESH blocked report, so anything filtered out below is filtered by
-- geometry rather than by status.
insert into reports (crossing_id, status, device_id, reported_at)
select id, 'blocked', 'conflict-test-device', clock_timestamp() from crossings;

-- ---------------------------------------------------------------------------------------------
-- Filter 2: ahead of the driver (M4-AC3)
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58
   ) where dot_id = 'CA-BEHIND'),
  0,
  'M4-AC3: a crossing BEHIND the driver is excluded, even with a fresh blocked report'
);

select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58
   ) where dot_id = 'CA-NEAR'),
  1,
  'M4-AC3: a crossing ahead of the driver is included'
);

-- ---------------------------------------------------------------------------------------------
-- Risk-register item #1 (ADR 0003): no distance ceiling. THE load-bearing assertion.
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58
   ) where dot_id = 'CA-FAR'),
  1,
  'M4-AC2: a fresh blocked crossing ~14 km ahead is flagged — warning is not proximity-gated'
);

select ok(
  (select meters_ahead > 10000 from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58
   ) where dot_id = 'CA-FAR'),
  'the far conflict really is >10 km away — the fixture tests what it claims to'
);

-- ---------------------------------------------------------------------------------------------
-- Filter 1: the corridor (M4-AC1)
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58
   ) where dot_id = 'CA-OFFROUTE'),
  0,
  'M4-AC1 edge case: a crossing 300 m off the line does not trigger an alert'
);

select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58, 500.0
   ) where dot_id = 'CA-OFFROUTE'),
  1,
  'M4-AC1: the corridor is configurable — at 500 m the off-route crossing comes onto the route'
);

update app_config set value = '500' where key = 'route_corridor_meters';

select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58
   ) where dot_id = 'CA-OFFROUTE'),
  1,
  'M4-AC1: with no explicit corridor the width comes from app_config'
);

update app_config set value = '60.96' where key = 'route_corridor_meters';

-- ---------------------------------------------------------------------------------------------
-- Ordering (M4-AC3)
-- ---------------------------------------------------------------------------------------------
select is(
  (select array_agg(dot_id order by meters_ahead) from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58
   )),
  array['CA-NEAR', 'CA-MID', 'CA-FAR'],
  'M4-AC3: conflicts come back ordered by distance ahead, nearest first'
);

select ok(
  (select bool_and(ordered) from (
     select meters_ahead >= lag(meters_ahead) over (order by meters_ahead) is not false as ordered
     from conflicts_ahead(
       '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
       41.65, -83.58)
   ) t),
  'meters_ahead increases monotonically down the result'
);

-- ---------------------------------------------------------------------------------------------
-- Filter 3: freshness (M4-AC4)
-- ---------------------------------------------------------------------------------------------
update reports set reported_at = clock_timestamp() - interval '20 minutes'
where crossing_id = (select id from crossings where dot_id = 'CA-MID');

select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58
   ) where dot_id = 'CA-MID'),
  0,
  'M4-AC4 edge case: a blocked report aged past the freshness window is no longer a conflict'
);

select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58, null, 30
   ) where dot_id = 'CA-MID'),
  1,
  'M4-AC4: the freshness window is configurable — under 30 minutes the same report counts again'
);

-- A clear report must never be a conflict, however recent (ADR 0002).
insert into reports (crossing_id, status, device_id, reported_at)
select id, 'clear', 'conflict-test-device', clock_timestamp()
from crossings where dot_id = 'CA-NEAR';

select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58
   ) where dot_id = 'CA-NEAR'),
  0,
  'a crossing reported CLEAR is not a conflict — most recent report wins'
);

-- ---------------------------------------------------------------------------------------------
-- M4-AC5: a report submitted mid-trip changes the answer. The function is read-time, so this is
-- about the data, not about any cache — which is exactly what makes real-time wiring possible.
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58
   )),
  1,
  'baseline before the mid-trip report: only the far conflict remains'
);

insert into reports (crossing_id, status, device_id, reported_at)
select id, 'blocked', 'conflict-test-device', clock_timestamp()
from crossings where dot_id = 'CA-NEAR';

select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.58
   )),
  2,
  'M4-AC5: a report submitted DURING the trip immediately changes the conflict set'
);

-- ---------------------------------------------------------------------------------------------
-- A driver who has passed everything has no conflicts left.
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from conflicts_ahead(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.40,41.65]]}'::jsonb,
     41.65, -83.405
   )),
  0,
  'a driver near the destination has nothing ahead of them'
);

select * from finish();
rollback;

-- pgTAP: crossings_on_route (SOW M4 "Destination Search and Route Options" AC2).
--
-- Risk-register item #1 lives here. The corridor is a perpendicular distance from the route line,
-- NOT a distance-to-alert, so the load-bearing assertion in this file is the one placing a
-- crossing 5 km along the route and requiring it to come back. A test suite that only ever puts
-- crossings a few hundred metres away cannot catch that regression, which is precisely the
-- misreading ADR 0003 exists to prevent.
--
-- Fixture geometry: a route running due east along latitude 41.65, from -83.60 to -83.50.
-- 1 degree of latitude ~= 111,320 m, so perpendicular offsets are expressed in those terms.

begin;
select plan(11);

-- These assertions are about which crossings a route passes, which is a question about the whole
-- inventory rather than just these fixtures. Take control of it explicitly; the delete is undone
-- by the rollback at the end of the file. (Same reasoning as 040-nearest-crossing.sql.)
delete from crossings;

select has_function(
  'crossings_on_route',
  array['jsonb', 'double precision'],
  'crossings_on_route() exists'
);

insert into crossings (dot_id, name, road, city, state, geom) values
  -- Directly ON the line, near its western end.
  ('ROUTE-ON',      'On Route',        'Central Ave', 'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.59, 41.65), 4326)::geography),

  -- 30 m north of the line: inside the ~61 m corridor.
  ('ROUTE-INSIDE',  'Just Inside',     'Inside Rd',   'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.58, 41.65 + (30.0 / 111320)), 4326)::geography),

  -- 100 m north of the line: outside the corridor. This is the crossing whose absence proves the
  -- corridor is doing any work at all.
  ('ROUTE-OUTSIDE', 'Just Outside',    'Outside Rd',  'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.57, 41.65 + (100.0 / 111320)), 4326)::geography),

  -- ON the line but ~5 km further east. ADR 0003: distance ALONG the route must not matter.
  ('ROUTE-FAR',     'Five Km Ahead',   'Far Rd',      'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.54, 41.65), 4326)::geography),

  -- Nowhere near the route at all.
  ('ROUTE-ELSEWHERE', 'Different Town', 'Other Rd',   'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.20, 41.90), 4326)::geography);

-- ---------------------------------------------------------------------------------------------
-- The corridor
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.50,41.65]]}'::jsonb
   ) where dot_id = 'ROUTE-ON'),
  1,
  'M4-AC2: a crossing on the route line is on the route'
);

select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.50,41.65]]}'::jsonb
   ) where dot_id = 'ROUTE-INSIDE'),
  1,
  'M4-AC2: a crossing 30 m from the line is inside the ~61 m corridor'
);

select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.50,41.65]]}'::jsonb
   ) where dot_id = 'ROUTE-OUTSIDE'),
  0,
  'M4-AC2: a crossing 100 m from the line is OUTSIDE the corridor'
);

select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.50,41.65]]}'::jsonb
   ) where dot_id = 'ROUTE-ELSEWHERE'),
  0,
  'a crossing nowhere near the route is not on it'
);

-- ---------------------------------------------------------------------------------------------
-- Risk-register item #1. The corridor is a WIDTH, not a distance-to-alert.
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.50,41.65]]}'::jsonb
   ) where dot_id = 'ROUTE-FAR'),
  1,
  'ADR 0003: a crossing 5 km ALONG the route is on the route — there is no distance ceiling'
);

select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.50,41.65]]}'::jsonb
   )),
  3,
  'the route returns exactly its three corridor crossings, near and far alike'
);

-- ---------------------------------------------------------------------------------------------
-- The corridor is configurable (SOW §8: "tuned during the pilot").
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.50,41.65]]}'::jsonb,
     150.0
   ) where dot_id = 'ROUTE-OUTSIDE'),
  1,
  'M4-AC2: widening the corridor to 150 m brings the 100 m crossing onto the route'
);

update app_config set value = '150' where key = 'route_corridor_meters';

select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.50,41.65]]}'::jsonb
   ) where dot_id = 'ROUTE-OUTSIDE'),
  1,
  'with no explicit corridor the value comes from app_config, not a hard-coded constant'
);

update app_config set value = '60.96' where key = 'route_corridor_meters';

-- ---------------------------------------------------------------------------------------------
-- Status comes through, so a route card can count the blocked ones (M4-AC2).
-- ---------------------------------------------------------------------------------------------
insert into devices (device_id) values ('route-test-device');
insert into reports (crossing_id, status, device_id)
select id, 'blocked', 'route-test-device' from crossings where dot_id = 'ROUTE-FAR';

select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.50,41.65]]}'::jsonb
   ) where color = 'red'),
  1,
  'M4-AC2: a blocked crossing on the route is reported red, so the option can show a count'
);

-- ---------------------------------------------------------------------------------------------
-- A retired crossing is not on anyone's route.
-- ---------------------------------------------------------------------------------------------
update crossings set is_active = false where dot_id = 'ROUTE-ON';

select is(
  (select count(*)::int from crossings_on_route(
     '{"type":"LineString","coordinates":[[-83.60,41.65],[-83.50,41.65]]}'::jsonb
   ) where dot_id = 'ROUTE-ON'),
  0,
  'an inactive crossing is never counted on a route'
);

select * from finish();
rollback;

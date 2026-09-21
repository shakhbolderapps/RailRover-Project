-- 0006 — crossings_on_route(): which crossings a route passes through.
--
-- Phase 5. SOW M4 "Destination Search and Route Options" AC2: each route option shows travel
-- time, the number of crossings on it, and how many are currently blocked. This is the query
-- behind the product's differentiating feature — the reason a driver would compare two routes
-- with similar travel times at all.
--
-- The corridor is a PERPENDICULAR DISTANCE from the route line, not a distance-to-alert. A
-- crossing 40 km along the route is on the route exactly as much as one 200 m along it, and this
-- function has no distance ceiling anywhere in it. See decisions/0003.
--
-- Takes GeoJSON rather than EWKT so the client can hand over the decoded route geometry it
-- already holds, without assembling geometry strings by hand.

create or replace function crossings_on_route(
  route_geojson  jsonb,
  corridor_meters double precision default null
) returns setof crossing_status
language sql
stable
as $$
  select cs.*
  from crossing_status cs
  where cs.is_active
    and st_dwithin(
      cs.geom,
      st_setsrid(st_geomfromgeojson(route_geojson::text), 4326)::geography,
      -- Defaults to the configured corridor, so tuning it during the pilot is a config change
      -- rather than an app release (SOW §8).
      coalesce(corridor_meters, config_number('route_corridor_meters', 60.96))
    );
$$;

comment on function crossings_on_route is
  'Crossings within the route corridor, with their read-time status. The corridor is a '
  'perpendicular distance from the line and is NOT an alert threshold — there is deliberately no '
  'distance ceiling here (ADR 0003). Returns every crossing on the route; counting the red ones '
  'is the caller''s job.';

grant execute on function crossings_on_route(jsonb, double precision) to anon, authenticated;

-- 0007 — conflicts_ahead(): fresh blocked crossings ahead of the driver on the active route.
--
-- Phase 6, SOW M4 "Route Conflict Detection". This is the core of the product and the function
-- most likely to look right while being wrong, so the filters are written in the order the SOW
-- states them and each one is asserted separately in 080-conflicts-ahead.sql.
--
-- THREE FILTERS. There is deliberately no fourth:
--   1. inside the route corridor   (a perpendicular distance, ADR 0003)
--   2. ahead of the driver         (position along the line, not straight-line distance)
--   3. colour = red                (a blocked report still inside the freshness window)
--
-- There is NO distance ceiling. A fresh blocked crossing 40 km ahead is flagged exactly like one
-- 200 m ahead — early warning is the entire value of the product, and a driver warned 200 feet
-- from a blocked crossing has already lost. `meters_ahead` is returned for ORDERING and for the
-- alert's "time to crossing", never to suppress an alert (ADR 0003, risk-register item #1).

create or replace function conflicts_ahead(
  route_geojson     jsonb,
  driver_lat        double precision,
  driver_lng        double precision,
  corridor_meters   double precision default null,
  freshness_minutes int default null
) returns table (
  crossing_id      uuid,
  dot_id           text,
  name             text,
  road             text,
  latitude         double precision,
  longitude        double precision,
  last_reported_at timestamptz,
  meters_ahead     double precision
)
language sql
stable
as $$
  with route as (
    -- ST_LineLocatePoint and ST_LineSubstring are geometry operations; distance and length are
    -- measured on geography so they come back in metres without a projection step.
    select
      st_setsrid(st_geomfromgeojson(route_geojson::text), 4326) as line_geom,
      st_setsrid(st_geomfromgeojson(route_geojson::text), 4326)::geography as line_geog
  ),
  settings as (
    select
      coalesce(corridor_meters, config_number('route_corridor_meters', 60.96)) as corridor,
      coalesce(freshness_minutes, config_int('freshness_window_minutes', 15)) as freshness
  ),
  driver as (
    select
      st_setsrid(st_makepoint(driver_lng, driver_lat), 4326) as pt_geom,
      st_linelocatepoint((select line_geom from route),
                         st_setsrid(st_makepoint(driver_lng, driver_lat), 4326)) as t
  ),
  on_route as (
    select
      cs.*,
      -- Position ALONG the route as a 0–1 fraction. This single primitive is both the
      -- ahead/behind test and the ordering — a straight-line distance cannot distinguish a
      -- crossing 2 km ahead from one 2 km behind.
      st_linelocatepoint((select line_geom from route), cs.geom::geometry) as t
    from crossing_status cs
    where cs.is_active
      and st_dwithin(cs.geom, (select line_geog from route), (select corridor from settings))
  )
  select
    o.id,
    o.dot_id,
    o.name,
    o.road,
    o.latitude,
    o.longitude,
    o.last_reported_at,
    st_length(
      st_linesubstring((select line_geom from route), (select t from driver), o.t)::geography
    ) as meters_ahead
  from on_route o
  where o.t > (select t from driver)
    -- Recomputed rather than reading o.colour, so an explicit freshness window actually applies.
    -- The view bakes in the configured default; this keeps the window genuinely tunable (SOW §8).
    and crossing_color(o.last_status, o.last_reported_at, (select freshness from settings)) = 'red'
  order by meters_ahead asc;
$$;

comment on function conflicts_ahead is
  'Fresh blocked crossings ahead of the driver on the active route, nearest first. Three filters '
  'only — corridor, ahead-of-driver, red — and NO distance ceiling: a conflict 40 km ahead is '
  'flagged exactly like one 200 m ahead (ADR 0003). meters_ahead orders and informs the alert; it '
  'never suppresses one.';

grant execute on function conflicts_ahead(jsonb, double precision, double precision, double precision, int)
  to anon, authenticated;

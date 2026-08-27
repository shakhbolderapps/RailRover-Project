-- 0003 — crossing_status view and nearest-crossing lookup.
--
-- Phase 1. This view is the authoritative implementation of the colour rules;
-- packages/shared/src/crossing-status.ts is its client-side mirror. Both are tested against the
-- same SOW acceptance criteria, because two implementations of one rule is a real duplication
-- risk (see decisions/0002-crossing-status-computed-at-read-time.md).
--
-- The colour is NEVER stored. It is a function of (latest report status, latest report
-- timestamp, now, freshness window). Storing it would need a background job to flip red->yellow
-- at the freshness boundary and would stop the window being genuinely tunable during the pilot.

-- ---------------------------------------------------------------------------------------------
-- The colour rule, as one function so the view, the RPCs and the tests cannot drift apart.
--
-- SOW M2 "Home Map and Crossing Markers" AC2, M2 "Crossing Detail" edge case, M3 "Report Clear"
-- AC2:
--   red     - a fresh blocked report
--   yellow  - a blocked report aged past the freshness window without a clear report
--   green   - a clear report was received; "status returns to green only on a clear report,
--             not on a timer"
--   unknown - no reports at all. Unconfirmed, NOT clear. A distinct fourth state.
-- ---------------------------------------------------------------------------------------------
create or replace function crossing_color(
  last_status      report_status,
  last_reported_at timestamptz,
  freshness_minutes int default null,
  now_ts           timestamptz default now()
) returns text
language sql
immutable
as $$
  select case
    -- No reports at all. Unconfirmed is not clear: green means someone confirmed it clear.
    when last_status is null or last_reported_at is null then 'unknown'

    -- A clear report is the only thing that produces green, and it does so regardless of age.
    -- The app never guesses that a crossing has become blocked again over time.
    when last_status = 'clear' then 'green'

    -- Blocked: red while fresh, yellow once it ages out. Never green.
    when last_reported_at > now_ts
       - (coalesce(freshness_minutes, 15) * interval '1 minute') then 'red'

    else 'yellow'
  end;
$$;

comment on function crossing_color is
  'The three-state colour rule plus the unknown fourth state. Mirrored by computeCrossingColor() '
  'in packages/shared. Never store the result — compute it at read time (ADR 0002).';

-- ---------------------------------------------------------------------------------------------
-- crossing_status — every crossing joined to its computed status.
--
-- Runs with owner rights (the default for a view, i.e. NOT security_invoker) so it can read the
-- reports table on behalf of anonymous drivers without granting them direct select on reports.
-- That is deliberate: drivers see a crossing's status and report count, never who reported it.
-- ---------------------------------------------------------------------------------------------
create or replace view crossing_status as
select
  c.id,
  c.dot_id,
  c.name,
  c.road,
  c.city,
  c.state,
  c.railroad,
  c.geom,
  st_y(c.geom::geometry) as latitude,
  st_x(c.geom::geometry) as longitude,
  c.is_active,

  r.status      as last_status,
  r.reported_at as last_reported_at,

  coalesce(rc.report_count, 0) as report_count,

  crossing_color(
    r.status,
    r.reported_at,
    config_int('freshness_window_minutes', 15)
  ) as color

from crossings c

-- The most recent live report for this crossing. SOW M3 "Report Clear" edge case: "A crossing is
-- reported clear while another driver reports it blocked -> System keeps the most recent report
-- and reflects it in the crossing status." Most recent wins, always — which this ORDER BY is.
left join lateral (
  select status, reported_at
  from reports
  where crossing_id = c.id
    and not is_removed
  order by reported_at desc
  limit 1
) r on true

left join lateral (
  select count(*)::int as report_count
  from reports
  where crossing_id = c.id
    and not is_removed
) rc on true;

comment on view crossing_status is
  'Crossings with read-time computed colour. The single thing the map, crossing detail and route '
  'conflict logic read. Exposes aggregates only — never a reporter device_id.';

grant select on crossing_status to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- nearest_crossing — used by BOTH report flows to auto-select the crossing (SOW M3).
--
-- The driver taps "blocked"; the system picks the crossing. That is what makes a two-tap,
-- under-five-second report possible.
-- ---------------------------------------------------------------------------------------------
create or replace function nearest_crossing(
  lat double precision,
  lng double precision,
  max_meters double precision default null
) returns table (
  id uuid,
  dot_id text,
  name text,
  road text,
  city text,
  state text,
  railroad text,
  latitude double precision,
  longitude double precision,
  last_status report_status,
  last_reported_at timestamptz,
  report_count int,
  color text,
  meters_away double precision
)
language sql
stable
as $$
  with driver as (
    select st_setsrid(st_makepoint(lng, lat), 4326)::geography as g
  ),
  limit_m as (
    -- Defaults to the configured report radius, so "nearest crossing I am allowed to report"
    -- and "nearest crossing" are the same question by default.
    select coalesce(max_meters, config_number('report_radius_meters', 1609.344)) as m
  )
  select
    cs.id, cs.dot_id, cs.name, cs.road, cs.city, cs.state, cs.railroad,
    cs.latitude, cs.longitude,
    cs.last_status, cs.last_reported_at, cs.report_count, cs.color,
    st_distance(cs.geom, (select g from driver)) as meters_away
  from crossing_status cs
  where cs.is_active
    -- ST_DWithin on geography uses the GiST index, so this stays fast as the inventory grows
    -- from the 50-mile development set to the full pilot radius.
    and st_dwithin(cs.geom, (select g from driver), (select m from limit_m))
  order by cs.geom <-> (select g from driver)
  limit 1;
$$;

comment on function nearest_crossing is
  'Nearest active crossing within max_meters (default: the configured report radius). Returns no '
  'row when the driver is too far — SOW M3 edge case: the driver is too far to observe it.';

-- ---------------------------------------------------------------------------------------------
-- crossings_in_bounds — the map viewport query (SOW M2).
--
-- The map must never fetch the whole inventory. At the full pilot radius that is ~13k rows;
-- even at the 50-mile development radius it is ~1.7k. Query the viewport, cluster the rest.
-- ---------------------------------------------------------------------------------------------
create or replace function crossings_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  max_rows int default 2000
) returns setof crossing_status
language sql
stable
as $$
  select *
  from crossing_status
  where is_active
    and st_intersects(
      geom,
      st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    )
  limit max_rows;
$$;

comment on function crossings_in_bounds is
  'Crossings inside a map viewport. Bounded by max_rows so a zoomed-out map degrades to a '
  'capped result rather than pulling the entire inventory.';

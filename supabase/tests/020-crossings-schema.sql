-- pgTAP: crossings inventory guarantees (SOW M2 "Crossing Inventory").
--
-- Risk-register item #2 is grade-separated crossings reaching the inventory. The ingest script
-- filters them; this asserts the database refuses them even if the script is bypassed.

begin;
select plan(11);

select has_table('crossings', 'crossings table exists');
select has_table('reports', 'reports table exists');
select has_column('crossings', 'dot_id', 'crossings has the FRA dot_id');
select col_is_unique('crossings', 'dot_id', 'M2-AC1: dot_id is unique — the natural upsert key');
select has_index('crossings', 'crossings_geom_idx', 'crossings has a GiST index on geom');

-- ---------------------------------------------------------------------------------------------
-- The at-grade guarantee, enforced structurally rather than by convention.
-- ---------------------------------------------------------------------------------------------
select throws_ok(
  $$insert into crossings (dot_id, geom, is_at_grade)
    values ('TEST-OVERPASS', st_setsrid(st_makepoint(-83.5379, 41.6528), 4326)::geography, false)$$,
  '23514',
  null,
  'a grade-separated crossing CANNOT be inserted — an overpass can never be blocked by a train'
);

-- ---------------------------------------------------------------------------------------------
-- Idempotency: re-running the ingest, or expanding the radius, updates rather than duplicates.
-- ---------------------------------------------------------------------------------------------
insert into crossings (dot_id, name, road, city, state, geom)
values ('TEST-001', 'Central Ave', 'Central Ave', 'Toledo', 'Ohio',
        st_setsrid(st_makepoint(-83.5379, 41.6528), 4326)::geography);

insert into crossings (dot_id, name, road, city, state, geom)
values ('TEST-001', 'Central Avenue', 'Central Avenue', 'Toledo', 'Ohio',
        st_setsrid(st_makepoint(-83.5380, 41.6529), 4326)::geography)
on conflict (dot_id) do update
  set name = excluded.name, road = excluded.road, geom = excluded.geom, updated_at = now();

select is(
  (select count(*)::int from crossings where dot_id = 'TEST-001'),
  1,
  'M2: re-ingesting the same dot_id upserts rather than duplicating'
);

select is(
  (select road from crossings where dot_id = 'TEST-001'),
  'Central Avenue',
  'M2: an upsert applies the newer values'
);

-- ---------------------------------------------------------------------------------------------
-- SOW M5: an administrator corrects a crossing's coordinates and the correction must flow
-- through to everything that reads the inventory. There is only one table, so it does — assert
-- it rather than assume it.
-- ---------------------------------------------------------------------------------------------
update crossings
set geom = st_setsrid(st_makepoint(-83.6000, 41.7000), 4326)::geography
where dot_id = 'TEST-001';

select is(
  (select round(longitude::numeric, 4) from crossing_status where dot_id = 'TEST-001'),
  round((-83.6000)::numeric, 4),
  'M5: a coordinate correction is visible through crossing_status immediately'
);

select ok(
  (select updated_at > created_at from crossings where dot_id = 'TEST-001'),
  'updated_at is maintained by trigger'
);

select is(
  (select color from crossing_status where dot_id = 'TEST-001'),
  'unknown',
  'a freshly ingested crossing with no reports is unknown, not green'
);

select * from finish();
rollback;

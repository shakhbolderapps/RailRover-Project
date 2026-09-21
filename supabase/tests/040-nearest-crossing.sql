-- pgTAP: nearest_crossing (SOW M3 AC1/AC2 — the auto-selection both report flows depend on).
--
-- The roadmap's Phase-2 cases: a driver 0.9 mi away may report; 1.1 mi away may not.
-- The authoritative distance enforcement lives in submit_report (Phase 2); this asserts the
-- lookup those checks are built on.

begin;
select plan(8);

select has_function('nearest_crossing', 'nearest_crossing() exists');

-- These assertions are about which crossing is NEAREST, which is a question about the whole
-- inventory, not just about the fixtures below. Once the FRA ingest ran, the real inventory
-- contained a crossing 2,450 m from the pilot centre — nearer than this file's own "2 miles
-- away" fixture — and three assertions started failing on data rather than on logic.
--
-- So take control of the inventory explicitly. The delete is inside the test transaction and is
-- undone by the rollback at the end of the file; it never touches the real table. Stating the
-- isolation requirement beats depending on the table happening to be empty.
delete from crossings;

-- Fixture: two crossings at known distances due north of a driver at the Toledo pilot centre.
-- 1 degree of latitude ~= 111,320 m, so the offsets below are ~0.5 mi and ~2 mi.
insert into crossings (dot_id, name, road, city, state, geom) values
  ('NEAR-1', 'Close Crossing', 'Central Ave', 'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.5379, 41.6528 + (0.5 * 1609.344 / 111320)), 4326)::geography),
  ('FAR-1',  'Far Crossing',   'Alexis Rd',   'Toledo', 'Ohio',
   st_setsrid(st_makepoint(-83.5379, 41.6528 + (2.0 * 1609.344 / 111320)), 4326)::geography);

-- ---------------------------------------------------------------------------------------------
-- Picks the nearest, not just any within range.
-- ---------------------------------------------------------------------------------------------
select is(
  (select dot_id from nearest_crossing(41.6528, -83.5379)),
  'NEAR-1',
  'M3-AC1: the nearest crossing is auto-selected'
);

select ok(
  (select meters_away < 1000 from nearest_crossing(41.6528, -83.5379)),
  'the returned distance is plausible for a half-mile offset'
);

-- ---------------------------------------------------------------------------------------------
-- The radius bound. SOW M3 edge case: "The driver is not within about a mile of a known crossing
-- -> System does not allow a report, since the driver is too far to observe the crossing."
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from nearest_crossing(41.6528, -83.5379, 1609.344)),
  1,
  'M3-AC2: a crossing 0.5 mi away is inside the one-mile report radius'
);

-- Remove the near crossing; the far one (2 mi) must now be out of range.
delete from crossings where dot_id = 'NEAR-1';

select is(
  (select count(*)::int from nearest_crossing(41.6528, -83.5379, 1609.344)),
  0,
  'M3-AC2: a crossing 2 mi away is outside the one-mile radius — no row is returned'
);

select is(
  (select dot_id from nearest_crossing(41.6528, -83.5379, 5000)),
  'FAR-1',
  'M3-AC2: the radius is configurable — a wider radius reaches the same crossing'
);

-- ---------------------------------------------------------------------------------------------
-- Defaults come from app_config, so tuning the radius during the pilot needs no code change.
-- ---------------------------------------------------------------------------------------------
update app_config set value = '5000' where key = 'report_radius_meters';

select is(
  (select dot_id from nearest_crossing(41.6528, -83.5379)),
  'FAR-1',
  'M3-AC2: with no explicit limit, the radius comes from app_config'
);

-- ---------------------------------------------------------------------------------------------
-- Retired crossings are not offered for reporting.
-- ---------------------------------------------------------------------------------------------
update crossings set is_active = false where dot_id = 'FAR-1';

select is(
  (select count(*)::int from nearest_crossing(41.6528, -83.5379, 50000)),
  0,
  'an inactive crossing is never auto-selected'
);

select * from finish();
rollback;

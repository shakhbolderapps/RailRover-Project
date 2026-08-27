-- pgTAP: the colour rule (SOW M2 AC2, M2 Crossing Detail edge case, M3 Report-Clear AC2).
--
-- This is the SQL half of ADR 0002. packages/shared/src/crossing-status.test.ts asserts the same
-- criteria against the TypeScript mirror. Two implementations of one rule, both tested against
-- the contract — that is what keeps them from drifting.
--
-- Time is passed in explicitly. No test sleeps.

begin;
select plan(14);

select has_function('crossing_color', 'crossing_color() exists');

-- ---------------------------------------------------------------------------------------------
-- The four states
-- ---------------------------------------------------------------------------------------------
select is(
  crossing_color('blocked', now() - interval '1 minute', 15, now()),
  'red',
  'M2-AC2: a fresh blocked report shows RED'
);

select is(
  crossing_color('blocked', now() - interval '16 minutes', 15, now()),
  'yellow',
  'M2-AC2: a blocked report aged past the freshness window shows YELLOW'
);

select is(
  crossing_color('clear', now() - interval '1 minute', 15, now()),
  'green',
  'M2-AC2: a clear report shows GREEN'
);

select is(
  crossing_color(null, null, 15, now()),
  'unknown',
  'M2 Crossing Detail edge case: a crossing with no reports is UNKNOWN, not green'
);

-- ---------------------------------------------------------------------------------------------
-- Green is never reached on a timer. This is the criterion that makes green mean
-- "someone confirmed it clear" rather than "we stopped hearing about it".
-- ---------------------------------------------------------------------------------------------
select is(
  crossing_color('blocked', now() - interval '1 day', 15, now()),
  'yellow',
  'M3 Report-Clear AC2: a day-old blocked report is still yellow, never green'
);

select is(
  crossing_color('blocked', now() - interval '30 days', 15, now()),
  'yellow',
  'M3 Report-Clear AC2: a month-old blocked report is still yellow, never green'
);

select is(
  crossing_color('clear', now() - interval '7 days', 15, now()),
  'green',
  'a clear report stays green however old — the app does not guess re-blocking'
);

-- ---------------------------------------------------------------------------------------------
-- Freshness boundary. Roadmap Phase-2 case: blocked at T reads red at T+14m, yellow at T+16m.
-- ---------------------------------------------------------------------------------------------
select is(
  crossing_color('blocked', now() - interval '14 minutes', 15, now()),
  'red',
  'blocked at T reads RED at T+14m'
);

select is(
  crossing_color('blocked', now() - interval '16 minutes', 15, now()),
  'yellow',
  'blocked at T reads YELLOW at T+16m'
);

select is(
  crossing_color('blocked', now() - interval '15 minutes', 15, now()),
  'yellow',
  'at exactly the freshness window the report is no longer fresh'
);

-- ---------------------------------------------------------------------------------------------
-- The window is genuinely configurable — SOW §8 says these defaults are "tuned during the pilot".
-- ---------------------------------------------------------------------------------------------
select is(
  crossing_color('blocked', now() - interval '20 minutes', 15, now()),
  'yellow',
  'a 20-minute-old report is yellow under a 15-minute window'
);

select is(
  crossing_color('blocked', now() - interval '20 minutes', 30, now()),
  'red',
  'the SAME report is red under a 30-minute window — the window is configurable'
);

-- ---------------------------------------------------------------------------------------------
-- The TypeScript mirror and the SQL must agree on the default.
-- ---------------------------------------------------------------------------------------------
select is(
  (select value::int from app_config where key = 'freshness_window_minutes'),
  15,
  'SOW §7: the seeded freshness window default is 15 minutes'
);

select * from finish();
rollback;

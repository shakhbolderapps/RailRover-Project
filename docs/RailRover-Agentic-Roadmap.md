# RailRover — Solo Agentic Development Roadmap (Zero-Cost Stack)

**Source of truth:** Bolder Apps × RailRover Scope of Work, Doc Ref QNZJP-QGWUO-ST8BC-3XA3G
**Your role:** solo developer + QA, working agentically
**Constraint:** no paid services, no billing-enabled accounts

---

## 0. The Stack Swap

The SoW's stack has three components that require a credit card. Everything else already has a usable free tier. Here is the substitution table.

| SoW says | Problem | Free replacement | Notes |
|---|---|---|---|
| Google Maps SDK (map display) | Requires billing-enabled GCP account | **MapLibre** + **OpenFreeMap** tiles | No API key at all. `@maplibre/maplibre-react-native` on mobile, `maplibre-gl` on web. Attribution required. |
| Google Directions API (routes, alternatives) | Billing required | **OpenRouteService** free key | 2,000 directions/day, 40/min. Supports `alternative_routes` (max 3) and — critically — `avoid_polygons`. |
| Google Geocoding API | Billing required | **Photon** (autocomplete) + **Nominatim** (resolve) | Both keyless. Nominatim policy: 1 req/sec max, must set a real `User-Agent`, no autocomplete-per-keystroke. Photon is built for typeahead. ORS also bundles Pelias geocoding on the free key. |
| Google Places | Billing required | **Nominatim** / **Overpass API** | Only needed for destination search; Photon covers it. |
| Apple Developer Program ($99/yr) | Hard paywall | **No substitute** | Blocks: TestFlight, App Store, iOS push, real-device iOS installs. See §11. |
| Google Play Console ($25 one-time) | Hard paywall | **Direct APK / Firebase App Distribution** | Free for internal testing. Only blocks public Play listing. |
| Supabase | Free tier is fine | **Supabase Free** | 2 projects (use as dev + prod), 500 MB DB, PostGIS available, 200 concurrent realtime, 2M realtime msgs/mo. **Auto-pauses after 7 days of no DB activity** — mitigate with a GitHub Actions cron ping. |
| Expo + FCM | Free tier is fine | **Expo Push + FCM** | FCM needs a Firebase project (free, no billing). Expo: 15 Android + 15 iOS cloud builds/mo; **local builds are unlimited and free**. |
| Sentry | Free tier is fine | **Sentry Free** or **GlitchTip** (self-host) | Optional per SoW anyway. |
| Vercel | Free tier is fine | **Vercel Hobby** / **Cloudflare Pages** / **Netlify** | Any is fine for a static React admin panel. |
| — | — | **OSRM or Valhalla in Docker** | Self-hosted routing on an Ohio OSM extract. Zero quota, offline, deterministic. Use for automated tests so you never burn ORS quota in CI. Valhalla supports `exclude_polygons`, which mirrors ORS `avoid_polygons`. |

### Two decisions that matter more than the rest

**1. Route the app through a routing *adapter*, not through ORS directly.**
Define one internal interface — `getRoutes(origin, dest, opts)` and `getRouteAvoiding(origin, dest, avoidPolygon)` — and write two implementations: ORS (production) and local Valhalla/OSRM (tests + dev). This gives you unlimited free testing, protects you from the 2,000/day cap, and means the day the client funds a Google Maps account you swap one file.

**2. Compute crossing status at read time, never store a color.**
`red / yellow / green` is a pure function of `(latest report status, latest report timestamp, now, freshness_window)`. If you store the color you need a background job to flip red → yellow at the 15-minute mark. If you compute it, red → yellow happens for free and the freshness window stays genuinely configurable — which the SoW explicitly requires ("ship at these defaults and are tuned during the pilot").

---

## 1. How to Work Agentically on This

Agentic development fails on ambiguity, not on difficulty. Your job as the human is to remove ambiguity before each agent run, and to be the QA gate after it.

**Set up before you write any feature code:**

- **`AGENTS.md` at repo root.** Stack, directory layout, naming conventions, "never do X" rules, how to run tests, how to run the local routing container. Every agent session reads this first.
- **`/specs/` directory, one file per SoW feature.** Copy the SoW's Description / User Flow / Edge Cases / Acceptance Criteria verbatim into `specs/M4-route-conflict-detection.md` etc. The SoW's acceptance criteria are unusually well written — they are already your test cases. Do not paraphrase them.
- **`/decisions/` ADR log.** One short file per non-obvious choice (why MapLibre, why read-time status, corridor units in meters not feet). Agents will otherwise re-litigate settled decisions every session.
- **Definition of Done, enforced every task:** code + unit tests + the SoW acceptance criteria mapped to assertions + one manual pass on device/browser + spec file updated if reality diverged.

**Task sizing.** One agent session = one feature from §6 of the SoW, or one slice of a big one. "Build Module 4" is too big and will produce plausible garbage. "Implement `crossings_on_route()` RPC with corridor and ahead-of-driver filtering, plus pgTAP tests against the seeded Toledo fixture" is right.

**The solo-QA trap.** You will approve your own work. Counter it structurally: write the test from the SoW acceptance criterion *before* the agent implements, and never let the agent write both the implementation and the assertion for the same criterion in the same session.

---

## 2. Phase 0 — Foundation & Guardrails (2–3 days)

Goal: a repo where an agent can be productive without asking you anything.

**Tasks**
1. Monorepo: `/apps/mobile` (Expo), `/apps/admin` (Vite + React), `/packages/shared` (types, status logic, geo helpers), `/supabase` (migrations, functions, seed), `/specs`, `/decisions`, `/scripts`.
2. Expo app with `expo-router`, TypeScript strict mode, ESLint + Prettier.
3. Supabase local dev: `supabase init`, `supabase start` (Docker). This is your real dev environment — the hosted free project is for staging/demo only.
4. Enable PostGIS in the first migration: `create extension if not exists postgis;`
5. Local routing container: Valhalla or OSRM with an Ohio + Michigan + Indiana OSM extract from Geofabrik. Script it as `scripts/routing-up.sh`.
6. GitHub Actions: typecheck, lint, unit tests on PR. Plus a daily cron job that hits your hosted Supabase to prevent the 7-day pause.
7. Write `AGENTS.md`, seed `/specs` from the SoW, first ADRs.

**QA gate:** clone fresh, run one setup command, get a running app + running DB + running router. If that isn't true, fix it now — you'll pay for it fifty times otherwise.

---

## 3. Phase 1 — Crossing Data & Schema (3–4 days)

Goal: real Toledo crossings in a spatially-indexed database. This is the single highest-leverage phase — every other module reads from it.

**Get the data.** FRA Crossing Inventory Form 71 (Current) from `data.transportation.gov`, dataset `m2f8-22s6`. Public domain, available as CSV / GeoJSON / KML. Fields you need: Crossing ID, latitude, longitude, street/road name, city, state, plus `Crossing Position` (at-grade vs grade-separated) and `Crossing Status` (active/closed).

**Filter hard.** Two filters matter:
- **Grade-separated crossings must be excluded.** An overpass or underpass can never be blocked by a train. If you include them your map will be full of crossings that never turn red, and your route-conflict logic will flag bridges. Keep only at-grade, active, public crossings.
- **Radius.** The SoW says ~200 miles around Toledo (41.6528, −83.5379). That is enormous — it reaches Detroit, Cleveland, Columbus, Indianapolis, Fort Wayne, and into Ontario, and lands you somewhere in the tens of thousands of crossings. Recommendation: **build and test against a 50-mile radius**, keep the ingest script parameterized, and expand to 200 before pilot launch. You want fast test cycles now, not a slow map.

**Schema**

```sql
create table crossings (
  id            uuid primary key default gen_random_uuid(),
  dot_id        text unique not null,        -- FRA crossing ID
  name          text,
  road          text,
  city          text,
  state         text,
  geom          geography(Point, 4326) not null,
  is_active     boolean not null default true,
  source        text not null default 'FRA',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index crossings_geom_idx on crossings using gist (geom);

create type report_status as enum ('blocked', 'clear');

create table reports (
  id            uuid primary key default gen_random_uuid(),
  crossing_id   uuid not null references crossings(id) on delete cascade,
  status        report_status not null,
  device_id     text not null,
  user_id       uuid references auth.users(id),
  reported_at   timestamptz not null default now(),
  reporter_geom geography(Point, 4326),      -- for abuse review + distance audit
  is_removed    boolean not null default false,
  removed_by    uuid references auth.users(id),
  removed_at    timestamptz
);
create index reports_crossing_time_idx on reports (crossing_id, reported_at desc)
  where is_removed = false;
```

Plus `app_config` (key/value for `freshness_window_minutes`, `route_corridor_meters`, `report_radius_meters`), `devices`, `profiles` with a `role` column, `notifications`, and `notification_recipients`.

**Status as a view, not a column**

```sql
create or replace view crossing_status as
select
  c.id,
  c.dot_id, c.name, c.road, c.city, c.geom,
  r.status        as last_status,
  r.reported_at   as last_reported_at,
  (select count(*) from reports x
     where x.crossing_id = c.id and not x.is_removed) as report_count,
  case
    when r.id is null then 'unknown'
    when r.status = 'clear' then 'green'
    when r.reported_at > now() - (
      (select value::int from app_config where key='freshness_window_minutes')
      * interval '1 minute') then 'red'
    else 'yellow'
  end as color
from crossings c
left join lateral (
  select * from reports
  where crossing_id = c.id and not is_removed
  order by reported_at desc limit 1
) r on true;
```

Note the fourth state: `unknown`. The SoW's Crossing Detail edge case says a crossing with no reports "shows as unconfirmed with no recent report time" — that is not green. Green means *someone confirmed it clear*. Don't collapse these.

**RLS from day one, not later.** Anonymous/guest can `select` crossings and `insert` reports (with constraints). Only `role = 'admin'` can update crossings or soft-delete reports. Write pgTAP tests that assert an anon key *cannot* update a crossing.

**QA gate:** ~N thousand crossings loaded; a `ST_DWithin` query for crossings within 1 mile of a Toledo point returns in under 50 ms; RLS tests pass; re-running the ingest script is idempotent (upsert on `dot_id`).

---

## 4. Phase 2 — Reporting Engine (3–4 days)

Goal: the write path, correct and abuse-resistant, before any UI exists.

Implement report submission as a **Postgres RPC / Edge Function**, not a raw table insert from the client. The distance check and rate limit must be server-side — a client-side check is decoration.

```
submit_report(crossing_id, status, device_id, lat, lng) →
  1. load crossing, load app_config
  2. reject if ST_Distance(crossing.geom, driver_point) > report_radius_meters
  3. reject if this device submitted > N reports in the last M minutes
  4. reject if device is suspended
  5. insert report
  6. return the recomputed crossing_status row
```

Also implement `nearest_crossing(lat, lng, max_meters)` — used by both report flows for auto-selection.

**Test these explicitly** (each is a literal SoW edge case):
- Driver at 0.9 mi → allowed. At 1.1 mi → rejected with a clear reason.
- Same crossing reported blocked twice → latest wins, freshness timer resets.
- Blocked then clear 30 seconds later → green. Clear then blocked → red. Most recent wins, always.
- Blocked report at T, read at T+14m → red. At T+16m → yellow. Never green on a timer.
- Rate limit trips on the Nth rapid submission from one device.
- Admin soft-deletes the only blocked report → crossing reverts to whatever the prior report said, or `unknown`.

**QA gate:** all of the above green in automated tests, with time frozen/injected rather than `sleep()`.

---

## 5. Phase 3 — Mobile Shell: Auth, Location, Map (5–7 days)

**3a. Guest + account (SoW M1)**
Supabase `signInAnonymously()` gives you a real session for guests, which makes RLS and report attribution far cleaner than a homegrown device-token scheme. Generate a stable `device_id` with `expo-secure-store` and attach it to every report. On guest → account upgrade, Supabase links the anonymous user, so settings and report history carry over automatically — that's the SoW edge case satisfied by the platform.

Error copy must be exactly `"Email or password is incorrect."` per the spec.

**3b. Location (SoW M1)**
`expo-location`, foreground permission only for MVP. Write the honest purpose string. Handle both edge cases: permission denied (explain what breaks, deep-link to Settings) and signal lost (hold last known position, resume silently).

Architect for later background use *now*, as the SoW requires: put all location access behind a `LocationService` with a subscription model, so enabling `expo-task-manager` background tracking later is one implementation swap, not a refactor.

**3c. Map (SoW M2)**
MapLibre + OpenFreeMap style URL. Red/yellow/green/grey markers.

**Do not render thousands of individual markers.** Two techniques together: query only crossings in the current viewport bbox (`ST_MakeEnvelope` + `ST_Intersects`), and render them as a MapLibre GeoJSON source with `cluster: true` at low zoom. Naïve per-marker rendering will make the map unusable at Toledo-metro density.

**3d. Crossing detail (SoW M2)**
Status, last report time (relative — "4 minutes ago"), report count, on-route indicator, and both report buttons.

**QA gate:** cold start → map centered on you in under 3 seconds; markers correct against DB state; panning across the metro area stays at 60fps; permission-denied path doesn't crash or dead-end.

---

## 6. Phase 4 — Report Flows (2–3 days)

Goal: the SoW's hardest non-technical requirement — **two taps, under five seconds, while driving.**

Big bottom-sheet buttons. Auto-select nearest crossing on press. Confirm. Done. **No note field** — the SoW is explicit and correct about this. Optimistic UI: flip the marker instantly, roll back on server rejection.

Design the "too far to report" state carefully. It's not an error the driver caused; it's the system saying *you can't see this crossing from here*. Say that.

**QA gate:** literally time yourself. Stopwatch, phone mounted, from app-open to report-submitted. If it's over 5 seconds, the flow fails the spec regardless of what the tests say. Also test one-handed, in sunlight, and with gloves if fleet drivers are the target.

---

## 7. Phase 5 — Destination & Route Options (4–5 days)

**Geocoding.** Photon for typeahead (debounced 300 ms), Nominatim to resolve the final selection. Respect Nominatim's 1 req/sec and set a descriptive `User-Agent` — they will block you otherwise, and being blocked mid-pilot is a bad day.

**Routing.** ORS `/v2/directions/driving-car` with `alternative_routes: { target_count: 3, share_factor: 0.6 }`. Returns encoded polylines.

**Crossing count per route** — the differentiating feature. Send the decoded route line to a Postgres RPC:

```sql
create or replace function crossings_on_route(
  route geography(LineString,4326),
  corridor_m double precision
) returns setof crossing_status as $$
  select cs.* from crossing_status cs
  where ST_DWithin(cs.geom, route, corridor_m)
$$ language sql stable;
```

The GiST index makes this fast; PostGIS handles the bounding-box prefilter the SoW describes internally, so you don't hand-roll it.

Each route card shows: travel time, total crossings, currently-blocked count. Draw all options, highlight the selected one, persist it as the active route.

**Watch the ORS caps.** Alternative routes are limited to 100 km; routes using avoid areas to 150 km. Toledo-area trips are well inside that, but handle the over-limit error explicitly rather than showing a spinner forever. Handle "destination not found" and "no route available" as the SoW requires.

**QA gate:** a known Toledo A→B pair returns 2–3 options with different crossing counts that you have manually verified against the map. Route requests during automated tests hit your local Valhalla, never ORS.

---

## 8. Phase 6 — Conflict Detection, Alerts, Reroute (6–8 days)

This is the core of the product and where an agent is most likely to produce something that looks right and is wrong. Slow down here.

**8a. Conflict detection**

The SoW spells out the exact algorithm. Implement it in that order:

```sql
create or replace function conflicts_ahead(
  route geography(LineString,4326),
  driver geography(Point,4326),
  corridor_m double precision,
  freshness_min int
) returns table (crossing_id uuid, name text, road text,
                 meters_ahead double precision, last_reported_at timestamptz) as $$
  with route_g as (select route::geometry as g),
  on_route as (
    select cs.*,
           ST_LineLocatePoint((select g from route_g), cs.geom::geometry) as t
    from crossing_status cs
    where ST_DWithin(cs.geom, route, corridor_m)
  ),
  driver_t as (
    select ST_LineLocatePoint((select g from route_g), driver::geometry) as t
  )
  select o.id, o.name, o.road,
         ST_Length(ST_LineSubstring((select g from route_g),
                   (select t from driver_t), o.t)::geography) as meters_ahead,
         o.last_reported_at
  from on_route o
  where o.t > (select t from driver_t)          -- ahead of driver
    and o.color = 'red'                          -- fresh blocked only
  order by meters_ahead asc
$$ language sql stable;
```

`ST_LineLocatePoint` returns a 0–1 position along the line — that's your ahead/behind test and your ordering, in one primitive.

**Three things the SoW is emphatic about, that are easy to get wrong:**
1. **200 feet is the corridor width, not an alert distance.** The doc says this twice because it's the obvious misreading. Store it in meters (≈61 m) in `app_config`; convert only for display.
2. **Flag a fresh blocked crossing *however far ahead* it is.** Not "when the driver gets close." There is no proximity threshold on the alert.
3. **Real-time during an active trip.** A report submitted by another driver 20 minutes into your trip must trigger your check. Not a snapshot from trip start.

**8b. Realtime wiring**
Supabase Realtime subscription on `reports`, filtered to crossings on the active route. On any new report → re-run `conflicts_ahead`. Also re-run on driver movement (throttled, ~every 10 s or 100 m) and on a slow interval as a safety net. Free tier gives you 200 concurrent connections and 2M messages/month — ample for a pilot, but subscribe narrowly, not to the whole table.

**8c. The alert**
Crossing name/road, last report time, ETA to crossing when computable. Auto-reroute ON by default → countdown preview the driver can cancel. Auto-reroute OFF → three buttons: reroute, keep current route, view crossing. Alert must clear when the crossing is reported clear or when the driver passes it. Multiple conflicts → nearest surfaced, rest go to Active Alerts.

**8d. Reroute**
This is the piece that made the SoW hedge, and ORS handles it better than Google does. Build a small avoidance polygon around the blocked crossing — a square roughly 200–300 m per side — and pass it as `avoid_polygons`:

```json
{
  "coordinates": [[origin_lng, origin_lat], [dest_lng, dest_lat]],
  "options": {
    "avoid_polygons": {
      "type": "Polygon",
      "coordinates": [[[lng1,lat1],[lng2,lat1],[lng2,lat2],[lng1,lat2],[lng1,lat1]]]
    }
  }
}
```

Constraints to respect: polygon ≤ 200 km² and ≤ 20 km on a side (a 300 m square is trivially inside), and total route distance ≤ 150 km when avoid areas are used.

Then, per the SoW: **compute it in the background before the driver is alerted** (so the alternate is ready the instant the alert fires), **run the alternate through `conflicts_ahead` before offering it** (don't reroute someone into a second blocked crossing), and **handle "no better alternate exists"** by keeping the current route and saying so plainly. MVP avoids *one* crossing, not several.

If the polygon is too small to force a detour, widen it and retry once, then give up gracefully.

**8e. Active Alerts list** — on-route conflicts first, empty state, tap to detail.

**QA gate:** build a **route simulator** — a script that replays a GPX track through your app's location layer and injects reports at scripted timestamps. This single tool is worth more than every other test in the project, because it's the only way to test this module repeatedly without driving around Ohio. Assert: alert fires once (not on a loop), fires for a report injected mid-trip, does not fire for a crossing 250 ft off-route, does not fire for a crossing behind you, clears on a clear report, and the reroute actually avoids the crossing.

---

## 9. Phase 7 — Notifications (2–3 days)

Expo Push (free) + a Firebase project for FCM Android credentials (free, no billing). Server-side dispatch from a Supabase Edge Function.

In-app inbox with read/unread, grouping when several arrive together, deep-link to the related crossing or alert, permission toggles in settings. Denied push → inbox still works while the app is open, exactly as the SoW says.

**iOS reality:** APNs requires a paid Apple Developer account. Build the full push path and test it on Android; on iOS the in-app inbox carries you until the account exists. Note this openly as a known gap, don't paper over it.

---

## 10. Phase 8–9 — Web Admin Panel & Analytics (5–7 days)

Vite + React + TypeScript, Supabase JS client, MapLibre GL JS for the crossing editor, TanStack Table for queues. Deploy to Vercel Hobby or Cloudflare Pages.

- **Admin auth** — separate from drivers. Enforce with an RLS policy on `profiles.role = 'admin'`, not with a hidden route. Rate-limit and lock after repeated failures.
- **Crossing inventory management** — add/edit/remove, drag a marker to correct coordinates. Coordinate edits must immediately affect map and conflict logic (they will, since everything reads the same table — verify it).
- **Report review + user management** — recent reports queue, soft-delete a bad report (and confirm the crossing state recomputes), suspend/reinstate a driver, discount a suspended reporter's reports.
- **Broadcast notifications** — all users or a segment, delivered via push + inbox, logged with audience and timestamp.
- **Pilot analytics** — active reports, total reports, alerts fired, reroutes taken, most-affected crossings, with a time-window selector. Back it with `alert_events` and `reroute_events` tables you should start writing to back in Phase 6 — retrofitting analytics logging is miserable.

**QA gate:** Playwright E2E for each admin flow. One test that specifically proves a non-admin session is rejected from every admin endpoint.

---

## 11. Phase 10 — Hardening & Release Prep (4–5 days)

**Security** (SoW §7): TLS is Supabase default; Postgres at-rest encryption is Supabase default; audit against OWASP Top 10; confirm rate limiting and the 1-mile radius check are server-enforced; run `npm audit`; scan for leaked keys.

**Privacy & store compliance:** purpose strings, privacy manifest / data-safety declarations, account deletion that actually deletes. The SoW puts ToS and Privacy Policy on the client — chase those, they gate submission.

**Performance:** map with 5,000+ crossings in viewport, conflict check under 500 ms, battery drain over a 1-hour simulated trip.

**Free-tier operational checks:** confirm the Supabase keep-alive cron works; add graceful degradation for ORS 403 (daily quota) and 429 (per-minute) — cache route responses, back off, and tell the driver something true rather than hanging.

**The three real blockers you cannot code around:**

| Blocker | Cost | Workaround until funded |
|---|---|---|
| Apple Developer Program | $99/yr | Simulator + Expo Go for iOS. No device testing, no TestFlight, no push, no submission. |
| Google Play Console | $25 once | Signed APK via Firebase App Distribution (free) for pilot testers. |
| Google Maps Platform | Billing account | Not needed at all with MapLibre + ORS. This one is genuinely solved. |

Raise the two store accounts with the client early. They're SoW dependencies ("Apple Developer Program and Google Play Console accounts owned and provided by you"), so they're the client's obligation — but if they arrive in week six they'll delay you, and $124 total is not a negotiation worth having late.

---

## 12. Suggested Sequence

| Week | Focus | Ships |
|---|---|---|
| 1 | Phase 0 + 1 | Repo, agent guardrails, FRA data loaded, schema + RLS + PostGIS |
| 2 | Phase 2 + 3a/3b | Report engine tested headless; guest auth; location layer |
| 3 | Phase 3c/3d + 4 | Live map with markers, crossing detail, both report flows |
| 4 | Phase 5 | Destination search, route options with crossing counts |
| 5–6 | Phase 6 | Conflict detection, realtime, alerts, reroute, route simulator |
| 7 | Phase 7 + 8 | Notifications, admin panel |
| 8 | Phase 9 + 10 | Analytics, hardening, pilot build |

The SoW's 6–7 weeks assumes a team with a designer and a separate QA function. Eight weeks solo with agents is realistic if Phase 6 goes well, ten if it doesn't. Phase 6 is where the schedule actually lives — protect the time.

---

## 13. Risk Register

| Risk | Why it bites | Mitigation |
|---|---|---|
| Misreading 200 ft as alert distance | Alerts fire far too late; core value lost | Named constant `ROUTE_CORRIDOR_METERS`, ADR explaining it, explicit test with a crossing 5 km ahead |
| Grade-separated crossings in the inventory | Bridges flagged as blockable; user trust collapses | Filter in ingest; assert zero grade-separated rows in a test |
| ORS 2,000/day cap during a real pilot | Routing dies mid-trip for real drivers | Adapter pattern; local Valhalla for all tests; cache; monitor `x-ratelimit-remaining`; document the upgrade path |
| Supabase 7-day auto-pause | Demo or pilot silently offline | Daily GitHub Actions cron ping |
| Cold-start problem: nobody reports | Map is all grey; app looks broken | Design an honest "unknown" state; plan pilot seeding with a small driver group |
| Solo QA blind spots | You test what you built the way you built it | Write assertions from SoW criteria before implementation; separate sessions for test and impl |
| Realtime cost of a wide subscription | Burns the 2M msg/mo budget | Subscribe only to crossings on the active route |
| Nominatim blocking your IP | Search dies with no warning | Photon for typeahead, real User-Agent, ≤1 req/s, cache resolved destinations |
| Reroute polygon too small to force detour | "Reroute" returns the same route | Widen-and-retry once, then report honestly that no better route exists |

---

## 14. First Three Agent Prompts

To start immediately:

1. *"Read `/specs/M2-crossing-inventory.md`. Write `scripts/ingest-crossings.ts` that pulls FRA Form 71 current inventory from data.transportation.gov, filters to at-grade + active + public crossings within a configurable radius (default 50 mi) of 41.6528,−83.5379, and upserts into the `crossings` table on `dot_id`. Idempotent. Include a dry-run mode that prints counts by filter stage."*

2. *"Read `/specs/M3-report-blocked.md` and `/specs/M3-report-clear.md`. Implement the `submit_report` Postgres function with server-side distance and rate-limit checks. Then write pgTAP tests for every edge case listed in both spec files. Do not modify the spec files."*

3. *"Read `/specs/M4-route-conflict-detection.md`. Implement `conflicts_ahead()` exactly as the six numbered steps in the User Flow describe. Write a test fixture with a hand-drawn route through 5 known Toledo crossings — one behind the driver, one 250 ft off-route, one with a 20-minute-old blocked report, one with a fresh blocked report, one clear — and assert only the fresh on-route one ahead is returned."*

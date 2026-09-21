# RailRover

Real-time, crowd-sourced railroad-crossing status. Drivers report a crossing **blocked** or
**clear** in two taps; the app checks fresh blocked reports against the driver's active route and
reroutes them around the blockage before they reach it. MVP is a pilot around Toledo, Ohio.

**Source of truth:** [`docs/RailRover-SOW-TechStack-Timeline.pdf`](docs/) — Bolder Apps × RailRover
Scope of Work, Doc Ref QNZJP-QGWUO-ST8BC-3XA3G. Per-feature specs in [`specs/`](specs/) are copied
**verbatim** from it. **Read [`AGENTS.md`](AGENTS.md) before writing any code.**

## Build target: Android now, iOS in lockstep

We test on **Android (APK)** for now — no iOS device is available. The **iOS implementation is
written in parallel and never allowed to fall behind**, so an iOS build can be produced the day a
device arrives with no catch-up work.

That is enforced by tooling, not by intention:

```bash
pnpm parity     # orphan platform files · one-armed Platform.select · unpaired native permissions
```

CI additionally runs `expo prebuild` for **both** platforms on every PR, and asserts the iOS
`Info.plist` really contains the purpose strings and background modes. It proves iOS **builds**;
it does not claim iOS has been **run**. See [`docs/PLATFORM-PARITY.md`](docs/PLATFORM-PARITY.md)
for the contract and the iOS gap register.

## Layout

```
apps/mobile        Expo app — iOS + Android from one source
apps/admin         Vite + React web admin panel (SOW M5)
packages/shared    types, crossing-status logic, geo math, routing adapter — platform-free
supabase/          migrations, RPCs, Edge Functions, pgTAP tests
specs/             one file per SOW feature, acceptance criteria VERBATIM (generated)
decisions/         ADR log — read before arguing with a settled decision
scripts/           parity check, spec generation, APK build, routing container, doctor
docs/              SOW, roadmap, platform-parity contract
```

## Getting started

```bash
bash scripts/doctor.sh          # what works, what is missing, what each gap blocks
pnpm install
cp .env.example apps/mobile/.env

emulator -avd Pixel7_API36 &    # or Pixel7_API35
pnpm android
```

```bash
pnpm verify       # parity + typecheck + lint + test — run before every commit
pnpm apk          # local release APK: unlimited, free, no Play Console needed
pnpm admin        # web admin panel on :5173
pnpm ingest:dry   # preview the FRA crossing ingest — no credentials needed
pnpm db:push      # apply migrations (needs a linked Supabase project)
pnpm db:test      # run the pgTAP suite
```

## The rules that are easy to get wrong

Each has an ADR. These are the ones that quietly break the product if misread:

| Rule | Why | ADR |
|---|---|---|
| **200 ft is the corridor WIDTH, not an alert distance** | A fresh blocked crossing is flagged however far ahead it sits. Warning a driver 200 ft out is worthless | [0003](decisions/0003-corridor-width-is-not-alert-distance.md) |
| **Status is computed at read time, never stored** | Keeps red→yellow free and the freshness window genuinely tunable | [0002](decisions/0002-crossing-status-computed-at-read-time.md) |
| **`unknown` ≠ `green`** | Green means *someone confirmed it clear*. No reports means nobody has looked | [0002](decisions/0002-crossing-status-computed-at-read-time.md) |
| **Green only ever comes from a clear report** | A crossing never clears on a timer | [0002](decisions/0002-crossing-status-computed-at-read-time.md) |
| **Distance + rate limits are server-side** | A client-side check is decoration | [0004](decisions/0004-report-validation-is-server-side.md) |
| **Reroute is route-avoidance, not navigation** | MVP avoids ONE crossing; the alternate is re-checked before being offered | [0005](decisions/0005-reroute-is-route-avoidance.md) |
| **All routing goes through the adapter** | ORS free tier is 2,000/day — tests must never spend it | [0009](decisions/0009-routing-adapter-boundary.md) |

## Stack

React Native (Expo) · MapLibre + OpenFreeMap · Supabase (Postgres + PostGIS + Realtime) ·
OpenRouteService behind an adapter · Photon + Nominatim geocoding · Expo Push + FCM ·
Vite + React admin.

This deviates from the SOW's Google Maps Platform stack because that requires a billing-enabled
account which does not exist yet — see [ADR 0001](decisions/0001-maplibre-and-ors-replace-google-maps.md).
It is reversible in one file.

## Open items needing the client

| Item | Cost | Blocks |
|---|---|---|
| Apple Developer Program | $99/yr | iOS device builds, TestFlight, APNs push |
| Google Play Console | $25 once | Public Play listing (APK sideload works meanwhile) |
| Final product name | — | Branding, store listing. "RailRover" is a working name per SOW §8 |
| Brand guidelines + Figma approval | — | SOW lists both as dependencies before development |
| ToS + Privacy Policy | — | Gate App Store / Play submission |
| Pilot radius decision | — | SOW says ~200 mi around Toledo; see [ADR 0008](decisions/0008-pilot-radius-staged-ingest.md) |

Both store accounts are **client-owned SOW dependencies**, not engineering debt. $124 total
arriving in week six delays submission.

## Progress

| Phase | Status |
|---|---|
| 0 — Foundation & guardrails | ✅ complete |
| 1 — Crossing data & schema | ✅ complete · 1,696 real crossings loaded; 50-mile dev radius (ADR 0008) |
| 2 — Reporting engine | ✅ complete · `submit_report()` enforces radius, rate limit and suspension server-side |
| 3 — Mobile shell: auth, location, map | ✅ complete · guest/account auth, location layer, live map with clustered markers, crossing detail |
| 4 — Report flows | ✅ complete · two-tap blocked/clear, server-validated; ⧗ five-second stopwatch pass outstanding |
| 5 — Destination & route options | ✅ complete · live routing with per-route crossing counts |
| 6 — Conflict detection, alerts, reroute | ✅ code complete · route simulator covers the behaviours; ⧗ not yet seen on device mid-trip |
| 7 — Notifications | ◐ inbox complete · push delivery blocked on Firebase + Apple accounts |
| 8–9 — Admin panel & analytics | ✅ code complete · all five M5 features; ⧗ panel not yet opened in a browser |
| 10 — Hardening & release prep | ✅ audited · see [docs/RELEASE-READINESS.md](docs/RELEASE-READINESS.md) |

Plan: [`docs/RailRover-Agentic-Roadmap.md`](docs/RailRover-Agentic-Roadmap.md).

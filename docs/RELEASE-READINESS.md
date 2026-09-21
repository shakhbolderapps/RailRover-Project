# Release readiness — Phase 10 audit

Audited 2026-09-21 against the SOW §7 security requirements and the roadmap's Phase 10 gate.
This records what was measured, not what was assumed. Anything unverified says so.

---

## 1. The finding that most affects the pilot

**The Supabase project is hosted in `ap-northeast-2` (Seoul) and serves a pilot in Toledo, Ohio.**

Measured against the live project, median of five calls each:

| Query | Time | Rows |
|---|---:|---:|
| Trivial one-row read (`app_config`) | **628 ms** | 1 |
| `crossings_in_bounds` — city viewport | 638 ms | 93 |
| `nearest_crossing` | 618 ms | 1 |
| `crossings_on_route` — 17-mile route | 591 ms | 0 |
| `conflicts_ahead` — 17-mile route | 601 ms | 0 |
| `crossings_in_bounds` — whole pilot area | 1,832 ms | 1,000 |

The trivial query costs the same as the spatial ones. **The database work is roughly 10 ms; the
other ~600 ms is fixed round-trip overhead.** The PostGIS indexes are doing their job — a
93-crossing viewport query costs about 10 ms more than reading a single config row.

So the roadmap's gate ("conflict check under 500 ms") is met *by the database* and missed *by the
driver*, which is the only measurement that matters. Two consequences:

- Every report submission, viewport load and conflict check a Toledo driver makes crosses the
  Pacific twice.
- **A Supabase project's region cannot be changed after creation.** Fixing this means creating a
  new project in a US region and re-running the migrations and ingest — cheap now, while the only
  data is test reports; expensive once a pilot is running.

**Recommendation: recreate the project in `us-east-1` before the pilot starts.** The migrations,
ingest and pgTAP suite all run from files, so the move is an afternoon's work today and a data
migration later. The instance is also `t4g.nano` (free tier), which is fine for the pilot's load
but worth revisiting alongside the region.

---

## 2. Dependency audit

`pnpm audit` found 7 advisories. One shipped to users; it is fixed.

| Severity | Package | Ships to users? | Action |
|---|---|---|---|
| **critical** | `maplibre-gl` ≤6.4.0 | **Yes** — admin panel bundle | **Upgraded 5.24.0 → 6.10.0.** v6 dropped the default export, so the import moved to named exports |
| high | `js-yaml` ×2 | No — via eslint and jest-preset | Transitive dev tooling; not in any shipped bundle |
| moderate | `uuid`, `decode-uri-component` | No — via `@expo/cli` | Build-time only |
| moderate | `vitest`, `@vitest/mocker` | No — test runner | Fixed by a vitest 4.x major upgrade; deferred, since it cannot reach a user |

The four dev-only advisories are recorded rather than silently ignored: they are reachable only by
someone who can already run code in this repo.

## 3. Secret hygiene

- No credentials are tracked in git. `git ls-files` returns only `.env.example` files and a CI
  fixture; every real `.env` is ignored.
- A scan of tracked files for `sb_secret_`, `service_role`, JWT-shaped strings, `github_pat_` and
  Google API key patterns returns only the warning comments that tell contributors not to commit
  such things.
- The mobile app and the admin panel both use the **publishable** key. Administrative power comes
  from `profiles.role` enforced server-side, never from a privileged key in a client bundle.

## 4. Server-side enforcement (SOW §7)

Asserted by pgTAP, not by inspection — 140 assertions across 10 files:

- **Reports cannot be written directly.** There is no client insert policy on `reports`;
  `submit_report` is the only door, and it enforces the report radius, the per-device rate limit
  and device suspension (`050-rls.sql`, `060-submit-report.sql`).
- **Admin actions refuse drivers.** Every administrative RPC is `SECURITY DEFINER` and re-checks
  `is_admin()` internally, because such a function runs as its owner and RLS does not protect it.
  Each is asserted from a driver session expecting `42501` (`100-admin-and-analytics.sql`).
- **The inbox does not leak.** Recipients are keyed on `auth.uid()` rather than a client-supplied
  device id, asserted from both sides with two drivers (`090-notifications.sql`).
- TLS in transit and encryption at rest are Supabase defaults.

## 5. Store compliance

| Requirement | State |
|---|---|
| Account deletion that actually deletes | ✅ `delete_my_account()`. The auth user, profile and notification rows go; reports survive with `user_id` nulled — deleting them would rewrite crossing history for every other driver, and severing the link to a person is what makes them non-personal |
| Location purpose strings | ✅ Both platforms, in `app.config.ts`, checked by `pnpm parity` |
| iOS privacy manifest | ✅ Declared in `app.config.ts` |
| Android data-safety declaration | ☐ Client-owned, needed at submission |
| ToS + Privacy Policy | ☐ **Client-owned. Gates submission on both stores** |

## 6. Free-tier degradation

- **ORS quota.** The live header reads `x-ratelimit-limit: 200`/day, not the 2,000 ADR 0001
  assumed. `describeRoutingError` distinguishes the daily cap from the per-minute one and tells the
  driver that reporting still works — losing routing must not read as the whole app being broken.
- **Supabase 7-day auto-pause — mitigated, and now proven.** The keep-alive workflow's secrets
  could not be read directly (the CLI token cannot list repo secrets), but a scheduled run on
  2026-09-21 completed successfully in 8 seconds. The workflow skips with a warning when the
  secrets are missing, so a *green* run is only possible if `SUPABASE_URL` and `SUPABASE_ANON_KEY`
  are set and the database answered. The risk is closed.

## 7. Distributing the test APK

`pnpm apk release` produces an installable APK with no Play Console account, which is how pilot
testers get the app until that $25 dependency is funded. Three things about that build are worth
knowing before it is sent to anyone.

**It is signed with the DEBUG keystore.** Expo's template sets `signingConfig signingConfigs.debug`
for the release build type, with the well-known `android`/`androiddebugkey` credentials. That is
fine for a trusted test group and is what makes the APK installable at all, but:

- it can never be promoted to a Play listing as-is, and
- once a real keystore exists, testers must **uninstall before installing** the properly signed
  build — Android refuses an update whose signature changed.

Generate a real keystore before the first build anyone outside the team keeps.

**It contains the OpenRouteService key.** Expo inlines `EXPO_PUBLIC_*` values into the JS bundle,
so anyone holding the APK can extract it. Against a **200 request/day** quota, a handful of testers
— or one person who pulls the key out — can exhaust routing for the day. Moving routing behind a
Supabase Edge Function would fix both this and the quota exposure in one change, and the routing
adapter boundary (ADR 0009) already makes that a single implementation swap.

**Push does not work in it.** `google-services.json` is a placeholder, so testers get the in-app
inbox and nothing else. That is the documented degradation, not a defect.

## 8. What Phase 10 did NOT verify

Stated plainly rather than left to be discovered:

- **Battery drain over a one-hour trip** — needs a real device on a real drive.
- **The five-second stopwatch pass** on the report flow — needs a mounted phone.
- **The admin panel in a browser** — no Chrome connection was available in this environment.
- **The alert rendering mid-trip on a device** — covered by the route simulator and pgTAP, but not
  seen on screen during a moving trip.
- **Push delivery on either platform** — blocked on a Firebase project and the Apple Developer
  Program.

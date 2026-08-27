# Platform Parity Contract — Android now, iOS in lockstep

**Client directive:** build and test the **Android (APK)** version for now, since no iOS test
device is available. Write the **iOS implementation in parallel** and keep it fully in sync, so
that the day an iOS device arrives we can produce and run an iOS build immediately, with no
catch-up work.

This document is how that promise is kept mechanically rather than by good intentions.

---

## 1. Why one codebase, not two

RailRover is React Native + Expo in the **managed workflow**. Every screen, every piece of
business logic, every API call is written once and runs on both platforms. There is no "Android
version" and "iOS version" of the app — there is one app with two build targets.

That makes parity the *default state* rather than a task. Drift can only enter through five
specific doors, so we put a lock on each one:

| Door drift enters through | Lock |
|---|---|
| Platform-specific file variants (`.android.tsx` / `.ios.tsx`) | CI fails on an orphan variant |
| `Platform.select` / `Platform.OS` branches with no iOS arm | CI fails on a one-armed branch |
| Native config added for Android only (permissions, capabilities) | CI fails on unpaired permissions |
| iOS build config rotting untested | CI prebuilds iOS every PR |
| A feature "temporarily" Android-only | Gap register below, with an unblock condition |

Run `pnpm parity` locally. CI runs it on every push and PR.

## 2. The native config rule

`apps/mobile/app.config.ts` holds both platforms' native configuration in one file, `ios` block
directly above `android`. They are edited **in the same commit, always**.

Every entry in one block that has a counterpart concept in the other must have it filled in:

| Capability | Android | iOS |
|---|---|---|
| Foreground location | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | `NSLocationWhenInUseUsageDescription` |
| Background location (Phase 2+, architected now) | `ACCESS_BACKGROUND_LOCATION` | `NSLocationAlwaysAndWhenInUseUsageDescription` + `UIBackgroundModes: [location]` |
| Push notifications | FCM via `google-services.json` | APNs entitlement + `aps-environment` |
| Internet | `INTERNET` | (implicit) |
| Privacy declarations | Play Data Safety form | `PrivacyInfo.xcprivacy` manifest + required-reason API codes |

`scripts/check-platform-parity.mjs` reads this table's machine-readable form from
`apps/mobile/platform-parity.json` and fails if an Android permission has no declared iOS
counterpart.

## 3. What CI proves on every PR

1. `pnpm parity` — no orphan platform files, no one-armed platform branches, no unpaired
   permissions.
2. `pnpm typecheck` — the same TypeScript compiles for both targets (RN types are shared).
3. `pnpm test` — shared logic (status, geo, routing adapter) is platform-free and tested once.
4. `expo prebuild --platform android` and `expo prebuild --platform ios` — **both** must generate
   valid native projects. This is the check that catches iOS config rot: a bad purpose string, a
   plugin that does not support iOS, a missing entitlement.
5. On a macOS runner, `xcodebuild -showBuildSettings` on the prebuilt iOS project — proves the
   Xcode project is well-formed without needing a device or a signing certificate.

What CI deliberately does **not** claim: that the iOS app has been *run*. It cannot be, until
there is a device and an Apple Developer account. The distinction is stated openly rather than
blurred.

## 4. Manual QA policy while Android-only

- Every feature gets a manual pass on the Android emulator (Pixel 7, API 35/36) before it is
  called done.
- Every feature's iOS path gets a **code review pass** in the same session: does this screen use
  anything that behaves differently on iOS (safe-area insets, keyboard avoidance, permission
  timing, map gesture handling, back-navigation)? That review is part of Definition of Done.
- The iOS Simulator can be used for UI-layout verification **without** an Apple Developer account
  (Xcode alone is enough). It cannot verify push, background location, or real GPS. Where Xcode
  is available locally, run `pnpm ios` for layout checks even in the Android-only phase.

## 5. iOS gap register

Anything that genuinely cannot work on iOS **yet** is listed here with its unblock condition.
Nothing may be Android-only without an entry. An empty "unblock condition" is not allowed.

| # | Gap | Why | Unblock condition | Code status |
|---|---|---|---|---|
| 1 | APNs push delivery untestable | Requires Apple Developer Program ($99/yr) for a push certificate/key | Client provides Apple Developer Program account (SOW dependency) | **Written in full.** Expo Push abstracts APNs/FCM; iOS token registration path is implemented and typechecked, just never exercised. In-app inbox works on both platforms regardless. |
| 2 | iOS device / TestFlight builds | Same paid account gate | Same | **Written in full.** `expo prebuild --platform ios` runs in CI; only signing is missing. |
| 3 | Background location on iOS | Deferred to a later phase for *both* platforms per SOW ("always-on background tracking can be enabled in a later phase without rework") | Phase-2 scope decision by client | **Architected, not enabled.** All location access sits behind `LocationService`; enabling `expo-task-manager` is one implementation swap. `UIBackgroundModes` and the always-on purpose string are already declared. |

Gaps 1 and 2 are **client-owned SOW dependencies**, not engineering debt. Raise them early — the
SOW lists "Apple Developer Program and Google Play Console accounts owned and provided by you"
under Dependencies, and $124 total arriving in week six delays submission.

## 6. Android-side notes for this phase

- Distribution while Play Console is unfunded: **signed release APK** built locally
  (`pnpm apk`, unlimited and free) or via Firebase App Distribution for pilot testers.
- Target the latest stable Android API at publish time, per SOW §7.
- `google-services.json` is required for FCM. It is **not** committed; see `.env.example` and
  `apps/mobile/README.md`.

## 7. When an iOS device arrives — the catch-up checklist

Because of the above, this list should be short. That is the point.

1. Add the Apple Developer Program account; create the App ID, push key, and provisioning profile.
2. `pnpm ios` — run on the device.
3. Exercise the three things CI could never prove: **push delivery**, **real GPS behaviour on a
   moving vehicle**, and **permission dialog timing/copy**.
4. Walk the iOS-specific UI review list: safe-area insets on a notched device, keyboard
   avoidance on the destination search, map gesture conflicts with the bottom sheet, swipe-back
   vs. modal dismissal.
5. Close gaps 1 and 2 in the register above.
6. Time the two-tap report flow on iOS with a stopwatch — the SOW's five-second requirement is a
   per-platform requirement, and it is the one thing that cannot be inferred from Android.

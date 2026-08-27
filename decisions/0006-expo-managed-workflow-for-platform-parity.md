# ADR 0006 — Expo managed workflow, with parity enforced in CI

- **Status:** Accepted
- **Date:** 2026-08-25
- **Implements:** client directive — "test on Android for now, but never let the iOS codebase
  fall behind"; SOW §3 Deliverables (iOS **and** Android app)

## Context

The client has no iOS test device, so Android (APK) is the only testable target for now. But iOS
is a contracted deliverable and must be buildable and runnable **the day a device appears, with no
catch-up work**.

The naive reading of "Android first" is to build Android, then port. That reliably produces two
weeks of iOS bug-fixing at the end of the project, on the least-tested platform, under deadline.

## Decision

**One codebase, both targets, every commit.** React Native + Expo in the **managed workflow**:

- `android/` and `ios/` are **generated** by `expo prebuild` and are **git-ignored**. They are
  never hand-edited, so they cannot drift.
- All native configuration lives in `app.config.ts`, where the `ios` and `android` blocks sit
  adjacent and are edited together.
- `apps/mobile/platform-parity.json` declares the Android↔iOS capability pairs.
- `scripts/check-platform-parity.mjs` (`pnpm parity`) fails the build on: orphan `.android.tsx`
  files, one-armed `Platform.select`, unpaired native permissions, and weak iOS purpose strings.
- CI runs `expo prebuild` for **both** platforms on every PR, so iOS config rot is caught the day
  it is introduced rather than the day a device arrives.

Parity becomes the *default state* maintained by tooling, rather than a task someone remembers.

## Consequences

- Managed workflow means no arbitrary native code. Acceptable: every capability RailRover needs
  (MapLibre, location, secure storage, push, task manager) has a config plugin.
- CI cannot prove the iOS app *runs*. It proves the iOS app *builds*. That distinction is stated
  openly in `docs/PLATFORM-PARITY.md` rather than blurred.
- Anything genuinely iOS-blocked goes in the gap register with an unblock condition. Today that is
  exactly two entries, both client-owned SOW dependencies (Apple Developer Program).
- Local release APKs are built with `expo prebuild` + Gradle, which is unlimited and free — no EAS
  build credits are consumed and no Play Console account is needed for pilot distribution.

## Alternatives rejected

- **Bare workflow with committed native projects** — maximum flexibility, but two native projects
  in git is precisely the drift surface this ADR exists to eliminate.
- **Android-only now, port later** — what the client explicitly ruled out, and rightly.

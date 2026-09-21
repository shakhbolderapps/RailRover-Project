# M1 — Notifications

> **Module 1: Foundation**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

The app delivers push notifications and an in-app inbox for relevant activity, including route alerts surfaced during an active trip and broadcast messages from platform staff. Alerting while the app is closed is part of a later phase.

## User Flow

1. System requests notification permission after the driver reaches the map.
2. System sends a push notification and an in-app entry on a relevant event.
3. Driver opens the in-app inbox to review read and unread items.
4. Tapping an item opens the related crossing or alert.

## Edge Cases

- Push permission is denied -> Alerts and messages remain available in the in-app inbox while the app is active.
- Several notifications arrive together -> System groups them in the inbox.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. Push notifications are delivered to opted-in devices on iOS and Android.
2. An in-app inbox lists notifications with read and unread states.
3. Each notification opens its related crossing or alert.
4. Notification permissions can be managed from settings.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ☐ **Blocked on credentials this project does not own.** The registration path is built (`registerForPush`, `register_push_token`) but no push has ever been delivered: Android FCM needs a real Firebase project (`google-services.json` is a placeholder) and iOS APNs needs the Apple Developer Program. See note | ☐ |
| 2 | ✅ `supabase/tests/090-notifications.sql` → inbox contents, read/unread transitions, and the cross-driver boundary from both sides. `lib/notifications.test.ts` → grouping and per-group unread counts | ✅ |
| 3 | ◐ `090-notifications.sql` → "a route alert carries the crossing it refers to". The inbox opens the map on tap; built, not yet exercised on a device | ◐ |
| 4 | ◐ `lib/notifications.test.ts` → "separates 'not asked' from 'denied and cannot ask again'". The settings toggle is built and sends the driver to system settings when the OS will no longer prompt; not yet exercised on a device | ◐ |

Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on criterion 1 — two separate client dependencies, not one.** Push delivery needs a real
Firebase project for Android (free, no billing) and the Apple Developer Program for iOS ($99/yr,
already in the register). Neither exists, so no push has been delivered on either platform and
this stays ☐ rather than being quietly marked partial.

What is deliberately NOT blocked on them: the inbox. The SOW's own edge case requires alerts and
messages to remain available in the inbox when push is denied, so nothing in the inbox path
touches a push token — and `registerForPush` returns null instead of throwing when no credentials
exist, so a driver on a placeholder build still reaches the map with a working inbox.

**Note on why recipients are keyed on `user_id`.** A device id is a client-supplied string; RLS
written against it would let anyone who guessed or stole one read another driver's inbox. Every
driver has an auth user, guests included, because a guest session is a real anonymous Supabase
session — so `auth.uid()` is a boundary the client cannot forge. `090-notifications.sql` asserts
that boundary from both sides, which a single-user test cannot do.

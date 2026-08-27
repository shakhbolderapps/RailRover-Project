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
| 1 | _not yet written_ | ☐ |
| 2 | _not yet written_ | ☐ |
| 3 | _not yet written_ | ☐ |
| 4 | _not yet written_ | ☐ |

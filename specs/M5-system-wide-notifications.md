# M5 — System-Wide Notifications

> **Module 5: Web Admin Panel**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

Internal platform staff send notifications to all pilot users or a segment for announcements, such as pilot instructions, coverage changes, and maintenance notices.

## User Flow

1. Administrator composes a notification.
2. Administrator selects all pilot users or a segment.
3. Administrator sends the notification.
4. System delivers it through push and the in-app inbox.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. An administrator can send a notification to all pilot users or a selected segment.
2. Notifications are delivered through push and the in-app inbox.
3. Sent notifications are recorded with their audience and time.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | ✅ `admin_broadcast()` writes one notification row and fans it out to every user; `100-admin-and-analytics.sql` asserts a DRIVER cannot call it | ✅ |
| 2 | ✅ `090-notifications.sql` → recipients see only their own notifications, asserted from both sides with two drivers | ✅ |
| 3 | ◐ Delivery to the in-app inbox works. PUSH delivery is blocked on the same Firebase and Apple credentials as M1 Notifications — see that spec | ◐ |
Legend: ✅ covered · ◐ partially covered (see note) · ☐ not yet written

**Note on the audience.** A broadcast is one row in `notifications` and one row per driver in
`notification_recipients`, so a message to a thousand drivers is not a thousand copies of the text.
`created_by` and `created_at` give the audit trail the SOW asks for.

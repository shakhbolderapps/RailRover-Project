# M5 — Administrator Authentication

> **Module 5: Web Admin Panel**  
> Source: Bolder Apps × RailRover Scope of Work, §6 Module Breakdown,
> Doc Ref QNZJP-QGWUO-ST8BC-3XA3G.
>
> **This file is generated verbatim from the SOW by `scripts/generate-specs.py`.**
> Do not paraphrase, soften, or reword anything below. If reality diverges from the
> SOW, add a `## Divergence` section at the bottom explaining why — never edit the
> criteria to match the implementation.

## Description

Internal platform staff sign in to the Web Admin Panel through a separate authentication flow from drivers, with secure password reset.

## User Flow

1. Administrator opens the Web Admin Panel.
2. Administrator enters their credentials.
3. System validates the credentials and opens the dashboard.
4. Administrator can reset their password securely if needed.

## Edge Cases

- Repeated failed administrator sign-in attempts -> System rate-limits and temporarily locks the account.

## Acceptance Criteria

_Each criterion below must map to a named assertion. Reference the criterion
number in the test name (see AGENTS.md §6, Definition of Done)._

1. Administrator authentication is separate from the driver login.
2. Only accounts with the administrator role can access the panel.
3. Secure password reset is available for administrator accounts.

## Test Mapping

| Criterion | Assertion | Status |
|---|---|---|
| 1 | _not yet written_ | ☐ |
| 2 | _not yet written_ | ☐ |
| 3 | _not yet written_ | ☐ |

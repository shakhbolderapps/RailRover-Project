# ADR 0008 — Ingest at 50-mile radius for development, 200 before pilot launch

- **Status:** Accepted
- **Date:** 2026-08-25
- **Implements / qualifies:** SOW §8 ("approximately 200-mile radius around Toledo, Ohio")

## Context

SOW §8 scopes the pilot to an approximately 200-mile radius around Toledo (41.6528, −83.5379).
That circle reaches Detroit, Cleveland, Columbus, Indianapolis, Fort Wayne and into Ontario — on
the order of tens of thousands of FRA crossings.

Two problems, one technical and one about scope:

1. **Technical:** a database of that size makes every development cycle slower and every map
   render heavier, for no benefit while building features around Toledo.
2. **Scope:** the pilot's value story is *Toledo-local crossing density with enough drivers
   reporting to keep status fresh*. A 200-mile radius spreads a small pilot driver group across
   five metro areas, where most crossings would sit grey/`unknown` forever — the cold-start
   problem, geographically amplified.

## Decision

- `scripts/ingest-crossings.ts` takes the radius as a **parameter**, defaulting to **50 miles**.
- Development and testing run against the 50-mile set.
- Expand to the contracted 200 miles **before pilot launch** — one command, no code change.
- **Raise the scope question with the client early** (see below). This ADR does not unilaterally
  reduce contracted scope; it stages the ingest and flags the question.

Filtering is non-negotiable at any radius: **at-grade, active, public crossings only**. A
grade-separated crossing (overpass/underpass) can never be blocked by a train; including them
would fill the map with crossings that never turn red and make the conflict logic flag bridges.
Asserted by a test that fails if any grade-separated row is present.

## Client question to raise

> The SOW scopes the pilot to ~200 miles around Toledo, which reaches Detroit, Cleveland,
> Columbus and Indianapolis — tens of thousands of crossings. Is the pilot's driver group
> concentrated around Toledo? If so, a tighter radius makes the crowd-sourced status meaningfully
> fresher, because reports concentrate instead of scattering. Happy to ship the full 200 either
> way — it is a product question, not a technical limit.

## Consequences

- Fast test cycles now; contracted coverage before launch.
- The expansion must be tested, not assumed: map performance at full density is a Phase-10
  hardening item (SOW-adjacent, roadmap §11 — "map with 5,000+ crossings in viewport").
- Ingest is idempotent (upsert on `dot_id`), so expanding the radius is additive and re-runnable.

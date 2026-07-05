# Fable/Orrery Prompt: Loop + Meta Clarity Review

> Weekend delegation prompt for Fable through Orrery. Please produce a review
> and product-loop memo, not code, unless Greg explicitly asks for
> implementation.

## Purpose

Last Singularity has a strong run fantasy and a lot of meta-loop pieces, but
the player-facing loop still needs sharper clarity: what happened, what was
earned, what was lost, what changed, and why the next run should start now.

Use Fable's perspective to turn the current results, home, vault, loadout,
upgrade, and chronicle ideas into a small set of reviewable product slices for
v0.2 demo polish and v0.3 structure.

## Read First

- `docs/v0.2/DESIGN.md`
- `docs/v0.2/ROADMAP.md`
- `docs/project/ROADMAP.md`
- `docs/design/META-LOOP.md`
- `docs/design/META-FLOW.md`
- `docs/design/CLASSES-AND-PROGRESSION.md`
- `docs/design/LOOT-ECONOMY.md`
- `docs/design/UI-VISUAL-SYSTEM.md`
- `docs/project/UI-VISUAL-PASS-PLAN.md`
- `docs/v0.3/RC-GATE.md`

Optional if useful:

- `src/control-plane-store.js`
- `src/client/remote-authority.js`
- `src/ui/canvas-primitives.js`
- `src/run-results.js`
- `src/progression.js`
- `tests/meta-loop.cjs`
- `tests/persistence.cjs`
- `tests/agent-play-eval.cjs`

## Current Context

- The design wants a fast between-runs flow: results, vault/upgrades/loadout,
  chronicle, drop.
- Results and home/loadout foundations exist, but "what changed after this
  run?" is still not as obvious as it should be.
- The shipped loadout contract is `2 equipped + 2 consumable` slots.
- The meta loop should reward extraction heavily but still give a small floor
  on death so the player does not feel the run was wasted.
- UI has moved toward strong readable slabs, Deck/couch scale, command labels
  separated from prompt affordances, and darker NERV/Marathon-inspired panels.

## Questions To Answer

1. What is the clearest first 30-minute player journey from title to first
   death, first extraction, first upgrade, and first intentional second run?
2. What must the results screen explain in one glance for extraction versus
   death?
3. What belongs on Home, Vault, Loadout, Upgrades, and Chronicle now, and what
   should be deferred until later?
4. Which stats, rewards, cargo, and milestones are motivational versus noisy?
5. How should the UI copy sound: clinical, haunted, arcade, naval, corporate,
   or some blend?
6. What is the smallest honest upgrade/write-back loop that makes the next run
   feel changed?
7. Which tests or agent play evals should prove that the loop works before Greg
   has to manually QA it?

## Deliverable

Write a review memo under `docs/project/reviews/` with:

- A recommended v0.2/v0.3 product-loop slice order.
- A screen-by-screen information hierarchy for results, home, vault/loadout,
  upgrade, chronicle, and drop briefing.
- A copy/tone guide with 8-12 example labels or status lines.
- A small "first public demo" meta-loop definition: what must work, what can be
  mocked, and what should not be shown yet.
- A test and play-eval plan for verifying run-result write-back and player
  understanding.
- Open questions Greg should answer before implementation.

## Guardrails

- Do not invent a heavier RPG economy than the current extraction loop can
  support.
- Do not add mandatory menu friction. The loop should be quick once understood.
- Do not hide the difference between extraction rewards and death salvage.
- Do not claim client-only UI as shipped if the sim/control plane does not write
  the underlying truth.

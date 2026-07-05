# v0.3 Playable RC Gate

> Status: v0.3 branch checklist. This is not a release announcement.
> Use it when deciding whether `codex/v0.3-ballpark-roadmap` is ready to
> promote into the playable line.

## Current Verdict

**Not RC-green yet.**

The branch now has the important structural pieces v0.3 needs: Ballpark bodies,
nearest-query parity, the first two Ballpark-backed consequence adapters,
movement golden fixtures, remote slingshot edge delivery, live event-journal
reads, Three render-plan diagnostics, and a bounded-growth soak. The first
Orrery S0/S1 review fixes are also integrated: Ballpark seam math, input
normalization, authority consequence tests, scavenger contact, held ability
edges, delivered-thrust signal, AI thrust, overlapping well handling,
map-select controller reroll, and remote input latency metrics. That is the
right architecture shape.

It still needs fresh product evidence before it can be called playable:

- a human local source playtest from a fresh stack;
- a Deck Gaming Mode launch and controller pass;
- a hash-named release build from the committed branch;
- a merge-forward from the current v0.2 demo line;
- one final review that no renderer/client path now owns gameplay outcomes.

Current automated evidence from 2026-07-05:

- `npm run stack:stop` passed before validation.
- `npm run test:fast` passed.
- `npm test` passed on the Three target.
- `npm run test:sim-structure` passed with `BallparkExtraction` and
  `SlingshotEdgeQueue`.
- `npm run test:authority` passed with the new input and consequence coverage.
- `npm run test:three`, `npm run test:visual`, and `npm run test:ui` passed.
- `npm run test:playtest` passed on the Three target.
- `npm run test:agent-eval` passed as a standalone lane.
- `npm run test:full` passed after the new agent-eval lane was added.
- The latest full-run agent-readable playable report is
  `tests/screenshots/agent-play-eval-2026-07-05T014144810Z/summary.md`.
- The latest full-run visual manifests are
  `tests/screenshots/renderer-2026-07-05T014207866Z/manifest.json` and
  `tests/screenshots/ui-visual-2026-07-05T014346256Z/manifest.json`.

## Required Automated Gates

Run these from a clean working tree after committing the candidate source:

```sh
git branch --show-current
git status --short
npm run stack:stop
npm run test:fast
npm test
npm run test:sim-structure
npm run test:authority
npm run test:three
npm run test:visual
npm run test:ui
npm run test:playtest
npm run test:agent-eval
```

For a promotion candidate, also run:

```sh
npm run test:full
node scripts/build-health.cjs status
```

If the candidate is going to be handed to Greg or pushed as a real build
milestone, build the hash-named artifacts after the final source commit:

```sh
npm run release:internal
npm run release:status
```

Do not use a dirty-tree release build as RC evidence. Dirty builds are fine for
local probes, but the RC gate needs a commit hash that maps to the artifact.

## Required Local Playtest

Start from fresh processes, not a page reload:

```sh
npm run stack:stop
npm run stack -- --no-open
```

Open the printed product-shaped client URL. Use the Three renderer and local
authoritative sim path, not `stack:sandbox`, unless the test is explicitly a
renderer-only diagnosis.

Minimum local pass:

- title screen loads and accepts keyboard/controller action;
- create or select a profile;
- launch Shallows, Expanse, and Deep Field at least once;
- movement feels intentional instead of pulled, jittery, or rubber-banded;
- well death only happens when the well is visibly relevant;
- wreck pickup adds cargo and emits visible feedback;
- portal extraction reaches results;
- death reaches results;
- run result/profile state remains coherent after returning home;
- no long-open title/death/result idle causes sim growth or runaway ticking.

Record evidence in `docs/project/BUILD-STATUS.md` if the playable assessment
changes.

## Required Steam Deck Gate

The Deck gate is Gaming Mode, not Desktop Mode. Desktop Mode can prove install
and logs; it cannot certify controller behavior because Steam Input can keep
Desktop shortcuts on the desktop layout.

Private Deck handoff commands:

```sh
npm run deck:preflight -- --host=steamdeck.tail1ac9cf.ts.net --prepare
npm run release:internal
LBH_DECK_HOST=steamdeck.tail1ac9cf.ts.net npm run deploy:deck
LBH_DECK_HOST=steamdeck.tail1ac9cf.ts.net npm run deck:gaming-mode -- --shutdown-steam --all-users
```

Acceptance comes from the Deck runbook:

- game launches from Steam Gaming Mode library;
- embedded control plane and sim come online;
- the renderer uses app-owned `lbh://` assets and local `127.0.0.1` sim URL;
- no fresh `Last Singularity` coredump appears;
- controller reaches title, home, map select, flight, pause, extraction,
  death/results, and quit;
- Deck prompts use controller labels and supporting affordance text;
- HUD and menu text pass 1280x800 handheld readability;
- suspend/resume does not corrupt the run or profile;
- logs exist under `~/.local/state/last-singularity/`.

Use `docs/reference/STEAM-DECK-RUNBOOK.md` for the full checklist and triage
commands.

## Architecture Invariants

Before calling v0.3 playable, inspect or test these contracts:

- gameplay truth remains server/sim-owned;
- renderer, UI, VFX, and client prediction do not decide death, extraction,
  pickup, cargo, signal, collision, or movement authority;
- coordinates and toroidal distances use shared helpers instead of local
  one-off math;
- Ballpark mirrors have no duplicate ids and no stale load-bearing bodies;
- event reads are run-stamped, bounded, and reset-safe;
- snapshots include event watermarks and stay within budget;
- render-plan diagnostics match the intended Three pass contract;
- Deck/default quality budgets are visible and acceptable.

## Blockers To Clear Before Promotion

- Merge current `main` into the v0.3 branch after v0.2 demo fixes land.
- Run a fresh human local source playtest and update `BUILD-STATUS.md`.
- Produce a committed hash-named release artifact with `npm run
  release:internal`.
- Deploy and verify the artifact on Steam Deck in Gaming Mode.
- Finish parity-gated migration for death/contact, signal-adjacent consequence
  checks, and the remaining load-bearing movement/contact families; wreck
  pickup and portal extraction are the first migrated consequence adapters.
- Resolve or explicitly schedule the decision-gated items in
  `docs/v0.3/OPEN-DECISIONS.md`.
- Promote the snapshot ring from scaffold/debug-rebase support into the live
  protocol path, or explicitly defer it with a documented reason.
- Drive renderer output from snapshot/renderable hints and event streams, not
  only from diagnostics that prove the render plan exists.
- Run one forge-style review pass focused on architecture ownership, stale
  compatibility code, and changed assumptions from the Ballpark migration.

## Evidence Template

Append this shape to the relevant status or handoff doc when the gate changes:

```markdown
**v0.3 RC candidate:** SHORT_SHA
**Date:** YYYY-MM-DD
**Verdict:** green / blocked / needs retest

Automated:
- command -> result

Local playtest:
- map / outcome / issue

Steam Deck:
- artifact version
- Gaming Mode result
- controller/readability notes

Known blockers:
- blocker
```

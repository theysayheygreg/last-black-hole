# Local Build Status

> Status: v0.2 current truth. This document answers "what can I play right
> now?" It does not replace build health, live stack status, the git log, or
> test output.

---

## Current Snapshot

**Date:** 2026-07-09
**Public/demo line:** v0.2.2 on `main` through `83953aa`
**Active integration line:** `codex/v0.3-ballpark-roadmap`
**Integration state:** current `main` is being merged forward; the resulting
combined source has not yet been revalidated.
**Formal build-health record:** green at `0cc3a3f` on `main`; stale for both
current `main` and the v0.3 merge candidate.
**Primary product-shaped target:** local Three renderer plus authoritative sim.
**Temporary browser-share target:** Cloudflare Drop `v0.2.2.83953aa`, static
sandbox only.

For source playtesting, use:

```sh
npm run stack:stop
npm run stack -- --no-open
```

Then open the printed `Client URL:`. That URL includes the local sim endpoint
and is the product-shaped local path. `npm run stack:sandbox` is still available
for renderer/debug work, but it is not the build-status target.

For release artifact handoff/playtesting, use:

```sh
npm run release:build
```

That command builds `web`, `ipad`, `mac`, `win`, and `linux` release artifacts
for the current committed `0.2.x.<hash>` build version and verifies the output
shape.

## Current v0.2 Public-Line Assessment

**Status update, 2026-07-08 Cloudflare Drop target:** the committed v0.2 public
line can produce a static, content-rooted browser-share folder and zip tagged
`v0.2.2.83953aa`. The artifact forces local sandbox mode, clears remembered sim
URLs, defaults to Three, and is covered by a fast artifact-shape guard. It is a
temporary visual/share lane, not evidence for embedded authority, Steam Deck,
or an all-target release.

**Status update, 2026-07-06 v0.2 main consistency pass:** the July 6 main
snapshot passed the v0.2 validation lanes after a consistency review of Home,
Deck/controller prompts, remote slingshot, Three camera sync, fluid-window
seeding, Inhibitor final-portal safety, rig effects/caps, and EM ledger copy.

Validation for that source snapshot:

- `npm run test:fast` passed, including the new `SimProtocol` fast suite and
  weekly-build guard lanes.
- `npm test` passed the core Three lane.
- `npm run test:renderer` passed all six renderer fixtures.
- `npm run test:title-prototype` passed the Composer/title canary.
- `npm run test:perf` held roughly 60 FPS across 3x3, 5x5, 10x10, minimal, and
  post-disabled scenarios.
- Focused authority/playtest probes passed: `RemoteAuthority`, `Controller`
  with `deck=1`, `MetaFlow`, `Systems`, `RunResults`, `PlayerBrain`, `Balance`,
  `Inhibitor`, and `SimProtocol`.
- A deliberately misspelled suite name failed loudly instead of producing a
  false-green no-op harness run.
- `node scripts/build-health.cjs verify` refreshed the formal health record at
  `0cc3a3f`; that record is now stale relative to current `main`.

No current embedded-authority or all-target hash-named release artifact has
been produced from the July 6-8 public line.

## Current v0.3 Integration Assessment

**Status update, 2026-07-05 agent QA harness pass:** the pre-merge
`codex/v0.3-ballpark-roadmap` source tree has a new `AgentPlayEval` lane for
playable evidence. It starts fresh authoritative sessions for Shallows, Expanse,
and Deep Field, drives remote mouse-thrust input, captures screenshots, verifies
scene/entity presence, and forces one sim-authored Shallows extraction so the
result screen is reached by an authoritative consequence.

Validation for this source snapshot:

- `npm run stack:stop` passed before validation.
- `npm run test:fast` passed.
- `npm test` passed.
- `npm run test:sim-structure` passed.
- `npm run test:authority` passed.
- `npm run test:three`, `npm run test:visual`, and `npm run test:ui` passed.
- `npm run test:playtest` passed.
- `npm run test:agent-eval` passed as a standalone lane.
- `npm run test:full` passed after adding `AgentPlayEval` to the manifest.
- Latest full-run agent report:
  `tests/screenshots/agent-play-eval-2026-07-05T014144810Z/summary.md`.
- Latest full-run visual manifests:
  `tests/screenshots/renderer-2026-07-05T014207866Z/manifest.json` and
  `tests/screenshots/ui-visual-2026-07-05T014346256Z/manifest.json`.

**Status:** this improved agent-side QA confidence for the pre-merge v0.3
snapshot but did not make the branch RC-green.

**Status update, 2026-07-04 v0.3 branch source validation:** the current
`codex/v0.3-ballpark-roadmap` source tree has fresh automated evidence for the
mechanical v0.3 slice. Remote slingshot input now sends queued press edges so a
quick engage/release tap cannot disappear between authority POSTs. The remote
client also exposes input RTT, input-to-snapshot, snapshot-lag, and
presentation-age metrics through `__TEST_API.getNetworkState()`. Portal
extraction is now the second Ballpark-backed consequence adapter after wreck
pickup: Ballpark supplies candidate portals, while the authoritative sim still
owns availability checks, exact capture radius, escape state, outcome, and
events.

Validation for this source snapshot:

- `npm run test:fast` passed.
- `npm run test:playtest` passed on the Three target, including Flow,
  MetaFlow, Controller, and KeyboardMouse.
- `npm run test:sim-structure` passed after adding `BallparkExtraction` and
  `SlingshotEdgeQueue`.
- `npm run test:authority` passed with the new consequence and input-edge
  coverage included.
- Targeted checks passed for `tests/sim-protocol-input.cjs`,
  `tests/slingshot-edge-queue.cjs`, `tests/ballpark-extraction.cjs`, and
  `tests/controller.cjs "index-a.html?renderer=three"`.

**Status:** the current merge candidate has not yet inherited any of those
green claims. It must be revalidated after the merge commit. Not RC-green;
merge-forward validation, human playtest, committed v0.3 release artifact, and
Deck Gaming Mode evidence remain open.

## Historical Platform And Playtest Evidence

**Status update, 2026-06-28 Deck compatibility pass:** the source tree now has
a first-class Deck UI mode instead of only a Deck package. The Electron Deck
launcher passes `deck=1` to the renderer, UI prompts route through
`src/ui/input-prompts.js`, HUD text/gauge minimums were raised for handheld
readability, bottom-left HUD panels no longer overlap in the Deck visual
capture, and placeholder app/Steam assets now exist under `assets/app/` and
`docs/public/steam/`.

Validation for this source snapshot:

- `npm run test:fast` passed after adding the `SteamDeckCompat` suite.
- `npm run test:ui` passed on the normal Three path.
- `node tests/ui-visual.cjs "index-a.html?renderer=three&deck=1"` passed; the
  reviewed Deck HUD capture uses `X`/`View` prompts and no longer shows the
  empty ability panel or keyboard-only Q/R fallback.

**Status:** v0.2.2 local source path is validated on a fresh local authority
stack. A previously built `0.2.2.<commit-hash>` Linux artifact may exist on
Greg's Steam Deck, but it should not be treated as current until rebuilt from
this pass and redeployed. Use `npm run release:status` for the exact
hash-named artifact folder.

On 2026-06-28, Codex refreshed the private Deck demo build:

- `npm run deck:preflight -- --host=steamdeck --prepare` found
  `steamdeck.tail1ac9cf.ts.net` online at `100.77.19.24` with SSH ready.
- `npm run test:fast` passed, including the desktop package, Deck Gaming Mode,
  Deck installer, play instructions, typography, UI primitive, and Three smoke
  lanes.
- `npm run release:internal` built the web, iPad web-app, macOS, Windows, and
  Linux release artifacts for the current committed hash.
- `LBH_DECK_HOST=steamdeck.tail1ac9cf.ts.net npm run deploy:deck` reused the
  current Linux release artifact when present and copied it to
  `/home/deck/Games/last-singularity`.
- The Gaming Mode refresh command wrote **Last Singularity** into Steam userdata
  as a non-Steam shortcut pointing at
  `/home/deck/Games/last-singularity/run-last-singularity.sh`.
- Remote verification confirmed the Deck executable and launcher are fresh and
  executable, with no active Last Singularity process left running.

The recent local work fixed the class of issues that made the Three migration
feel broken: camera/world projection mismatch, coordinate and flow scaling
drift, distant surf currents pulling the ship, stale browser/sim reuse in
movement tests, finite authority-session lifecycle, and shader-side coordinate
flip centralization. The latest visual work adds a renderer bakeoff fixture for
player-ship asset direction and keeps entity separation measurable before
richer pixel assets land.

On 2026-06-27, a fresh local-host stack was restarted with:

```sh
npm run stack:restart -- --no-open
```

Then a fresh Chrome/CDP browser opened
`index-a.html?renderer=three&simServer=http://127.0.0.1:8787`, created a test
profile, entered an authoritative run, sent thrust input, and verified:

- `phase: playing`
- Three renderer, 5-pass graph
- 60 FPS in the sampled frame
- authoritative player movement: `0.53530` world units
- remote tick delta: `34`
- evidence screenshot:
  `tmp/playtest-evidence/local-host-authority-2026-06-27T082803508Z.png`

Follow-up validation on the same source snapshot:

- `npm run test:visual` passed, including `shipBakeoff`.
- `npm test` passed the core Three lane.
- `npm run test:playtest` passed Flow, MetaFlow, Controller, and
  KeyboardMouse on the Three target.

On 2026-06-25, `npm run release:build` passed: it ran `npm run test:fast`, built
the web, iPad web-app, macOS, Windows, and Linux release targets, staged weekly
assets into `dist/nightly`, and passed `release:check`.

Artifacts:

- `builds/v0.2.1/` (last three-part build, preserved as evidence)
- latest Deck/demo release build, if present: run `npm run release:status` and open
  `builds/v0.2.2.<hash>/Last Singularity-linux-x64`
- latest Deck/demo playtest zip, if present: run `npm run release:status` and open
  `builds/last-singularity-playtest-v0.2.2.<hash>.zip`
- `dist/nightly/`

## Known Caveats

- `docs/project/BUILD-HEALTH.json` was refreshed on 2026-07-06 after the v0.2
  main consistency pass. If current `HEAD` is only a health-record follow-up,
  `node scripts/build-health.cjs status` should report current; after any later
  code or doc commit, rerun the verifier.
- Steam Deck deployment and Gaming Mode wiring exist, but the Deck path should
  follow local playtest health. A broken local game does not become useful
  because it launches on Deck.
- If movement feels bad after a long-open browser or sim process, reset the
  whole stack before judging the build. Page reload alone is not a clean reset.
- The 2026-06-27 source playtest proves local authority viability, not final
  human feel. Automated health and one CDP smoke cannot certify that the ship
  feels good in hand.
- The 2026-07-04 v0.3 source evidence proves structural input/consequence
  contracts and synthetic flow coverage, not final RC readiness. Do not promote
  it until a human local feel pass, hash-named release build, and Deck Gaming
  Mode pass are recorded.

## What Each Status Source Means

| Source | Answers | Does Not Answer |
|--------|---------|-----------------|
| `docs/project/BUILD-STATUS.md` | What the local build is believed to do now, what target to launch, current caveats, next evidence needed | Whether every automated gate passed at current `HEAD` |
| `docs/project/BUILD-HEALTH.json` | Whether a specific commit passed the formal automated health verifier | Whether the game currently feels good or whether unrecorded targeted fixes landed after it |
| `npm run stack:status` | Whether live dev/control/sim processes are running and healthy right now | Whether the repo is correct after a restart |
| `git log` | What changed and in what order | Whether those changes were playtested or represent a current playable baseline |
| Codex/OpenClaw memory | Helpful recall from prior runs | Canonical project truth |

If memory has no note for "local build status," do not infer that no work
happened. Read this document, then check `BUILD-HEALTH`, `git log`, and
`stack:status`.

## Update Trigger

Update this file in the same commit, or the next docs commit, when any of these
happen:

- a movement, spawning, camera, sim, renderer, lifecycle, platform, or controls
  bug is fixed;
- a fresh manual/Codex browser playtest changes the playable assessment;
- `BUILD-HEALTH.json` is refreshed or intentionally left stale;
- Deck, itch, Steam, desktop, or web packaging status changes;
- a handoff asks "where does the local build stand?"

## Update Template

When updating this file, keep the snapshot short and evidence-shaped:

```markdown
**Date:** YYYY-MM-DD
**Snapshot basis:** `main` through SHORT_SHA
**Primary playable target:** local source / packaged desktop / Deck / web
**Status:** green / recovery build / blocked / unknown

Evidence:
- command or playtest lane
- observed result

Known caveats:
- caveat

Next evidence needed:
- next command or playtest
```

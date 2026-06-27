# Local Build Status

> Status: v0.2 current truth. This document answers "what can I play right
> now?" It does not replace build health, live stack status, the git log, or
> test output.

---

## Current Snapshot

**Date:** 2026-06-27
**Public train:** v0.2.2
**Build version shape:** v0.2.2.`<commit-hash>`
**Primary playable target:** all-target release artifacts plus local source
build, Three renderer, and local authoritative sim.

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

## Standing Assessment

**Status:** v0.2.2 local source path is playable on a fresh local authority
stack. The current source target is green for a Codex-driven smoke playtest;
the next release artifact build should use `v0.2.2.<commit-hash>`.

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
- next release build: `builds/v0.2.2.<commit-hash>/`
- next playtest zip: `builds/last-singularity-playtest-v0.2.2.<commit-hash>.zip`
- `dist/nightly/`

## Known Caveats

- `docs/project/BUILD-HEALTH.json` was refreshed on 2026-06-25 for the v0.2.1
  release-build train. Use `node scripts/build-health.cjs status` for the exact
  current commit relationship.
- Steam Deck deployment and Gaming Mode wiring exist, but the Deck path should
  follow local playtest health. A broken local game does not become useful
  because it launches on Deck.
- If movement feels bad after a long-open browser or sim process, reset the
  whole stack before judging the build. Page reload alone is not a clean reset.
- The 2026-06-27 source playtest proves local authority viability, not final
  human feel. Automated health and one CDP smoke cannot certify that the ship
  feels good in hand.

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

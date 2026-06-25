# Local Build Status

> Status: v0.2 current truth. This document answers "what can I play right
> now?" It does not replace build health, live stack status, the git log, or
> test output.

---

## Current Snapshot

**Date:** 2026-06-25
**Snapshot basis:** `main` through `347e9ec` before this docs repair.
**Primary playable target:** local source build, Three renderer, local
authoritative sim.

Use:

```sh
npm run stack:stop
npm run stack -- --no-open
```

Then open the printed `Client URL:`. That URL includes the local sim endpoint
and is the product-shaped local path. `npm run stack:sandbox` is still available
for renderer/debug work, but it is not the build-status target.

## Standing Assessment

**Status:** recovery build, playtest needed.

The recent local work fixed the class of issues that made the Three migration
feel broken: camera/world projection mismatch, coordinate and flow scaling
drift, distant surf currents pulling the ship, stale browser/sim reuse in
movement tests, finite authority-session lifecycle, and shader-side coordinate
flip centralization.

That is meaningful progress, but it is not the same as a green playable
baseline. A fresh Codex app browser or human playtest has not yet been recorded
after the final GLSL helper and docs moves. Treat the local build as ready for a
fresh playtest pass, not ready for a public or Deck-first push.

## Known Caveats

- `docs/project/BUILD-HEALTH.json` is stale. At snapshot time,
  `node scripts/build-health.cjs status` reported recorded `e48b033` versus the
  post-fix local branch; rerun it for the exact current `HEAD`.
- Steam Deck deployment and Gaming Mode wiring exist, but the Deck path should
  follow local build health. A broken local game does not become useful because
  it launches on Deck.
- If movement feels bad after a long-open browser or sim process, reset the
  whole stack before judging the build. Page reload alone is not a clean reset.
- Formal current-health verification still needs a fresh build-health run after
  the next stable local playtest.

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

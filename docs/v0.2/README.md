# Last Singularity v0.2 Docs

This folder is the current canonical design snapshot for the v0.2 line.

Everything before this snapshot is treated as **v0.1**: the jam prototype, the post-jam systems sprint, the server-authority migration, the first content-manifest pass, and the renderer migration work that brought the game to its current foundation.

## Read Order

1. `DESIGN-CODE-DELTA.md` — what the older ideas say versus what the code actually does.
2. `V0.1-PATCH-NOTES.md` — historical patch notes for the pre-v0.2 body of work.
3. `V0.2-RELEASE-NOTES.md` — the larger version note for the v0.2 foundation.
4. `DESIGN.md` — the current v0.2 game bible.
5. `../design/THREE-ENTITY-VISUALS.md` — current visual target for
   non-fluid objects in the Three scene.
6. `../design/THREE-SCENE-VISUAL-HIERARCHY.md` — master back-to-front scene
   stack, contrast contract, parallax targets, and post-processing placement.
7. `../reference/THREE-ENTITY-MOODBOARD.md` — cited reference board for the
   current visual pass.
8. `../design/UI-VISUAL-SYSTEM.md` — current UI contrast, color, sizing, and
   couch-test contract.
9. `../reference/UI-MOODBOARD.md` — cited reference board and generated UI
   target-visual index.
10. `../project/UI-VISUAL-PASS-PLAN.md` — current UI implementation order,
    primitive-kit status, and UI motion/VFX bridge.
11. `../project/THREE-VFX-PASS-PLAN.md` — renderer-neutral VFX event contract
    and first implementation slice.
12. `../reference/CARBON-ENGINE-RESEARCH.md` — source-level Carbon/EVE engine
    lessons to mine without adopting the runtime.
13. `ROADMAP.md` — current status and what comes next by major area.
14. `../project/BUILD-STATUS.md` — current local playability snapshot and
   caveats.

## Version Meaning

- **v0.1** means "the playable prototype era." It includes the original Last Black Hole/Last Singularity jam plan and all work up to the current authority + Three renderer foundation.
- **v0.2** means "the product foundation era." The game has a real title, a server-authoritative local stack, a Three-first renderer direction, content manifests, PlayerBrain, run-result/meta foundations, and a test harness that can keep those contracts honest.

## Source Of Truth

Older docs remain valuable, but they are not all current. When an older page conflicts with this folder, prefer this folder unless a newer decision-log entry explicitly says otherwise.

v0.2 predates the per-version decision files used by the later lines, so its
current and durable decisions remain in `docs/journal/DECISION-LOG.md`. v0.3
and v0.4 decisions stay in their branch-local version folders until Greg calls
a promotion; `main` records only cross-version policy and the eventual
promotion summary.

Important current anchors:

- `docs/design/PILLARS.md`
- `docs/journal/DECISION-LOG.md`
- `docs/project/LOCAL-PROTOCOL.md`
- `docs/project/BUILD-STATUS.md`
- `docs/project/THREEJS-MIGRATION-PLAN.md`
- `docs/design/THREE-ENTITY-VISUALS.md`
- `docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`
- `docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md`
- `docs/design/UI-VISUAL-SYSTEM.md`
- `docs/project/UI-VISUAL-PASS-PLAN.md`
- `docs/project/THREE-VFX-PASS-PLAN.md`
- `docs/reference/CARBON-ENGINE-RESEARCH.md`
- `docs/design/TEST-HARNESS.md`
- `src/content/*.data.json`
- `scripts/sim-runtime.cjs`
- `src/render-three/three-renderer.js`

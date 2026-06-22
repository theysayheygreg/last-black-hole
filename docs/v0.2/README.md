# Last Singularity v0.2 Docs

This folder is the current canonical design snapshot for the v0.2 line.

Everything before this snapshot is treated as **v0.1**: the jam prototype, the post-jam systems sprint, the server-authority migration, the first content-manifest pass, and the renderer migration work that brought the game to its current foundation.

## Read Order

1. `DESIGN-CODE-DELTA.md` — what the older ideas say versus what the code actually does.
2. `V0.1-PATCH-NOTES.md` — historical patch notes for the pre-v0.2 body of work.
3. `V0.2-RELEASE-NOTES.md` — the larger version note for the v0.2 foundation.
4. `DESIGN.md` — the current v0.2 game bible.
5. `ROADMAP.md` — current status and what comes next by major area.

## Version Meaning

- **v0.1** means "the playable prototype era." It includes the original Last Black Hole/Last Singularity jam plan and all work up to the current authority + Three renderer foundation.
- **v0.2** means "the product foundation era." The game has a real title, a server-authoritative local stack, a Three-first renderer direction, content manifests, PlayerBrain, run-result/meta foundations, and a test harness that can keep those contracts honest.

## Source Of Truth

Older docs remain valuable, but they are not all current. When an older page conflicts with this folder, prefer this folder unless a newer decision-log entry explicitly says otherwise.

Important current anchors:

- `docs/design/PILLARS.md`
- `docs/journal/DECISION-LOG.md`
- `docs/project/LOCAL-PROTOCOL.md`
- `docs/project/THREEJS-MIGRATION-PLAN.md`
- `docs/design/TEST-HARNESS.md`
- `src/content/*.data.json`
- `scripts/sim-runtime.cjs`
- `src/render-three/three-renderer.js`

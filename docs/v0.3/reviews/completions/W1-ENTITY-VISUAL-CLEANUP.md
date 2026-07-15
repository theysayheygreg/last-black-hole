# W1 Entity Visual Cleanup

Status: source cleanup complete on `codex/v0.3-entity-visual-cleanup`.

The shared sprite seam now submits one generated pixel sprite card per visible
entity. PNG alpha remains owned by the cached nearest-filtered texture and
material. A single low-alpha contact matte is retained only as a local
background-separation tool. Generic sprite discs, halo cores, and ring rims
are removed.

| Family | Core sprite | Alpha/material | Backing | Removed legacy parts | Retained state or motion VFX | Duplicate canvas status |
|---|---|---|---|---|---|---|
| Local Drifter / Breacher | `shipDrifter` / `shipBreacher` | RGBA PNG, `NearestFilter`, normal alpha; supplied opacity reaches the sprite material | One low-alpha contact matte | Triangle/vector core, generic disc halo, generic ring rim | Ratified slingshot semantic ring, tether, and release ghost only | Old ship renderer is gated when Three owns the world |
| Remote humans | `shipRemote` | Same cached alpha/filter path and opacity behavior | One low-alpha contact matte | Generic remote halo/rim stack | Heading from presentation movement only | Old remote canvas renderer is gated on the Three path |
| Scavenger Raider / Breacher | `scavengerRaider` / `scavengerBreacher` | Same cached alpha/filter path | One low-alpha contact matte | Generic threat halo/rim stack | Presentation heading only; no unconditional ring | Old scavenger canvas renderer is gated on the Three path |
| Wreck intact / looted / cluster | `wreckIntact` / `wreckLooted` / `wreckCluster` | Same cached alpha/filter path | One low-alpha contact matte | Rotated-square/vector core, generic salvage halo/rim stack | Asset/state selection and drift-neutral presentation only | Old wreck canvas renderer is gated on the Three path |
| Portal extraction / rift | `portalExtraction` / `portalRift` | Same cached alpha/filter path; supplied portal opacity reaches the sprite | One low-alpha contact matte | Generic portal disc halo and ring rim | Blocked and final states retain family-owned semantic state rings | Old portal canvas renderer is gated on the Three path |
| Star | `starWarm` | Same cached alpha/filter path | One low-alpha contact matte | Generic star halo/rim stack | Fabric force/accretion remains outside the sprite seam | Old star canvas renderer is gated on the Three path |
| Planetoid / comet | `planetoid` / `comet` | Same cached alpha/filter path | One low-alpha contact matte | Generic route halo/rim stack | Movement heading only; no decorative ring | Old planetoid canvas renderer is gated on the Three path |
| Fauna | `faunaOrganic` | Same cached alpha/filter path | One low-alpha contact matte | Generic ecology halo/rim stack | Family sprite and presentation size only | Old fauna canvas renderer is gated on the Three path |
| Sentry | `sentryThreat` | Same cached alpha/filter path | One low-alpha contact matte | Generic sentry halo/rim stack | Family sprite and presentation status only | Old sentry canvas renderer is gated on the Three path |
| Wells | No runtime sprite; fabric/accretion owns the read | Procedural fabric path | None | Unconditional Three contour, ring, and core markers in product mode | Well debug primitives are available only in explicit `scene` diagnostic view | Canvas/WebGL fabric remains the authority; no duplicate canvas entity marker |
| `shipBakeoff` fixture | Current generated ship sprite IDs | Same cache/filter path | Same contact matte | Shared vector-era sprite extras removed | Fixture candidate comparison remains fixture-only | Never a representative/product map |

## Proof Boundary

Focused source assertions and lifecycle checks prove:

- each family dispatches one sprite-core part per visible object;
- the sprite seam contains no generic `disc` or `ring` submissions;
- product/ASCII mode reports `genericSpritePartCount: 0` and
  `wellDebugPrimitiveCount: 0`;
- explicit raw-scene diagnostic mode is the only path that submits well debug
  primitives;
- asset alpha, nearest filtering, cache plateau, disposal, opacity transport,
  lifecycle ownership, bounded pools, and `coords.js` projection remain in
  the existing contracts;
- old canvas entity renderers remain gated by the Three backend ownership check
  in `src/main.js`.

The headed `entityShowcase` / `visualReference` final-ASCII capture is a later
single-command gate and is intentionally not part of this source completion.

# v0.3 Visual Cohesion and Deck-Scale Art Direction Implementation Plan

> **For the assigned implementer** (Hermes proposed; lane routing is Greg's call): execute this plan task-by-task using the current v0.3 branch architecture. Keep the sim authoritative and treat all renderer/UI work as presentation-only.
>
> **Orrery review integrated 2026-07-10** — see `docs/v0.3/reviews/2026-07-10-orrery-specialist-plan-review.md`. Key amendments: Tasks 2–3 are the docs-only Wave 0 and may proceed now; all code/art tasks (0, 4–8) wait for Greg's feel/taste verdict (v0.3 Open Decisions 1–2), which directs this pass. This lane **owns** `src/render-three/**`, `src/ui/**` draw paths, `assets/**`, `scripts/build-visual-assets.cjs`, the visual design docs, and — via Task 0 below — all writes to `src/presentation/presentation-frame.js` and `presentation-style.js` (the timbre lane consumes those facts read-only). In `src/main.js` this lane edits draw/frame call sites only, and only **after** the timbre lane's audio-router slice merges (it removes ~40 scattered cue call sites and shrinks the conflict surface). Shared test files (`agent-play-eval`, `perf-probe`, `ui-motion*`, `suite-manifest`) take append-only, lane-labeled additions. `docs/v0.3/RC-GATE.md` is edited by the integrator only. Any landed code slice re-opens the automated candidate gate; rerun the full lane before a renewed RC claim.
>
> **Terminology ruling:** *amber* is the semantic value/salvage color in all docs, cue sheets, and strings; "gold" may only describe raw source-art pixels. The shared product metaphor across art, sound, and text lanes is **"the failing instrument"**; this plan's "failing astronomical instrument" is its visual rendering. Do not drift the metaphor without changing all three lanes.
>
> **Greg sign-off required before executing:** Breacher resting-palette retint (Task 5 step 2) and any replacement of `world-entities-atlas.png`, including new fauna/sentry source cells (Task 4). "After approval" in this plan means Greg's approval.

**Goal:** Make the shipped Sol-generated entity, item, and UI assets read as one unmistakable “ASCII-fluid tactical instrument” at desktop and Steam Deck scale, while preserving fluid readability, 60 fps, and server-authoritative gameplay truth.

**Architecture:** Keep `src/presentation/presentation-frame.js` as the renderer-neutral boundary and `src/render-three/three-renderer.js` as its adapter. Use the generated runtime slices under `assets/visual/` through the existing manifest and asset stores; do not render source atlases or make art select gameplay states. Refine a small number of shared sprite treatments, family-specific state accents, UI-frame deployment rules, and visual evidence fixtures rather than adding an alternate renderer or a parallel coordinate system.

**Tech stack:** Vanilla ES modules; Three.js r184; Composer/WebGL2 ASCII-fluid pass; DOM/canvas UI; Sharp-derived transparent PNG assets; Node/CDP harness; Electron/Steam Deck target.

---

## Scope and review basis

This plan was grounded in the checked-out branch `overnight/20260710-230616-palette-plan`, current source and documents, actual checked-in runtime PNGs, and the three actual generated source atlases:

- World source: `assets/source/generated/v0.3/world-entities-atlas.png`.
- Runtime entity kit: `assets/visual/entities/{ship-drifter,ship-breacher,ship-remote,scavenger-raider,scavenger-breacher,wreck-intact,wreck-looted,wreck-cluster,planetoid,comet,star-warm,portal-extraction,portal-rift,sentry-fauna}.png`.
- Item source/runtime kit: `assets/source/generated/v0.3/item-families-atlas.png`, `assets/visual/item-families/*.png`, `assets/visual/items/*.png`.
- UI source/runtime kit: `assets/source/generated/v0.3/ui-frame-parts-atlas.png`, `assets/visual/ui/*.png`.
- Asset derivation and binding: `scripts/build-visual-assets.cjs`, `assets/visual/manifest.json`, `src/render-three/entity-assets.js`, `src/ui/asset-kit.js`.
- Current scene and sprite implementation: `src/render-three/three-renderer.js`, `src/render-three/visual-style.js`, `src/render-three/entities/{player-visual-family,world-sprite-visual-family,portal-visual-family,wreck-visual-family,visual-family}.js`.
- Renderer-neutral roles and quality budgets: `src/presentation/presentation-style.js`, `src/presentation/presentation-frame.js`.
- UI primitives/motion/typography: `src/ui/{asset-kit,canvas-primitives,design-tokens,hud-primitives,motion,typography}.js` and `src/hud.js`.
- Coordinate authority: `src/coords.js`.
- Visual/UI contracts: `docs/design/{VISUAL-STYLE-GUIDE-v0.3,THREE-ENTITY-VISUALS,THREE-SCENE-VISUAL-HIERARCHY,UI-VISUAL-SYSTEM,UI-MOTION-SYSTEM-v0.3,DIRECTIONAL-ASCII}.md`.
- Current v0.3/product constraints: `docs/v0.3/{README,ROADMAP,RC-GATE}.md`, `docs/project/{THREE-ENTITY-VISUAL-PASS-PLAN,BUILD-STATUS}.md`, and `docs/journal/DECISION-LOG.md`.

### Evidence limitation to resolve before art approval

`npm run test:visual` was attempted from the overnight `/tmp` worktree on 2026-07-10 and failed before usable captures (missing `__TEST_API`, `Cannot find module 'sharp'`).

**Orrery correction (2026-07-10):** this is a worktree provisioning artifact, not a product defect. `sharp` is a declared devDependency and is installed on the integration branch, where `npm run test:full` — including the visual lane — passed on 2026-07-10 per `RC-GATE.md`. The overnight worktree simply lacked `node_modules`. Task 1 is therefore an environment prerequisite (provision the implementation worktree, confirm the lane is green), not an S0 finding; treat any failure that *survives* provisioning as a real blocker.

The source tree has no committed screenshot files in `tests/`; historical evidence references ignored screenshot folders that must not be edited. Therefore the source-atlas and individual-runtime-asset audit in this plan is real, but no claim here substitutes for a fresh, working 1280x800 Three/Deck capture review. Create new timestamped evidence folders only through the existing harness; do not modify historical untracked screenshot directories.

## Current-state inventory

| Surface | Current implementation | Design read |
|---|---|---|
| ASCII/fabric | Composer/ASCII remains the visible world substrate, with Three transparently composed in `src/render-three/three-renderer.js`. | Correct product hierarchy in architecture; the art pass must protect it from sprite/matte/glow creep. `docs/design/DIRECTIONAL-ASCII.md` remains the strongest functional-read opportunity: flow direction should be legible in glyph orientation, not just density. |
| World asset language | The source atlas is a polished, black-outlined, top-down pixel-kit: bright cyan/white ships, red hostile craft, magenta shard, bone/amber wrecks, cyan portals/comet, gold star. Runtime crops are generated 128px transparent slices. | Strong family-level production value and readable silhouettes. It risks looking like a separate polished pixel-kit pasted onto a terminal-fluid world unless integration controls value, matte coverage, motion, and screen-space treatment. |
| Player hulls | `ship-drifter.png` is a narrow white/cyan arrow with twin cyan exhausts; `ship-breacher.png` is broader, white/gray with amber core/exhaust. `PlayerVisualFamily` draws both at fixed `0.044` radius. | Drifter is immediately legible. Breacher is handsome but its gold exhaust risks reading as salvage/star value rather than a friendly hull distinction. Both need explicit motion/state ports and a shared silhouette rule at the actual 1280x800 footprint. |
| Hostile/remote | Remote uses a blue hull sprite; scavengers use red `scavenger-raider`/`scavenger-breacher` sprites selected in `WorldSpriteVisualFamily`. | Red raider has the best peripheral danger read in the kit. Remote versus local differentiation is currently mostly role tint/asset choice; it must gain an outline/trail/state marker that does not compete with cyan route/extraction. |
| Wreck/salvage | `WreckVisualFamily` selects intact/looted/cluster and scales them by size. The intact asset already contains bright amber engine-like glints; looted is a darker structure; cluster is debris. | The intact art reads more like a dead ship than terrain/salvage at close inspection, which is useful, but amber needs to be the only active-value cue. Looted must retain enough broken silhouette but shed all reward sparkle. Drift orientation is presently `0`, leaving the art static against movement-led world logic. |
| Landmarks | One warm star, planetoid, comet, extraction portal, rift portal; `WorldSpriteVisualFamily` uses a common star asset and static star rotation, while planetoid/comet heading follows movement. | Portal extraction is excellent: hard cyan aperture and obvious black center. The rift uses the same cyan family, leaving too little semantic distance from an extraction portal at small scale. A single warm star cannot currently express stellar type/state. |
| Ecology | Both `world.fauna` and `world.sentries` map to `sentry-fauna.png` in `WorldSpriteVisualFamily`. | This is the clearest shipped category failure: a single cyan-green ornate, symmetrical emblem cannot communicate ambient ecology versus directional sentry threat in grayscale or peripheral play. Do not solve it with hue alone. |
| Wells/Inhibitor | `well-instrument.png` and `inhibitor-shard.png` are explicit `reference` assets in `src/render-three/entity-assets.js`; runtime wells/Inhibitors remain procedural. | Correct. Preserve this boundary. The magenta shard is useful style reference, not an excuse to turn the Inhibitor into a normal icon. |
| Sprite separation | `ENTITY_SPRITE_TREATMENTS` provides matte/halo/rim presets; `draw.sprite` creates the local stack. Diagnostics report matte count and estimated coverage. | Architecture is right. Current values are asset-family constants rather than density-, state-, or scale-aware policy. Wreck matte radius `2.35` is particularly likely to carve visible holes in the ASCII field when dense. |
| Item system | Nineteen family art cells feed all 65 stable catalog icons; the generator overlays corner brackets, tier bars, and a hashed identity mark. `drawItemIcon` adds selected/equipped/consumable treatment. | Cohesive machinery vocabulary, but all icons have similar dark metal, outlines, cyan/magenta glow, and rectangular density. At Deck UI size, tier rails/identity hash can become noisy while family differences compress. The generated family artwork should communicate function first; tier and state should be independent, minimal overlays. |
| UI frame system | Twelve cyan/black terminal frame slices are applied by `drawGeneratedFrame`; title/Home/map/pause/results/inventory use the kit. | Coherent and recognizably operational, but the source frame parts already contain ticks, crosses, orange nodes, cyan tubes, and warning geometry. Using full frames for every nested panel turns hierarchy into wallpaper. |
| Post and motion | Three’s world present shader owns mild scanline/vignette/chromatic motion; UI motion has a deterministic timeline and reduced-motion state. | The ownership line is healthy. The split Composer/Three post stack is still a visual-risk seam: entity gamma/gain plus Composer ASCII grade can make sprite whites and cyan bloom read as a different game than the fabric. |
| Performance | Quality tiers cap family budgets in `src/presentation/presentation-style.js`; `tests/perf-probe.cjs` sets catastrophic ceilings of 700 calls / 600 pooled meshes. | The pool/lifecycle discipline is good but is not an art-direction performance budget. The plan needs named per-frame measurements for visual states and proof on a physical Deck; no speculative atlas rewrite before measurements justify it. |

## Findings ranked by severity

### S0 — category truth/readability failures

1. **Fauna and sentries are one sprite family.** `src/render-three/entities/world-sprite-visual-family.js:31-32` maps both to `sentryFauna`; this violates the documented category-before-affiliation contract. At gameplay scale, the ornamental symmetrical cyan-green mark has neither a calm organic drift read nor a directional threat read. It cannot teach the player whether to ignore, avoid, or react.
2. ~~The visual test command is not currently executable.~~ **Downgraded by Orrery review:** the failure was overnight-worktree provisioning (missing `node_modules`), not source truth; the lane is green on the integration branch. Retained only as the Task 1 environment prerequisite. Not an S0.

### S1 — first-glance hierarchy and style cohesion

3. **The generated pixel kit is stronger and more saturated than its ASCII-fluid substrate.** The assets have crisp black outlines, white-hot speculars, and large saturated cyan/red/magenta regions; Three applies extra halo/rim/gain. Without a value budget, the world becomes “terminal background plus stickers,” violating Art Is Product.
4. **Portal state language is underspecified.** Extraction and rift assets are both cyan circular apertures selected only by `visualState`/`variant` in `src/render-three/entity-assets.js:44-48`. A portal’s ready, blocked, expiring, final, and rift meanings need a non-text, state-aware layer supplied by authoritative presentation facts—not a new client guess.
5. **Wreck state/motion tells are incomplete.** `WreckVisualFamily` always uses rotation `0` and no bounded state accent. Intact/looted/cluster are asset changes, but salvage readiness, drift direction, and interaction state are not visually disciplined enough to support movement-first looting.
6. **Player hull role color conflicts with semantic palette.** Breacher’s source art contains prominent gold/orange energy. Gold is already value/stars/salvage, so player hull differentiation must come from geometry plus a controlled neutral/cyan player frame; amber should remain a small heat/state accent, not its base category signal.

### S2 — systems that work but need guardrails

7. **Matte coverage is globally measured but not locally art-directed.** `src/render-three/visual-style.js:36` gives wrecks a 2.35 matte radius and `three-renderer.js` only guards aggregate coverage below 0.35. Clustered assets can quiet exactly the fabric terrain the player needs to read. Treat local density and criticality as inputs to matte strength/radius.
8. **The UI frame art can outrank the content it frames.** The generated corners are high-detail, glowing instruments. Applying all four rails/corners to small/nested groups violates the guide’s “corners are punctuation” rule and makes titles, selections, warnings, and decorative glyphs compete.
9. **Item icon taxonomy is mechanically complete but visually overencoded.** The family sprite, tier rail, hashed identity marks, selection border, equipment bar, and consumable mark can all coexist at 96px. At Deck scale this is too many competing signals. Some family assets also use magenta despite the global rule reserving it for anomaly/Inhibitor; item-system semantics need a separate constrained palette policy.
10. **The implementation lacks short motion evidence for sprite states.** Still snapshots can prove a portal aperture exists, but not whether ship thrust/brake, slingshot engagement, portal instability, wreck glint, or ecology motion explains rather than obscures gameplay.

### S3 — polish/maintainability opportunities

11. **Asset crops are deterministic but source-grid-bound.** `scripts/build-visual-assets.cjs:90-106` slices equal atlas cells, chroma-keys green, trims, and resizes. A future Sol replacement can silently alter visual padding, focal point, shadow, or pixel density while retaining file names. The pipeline needs bounded visual metadata/validation, not manual crop assumptions.
12. **World sprite scale is family-coded but not evaluated against the actual target display.** Examples: player `0.044`, star `0.045`, portal `radius * 1.15`, fauna `0.018 + entity.size * 0.003`. These are valid renderer presentation values but need a Deck-scale silhouette matrix and fixtures, not taste by constants alone.

## Target system/style: “The failing astronomical instrument”

### One clear visual thesis

The game is not pixel-art ships laid on a sci-fi background. It is a failing astronomical instrument observing a fluid universe. The ASCII fabric is the living measurement surface and the route-reading tool. Pixel entities are compact, physical evidence caught in that measurement surface. The UI is the instrument bezel: stable, crisp, and sparse enough to make decisions, never a second game board.

**Read order:**

1. Flow direction, open travel line, well danger, and usable route.
2. Player, immediate hostile threat, portal/anchor, actionable salvage.
3. Current command and consequence through the edge HUD.
4. Dread, scale, debris detail, and display failure.

If a treatment harms an earlier read, it loses—even when the asset is beautiful.

### Style rules to add to the v0.3 guide during implementation

1. **Fabric is the medium; sprites are evidence.** The ASCII layer owns medium-value directional motion. No entity stack may permanently obscure more than a compact local footprint or become a second full-field texture.
2. **Category owns silhouette; state owns a single extra cue.** Each sprite receives one category silhouette, then at most one state accent plus one short motion cue. Do not stack a persistent halo, rim, trail, label, ring, and spark on ordinary entities.
3. **Friendly ships are bone/blue-white cores with cyan instrumentation.** Drifter/Breacher distinction comes from silhouette and port arrangement. Amber is a temporary heat/burn or value cue, not Breacher’s resting faction color.
4. **Threats use hooked/segmented silhouettes and localized red heat.** Red means immediate hostile/destructive intent. A threat is not a solid red neon blob.
5. **Salvage is broken/asymmetric and amber only at actionable value points.** Looted wrecks keep gray structure but remove the amber glint. No pristine ship nose, exhaust, or forward combat read.
6. **Route anchors separate by geometry before color.** Star = radial point/corona; planetoid = dense body; comet = body with velocity-opposed tail; extraction = stable open cyan aperture; rift = broken/open discontinuity. Aperture center must remain black.
7. **Ecology and sentries must diverge.** Fauna: soft asymmetric/organic, slow current-led pulsing, no forward attack axis. Sentry: segmented directional geometry, cadence/scan or lunge cue, green primary with a red danger state only when authoritatively hostile. They cannot share a base sprite.
8. **Magenta is reserved.** Only Inhibitor/corruption/anomaly assets and confirmed related UI states can carry magenta as their primary accent. Item icon magenta must be restrained to a documented mechanical-family marker or replaced with non-magenta treatment.
9. **UI frame parts are punctuation.** One major panel per decision group may use a complete generated frame. Subsections use rail/divider/whitespace. Selected state uses three cues—focus position, backing/value, marker/frame—not additional decorative corners.
10. **Pixel treatment is sharp, not blurry.** Nearest-neighbor cores, hard local mattes, narrow rims, and restrained additive halos. No smooth gradient repaint, blur, heavy DOF, wide bloom, or chromatic smear that destabilizes glyph edges.
11. **Motion explains, then stops.** Ship ports/trails show direction and state; portal ticks show instability; wreck glint confirms value; UI motion explains focus/outcome. Effects must be event/state driven and reduced-motion has a static equivalent.
12. **Truth remains outside art.** Assets and effects consume `presentation-frame` facts/events. No render-side prediction, inferred pickup/hostility/portal availability, or inline coordinate conversion. All world/screen/fluid mapping stays in `src/coords.js`.

### Budget policy

- World frame: void dominates; fabric is the largest medium-value region; normal play uses void + fabric + no more than two active semantic accents besides the player.
- Critical entity stack: matte footprint ≤1.25× the core silhouette by default; only portal/wreck field may expand under documented state/density rules.
- Matte policy: critical player/portal may retain priority; neutral and clustered entities reduce opacity/radius as overlapping matte area rises. Measure both global coverage and local 3× sprite-radius coverage.
- Bloom/halo: halo communicates energy/state, not size. Portal aperture center, player core, and ASCII glyph edges must survive a grayscale view.
- UI: maintain 7:1 local contrast for critical values/action and 4.5:1 for operational text. Generated art never reduces those floors.

## Exact implementation targets

| Target | Planned modification | Why |
|---|---|---|
| `docs/design/VISUAL-STYLE-GUIDE-v0.3.md` | Add the target thesis, per-family grammar, density-aware matte policy, atlas/crop validation, sprite-state matrix, and Deck review matrix from this plan. | Converts the audit into an enforceable implementation contract. |
| `docs/design/THREE-ENTITY-VISUALS.md` | Mark sprite-card production path as current; define separate fauna/sentry source requirements, portal state grammar, wreck drift/glint contract, and local matte budget. | Removes the remaining ambiguous “later refinement” language. |
| `docs/design/UI-VISUAL-SYSTEM.md` | Add frame-density rules, icon signal hierarchy, and item-icon palette exceptions/constraints. | Keeps UI art from becoming decorative noise. |
| `assets/source/generated/v0.3/world-entities-atlas.png` | Replace only after a signed-off source brief; retain source atlas as auditable input. New source must provide independent fauna and sentry cells or a second atlas. | The current one-cell `sentry-fauna` source cannot satisfy category rules. |
| `scripts/build-visual-assets.cjs` | Extend atlas manifest schema with expected runtime IDs, safe-content bounds/padding validation, alpha occupancy/minimum core checks, and a separate fauna/sentry mapping when source art is ready. | Makes future Sol art changes inspectable instead of silently re-cropped. |
| `assets/visual/manifest.json` and affected `assets/visual/entities/*.png` | Regenerate only through `npm run assets:visual` after source/mapper approval; never hand-edit generated slices. | Maintains deterministic asset truth. |
| `src/render-three/entity-assets.js` | Add explicit `sentry` and `fauna` runtime asset IDs/selectors; evolve portal and wreck selectors only from renderer-neutral visual state fields. Keep well/inhibitor reference-only. | Separates families without moving gameplay selection into renderer code. |
| `src/render-three/entities/world-sprite-visual-family.js` | Use separate fauna/sentry selectors, families, size/heading/motion inputs, and family-specific culling budgets; do not give both the same sprite. | Repairs the S0 category failure. |
| `src/render-three/entities/player-visual-family.js` | Consume approved presentation hints for thrust/brake/signal/slingshot state; retain local player priority and add a small bounded state-port/trail layer. | Gives movement a readable non-HUD cue. |
| `src/render-three/entities/wreck-visual-family.js` | Rotate/debris-align only from presentation velocity when present; render state glint/desaturation from authoritative visual state; maintain a no-glint looted rule. | Makes salvage motion/value legible without client inference. |
| `src/render-three/entities/portal-visual-family.js` | Add layered procedural state ticks/backplate and aperture treatment for ready, blocked, expiring/final, and rift state using explicit frame facts. | Makes route/extraction state readable before labels. |
| `src/render-three/visual-style.js` | Replace only-static treatment constants with bounded family/state/density policy helpers. Rebalance Breacher/player resting palette, wreck matte radius, rift contrast, fauna/sentry treatments. | Creates one shared separation grammar. |
| `src/render-three/three-renderer.js` | Feed density-aware treatment helpers; maintain pooled resources, `renderOrder`, current scene groups, and `coords.js` projection. Expose local matte and family-state diagnostics. | Integrates the system without widening ownership. |
| `src/presentation/presentation-style.js` | Add only renderer-neutral palette/motion/state hints and quality budgets needed by the above; no game-state logic or Three materials. | Keeps truth boundary explicit. |
| `src/ui/asset-kit.js` | Constrain item icon overlays to a single primary family read plus tier/state cues; add resilient asset-load diagnostics/fallback only if currently absent. | Stops icon overencoding and protects UI readability. |
| `src/ui/{canvas-primitives,hud-primitives,design-tokens}.js` and screen draw call sites in `src/main.js` | Use full generated frames only at major decision boundaries; replace nested frames with rails/dividers; enforce selected/warning frame use. | Aligns UI hierarchy to the target system. |
| `tests/renderer.cjs` | Add semantic fixtures/assertions for distinct fauna/sentry, portal states, wreck states, player motion-state overlays, local/global matte budgets, grayscale/small-scale family separation, and missing-asset failures. | Tests contracts without pretending to automate taste. |
| `tests/ui-visual.cjs`, `tests/ui-assets.cjs`, `tests/ui-motion*.cjs` | Add Deck-scale icon/frame density, selected/warning distinction, item family/tier/state independence, and reduced-motion still-state captures. | Guards the UI relationship to generated art. |
| `tests/perf-probe.cjs` | Measure calls/pooled meshes/asset errors in entity-showcase and representative dense state; enforce no regression against Deck-oriented budget after baseline capture. | Ensures visual polish does not trade away 60fps. |
| `tests/agent-play-eval.cjs` | Add labeled, natural-flow evidence checkpoints where actual route/portal/wreck/signal states arise; keep fixture use out of representative proof. | Confirms the art reads in an authoritative journey. |

## Bite-sized implementation tasks

### Task 0: Define the shared presentation-fact schema (added by Orrery review)

**Objective:** Publish, in one commit, the renderer-neutral facts that both this lane and the timbre soundscape lane consume: portal state (`ready`, `blocked`, `expiring`, `final`, `rift`) and its abort edges, wreck state (intact/looted/cluster, drift velocity where sim truth exists), player motion state (thrust/brake/coast, slingshot readiness/engage/release), run-pressure (0–1 from authoritative run progress, signal zone, Inhibitor form), and the quality tier.

**Files:**
- Modify: `src/presentation/presentation-frame.js`, `src/presentation/presentation-style.js`.
- Modify: `tests/` presentation-frame coverage as appropriate.

**Steps:**
1. Derive every fact from existing sim truth only; if the sim does not publish a needed fact, coordinate a reviewed additive sim event field rather than inferring client-side.
2. Document each fact's name, type, and owner in `docs/design/THREE-ENTITY-VISUALS.md` (or a short shared contract section) so the timbre lane can cite it.
3. Collect the timbre lane's fact requests before freezing the schema; audio consumes these facts read-only and does not edit the presentation boundary.
4. Audio quality degradation keys off the same quality tier exposed here — no second quality knob.

**Acceptance:** One schema serves both lanes; no lane adds private near-duplicate facts later; sanitization/tests cover the new fields.

**Sequencing:** This is the first code commit of the lane, after Greg's verdict gate.

### Task 1: Provision and confirm the visual-review baseline

**Objective:** Provision the implementation worktree (the overnight worktree lacked `node_modules`) and confirm the already-green visual lanes run locally before judging production art.

**Files:**
- Inspect/modify only if root cause requires it: `package-lock.json`, test bootstrap files referenced by `tests/run-all.cjs`, `tests/helpers.cjs`, `tests/hud-deck.cjs`.
- Do not edit historical `tests/screenshots/**` folders.

**Steps:**
1. Confirm the local dependency state using `npm ci`/the project’s approved package install flow without changing dependency versions.
2. Run the smallest failure reproductions: `node tests/hud-deck.cjs "index-a.html?renderer=three"`, `node tests/renderer.cjs "index-a.html?renderer=three"`, and `node tests/ui-visual.cjs "index-a.html?renderer=three"`.
3. If the test API race is real in source rather than a missing dependency, make the minimal readiness wait in the harness; do not weaken test assertions.
4. Run `npm run test:visual` and preserve only its new timestamped output for review. Do not modify old ignored screenshots.
5. Record the exact output directory and failures/passes in the implementation PR/commit body, not in the style guide.

**Acceptance:** `npm run test:visual` reaches all selected suites with a usable renderer/UI capture set and no missing dependency/API-race failure.

### Task 2: Establish an auditable visual evidence board

**Objective:** Turn the generated art and its in-context rendering into repeatable review evidence.

**Files:**
- Modify: `tests/renderer.cjs`, `tests/ui-visual.cjs`.
- Create only if needed: a small documented review manifest under `docs/v0.3/evidence/` that references, not copies, timestamped harness outputs.

**Steps:**
1. Capture `entityShowcase`, `visualReference`, and `shipBakeoff` at 1280×800 in scene, ASCII composite, grayscale, and 25% couch proxy modes.
2. Capture title, Home, map select, HUD, pause, inventory, extracted results, death results, and reduced-motion states at 1280×800; retain 1280×720 compact coverage.
3. Add fixture metadata identifying source: `fixture`, `natural journey`, or `representative flow`; never label injected fixture art as player-reachable proof.
4. Add a short clip/temporal capture for player thrust/brake, slingshot engage/release, portal state transition, wreck interaction, and ecology/sentry motion.
5. Review against the target read order with labels off first, then against grayscale and 25% scale.

**Acceptance:** A reviewer can find exact current captures and identify each asset family, UI surface, evidence type, and known limitation without guessing.

### Task 3: Lock the expanded v0.3 style guide before code changes

**Objective:** Make the target system above the acceptance contract for all later art patches.

**Files:**
- Modify: `docs/design/VISUAL-STYLE-GUIDE-v0.3.md`, `docs/design/THREE-ENTITY-VISUALS.md`, `docs/design/UI-VISUAL-SYSTEM.md`.

**Steps:**
1. Add the “failing astronomical instrument” thesis and read order, naming it explicitly as the visual rendering of the shared cross-lane metaphor “the failing instrument.”
2. Add explicit family grammar for player, remote, hostile, wreck, portal, star, planetoid/comet, fauna, sentry, well, and Inhibitor.
2b. Reconcile the new density/matte and scale rules with the existing `docs/design/VISUAL-DENSITY.md` and `docs/design/VISUAL-SCALE.md` — amend or supersede them explicitly; do not create a parallel rulebook.
3. Add the matte/halo/trail value and density budgets; specify player/portal priority and cluster falloff.
4. Add the full-frame/rail-only UI rule, item icon signal priority, and magenta reservation.
5. Add the required 1280×800 handheld, grayscale, bright-light, 25% couch, normal-motion, and reduced-motion reviews.

**Acceptance:** The docs make it impossible for a future contributor to use a generated asset, color, halo, or UI frame in a way that contradicts the target system without explicitly changing the guide.

### Task 4: Repair ecology category separation at the source and manifest boundary

**Objective:** Make fauna and sentries distinguishable without labels or hue-only coding.

**Files:**
- Modify: `assets/source/generated/v0.3/world-entities-atlas.png` only after source-art approval.
- Modify: `scripts/build-visual-assets.cjs`, `assets/visual/manifest.json` (generated), `src/render-three/entity-assets.js`, `src/render-three/entities/world-sprite-visual-family.js`.
- Regenerate: affected `assets/visual/entities/{sentry-fauna,sentry,fauna}.png` as applicable.

**Steps:**
1. Produce/review two source cells: fauna has organic asymmetric mass and calm current-led read; sentry has segmented/directional scanning or lunge read.
2. Extend atlas names/mapping so the two assets have stable runtime IDs; do not overload `sentry-fauna`.
3. Update selectors so each family uses its own explicit presentation entity type/state.
4. Give fauna a slow, amplitude-bounded drift/pulse treatment and sentry a sparse, state-driven direction/scan treatment; both stay pooled.
5. Add fallback handling that fails diagnostics/test fixtures loudly if either runtime asset is missing.

**Acceptance:** At 1280×800, grayscale, and 25% proxy with labels off, reviewers can distinguish fauna from sentry and from ships/wrecks. The distinction survives `minimal`, `default`, and `rich` quality tiers.

### Task 5: Normalize player, hostile, and remote ship language

**Objective:** Make player identity strongest, hostile intent peripheral-readable, and hull variation legible without stealing value semantics.

**Files:**
- Modify: `src/render-three/visual-style.js`, `src/render-three/entities/player-visual-family.js`, `src/render-three/entities/world-sprite-visual-family.js`, `src/presentation/presentation-style.js` as required for neutral hints.
- Optional approved asset revision: `assets/source/generated/v0.3/world-entities-atlas.png` and derived ship slices.

**Steps:**
1. Keep Drifter’s clean cyan/white spine as baseline player read.
2. Retint/rebalance Breacher’s persistent amber so its core remains friend-category neutral/blue-white; reserve amber for active burn/heat only. **Requires Greg's explicit sign-off before execution** — this changes shipped hull identity while his visual verdict is open.
3. Define remote marker (cooler outline/notch plus short low-intensity trail) that is not another cyan portal read.
4. Keep scavengers’ hooked red silhouette but confine red brightness to rim/heat and remove any reward-like white/gold competition.
5. From authoritative presentation state/events only, add bounded thrust, brake, signal, and slingshot state accents; each must disappear/settle correctly when event/state ends.
6. Capture normal/busy fabric and a motion clip at Deck scale before selecting final constants.

**Acceptance:** In a desaturated capture the player, remote, and hostile ship shapes remain distinguishable; in color, cyan remains route/player tech and amber never makes Breacher look like loot.

### Task 6: Complete route and salvage state grammar

**Objective:** Make portals, wrecks, stars, and moving landmarks teach routes and consequence without labels or GPS clutter.

**Files:**
- Modify: `src/render-three/entity-assets.js`, `src/render-three/entities/{portal-visual-family,wreck-visual-family,world-sprite-visual-family}.js`, `src/render-three/visual-style.js`, and only necessary renderer-neutral frame/hint code.

**Steps:**
1. Define an explicit portal state table: extraction-ready, blocked, expiring, final, rift. Each gets one geometry/state tick change plus an aperture/backplate treatment; never fill the black aperture.
2. Bind the table strictly to the Task 0 presentation-fact schema. If a fact is absent, extend the Task 0 schema (this lane owns that boundary) from existing sim truth; do not infer it in Three, and coordinate the addition with the timbre lane, which consumes the same facts.
3. Rotate wreck clusters/appropriate hull fragments from provided velocity only; maintain no rotation if unavailable.
4. Make intact actionable salvage use one amber glint; make looted state remove it and use muted rim; make cluster state prioritise broken mass over lots of individual sparkles.
5. Preserve star radial geometry, planetoid dense body, and comet velocity-opposed tail. Add state/type variants only where canonical data exists.
6. Tighten slingshot affordance to readiness band → engaged tether → release vector burst, all authoritative/presentation driven and below HUD.

**Acceptance:** A player can tell route anchor, cyan extraction aperture, unstable/blocked portal state, intact value wreck, looted wreck, comet, and star without labels in a busy field; the player’s travel line remains readable.

### Task 7: Make separation density-aware and quality-safe

**Objective:** Preserve local entity contrast while preventing matte craters and post-stack mismatch.

**Files:**
- Modify: `src/render-three/visual-style.js`, `src/render-three/three-renderer.js`, `src/presentation/presentation-style.js`, `tests/renderer.cjs`, `tests/perf-probe.cjs`.

**Steps:**
1. Extract a shared treatment resolver taking family, explicit state, sprite scale, local density, and quality tier.
2. Keep player/portal minimum separation; decay low-priority matte radius/opacity in local clusters before reducing sprite core value.
3. Report aggregate matte coverage plus local peak coverage, family totals, halo/rim count, and state-accent count through existing backend diagnostics.
4. Establish a baseline on default/rich/capture and set thresholds from measured 1280×800 representative scenes, not invented numbers.
5. Review Composer/Three output together for cyan/white clipping, glyph-edge instability, scanline aliasing, and chromatic separation; tune shared quality values rather than adding a compensating full-screen veil.
6. Run the Deep Field perf probe and physical Deck capture when available; optimize to atlas/instancing only after measured ceilings justify it.

**Acceptance:** `visualReference` retains all required family reads over dense fabric; local matte decay is observable in a dense fixture; no quality tier renders unstable glyph edges; representative performance supports 60fps on target hardware.

### Task 8: Reduce generated UI/frame and icon hierarchy debt

**Objective:** Keep the terminal frame system strong without allowing it to become decorative scaffolding.

**Files:**
- Modify: `src/ui/asset-kit.js`, `src/ui/canvas-primitives.js`, `src/ui/hud-primitives.js`, `src/ui/design-tokens.js`, relevant draw paths in `src/main.js`, `tests/ui-assets.cjs`, `tests/ui-visual.cjs`.
- Optional source revision only after approval: `assets/source/generated/v0.3/{item-families-atlas,ui-frame-parts-atlas}.png` and derived visual files.

**Steps:**
1. Inventory every `drawGeneratedFrame` call by screen and classify it as major panel, subsection, selection, warning, or decoration.
2. Keep full four-edge frames only around major decision groups. Replace subsection frames with a single rail/divider/junction or whitespace.
3. Ensure warning corner art appears only for genuine danger/confirmation, never generic selected state.
4. Define icon assembly order: family silhouette first; tier rail second; selected/equipped/consumable state third; hashed identity mark last and removable if it fails at Deck scale.
5. Review each item family in grayscale at intended icon size. Replace/recolor family art that relies on magenta outside the documented anomaly exception.
6. Ensure all icon-only statuses have text/pattern alternatives and selected/disabled/consumable/equipped states pass reduced-motion and keyboard/gamepad focus checks.

**Acceptance:** Major UI screens have one clear decision axis; no nested-card wallpaper; item family, tier, and state remain independently recognizable at Deck scale; action text meets local contrast floors.

### Task 9: Add contract tests and finish real visual verification

**Objective:** Make regressions visible without turning subjective taste into brittle pixel diffs.

**Files:**
- Modify: `tests/renderer.cjs`, `tests/ui-visual.cjs`, `tests/ui-assets.cjs`, `tests/ui-motion.cjs`, `tests/perf-probe.cjs`, `tests/agent-play-eval.cjs`, and `tests/suite-manifest.cjs` only if needed.

**Steps:**
1. Add semantic renderer checks for distinct fauna/sentry asset IDs, portal/wreck/player states, missing asset load errors, treatment count budgets, and no renderer-owned gameplay state.
2. Add image-analysis checks for family contrast/peak only as broad canaries; preserve manual review for silhouette/taste.
3. Add 1280×800 and 1280×720 UI capture checks for primary action, warning, critical gauge, full-frame count/density, icon state, and reduced-motion settled state.
4. Add a short temporal capture/assertion for events that need movement review, while retaining still-state evidence.
5. Run: `npm run assets:visual` (when sources change), `npm run test:three`, `npm run test:ui`, `npm run test:ui-motion`, `npm run test:visual`, `npm run test:playtest`, `npm run test:agent-eval`, `npm run test:perf`, `npm run test:fast`, `npm test`, and `npm run test:authority`.
6. Run an actual fresh local-authority play session with `npm run stack -- --no-open`, then perform the review matrix below. When available, repeat on physical Steam Deck Gaming Mode.

**Acceptance:** Every automated lane passes; current capture output is reviewed by a human at real Deck resolution; no claim of physical Deck success is made from desktop/downscaled evidence.

## Verification matrix

### Automated/build

- `npm run assets:visual` after any source atlas/mapper edit; verify `git diff -- assets/visual assets/visual/manifest.json` shows only deterministic intended outputs.
- `npm run test:three` validates Three layer/asset lifecycle/separation contract.
- `npm run test:ui` and `npm run test:ui-motion` validate screen states, contrast regions, compact layouts, focus, and reduced motion.
- `npm run test:visual` must be green before visual acceptance; treat the current missing-dependency/API readiness failures as a blocker, not an allowed skip.
- `npm run test:playtest` and `npm run test:agent-eval` validate a fresh authoritative journey and truth-labeled captures.
- `npm run test:perf` plus a physical Deck pass validate no visual regression against 60fps target; do not treat headless minimum FPS as proof of physical 60fps.
- `npm run test:fast`, `npm test`, and `npm run test:authority` prove no art/presentation change moved truth into the renderer or broke gameplay contracts.

### Human visual/listening review

At 1280×800 on the Steam Deck path, then at 25% couch proxy and grayscale:

- Within two seconds, identify player, travel line, immediate hostile, portal state, actionable versus looted wreck, current selected UI action, danger state, and next input.
- With labels off, correctly classify player/friend, hostile, wreck/salvage, star, planetoid/comet, extraction portal/rift, fauna, sentry, and anomaly.
- Inspect the busiest well/fabric field: player and portal survive; ASCII flow direction stays legible; no black matte crater or bloom mush hides a route.
- Inspect bright ambient-light condition: cyan/white cores, red threat accent, amber value glint, green ecology, and magenta anomaly remain role-distinct.
- Watch short clips: thrust/brake, slingshot, portal change, pickup/wreck, and sentry action explain events rather than becoming decorative particles.
- In reduced motion, inspect still frames: selected action, portal readiness, danger, outcome, and required input remain explicit with no flicker dependency.
- Listen during the same clips: visual event accents and bounded audio cues must align to authoritative outcome; no audio is the sole confirmation.

## Acceptance criteria

The implementation is accepted only when all apply:

- The ASCII-fluid fabric remains the dominant movement/terrain surface; entity art reads as physical evidence inside it, not pasted UI stickers.
- All public runtime entity families have a dedicated, manifest-bound, nearest-filtered asset path or an explicitly documented procedural reason not to have one.
- Fauna and sentries have separate silhouettes and motion signatures at Deck scale and in grayscale.
- Drifter, Breacher, remote, and hostile ship reads are distinct without confusing player, route cyan, salvage amber, or danger red roles.
- Portal readiness/blocked/expiring/final/rift states, wreck intact/looted/cluster states, and route landmark categories read without labels and only from authoritative presentation facts.
- Generated assets never author position, collision, pickup, extraction, signal, ability, death, inventory, or outcome truth; all coordinate conversion remains through `src/coords.js`.
- Global and local matte/halo budgets preserve dense-field ASCII visibility; player/portal readability remains intact at normal gameplay zoom.
- UI has a clear hierarchy: major panels use frames, subgroups use rails/whitespace, selections use three cues, and warnings are not generic decoration.
- Item family, tier, identity, consumable, equipped, selected, and disabled signals remain independently readable at intended Deck UI size; magenta remains controlled.
- Normal motion and reduced-motion states communicate the same required facts; no required state is carried by flashing, hue, or sound alone.
- All relevant tests/builds pass, a fresh authoritative journey has current captures, and actual physical Deck Gaming Mode evidence is recorded before claiming handheld acceptance.
- The production path remains pooled/bounded and supports the project’s 60fps target; an atlas/instancing rewrite happens only after measured need.

## Explicit non-goals

- No gameplay-rule, protocol, Ballpark, collision, movement, loot, signal, portal, or authority rewrite.
- No new renderer, ECS migration, shader-engine replacement, texture-atlas rewrite without measured need, or broad asset-platform change.
- No conversion of wells, fluid fabric, or Inhibitor corruption into normal generated sprites; their procedural identity remains deliberate.
- No generic space-game starfield, smooth low-poly ships, glossy vector UI, heavy depth of field, full-screen fog, or “make everything neon” pass.
- No client-side prediction/inference of portal/pickup/danger results for prettier effects.
- No promise that desktop capture/downscale substitutes for physical Steam Deck Gaming Mode validation.
- No edits to historical/untracked screenshot directories, unrelated docs, or unrelated source systems.

## Rollback notes

- Keep each family change atomic: source-atlas/asset generation, selector mapping, treatment policy, UI deployment, and harness evidence should not be bundled with authority work.
- Generated outputs are reversible by restoring the approved source atlas and running `npm run assets:visual`; do not manually patch runtime PNGs.
- If a new sprite family fails silhouette review, revert its selector to the last manifest-bound production asset while retaining the rejected source art only in its auditable source/decision record—never silently substitute a primitive in promo captures.
- If density-aware separation harms readability or performance, revert only the treatment resolver/constants to the previously measured policy; do not remove presentation-frame boundaries, pooling, or `coords.js` projection.
- If UI frame reduction causes a screen to lose grouping, restore the minimum necessary major frame rather than reintroducing nested frames globally.
- If a visual test is flaky, fix readiness/fixture determinism and retain semantic assertions. Do not lower contrast floors, bypass fresh-process rules, or relabel fixture screenshots as representative proof.
- Use `git revert <commit>` for any shipped slice; do not reset or overwrite historical evidence.

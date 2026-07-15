# Changelog

> **Journal policy from 2026-07-14:** this file records project-wide releases,
> version promotions, and large revisions merged between version lines.
> Detailed branch work belongs in that version line's changelog. Existing
> entries below remain archival history; do not duplicate routine commits,
> CI receipts, or orchestration state here.

---

## 2026-07-14 — Maestro specialist lanes joined Primary Sol routing

- Added pinned production and quality-review specialist lanes for coordinated
  Palette, Timbre, Troubadorb, and Orrery judgment over coherent player-facing
  slices.
- Kept narrow specialist fixes isolated while gameplay authority, persistence,
  networking, shared architecture, integration, and final gates remain with
  Forge and the owning workstream.
- Prevented duplicate review ceremony: a Maestro lane already includes Orrery;
  standalone Orrery stays reserved for distinct E2/E3 strategic questions.

## 2026-07-14 — asynchronous feature delivery and Primary Sol routing

- Feature workers now run only changed-contract proof, commit a durable
  artifact, and return control; broad CI runs asynchronously at integration,
  nightly, candidate, or release checkpoints.
- Primary Sol owns cross-version routing, merge topology, and RC selection.
  Workstream Sols integrate version-local commits and delegate bounded feature
  and CI work to Luna agents.
- Orrery/Fable/Opus review is reserved for bundled milestone verticals or
  strategic design forks rather than stepwise commit review.
- Primary runs Sol/high, version integrators run Sol/medium, and descendant
  workers use Luna/high or the narrow Luna/xhigh risk lane. Routine LBH Forge
  traffic goes to `#last-black-hole`; only Primary may DM Greg when attention
  is actually required.
- Main now owns the cross-version README, roadmap, durable decision journal,
  branch/release contract, and push policy. The pre-push release gate runs only
  for `origin/main`; v0.3/v0.4 pushes no longer trigger release preparation.

## 2026-07-08 — Cloudflare Drop share build target

- Added `npm run build:drop` and `npm run release:drop` for temporary
  Cloudflare Drop / Pages drag-and-drop browser sharing.
- The Drop target builds a content-rooted zip, forces `localSandbox=1`, clears
  stale sim-server browser state, defaults to the Three renderer, and records
  that it is not an embedded-authority build.
- `release:drop` now goes through the release helper so hash-named Drop builds
  require committed tracked source unless explicitly overridden for a probe.
- Added a fast/static harness guard that builds the Drop artifact and checks
  the share notes, sandbox bootstrap, Three runtime copy, build metadata, and
  archive root shape.
- Updated README and deployment/build docs so Cloudflare Drop sits beside itch
  as a quick sandbox-share lane rather than a durable product release channel.

## 2026-07-06 — v0.2 main consistency pass

- Fixed a Home render crash caused by reading `homePromptOptions` before it was
  initialized; this had stopped the frame loop after reaching Home and made
  Deck/controller tab navigation appear broken.
- Tightened remote slingshot input so controller-held Y reaches the
  authoritative sim, while direct protocol tests cover queued press edges.
- Aligned Deck/home prompts with actual controls, including controller X for
  map seed reroll and prompt-label inventory rows.
- Made rig copy honest by adding server-owned coefficients for shipped low
  levels and showing v0.2 caps in the Home rig UI instead of advertising
  unshipped levels.
- Removed stale death-tax balance/display hooks so current results speak in
  ledger credit, residue, and cargo salvage value.
- Fixed Three camera sync and initial fluid seeding assumptions that could use
  stale camera state or wrap off-window wells into the visible fluid buffer.
- Added harness guards for sim protocol normalization, unknown suite names,
  safer authority slingshot placement, and weekly playable fast validation.
- Refreshed the formal build-health record after core, renderer, perf, and
  title-prototype verification passed.

## 2026-07-05 — Ledger honesty pass

- Changed shared EM earnings semantics so `runEmEarned()` means profile ledger
  credit, not extracted cargo value. Extracted cargo now stays visible as
  salvage value and goes to the vault unless overflow is auto-sold.
- Wired the same ledger credit through local profile write-back, control-plane
  write-back, run records, chronicle fallback records, and result-screen copy.
- Stopped the current demo death path from taxing existing EM; death now awards
  the reduced survival residue while cargo/equipped losses remain the main
  pressure.
- Updated balance, control-plane, run-results, meta-flow, and UI visual tests to
  prove displayed EM matches durable profile deltas.

## 2026-07-01 — Version-line branching process added

- Added `docs/project/BRANCHING-AND-RELEASE-LINES.md` as the tracked process
  source for branch roles, routing, merge cadence, promotion, and validation.
- Added branch routing, subagent branch discipline, merge-forward cadence, and
  promotion rules to `docs/project/JAM-CONTRACT.md`.
- Logged the branch-by-version-line decision so future agents keep big
  next-version work off the demo line until Greg calls promotion.

## 2026-07-01 — Carbon Engine research added

- Investigated CCP's open-source Carbon Engine repos as LBH reference material:
  Destiny simulation, Trinity renderer, Blue/runtime, scheduler, pathfinder,
  resources, mesh, audio, and spatial clustering.
- Added `docs/reference/CARBON-ENGINE-RESEARCH.md` with source links and LBH
  takeaways for stamped sim authority, snapshot/rebase tests, relevance lanes,
  explicit Three render-plan discipline, manifests, and audio/VFX budgets.
- Updated the v0.2 read order, v0.2/project roadmaps, EVE architecture note,
  and decision log to make Carbon an idea mine rather than a v0.2 engine
  migration target.

## 2026-06-28 — Command button affordance split

- Changed the shared canvas command-button primitive so button faces render
  action labels only, with keyboard/controller prompts as smaller subheading
  text below the slab.
- Applied the split to title, Home launch rail, Map Select `BEGIN DROP`, meta
  salvage report, and run-results CTAs.
- Updated UI primitive, UI motion, and Steam Deck compatibility tests to guard
  against fused labels such as `SPACE LAUNCH RUN` returning.
- Documented the Deck/UI rule in the UI visual system and Steam Deck runbooks.

## 2026-06-28 — Home, drop briefing, and result CTA UI pass

- Rebuilt the Home screen around a three-panel instrument-console layout:
  primary tab rail, central ship/readiness surface, and a loud launch rail with
  EM/vault/best-run/readiness summaries.
- Rebuilt Map Select into a pre-match drop briefing: destination list, large
  route-preview table, risk/seed/signature/hazard/salvage briefing, authority
  copy, and a clear `BEGIN DROP` CTA.
- Tuned post-match continue actions so death/loss outcomes can stay dangerous
  while the actual exit CTA reads as navigation instead of another red warning.
- Re-ran `npm run test:ui`; the final evidence set is
  `tests/screenshots/ui-visual-2026-06-29T004847716Z/`.

## 2026-06-28 — Orrery visual review integration

- Wrote the Orrery visual review prompt and captured Orrery's response under
  `docs/project/reviews/`.
- Integrated the low-risk review findings: wreck telemetry labels now dedupe
  nearby repeated cluster names, and the run signature callout is edge-docked
  with local backing instead of lingering dead-center over the playfield.
- Updated UI/VFX roadmaps, the decision log, and harness docs to lock in
  readability-before-motion sequencing: Home and Map Select static composition
  come before more screen motion or new VFX families.
- Recorded the current title truth: plain-left is the shipped v0.2 default,
  while opposite-left remains a review challenger for Greg's taste call.

## 2026-06-28 — UI motion forge pass

- Ran a Forge review pass on the shared UI motion layer, its first production
  call sites, and the harness/docs that describe it.
- Tightened UI motion disable semantics so disabled/intensity-zero motion no
  longer draws transition accents, while reduced motion still keeps static
  readable state.
- Wired the tracked focus-pulse timer into selected profile/home/map/pause
  affordances and moved the results overlay onto the shared motion panel helper.
- Updated the test harness guide to name `npm run test:ui-motion` and the
  reduced-motion title capture explicitly.

## 2026-06-28 — UI motion layer

- Added `src/ui/motion.js` as the shared canvas UI motion kit: panel reveal
  clipping, staggered rows, type-on text, CTA pulses, directional wipes, and
  reduced-motion resolution.
- Applied the first motion pass to title, profile select, home, map select,
  run results, meta report, pause, and screen transitions while keeping the
  in-match HUD stable.
- Added `CONFIG.ui.motion` plus dev-panel controls for motion enable/reduced
  state, intensity, panel/text duration, row stagger, and CTA pulse timing.
- Added `tests/ui-motion.cjs`, wired `UIMotion` into the fast/core/static/full
  harness lanes, and added a reduced-motion title capture to `npm run test:ui`.
- Updated the UI visual harness to let ordinary animated surfaces settle before
  couch/readability sampling.

## 2026-06-28 — Title telemetry polish

- Made the left-aligned title layout the default shipped title composition;
  center, right, and opposite-left remain available for comparison fixtures.
- Updated the title UI fixture baseline so it follows the shipped default
  layout unless a test explicitly requests another variant.
- Removed title-screen-only red well core/hazard debug markers from the Three
  entity layer and suppressed canvas well/coordinate debug overlays on the
  title phase while leaving the ASCII accretion fabric intact.
- Demoted the attract-loop status copy into a small telemetry rail and changed
  the primary CTA from `SPACE BEGIN` to a clean `LAUNCH RUN` button with a
  separate input prompt.
- Added title backdrop object telemetry labels with thematic generated names
  and NAV fixes for stars, wrecks, portals, and orbiting bodies.

## 2026-06-28 — Reviewable slices and first title VFX kit

- Reframed v0.2 planning around six reviewable slices: Attract Mode + UI/VFX
  Identity, Feel + Route Pass, Entity Visual Language, Loop + Meta Clarity,
  Playable Build Targets, and Process + Harness.
- Added the first event-driven Three VFX implementation: renderer-neutral
  `titleGlyphFault` events, quality budgets, bounded pooled particles,
  `screen-vfx-layer`, title glyph embers/scan splinters, and renderer VFX
  stats.
- Added explicit `titleVfx` and `titleVfxHeavy` renderer fixtures plus
  `tests/vfx.cjs`, so title VFX can be validated without confusing staged
  review frames for normal gameplay captures.
- Exposed VFX tuning in the dev panel, including a quality dropdown and
  bounded intensity/budget controls.
- Restored local planetoid/comet updates and added deterministic fixture
  positions/transit loading so the visual-reference harness can judge them as
  real object families instead of empty or off-board targets.
- Updated the v0.2 roadmap, project roadmap, UI visual pass plan, and Three
  VFX pass plan so future work routes through the six-slice cadence.

## 2026-06-28 — Steam Deck compatibility and app-surface pass

- Centralized Deck/controller prompt labels in `src/ui/input-prompts.js` and
  routed the DOM HUD, canvas menu hints, map-select copy, results overlay,
  pause screen, cargo-full warning, and meta prompt through it.
- Added a Deck renderer flag (`deck=1`) from the Electron launcher so handheld
  UI behavior is explicit instead of inferred from viewport size.
- Raised HUD couch-test minimums: larger body text, thicker signal/fuel/ability
  gauges, stronger panel backing, and separated bottom-left ability/pulse/cargo
  panels to avoid overlap on 1280x800 Deck captures.
- Fixed the salvage report category fallback so extracted items no longer print
  `[undefined]`.
- Added reproducible app and Steam placeholder assets with `npm run assets:app`,
  including app icons, Steam capsule/library images, and draft Steam store copy.
- Wired the app icon into desktop packaging, Deck `.desktop` entries, the
  one-click installer, and the Gaming Mode shortcut writer.
- Hardened `deploy:deck` so it reuses an existing current Linux artifact by
  default instead of clobbering a complete all-target release folder; use
  `--force-build` for an intentional Deck-only Linux rebuild.
- Added `tests/steam-deck-compat.cjs` to guard Deck prompts, HUD minimums,
  renderer Deck mode, app icon wiring, and Steam asset dimensions.

## 2026-06-28 — Steam Deck demo deploy

- Built and deployed Linux release `0.2.2.332007f` to Greg's Steam Deck at
  `/home/deck/Games/last-singularity` over Tailscale.
- Refreshed the Steam Gaming Mode non-Steam shortcut for **Last Singularity** so
  it points at the Deck launcher wrapper instead of the raw Electron binary.
- Verified Deck reachability, launcher/executable permissions, and absence of a
  stale running Last Singularity process after deploy; physical Gaming Mode
  launch and controller review remain the demo acceptance step.

## 2026-06-28 — UI visual-system direction

- Ran an LBH forge architecture pass over the recent UI/title/typography/VFX
  stack, fixed title fixture drift and title-capture clock determinism, updated
  agent onboarding plus v0.2 roadmaps, and added a review packet under
  `docs/project/reviews/2026-06-28-forge-pass-ui-vfx-architecture.md`.
- Connected the UI motion direction to the Three VFX plan: UI motion now owns
  readable screen state and reduced-motion fallbacks, while approved beats such
  as title glyph faults, launch, extraction, collapse, and Inhibitor UI faults
  can emit renderer-neutral VFX accents below or around clean UI.
- Added `docs/project/THREE-VFX-PASS-PLAN.md`, a detailed implementation plan
  for a pooled, event-driven Three VFX kit covering title corruption, ship
  thrust/brake, portal sparks, pickup glints, Inhibitor faults, quality
  budgets, harness coverage, and future renderer portability.
- Logged the VFX architecture decision: build rich Three effects for the
  current PC/web/Steam Deck path, but keep effect behavior behind
  renderer-neutral events so future native/console ports copy the contract
  instead of inheriting Three internals.
- Reworked title corruption into a per-glyph UI overlay: the clean wordmark
  remains stable while Inhibitor-pink glyph slots flicker during bursts, with
  higher intensity increasing both affected slots and swap frequency.
- Changed title-wordmark corruption from a persistent Zalgo/pink treatment to a
  clean bone/cyan base with short Inhibitor-pink burst faults, and added a
  `title-glitch` UI visual capture for the deliberate burst frame.
- Added title-screen composition variants for review: left-aligned UI,
  right-aligned UI, and a left-aligned layout with the title camera panned so
  the well sits opposite the copy. The UI visual harness now captures all three
  variants with couch proxies.
- Tightened title gutters and aligned title corruption with the Inhibitor-pink
  role, keeping cyan/flow reserved for stable framing and the CTA.
- Reworked the title screen into a first attract-mode slice: the red wordmark
  was replaced with a cyan/bone title treatment, only the title text gets
  bounded Inhibitor-style corruption jitter, title/subtitle/CTA text now sits
  on local backing, and the title map gained a larger central well, stars,
  wrecks, orbiting bodies, and a rift that winks out on the title loop.
- Expanded `npm run test:ui` with a `title-attract` capture so the UI harness
  verifies both the immediate title read and a later attract-loop frame.
- Added `docs/reference/UI-MOODBOARD.md` to translate Evangelion/NERV,
  Marathon, Returnal, and the current LBH Three visual hierarchy into an
  original UI direction for v0.2.
- Added `docs/design/UI-VISUAL-SYSTEM.md` with contrast, role-palette, sizing,
  post-processing placement, surface rules, and a named couch-test rule.
- Added `docs/project/UI-VISUAL-PASS-PLAN.md` to sequence token cleanup,
  canvas UI primitives, title/home/map-select/HUD/results rebuilds, and future
  UI visual-harness coverage.
- Generated five UI target concepts under
  `docs/reference/target-visuals/2026-06-28-ui/` for title, home, pre-match,
  in-match HUD, and post-match results.
- Brightened shared UI tokens and DOM HUD CSS variables toward the v0.2 entity
  role palette, and reset remaining DOM UI letter spacing to zero for
  readability.
- Expanded the UI pass plan with the current canvas/DOM implementation shape,
  per-screen contracts, a concrete shared canvas primitive kit, UI visual
  harness expectations, implementation order, non-goals, and open choices for
  Greg review.
- Added `src/ui/canvas-primitives.js` plus `tests/ui-primitives.cjs` so canvas
  menus/results can share role colors, alpha handling, panels, focus rows,
  command buttons, gauges, warning strips, status pills, labels, key/value rows,
  and text fitting.
- Migrated the run-results overlay onto the shared canvas primitives, with
  stronger outcome hierarchy, clearer cargo/accounting reads, and a readable
  continue command.
- Added `tests/ui-visual.cjs` and `npm run test:ui` for deterministic UI
  captures of title, profile select, home, map select, in-match HUD,
  extraction results, and death results, including 50% and 25% couch-proxy
  images.

## 2026-06-27 — Inhibitor text corruption and dev panel refresh

- Added bounded Inhibitor-owned Zalgo text corruption for the active form label
  and Inhibitor event warnings. The helper strips previous combining marks
  before every pass, caps marks per character, and preserves the clean source
  text so corruption cannot compound over time.
- Added `CONFIG.inhibitor.textCorruption` with a dev-panel "how corrupted"
  slider plus density, max-mark, vessel, warning, proximity, and refresh-rate
  tuning knobs.
- Cleaned up the dev panel: prioritized commonly tuned sections, added config
  filtering plus expand/collapse controls, default-collapsed long-tail sections,
  fixed typing/backtick behavior, and removed stale unused control builders.
- Added `tests/text-corruption.cjs` plus validation bounds so the corruption
  effect stays deterministic, readable after stripping, and size-bounded.

## 2026-06-27 — Typography roles and bundled fonts

- Bundled Oxanium, the full Monaspace variable webfont family, and Noto glyph
  fallbacks under `assets/fonts/` so local, Deck, iPad, desktop, and offline web
  builds do not depend on external font services.
- Added `src/ui/typography.js` as the shared display/UI/glyph font role helper.
  Canvas overlays, the dev panel, HUD tokens, and the ASCII atlas now route
  through the same Monaspace-first stacks.
- Updated boot to wait briefly for webfonts before generating the ASCII font
  atlas, preventing first-frame fallback fonts from being baked into the shader.
- Added `tests/typography.cjs` to the fast/static/core lanes so missing font
  files or font-stack drift fail loudly.

## 2026-06-27 — Local v0.2.2 source status and ship bakeoff

- Refreshed the local build status around the v0.2.2 source path: a fresh
  local-host stack, Three renderer, and local authoritative sim reached
  gameplay, accepted thrust input, advanced remote ticks, and stayed at 60 FPS
  in the sampled frame.
- Added entity separation diagnostics to the Three renderer so visual fixtures
  report contrast-backing counts, estimated matte coverage, and player
  ship-candidate counts.
- Added `shipBakeoff` as a default renderer fixture comparing the player
  footprint as a 2D pixel sprite card and as a pixel-textured top-down mesh,
  both using the same backing/rim stack.
- Updated visual-language, renderer-harness, and build-status docs so the
  bakeoff is treated as a dev validation scene, not a gameplay map or promo
  capture.

## 2026-06-27 — Scene debug captures fenced off

- Confirmed the hot-white/rainbow well frames came from the raw `scene` view
  that bypasses the ASCII pass, not from the final player-facing render target.
- Renamed renderer harness raw scene outputs to `debug-scene-...png` and added
  manifest context so those frames are treated as pre-ASCII diagnostics.
- Updated the social screenshot capture skill/script so `visualReference`
  exports only final ASCII captures by default; raw scene exports now require
  `--include-scene-debug`.
- Updated harness docs to make final ASCII captures the visual target and keep
  pre-ASCII scene captures out of promo/reference review unless debugging
  shader inputs.

## 2026-06-27 — Visual reference readability gate

- Promoted `visualReference` into the default renderer harness so `npm run
  test:renderer` / `npm run test:visual` now checks the object-family scene
  every normal visual pass.
- Added a renderer readability report that samples final post-processed
  luminance for stars, wrecks, portals, ships, fauna, sentries, and planetoids
  against nearby background. The manifest now records per-family readable
  counts, contrast floors, peak luminance, and weakest sampled objects.
- Exposed the Three scene-state payload through the test API so visual tests use
  the same object positions the renderer consumes instead of duplicating fixture
  coordinates.
- Strengthened wreck readability after the new gate caught a weak salvage read
  over bright fabric: wrecks now get a broader occluding matte, brighter core,
  and rim treatment.
- Updated renderer and test-harness docs to frame `visualReference` as a coarse
  contrast/accessibility/readability canary, not a pixel-perfect art judge or
  promo scene.

## 2026-06-27 — Promo capture reference-scene split

- Added a dedicated `visualReference` renderer fixture for side-by-side
  development review of stars, wrecks, portals, ships, fauna, and sentries
  without pretending that array is a normal match screenshot.
- Kept `visualReference` out of default promo sweeps; it remains separate from
  player-facing screenshots even though it is now part of visual validation.
- Updated the LBH social screenshot skill and capture script so default promo
  batches use representative title, live gameplay, and run-results frames,
  while `--reference-only` captures the dev-only entity board.
- Improved Three star landmarks with a small core, spark silhouette, and halo so
  orange route anchors read less like anonymous background dots.
- Documented that full-quality 4K/30fps promo capture on the Mac mini should be
  treated as background/overnight work when practical.

## 2026-06-26 — LBH memory checkpoint process

- Added a standing LBH process rule: after any substantial Codex session, write
  a short Codex memory checkpoint note under
  `~/.codex/memories/extensions/ad_hoc/notes/`.
- Updated `AGENTS.md` and `docs/project/JAM-CONTRACT.md` so future agents treat
  memory as a routing index for current repo docs, build status, and recent
  architectural decisions, not as a replacement source of truth.
- Clarified that tiny Q&A, one-line fixes, and duplicate status pings should not
  create memory spam; broad renderer/sim/platform/build/playtest/process work
  should.

---

## 2026-06-26 — Three contrast target implementation slice

- Translated the latest visual target board into concrete Three scene tasks:
  layer/post ordering, fabric-backed entity separation, top-down
  pixel-resolved asset constraints, and a contrast-first acceptance lane.
- Added the first implementation slice for entity readability: shared Three
  visual materials, entity subgroups, contact mattes, stronger rim/halo colors,
  and a brighter Three presentation pass for current bridge primitives.
- Added a renderer-only entity showcase fixture so visual review can capture
  player, remote/rival ships, wrecks, portals, stars, planetoids, fauna, and
  sentries in one deterministic scene without changing gameplay maps.
- Updated renderer harness checks to guard entity subgroups and verify the
  showcase renders backing, landmark, salvage, and active visual layers.

---

## 2026-06-26 — Three entity visual-language docs

- Added `docs/design/THREE-ENTITY-VISUALS.md` as the current v0.2 design target
  for non-fluid objects in the Three scene: ships, stars, planetoids/comets,
  wrecks, portals, rivals, fauna, sentries, slingshot affordances, and future
  megastructures.
- Added `docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`,
  `docs/reference/THREE-ENTITY-MOODBOARD.md`, and
  `docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md` to define the full
  back-to-front Three stack, reference board, contrast contract, target visuals,
  and implementation sequence.
- Added generated target visuals under
  `docs/reference/target-visuals/2026-06-26/` for entity separation, scene
  layering, and wider palette exploration.
- Added the v0.2 entity asset-surface rule: ships, enemies, wreck fragments,
  fauna, and other discrete entities should be 2D pixel assets or 3D assets with
  pixelated top-down textures. Octopath remains a vibe reference for pixel
  surfaces inside modern staging, not a mandate for heavy depth of field.
- Added the initial silhouette/category visual pillar and then corrected it
  after Orrery review: silhouette owns broad object category first; color, halo,
  trail, motion, and state accents own affiliation and urgency inside that
  category.
- Updated the entity pass order so implementation first proves contact matte +
  rim shell on current primitives, then runs the player ship sprite-card versus
  pixel-textured-mesh bake-off at Deck scale before broad ship production.
- Updated the v0.2 design bible, roadmap, design/code delta, project roadmap,
  build plan, backlog, and Three migration plan so the current renderer status
  distinguishes shipped primitive projection from the still-needed visual
  ownership pass.
- Marked older visual-scale, rendering-stack, and entity-catalog docs with
  v0.2 notes so their canvas/glyph-era details remain useful history rather
  than stale implementation direction.

---

## 2026-06-26 — Inhibitor fabric/glyph completion

- Added dedicated Inhibitor glyph rows to the ASCII font atlas: math/corruption glyphs for Glitch/Swarm and box/grid glyphs for Vessel.
- Wired authoritative `snapshot.inhibitor` data into the ASCII pass so corruption is localized around the Inhibitor rather than only global transition noise.
- Added the Swarm wake shock as a one-second screenwide ASCII glitch and added shader-local Swarm tendrils in the display/ASCII layers.
- Added sim-side Swarm wreck disturbance with a bounded terminal speed boost, plus authority coverage that nearby wreck drift accelerates.
- Updated Inhibitor design/implementation docs so the previous font-atlas TODO is now marked shipped and the remaining polish is clearly scoped.

---

## 2026-06-26 — Authoritative Inhibitor completion

- Completed the sim-side Inhibitor contract: form-time tracking, Shroud decoy signal sources, Swarm search behavior, Vessel player pursuit, portal blocking/unblocking, well absorption, final portal timing, and `inhibitor_vessel` death causes.
- Wired client-side support for blocked portals, Inhibitor audio events, proximity HUD degradation, and a test API state reader without moving gameplay authority out of the sim.
- Added a focused `tests/inhibitor.cjs` authority suite covering final portal timing, portal blocking, decoy targeting, and Vessel death events.
- Updated Inhibitor design docs with a v0.2 status note so future work follows the sim/renderer split instead of the old client-local state-machine plan.

---

## 2026-06-26 — Inhibitor screenshot harness hook

- Added a debug-only sim endpoint for forcing and resetting authoritative Inhibitor state so late-run forms can be verified in screenshots without bypassing the snapshot/renderer path.
- Added remote-authority coverage for the Inhibitor debug state hook, including reset behavior so shared-session tests remain isolated.

---

## 2026-06-25 — hash-based v0.2 build identifiers

- Added `scripts/version.cjs` as the shared version source: public train from
  `package.json`, full build version from `0.2.x.<current-git-hash>`.
- Added `release:status` and a tracked post-commit hook reminder so each commit
  reports its hash build version and whether the matching release artifact
  exists.
- Updated build, release, Steam Deck deploy, itch deploy, SteamPipe deploy, and
  iOS wrapper metadata to use the same hash-named build version.
- Changed release handoff semantics: `release:internal` builds the current
  committed source; `release:public` advances the public third number only when
  Greg calls it.
- Updated README, build pipeline, deployment, and project-contract docs so
  internal commits consume the hash field while `0.3` / `1.0` remain explicit
  Greg-call milestones.

## 2026-06-25 — v0.2 build-number policy clarification

- Clarified that `0.2.x` is currently a private v0.2 remote-build counter for
  real build handoffs, not the final public semantic-versioning policy.
- Documented `LBH_SKIP_RELEASE_PREP=1` for intentional docs/process-only pushes
  that do not publish a build.
- Recorded the future split between local CI build IDs and public release
  versions once LBH has a hosted website, itch page, or Steam branch.

## 2026-06-25 — v0.2.1 release-build gate

- Bumped Last Singularity to `v0.2.1` for the next remote handoff train.
- Added `scripts/release.cjs` plus `release:bump`, `release:build`, `release:check`, `release:patch`, and `release:prepush` npm scripts.
- Added a tracked `.githooks/pre-push` guard so `origin` pushes can require a patch version ahead of upstream and a complete all-target release build.
- Updated README, build pipeline, deployment, Feature Fridays, Steam Deck, and project-contract docs so release/handoff pushes use `npm run release:patch`.
- Produced the v0.2.1 all-target release artifact set locally: web, iPad web-app, macOS, Windows, Linux, combined playtest zip, and weekly staging assets.
- Refreshed the formal build-health verifier after the release build: core, renderer, perf, and title-prototype checks all passed.

## 2026-06-25 — Local build status process repair

- Added `docs/project/BUILD-STATUS.md` as the canonical local playability snapshot, separating "what can I launch right now?" from formal build-health verification, live process health, and git history.
- Updated `BUILD-HEALTH.md`, `TEST-HARNESS.md`, `DEV-SERVER.md`, and `JAM-CONTRACT.md` so agents check build status first, then use build-health, stack status, and git log as supporting evidence.
- Refreshed `ROADMAP.md`, `docs/v0.2/README.md`, `PROJECT-STATE.json`, and `PROJECT-BOARD.md` so the current v0.2 status no longer points agents at the old March L0 queue as live truth.
- Added a devlog entry for the June 25 Three/local-authority repair run and a decision-log entry that codifies build status as distinct from build health.

## 2026-06-25 — LBH Forge Pass skill and harness boundary

- Added a reusable personal Codex skill, `$lbh-forge-pass`, for periodic LBH architecture hygiene passes across code review, comments, centralization, docs, process, and test harness relevance.
- Updated the test harness guide with a v0.2 status note and clarified that daily lanes catch known regressions while the Forge pass audits whether the contracts are still right.
- Updated the project contract with a v0.2 process note and a dedicated Forge Pass section for deep reviews after broad refactors, Three/sim shifts, platform changes, or major feature bursts.
- Clarified the coordinate authority comment so JS feature code still routes through `coords.js`, while shader-side Y flips are allowed only when local, commented, and fixture-covered.
- Added a shared GLSL coordinate helper in `fluid.js` so coarse-field and fluid-grid shaders call named world/fluid/coarse conversion functions instead of open-coding Y flips.

## 2026-06-25 — Bounded sim lifecycle and terminal run cleanup

- Made authoritative matches finite by enforcing the configured 10-minute run cap server-side; timed-out active human players now receive a run result and the session ends cleanly.
- Ended sessions when all human pilots are terminal instead of keeping the sim alive while the client sits on death, extraction, or result screens.
- Stopped the sim tick loop after terminal session end while preserving a short health/result grace window, so ended runs remain inspectable without continuing to simulate the world.
- Disabled post-schedule wreck repeat waves by default and capped them when explicitly enabled for tuning, preventing long-idle sessions from growing wreck state forever.
- Reset wreck wave repeat state on every new session and fixed Inhibitor vessel deaths to commit the same death outcome path as other hazards.
- Added lifecycle regression coverage for terminal humans, session restart freshness, and match-cap collapse.

## 2026-06-25 — Coordinate and flow authority cleanup

- Centralized world radius projection in `coords.js` so canvas overlays and the Three scene use the same axis-aware world radii, while small glyphs can still opt into screen-round sizing.
- Moved wave-ring injection and distance-based fluid dissipation to the fixed `GRID_WINDOW` scale instead of total map `WORLD_SCALE`, keeping visible fluid behavior stable on 3x3, 5x5, and 10x10 maps.
- Reconciled local, coarse, and server fallback flow sampling: orbital current, direct gravity, wave impulses, and star hazards now stay in their intended channels instead of quietly double-counting movement force.
- Added a finite range/fade for orbital surf current so distant wells no longer tow the ship through open space, and made wave/star/planetoid ship pushes use the actual frame timestep.
- Updated controller coverage for the remote input contract: inventory suppresses thrust/brake scalars while preserving facing intent for subsequent actions.
- Hardened the test harness freshness contract: input/playtest cases now use fresh Chrome processes and fresh remote sim processes, stale sim listeners are force-stopped on test ports, and sim health exposes process age/memory for long-run leak checks.
- Updated process docs around fresh playtests, coordinate authority, sim/client truth, and Three camera projection checks so future movement regressions start with math/authority verification before tuning.
- Made star drift map/snapshot-owned and prevented visual-only star updates from mutating authoritative consumption state.
- Added FlowField regression coverage, expanded coordinate tests for radius projection, updated the physics harness to isolate gravity from orbital current, and restored the Three perf probe to 60 FPS with a 16-pass local pressure solve.

---

## 2026-06-25 — Square fluid-window camera realignment

- Re-locked `CAMERA_VIEW` to the 3x3 camera-anchored fluid window so hazards, ASCII fabric, input, and Three scene meshes all describe the same world slice again.
- Reverted shader sampling away from aspect-widened fluid UVs; the current sim owns a square texture window, so aspect-rectangular fluid sampling is reserved for a later rectangular-window sim pass.
- Tightened local and authoritative spawn selection with per-hazard clearance scoring and removed the dead duplicate sim spawn helper.
- Lowered the in-process local sim cadence from 60 Hz to 30 Hz with a two-step catch-up guard so slow frames do not spiral into persistent low FPS on the Three/Deck path.
- Moved local gameplay flow sampling from synchronous GPU `readPixels` to an analytical field built from wells, stars, and wave rings; GPU fluid remains the visual field.
- Dropped the fixed local fluid grid from 256 to 192 with a reduced pressure solve for the local Three build; ASCII hides the resolution loss while the frame loop gets meaningful headroom.
- Added browser and sim regressions for map-load spawn safety, visible well alignment, and the Three backend's square-fluid-window projection stats.

---

## 2026-06-25 — Aspect-correct camera math after Three migration

- Split `CAMERA_VIEW` from `GRID_WINDOW` in the renderer path: the camera now defines the visible world span, while the fluid grid remains the larger sampled texture window.
- Updated world/screen conversion, mouse deadzone math, overlays, wave rings, ship debug vectors, fluid display, accretion, ASCII velocity sampling, and the standalone title prototype to use the same aspect-correct camera projection.
- Fixed Three world-scene placement so entity meshes, semantic rings, and shader-sampled fabric agree on the same world slice instead of mixing old stretched 2D assumptions with the new orthographic scene.
- Added regression coverage for aspect-correct world/screen round-trips and Three camera world span reporting in renderer fixtures.

---

## 2026-06-25 — Local authority movement and Three projection fix

- Fixed a local-authority join regression where a running session stayed on the empty-session idle loop after a human joined, making remote movement visibly snap between sparse 1 Hz authoritative updates.
- Corrected the Three top-down orthographic camera to match the canvas aspect ratio, so world-scene rings and markers render with equal pixel scale instead of stretching on widescreen views.
- Added regression coverage for human joins promoting the sim loop out of idle and for the Three camera matching the capture aspect in renderer fixtures.

---

## 2026-06-22 — Steam Deck packaged renderer boot fix

- Fixed the Steam Deck packaged app's black screen by loading local renderer assets through an app-owned `lbh://` protocol with explicit JS/JSON MIME types instead of raw `file://...app.asar` paths.
- Added visible boot failure reporting and Electron main-process renderer diagnostics so packaged launch failures show on-screen and in `deck-launch.log`.
- Copied the complete Three build runtime into web, desktop, and iPad wrapper artifacts so split Three modules such as `three.core.js` ship with `three.module.js`.
- Tightened the renderer harness server readiness check so it recognizes the current static-server log line instead of waiting for its fallback timer.
- Verified the deployed Deck build boots the local packaged Three renderer while embedded control plane and sim both run on Deck loopback ports.
- Updated README, Deck runbooks, deployment notes, platform targets, and build pipeline docs to state that Deck runtime is self-contained and Tailscale is deploy transport only.
- Hardened Gaming Mode shortcut registration so the Codex/installer paths can write **Last Singularity** into every Steam userdata `shortcuts.vdf` when the active Deck account is ambiguous.
- Documented Desktop Mode as install/triage only for controller acceptance because Steam Input can keep non-Steam apps on the Desktop control layout there.

---

## 2026-06-22 — Current-truth agent onboarding cleanup

- Rewrote `CLAUDE.md` onboarding so new agents start from the v0.2 design/code delta, current platform reality, and sim/renderer authority boundaries instead of jam-era constraints.
- Added v0.2 superseded banners to legacy rendering and slingshot design docs that still read as canonical.
- Updated `SLINGSHOT-NETWORK.md` to reflect that server-authoritative slingshot state has shipped and that route readability/tuning are now the open questions.

---

## 2026-06-22 — iPad native bench framing

- Reframed iPad as a native Apple-platform competence bench, not just a Safari/WKWebView wrapper convenience target.
- Updated iPad docs around the intended learning surface: SwiftUI lifecycle, signing, controller behavior, audio/WebKit limits, Metal renderer probes, and handheld Apple GPU constraints.
- Added an iPad SwiftUI / Metal Bench Probe backlog item so future native work consumes recorded authoritative snapshots instead of becoming a second game.

---

## 2026-06-22 — Feature Fridays release program

- Added `docs/project/FEATURE-FRIDAYS-RELEASE-PROGRAM.md`, a weekly release program for turning the v0.2 roadmap into Feature Friday implementation, QA, build, store, and social beats.
- Grounded the cadence in the current roadmap, backlog, test harness, build pipeline, deployment split, public overview, and Steam Deck runbook.
- Included release tiers, feature selection criteria, per-release checklists, QA gates, build target expectations, itch/Steam/Twitter/X/Instagram update formats, asset capture needs, and an eight-week sample schedule.

---

## 2026-06-22 — iPad native wrapper scaffold

- Added a thin SwiftUI/WKWebView iOS wrapper that serves the synced web runtime through a local `lbh://` scheme instead of rewriting gameplay or renderer code.
- Added `scripts/ios-wrapper.cjs` plus `npm run ios:sync`, `ios:build:sim`, `ios:build:device`, and `ios:open` for repeatable iPad wrapper setup.
- Documented the split between Safari Add-to-Home-Screen, native simulator wrapper, sandbox mode, and remote-authority mode.
- Kept physical iPad deployment explicitly blocked on Apple signing, provisioning, and real hardware controller/WebGL/audio verification.

---

## 2026-06-22 — Switch 1 feasibility spike

- Added `docs/project/SWITCH1-ATMOSPHERE-FEASIBILITY.md`, a research memo for a future Switch 1 / Atmosphere lab probe.
- Documented the decision that Switch 1 is a port/renderer-probe target, not a direct Electron/Three/Node desktop wrapper target.
- Clarified that Greg's Atmosphere-prepared Switch is a viable private hardware test bench for bench builds and renderer/input/performance probes.
- Added a backlog entry for a recorded-snapshot Switch 1 renderer probe and cross-linked it from platform and Godot console docs.
- Kept Atmosphere scoped to private technical research while preserving the official Nintendo developer route as the only commercial/public path.

---

## 2026-06-22 — Play instructions refresh

- Reworked the README into usable play paths for source launches, Steam Deck weekly installs, packaged desktop builds, and browser sandbox debugging.
- Added first-launch flow and objective guidance so new testers know how to get from title screen to pilot, launch, run, extraction/death, and results.
- Updated packaged build `START-HERE.md` generation with cross-platform launchers and the same first-run flow.
- Updated weekly release zips so each platform artifact carries `START-HERE.md`, build metadata, and asset metadata instead of shipping app folders without instructions.
- Fixed `npm run play`'s shutdown message to point at `npm run stop`, which stops the whole local authority stack.
- Added a `PlayInstructions` harness guard so README, Deck runbook, generated package instructions, and the local play script keep agreeing.

---

## 2026-06-22 — Weekly playable build cadence

- Changed the regular GitHub playable build workflow from daily to weekly while keeping the existing scheduled-run SHA gate, so it only rebuilds when new commits exist.
- Updated build target instructions for Steam Deck, deployment pipelines, platform targets, and the v0.2 roadmap to describe weekly playtest artifacts instead of nightly ones.
- Preserved the `nightly-latest` release tag and `*-nightly.zip` asset names as compatibility URLs for the public Deck installer.
- Extended the Deck installer harness guard so the weekly cadence and unchanged-commit skip behavior are tested.

---

## 2026-06-22 — Public Steam Deck installer and runbook

- Added `scripts/install-steam-deck.sh`, a Steam Deck installer that downloads the Linux nightly release asset, installs the game under `~/Games/last-singularity`, writes Deck launchers, and registers a Gaming Mode Steam shortcut with a `shortcuts.vdf` backup.
- Added `docs/reference/STEAM-DECK-RUNBOOK.md` with public tester install, private Tailscale deploy, launcher flags, logs, acceptance checks, and triage for the Deck failures seen today.
- Added Steam Deck to the README playable targets with the one-command install path.
- Updated the nightly release workflow to build and attach `last-singularity-linux-nightly.zip` and fixed the workflow to call `scripts/ci/package-nightly-assets.cjs`.
- Added a `DeckInstaller` harness guard for the public installer, release artifact, workflow, and README contract.

---

## 2026-06-22 — Steam Deck Gaming Mode wiring

- Added `npm run deck:gaming-mode` to register the deployed Deck wrapper as a Steam non-Steam shortcut over Tailscale.
- The shortcut installer backs up `shortcuts.vdf`, refuses to write while Steam is running unless `--shutdown-steam` is passed, and points Steam at `run-last-singularity.sh` instead of the raw Electron binary.
- Added a static Deck Gaming Mode test that round-trips the binary Steam shortcut format and proves Last Singularity registration is idempotent.
- Updated Deck deployment docs so Gaming Mode through Steam is the expected test surface, with Desktop Mode kept for setup and crash triage.
- Parked the Godot console question in a future investigation doc: Godot is a later renderer-shell probe after the sim/content contract is portable, not the default console plan.

---

## 2026-06-22 — Steam Deck embedded stack fix

- Fixed the Linux desktop package so embedded control-plane and sim runtimes include their new telemetry, RNG, seeded-generation, and flow-sample dependencies.
- Added a single-instance guard to the Electron shell so Deck/Desktop double-launches focus the running game instead of starting two embedded authority stacks in one profile.
- Added Deck-specific Chromium GPU profile flags, XWayland selection, and rolling launcher logs after SteamOS crashed Electron with `GPU process isn't usable` during WebGL startup.
- Added a static `DesktopPackage` test that walks the packaged server require graph and fails when a desktop runtime dependency is missing from the build bundle.
- Documented the current Gaming Mode gap, Deck acceptance checklist, and future non-Chromium SteamOS runtime path.

## 2026-06-22 — v0.2 documentation baseline

- Added `docs/v0.2/` as the current canonical versioned doc set, treating all prior work as the v0.1 playable-prototype era and v0.2 as the authority + Three product foundation.
- Wrote historical v0.1 patch notes, v0.2 release notes, a design/code delta ledger, a v0.2 design bible, and a v0.2 roadmap by major area.
- Cross-linked older design/roadmap entry points so future work starts from the v0.2 snapshot instead of stale jam-era assumptions.

## 2026-06-22 — Platform deployment pipeline setup

- Added local Steam Deck deployment over Tailscale/SSH for the Linux desktop package.
- Added an itch.io HTML5 staging lane that injects sandbox mode before upload so the browser page does not depend on the Node authority stack.
- Added SteamPipe package/VDF generation for Linux, Windows, and macOS depots, with optional SteamCMD upload when real Steamworks IDs and credentials are configured.
- Added manual GitHub workflows for itch deployment and SteamPipe package preparation.
- Documented the build-target deltas: Deck uses desktop Linux, itch HTML5 uses sandbox or downloadable desktop channels, and Steam should ship desktop depots rather than the raw web artifact.

## 2026-06-22 — Steam Deck Tailscale preflight

- Added `npm run deck:preflight` to discover the Tailscale CLI, list visible tailnet peers, probe Deck-like hostnames, check MagicDNS/IP resolution, run `tailscale ping`, and verify SSH as `deck` before any build copy.
- Hardened `deploy:deck` so it checks SSH reachability before building and uses the same SSH options for mkdir, rsync, and launcher install.
- Documented the one-time Deck enrollment path and current GregBot tailnet state in `docs/reference/STEAM-DECK-TAILSCALE.md`.

## 2026-06-22 — First Steam Deck playable package

- Added a Deck runtime profile for the packaged Electron shell: `LBH_DECK=1` uses a 1280x800 fullscreen window while the game keeps its 16:9 internal playfield.
- Updated `deploy:deck` to install Deck-aware shell and `.desktop` launchers alongside the copied Linux package.
- Built and deployed the first Linux release package to `steamdeck:/home/deck/Games/last-singularity`.

## 2026-06-22 — Shared-context Three cleanup

- Collapsed the Three renderer onto the Composer's `fluid-canvas` WebGL2 context, removing the CPU bridge canvas and per-frame `CanvasTexture` upload path.
- Switched dynamic Three world entities and slingshot tether lines to pooled objects instead of clearing/rebuilding meshes every frame.
- Exposed the active render canvas through `__TEST_API.getRenderCanvasId()` and updated renderer screenshots/helpers to follow that contract.
- Removed inert client `inventorySystem.hasEffect()` branches and kept artifact behavior on the coefficient/stat path.
- Moved `stack:browser` to the local authority stack, renamed the client-only launcher to `stack:sandbox`, and refreshed renderer/slingshot/runtime docs.

## 2026-06-22 — Mechanics audit implementation

- Added a shared FlowSample contract for current, gravity, wave, hazard, surf, signal-shadow, source ids, and confidence. Browser fluid sampling keeps x/y aliases for older consumers while the server coarse field now returns semantic channels.
- Aligned authoritative server movement with the client baseline: current coupling now lerps every hull toward sampled flow, server well gravity uses the same inverse-power profile as client ship gravity, and remote brake-only packets carry a real facing vector.
- Moved slingshot into the authoritative sim protocol. Remote input now sends `slingshot`, server snapshots expose slingshot engagement/energy/anchor state, and the server owns engage, hold, release, chain windows, and release boosts.
- Made Three the default renderer path and gave it real world-space entity and semantic layers for ships, wells, waves, stars, wrecks, portals, planetoids, scavengers, remote players, fauna, sentries, and slingshot tethers.
- Updated harness coverage for FlowSample shape, brake intent vectors, authoritative slingshot resolution, Three world entity layers, and semantic renderer cues.
- Updated the live test-harness guide and visual script so Three is the normal renderer target; legacy is now an explicit deprecated fallback lane.

## 2026-06-22 — Mechanics and sim-render audit

- Added `docs/project/MECHANICS-SIM-RENDER-AUDIT.md`, a deep review of movement mechanics, field math, local/server sim parity, and the current Three renderer bridge.
- Identified the next highest-leverage architecture step as a shared field sample contract before deeper Three migration, plus called out remote brake intent, baseline current coupling, server-side slingshot authority, semantic render channels, and representative harness coverage.

## 2026-06-22 — Test suite value audit

- Added `docs/project/TEST-SUITE-VALUE-AUDIT.md`, classifying the current test suite by actual value, stale coverage, and checks that should move upstream into schemas, pure model tests, renderer fixtures, or Codex browser review.
- Called out the strongest gates as renderer fixtures, remote authority, runtime productization, fluid-window scaling, focused model math, and content-generation behavior; flagged weak areas in coordinates, flow, systems, inventory, and hand-written manifest shape validation.

## 2026-06-22 — First-class top-down Three scene

- Promoted the Three renderer from a fullscreen copy bridge into a real top-down 3D scene graph: orthographic camera, depth-sorted background/fabric/foreground layers, a depth-backed render target, and a screen-space present pass.
- Added subtle motion-driven parallax and screen-space warp on the Three path while keeping the readable flat top-down viewpoint and legacy ASCII/fabric source frame intact.
- Passed camera, ship velocity, world scale, grid window, and phase through the render frame context so Three effects are driven by game motion instead of standalone decoration.
- Extended renderer fixture assertions to require the `top-down-3d` scene contract, the orthographic top-down camera, world layers, and the Three screen-space pass.

## 2026-06-22 — Parallel Three renderer and harness rebuild

- Added a parallel Three.js renderer backend behind `?renderer=three` and made Three the default automated renderer target. The legacy Composer path remains available through explicit `legacy` scripts as a compatibility/fallback lane.
- Added renderer backend diagnostics through `__TEST_API`, a Three renderer fixture command, and packaging support for the static Three module.
- Rebuilt the test runner around manifest lanes (`fast`, `core`, `browser`, `authority`, `visual`, `playtest`, `three`, `full`) plus renderer expansion (`legacy`, `three`, `both`, `target`).
- Removed Puppeteer from the live dependency graph. Browser suites now use `tests/browser-driver.cjs`, a small Chrome DevTools Protocol wrapper around system Chrome, with deterministic `stepFrameForTest()` advancement instead of trusting ambient headless `requestAnimationFrame`.
- Hardened browser helpers for the Three path: query-safe target building, canvas-composited screenshots, remote `simServer` URL merging that preserves existing renderer query params, and renderer fixture assertions that fail on blank RGB captures.
- Fixed the Three bridge copy shader so it renders under Three's GLSL3 preamble, and moved the bridge through a 2D staging canvas plus byte-backed render target for reliable headless readback.
- Added `docs/design/TEST-HARNESS.md` as the live guide for CLI gates, Three applicability, Codex app browser visual/playtest workflow, and the narrow Computer Use boundary.

## 2026-06-21 — Three.js migration plan

- Added `docs/project/THREEJS-MIGRATION-PLAN.md`, a staged migration plan for moving the LBH client renderer to Three.js while keeping the authoritative sim and renderer in separate processes.
- Covered renderer bridge extraction, Three multi-pass render graph, fluid-field porting, entity overlays, controls, HUD, build/packaging, test harness updates, performance budget, risks, benefits, and aesthetic upgrade opportunities.

## 2026-06-21 — Public overview seed

- Added `docs/project/PUBLIC-OVERVIEW.md` as a public-facing pitch and copy source for the website, store page, social account, devlog posts, feature bullets, and trailer beats.
- Grounded the overview in the current product shape: Last Singularity as the public title, ASCII fluid identity, delta-v movement economy, slingshot routing, extraction pressure, hull fantasies, cosmic signatures, and honest in-development boundaries.

## 2026-05-10 — Review hardening pass

Codex review pass after the delta-v / slingshot / movement stack. The goal was not new spectacle; it was making the new surface honest across local play, remote authority, tests, and packaged builds.

- Mirrored delta-v economy into the authoritative sim: remote players now have tank size, regen, burn efficiency, fuel-cell refills, and snapshot fuel state.
- Brought server movement closer to the client model: brake is reverse thrust with delta-v cost, movement item coefficients apply through PlayerBrain aliases, and the server enforces the same top-level speed cap.
- Preserved fuel ratio on mid-run local equipment swaps so capacity artifacts no longer secretly refill the tank.
- Hid local slingshot affordance/rendering in remote-authority mode until the server owns the mechanic.
- Copied `src/content` into desktop staging so packaged authority can load the shared JSON manifests.
- Added validation for hull manifests and representative inventory/remote tests for fuel ratio, fuel cells, brake cost, and speed cap.
- Updated docs where yesterday's feature notes had drifted: build health is marked stale, server/client parity is no longer listed as a known brake/speed bug, and slingshot status now distinguishes shipped client work from deferred server authority.

## 2026-05-09 — Delta-v, slingshot network, speed/movement overhaul

A long session that turned thrust from a free verb into a real economy and
made the universe a network of anchors you can swing through. Six commits.

- **Delta-v thrust fuel system.** Ship has a finite `deltaV` resource that
  thrust drains and time refills. Top-right HUD gauge with green / yellow /
  orange / red thresholds. Hulls have differentiated tank / regen / burn-
  efficiency stats. Three fuel-cell consumables (`fuel-cell`, `plasma-cell`,
  `antimatter-cell`) refill it; equippable artifacts (`worn-tank`,
  `recirculator`, `helium-3-reservoir`, `solar-spinneret`, plus a small
  efficiency cost on `tuned-thruster`) layer in coefficient bonuses.
  InventorySystem.getDeltaVStats aggregates equipped-item modifiers; mid-
  run equip/unequip refreshes the ship's hull-derived stats so coefficients
  apply immediately instead of waiting for the next respawn.
- **Vapor consumable cleanup.** Five effect IDs that had catalog entries
  but no working handler (`cargoJettison`, `emergencyThrust`, `signalFlare`,
  `signalPurge`, `wellRepulsor`) were removed entirely. The defensive
  `IMPLEMENTED_CONSUMABLE_EFFECTS` allowlist + a dead `signalPurge` stub in
  the runtime were dropped along with them. Catalog goes from 14 → 9
  honest consumables.
- **`SLINGSHOT-NETWORK.md` design doc.** Extends slingshot from well-only
  to a three-tier anchor catalog (wells / stars / planetoids). Locks the
  skitching / rail-grinding engagement model — button-press snap-to with
  manual release. Names the route-planning gameplay loop and the per-hull
  route-style identity. Numbers and map-redesign explicitly deferred.
- **Slingshot network implementation.** F key (or gamepad Triangle) toggles
  engagement when an anchor is in snap-to range and the ship has tangential
  speed. Engaged state cancels most well-pull, applies a tangential force
  amplifier, and accumulates banked energy. Release applies the energy as a
  velocity boost in the ship's facing direction; chain detection awards a
  multiplicative bonus when a new engage starts within `chainWindow` of the
  prior release. Hull modifiers (`slingshotEnergyMult`,
  `slingshotChainWindowMult`, `slingshotSignalReduction`) give each hull a
  distinct route style. Visual layer: pulsing affordance ring on in-range
  anchors, solid ring + tether + energy arc + chain badge while engaged.
- **Speed/movement overhaul.** Hull stats (`thrustScale`, `dragScale`,
  `currentCoupling`, `wellResistScale`) now actually apply in client
  `ship.update` — they were defined in the JSON but never read locally,
  meaning every hull flew identically. Drag dropped from 0.06 → 0.015 so
  conservation-of-momentum has playable validity windows; this is space,
  not water. Brake converted from drag-add to **reverse thrust + fuel
  cost** (`brakeThrustScale: 0.4`, `brakeFuelScale: 0.6`) so slowing down
  lives in the same delta-v economy as accelerating. Defensive
  `maxSpeedWorld: 8.0` cap added. Velocity readout renders directly under
  the ship sprite — magnitude + tier label (drift / cruise / surge /
  perilous) + tiny direction arrow.
- **Audit pass found four real bugs.** Hull `energyMult` was double-applied
  on slingshot energy (Drifter was getting 1.96× instead of 1.4×); fixed
  to apply once at release. Mid-run inventory equip wasn't refreshing
  ship deltaV stats. Slingshot input was running in remote-authority
  mode where the next snapshot would overwrite local engagement; gated
  on `!remoteAuthorityActive`. Slingshot cancel-on-phase-change was dead
  code inside the playing branch; moved outside so it fires on remote-
  driven phase transitions. Plus housekeeping: removed
  `CONFIG.input.brakeStrength`, cleaned the totalDrag formula, updated
  dev-panel sliders.

## 2026-05-05 — Remote play visual hotfix

- Added deterministic authoritative wreck names for initial, wave, repeat, and echo wrecks so remote overlays never render `undefined` labels.
- Made the play launcher restart the local sim before opening Electron, preventing stale background sessions from joining directly into a collapsed run.
- Hardened remote-authority and sim-scale coverage around authoritative wreck labels and spawned wreck/debris assertions.

## 2026-05-05 — Unfinished systems fill-in pass

- Added the Chronicle home surface, local run-record continuity, echo-fragment display, and profile-name sanitization.
- Extracted session/map scale profiles into mirrored manifests and wired sim/client perf profile consumers to that shared truth.
- Improved hull ability presentation with per-hull labels, meters, fuel/charge/cooldown states, and canvas-side ability cues.
- Deepened the item catalog with explicit special/effect registries, distinctive hull-affinity entries, and stronger validation.
- Polished the desktop stack-status surface with clearer mode labels, log filtering, and copy/export controls.

## 2026-05-04 — Directional ASCII and meta-surface polish

- Added a tunable directional ASCII blend window so flow glyphs emerge from shimmer instead of hard-switching at one speed threshold.
- Extracted the item and consumable catalog into mirrored server/client content manifests and rewired seeded generation to use them.
- Polished the home and run-results overlays with denser profile/loadout/run context, cargo value summaries, and clearer affordability/status cues.
- Extended validation to catch item-manifest drift and ASCII ramp/velocity-blend regressions before they reach the renderer.

## 2026-05-04 — Chronicle home surface

- Added a Chronicle tab to the home screen with career stats, recent run records, and recovered echo fragments.
- Recorded compact local run lines from extraction/death results so the next home visit shows survival, cargo, EM, map, signal, and death-cause cues.
- Exposed Chronicle state through `__TEST_API` and added home-flow coverage for profile records plus echo fragments.

## 2026-05-04 — Signature content manifest

- Extracted playable cosmic signature templates, map-size pools, layout multipliers, and seeded preview signatures into mirrored server/client content manifests.
- Rewired `src/signatures.js` and both seeded-generation mirrors to read from the manifest while preserving existing HUD, preview, and layout multiplier behavior.
- Added manifest validation plus focused signature runtime tests for mirror sync, unique ids/names, map-size pool shape, CONFIG override compatibility, known layout hints, and streak-protected rolling.

## 2026-05-04 — Run results player overlay

- Added a focused run-results renderer/view-model module for the post-run extraction/death overlay.
- Replaced the compact legacy end-screen stats with RunResult-shaped survival, signal peak, inhibitor form, cargo extracted/lost, EM earnings, death cause, AI outcomes, and notables.
- Added browser coverage for extraction/death result formatting plus the continue path back into meta/home flow.

## 2026-05-04 — First balance manifest

- Added a canonical first-pass balance surface for loot tier gates, tier weights, wreck-age value scaling, EM survival/death payout, death tax, rig costs, and profile/vault upgrade costs.
- Wired local loot, seeded generation, run-result EM earnings, death tax, and rig/profile costs to the balance surface without changing UI rendering paths.
- Added balance relationship tests for extraction vs death earnings, rising rig costs, bounded wreck age value, rare T4 weighting, and distinct hull identities.

## 2026-05-04 — Hull rig progression client surface

- Added canonical client profile fields for `hullType` and three-slot `rigLevels`, while preserving the existing `2 equipped + 2 consumable` loadout contract.
- Exposed rig progression query/purchase helpers through the profile manager and test API.
- Replaced the home-screen upgrade tab with a compact hull rig tab that shows hull, EM, track levels, next effects, costs, affordability, and supports buying the selected rig upgrade from the menu.
- Added a normalized ability-state test API surface for `ability1`/`ability2` cooldown, readiness, active state, charges, and fuel where applicable.
- Extended browser/system coverage for hull/rig profile exposure and rig purchases, added real home-menu rig purchase coverage, and added remote-authority coverage for client-visible ability state.

## 2026-05-04 — Fluid-grid harness cleanup

- Added `tests/fluid-window.js` to cover the client-side fixed fluid grid across the playable 3x3, 5x5, and 10x10 maps.
- Exposed `window.__TEST_API.getFluidGridState()` so browser tests can assert the active world scale, fixed grid window, fluid camera, and render culling stats without reaching into module internals.
- Tightened validation so obsolete map-level portal/perf data fails instead of quietly logging a note.
- Promoted `tests/perf-probe.js` from a print-only diagnostic into a pass/fail perf and payload harness, and added it to build-health verification.

## 2026-05-04 — Local loot catalog follows tier gates

- Reworked `src/items.js` around the T1-T4 item catalog, session-time tier gates, weighted tier rolls, and implemented consumable filtering.
- Preserved `generateLoot(wreckType, wreckTier)` compatibility while adding option-object generation for session time, source names, explicit counts, and consumable chance.
- Added local wreck spawn-time tracking and loot-time age value scaling, capped at 1.5x after 120 seconds.
- Added focused item catalog/generation tests and included them in `tests/run-all.js`.

## 2026-05-04 — RunResult persistence package

- Added first real control-plane RunResult persistence for extracted, dead, and abandoned-like outcomes while preserving legacy `applyOutcome` callers that still send `escaped`.
- Persisted cargo extracted/lost, EM/tax/overflow context, survival bonus, death cause, signal peak, map context, loadout snapshot, compact notables, and stats deltas into run records.
- Extended control-plane coverage with representative extraction, death, and abandoned outcome assertions.

## 2026-04-24 — Large-map client performance pass

- Added `tests/perf-probe.js` and `npm run test:perf` as a diagnostic, non-CI harness for 3x3/5x5/10x10 FPS, smoothed frame timings, render-chain shape, visible well count, and authoritative snapshot payload size.
- Added `window.__TEST_API.getPerfStats()` so playtest and browser tooling can separate local sim time, composer time, overlay time, fluid resolution, and render-well culling state.
- Moved 5x5 and 10x10 onto explicit client-side sim profiles: 5x5 now runs local visual/gameplay sim at 30 Hz with a cheaper pressure solve, and 10x10 runs at 15 Hz with a 256² fluid field and lighter pressure solve.
- Added render-only well culling for the fluid display shader. Large maps now send only view-intersecting wells plus the nearest two wells to the shader, while physics/death checks still see all wells.
- Fixed the missing camera handoff from `SimCore` into object fluid injection. Existing wreck/portal culling now actually runs, and comet wake/trail splats are skipped offscreen.
- Added remote ship presentation smoothing so low-cadence authoritative snapshots no longer pin the local ship to stutter steps between server packets.
- Converted local ship and scavenger drag from literal per-frame damping to time-based exponential damping calibrated to the old 60 Hz feel, so perf spikes and large-map cadence changes no longer alter stopping distance.
- Updated `docs/reference/PERF-ANALYSIS.md` with current numbers: 5x5 and 10x10 are both back near 60 FPS in the probe without raising large-map sim ticks back to 60 Hz.
- Confirmed authoritative snapshots are still whole-world payloads: roughly 22 KB for 3x3, 41 KB for 5x5, and 82 KB for 10x10 at current server snapshot rates.

## 2026-04-23 — Harness and embedded desktop lifecycle hardening

- Fixed the Puppeteer harness server teardown race by waiting for the transient static server process to exit before the next suite reuses port `8719`.
- Hardened packaged Electron play: embedded control/sim processes now use app-owned dynamic loopback ports with identity checks instead of colliding with local dev/test stacks on fixed ports.
- Repaired macOS dock-reopen behavior so closing and reopening the packaged app restarts embedded authority before loading the renderer.
- Updated renderer docs for the current rich production Composer chain and kept `?minimalrender=1` documented as the perf baseline.
- Refreshed `BUILD-HEALTH.json`; `npm test`, renderer fixtures, and the title-prototype probe are green on current `main`.

## 2026-04-20 — Keyboard + mouse controls are real runtime input

- Repaired the browser-install control path: mouse aim now flows through `InputManager`, left click applies distance-scaled thrust, right click brakes, and W/S/Space/Ctrl provide keyboard equivalents for players without a Bluetooth controller.
- Added CONFIG-backed mouse tuning (`mouseDeadzonePx`, `mouseRampPx`, `mouseThrustCurve`) so the laptop/mouse feel can be adjusted without reopening the input architecture.
- Added `tests/keyboard-mouse.js` and wired it into `npm test`, covering both local play and remote-authority input forwarding.
- Updated README/build artifact instructions and `CONTROLS.md` so packaged testers know the no-controller path before launching.

## 2026-04-20 — Title render pipeline: LBH-native composer + accretion ramp

- Built an LBH-native multi-pass render pipeline (composer + Pass abstraction, ping-pong FBOs, RGBA16F HDR) to replace shader-stuffing. Title prototype runs the full 10-pass chain: `FluidDisplay → FluidGain(0.15) → Accretion → Bloom → Tonemap → ColorGrade → Vignette → ASCII → ChromaticAberration → Scanlines`.
- Added `AccretionPass` — a pure radial temperature ramp keyed to per-well composition radii (not gameplay radii), fully decoupled from fluid density. Fixes the prior tangling where color stops were baked into the fluid display shader.
- Added `GainPass` so fluid can be attenuated before accretion layers on top, letting the blackbody ramp own color identity on the title.
- Tuned the ramp: rebalanced warm/cool annulus area (peakR 0.22 → 0.30), rewrote stops for proper inner-purple vs violet and inner-vs-outer-purple differentiation, widened white-hot peak (Δt 0.10 → 0.18), bumped HDR peak 1.50 → 2.20 so bloom actually catches it.
- Added `tests/probe-title-prototype.js` — headless Puppeteer probe with pixel sampling, pass-isolation flags (`?only=`, `?bypass=`, `?accretionStrength=`), and deterministic `preserveDrawingBuffer` via `?probe=1`. Used throughout tuning to verify predicted pixel values against observed ones.
- Further ramp tuning (curves, interpolation, ASCII/tonemap crush compensation) backlogged as "Accretion Ramp Value/Curve Tuning."

## 2026-04-20 — Review cleanup, product naming, and current harness gate

- Chose **Last Singularity** as the public product name and swept runtime-adjacent packaging, nightly assets, build output names, and user-facing project docs to match it while leaving the repository path as `last-black-hole`.
- Hardened chronicle echo persistence at the control-plane boundary: empty-loot echoes are rejected on save and filtered on read, so old or bad records cannot hydrate as misleading lootless wrecks.
- Confirmed echo lookup is scoped by `(mapId, seed)` and that remote snapshots expose the authoritative inhibitor `threshold` and `pressureFrac` used by client haunt timing.
- Updated the current roadmap/build-plan snapshot for April 20 and documented the then-current renderer split. Superseded on April 23 by the rich production Composer chain plus `?minimalrender=1` baseline.
- Added `npm run test:title-prototype` to the official build-health verifier alongside `npm test` and renderer fixtures.

## 2026-04-13 — Telemetry-aware smoke harness + build-health alignment

- Added `tests/telemetry-smoke.js` as a dedicated structured-log canary for the real distributed stack.
- Extended `tests/helpers.js` so the harness captures and reads dev/control/sim log files directly instead of treating telemetry as an untested side effect.
- Updated the shareable harness/build docs so telemetry is now part of the stated operator contract, not just something the runtime happens to emit.
- Kept `build-health` intentionally narrow, but clarified that `npm test` now covers the telemetry smoke path as part of the normal green/red contract.
- Fixed the `BUILD-HEALTH.json` self-staleness trap: one follow-up commit that only records the refreshed health file now still counts as current.

## 2026-04-12 — Desktop stack status + first content manifest

- Added a desktop-visible stack-status window for the embedded Electron build, including embedded control/sim health, session state, and recent child-process logs.
- Added `scripts/runtime-status.js` so the CLI stack tooling and the desktop shell can reason about runtime health through the same snapshot shape.
- Extracted the first runtime content manifest into `scripts/content/hulls.js`, moving hull identity and AI hull assignment out of the hot gameplay files.
- Added `docs/project/CONTENT-MANIFESTS.md` and refreshed roadmap/build-plan/backlog notes to reflect that runtime productization now includes observability and content extraction, not just process splitting.

## 2026-04-12 — Structured stack telemetry + sturdier physics harness

- Added lightweight JSON telemetry events for the dev server, control plane, sim runtime, and stack launcher so multi-process failures are easier to diagnose from existing log files.
- Hardened the gravity-well physics assertion to measure inward radial flow directly instead of relying on one short ship drift sample.
- Kept the original LBH intent intact: no gameplay behavior changed, only observability and test honesty improved.

## 2026-04-12 — Runtime productization + UI token bridge

### scripts/ — Added / Modified
- **stack.js** — Adds a canonical stack launcher/status surface with explicit runtime modes: `local-browser`, `local-host`, and `remote-client`.
- **play.js** — Legacy entrypoint now delegates to the canonical stack launcher instead of carrying its own hidden runtime model.
- **stop.js** — Legacy stop entrypoint now delegates to the canonical stack launcher.

### src/ui/ — Added
- **design-tokens.js** — First implementation-side bridge from `DESIGN-SYSTEM.md` into code.
- **hud-primitives.js** — Shared HUD markup/style helpers for portal arrow markup, inventory row selection, warning color, and item color lookup.

### src/ — Modified
- **hud.js** — Now consumes shared UI tokens/primitives for portal arrow rendering, inventory row styling, warning coloring, and item color lookup instead of repeating inline style decisions.

### root / docs/reference/ — Added / Modified
- **index-a.html** — Adds CSS custom properties mirroring core design-system tokens and rewires HUD CSS to use them.
- **DEV-SERVER.md** — Updates the operator docs around the new stack launcher and preferred runtime contract.
- **BUILD-PIPELINE.md** — Fixes the desktop packaging story: packaged desktop builds are now explicitly embedded-authority local apps, not merely thin clients.
- **RUNTIME-MODES.md** — New reference doc defining LBH runtime modes.

### docs/project/ — Added / Modified
- **2026-04-12-plugin-lens-review.md** — Review of LBH through the new macOS app and game-studio lenses.
- **BUILD-PLAN.md**
- **ROADMAP.md**
- **BACKLOG.md**

### Why
The architecture is now solid enough that the next source of team drag is not "how do we split sim from client?" It is "how do we make the current product understandable, launchable, and visually consistent?" This slice starts that productization pass without changing the underlying authority model.

## 2026-04-01 — Review pass: loadout truth, remote slot honesty, architecture docs

### scripts/ — Modified
- **control-plane-store.js** — durable profile normalization now uses the same live loadout contract as the client: `2 equipped + 2 consumable` slots instead of silently drifting to 3 equipped slots.
- **control-plane-client.js** — local embedded control-plane lifecycle methods now document that sim-instance registration is a deliberate no-op in single-process mode.
- **sim-runtime.js** — comments now mark the asynchronous control-plane write path, session mirroring, and one-way outcome commit boundary more clearly.

### src/ — Modified
- **profile.js** — local profile loadout shape is now normalized on load, replace, and save so older or server-fed data cannot quietly widen the live UI contract.
- **main.js** — remote snapshot application now mirrors authoritative inventory slot shapes directly, and local scene loads explicitly reset the browser client back to the canonical local `8 cargo + 2 equip + 2 consumable` shape.

### tests/ — Modified
- **control-plane.js** — now asserts persisted loadout slot counts so the durable control-plane shape cannot drift away from the shipped client contract unnoticed.

### docs/ — Modified
- **ROADMAP.md**
- **BACKLOG.md**
- **BUILD-PLAN.md**
- **BUILD-PIPELINE.md**
- **DECISION-LOG.md**
- **DEVLOG.md**

### Why
The architecture was green, but one persistence seam was lying: the control-plane store had drifted to a 3-slot artifact shape while the actual client, HUD, and inventory system still ship 2 equip slots. This pass brings the durable profile contract back in line with the live game, makes remote inventory shape syncing more honest, and updates the docs to reflect that packaged builds are clients while remote play still depends on separate control-plane and sim processes.

## 2026-04-01 — External Control Plane Runtime

### scripts/ — Added / Modified
- **control-plane-runtime.js** — new process-level control plane with HTTP endpoints for profile bootstrap/read/save, outcome write-back, session mirroring, and sim-instance registration/heartbeat.
- **control-plane-server.js** — PID-managed start/stop/status/restart wrapper for the control-plane process.
- **control-plane-client.js** — sim-side adapter that can either speak HTTP to the external control plane or fall back to the local JSON-backed implementation.
- **sim-runtime.js** — the sim now hydrates profiles through the control-plane adapter, mirrors sessions asynchronously through that boundary, registers/unregisters itself as a disposable instance, and no longer has to own the durable store inline.

### tests/ — Added / Modified
- **control-plane.js** — dedicated integration suite covering external sim registration, profile hydration, session mirroring, and outcome write-back.
- **helpers.js** — control-plane start/stop helpers and env passthrough for sim-server tests.
- **run-all.js** — wires the control-plane suite into `npm test`.

### package.json — Modified
- Adds `npm run control`, `control:stop`, `control:status`, and `control:restart`.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The durable architecture was still only half-real as long as the sim process owned the persistent store implementation directly. This slice makes the control plane an actual process boundary and proves that the sim can treat persistence/session orchestration as external infrastructure instead of inline runtime state.

## 2026-04-01 — Server-side PlayerBrain hydration

### scripts/ — Added / Modified
- **player-brain.js** — new shared server-side `PlayerBrain` module. Owns hull definitions, durable upgrade normalization, hull/profile resolution, and resolved brain coefficients.
- **sim-runtime.js** — brain resolution moved out of the runtime body and into a dedicated module.
- **sim-runtime.js** — remote join now hydrates player brain from durable profile upgrades and loadout instead of only raw hull defaults.
- **sim-runtime.js** — equip/unequip actions now refresh live brain coefficients immediately.
- **sim-runtime.js** — server-side well contact now honors profile hull upgrades through `wellGraceDuration` and free survive charges.

### tests/ — Added / Modified
- **player-brain.js** — deterministic coverage for durable upgrade hydration and live brain refresh after remote loadout changes.
- **run-all.js** — wires the PlayerBrain suite into `npm test`.

### Why
The authority split was real, but player truth was still half-inline: hull definitions lived in the sim runtime, durable upgrades were not boxed into the server brain, and existing-player join updates could ignore loadout/profile refreshes. This slice makes `PlayerBrain` a real server-side boundary instead of another pile of local math.

## 2026-03-31 — Coarse Authoritative Flow Field

### scripts/ — Added / Modified
- **coarse-flow-field.js** — new pure server-side coarse field module. Builds and samples a wrapped grid of orbital current, well pull, wave push, and hazard intensity.
- **sim-runtime.js** — medium and large sessions now advertise `fieldTickHz`, `useCoarseField`, `flowFieldCellSize`, and `fieldFlowScale`.
- **sim-runtime.js** — expanse and deep-field now rebuild and sample a coarse authoritative field for large-map motion truth instead of scaling only by direct per-player force scans.
- **overload-state.js** — overload projection now also owns field cadence and field-cell coarsening so degraded runs simplify motion intentionally.

### tests/ — Added / Modified
- **coarse-field.js** — deterministic coverage for orbital current, inward gravity, and outward wave-band force sampling.
- **sim-scale.js** — now asserts coarse-field activation and resolution differences between small, medium, and large profiles.
- **run-all.js** — wires the coarse-field suite into `npm test`.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Per-player force budgets were necessary, but they still left larger sessions as “the same force model with fewer samples.” This slice makes medium and large runs switch to an explicit coarse authoritative field so cost and fidelity degrade intentionally instead of accidentally.

## 2026-03-31 — Explicit Overload State Machine

### scripts/ — Added / Modified
- **overload-state.js** — new pure server-side overload policy module. Defines `NORMAL`, `THROTTLED`, `DEGRADED`, and `DILATED` plus budget projection and moving-pressure transitions.
- **sim-runtime.js** — sessions now carry explicit overload truth (`overloadState`, `overloadPressure`, `timeScale`) and project effective clocks/budgets from one base scale profile instead of silently degrading per subsystem.
- **sim-runtime.js** — the authoritative tick now samples real tick cost, player pressure, AI pressure, and force-source pressure, and publishes `session.overloadChanged` when the run crosses states.

### tests/ — Added / Modified
- **overload-state.js** — deterministic coverage for overload transitions, dilation projection, and recovery.
- **sim-scale.js** — now asserts new sessions start in `NORMAL` with `timeScale = 1`.
- **remote-authority.js** — remote death/write-back smoke now targets an actual authoritative well center instead of a brittle hard-coded coordinate.
- **run-all.js** — wires the overload suite into `npm test`.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Map-scale profiles and per-player budgets were real, but overload behavior was still implicit. This slice makes degradation a visible run state and gives the server one coherent place to project slower clocks and tighter budgets when a session is under pressure.

## 2026-03-31 — Hull System: 5 Ship Classes with Abilities

### New Systems
- **HULL_DEFINITIONS** — 5 hulls with coefficient tables and ability definitions
- **PlayerBrain resolution** — hull × rig × salvage → flat coefficients with stacking + caps
- **Hull abilities** — Drifter (Flow Lock, Eddy Brake), Breacher (Burn, Momentum Shield), Resonant (Harmonic Pulse, Resonance Tap, Frequency Shift), Shroud (Wake Cloak, Ghost Trail, Decoy Flare), Hauler (Salvage Lock, Reinforced Hull, Tractor Field)
- **AI hull assignment** — personality-constrained, complementary, no duplicates

### Design Decisions (see DECISION-LOG.md)
- All 5 hulls ship (not phased). No respec. Complementary AI hulls. Rook backlogged. Mixed loot affinity.

---

## 2026-03-30 — Audit Pass: Design Compliance Fixes

### Audit findings & fixes
- **Signal: thrust opposition multiplier** — was using speed proxy, now uses actual flow alignment via analytical estimateFlow(). Surfing with current is quiet; fighting it is loud.
- **Signal: dead configs removed** — extractionRate (extraction is instant, no charge time) and collisionSpike (no generic entity collision exists) were defined but never wired. Removed with explanatory comments.
- **Inhibitor: Swarm control debuff** — contact now applies 5s sluggish controls (0.4× thrust). New controlDebuff field on player, in snapshot.
- **AI: competition penalty** — wreck scoring now penalizes wrecks near other players (personality.competitionPenalty). Vulture has negative penalty (prefers contested). Portal scoring includes competition count.
- **AI: threat assessment** — wreck scoring now penalizes wrecks near sentries and Inhibitor. Portal scoring rejects Inhibitor-blocked portals.
- **AI: flow sampling** — new estimatePathAlignment() samples N flow points along path. N = personality.flowSamples (Ghost: 8 careful, Raider: 3 reckless). Used in wreck scoring and navigation.
- **Comments** — added section-level design rationale comments to all new systems.

### Known deferred gaps (separate features, not bugs)
- Signal flare/decoy system (separate input + entity, not in scope for this build)
- Signal equipment (Dampened Thrusters, Signal Sink, etc — inventory items)
- HUD degradation near Inhibitor (client-side shader effect)
- AI slot replacement when humans join (session management layer)
- Swarm tendril rendering (shader visual, not simulation)

---

## 2026-03-30 — Feature Build: Signal, Inhibitor, Fauna, Sentries, AI Players

### New Systems (all server-authoritative + client rendering)
- **Signal system** — per-player 0-1 float, rises from thrust/loot/pulse, decays when quiet. 6 zones (ghost→threshold). Zone crossing events published. HUD bar with zone-colored fill.
- **Inhibitor** — pressure from signal + time + well growth. 3 forms: Glitch (pulsing magenta bleed), Swarm (hunting mass, cargo drain), Vessel (geometric, instant kill, portal blocking). Final portal guarantee. Renders in display shader via new uniform block.
- **Fauna** — drift jellies (ambient, always present, teal glow) + signal blooms (spawn near signal sources, purple flicker). Server physics + collision + signal spikes. Canvas rendering.
- **Gradient sentries** — 2-3 per well, orbit at ringOuter×1.2-1.8, lunge at intruders, push toward well. Green segmented body. First active tier catalog entry.
- **AI players** — 5 personalities (Prospector/Raider/Vulture/Ghost/Desperado) running full game loop. Wreck/portal scoring, extraction decisions, current-aware navigation via analytical flow model. 3 AI per run, same physics/inventory/signal as humans. Render via existing remotePlayers pipeline.

### Config Changes
- **Well accretion colors** — shifted from amber/red to gold/white-hot. nearWell: [1.0, 0.85, 0.4], hotWell: [1.0, 0.95, 0.8]. 85° hue gap from inhibitor magenta.

---

## 2026-03-31 (Week 2 Day 7: Explicit Per-Player Force Budgets)

### scripts/ — Modified
- **sim-runtime.js** — Map-scale authoritative profiles now carry explicit per-player budgets for well influences, wave influences, pickup checks, and portal checks.
- **sim-runtime.js** — Authoritative player motion, extraction, and pickup truth now use capped nearest-source sets instead of scanning every well, wave ring, wreck, and portal on every player tick.

### tests/ — Modified
- **sim-scale.js** — Extends deterministic scale coverage to assert the new per-player force-budget fields for medium and large sessions.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Large-map server clocks, relevance radii, and AI budgets were not enough while each alive player could still sum against every force source every tick. This slice gives authoritative player motion and extraction an explicit per-player cost ceiling.

## 2026-03-31 (Week 2 Day 7: Explicit AI and Per-Player Hazard Budgets)

### scripts/ — Modified
- **sim-runtime.js** — Map-scale authoritative profiles now carry explicit AI spawn budgets and per-player relevance caps for stars, planetoids, wrecks, and scavengers instead of only clock budgets.
- **sim-runtime.js** — The server now spawns scavengers from those budgets and caps how many nearby hazards and AI entities each alive player can force into the expensive update path on larger maps.

### tests/ — Modified
- **sim-scale.js** — Extends deterministic scale coverage to assert the new AI and per-player hazard budget fields, plus a high-player `deep-field` spawn-budget case.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Clock scaling and spatial relevance were necessary, but they still left larger sessions without an explicit per-player budget. This slice makes the authoritative cost model more honest for 4–8 player targets: the server now advertises how much ambient AI and nearby hazard work a larger session is actually allowed to create.

## 2026-03-31 (Week 2 Day 7: Spatial Relevance Gating for Authoritative Scale)

### scripts/ — Modified
- **sim-runtime.js** — Large-map authoritative sessions now advertise per-profile relevance radii in addition to clock budgets. Stars, wrecks, planetoids, and scavenger AI no longer run full background updates everywhere in the world; they only fully tick when near alive players, while dying scavengers still finish their consequence chains authoritatively.
- **sim-runtime.js** — Player-contact systems now reuse those relevance-filtered entity sets, so larger maps stop paying whole-world scan costs just to apply nearby star push, planetoid push, scavenger bump, and wreck pickup truth.

### tests/ — Modified
- **sim-scale.js** — Extends deterministic scale coverage to assert the new map-sized relevance radii in `/maps` and live session state.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Clock scaling alone was not enough. `5x5` and `10x10` sessions still burned cost by scanning and updating off-player entities every background tick. This slice adds the first spatial relevance budget to the authoritative sim so larger worlds stop acting like every star, wreck, planetoid, and scavenger matters equally all the time.

## 2026-03-30 (Week 2 Day 6: Map-Scale Authoritative Sim Profiles)

### scripts/ — Modified
- **sim-runtime.js** — The authoritative sim now applies explicit map-scale server profiles. `shallows`, `expanse`, and `deep-field` no longer share one clock budget; larger worlds now run with cheaper `tickHz`, `snapshotHz`, and slower background-world cadences for stars, wrecks, planetoids, portals, growth, scavengers, and wave maintenance.
- **sim-runtime.js** — `/maps` now advertises those server-side scale clocks so the rest of the stack can inspect the real authoritative budget instead of guessing.

### src/ — Modified
- **sim/sim-client.js** — The browser client now adapts its polling interval to the authoritative session’s `snapshotHz` instead of hammering every map with the small-map snapshot cadence.

### tests/ — Modified
- **sim-scale.js** — Adds deterministic regression coverage for the authoritative scale profiles and proves that `expanse` and `deep-field` start with cheaper clocks than `shallows`.
- **run-all.js** — Wires the new scale suite into `npm test`.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The process boundary was real, but the server was still over-simulating large maps as if every world deserved the same small-map cadence. This slice is the first explicit cost-model correction: player/contact truth stays responsive, background world systems slow down with map size.

## 2026-03-30 (Week 2 Day 6: Explicit Remote Host/Join Control Plane)

### src/ — Modified
- **main.js** — The remote browser now keeps a lightweight live-session health view and exposes real control-plane truth during map select: live map, host identity, player count, whether this browser is host, and whether the selected map differs from the live run.
- **main.js** — Remote map select now distinguishes `space/A` as join-or-host and `X/Y` as the host-only reset action for the selected map instead of treating every remote launch as an implicit fresh host action.
- **test-api.js** — Network inspection now exposes remote host/session state, and the test API can explicitly request a host reset path.

### tests/ — Modified
- **remote-authority.js** — The remote smoke now proves the first browser reports host authority, and a second browser sitting on map select can see that it will join the live shallows run rather than resetting it to its own different selected map.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The server already had real host semantics, but the client was still lying by omission. This slice makes the control plane explicit so private multiplayer no longer feels like hidden server behavior.

## 2026-03-29 (Week 2 Day 5: Authoritative Remote Inventory Mutation)

### scripts/ — Modified
- **sim-runtime.js** — Adds authoritative inventory/loadout mutation for remote runs (`dropCargo`, `equipCargo`, `loadConsumable`, `unequip`, `unloadConsumable`), authoritative dropped-item wreck spawning, and fixes the server cargo model to use the same fixed eight-slot layout as the client.
- **sim-protocol.js** — Adds the `inventoryAction` request envelope alongside continuous input.

### src/ — Modified
- **main.js** — Remote runs now support inventory UI navigation and confirm actions without falling back to local inventory mutation.
- **hud.js** — Exposes the current inventory intent as an action description so local and remote modes can share the same cursor semantics.
- **sim/sim-client.js** — Adds a discrete remote inventory mutation request path.
- **test-api.js** — Adds profile seeding for equipped artifacts so remote loadout mutation can be exercised honestly.

### tests/ — Modified
- **remote-authority.js** — Extends the remote-authority suite to verify authoritative unequip/equip behavior through the real protocol.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Remote runs were still lying about one core gameplay surface: opening the inventory and changing your loadout still mutated only local UI state. This slice moves those actions over the network boundary and fixes the server inventory model so it matches the client’s real eight-slot cargo semantics.

### Follow-through
- Remote clients on the same map now join the running authoritative session instead of blindly resetting it. The remote-authority suite now proves that second-client path.

## 2026-03-28 Design Day — Signal, Color, Inhibitor, Entity Hierarchy, AI Players

Major design session. No code changes — Codex running server architecture work in parallel (moving gameplay systems server-side, authoritative snapshots, client sync). All design work stays design-only until hard tech lands.

### Decisions Locked
- **Inhibitor wake: threshold + variance (C)** — random threshold per run (0.82-0.98). EVE wormhole pattern.
- **Signal equipment: shaping with costs (C)** — every signal benefit has a non-signal downside.
- **Multiplayer signal visibility: visual cues (B)** — ship glow/trail reveals approximate signal level.
- **Entity hierarchy: 4 tiers** — ambient (texture/tells), active (singular-directive obstacles), adversarial (AI players), existential (Inhibitor). Seed selects from catalog per run.
- **AI player count: 4-8 per run** — humans replace AI slots on join. Solo is always full.
- **AI visibility/detection range:** deferred — interesting but not load-bearing yet.
- **Scope: push toward real game** — no jam constraints, scope creep goes to roadmap.

### New Design Docs (7 total)
1. **COLOR-SEPARATION.md** — Wells shift gold/white-hot (was amber/red). Inhibitors own magenta/fuchsia. 85° hue gap. Config-only change: `nearWell: [1.0, 0.85, 0.4]`, `hotWell: [1.0, 0.95, 0.8]`.
2. **INHIBITOR-IMPLEMENTATION.md** — 11-step build order. Shader strategy: new uniform block in FRAG_DISPLAY + FRAG_ASCII. ~300 lines InhibitorSystem, ~80 lines shader.
3. **SCAVENGERS-V2.md** — Signal-reactive scavenger AI (superseded by ENTITY-CATALOG.md, kept for reference).
4. **FAUNA.md** — Three fauna types (superseded by ENTITY-CATALOG.md, kept for reference).
5. **ENTITY-CATALOG.md** — Four-tier entity hierarchy. 17 entity types total, 7-10 active per seed. Replaces scavenger/fauna split with structured catalog.
6. **AI-PLAYERS.md** — Adversarial AI running full player game loop. 5 personalities (Prospector/Raider/Vulture/Ghost/Desperado) as weight tables on shared decision code. Current-aware navigation via analytical flow model. Server-side, ~1100 lines, 6 build phases. Character classes emerged from first principles — same toolkit, different weights.
7. **SIGNAL-SYSTEM.md** — Updated: 3 open decisions now locked.

### Architecture Notes
- AI players live server-side in `tickAIPlayers()`, same loop as `tickScavengers()`
- Analytical flow model (well positions → tangential flow) gives AI current-awareness without GPU
- Multiplayer slot replacement: server starts N AI slots, humans replace on join
- Naming collision: "Drifter" used for both comets (planetoids.js) and scavenger archetype — needs rename

### What's Blocked on Codex
- Color separation config change (trivial but waiting for stable codebase)
- Inhibitor implementation (needs signal system, which needs stable main.js)
- AI player implementation (needs server architecture complete)
- Entity catalog integration with map generator

### What's Still Open
- Slingshot V2: 5 pending decisions
- Megastructures: remaining questions (well consumption, signal interaction, art direction)
- AI player extraction visibility (do you see their haul?)
- Active entity naming (mechanical vs lore-friendly)
- Drifter/comet naming collision resolution

---

## 2026-03-27 Drift, Audio Revamp, Code Review

### Gameplay
- **Wreck drift** — all wrecks now fall toward wells at ~10% of ship gravity. Loot has a natural lifespan. CONFIG tunable.
- **Scavenger death drops** — scavengers scatter collected loot as debris wrecks when consumed by wells, ejected outward with drift back.
- **Star consumption remnants** — wells eating stars spawn vault-tier wrecks "Remnant of [star name]" with rare loot.
- **Hull upgrade wired** — grace period on well contact (0.3-0.5s by rank), rank 2+ gets one free survive per run.
- **Sensor upgrade wired** — proximity label fade distances scale with rank (0.15/0.4 → 0.3/0.85).

### Audio
- **SNES-flavored audio engine** — full rewrite with stacked LPF (BRR + Gaussian), 12-bit waveshaper, SPC700-style feedback echo.
- **27 sound events** — 11 gameplay (loot, pulse, shield, time slow, breach, star consumed, etc), 10 menu/UI (cursor, confirm, sell, equip, upgrade, error), 4 ambient, 2 spatial.
- **Context-aware states** — title (deep drone), menu (quiet ambient), gameplay (full audio), meta (quiet).
- **SNES character** — pulse-width square waves, warm low-pass filtering, echo with darkening feedback.

### Visual Polish
- Hull grace: red screen edge pulse when in kill zone
- Well proximity: subtle red vignette approaching wells
- Upgrade preview: shows stat change before purchase
- Item descriptions in vault subscreen
- Edge indicators for off-screen wells (red) and nearest wreck (gold)

### Meta Screen
- Ship tab: cursor navigation on loadout, unequip/remove back to vault
- Vault sorting: auto-sorts by category → tier → value
- Profile delete: confirmation step before deleting
- Death tax display: shows EM lost on death screen

### Code Review
- Full audit after 2 days of churn: 0 bugs in 11 files reviewed
- Fixed critical audio memory leak (voices never disconnected)
- Fixed per-frame distortion curve allocation (cached)
- Safari AudioContext fallback added
- Initialized _fullWarningShown in inventory

### Tests
- New systems test suite (10 tests): stars, comets, wrecks, drift, scavengers, profiles
- 7 test suites, 31+ tests total

---

## 2026-03-26-27 Flavor Pass + Meta Flow

### Entity Identity
- **4 star types** — yellow dwarf, red giant, white dwarf, neutron star with distinct visuals
- **Comets** — planetoids converted to teardrop bodies with canvas tails and names
- **Wreck shapes** — derelict (broken hull), debris (scattered dots), vault (golden diamond)
- **Scavenger factions** — Collector/Reaper/Warden with themed callsigns
- **Proximity labels** — distance-based fade on all entities: wells, stars, comets, wrecks, scavengers
- **Star orbital systems** — 2-4 asteroids per star, slow drift, dramatic well consumption

### Meta Flow
- **Profile system** — 3 save slots, random name generator, localStorage persistence
- **Home screen** — 4 tabs (SHIP/VAULT/UPGRADES/LAUNCH), canvas-rendered
- **6 upgrade tracks** — thrust/hull/coupling/drag/sensor/vault, 3 ranks each, component + EM costs
- **Full loop** — title → profile → home → map → play → home (both death and extract)

### Removals
- Loot anchors (src/loot.js) — replaced with stars, positions converted
- vault.js — replaced by profile.js

---

## 2026-03-25 Night Shift: Ring Scaling, Effects, Vault

### Tuning
- **Sqrt ring scaling** — accretion rings now grow at sqrt(WORLD_SCALE × FLUID_REF_SCALE) instead of linear WORLD_SCALE. 10x10 mega-well drops from 48% to 16% of screen. Cached on map load (zero per-frame cost).

### Gameplay
- **Consumable effects wired** — timeSlowLocal (30% ship dt, 3s, purple vignette), breachFlare (spawns unstable portal near ship for 15s), signalPurge (stub until signal system).
- **Vault + meta screen** — localStorage persistence for exotic matter, vault items, run stats. Extraction → "SALVAGE REPORT" → drop back in. Death skips vault.

### Refactor
- **Dead shader code removed** — negVis/voidField/liveSpace path in display shader was always 0/0/1.0 after star clearing removal. 18 lines cleaned up.

### Tests
- **4 new inventory tests** — equip from cargo, load consumable, use consumable, swap when full. 18 total.

### Design Docs
- **RING-SCALE.md** — full analysis of 4 scaling options with per-well screen coverage tables
- **VISUAL-DENSITY.md** — buffer architecture, reader/writer map, cross-talk risks, design rule (no subtractive signals)

---

## 2026-03-25 Inventory Wiring + Star Visual Fix

### Gameplay
- **Inventory equip/load loop** — confirm on cargo equippable auto-equips to first open slot (or swaps slot 0). Consumables auto-load to hotbar. Action hints show `[equip]`/`[load]`/`[drop]` per item type.
- **showKillRadii effect** (equippable artifact) — dashed red circles at well kill zones during gameplay. First real equippable effect.
- **shieldBurst effect** (consumable) — survive one well contact. Pulsing blue shield ring indicator. First real consumable effect.
- Other consumable effects have stub dispatchers (fire + consume but show "not yet implemented").

### Bug Fixes
- **Star clearing suppressing well rings** — stars injected negative visual density every frame (-0.2 per tick). This accumulated in the visual density buffer and drove `liveSpace` to zero near stars, suppressing ring/halo rendering for nearby wells. W0 and W2 on the 3×3 map were both ~0.67 world units from Star 0 — inside the clearing bubble. Fix: removed the negative visual splat entirely. The star's outward push force already creates a natural low-density clearing zone via physics.

### Why
The star clearing was a visual shortcut that conflicted with well ring rendering. The visual density buffer is a shared channel — negative injectors can stomp on positive signals from other systems. Removing the shortcut and relying on physics for the clearing effect eliminates the cross-talk.

---

## 2026-03-25 Shader Distance & Toroidal Wrapping Fixes

### Bug Fixes
- **Display shader dist calculation wrong** — `dist = length(diff) / uvS` produced reference-scaled values while shape data was in world-space. Fixed to `dist = length(diff) * u_worldScale`. All well rings were 3× oversized on the 3×3 map, making large-mass wells' gradients invisible.
- **Splat shader missing toroidal wrap** — `FRAG_SPLAT` computed straight-line distance instead of toroidal shortest-path. Density/velocity splats near UV boundaries were cut off, creating hard edges in the fluid field. Fixed by adding `diff = diff - round(diff)`.
- **Well force shader missing toroidal wrap** — `FRAG_WELL_FORCE` had same issue. Gravity didn't wrap across texture boundaries, so wells near edges pulled asymmetrically. Fixed identically.

### Hardening
- **TOROIDAL WRAPPING RULE** documented in fluid.js header. All 4 point-to-point shaders now use consistent `// TOROIDAL WRAPPING RULE` comment (greppable). Audited all 11 shaders — the 7 neighbor-sampling shaders correctly rely on GL_REPEAT.
- **Named magic numbers** in `getRenderShapes()`: `CORE_KILL_FRAC` (1/3, visual ratio) and `MIN_ACCRETION_WORLD` (0.036, world-space floor) — distinguished from coordinate conversions.
- **Removed dead `uvS` variable** from display shader (leftover from old dist calculation).

### Design Observation (to revisit)
Ring screen coverage grows with map size: 3×3 wells take 8-23% of screen, 5×5 takes 15-51%, 10×10 mega-well fills 126%. This is mathematically correct (CONFIG accretionRadius is UV-space × WORLD_SCALE) but may need per-map tuning or a different scaling approach.

---

## 2026-03-20 Day Session (Feature Design Sprint)

### New Design Documents
- **SCAVENGERS.md** — AI ship opponents. Two archetypes (drifter/vulture), behavioral state machine, same physics as player, portal consumption on extraction. Full CONFIG section.
- **SLINGSHOT.md** — Gravity slingshot mechanic. Approach → catch → orbit → release → boost. Hybrid input (auto-catch, thrust-to-release). Orbital assist force. 2-3x speed boost. Turns wells from pure threats into movement tools.
- **AUDIO.md** — Jam-scoped audio plan. Layer 1 (drone), Layer 2 (well harmonics), event sounds. All Web Audio API synthesis. ~175 lines total.
- **SIGNATURES.md** — Cosmic signatures for procedural run identity. 6 universe personalities with CONFIG overrides and flavor text.

### Updated Design Documents
- **COMBAT.md** — Updated recommendation section. Non-lethal tools confirmed for jam build. Revised priority: force pulse → signal flare → tether. Detailed designs for all three tools.
- **ENTITIES.md** — Added scavenger, force pulse, signal flare, tether entries to entity overview table and interaction matrix. Added full sections for each new entity type.

### Journal Updates
- **DECISION-LOG.md** — 6 new entries: non-lethal combat tools, AI scavengers, gravity slingshot, cosmic signatures, audio scope, workstream split.
- **DEVLOG.md** — Day 5 entry: the renderer split, the teeth, feature design sprint, build priorities for Fri/Sat/Sun.

### Why
Game needs more verbs. Fly/loot/escape is working but thin. AI opponents create contested extraction, combat tools give player agency, slingshot creates movement skill ceiling, signatures add replay value, audio transforms feel. Building all of these over the final 3 days.

---

## 2026-03-20 (Jam Day 5: Renderer Recovery Planning)

### docs/project/ — New Files
- **RENDERER-RECOVERY-PLAN.md** — New focused rendering workstream plan. Defines the 3-layer renderer contract (physics truth, scene shaping, ASCII presentation), reinterprets density as fabric excitation, defines the four player-facing reads (void, accretion, flow, surf lane), and splits work between Forge, Claude/Orrery, and Orb.

### docs/reference/ — New Files
- **RENDERER-HARNESS.md** — Documents the dedicated renderer capture path. Adds deterministic fixtures, timed captures at multiple moments, and pre-ASCII vs final ASCII outputs so renderer work is judged over time instead of from a single opportunistic frame.

### docs/journal/ — Updated
- **DECISION-LOG.md** — Added renderer recovery entry. Commits the jam-week renderer contract: black-hole readability first, explicit scene shaping, and ASCII as presentation rather than the source of meaning.

### Why
Renderer work had become entangled with feature work and too much meaning was being compressed into one channel. This plan isolates the rendering lane so Forge can stabilize the look while Claude keeps pushing gameplay and content.

---

## 2026-03-17 Night Session (Map Files + UI Flow)

### Map File System
- **coords.js** — `WORLD_SCALE` changed from `const` to `let` with `setWorldScale()` setter. ES module live binding ensures all importers see updates.
- **map-loader.js** — New file. `loadMap(map, systems)` clears all entity arrays, sets world scale, spawns wells/stars/loot/portals/planetoids from map data. Reinitializes fluid sim if map specifies different resolution.
- **maps/shallows-3x3.js** — Current 3×3 layout extracted verbatim from hardcoded init().
- **maps/expanse-5x5.js** — Medium map. 8 wells, 3 stars, 6 loot, 3 portals, 5 planetoids.
- **maps/deep-field-10x10.js** — Large map. 20 wells, 6 stars, 12 loot, 5 portals, 8 planetoids. Fluid resolution 512 for equivalent texel density.

### Force Culling
- Wells, stars, loot, portals all skip force injection for entities beyond `CAMERA_VIEW + 0.5` world-units from camera. Critical for 10×10 (20 wells = 20 GPU passes without culling).

### Fluid Reinitialize
- **fluid.js** — Added `reinitialize(newRes)` method. Destroys old framebuffers, creates new ones at specified resolution. Called automatically by map loader when needed.

### UI Flow (Title Screen + Map Select)
- **Game phases expanded:** `title` → `mapSelect` → `playing` (+ existing `dead`/`escaped`/`paused`).
- **Title screen:** Red title treatment with pulsing opacity, subtitle, blinking prompt. Fluid sim runs as ambient background with slow camera drift.
- **Map select:** Lists all 3 maps with name, size, and entity counts. Up/Down to navigate, Space to launch, ESC to go back.
- **Phase transitions:** Title→Space→MapSelect, MapSelect→Space→Playing, Dead/Escaped→Space→MapSelect, Paused→ESC→MapSelect.
- **input.js** — Added `upPressed`/`downPressed` getters for d-pad, arrows, and stick menu navigation.
- **main.js** — Restructured game loop: sim runs during menus (ambient background), input always polled, ship/entity rendering skipped during menus.
- **test-api.js** — `triggerRestart()` now calls `startGame()` to ensure playing state (skips title screen).

### Refactoring
- **main.js** — Removed all hardcoded entity creation (~40 lines). `init()` and `restart()` both use `loadMap()`. `STARTING_MASSES` constant replaced with dynamic `startingMasses` from map loader.

---

## 2026-03-17 Day Shift (Controller Overhaul + Playtest Roadmap)

### Controller Input Overhaul
- **input.js** fully rewritten with proper input processing pipeline:
  - Scaled radial deadzone (magnitude-based, no cardinal snapping, remapped 0–1 range)
  - Aim state hysteresis (enter at 0.25, exit at 0.10, 80ms hold timer absorbs spring bounce)
  - Soft tiered angular smoothing (full smoothing <3°, zero smoothing >15°, blend between)
  - Last-known-angle hold on stick release (no jitter, no snap to zero)
- All constants tunable in dev panel under input section
- Patterns from Warhawk/Starhawk (Josh Sutphin) and JoyShockMapper (Jibb Smart)

### Playtest Feedback (3x3 map)
- Larger map works well — wants 10×10 with more objects
- Wakes still imperceptible against ambient fluid density
- ASCII visuals flat — not enough charset variety, fabric feels static
- Controller jitter fixed (above)
- Map files needed for rapid layout iteration

### Roadmap Updated
Today's remaining tasks queued: wake visibility boost, ASCII visual depth, map file format, 5×5 prototype (stretch). 10×10 deferred pending architectural decisions (fluid resolution scaling, spatial force culling).

---

## 2026-03-17 Morning Session (Fixes + Refactor + Comment Pass)

### Fixes
- **Ship spawn location**: Moved from (1.44, 1.65) — which was 0.06 world-units from a star that punted the ship into a well — to (1.5, 0.45) in safe open space.
- **Gravity normalization**: Added distance normalization (÷ 0.25 reference) to ship gravity and star push. Without it, world-space distances made forces ~10× too strong.
- **Parallax between fluid and overlay**: `worldToScreen` was mapping 3 world-units per screen (old scale), but the fluid shader maps 1 world-unit per screen. Fixed to match.
- **Force stability guards**: Raised FORCE_MIN_DIST from 0.1 to 0.15 world-units.

### Refactoring
- **coords.js**: Added `CAMERA_VIEW`, `pxPerWorld(screenDim)`, `worldDirectionTo()`. Eliminated scattered scale calculations across 5 files.
- **physics.js**: New file — centralized all entity→ship force math. `inversePowerForce`, `proximityForce`, `waveBandForce`, `applyForceToShip`. Constants `FORCE_REF_DIST` (0.25) and `FORCE_MIN_DIST` (0.15).
- **config.js**: Moved all bare magic numbers into CONFIG: `fluidClampRadius`, `fluidTerminalSpeed` for each entity system; `camera.lerpSpeed/leadAhead/maxLerp`; `wells.accretionRings[]` data; portal `falloff`/`orbitalStrength`.
- **Gravity max range**: Wells (0.8) and stars (0.6) now fade to zero via quadratic curve. Creates genuine flat empty space.

### Code Comment Pass
- Every scalar, magic number, and tuning value in config.js, coords.js, physics.js, and all entity files now has a human-readable comment explaining what it does, its units, and how changing it affects gameplay.

---

## 2026-03-17 Night Shift (Map Expansion + Portals + Planetoids)

### src/ — New Files
- **portals.js** — PortalSystem class. Exit wormholes with weak inward pull, rotating 3-arm purple spiral density, pulsing overlay ring. Capture radius triggers extraction ("ESCAPED" screen).
- **planetoids.js** — PlanetoidSystem class. Moving terrain with 3 path types: orbit (elliptical around wells), figure-8 (Lissajous between wells), transit (straight line across map). Bow shock + wake vortex fluid injection creates surfable currents. Consumed by wells on contact (adds mass, spawns wave ring).

### src/ — Major Modifications
- **coords.js** — WORLD_SCALE=3.0. New functions: worldToFluidUV, worldToScreen (camera-aware + toroidal), screenToWorld, worldDistance, worldDisplacement. Legacy well-space functions kept.
- **fluid.js** — FBO textures REPEAT wrap (seamless world wrapping). Display shader adds u_camOffset/u_worldScale uniforms — camera controls which slice of the fluid field is visible. Toroidal distance for well proximity coloring.
- **main.js** — Camera state (camX/camY) with smooth lerp + velocity lead-ahead. All entities spread across 3x3 map. Portal/planetoid systems wired. Escaped screen. Restart resets planetoids.
- **ship.js** — World-space position (wx/wy, 0-3 range). Thrust converts px/s² to world-units at use-site. Mouse aim via screenToWorld with camera. Wake splats use worldToFluidUV.
- **wells.js** — World-space positions. checkDeath uses worldDistance. Accretion disk splat radii scaled for 3x UV.
- **stars.js** — World-space positions. applyToShip uses worldDisplacement. Ray/clearing radii scaled.
- **loot.js** — World-space positions. Glow/shimmer radii scaled.
- **wave-rings.js** — World-space. Radius/speed/push in world-units. Render uses worldToScreen with camera.
- **config.js** — Added portals + planetoids sections. Retuned: wells.shipPullStrength 250px→0.6 world-units, events converted to world-units, growth slowed (45s/0.02 mass), fluid dissipation radii tightened.
- **dev-panel.js** — Range hints for portals, planetoids, retuned events/wells values.
- **presets.js** — All preset values converted to world-space.
- **test-api.js** — getShipPos returns world coords, teleportShip takes world coords, getFluidVelAt takes world coords.

### tests/
- **physics.js** — Updated thresholds for world-space, restarts between tests to avoid stale gamePhase.
- **coordinates.js** — Teleport uses well.wx/wy instead of screen coords.

### Entity Placement (3x3 map)
- Wells: (1.0, 1.2), (2.1, 0.9), (1.95, 2.16), (0.6, 2.25)
- Stars: (1.5, 1.65), (0.45, 0.75)
- Loot: (1.5, 1.05), (1.35, 2.1), (2.4, 1.65)
- Portals: (0.3, 0.3), (2.7, 2.7)
- Planetoids: 2 orbiting + 1 figure-8 at init, transits spawn every 15-25s

### Why
Greg's playtest: "world is too cramped, everything on one screen." 3x3 expansion gives room to explore, camera follow makes the world feel large. Portals prototype the extraction loop. Planetoids create moving terrain with surfable wakes and feed wells through consumption.

---

## 2026-03-17 (Jam Day 2: Tuesday — Sim Expansion Experiments 1-5)

### src/ — New Files
- **stars.js** — StarSystem class. Stars push fluid outward (negative gravity via `applyWellForce`), inject rotating radial light rays and bright core, push ship away. Creates equilibrium zones with wells.
- **loot.js** — LootSystem class. Anchored points that obstruct flow via zero-velocity splats. Ambient glow and rotating shimmer. Future loot pickup locations.
- **input.js** — InputManager class. Gamepad API abstraction. Left stick = analog facing, R2 = analog thrust (0-1), L2 = analog brake. Auto-detects gamepad with mouse fallback.

### src/ — Modified
- **config.js** — Ship slowdown: `thrustAccel` 2500→800, `drag` 0.03→0.06, `fluidCoupling` 0.6→1.2. Added `ship.wake` sub-object for bullet wake params. Added `stars`, `loot`, `input` CONFIG sections.
- **ship.js** — Bullet wake: speed-based (not thrust-based), 3 directional splats behind ship, density/force cut to ~30-40% of old values. Analog thrust: `thrustIntensity` (0-1) replaces boolean `thrusting` for gamepad. Analog brake via `brakeIntensity`. Direct facing setter for gamepad stick.
- **fluid.js** — Dissipation shader `u_wellPositions` array expanded from 4 to 12 to support wells + stars + loot as density sources.
- **main.js** — Wired StarSystem, LootSystem, InputManager. Stars placed at (0.50, 0.55) and (0.15, 0.25). Loot at 3 navigable positions between wells/stars. Input polling before ship update. Star push after ship update. All density sources passed to dissipation shader.
- **dev-panel.js** — Added range hints for stars, loot, ship.wake, input sections. Added nested sub-object support (handles `ship.wake.*` sliders).

### docs/design/ — New Files
- **ENTITIES.md** — Entity types, force models, interaction matrix, performance budget.

### Why
L0 physics are working but the world needs more things to navigate around. Ship was too fast to read currents (thrustAccel 2500 → terminal vel ~1333px/s). Five experiments add: deliberate ship movement, speed-based wake, radiant push sources, flow obstacles, and analog controller support. Each produces a visible, playtestable result.

---

## 2026-03-16 (Jam Day 1: Monday — Fluid Diagnostics)

### src/ — Modified
- **fluid.js** — Added `FRAG_DISSIPATION` shader (distance-based density dissipation keyed to well proximity). Added `readDensityAt()` method (GPU readback, same pattern as `readVelocityAt`). Added `setWellPositions()` for passing well UVs to dissipation pass. Wired dissipation pass into `step()` after density advection (step 4b). Advection dissipation set to 1.0 — all density decay now handled by the distance-based pass.
- **config.js** — Added `nearDissipation` (0.998), `farDissipation` (0.985), `dissipationNearRadius` (0.08), `dissipationFarRadius` (0.35) to fluid section. Added `showFluidDiagnostic` debug flag.
- **main.js** — Calls `fluid.setWellPositions()` before `fluid.step()` each frame. Added fluid diagnostic overlay (section 9b) behind `showFluidDiagnostic` flag: density at ship, density+velocity at each well, midpoint between closest wells, min/max across sparse grid.

### Why
Shader tuning session failed because density values accumulated to ~3850x the display range (injection ~7.7/frame / 0.002 decay = 3850 steady-state). Everything > 1.0 clamped to white. We were tuning blind. Distance-based dissipation creates a natural gradient: persistent near wells (accretion zones), fast fadeout in empty space. Diagnostic overlay lets us see actual values before tuning the display shader.

---

## 2026-03-15 (Pre-Jam Day 2: Architecture Day — Late Session)

### docs/design/ — New Files
- **CONTROLS.md** — NEW. Ship control model (turn speed, mass, inertia, gravity response, thrust model). Mouse input schemes (Model 1: distance-thrust recommended, Model 2: binary fallback, Model 3: drag-magnet reject). DualSense controller mapping with adaptive triggers and HD haptics. Input-dependent affordance tuning table. Ship control tuning variables table. Split from MOVEMENT.md — controls/input lives here, surfing metaphor/fabric stays there.
- **TUNING.md** — NEW. Tuning workflow definition: 4 progressive modes (dev panel Monday, sandbox Monday evening, scenario snapshots Wednesday, A/B testing Thursday). Day-by-day tuning guide with slider tables per layer. Plain English to numbers translation guide. Dev panel implementation spec: CONFIG object architecture, progressive slider enhancement, "Commit Tuning" workflow.
- **AGENT-TESTING.md** — NEW. Agent self-testing strategy. The split: machines verify "does it work?", Greg verifies "does it feel right?". Puppeteer test harness. 5 test layers built incrementally (smoke, physics, gameloop, signal, integration, visual regression). `window.__TEST_API` interface spec. When-tests-run protocol for night/morning/day shifts. Implementation budget (~690 lines).

### docs/design/ — Updated
- **MOVEMENT.md** — Split: ship physics model, input schemes, and per-device tuning extracted to new CONTROLS.md. MOVEMENT.md now focuses on surfing metaphor, control affordances (magnetism, forgiveness, stickiness), fabric interactions, and skill progression. Ship control tuning table replaced with cross-reference to CONTROLS.md.
- **DESIGN-DEEP-DIVE.md** — Added cross-reference to CONTROLS.md, TUNING.md, and AGENT-TESTING.md in the Object-Fluid Coupling section.

### docs/project/ — Updated
- **AGENT-PROMPTS.md** — Shared context updated: added CONTROLS.md and TUNING.md to required reading list. Added CONFIG object pattern with example code and explanation. Added __TEST_API requirement. Fixed entry point references to `index-a.html` / `index-b.html` (was `index.html`). File naming sections updated per prototype.
- **ROADMAP.md** — Task numbering updated: N0 (smoke tests), N1a/N1b (parallel physics experiments), N2 (dev panel), N3 (ASCII shader). Fixed N7 dependency reference (was N2, now N1a/N1b winner). Task count corrected to 21.
- **BUILD-PLAN.md** — Layer 0 now lists dev panel, CONFIG object, `window.__TEST_API`, and smoke tests as Monday deliverables.
- **JAM-CONTRACT.md** — Agent prompt template updated with Architecture Requirements section: CONFIG object, `window.__TEST_API`, dev panel slider integration.

### CLAUDE.md — Updated
- "Read These First" L0 entry now includes CONTROLS.md.
- Testing section updated with Puppeteer test runner command and `window.__TEST_API` reference.

### docs/journal/ — Updated
- **DECISION-LOG.md** — New entries: dev panel as mandatory build requirement, CONFIG object as architectural pattern, Puppeteer test harness approach, mouse control model ranking (Model 1 recommended, Model 2 fallback), DualSense as Tuesday/Wednesday stretch.
- **CHANGELOG.md** — This entry. Updated ROADMAP.md task count reference.

---

## 2026-03-20 (Jam Day 5: Renderer Recovery Planning)

### docs/project/ — New Files
- **RENDERER-RECOVERY-PLAN.md** — New focused rendering workstream plan. Defines the 3-layer renderer contract (physics truth, scene shaping, ASCII presentation), reinterprets density as fabric excitation, defines the four player-facing reads (void, accretion, flow, surf lane), and splits work between Forge, Claude/Orrery, and Orb.

### docs/journal/ — Updated
- **DECISION-LOG.md** — Added renderer recovery entry. Commits the jam-week renderer contract: black-hole readability first, explicit scene shaping, and ASCII as presentation rather than the source of meaning.

### Why
Renderer work had become entangled with feature work and too much meaning was being compressed into one channel. This plan isolates the rendering lane so Forge can stabilize the look while Claude keeps pushing gameplay and content.

---

## 2026-03-15 (Pre-Jam Day 2: Architecture Day)

### docs/design/
- **DESIGN.md** — unchanged (the bible holds)
- **DESIGN-DEEP-DIVE.md** — added ASCII shader research (pmndrs/postprocessing as starting point, 4-pass GPU pipeline, font atlas, braille characters), entity IFF system, NERV HUD architecture, universe gen rules, 10-minute match timeline, scavenger AI, fauna types, Inhibitor mechanics, sound direction, camera system. **Late update:** physics architecture section rewritten to reflect parallel experiment decision (dual-sim → two approaches built simultaneously).
- **SIGNAL-DESIGN.md** — NEW. Signal as "the tax on ambition." 6-tier gradient (GHOST→THRESHOLD), per-player in multiplayer, peak-based Inhibitor trigger. Explicit: signal does NOT buy capability.
- **COMBAT.md** — NEW. Full case for/against weapons. Conclusion: no lethal combat for v1. Non-lethal tools (force pulse, signal flare, tether) as stretch goals.
- **MUSIC.md** — NEW. 5-layer procedural soundscape (drone, well harmonics, wave rhythm, signal choir, Inhibitor presence). All Web Audio API, no libraries, no samples.
- **SCALING.md** — NEW. Player scaling (1→10→100), universe scaling (small→vast). Jam target: 4x4 screens with frustum rendering. Multiplayer architecture (authoritative server + client prediction). 5 clean-architecture choices for the jam. **Late update:** Phase 2 multiplayer relabeled as stretch goal per decision log.
- **PILLARS.md** — NEW. 6 design pillars: Art Is Product, Movement Is the Game, Signal Is Consequence, Universe Is the Clock, Dread Over Difficulty, Run It Twice. Ordered by priority. Each has "the test" section.
- **MOVEMENT.md** — NEW. Surfing metaphor (10 concepts mapped from real surfing), control affordances (wave magnetism, well escape assist, wreck stickiness, portal alignment, input buffering with coyote time), fabric interactions (wells, wrecks, mergers, cosmic signatures), skill progression (beginner→expert), tuning variables with starting values.

### docs/project/
- **BUILD-PLAN.md** — updated: added threat priority note (Inhibitor core, fauna stretch, scavengers only if ahead).
- **JAM-CONTRACT.md** — NEW. Day/night shift protocol, checkpoint cadence, Forge's role as architectural brake, task sequencing rules, agent prompt template, scope ratchet triggers. Updated with Forge review gate. **Late update:** added documentation structure (4-folder layout), journal files, ownership table, 7 update triggers, rules.
- **ROADMAP.md** — NEW. Detailed hour-by-hour roadmap for 7-day jam. 21 named tasks (N0, N1a, N1b, N2-N19) with deliverables, dependencies, acceptance criteria. Scope ratchets at every day boundary. **Updated:** task numbering changed to N0/N1a/N1b/N2/N3... to reflect parallel experiments and dev panel insertion. N0 = smoke tests, N1a/N1b = parallel physics experiments, N2 = dev panel, N3 = ASCII shader.
- **FORGE-REVIEW.md** — NEW. Two-pass review brief for Forge (creative + technical).
- **GEMINI-PROMPTS.md** — NEW. 8 image generation prompts (3 key art, 3 game moments, 2 entity concepts).
- **PRE-MONDAY-RESEARCH.md** — updated with pmndrs ASCII shader references, CSS color palette, word lists for procgen. **Late update:** font atlas size corrected to 16×16 (matches DEEP-DIVE/pmndrs).

### docs/reference/
- **EVE-WORMHOLE-REFERENCE.md** — NEW. 6 patterns to steal (dual-depletion, asymmetric info, environmental effects, portal capacity, K162 commitment rule, rolling). Universe type table. Naming inspiration.
- **STELLARIS-REFERENCE.md** — NEW. Crisis escalation, Shroud bargains, environmental hazards, anomaly pity timers, archaeology chapters, precursor archetypes, leviathans, L-Gate mystery, Horizon Signal cosmic horror, naming conventions, Alexis Kennedy narrative principles.
- **reviews/forge-review-2026-03-15.md** — Forge's delivered review. Showstoppers, risks, opportunities, recommendations, cut list. Key phrase: "Fake the theorem, ship the feeling."

### docs/journal/
- **DEVLOG.md** — NEW. Reverse-chronological dev journal. Entries for Mar 14 (The Spark) and Mar 15 (The Architecture Day).
- **CONTENT-PLAN.md** — NEW. Post-jam content plan (Twitter threads, blog posts, YouTube concepts).
- **DECISION-LOG.md** — NEW. Full decision trees for: physics architecture (reopened with parallel experiments option), signal mechanic, combat, threats, multiplayer, visual stack, naming. 8 design forks tracked.
- **CHANGELOG.md** — NEW. This file.

---

## 2026-03-14 (Pre-Jam Day 1: The Spark)

### docs/design/
- **DESIGN.md** — NEW. Core game design document. One-sentence pitch, core loop, universe-as-clock, movement/physics, threat hierarchy, visual design (ASCII dithered fluid), procedural generation, progression stubs, tech stack, open questions.

### docs/project/
- **BUILD-PLAN.md** — NEW. 7-layer build plan (L0 Feel → L6 Ship). Scope ratchets. Pre-Monday prep checklist.

## 2026-03-20 (Jam Day 5: Sim Decoupling Design)

### docs/project/ — New Files
- **SIM-DECOUPLING-PLAN.md** — New architecture plan for splitting authoritative world simulation from the player executable. Defines the process split (Sim Core, Client Runtime, Field Adapter), argues against making the current WebGL fluid sim authoritative, proposes a coarse-field authoritative model with client-side visual reconstruction, recommends a 15 Hz sim tick, and maps the current code seams that must be cut first.

### docs/journal/ — Updated
- **DECISION-LOG.md** — Added sim/client decoupling decision. Gameplay truth moves toward a separate authoritative sim process; visual fluid stays client-side. First milestone is interface decoupling, not running a server.

### Why
Greg wants the world sim prepared for multiplayer and for future scale without tying server cost to render cost. Current architecture review showed the sim, fluid, AI, and rendering are still too entangled. This plan defines the first clean split: authoritative gameplay state and coarse flow truth on one side, high-frequency visual reconstruction on the client.

### src/ — New Files
- **sim/flow-field.js** — New gameplay-facing flow interface. Wraps the current fluid sim behind `sample(wx, wy)` / `sampleUV(u, v)` so movement code can stop asking the GPU texture for truth directly.
- **sim/sim-core.js** — New in-process authoritative world-step shell. Owns the fixed simulation block that used to live inline in `main.js`: fluid step, well/star updates, portal/planetoid/wreck/loot passes, combat, growth, wave propagation, and run timer progression.
- **sim/sim-state.js** — New plain-data run-state container for `growthTimer`, `runElapsedTime`, and `runEndTime`.

### src/ — Modified
- **main.js** — Wires in `FlowField`, `SimCore`, and `SimState`. The render loop still owns input/camera/HUD, but the world-step now crosses an explicit sim boundary. Title/gameplay UI now reads run timing from `simState` rather than ad hoc globals.
- **ship.js** — Ship movement now samples currents through `flowField.sample(wx, wy)` instead of reading the fluid texture directly. Wake injection still writes to visual fluid explicitly.
- **test-api.js** — `getFluidVelAt()` now routes through the gameplay-facing flow-field interface instead of reaching straight into the GPU fluid object.
- **scavengers.js** — Scavenger movement and routing now sample currents through `FlowField` instead of reading the GPU velocity texture directly.
- **loot.js / wrecks.js / portals.js** — Sim-owned updates no longer require camera position; render-time culling stays in the render path instead of leaking into the world step.
- **config.js** — Adds a `sim` block with `fixedHz` and `maxStepsPerFrame` so authoritative tick cadence has a real home.
- **sim/sim-core.js** — Now owns a fixed-step accumulator. The sim advances on its own cadence instead of piggybacking directly on the client frame loop.

### Why
This is the first real decoupling cut. The game still runs in one app, but the client loop is no longer the only owner of simulation truth, and the world update no longer depends on the camera. That makes the next steps possible: move the remaining systems behind `SimCore`, lower the authoritative tick without breaking the client loop, and eventually push the same boundary into a worker or server process without rewriting the whole game.

## 2026-03-20 (Jam Day 5: Dev Server and PID Discipline)

### scripts/ — New Files
- **scripts/static-server.js** — Shared static server for both human playtesting and harness runs. Serves `index-a.html` at `/` and writes pid/meta files when asked.
- **scripts/dev-server.js** — Canonical controller for the long-lived local dev server. Supports `start`, `stop`, `status`, and `restart`.

### tests/ — Modified
- **tests/helpers.js** — Harness now uses the same shared static server implementation on its own dedicated port (`8719`) and writes transient pid/meta files under `tmp/`.

### docs/ — Modified
- **docs/reference/DEV-SERVER.md** — Documents the current LBH process model and canonical ports.
- **docs/project/BACKLOG.md** — Adds explicit future work for a dedicated sim process, local client/server protocol, and headless sim harness.
- **docs/project/SIM-DECOUPLING-PLAN.md** — Adds the current vs future operational process model.
- **docs/design/AGENT-TESTING.md** — Stops telling agents to guess at ad hoc local servers.

### package.json / .gitignore
- Added `npm run dev`, `dev:stop`, `dev:status`, and `dev:restart`.
- Ignored `tmp/` runtime pid/meta files.

### Why
Claude and Codex were guessing at different local ports and different static server processes. LBH now has one canonical playtest server path and one separate transient harness path, which is the minimum operational discipline needed before a real sim/server PID exists.

## 2026-03-20 (Jam Day 5: Client Perf Triage)

### src/ — Modified
- **sim/sim-core.js** — Distance-based density dissipation now tracks only core field anchors (wells + stars) instead of every loot/wreck/portal/planetoid/ship/scavenger position.
- **wells.js** — Removes the accretion-ring splat storm from the sim update path. Wells now keep the actual force field plus the subtractive core signal; the renderer owns the bright accretion band analytically.
- **stars.js** — Removes rotating star ray splats from the sim path. The fluid layer keeps the core read; richer rays remain presentation-side.
- **fluid.js** — Display shader now gives wells an analytic ring-energy baseline from scene data, so readable black holes do not depend on dozens of live splats.

### docs/reference/ — New Files
- **PERF-ANALYSIS.md** — New perf note explaining why `3x3` holds while `5x5`/`10x10` collapse, where the full-screen pass budget was going, what cuts landed, and which levers remain (resolution, tick rate, solver budget).

### docs/project/ — Modified
- **BACKLOG.md** — Adds `Adaptive Sim Budgets by Map Scale` as explicit future work.

### Why
Large-map slowdown was not primarily a camera/frustum problem. The main bottleneck was per-entity full-screen splat work, especially wells and stars, multiplied by fixed 60 Hz sim stepping and the `512`-resolution deep-field map. This pass cuts the worst structural waste first and documents the next safe tuning levers.

## 2026-03-21 (Jam Day 6: Renderer Seam and Tile-Boundary Pass)

### src/ — Modified
- **fluid.js** — Display shader now wraps world-space sampling consistently before reading density, velocity, visual density, and fabric noise. GPU readback helpers also wrap UVs before converting them to pixels.
- **ascii-renderer.js** — ASCII post-process now anchors shimmer and directional velocity reads from wrapped fluid UVs instead of mixing wrapped sim data with unwrapped cell-space noise.
- **sim/flow-field.js** — Flow-field sampling now wraps at world edges instead of clamping, so client-side gameplay reads use the same toroidal topology as the GPU sim.
- **wells.js** — Wells stop writing subtractive visual density every fixed tick. The renderer keeps the well core analytically, which avoids large blocky dark slabs after ASCII quantization.

### Why
The sim was already toroidal, but the renderer and CPU readback path were not fully honoring the same wrap rules. That mismatch could show up as hard seams near world/tile boundaries. A second artifact came from subtractive well splats accumulating every tick, which made black holes flatten into rectangular dark regions once the ASCII pass quantized them. The fix was to make wrapping consistent end-to-end and let the renderer own the well silhouette directly.

## 2026-03-21 (Jam Day 6: Multi-Well Void Regression Fix)

### src/ — Modified
- **fluid.js** — Per-well scene shaping no longer reapplies the global `voidField` inside the well loop. The loop now only blackens each well's own core mask and uses `liveSpace` once as the ambient scene-level darkness term.

### Why
The first seam/topology fix accidentally exposed a second renderer bug on real gameplay maps: the shader was applying the already-computed global void field once per well. On title this mostly hid, but on multi-well maps it stacked the darkness repeatedly and made wells disappear into giant black regions. The fix keeps the global void term global and limits per-well darkening to each well's actual core.

## 2026-03-21 (Jam Day 6: Louder Gameplay Wells)

### src/ — Modified
- **wells.js** — Expands the renderer-facing ring geometry so gameplay wells read from farther out instead of collapsing to tiny hot centers.
- **fluid.js** — Raises accretion-band energy, halo lift, and surf-band contrast while keeping the core dark and the background restrained.

### Why
After the topology and multi-well fixes, gameplay wells were structurally correct but still too quiet. This pass makes them louder tactically — broader visible band, clearer outer read, same black core — without blowing the whole scene back out.

## 2026-03-21 (Jam Day 6: Honest Kill Edge)

### src/ — Modified
- **wells.js** — Visible core sizing now slightly exceeds the real gameplay kill radius instead of undershooting it.
- **fluid.js** — Adds a thin event-horizon rim around the core so low-mass wells still show a readable lethal boundary in motion.

### Why
The remaining gameplay failure was not topology anymore. It was honesty. The ship could still die inside a region that read too softly or too small, especially on smaller wells outside the title screen. This pass makes the visible dark core cover the actual kill zone and adds a narrow horizon rim so the player can see where the danger begins.

## 2026-03-25 (Week 2 Day 1: Review Fixes)

### src/ — Modified
- **wrecks.js** — Dropped-wreck drag now decays by elapsed time instead of by frame count, so ejection behavior stays consistent on slow maps.
- **main.js** — Escape now closes the inventory during play instead of pausing the run behind the panel.
- **test-api.js** — Exposes wreck inspection, test-wreck spawning, and direct pickup helpers so inventory tests can drive real item flows.

### tests/ — Modified
- **inventory.js** — Replaces two placeholder checks with actual wreck-loot validation and a real pickup-to-cargo test.

### Why
Today’s review surfaced two real gameplay bugs and one false-confidence problem. Dropped wrecks were drifting different distances at different frame rates, keyboard Escape did not actually perform the documented inventory-close action, and two inventory tests were claiming coverage they did not provide. This pass fixes the behavior and makes the test suite earn its green status.

## 2026-03-25 (Week 2 Day 1: Renderer Scale Coverage)

### src/ — Modified
- **maps/renderer-fixtures.js** — Adds a `5x5` single-well fixture and a `10x10` interference fixture so renderer captures cover large-map scaling, not just the 3x3 reference view.

### tests/ — Modified
- **renderer.js** — Expands the harness to capture both new fixtures and adds per-fixture FPS floors so large-map captures are judged on honest expectations.

### docs/ — Modified
- **reference/RENDERER-HARNESS.md** — Documents the larger-map fixtures and their purpose.

### Why
The recent shader and coordinate fixes were specifically about UV/world conversion, toroidal wrapping, and large-map behavior, but the renderer harness only exercised 3x3 scenes. This pass adds enough 5x5 and 10x10 coverage to catch scaling regressions before they hide behind a green test run.

## 2026-03-27 (Week 2 Day 3: Network Architecture Direction)

### docs/project/ — New Files
- **NETWORK-ARCHITECTURE-PLAN.md** — Defines the next-step architecture beyond the in-process sim boundary: mini-hosted authoritative sim, MacBook local-rendering client, first local protocol, hosted run-instance future, and deferred native/Godot migration.

### docs/project/ — Modified
- **SIM-DECOUPLING-PLAN.md** — Links the local sim split to the larger network plan so the current decoupling work has an explicit next destination.
- **BACKLOG.md** — Adds the next-week architecture batch (`mini server + MacBook client`, `local protocol freeze`) and parks hosted instances and Godot/native client work in the right order.
- **WEEK2-STATUS.md** — Adds a concrete next-week architecture focus section so the roadmap does not blur private remote play with public hosting or engine migration.

### Why
The architecture discussion stopped being hypothetical. LBH is multiplayer-first with solo fallback, and the immediate next move is not public hosting or a port. It is a private authoritative split between Greg's machines plus the first stable client/server protocol that later hosting can reuse.

## 2026-03-27 (Week 2 Day 3: First Local Sim Server Slice)

### scripts/ — New Files
- **sim-protocol.js** — Freezes the first plain-data local protocol constants and the input envelope normalization for the mini-hosted sim path.
- **sim-runtime.js** — Adds a separate authoritative sim server shell with a fixed tick, in-memory session state, snapshots, events, and input ingestion over HTTP.
- **sim-server.js** — Adds PID-managed start/stop/status/restart control for the local sim server, parallel to the existing dev server tooling.

### docs/project/ — New Files
- **LOCAL-PROTOCOL.md** — Documents the first client/server contract: join, input, snapshot, events, and session start.

### package.json — Modified
- Adds `npm run sim`, `sim:stop`, `sim:status`, and `sim:restart`.

### Why
The sim/client split needed to stop being only a design note. This first slice gives LBH a separate authoritative process shell and a concrete local protocol without pretending the full gameplay sim already lives there.

## 2026-03-27 (Week 2 Day 3: Real Map Authority in Sim Server)

### scripts/ — New Files
- **shared-map-loader.js** — Reads the current playable map definitions into Node so the sim server can own real run content instead of a dummy scene.

### scripts/ — Modified
- **sim-runtime.js** — Session start now loads real playable maps, authoritative snapshots now carry wells/stars/wrecks/planetoids, joins now spawn at safe positions, and the server now applies well gravity, well death, and timed respawn.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md** — Documents the new `GET /maps` endpoint, world entity snapshots, and the fact that the server already owns session state, map state, and well death/respawn.
- **NETWORK-ARCHITECTURE-PLAN.md** — Notes current progress so the architecture doc matches the actual code, not just the intended direction.

### Why
The first server shell was too small to prove much. This pass moves real run authority into the separate process: actual maps, actual entities, authoritative spawning, and the first piece of real gameplay consequence outside the client loop.

## 2026-03-27 (Week 2 Day 3: Remote-Authority Browser Client)

### src/sim/ — New Files
- **sim-client.js** — Adds the browser-side HTTP client for the local LBH protocol, including session start/reset, join, input, and snapshot polling.

### src/ — Modified
- **main.js** — Adds remote-authority mode behind `?simServer=...`, starts a fresh authoritative run from map select, applies authoritative snapshots to the local ship, and keeps the browser renderer running as a local client instead of local gameplay authority.
- **test-api.js** — Adds remote-network status helpers and a remote start hook so the path can be smoke-tested automatically.

### scripts/ — Modified
- **sim-runtime.js** — Removes the toy timed respawn behavior so well death matches the real run/reset flow more closely.
- **sim-server.js** — Adds host/port overrides via CLI/env so the sim can bind beyond localhost for Tailscale/LAN use.

### tests/ — Modified
- **physics.js** — Tightens the well-pull check so it measures inward radial pull directly instead of being confused by tangential orbital flow.

### docs/ — Modified
- **project/LOCAL-PROTOCOL.md** — Documents the remote browser client path, host binding, and the current authority split.
- **project/NETWORK-ARCHITECTURE-PLAN.md** — Updates next-step progress to reflect that the browser can now consume authoritative snapshots.

### Why
The architecture stopped being only a separate server process. The browser now has a real remote-authority path: it can start a run on the sim server, join it, send input across the boundary, and render locally from authoritative snapshots.

## 2026-03-28 (Week 2 Day 4: Server-Owned Run Progression and Loot)

### scripts/ — Modified
- **sim-runtime.js** — The sim server now owns portal waves, portal expiry, extraction checks, wreck pickup, cargo truth, cargo loss on death, well growth, and the first gameplay-affecting equip effect (`reduceWellPull`).

### src/ — Modified
- **main.js** — The remote client now syncs portal snapshots and authoritative cargo/loadout state from the server, and transitions into the escaped run state from authoritative status instead of local extraction checks.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md** — Records that the server now owns remote run progression beyond movement alone.
- **NETWORK-ARCHITECTURE-PLAN.md** — Updates the current progress section so it matches the new server-owned run systems.

### Why
The remote path needed to stop being just a movement demo. This slice moves real run authority over: portals now exist on the server, extraction is authoritative, loot pickup is authoritative, and remote runs now keep or lose cargo based on server truth.

## 2026-03-28 (Week 2 Day 4: Chrome DevTools MCP Integrated Into Workflow)

### project root — Existing config adopted
- **.mcp.json** — Project-scoped Chrome DevTools MCP server config is now treated as part of the LBH toolchain.

### docs/reference/ — Modified
- **DEV-SERVER.md** — Documents how Chrome DevTools MCP fits alongside the dev server, harness server, and sim server.
- **RENDERER-HARNESS.md** — Clarifies that MCP complements the deterministic harness instead of replacing it.

### Why
LBH now has two browser-testing layers with different jobs. Puppeteer remains the deterministic test path. Chrome DevTools MCP is the live browser inspection and perf-debug layer for renderer work, menu/meta flow debugging, and remote-authority inspection.

## 2026-03-30 (Week 2 Day 6: Server-Owned Hazard Contact and Remote Force Validation)

### scripts/ — Modified
- **sim-runtime.js** — The sim server now applies star push, planetoid/comet push, and scavenger bump collision to authoritative players instead of leaving those forces in the local-only gameplay loop. It also now spawns stellar-remnant wrecks when stars are consumed by wells and exposes a small debug player-state hook used by the remote-authority suite.

### src/ — Modified
- **main.js** — Remote clients now react to authoritative `star.consumed` events with the same warning/audio/star-flash feedback as the local path instead of silently relying on local side effects. They also now replay authoritative pulse/growth/consumption wave events and keep those wave rings updating/injecting locally during remote visual mode.
- **combat.js** — Added a visual-only remote pulse reconstruction path so authoritative `player.pulse` events now recreate fluid splats, shockwave rings, and well-disruption presentation locally without reapplying gameplay truth on the client.
- **remote-authority.js** — The remote suite now moves the player near a real well before pulsing and proves that authoritative pulses create visible well-disruption state on the client instead of only emitting the protocol event.
- **main.js** — Remote browser startup no longer treats the later client's local map selection as a hidden reset request. If an authoritative session is already live, the client now loads that session's map and joins it by default.
- **main.js** — Remote death/extraction flows now leave the authoritative session cleanly instead of resetting the whole server run when one client is done.
- **sim/sim-client.js** — Adds an explicit `leave()` request for remote clients.
- **sim/sim-client.js** — Session control calls now identify the requester, which lets the server enforce host-owned start/reset authority.

### tests/ — Modified
- **remote-authority.js** — Adds a real authoritative hazard-force check, proves the server-owned force math directly, and now also verifies that a second browser asking for the wrong map still joins the live authoritative run instead of resetting it.
- **remote-authority.js** — Also now verifies that a browser-backed remote client can leave cleanly without destroying the session.
- **remote-authority.js** — Now also verifies that the first browser becomes host, non-host reset requests are denied, and host promotion happens when the host leaves.

### scripts/ — Modified
- **sim-runtime.js** — Adds `POST /leave` so the server can drop a client from a live authoritative run without resetting session state.
- **sim-runtime.js** — The authoritative session now tracks a real host, restricts start/reset to that host, and promotes a new host when the old one leaves.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The protocol and remote path were already real, but remote runs still lied about some moment-to-moment survival contact. The server now owns the remaining ship hazard pushes that mattered most, which makes the remote client closer to a true presentation/input layer instead of a partially authoritative hybrid.

## 2026-03-28 (Week 2 Day 4: Honest Menu and Remote Test Coverage)

### tests/ — Modified
- **helpers.js** — Adds dedicated sim-server helpers, explicit key dispatch, and generic wait support so browser-path tests can drive the real UI more reliably.
- **run-all.js** — Adds new `MetaFlow` and `RemoteAuthority` suites to the default deterministic harness.
- **meta-flow.js** — Adds real title → profileSelect → home → mapSelect → playing coverage without using `triggerRestart()`.
- **remote-authority.js** — Adds a real browser smoke that starts a dedicated sim server, launches the client with `?simServer=...`, and verifies authoritative snapshots and movement.

### Why
The existing suite was still too willing to bypass the exact surfaces that were changing most: the profile/home flow and the remote-authority path. These new suites keep Puppeteer as deterministic truth, but stop pretending helper shortcuts are enough on their own.

## 2026-03-28 (Week 2 Day 4: Server-Owned Scavengers in Remote Runs)

### scripts/ — Modified
- **sim-runtime.js** — Adds simple authoritative scavenger spawning, state, loot/extract decisions, motion, and snapshot serialization for remote runs.

### src/ — Modified
- **main.js** — Syncs authoritative scavenger snapshots back into the client so remote runs render rivals from server truth instead of local AI.

### tests/ — Modified
- **remote-authority.js** — Verifies that remote-authority snapshots now include visible scavengers.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The remote path was still too empty to count as a real competitive run. Server-owned scavengers make the mini-hosted authority feel more like the actual game while keeping the client in a rendering role.

## 2026-03-28 (Week 2 Day 4: Server-Owned Consumables and Pulse Authority)

### scripts/ — Modified
- **sim-runtime.js** — The sim server now owns remote consumable activation, active effect timers/state, shield absorption at well contact, breach-flare portal spawning, and authoritative pulse cooldown/events. One-shot remote actions are preserved across input frames instead of being stomped by later no-op inputs.
- **sim-protocol.js** — Extends the input envelope with `consumeSlot` so the client can request authoritative item use directly.

### src/ — Modified
- **main.js** — Remote runs now sync active effect state and pulse cooldown from authoritative snapshots and play local audio/warning feedback from remote events instead of assuming local item truth.
- **main.js** — Remote world sync now fully reconciles dynamic stars, wrecks, and planetoids instead of only patching shared index ranges. That makes authoritative dropped-item wrecks and other server-spawned entities actually appear on remote clients.
- **sim-runtime.js** — Remote scavengers now die the same way the authoritative world says they die: they enter a death spiral, finish on the server, and scatter debris wrecks there instead of disappearing instantly. The sim now also exposes a debug scavenger-state hook for remote-authority validation.
- **main.js** — Remote clients now consume explicit `scavenger.extracted` and `scavenger.consumed` events instead of inferring those outcomes only from portal counts or local-only death-drop queues.
- **test-api.js / remote-authority.js** — Remote coverage now sees scavenger ids, can force authoritative scavenger hazard cases, and proves that remote scavenger deaths create debris wrecks on the client.
- **main.js / test-api.js** — Remote snapshots now preserve a separate `remotePlayers` set, and the overlay renders other authoritative players instead of throwing them away. The test API exposes that set so remote-authority coverage can prove the first browser sees a second joined client.
- **remote-authority.js** — Remote inventory coverage now proves that dropping cargo on the server produces a new wreck on the browser client instead of only mutating server-side state.
- **sim/sim-client.js** — `join()` now actually sends equipped and consumable loadout state, and `sendInput()` can now carry `consumeSlot`.
- **test-api.js** — Adds lightweight profile seeding and remote input hooks for honest protocol tests.

### tests/ — Modified
- **remote-authority.js** — Extends remote coverage so the suite now proves authoritative consumable use and authoritative pulse events instead of stopping at movement alone.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Remote authority was still only half-true. The server could own movement, loot, and scavengers, but the client was still pretending consumables and pulse timing were local. This slice moves those systems over so a remote run is closer to the real game instead of a movement demo wrapped around local gameplay shortcuts.

## 2026-03-31 (Week 3 Day 2: Next Architecture Phase Defined)

### docs/project/ — Added
- **PLAYER-BRAIN-AND-OVERLOAD-PLAN.md** — Detailed design for the post-migration architecture phase: boxed server-side player truth, explicit overload states, coarse authoritative flow/hazard fields for larger maps, and session profiles for 1/4/8-player intents.

### docs/project/ — Modified
- **NETWORK-ARCHITECTURE-PLAN.md** — Adds the next architecture batch after the first migration: `PlayerBrain`, overload state machine, coarse field authority, and session profiles.
- **BACKLOG.md** — Adds explicit backlog/design entries for `PlayerBrain`, overload states, coarse authoritative field work, and session-profile design.

### Why
The client/server split is real enough now that the next problem is no longer process separation. The next problem is keeping the authoritative server coherent and affordable as map size, player count, and sim fidelity increase.

## 2026-03-31 (Week 3 Day 2: Persistence and Control Plane Defined)

### docs/project/ — Added
- **PERSISTENCE-AND-CONTROL-PLANE-PLAN.md** — Defines the durable architecture outside the sim instance: persistent profile store, control-plane/session registry, disposable run instances, result write-back boundaries, and the first sensible deployment shape.

### docs/project/ — Modified
- **NETWORK-ARCHITECTURE-PLAN.md** — Clarifies the long-term three-layer server shape: persistent data/control plane, authoritative sim instances, and connected rendering clients.
- **PLAYER-BRAIN-AND-OVERLOAD-PLAN.md** — Links the next architecture phase to the durable persistence/control-plane layer instead of treating the sim instance as the whole backend.
- **BACKLOG.md** — Adds explicit architecture backlog entries for persistent data, control-plane/session registry, and run result write-back boundaries.

### Why
The client/server split is now real enough that the next durable question is no longer just simulation. Player persistence and session orchestration need to live outside disposable run instances.

## 2026-03-31 (Week 3 Day 2: First Persistent Control Plane Slice)

### scripts/ — Added
- **control-plane-store.js** — Adds the first durable JSON-backed persistence layer for profiles, run outcomes, and session metadata outside the disposable sim instance.
- **session-registry.js** — Adds a lightweight on-disk session-registry wrapper so live authoritative session state can be mirrored outside the hot simulation loop.

### scripts/ — Modified
- **sim-runtime.js** — The sim server now bootstraps durable profiles on join, assigns profile ids to live players, writes back authoritative death/extraction/abandon outcomes, exposes `/profile`, and mirrors session state into the control-plane/session-registry layer.

### src/ — Modified
- **profile.js** — Profiles now carry a stable id and can export/replace the active durable profile, which allows the browser client to resync local save data from the authoritative server after a remote run.
- **sim/sim-client.js** — Remote start/join now carry profile bootstrap data, and the client can fetch an authoritative profile snapshot by id.
- **main.js** — Remote run startup now bootstraps the server with the active profile, and remote death/extraction flows now resync the local profile from authoritative persistence instead of mutating local save state independently.
- **test-api.js** — Exposes profile ids so remote-authority coverage can verify durable server-side write-back honestly.

### tests/ — Modified
- **remote-authority.js** — Adds a real persistence check: remote death now proves the authoritative profile increments deaths and preserves consumed loadout state.

### docs/project/ — Modified
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The authoritative sim could already run a session, but it still had no durable memory outside the process. This slice makes the control-plane boundary real: players now join with stable profile ids, the server owns write-back on death/extraction/leave, and the browser syncs back from server truth instead of pretending local storage is still the source of record after a remote run.
## 2026-04-02 — Sim lifecycle hardening, not just sim architecture

The new control-plane + sim stack proved the right shape, but the first live fault was not theoretical. Starting the three LBH processes locally could still grind the machine because stale detached test sims survived failures, and the main sim process could remain alive doing unnecessary work even when no human clients were connected.

This slice does two things. First, the sim now drops to an idle loop when there are zero human clients instead of continuing full run progression. Second, the test harness now cleans up per-port sim/control-plane processes much more aggressively so detached remote-authority runs stop lingering as hidden CPU burners.

The next lifecycle step was explicit, and it is now landed: empty sims now auto-stop after a short grace window, `keep-alive` is opt-in instead of accidental, `sim:status` explains whether a process is idle and when it will stop, and the harness now carries a deterministic `SimLifecycle` suite so this does not quietly regress again.

# v0.2 Roadmap

## Current Phase

**v0.2 is the product foundation phase.** The game has enough architecture and content truth to stop doing broad rewrites for their own sake. The next work should make the current game more playable, legible, tunable, and shareable.

## Reviewable Slice Roadmap

The old roadmap buckets are still useful for implementation detail, but v0.2
work should now be organized around reviewable slices that Greg can play,
capture, or evaluate in a single day/night cycle. Each slice should end with
fresh harness evidence, screenshots or clips where visual timing matters, and a
short note about what changed in player-facing terms.

1. **Attract Mode + UI/VFX Identity** — title layout, corruption behavior, UI
   motion language, and the first real event-driven Three VFX layer. This is
   the current night-shift front line because it is high-impact, reviewable
   without deep playtest, and establishes how UI and Three VFX cooperate.
2. **Feel + Route Pass** — movement, slingshot readability, map routes, spawn
   safety, and the "can I intentionally move?" review. This absorbs the old
   v0.2.1 feel pass and should be judged in fresh local runs.
3. **Entity Visual Language** — player/enemy/neutral/loot silhouettes, contact
   backing, contrast, the visual-reference harness, and the pixel/low-poly
   top-down asset direction. This absorbs the old renderer-ownership visual
   pass.
4. **Loop + Meta Clarity** — results, cargo, profile/home, loadout, upgrade
   write-back, and "what did this run earn or change?" This absorbs the old
   meta-loop pass.
5. **Playable Build Targets** — local, Steam Deck desktop/gaming mode, itch
   package shape, public readme/play instructions, and release artifact truth.
6. **Process + Harness** — fresh sim/browser rules, visual fixtures, couch-test
   captures, forge-pass cadence, build-status/version checkpointing, and
   night-shift handoff discipline.

## Major Area Status

| Area | Current v0.2 State | Next | Later |
|------|--------------------|------|-------|
| Movement | Delta-v, brake, current coupling, slingshot, hull coefficients, server parity | Tune numbers through play; redesign maps for slingshot routes | Advanced anomalies and expert route tech |
| Renderer | Three default path, shared WebGL2 context, pooled primitive world layers, Composer ASCII | Run the Three entity visual-language pass; tune parallax and screen-space effects | Three-owned fluid/ASCII graph and legacy removal |
| Sim authority | Local control plane + authoritative sim + remote client; slingshot authority; host/join/leave | Keep parity tests strong while tuning movement and abilities | Hosted sessions and public multiplayer ops |
| Run loop | Map select, loot, cargo, portals, extraction/death, run results | Make run result and vault flow clear enough for playtesters | Deeper missions/factions/daily seeds |
| World content | Three map sizes, wells/stars/planetoids/wrecks/portals/signatures | Route-oriented map pass; more intentional wreck and portal placement | Procedural map generator and megastructures |
| Threats | Signal, Inhibitor, rivals/scavengers, fauna/sentry foundations, phantoms/haunts | Tune Inhibitor timing and signal readability; pick strongest ecology behaviors | Full entity catalog and richer multiplayer threat interactions |
| Hulls | Five hulls, manifests, PlayerBrain, ability state, several server ability behaviors | Playtest ability feel and cooldowns; improve HUD cues | More artifacts, exclusive builds, no-respec pilot identity |
| Progression | Profiles, vault, item tiers, rig tracks defined, partial upgrade flow | Complete upgrade purchase/write-back and balance EM economy | Milestones, unlocks, pilots, long-term chronicle |
| UI/HUD | DOM HUD, canvas screens, inventory/results, Monaspace/Oxanium typography roles, design-token bridge, shared canvas primitive kit, result-screen migration, title-attract first slice, UI visual harness, UI motion/VFX bridge, shared UI motion kit, reduced-motion title coverage, first Home instrument-console pass, and first Map Select drop-briefing pass | Continue HUD/pause/profile cleanup, richer route/objective language, Deck prompt review, and accessibility pass | Full accessibility pass, motion clips, and final primitive cleanup |
| VFX | Event-driven Three VFX plan exists; UI motion emits VFX only for approved beats, with UI retaining truth; the first bounded `VfxManager` and title glyph-fault prototype are live | Tune title VFX in clips; after the first Home/Map static pass, combine player ship silhouette/contact matte with thrust/brake VFX | Portal/pickup/Inhibitor families, instanced particles, screen-space shader impulses, lens impulses, and richer capture-quality tiers |
| Audio | Audio engine/toolkit foundations | Define final sonic palette for movement/signal/Inhibitor | Dynamic score and full mix hierarchy |
| Testing | Fast/core/authority/three lanes; visual fixtures; CDP driver; UI motion helper suite; UI visual reduced-motion capture | Add more representative playtest scripts, renderer semantic checks, and motion-clip review | Public release smoke, hosted-session CI, perf budgets per device |
| Public presence | Public overview doc exists; website/social not built | Prepare public copy, screenshots, clips, and a playable build page | Itch/Steam-style page, devlog cadence, hosted demo |

## v0.2.1 — Feel And Route Pass

Goal: make the game better to play for 20 minutes without adding new systems.

- Playtest delta-v, brake, regen, current coupling, and slingshot together.
- Tune slingshot `energyAccrualRate`, release impulse, chain multiplier, range, and hull modifiers.
- Redesign Shallows and Expanse around route chains instead of "wells everywhere."
- Make one map the canonical onboarding/tuning map.
- Improve visual/audio feedback for wave riding, slingshot engage, release, and near-well danger.
- Keep `npm run test:fast`, `npm test`, `npm run test:three`, and `npm run test:authority` green after tuning.

Definition of done:

- A human can describe why one route was better than another.
- Thrusting constantly feels possible but wasteful.
- At least one slingshot chain feels intentional, readable, and worth doing.

## v0.2.2 — Meta-Loop And Loadout Pass

Goal: make a run connect cleanly to the next run.

- Finish upgrade purchase/write-back for rig tracks.
- Clarify vault, sell, equip, load consumable, and profile state in UI.
- Make run results explain earnings, cargo loss, signal peak, Inhibitor state, rivals, and notable events.
- Decide whether chronicle/echo wrecks are v0.2 public-facing or still internal.
- Balance EM earnings, death tax, item value, and upgrade costs.

Definition of done:

- A player understands what changed after a run.
- Upgrading a hull has a visible next-run effect.
- Death hurts without erasing motivation.

## v0.2.3 — Renderer Ownership And Entity Visual Pass

Goal: make Three the place future presentation work naturally lands and replace
the current primitive bridge markers with a coherent object language.

- Build the shared Three entity style kit from
  `docs/design/THREE-ENTITY-VISUALS.md`,
  `docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`, and
  `docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md`.
- Preserve black void dominance while punching up object/UI contrast with
  brighter values, contact mattes, halos, and local backplates; keep an
  aggregate matte/bloom budget so dense frames do not erase the ASCII fabric.
- Prove contact matte + rim shell on the current primitives before replacing
  shapes.
- Run the player ship twice at the same footprint, as a sprite card and as a
  pixel-textured top-down mesh, then pick the asset path from Deck-scale
  screenshots.
- Replace primitive ship/scavenger triangles with category-stable hull shapes,
  thrust cues, signal glow, and color/halo/trail affiliation reads.
- Replace wreck squares with debris clusters, vault/echo/looted variants, and
  drift-aligned salvage glints.
- Upgrade stars, planetoids/comets, portals, and slingshot affordances as
  route-reading objects.
- Move more world entities and VFX out of canvas overlay into Three scene layers
  only when the Three equivalent has landed.
- Keep typography centralized through `src/ui/typography.js`: Oxanium for
  major headings, Monaspace for operational UI/glyphs, Noto only as fallback
  coverage.
- Add semantic render channels for signal, slingshot, current lanes, and Inhibitor presence.
- Make renderer diagnostics explain scene object counts and pass costs.
- Preserve DOM for text-heavy HUD and menus.
- Keep `?renderer=legacy` as explicit fallback only until this pass proves stable.

Definition of done:

- New visual work starts in `src/render-three/` by default.
- The game still reads as ASCII-fluid, not generic 3D.
- Renderer fixtures catch blank frames, missing layers, missing entity families,
  and accidental canvas-upload regressions.
- Deck-native screenshots prove category readability without labels.

## v0.2.3b — UI Visual Pass

Goal: bring menus, HUD, and run overlays up to the same readability and role
palette as the Three entity pass.

- Use `docs/design/UI-VISUAL-SYSTEM.md`,
  `docs/reference/UI-MOODBOARD.md`, and
  `docs/project/UI-VISUAL-PASS-PLAN.md` as the current UI art-direction source.
- Build on the shipped shared canvas UI primitives for panels, brackets,
  selected rows, command buttons, segmented gauges, and warnings.
- Continue migrating profile, in-match HUD, and pause surfaces against the
  generated target concepts. Results, title-attract, Home/main menu, and the
  first pre-match/drop-briefing slice are already on the new path.
- Keep letter spacing at zero and reserve microtext for texture, not decisions.
- Keep UI motion readable without VFX. Title identity, launch, extraction,
  collapse, portal transitions, and Inhibitor-owned UI faults may emit
  renderer-neutral VFX accents; normal prompts, timers, fuel, cargo, and
  controller hints stay clean.
- Composition and token brightening must land on a screen before more motion
  polish is added to it. The first Home and Map Select static slices are live;
  next UI drift points are HUD, pause, profile destructive states, and richer
  route/objective language.
- Use the shipped `npm run test:ui` lane for UI states, Deck-scale judgment,
  couch-test proxy review, and reduced-motion title coverage. Use
  `tests/ui-motion.cjs` for cheap helper-level timing coverage.

Definition of done:

- The current screen, selected action, danger state, and next input read from
  desk, Steam Deck, and couch distances.
- DOM and canvas UI share the same role palette.
- UI visual tests catch weak selected actions, warnings, and critical values.

## v0.2.3c — Event-Driven Three VFX Pass

Goal: make the flat top-down Three scene feel alive through bounded,
renderer-neutral VFX without moving gameplay truth into particles or shaders.

- Use `docs/project/THREE-VFX-PASS-PLAN.md` as the source of truth.
- Shipped first slice: `VfxManager`, bounded particles, quality tiers, VFX
  stats, expiry/leak coverage, `screenVfxGroup`, and the `titleGlyphFault`
  prototype from measured canvas title-glyph positions.
- Review and tune the title VFX motion from short clips; still captures only
  prove layer presence and contrast.
- Follow with a combined player ship slice: silhouette/contact matte plus
  thrust/brake VFX, because the player read and movement VFX target the same
  object and the same couch-scale gap.
- Portal/extraction, pickup glints, and Inhibitor event faults follow after the
  player ship slice.
- Capture short clips for timing review; use still/UI harness captures for
  readability.

Definition of done:

- `vfx.enabled=false` does not change gameplay or break UI comprehension.
- VFX counts return to baseline after idle title/menu/result states.
- Default quality is Deck-friendly; rich/capture quality is opt-in.
- The first clips show motion value that cannot be judged from still frames.

## v0.2.4 — Private Playtest Build

Goal: create a shareable build for trusted testers.

- Refresh build health and weekly playable artifacts.
- Produce web and desktop builds with clear start instructions.
- Write a short controls and objective primer.
- Capture screenshots and a short gameplay clip.
- Confirm local authority launch and sandbox/debug launch are named clearly.

Definition of done:

- A tester can start the game without knowing the repo.
- The build does not promise public multiplayer.
- Feedback can be gathered around movement, readability, and loop clarity.

## v0.3 Candidate

v0.3 should be the first broader public-facing milestone only after:

- movement and slingshot are fun enough to play without objectives;
- one full run loop is understandable;
- meta progression has a reason to continue;
- renderer identity is stable;
- the public website/itch page can show real gameplay footage honestly.

Likely v0.3 themes:

- public demo packaging;
- hosted/private multiplayer decision;
- procedural map generation or authored route campaign;
- richer audio/Inhibitor identity;
- public devlog cadence.

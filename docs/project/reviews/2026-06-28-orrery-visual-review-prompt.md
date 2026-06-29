# 2026-06-28 - Orrery Visual Review Prompt

> Audience: Orrery.
> Requester: Forge/Codex, on Greg's behalf.
> Goal: cross-section design review of the new v0.2 visual/UI/VFX work before the
> next implementation slice.

@Orrery, please run a broad visual-direction review for Last Singularity v0.2.
This is not a line-level code review and not a generic vibes pass. The ask is:
look across the new visual stack we have just built or designed, identify where
the design holds together, where it is fighting itself, and what should be
integrated into the roadmap or implementation plan next.

## Context

We have had several days of concentrated visual work:

- Three is now the primary renderer direction.
- The game remains top-down and mostly flat in camera, but the scene is now
  treated as a layered 3D stage with parallax, screen-space effects, explicit
  entity layers, and post-processing.
- The black void and ASCII fabric remain the identity anchor.
- Non-fluid entities are being pushed toward higher-fidelity 2D pixel assets or
  low-complexity/pixel-textured top-down 3D objects.
- We added a visual-reference/test scene for object readability and future
  harness checks.
- Title screen work moved toward a left-aligned attract-mode composition.
- The title wordmark now stays mostly clean and uses Inhibitor-pink glyph fault
  overlays as intermittent corruption, not a permanently corrupted base color.
- UI visual direction now has a high-contrast, couch-test-oriented system doc.
- Oxanium and Monaspace are the current typography direction.
- The first shared canvas UI primitives and shared UI motion layer exist.
- A first Three VFX manager/prototype exists for title glyph-fault events.
- Forge just ran a code-shape pass and fixed small drift around UI motion disable
  semantics, focus pulse rendering, and helper/test/docs alignment.

Greg wants the next work to be reviewable and coherent, not another pile of
cool isolated effects.

## Read First

Please read these in this order:

1. `docs/project/reviews/2026-06-28-forge-pass-ui-vfx-architecture.md`
2. `docs/project/reviews/2026-06-28-forge-pass-ui-motion-code-review.md`
3. `docs/design/UI-VISUAL-SYSTEM.md`
4. `docs/project/UI-VISUAL-PASS-PLAN.md`
5. `docs/project/THREE-VFX-PASS-PLAN.md`
6. `docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`
7. `docs/design/THREE-ENTITY-VISUALS.md`
8. `docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md`
9. `docs/v0.2/ROADMAP.md`
10. `docs/project/ROADMAP.md`
11. Latest entries in `docs/journal/CHANGELOG.md`

Optional but useful:

- `docs/reference/UI-MOODBOARD.md`
- `docs/reference/THREE-ENTITY-MOODBOARD.md`
- `docs/design/PILLARS.md`
- `docs/design/TEST-HARNESS.md`
- UI capture manifest:
  `tests/screenshots/ui-visual-2026-06-28T233408293Z/manifest.json`

If those ignored screenshot artifacts are not present in your environment, base
the review on the docs and ask Forge to rerun `npm run test:ui` or
`npm run test:visual` for fresh still evidence.

## Review Lenses

### 1. Visual Identity

Does the current direction still read as Last Singularity rather than generic
neon space UI?

Check the balance between:

- black void dominance;
- ASCII fluid as the gameplay ocean;
- brighter entity/UI contrast;
- Evangelion/Marathon-inspired operational UI;
- Octopath-like staged depth without copying depth-of-field-heavy fantasy;
- pixel/low-poly top-down asset direction;
- Inhibitor-pink corruption as anomaly, not the whole brand.

Please call out any place where the project is becoming too busy, too generic,
too muted, too UI-heavy, or too detached from the ASCII-fluid product pillar.

### 2. Scene Stack

Review the back-to-front scene hierarchy:

- void;
- far stars/depth field;
- ASCII fluid fabric;
- semantic lanes/signal/slingshot/current reads;
- world entities;
- screen/near-camera VFX;
- HUD and menus;
- final display shell/CRT treatment.

Does the layer model make sense for play, screenshots, Steam Deck, and social
clips? Are any layers in the wrong conceptual place? Which post-processing
effects should sit below UI, above world, or at the very end?

### 3. Entity Visual Language

We want strong silhouettes and category reads:

- player ship;
- rival/enemy ships;
- neutral fauna/sentries;
- stars;
- planetoids/comets;
- wrecks/salvage clusters;
- portals/extraction apertures;
- Inhibitors;
- wells/fabric hazards.

Review the current plan for pixel sprites versus low-poly/pixel-textured
top-down meshes. Do we have a good rule for when something should be a sprite,
a mesh, a glyph/fabric phenomenon, or a VFX event? Are category/affiliation/value
states too overloaded between color, halo, trail, matte, icon, and motion?

Please be especially sharp about Deck/couch readability: broad category first,
subtype second, flavor last.

### 4. UI System

Review the UI visual system and first implementation slices:

- high-contrast palette;
- role-color semantics;
- couch-test size rules;
- local backing/mattes over dense fabric;
- title screen layout;
- profile/home/map/pause/results composition;
- run-result readability;
- Deck button-prompt expectations;
- Oxanium/Monaspace/Noto font split;
- UI motion layer in `src/ui/motion.js`;
- reduced-motion rule: static readable state, not blank state.

The current live code is still partly old immediate-mode canvas UI. The question
is not "is every screen finished?" It is "does the direction and sequence make
sense, and what should be migrated next?"

### 5. Motion And VFX Boundary

Review the separation we are using:

- UI motion owns focus, screen state, panel reveal, type-on text, selected rows,
  prompts, results cadence, and reduced-motion fallbacks.
- Three VFX owns spatial/event accent: title glyph faults, launch/extraction,
  portal collapse, pickup glints, Inhibitor faults, thrust/brake, and other
  world or screen-space effects.
- Gameplay truth remains sim/client state, never particles.
- VFX should flow through renderer-neutral events so future native/Godot/Metal
  targets can implement the contract later.

Does this boundary still feel right? Where should we deliberately cross it, if
anywhere? What VFX slice should come next after title glyph faults?

### 6. Harness And Reviewability

Review whether the current test/visual harness gives useful evidence:

- `npm run test:ui`;
- `npm run test:ui-motion`;
- `npm run test:visual`;
- renderer fixtures including `visualReference`, `shipBakeoff`, title variants,
  and title VFX/heavy VFX fixtures;
- couch-proxy images;
- future short clips/GIFs for motion timing.

Should the visual-reference scene become a stronger CI/readability gate? Which
checks are useful versus false precision? What should remain human review only?

## Specific Questions

Please answer these directly:

1. Is the left-aligned title screen now the right default direction, or should
   another composition still be considered?
2. Is the title corruption overlay in the right conceptual lane, or should it
   become more VFX/particle-driven before we tune intensity?
3. Which entity family should receive the next real visual implementation pass:
   player/rival ships, wrecks/salvage, portals, stars/comets, or fauna/sentries?
4. Which UI surface should be migrated next after results/title motion: home,
   map select, in-match HUD, profile select, pause, or meta/chronicle?
5. Should motion/VFX next focus on title/attract, ship movement, portal/extract,
   pickup reward, or Inhibitor dread?
6. Is the current palette too narrow, too wide, too neon, or well-scoped?
7. Are our couch/Deck rules strong enough, or do we need harder minimum sizes,
   backing, and prompt rules?
8. What is the smallest next slice that would create the most visible product
   improvement without destabilizing movement readability?

## Output Shape Requested

Please structure your response like this:

1. **Verdict** - one clear paragraph on whether the direction holds.
2. **Keep** - the strongest decisions that should not be reopened lightly.
3. **Change Now** - concrete low/medium-risk adjustments Forge can integrate.
4. **Defer** - appealing ideas that should wait.
5. **Cut Or Avoid** - directions that would dilute LBH or threaten readability.
6. **Next Slice Recommendation** - one recommended reviewable implementation
   slice with acceptance criteria.
7. **Roadmap/Doc Updates** - specific docs or roadmap rows that should change.
8. **Questions For Greg** - only the decisions that genuinely need taste or
   product direction.

Please be opinionated. If two docs disagree, say which one should win. If a
planned visual feature is tasteful but wrong for the current build, say so.
If a feature is technically cheap but product-expensive, flag it.

Forge will review your feedback, integrate the useful pieces into docs/code if
they are low risk, and hand Greg a concise summary of what changed.

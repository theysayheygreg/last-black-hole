# 2026-07-04 — Entity Visual Hybrid Review (Orrery)

> Audience: Greg + Forge/Codex.
> Scope: the v0.3 open decision "entity rendering through ASCII or codified
> hybrid," per `docs/project/prompts/2026-07-04-fable-entity-visual-hybrid-review.md`.
> Builds on the 2026-06-28 visual review and the 2026-07-04 deep review (S4.x);
> does not re-litigate their verdicts.
> Code ground truth: `src/render-three/three-renderer.js`, `visual-style.js`,
> `render-plan.js`, `material-registry.js`. (The packet's optional paths
> `src/three/entity-visuals.js` and `src/three-renderer.js` do not exist —
> everything lives under `src/render-three/`.)

---

## 1. The Decision: Codify the Hybrid

**Recommendation: commit to the hybrid now.** Crisp pixel-resolved entities sit
above the ASCII fabric as a codified two-plane language — fabric plane is the
ASCII ocean, instrument plane is small crisp marks riding on it. Stop treating
this as an open bakeoff.

The deep review (S4.2) and OPEN-DECISIONS #1 both said "Run It Twice at Deck
scale." I'm going further, for three reasons the bakeoff can't change:

1. **The arithmetic forecloses ASCII-through for ship-sized objects.** The
   ASCII cell is ~8×12 px. The player hull is a 9-px-wide pixel mask
   (`visual-style.js` ship textures). Routed through ASCII quantization, the
   entire ship resolves to roughly 2–4 glyphs. The design contract — "readable
   in one frame at Steam Deck scale, no labels" — cannot be met by 2–4 glyphs
   carrying category, facing, and state. This isn't taste; it's sampling.
2. **Greg's style rule already decided it.** "2D pixel assets or simple 3D with
   pixelated top-down textures" is a hybrid statement. You cannot hand-author a
   pixel sprite and then re-quantize it through the ASCII pass without
   destroying the authored pixels. The rule and ASCII-through are mutually
   exclusive; the rule wins.
3. **Four weeks of work has been tuning the hybrid.** Matte/rim/halo stack,
   matte-coverage diagnostics, the luminance readability gate, the shipBakeoff
   fixture — the entire entity-readability apparatus assumes crisp marks over
   fabric. The 06-30 captures look good *because* of it.

This does not weaken Art Is Product — it sharpens it. The identity is not
"everything is glyphs." It is **a vast, legible ASCII ocean with tiny craft
riding on it**. Caves of Qud's world is tiles and its creatures are sprites;
nobody mistakes it for a generic RPG. The fabric owns ~90% of the frame, all
terrain truth, and both apex threats. The entities stay tiny. That's the
identity, codified.

**Demote the bakeoff, don't delete it.** Produce the ASCII-through capture set
once, cheap, as a *confirmation artifact* for the decision log — not as a gate
blocking the next slice. If it shockingly wins at Deck scale, we revisit; it
won't, for reason 1.

### Conditions (the hybrid is only right with these)

- **One tonality.** Kill the entity layer's private post dialect. The copy
  shader applies its own `entityGain`/`entityGamma` (up to 1.38/0.82 at rich)
  plus separate scanlines/vignette (`three-renderer.js` qualitySettings).
  That's what makes entities read as pasted-on vector art instead of objects in
  the same world. Set gain/gamma to unity and let the composer grade own tone,
  or drive both planes from one shared parameter set.
- **Fix the declaration.** `render-plan.js` still declares entity layers
  `capturePolicy: 'canonical-through-ascii'` while the pipeline composites them
  *after* the ASCII pass. The declaration must match the shipped truth — update
  it to name the hybrid explicitly. A contract that lies is worse than none.
- **Every crisp entity owes the fabric something.** The anti-sticker rule: an
  object above ~ship footprint must have a fluid signature — wake, drift
  disturbance, density bite, or shadow on the ocean. This is the fourth read
  from THREE-ENTITY-VISUALS and it's what keeps hybrid objects *in* the ocean
  rather than *on* it. Cheap version: the sim already injects wakes for ship
  and planetoids; make sure the visual pass never removes those couplings.
- **Matte budget enforced as pass/fail** (Section 5), not just reported.

### Category exceptions — where the line sits

Rule of thumb: **if the sim treats it as terrain or field, it renders through
the fabric; if the player must target, avoid, or collect it, it renders crisp
above.**

| Renders through/as fabric | Renders crisp above |
|---|---|
| Wells (settled) | Player, remote pilots, rivals, scavengers |
| Inhibitor corruption (settled — screen-wrongness, never an icon) | Wrecks, vaults, debris |
| Wave rings, currents, semantic lanes | Portals (aperture object; sink stays fabric) |
| Star corona *wash* and pushes (fabric emboss layer) | Star core + type silhouette |
| Comet tail's fabric bite | Comet/planetoid body |
| Ambient fauna (drift jellies, signal blooms) — mostly fabric-expressed, minimal crisp pulse | Sentries and future hunters (active threats) |
| Echo wrecks / chronicle afterimages — ghost as fabric phenomenon | Slingshot lane/tether affordances (semantic, low-opacity) |

The two judgment calls in that table are **ambient fauna** and **echo wrecks**.
Both are atmosphere-first, not target-first, and both gain dread from living
*in* the ocean. That's also the cheapest possible answer for them: density
splats and glyph-row behavior instead of new asset families. Flagged as a Greg
decision in Section 7.

---

## 2. Silhouette Language (Question 2)

Shape grammar before any color. Four rules generate the whole table:

- **A nose means a pilot.** Only piloted things get directional wedges.
- **Radial symmetry means a place.** Rings, discs, coronas — route anchors.
- **A cluster means matter.** Broken multiplicity, no facing — salvage.
- **Asymmetry means wrong.** Geometry that shouldn't exist — anomaly only.

Ranked by silhouette budget (cleanest read goes to the most important object):

1. **Player** — clean forward wedge, stable nose, least visual noise on screen.
2. **Rival/threat** — sharper, segmented, aggressive wedge; reads as pursuit.
3. **Portal** — aperture: ring with a dark interior, unmistakably a *hole*.
4. **Wreck/loot** — shard cluster, 3–8 fragments, deliberately no nose.
5. **Route bodies** (star/planetoid/comet) — radial core + type-specific corona
   or tail; never wedge-shaped.
6. **Ecology** — soft, breathing, round; motion signature does the work.
7. **Anomaly** — never granted a stable silhouette at all. Wrongness is the
   silhouette.

Hull subtypes (Drifter/Breacher/Resonant/Shroud/Hauler) do **not** get five
competing tiny silhouettes — proportions, ports, and trail accents inside the
one ship shape. The docs already say this; it holds. Don't spend outline
entropy on affiliation the color/halo system carries better.

## 3. Visual Hierarchy Table (deliverable)

| Category | Silhouette | Color family | Matte/backing | Motion | VFX | State accent |
|---|---|---|---|---|---|---|
| Player | clean wedge, stable nose | bone-white core, cyan rim | heavy compact matte (strongest in scene) + rim + halo | locked to sim; slight roll on accel/brake | thrust ports, brake sparks, short velocity ribbon | signal-zone glow on hull rim |
| Remote pilot | same wedge family | blue-white | matte + rim | as player | cooler thrust trail | hull-type port accents |
| Rival / AI threat | segmented aggressive wedge | warning red | matte + hot rim | pursuit lean, bob | hotter/longer trail, signal sparks | hunting vs idle = trail heat + pulse |
| Scavenger drone | smaller blunt utilitarian wedge | desaturated red/rust (value-separated from rival, not hue-only) | light matte + rim | jittery, opportunistic | brief loot-grab flick | fleeing = trail cut |
| Wreck / salvage | shard cluster, no facing | cool gray plates, **amber** glints | broad footprint matte (heavy) | slow drift-aligned lean | sparse pickup glints; collection burst | looted = glints off, rim desaturates |
| Vault | compact hard core in cluster | gray + gold-white | heavy matte | near-still | rare gold pulse | opened = pulse stops |
| Portal | layered aperture, dark throat | **cyan/route** | halo + dark inner well | rotating instability ticks | rim sparks, inward pull on extraction, collapse wink | blocked = sealed violet-edged lid; final = wider, slower, brighter |
| Star | emissive core + type corona | warm gold family (type-varied: amber giant, blue-white dwarf, cyan neutron needle) | glow, minimal matte (fabric wash allowed) | slow flare tick rotation | sparse corona flecks | consumption = trailing relic pulse |
| Planetoid / comet | shaded round body, rim light | ice blue / stone | light matte | velocity-true travel | tail opposite velocity (fabric bite) | slingshot-anchor = faint lane band |
| Ecology (ambient) | soft disc/bloom, breathing | green/cyan pulse | *fabric-coupled*, minimal crisp core | coast with current, pulse | slow shimmer only | agitated = pulse rate up |
| Sentry (active) | segmented patrol form | hard green | matte + rim (currently missing — additive-only, fails busy fabric) | directional lunges | lunge streak | alert = brightness + lunge cadence |
| Anomaly / Inhibitor | wrong geometry, no stable form | **magenta/violet — exclusive** | fabric corruption, unstable halo | impossible motion | screen faults, glyph leakage | form advance = rare fault burst |

Read order stays: silhouette → color/halo/trail → labels last, and labels never
gameplay-critical.

---

## 4. Backing Stack Minimum (Question 3)

The current two-layer matte (soft outer 0.28 + core 0.54/0.68,
`_addContrastBacking`) plus core plus optional rim/halo is the right stack.
Codify it as:

- **Universal minimum (every crisp entity):** contact matte + core silhouette +
  state accent. Three pieces, no exceptions — including fauna/sentries, which
  currently ship additive-only at 0.76–0.88 opacity and vanish in busy fabric
  (deep review S4.9 — confirmed still true in `visual-style.js`).
- **Active entities add:** rim shell.
- **Halo is earned, not default:** player, portals, pickup-ready wrecks,
  hunting rivals, final-run hazards. Nothing else. Halo creep is how the frame
  goes neon.
- **Rejected from the stack:** local blur (costs a pass, smears the fabric we're
  trying to preserve, and reads as DOF — which the moodboard already bans) and
  depth shadow (a directional shadow implies a sun the top-down void doesn't
  have; the matte *is* the shadow). Glow lives in the halo layer, never as a
  wider bloom threshold.

## 5. Occlusion And The Fabric Budget (Question 4)

Who may suppress fabric: **player, portals, wrecks, rivals** — the four things
the contrast-budget table already marks critical. Everything else gets the
light matte and lives with the ocean's noise.

How it's capped — make the existing diagnostic a gate:

- `entitySeparation.estimatedCoverage` is already computed per frame. Propose a
  **hard ceiling of 0.15** (15% of frame area in matte) on the busy gameplay
  fixture at normal zoom, asserted pass/fail in the renderer lane. Tune the
  number after one measurement pass, but pick a number now — an unenforced
  budget is a wish.
- **Density decay:** when N mattes overlap a local neighborhood, scale
  radius/opacity down (the docs call for it; nothing implements it). Simple
  version: bucket matte centers into a coarse grid during `_syncWorldScene`,
  scale each matte by `1/sqrt(bucketCount)`.
- **Mattes soften, never cut.** Keep max core opacity at the current 0.68. No
  100%-opaque backplates in the world layer — those belong to HUD.
- One flag: the wreck matte at `matteRadius: 3.6` (screen mode) is the single
  biggest coverage spender in the scene. It's compensating for a square marker
  that has no footprint. When debris clusters land (real footprint), shrink the
  wreck matte to ~2.0 and let geometry do the work.

## 6. What The Reference Scene Must Prove (Question 5) — Harness Plan

Two fixture variants, same entity layout: **calm fabric** (exists) and
**warmed/busy fabric** (missing — today's luminance gate only runs on the
deliberately calmed `visualReference`, so the exact condition that drowned the
06-26 captures is never tested). Plus one **Deck-native lane**: 1280×800,
labels off, `renderQuality=default` (after the S4.5 one-line launcher fix —
Deck currently boots `rich`, so any Deck judgment made before that fix is
judging the wrong chain).

Pass/fail checks, all automatable except the last:

| Check | Gate | Fixture |
|---|---|---|
| Core-vs-fabric contrast | entity core ROI mean luminance vs surrounding fabric annulus: delta ≥ 25% for critical four (player/portal/wreck/rival), ≥ 15% others | calm AND warmed |
| Hue independence | same delta check on a desaturated capture — shape+value must carry player, rival, portal without color | warmed |
| No black-on-black | every entity core ROI above a luminance floor; no `undefined`/invisible markers | all |
| Matte budget | `estimatedCoverage` ≤ 0.15; matteCount within family expectations | warmed (dense layout) |
| State pairs | measurable delta between: looted vs pickup-ready wreck; blocked vs open portal; alert vs patrol sentry; hunting vs idle rival | calm |
| Palette roles | portal ROI hue in cyan band; no magenta pixels outside Inhibitor-tagged regions (a real regression net for palette discipline) | all |
| Perf | draw calls + frame ms within default-tier budget on the dense layout | warmed, Deck-native |
| Category card (human) | reviewer names all 7 categories from the desaturated Deck-native capture at arm's length, no labels | Deck lane, per art change |

The human check stays human — the harness proves mechanics, taste stays manual.
That split is already this repo's doctrine; keep it.

## 7. VFX Instead Of Mesh Detail (Question 6)

Motion is the cheapest identity channel and the one that survives 8 px. Mesh
detail budget stays near zero; these five carry the load, in order:

1. **Thrust/brake** — the standing combined "player ship" slice (06-28 review).
   Emit from *delivered* thrust once S1.8's plumbing exposes it, so an
   empty-tank ship doesn't show ghost flames.
2. **Portal aperture** — rotating instability ticks + extraction inward pull +
   collapse wink. Portal decay must read without a timer label.
3. **Wreck pickup** — sparse amber glints (ready) → collection burst → dim.
   The whole loot state machine in three VFX beats, zero text.
4. **Rival danger** — trail heat + signal sparks scale with hunt state. The AI
   state is already in the snapshot and already dropped on the floor (S4.3.5);
   this is wiring.
5. **Inhibitor** — stays screen-space faults and glyph leakage, rare and
   event-keyed. Never particles-as-monster.

Fauna identity is a motion signature (pulse cadence, coast, lunge), not a
sprite. Do not author creature detail before behaviors are chosen — the pass
plan already says so; it still holds.

## 8. Palette Rules (Question 7) — including one live bug

The role palette is right and doesn't need widening. Changes:

- **Portals → cyan/route family.** Already recommended twice (deep review
  S4.7, OPEN-DECISIONS #6). New finding while grounding this review: **the code
  has the polarity inverted.** `visual-style.js:138-141` — the *normal* portal
  is magenta (`0xff6de2`/`0xff36c8`, a near-neighbor of the Inhibitor's
  `#FF3EB5`) while the *rift* portal is cyan (`0x9dfcff`). So today the
  ordinary escape hatch wears the threat color and the anomaly-adjacent rift
  wears the route color — backwards on both ends, and `material-registry.js`
  even files portals under `anomalyMagenta`. Swap: normal portals cyan; rift
  keeps a distinct treatment (brighter, wider, slower ticks) inside the route
  family; **violet/magenta appears on a portal only when Inhibitor-blocked** —
  which is exactly when the threat read is true.
- **Salvage = amber only for value.** Glints and vault pulses, not the whole
  wreck body (bodies stay cool gray so the glint pops). Stars stay warm gold by
  type; the "stars must not collapse into salvage-orange dots" acceptance is
  the regression to watch — separate them by *shape and glow structure*
  (corona vs glint), not hue distance alone.
- **Scavenger vs rival red:** at 8 px they currently differ mostly by hue.
  Value-separate them (scavenger desaturated/rust, rival saturated hot) and
  give scavengers the blunter silhouette. Red stays the danger family; the
  *intensity* of red becomes the urgency dial.
- **Green stays ecology/sentry only** — resist letting it become a generic
  "OK" UI color.
- **Magenta discipline: hold the line.** No new magenta users. The pass/fail
  palette check in Section 6 makes this enforceable instead of aspirational.
- **Retire the well bullseyes.** Every gameplay well still draws additive red
  hazard rings + red core disc in product frames (`three-renderer.js:767-773`,
  suppressed only on title). Wells are fabric terrain — the docs say so, the
  code contradicts them. Move behind the debug overlay pass (S4.4). This is
  the cheapest single improvement to palette discipline in the game.

## 9. First Implementation Slice (deliverable)

**Slice name: "Codify the hybrid."** One reviewable slice, ~4 moves, ordered by
visible-improvement-per-effort. Moves 1–3 change every gameplay frame and are
each small; move 4 is the standing biggest-read fix.

1. **Unify tonality + fix the declaration.** entityGain/entityGamma → 1.0,
   drop the entity layer's private scanline/vignette, update `render-plan.js`
   capture policy to name the hybrid. Screenshot before/after.
2. **Well debug rings behind the debug pass.** Wells return to being fabric.
3. **Portal palette swap + blocked/sealed state.** Cyan route portals, violet
   only when Inhibitor-blocked, rift distinct-within-family. Recolor is a
   materials change; the sealed state is the one new visual.
4. **Player ship:** run the shipBakeoff captures at Deck-native scale (after
   the `renderQuality=default` launcher fix), pick sprite-card vs pixel-mesh,
   ship the chosen hull with thrust/brake VFX as the one combined slice both
   prior reviews already agreed on.
5. **Harness in the same slice:** warmed-fabric fixture variant + Deck-native
   capture lane + the coverage ceiling and palette gates from Section 6 — so
   the slice that codifies the language also installs its regression net.

Second slice (not now): wreck debris clusters + matte shrink. Third: stars/
comets/slingshot route reading. Ecology last, after behaviors are chosen —
unchanged from the pass plan's ordering, which was right.

Explicitly *not* in the first slice: instancing (Section 10 — needed before
VFX scale-up, not before this), fauna assets, megastructures, any text-in-Three.

## 10. Performance Risks And Batching Guidance (deliverable)

Risks, ranked:

1. **Draw-call multiplication.** Every readable entity is up to 5 non-instanced
   meshes (soft matte, core matte, halo, core, rim). Dense 10×10 frames reach
   150–250+ entity draws (deep review S7.4). Fine today; will not survive the
   wreck-cluster slice (3–8 fragments each, each currently implying its own
   stack) or per-frame thrust VFX.
2. **VFX material churn.** `VfxManager` pools retain one material per particle
   mesh. Fine for title embers; thrust/brake at 60 Hz needs instanced
   points/sprites first.
3. **Deck runs the wrong chain.** `rich` boots on Deck (S4.5). Every Deck perf
   or readability judgment before that one-line fix is invalid. Fix first,
   measure second.
4. **Unfalsifiable budgets.** `render-plan.js` declares per-pass ms budgets;
   only whole-backend time is measured, and `lastThreeStats` floors
   calls/triangles with `Math.max(...)` so an empty scene reports healthy
   (`three-renderer.js:907-908`). Remove the floors, add per-pass timing
   (S4.8), then the Section 6 perf gate means something.

Guidance:

- **Batching key = material-registry family.** One `InstancedMesh` per
  family: all mattes share a unit-disc geometry with per-instance transform +
  opacity (mattes are the highest-count layer — instance them first); halos and
  rims next; cores per category family. The S4.1 registry-binding work defines
  exactly these keys — do instancing as its consumer, not as a separate system.
- **One atlas for pixel assets.** All ship/wreck/fauna pixel textures in a
  single NearestFilter atlas → one material, UV offsets per instance. Decide
  the atlas before authoring assets, not after (retrofit means re-cutting every
  sprite).
- **Wreck clusters are one instanced draw**, not 3–8 readable-entity stacks:
  one footprint matte + N instanced shards + one glint emitter per cluster.
- **Trails and tails**: pooled line strips / instanced quads, never per-frame
  geometry allocation. Comet tails are the tempting violation; resist.
- **Sequencing:** instancing lands *between* this slice and the VFX/wreck
  slices — after the style kit proves the look with pooled meshes, before
  counts multiply. Matches the VFX plan's "Option A first, Option B when draw
  calls climb" rule; the climb is now scheduled, so plan the step.

## 11. Conflicts Between Prior Docs And Code (named, not smoothed)

1. **Declaration vs pipeline:** `render-plan.js` says entities are
   `canonical-through-ascii`; the shipped compositor draws them after ASCII
   with their own post dialect. This memo resolves it toward the hybrid — but
   the file must change, whichever way Greg calls it.
2. **Portal color, three ways:** OPEN-DECISIONS/UI-VISUAL-SYSTEM say portals
   belong in cyan/route; `material-registry.js` files them under
   `anomalyMagenta`; the code ships normal-magenta/rift-cyan — the exact
   inversion of the recommendation. Nobody has noticed the rift is already
   cyan; the swap is half-done by accident.
3. **Wells fabric-first vs red bullseyes:** THREE-ENTITY-VISUALS says wells
   need no object icons; the renderer stamps hazard rings + red cores on every
   well in product frames.
4. **Matte-per-footprint vs matte-per-icon:** the hierarchy doc says wreck
   backing covers the entity footprint; the code approximates footprint with a
   3.6× matte on a point icon. Resolves itself when debris clusters land —
   but the matte must shrink in the same commit or coverage doubles.
5. **Packet paths vs repo:** the prompt's `src/three/*` paths don't exist;
   future packets should point at `src/render-three/`.

## 12. Open Decisions For Greg (before asset production)

Ranked by how much downstream art they gate:

1. **Ratify the hybrid** (Section 1). This is the identity call; everything
   below assumes yes. My recommendation is unambiguous, but it's a
   pillar-adjacent boundary — yours to set.
2. **Ship asset path:** sprite-card vs pixel-textured mesh, decided from the
   Deck-native bakeoff captures in the first slice. Also: who authors the
   pixel art (hand-authored vs generated-then-curated) — this sets the atlas
   pipeline for every family that follows.
3. **Portal palette swap** (OPEN-DECISIONS #6, sharpened here): cyan route
   portals, violet only when blocked, rift distinct-within-cyan. One line to
   approve; touches store-page-visible identity.
4. **Ambient fauna: fabric-coupled or crisp?** My rec: fabric-coupled (Section
   1 table). Cheaper, spookier, and keeps the ecology *of* the ocean. Crisp
   sentries either way. This halves the creature-asset count, so it gates the
   asset plan.
5. **Matte coverage ceiling:** I propose 0.15. Ratify or adjust after the
   first measurement pass — but a number must exist before dense-map art tuning.
6. **Hull-subtype art depth now vs later:** how much per-hull silhouette
   variation before hull ability tuning settles (Resonant's kit is still
   fiction per S1.3). My rec: one shared hull now, ports/trail accents only;
   subtype proportions after the hull roster is honest.
7. **Star lighting:** emissive/rim materials only (my rec — the top-down
   camera can't cash a real lighting rig) vs true directional lighting on
   pixel-textured meshes. Decides whether the style kit needs lights at all.

---

*The gears here already mesh more than the docs admit: the separation stack is
built, the diagnostics exist, the bakeoff fixture is wired, and half the portal
recolor happened by accident. What's missing is the decision that names the
machine. Codify the hybrid, unify the tonality, and the rest is production, not
direction.*

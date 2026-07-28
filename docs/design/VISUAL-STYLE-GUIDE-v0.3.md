# Visual Style Guide v0.3

Status: implementation contract for the v0.3 Ballpark line.

This guide converts the concept studies in `LBH Vis 0.3`, the current Three/UI
contracts, and `assets/visual` into production rules. The concept images are
directional references, not screenshots of promised systems. Existing design,
content, and authoritative-sim contracts win whenever a concept invents a
weapon, resource, objective, or world state.

## North Star

Last Singularity is a modern instrument view into a dying, fluid universe. The
ASCII fabric is the world medium and movement read, not a filter laid over
ordinary space art. Pixel-authored entities puncture that fabric with compact,
high-contrast silhouettes. UI forms crisp local instruments around decisions
without veiling the playfield.

The visual priority order is:

1. Read flow and commit to movement.
2. Identify the player, hazards, routes, and interactables.
3. Understand the current decision and its consequence.
4. Feel scale, decay, and dread.
5. Enjoy detail that does not interfere with the first four reads.

## The Failing Instrument

The shared product metaphor is **the failing instrument**. This guide is its visual rendering: a failing astronomical instrument observing a fluid universe. The ASCII fabric is the living measurement surface and route-reading tool; pixel entities are compact physical evidence caught in it; the UI is a stable, sparse bezel around decisions.

**Read order:**

1. Flow direction, open travel line, well danger, and usable route.
2. Player, immediate hostile threat, portal/anchor, and actionable salvage.
3. Current command and consequence through the edge HUD.
4. Dread, scale, debris detail, and display failure.

A later read never wins by harming an earlier one. Fabric is the medium; sprites are evidence, not a second full-field texture. Category owns silhouette; state owns at most one persistent accent plus one short event-driven motion cue. Ordinary entities do not stack permanent halo, rim, trail, label, ring, and sparkle treatments.

**Family grammar:** player cores are bone/blue-white with cyan instrumentation; Drifter/Breacher differ through silhouette and ports, not resting amber. Remote ships use a cooler outline/notch plus a quiet trail. Hostiles use hooked/segmented silhouettes and localized red heat. Intact wrecks carry one amber value glint; looted wrecks lose it; clusters privilege broken mass. Star = radial corona, planetoid = dense body, comet = body plus velocity-opposed tail, extraction = stable cyan aperture, rift = broken discontinuity; apertures remain black at center. Fauna are soft asymmetric current-led pulses; sentries are segmented directional scan/lunge forms. They never share a base asset. Magenta is primary only for Inhibitor/corruption/anomaly.

## Authority Boundary

- The sim owns position, velocity, collision, death, pickup, extraction,
  signal, abilities, inventory, and all state transitions.
- Render plans and snapshots provide presentation facts. Three objects, sprite
  frames, UI animation, particles, and post effects never infer or advance
  gameplay outcomes.
- Visual anticipation may lead an event only when the authoritative protocol
  exposes a stable telegraph or countdown.
- Interpolation may smooth known state. It must not manufacture a successful
  pickup, hit, escape, ability activation, or route.
- Pause is a local presentation overlay, not a server pause. The remote world
  continues underneath it while authority, network, snapshot, and covered-event
  intake remain live; no automatic unpause is implied.
- All coordinate conversion goes through `src/coords.js`.

## Scene Stack

Build the playable frame back to front. Each layer has one job and a stable
Three group or explicit composite stage.

| Layer | Contents | Contrast and motion rule |
|---|---|---|
| 0. Void | Near-black clear, edge falloff | Own at least half the perceived frame; never fill it with decorative haze. |
| 1. Far field | Sparse stars, distant flecks, ancient marks | Low contrast, slow parallax, no gameplay coding. |
| 2. Deep structure | Large scars, grids, dim orbital traces | Below fabric contrast; atmosphere only. |
| 3. ASCII fabric | Directional glyph field, fluid density and velocity | Primary medium-value motion layer and movement evidence. |
| 4. Fabric shadow | Well cores, lensing pockets, local dark mattes | Creates separation without erasing nearby flow. |
| 5. Semantic lanes | Flow lanes, signal influence, route previews | Draw only from authoritative or approved preview data; thinner and dimmer than entities. |
| 6. World anchors | Wells, stars, portals, large wreck clusters | Strong category silhouette; effects remain subordinate to the player read. |
| 7. Dynamic entities | Player, rivals, scavengers, fauna, debris | Pixel-authored silhouette, contact matte, restrained rim and state accent. |
| 8. Affordances | Slingshot line, pickup reach, target cue | Appear only when actionable or selected; never permanent decoration. |
| 9. Immediate VFX | Thrust, brake, pickup glint, release, portal sparks | Pooled, brief, event-explanatory, and unable to hide the initiating entity. |
| 10. World post | Grade, restrained bloom, vignette, CRT treatment | Preserve glyph edges and category colors; no heavy depth of field. |
| 11. HUD/UI | DOM/canvas operational layer | Cleaner and more stable than the world; local backing over motion. |

The ASCII fabric remains visible through most of the frame. Entity mattes may
quiet a small footprint; full-screen dimmers are reserved for pause or a true
mode transition.

## Palette

Use color by semantic role, not by screen or component.

| Role | Core | Supporting use |
|---|---|---|
| Void | `#000021` | Clear, panel core, negative space. |
| Panel backing | `rgba(0, 4, 18, 0.72)` | Raise toward 0.88 only over dense moving fabric. |
| Fabric / flow | `#008080` | Normal spacetime fabric and low-priority current structure. |
| Route / technology | `#00E2FF`, `#9DFCFF` | Navigation, extraction, selected neutral controls, player instruments. |
| Value / energy | `#FFD966`, `#FFF2CC` | Salvage, rewards, stars, high-value item emphasis. |
| Danger / hostile | warm red | Immediate damage, hostile ships, destructive actions, failed outcomes. |
| Signal / Inhibitor | `#FF3EB5`, `#B84CFF` | Anomaly pressure, corruption, Inhibitor state. |
| Ecology | `#38F58A` with cyan-white core | Non-hostile living systems; shift to danger only when behavior becomes hostile. |
| Neutral / wreck | bone white and cool gray | Hull structure, debris, secondary text. |

Rules:

- A normal screen uses void, neutral, and at most two active role colors.
- White is the peak value for the player, critical text, hot well cores, and
  tiny specular accents. Large white areas flatten the hierarchy.
- Amber means value or stellar energy, never generic selection. Use “gold” only
  when describing source pixels, not as the semantic role name.
- Magenta means anomaly/Inhibitor influence, never generic rarity alone.
- Red is immediate danger or destructive intent. Do not use it for routine
  signal status when magenta carries that role.
- Never rely on hue alone. Pair role color with silhouette, icon, label,
  position, or pattern.

## Contrast, Backing, And Shadow

Critical text and values target 7:1 against their local backing. Operational
text targets 4.5:1. Large decorative marks may be dimmer only when they carry
no decision.

Every gameplay entity uses a small separation system:

1. A dark contact matte suppresses fabric noise beneath the core silhouette.
2. A one-pixel or equivalent rim preserves the category edge.
3. A restrained halo communicates energy or state, not object mass.
4. A short trail communicates motion direction when useful.

Contact mattes should remain within roughly 1.25 times the silhouette footprint.
Halos may be larger for stars and portals but must leave nearby fabric legible.
Shadows are hard, local, and graphic; avoid soft cinematic drop shadows. Text
over the world receives a dark backing pocket or a compact two-step shadow, not
unbounded glow.

## Silhouette Grammar

At gameplay scale and in monochrome, categories must still separate:

- Player: forward-pointing, open center or bright spine, clean bilateral read.
- Rival/scavenger: more aggressive swept or hooked profile; hostile state adds
  red edge/trail, not a wholly red blob.
- Wreck: broken, asymmetric, clustered mass with no clean thrust axis.
- Route anchor: radial or orbital symmetry around a stable center.
- Portal: open aperture with an unmistakable empty center.
- Fauna: organic asymmetry and periodic motion, never a ship-like arrowhead.
- Inhibitor: anti-fluid hard geometry, discontinuity, or impossible symmetry.
- Pickup/item: compact icon or glint; never mistaken for a ship or star.

No category may depend on a floating label for its first read. Labels are
secondary confirmation and may disappear at distance.

## Sprite And Entity Rules

`assets/visual/entities` is the v0.3 top-down pixel vocabulary. Use it as source
art, not as permission to paste unlit billboards into the scene.

- Preserve nearest-neighbor sampling and integer-authored edges.
- Keep source aspect ratio. Do not non-uniformly stretch sprites.
- Orient world sprites from authoritative heading or velocity semantics.
- Use sprite cards or pixel-textured meshes. Select the cheaper option that
  passes the same Deck-scale silhouette and motion tests.
- Apply light through rim, emissive ports, contact matte, and small effects;
  do not blur or repaint the pixel silhouette with continuous gradients.
- Remote players share the player category but require a distinct outline,
  marker, or trail. Color alone is insufficient.
- State variants may change emissive accents and small overlays. They must not
  mutate the base silhouette so severely that identity flickers frame to frame.
- Pool dynamic meshes, materials, trails, and particles. No per-frame texture,
  geometry, material, gradient, or sprite allocation.

World scale stays restrained. Ships are small against the universe. When an
entity is hard to read, improve its local contrast and silhouette before making
it dramatically larger.

## Deck World-Entity Scale

`src/render-three/entity-presentation-scale.js` is the one presentation-scale
owner for the Three world. Its values are pixel half-radii on the 1280x720
render backing used by the 1280x800 Deck capture. The resolver applies a
screen-space minimum and a bounded distance factor (`0.88..1.0`). It never
writes, rescales, or substitutes an authority collision, gravity, Noise, or
interaction radius. Labels remain secondary and are not part of the minimum.

| Family / subtype | Deck min / base / max px radius | Presentation owner | Authority or interaction truth |
|---|---:|---|---|
| Rift portal | 29 / 33 / 42 | `portal-rift` sprite | Capture radius: `1.8 x 0.08` |
| Standard portal | 24 / 27 / 34 | `portal-extraction` sprite | Capture radius: `0.08` (`unstable`: half) |
| Valuable large wreck | 25 / 30 / 38 | `wreck-valuable` sprite | Pickup radius: `0.08` |
| Large/intact wreck | 22 / 26 / 34 | `wreck-intact` sprite | Pickup radius: `0.08` |
| Player Breacher | 21 / 24 / 30 | `ship-breacher` sprite | Ballpark body fallback: `0.035` |
| Player Drifter / remote ship | 19 / 22 / 28; 16 / 18 / 24 | authored ship sprite | Sim-owned body and heading |
| Scavenger Breacher / Drifter / Raider | 19 / 22 / 28; 16 / 19 / 24; 17 / 20 / 26 | subtype sprite | Bump radius: `0.04` |
| Sentry / fauna | 16 / 19 / 24; 13 / 15 / 20 | threat / organic sprite | Ecology state is authoritative |
| Star | 20 / 23 / 28 | `star-warm` sprite plus fabric rays | Star range: `0.6` max range |
| Planetoid / comet | 16 / 18 / 24; 18 / 20 / 26 | body / transit sprite | Ship push radius: `0.1` |
| Glitch / Swarm / Vessel | 18 / 21 / 27; 23 / 27 / 34; 29 / 35 / 44 | authored anomaly sprite | Core/contact/outer radii: `.045` / `.09` / `.18` |
| Well / fabric | fabric-owned, no sprite minimum | ASCII contour and fluid core | Kill/gravity radii remain sim-owned (`.04` baseline) |

The intended hierarchy is **major landmarks > objectives and large wrecks >
ships and enemies > pickups and debris**. Wreck state and enemy subtype own
silhouette, not a label or color swap. The Deck product retires generic
entity discs, rings, triangles, squares, wireframes, and debug circles as
finished art. A contact matte is allowed only as local separation beneath a
named sprite. Fabric wells, named slingshot/portal state accents, the Vessel
target tell, and explicit raw-scene diagnostics remain the documented semantic
exceptions. Old canvas/vector fallbacks stay behind the legacy renderer gate;
they are not Deck presentation ownership and must not be duplicated over Three.

## Separation And Density Budget

This policy supersedes only the older documents' entity-overlay implications;
`VISUAL-DENSITY.md` still owns the accumulated fluid-density buffer and its
no-negative-splats rule.

- Contact mattes are hard/local and normally no larger than 1.25× the core.
  Player and portal retain minimum separation.
- In local clusters, decay low-priority matte radius/opacity before core value.
  Wreck clusters and ambient ecology yield first; decoration never erases route
  fabric.
- Rims preserve edges; halos communicate energy/state, not mass; trails are
  short, directional, pooled, and settle when authoritative state ends.
- Report aggregate/local-peak matte coverage plus family totals, halo/rim, and
  state-accent counts. Set thresholds from representative 1280×800 scenes per
  quality tier, never from unmeasured taste.
- Quality reduction may remove secondary halo/trail density but preserves
  category silhouette, player/portal separation, black apertures, and
  reduced-motion static equivalents.

## Item Taxonomy

The asset kit has two linked levels:

- `assets/visual/item-families`: mechanical vocabulary such as thrust, drag,
  coupling, signal, cargo, pulse, gravity, sensor, plating, phase, and burn.
- `assets/visual/items`: one deterministic icon for each catalog item.

An item tile is assembled from four independent signals:

1. Family icon communicates what system the item changes.
2. Stable identity mark distinguishes siblings in the same family.
3. Tier rail communicates T1 through T4 without replacing the family color.
4. Affinity or exclusivity tag communicates hull relationship in text/icon form.

Consumables use the same icon grammar but add a single-use corner notch or
charge mark. Currency, generic salvage, cargo items, equipped artifacts, and
consumables must not share one undifferentiated diamond symbol.

Do not recolor a complete icon solely by rarity. Tier must remain legible in
grayscale and to color-vision-deficient players. Never infer item effects from
filename or art; bind icons through `assets/visual/manifest.json` and catalog
IDs.

## Item Signal Priority

At Deck scale: **family silhouette → tier rail → selected/equipped/consumable
state → optional hashed identity mark**. The mark is removable when it muddies
the 25% proxy and is never a required mechanical signal. Tier/state remain
independent from family imagery and readable in grayscale. Magenta is reserved
for anomaly-related families or a documented mechanical-family exception.

## UI Frame Anatomy

UI is an operational frame, not a pile of boxes. A major panel may contain:

1. Corner or rail frame from `assets/visual/ui`.
2. Translucent blue-black local backing.
3. Short eyebrow or system label.
4. One primary value, decision, or outcome.
5. Supporting rows separated by thin rails or junctions.
6. A role-colored state edge for selection, warning, or reward.
7. Input prompt in a stable footer or command zone.

Use full panels for genuine groups, not every datum. Nested cards are forbidden.
Inside a panel, use rails, whitespace, dividers, and alignment. Corners and
terminal nodes are punctuation; do not decorate every edge.

Selection requires at least three cues: position/focus, increased value or
backing, and a frame/marker change. Destructive selection uses the danger role
only after focus reaches that action.

## UI Frame Deployment

A full generated frame belongs only to a major decision group. Subsections use
a rail, divider, junction, or whitespace. Warning corners are genuine danger or
confirmation only, never generic selected state. Selection uses exactly three
complementary cues: focus position, stronger backing/value, and one marker/frame
change. Icon-only status has text/pattern alternatives; keyboard/gamepad focus
shows the same state without motion.

## Typography And Couch Test

- Oxanium is the display face for title-scale identity.
- Monaspace is the primary interface, label, number, and ASCII-adjacent voice.
- Noto Sans Mono / Symbols supplies missing math, box-drawing, and corruption
  glyphs.
- All runtime stacks come from `src/ui/typography.js`.
- Use uppercase for short headings, outcomes, warnings, and compact commands.
  Use sentence case for explanations and longer body copy.
- Numbers align tabularly. Units and labels remain visually subordinate.
- Microtext is texture only; it cannot carry a required decision or state.
- Do not simulate corruption by replacing required words with unreadable text.
- Deck/controller prompts use the accepted graphical glyph family at Deck scale;
  raw keyboard fallback copy is not part of the Deck contract.

Every major surface gets a 25 percent couch proxy and a Steam Deck capture. At
that scale a reviewer must identify the screen, selected action, primary status
or outcome, danger state, and next input within two seconds. If not, reduce
noise, enlarge the critical read, or strengthen local backing before adding
more labels.

## Screen Compositions

### Title

The warmed ASCII well is the hero. The Last Singularity wordmark is the largest
read, with one clear first action and a restrained status strip. Keep command
options in one aligned region. Atmosphere may move behind the title; required
copy stays clean.

### Home / Hangar

Use three zones: stable navigation rail, selected system workspace, and concise
profile/resources ledger. The ship or selected object may occupy the workspace
over fabric. Do not reproduce concept-only categories such as weapons. Live
tabs and inventory contracts determine the labels.

### Pre-Match / Map Select

The map is primary. Destination list, selected-sector facts, route/risk legend,
loadout summary, and launch action form the supporting edge instruments. Route
lines and world marks must use the same semantic palette as gameplay. The
preview never claims more precision than authoritative seed/map data provides.

### In-Match

Keep the center and intended travel direction clear. Fuel/hull/signal/cargo,
exits, and active ability live at edges in compact backed clusters. A minimap
is optional, not assumed. Warnings occupy a local side or upper pocket except
for a brief life-critical center beat.

### Pause

Cover the command hierarchy immediately with one command panel and a modest
scene dim, preserving enough world context to confirm the covered run. The
remote authority world continues; the overlay must communicate `WORLD
CONTINUES`, not a frozen server. Entry neutralizes held and edge inputs once.
Covered presentation coalesces to the latest authority truth. Short resume is
ordinary follow; at `1500ms` or longer, resume settles camera, fluid, and
presentation and clears stale UI motion. Terminal, phase, and run changes route
directly from authority truth, with cached terminal events scoped to the exact
run. Local debug/sandbox freeze is a separate presentation mode. Resume is the
default; destructive abandon is separated and confirmed.

### Results

Lead with the authoritative outcome: extracted, dead, or other shipped result.
Then show cause/consequence, cargo accounting, earnings/profile delta, and next
actions. A dim run tableau may remain behind the report. Never invent a cause
from visual proximity; display the sim-provided result and event record.

## Performance And Accessibility

- Target 60 fps on mid-range desktop and the Steam Deck profile.
- Keep text measurement, panel paths, gradients, and shadows cached where
  practical. Static menus should not rebuild expensive paint resources each
  frame.
- Cap particles, trails, bloom sources, and simultaneous high-value accents.
- Keep CRT scanlines and chromatic slip below the threshold where one-pixel
  glyphs or small text become unstable.
- Support reduced motion, high-contrast local backing, remappable prompts, and
  text alternatives for icon-only status.
- Reduced motion keeps pause, recovery, terminal, and resume copy settled and
  readable; it removes displacement and decorative timing, not state.
- Preserve information under common color-vision simulations and grayscale.
- Do not encode danger through flashing alone. Avoid rapid full-frame flashes.

## Anti-Patterns

- Generic starfield plus ordinary spaceship art with ASCII applied afterward.
- Full-screen fog, blur, or tint used to fix local readability.
- Huge ships or effects that erase the universe's scale.
- Bloom that closes portal apertures or fills the player silhouette.
- Continuous labels, rings, and trails on every object.
- Magenta as generic neon decoration or gold as generic focus.
- Renderer-side prediction of pickup, collision, death, extraction, or signal.
- Concept-only resources and objectives presented as shipped truth.
- Dense nested cards, ornamental corners on every row, or unreadable microcopy.
- Motion, flicker, or color as the sole carrier of required information.

## Required Review Conditions

Review material visual changes at 1280×800 handheld scale and 1280×720 compact
UI coverage; inspect grayscale, bright-light conditions, a 25% couch proxy,
normal motion, and reduced motion. Capture paths and labels are governed by
`docs/v0.3/evidence/visual-review-manifest.md`; fixtures are never
player-reachable proof.

## Acceptance

A v0.3 visual slice is accepted only when all applicable statements are true:

- ASCII fabric remains the dominant movement surface in representative play.
- Player, hostile ship, wreck, anchor, portal, fauna, and Inhibitor separate by
  silhouette at Deck scale and in grayscale.
- Critical entities retain a readable core over both quiet and dense fabric.
- Palette roles match this guide and no screen introduces an untracked role.
- HUD leaves the center and travel line clear during ordinary play.
- Major screens pass the two-second couch read at 25 percent scale.
- Text contrast meets 7:1 critical and 4.5:1 operational targets locally.
- Item family, identity, tier, and affinity remain independently legible.
- Reduced-motion presentation communicates every required state.
- Renderer fixtures prove visual states using snapshot/event truth, without
  importing gameplay authority into presentation code.
- Representative desktop and Deck captures show no overlap, clipping, illegible
  prompt, unstable glyph edge, or category-color collision.
- The relevant visual, UI, renderer, and performance test lanes pass, followed
  by a real play/readability review.

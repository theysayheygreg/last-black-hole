# Palette World-Art Guide — DRAFT

**Status:** department draft, 2026-08-04. This is a production guide for world art, not a claim of current visual acceptance. **Greg ratifies every substantive amendment** to this guide.

**Scope:** inside the playable world frame: fluid fabric, wells, world sprites/cards, Three materials, world glyphs, local world VFX, and promo/title-world staging. HUD, wordmark, CTA, menus, and player-facing instructional copy remain Mosaic territory.

## 1. World read: the non-negotiable hierarchy

Last Singularity is a failing astronomical instrument looking into a dying fluid universe. The ASCII fabric is the route-reading medium; pixel-resolved entities are physical evidence caught in that medium; the void makes both legible.

1. **Flow and route first.** A viewer must find an open travel line, direction, and well danger before admiring texture.
2. **Actionable category second.** Player, immediate threat, portal/anchor, and salvage separate without labels.
3. **State third.** One persistent state accent plus one brief event cue is the normal maximum.
4. **Dread/detail last.** Texture, parallax, bloom, and CRT only earn their place after the first three reads hold.

The void owns at least half of perceived frame mass. Fabric owns movement evidence, not decorative coverage. A later read never wins by compromising an earlier one.

## 2. Scene and density grammar

| Back-to-front role | World-art rule |
|---|---|
| Void / far marks | Near-black field, sparse low-contrast stars and ancient marks; no gameplay coding. |
| Deep structure | Dim scars, grids, orbital traces: atmosphere only, below fabric value. |
| ASCII fabric | Broad, world-anchored lanes with broken downstream marks. A lane is roughly 4–5 visible ship widths; strength changes mark length/speed, not lane count. |
| Fabric shadow | Well core, lensing pocket, and local contact matte. Quiet a small footprint; do not erase the field. |
| Anchors / entities | Pixel-surface cards or pixel-textured top-down meshes with category silhouette, rim, restrained accent, and role-bound motion. |
| Immediate VFX / post | Pooled, source-bound, brief, and explanatory. Bloom/CRT preserve glyph edges, aperture black, and category colors. |

**Density rule:** calm space is necessary. Recover glyph variety and luminance rhythm only inside a lane envelope or well neighborhood; never restore a full-frame hash carpet. In clusters, decay low-priority matte coverage first (ambient ecology, wreck debris), never the player core, portal aperture, or category silhouette.

**Accumulated density buffer:** it is cosmetic-only, additive-only, 256×256 RGB float, double-buffered, with intentional fade persistence. It may boost a well’s analytical ring but does not create it. Do not add negative splats, use splats to cut entity-shaped holes, or use RGB channels as system tags. A darkness requirement belongs in an analytical shader path or a future isolated buffer.

## 3. Sprite/card production grammar

### Surface and scale

- Use hand-authored pixel sprites/sheets, pixel masks, or simple top-down meshes with pixel-authored/pixelated surfaces. Nearest filtering; no automatic smoothing or unproven mip blur.
- Snap card scale to stable pixel multiples when practical. Preserve source aspect ratio. Drive orientation only from published heading/velocity facts.
- Improve silhouette and local separation before enlarging an unreadable entity. World scale hierarchy is: major landmarks > objectives/large wrecks > ships/enemies > pickups/debris.
- Pool cards, materials, trails, and particles. No per-frame asset/material/geometry allocation.

### Local separation stack

1. **Contact matte:** hard, transparent local patch beneath the core; normally ≤1.25× core footprint.
2. **Core silhouette:** readable in a single Deck-scale frame and in grayscale.
3. **Rim shell:** thin pixel-equivalent edge; preserves category against fabric highlights.
4. **Halo/backplate:** only for critical affordances or energy/state; never a substitute for a core.
5. **Motion trail:** short, velocity/state-specific, pooled, and settled when the published state ends.
6. **State accent:** a small role-colored tick, port, spark, or desaturation—not a new base identity each frame.

### Family anchors

| Family | Must read as | Allowed state/motion grammar | Do not do |
|---|---|---|---|
| Player/friend | clean forward hull; bilateral nose/spine | bone/blue-white core, cyan instruments, thrust/brake ports | full halo/ring/trail stack; generic triangle |
| Rival/threat | hooked, swept, or segmented directional form | localized red heat/trail | red blob that loses hull read |
| Wreck/salvage | broken asymmetric clustered mass, no thrust axis | one amber glint if intact; looted loses glint; drift lean when published | rotated square or live-ship silhouette |
| Star/route anchor | radial corona around stable center | warm/cold type corona, restrained flare ticks | magenta star treatment |
| Portal/rift | open black aperture | outer unstable ring, inner funnel/ticks; blocked is sealed not absent | bloom that fills center |
| Comet/planetoid | dense body, not arrow | velocity-opposed ice tail; orbital lane/history tick | perpetual full-length ribbon |
| Fauna/sentry | fauna organic/asymmetric; sentry segmented/directional | pulse/coast vs scan/lunge | one shared base asset |
| Inhibitor/anomaly | wrong geometry, hard discontinuity | rare magenta/violet corruption and unstable edge | decorative generic magenta neon |

## 4. Shader and material rules

- The fabric is sovereign: wells, currents, pressure, and corruption remain terrain. Renderer objects consume presentation facts; they never infer pickup, collision, death, extraction, AI, or signal truth.
- Flow lanes are broad, sparse, and anchored to accepted current. Broken marks move downstream. Their bend/compression/split/rejoin near wells exposes pull and orbital handedness without radial arrows, repeated contour rings, or a binary capture zone.
- A well is a threatening place: a dark body wins; fabric separates around it; a compact rim is secondary. The accepted visual direction includes an asymmetric directional hot plume, not a broad symmetric halo.
- A source-bound wave deforms/bunches existing lanes. It has one sparse crest, source compression/brightening, fast recovery, and no sonar ring, filled trailing zone, or intersection-node lattice.
- Keep parallax subtle and role-bound. No heavy depth of field. Post may stage depth, glow, and CRT but must keep one-pixel glyph edges stable.
- Quality reduction removes secondary halo/trail density before category silhouette, player/portal separation, black apertures, or reduced-motion static equivalents.

## 5. Palette rules

| Semantic role | Canonical family | Use | Guardrail |
|---|---|---|---|
| Void | `#000021` / blue-black | negative space, deep backing | remains dominant |
| Fabric | `#008080` teal with restrained blue-violet lane pressure | movement medium | no all-frame cyan carpet |
| Route / technology | `#00E2FF`, `#9DFCFF` | player instruments, extraction, chosen route | reserve cyan for route/exfil distinction |
| Value / stellar energy | `#FFD966`, `#FFF2CC` | salvage, stars, hot well highlights | amber means value/stellar energy, never generic selection |
| Danger | warm red | immediate damage, hostile intent | localized; never generic status |
| Ecology | `#38F58A` + cyan-white core | living systems | does not replace danger red |
| Inhibitor / anomaly | `#FF3EB5`, `#B84CFF` | corruption, invasive anomaly | rare; never generic rarity/decor |
| Neutral wreck | bone white / cool gray | hull structure, debris | retain value hierarchy |

A normal world frame is void + neutral + no more than two active semantic roles. White is peak value: player-critical edge, tiny specular accent, or hot well core—not a large fill. Color never stands alone; pair it with silhouette, motion, pattern, or position.

## 6. Glyph set and texture rules

The glyph field has a restricted expressive set, selected for directional rhythm and legibility rather than random “terminal noise.”

| Job | Preferred marks | Rule |
|---|---|---|
| Quiet fabric / rest | `·  ˙  -  =` | sparse and low-value; never claims force direction alone |
| Downstream lane grain | `-  =  /  ╱  ›` | orient/advance with accepted current; density stays inside lane envelope |
| Compressed well neighborhood | `0  ‡  =  /  #` | increased variety/luminance rhythm, then reduced fine grain at lethal core |
| Corruption | `╳  ⟐  ╲  ▣` | local, irregular, magenta-led, source-bound |
| World accent glyphs | `✦  ◇  ⊹` | rare glint/anchor punctuation, not substitute entity icons |

Glyphs communicate material/motion. They do not replace a required interaction icon, redraw every field sample, or become full-screen static. Preserve a stable fallback set for reduced motion: state remains visible when mark travel and shimmer are removed.

## 7. Asset landing, binding, and provenance

**Landing rule:** use the existing destination for the asset class; do not create a second ad-hoc art tree. Source art vocabulary is `assets/visual/entities`; manifest binding is `assets/visual/manifest.json`; renderer consumers remain under the existing Three/render asset path. Proposed new landing zones require Maestro registration before production.

Every binary/world-art package ships with a sibling manifest entry containing:

```yaml
asset_id: entity.portal.extraction.v01
kind: sprite-sheet | texture | shader | glyph-set | concept-reference
source: hand-authored | generated | derived
source_tool_or_backend: <tool/version or authoring app>
inputs_or_prompt: <path or concise immutable input reference>
dimensions_format_color: "128x128 PNG RGBA sRGB"
intended_use: "Three portal extraction card"
rights_provenance: "project-authored | licensed reference only | generated; review required"
binding_owner: "Palette / named integration owner"
binding_status: "awaiting Greg review/tuning | approved — binding dispatched | binding in progress | integrated | deferred: reason"
verified_at: "YYYY-MM-DDTHH:MM:SSZ"
```

Generated and hand-authored sources must stay distinguishable. `awaiting Greg review/tuning` is active custody, not abandonment. When Greg ratifies a package, merge/land it and dispatch its named binding owner in the same motion.

## 8. Visual-fidelity rubric

This rubric is a review instrument, not a test substitute. Evaluate target-scale material at 1280×800, 1280×720 compact where relevant, grayscale, bright-light conditions, 25% couch proxy, normal motion, and reduced motion. Label evidence **fixture**, **natural journey**, or **representative flow**; fixtures never establish player-reachable claims.

| Check ID | Question / pass condition | Evidence | Verdict language |
|---|---|---|---|
| `PAL-WOR-01` | In ≤1 s, flow direction and one open travel line are visible before labels. | current still + motion | `PASS`, `TUNE — below route-read threshold`, `BLOCKED — no current frame` |
| `PAL-WOR-02` | Well reads as a dark, dangerous landmark; lanes bend/compress/split around it and a directional plume is visible without a broad halo. | approach capture | `PASS`, `REWORK — contact dot / missing plume`, `BLOCKED — well absent` |
| `PAL-WOR-03` | Player, threat, wreck, anchor, portal, fauna, and anomaly separate by silhouette at Deck scale and grayscale. | showcase + grayscale + 25% | `PASS`, `TUNE — family collision: <A>/<B>`, `REWORK — label-dependent` |
| `PAL-WOR-04` | Critical core remains visible over quiet and dense fabric; local matte is contained and fabric remains legible. | quiet/dense paired capture | `PASS`, `TUNE — separation weak`, `REWORK — matte erases fabric` |
| `PAL-WOR-05` | Semantic palette is coherent: cyan route/exfil, amber value/star, red danger, green ecology, magenta anomaly; no untracked role. | scene + grayscale notes | `PASS`, `TUNE — role collision: <roles>`, `REWORK — semantic inversion` |
| `PAL-WOR-06` | Trails, rims, halos, and sparks explain current published state without hiding the core or becoming permanent decoration. | temporal capture | `PASS`, `TUNE — accent overstack`, `REWORK — state fiction / occlusion` |
| `PAL-WOR-07` | Pixel surface remains nearest, crisp, aspect-correct, and stable under target-scale motion/post. | target-scale crop + motion | `PASS`, `TUNE — unstable edge`, `REWORK — smooth/blurred surface` |
| `PAL-WOR-08` | Portal aperture remains black/open and stateful; blocked is sealed, not absent. | state matrix | `PASS`, `REWORK — aperture closed or state ambiguous`, `BLOCKED — states unavailable` |
| `PAL-WOR-09` | Normal and reduced motion retain equivalent required state information. | paired temporal/still | `PASS`, `REWORK — motion-only meaning`, `BLOCKED — reduced-motion evidence absent` |
| `PAL-WOR-10` | Every package has landing, manifest, binding owner/status, and provenance; visual changes do not manufacture authority. | manifest + source review | `PASS`, `BLOCKED — provenance/binding missing`, `REWORK — renderer invents truth` |

**Verdict roll-up:** `PASS` means the stated visual condition is evidenced, not aesthetically ratified. `TUNE` is a bounded correction with the family/read named. `REWORK` means the grammar is broken and must be re-authored. `BLOCKED` means evidence or authoritative state is missing; it is not permission to guess. Final taste, feel, and physical Deck acceptance remain Greg’s review.

## 9. Reference and amendment protocol

Source hierarchy: current product/design contract first; accepted concept composites are composition, texture, palette-pressure, and separation anchors—not shipped-feature claims or literal silhouette specifications. The 2026-06-26 target visuals are directional, not source assets. The 2026-08-02 fabric composites are locked direction for lane/well/wave grammar. The 2026-08-04 clarity review identifies current evidence gaps and fix-forward pressure; it does not independently prove a new acceptance state.

Substantive changes to hierarchy, palette role meaning, glyph grammar, well/wave language, entity-family silhouettes, or the rubric require **Greg ratification**. Record source revision, evidence type, and decision in the amendment/asset package.

## Provenance

- `CLAUDE.md` — project constraints, v0.3 source-of-truth order, commit/testing rules.
- `docs/design/VISUAL-DENSITY.md` — additive density-buffer policy and measured budget.
- `docs/design/THREE-ENTITY-VISUALS.md` — entity hierarchy, separation stack, pixel-surface rules, family targets, and presentation boundary.
- `docs/design/VISUAL-STYLE-GUIDE-v0.3.md` — north star, scene stack, palette, scale, glyph/sprite and acceptance rules.
- `docs/reference/target-visuals/2026-06-26/{README.md,01-playable-separation-target.png,02-entity-readability-target.png,03-scene-stack-style-board.png}` — inspected directional composites; not gameplay proof.
- `docs/v0.3/reviews/2026-08-01-movement-physics-fabric-redesign.md` — Greg-approved 2026-08-02 lane/well/wave composites.
- `docs/project/reviews/2026-08-04-orrery-v03-visual-clarity-milestone-review.md` — current contrast, well-landmark, palette, and evidence pressure.
- Relevant history: `bf85b9e0`, `5cdbbb0c`, `7d9990a6`, `842090fb`, `e19d4ee0`, `47ca73ee`, `45c6c0ee`, plus concept commits `640ee6a0`, `af706e55`, `c41e38aa`.

Rendered companion: `docs/v0.3/PALETTE-WORLD-ART-GUIDE-DRAFT.html`.

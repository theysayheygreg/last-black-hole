# Open-World Density & POI Design — Research

> Research pass 2026-07-14 (Orrery, for v0.3.1 design review S24 map
> construction). Flags: [C] dev-confirmed, [R] reported/secondhand,
> [A] analysis, [I] inference. Folklore explicitly flagged — do not cite
> the debunked items as dev fact.

## Corrections / folklore ledger

- The triangle rule + "gravity" are from **CEDEC 2017** (Fujibayashi +
  Makoto Yonezu), not the GDC 2017 talk; canonical English source is
  Matt Walker's translated thread
  (gist.github.com/idbrii/e39fe96279aa1670319bfa521d907399).
- "GTA V drive times tuned to radio-song length" — **folklore, no
  primary source.**
- "Something interesting every 40 seconds in BotW" — **fan apocrypha**;
  the only dev-sourced calibration is the Kyoto travel-time overlay.

## 1. BotW density formula

- [C] **Triangle rule**, three scales: large (permanent wayfinding
  landmarks), medium (view-blockers posing over-vs-around choices and
  staging reveals), small (traversal tempo). Rectangles fully occlude;
  irregular features draw the eye and hide micro-rewards.
- [C] **Gravity**: POIs of ranked visibility/importance exert pull;
  routes emerge from competing attractions, not waypoints. The
  points-and-lines guidance prototype failed ([R] ~80% playtesters
  clustered/felt confined); redistribution by gravity model spread
  heatmap paths.
- [C] **Kyoto overlay**: felt distance calibrated by overlaying Kyoto's
  map and using known real travel times between familiar places —
  travel-time between landmarks, not literal POI placement.
- [C] **Hierarchy + counts**: 15 towers / 120 shrines / 900 Koroks
  (≈ 1 : 8 : 60). Finding a shrine is itself the reward (Aonuma: many
  small shrines over few big dungeons at open-world scale).

## 2. TotK layering

- [C] Sky pruned for legibility FROM the surface ("specks of trash" at
  true scale) — density on one layer is constrained by legibility from
  another.
- [C] Depths = inverted surface heightmap, cheap third layer with
  natural partitioning; lit-vs-unlit shows coverage [R]. (Dev framing:
  ALttP Dark World + preparation/reward — not "designed dread".)
- Lightroot↔shrine coordinate mirroring (community-verified): progress
  on one layer illuminates the other — cross-layer knowledge transfer.

## 3. GTA V / Los Santos

- [C] Compression over replication (Garbut): build the city as it
  "lives in your head."
- [C] Uniform density of *care*, not uniform POI density; deliberate
  vista composition passes.
- [A] Landmark anchors (Chiliad, Maze Bank) with distorted sightlines.
- [A] Counterweight: ring-highway efficiency + clear-air sightlines
  SHRINK perceived size (San Andreas felt bigger with less area because
  countryside was transitional space). Too-good sightlines and too-fast
  arterials collapse scale.

## 4. Assassin's Creed: the retreat from icon density

- [C] Origins killed the minimap for question marks; Odyssey's
  Exploration Mode (50%+ adoption); Valhalla's unidentified color dots.
- [C] Ubisoft named its own disease (Far Cry 5 towers/minimap removal;
  2020 editorial restructure over "same taste replicated").
- [A/C] The criticism UI fixes didn't touch: interchangeable content —
  "Less is (Still) Less" (Game Developer): hiding icons doesn't create
  meaning. **Differentiate POIs in kind or icon math eats you.**

## 5. Cross-cutting principles

- [C] **Ghost of Tsushima 30-second rule** (GDC 2021): players must SEE
  something calling to them every ≤30 s of travel; density tuned as much
  by REMOVING occluders as adding content. Taxonomy: weenies (huge
  always-visible pulls) → flags (vertical mid-range tells) → breadcrumbs
  (ground-level countdowns). Density is a visibility-per-travel-time
  budget, not POI-per-km².
- [C] Negative space is a designed element (Jim Brown, GDC 2014).
- [A] Lynchian legibility: paths/edges/districts/nodes/landmarks; from a
  dominant landmark you should see the next dominants.

## 6. Non-terrestrial / abstract spaces

- [C] **Outer Wilds** (Beachum GDC 2021): knowledge is the only
  progression; three content tiers BY KNOWLEDGE (surface mystery /
  clue-following / reachable-only-by-knowing); rumor map tracks only
  what's read. Solves landmark scarcity by shrinking the system until
  every planet is a weenie from everywhere.
- [C] **Subnautica**: no map; biomes as districts (strong visual/audio
  identity) + one scalar gradient (depth = danger/progress) do the
  navigation.
- [C] **No Man's Sky**: players reported honest orbital motion as BUGS —
  in landmark-poor space, landmarks must be stable in the player's
  frame, or their motion must be clock-like and legible.
- [C] **Manifold Garden (the toroidal case)**: 3-torus playtesters were
  constantly lost. Fixes: every area recognizable from a THUMBNAIL
  (instant silhouette identity) + consistent DIRECTIONAL ASYMMETRY so
  the right way looks different from the wrong way. Toroidal space is
  locally flat; the whole burden falls on district identity and
  asymmetric global cues.

## 7. Transfer to a 2D top-down toroidal space map (applied in S24)

1. Budget density in travel-time visibility (30-second rule at actual
   ship speed); tune perceived density via sensor/view radius (the
   occluder budget) without moving POIs.
2. No terrain → build occlusion from information: contacts resolve THAT
   before WHAT; wells make the straight line not the cheapest line (the
   over-vs-around choice is the physics).
3. Three-tier landmark hierarchy ≈ 1:8:60 — set pieces are weenies,
   anomalies are flags, wreck scatter is breadcrumbs.
4. Gravity is literally the native mechanic: mass wells do visual
   attraction and physical pull at once; heatmap playtests like
   Nintendo's.
5. Torus compensations: thumbnail-test district identity + one global
   anisotropy (a "north"); cap view distance well below wrap distance.
6. Landmarks stable in the player's frame; mobile set pieces must move
   clock-like.
7. Dense core / sparse rim with authored negative space; sparse zones
   need identity, not just fewer objects.
8. Differentiate POIs in kind; show that something exists, withhold
   what it is.
9. Knowledge tiering makes density unbounded by area — the map gets
   denser as players learn (chronicle/echoes hook).
10. Cross-layer/zoom legibility constrains density; prune from the far
    view.

## Key sources

Walker CEDEC gist; GDC 2017 "Breaking Conventions"; Nintendo "Ask the
Developer" Vol. 9; Tsushima GDC 2021 weenie taxonomy; Beachum GDC 2021
slides; Chyr on Manifold Garden (gamedeveloper.com); Garbut Edge/MCV
quotes; PCGamesN/Eurogamer/Game Developer on the AC arc; GMTK "How
Nintendo Solved Zelda's Open World"; Jim Brown GDC 2014; Radiator Blog
spatial synthesis; Clarity Potion San Andreas scale analysis.

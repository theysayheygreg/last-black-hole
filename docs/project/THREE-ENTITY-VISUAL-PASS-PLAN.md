# Three Entity Visual Pass Plan

> **v0.2 status:** Implementation plan for moving non-fluid objects from bridge
> primitives to a first-class Three visual language.

## Goal

Make the default Three renderer feel native, layered, and readable without
breaking the top-down camera or the sim/client split. Wells and Inhibitors stay
fabric-first. Ships, wrecks, stars, planetoids, comets, portals, rivals, fauna,
sentries, and future megastructures become small, staged Three objects with
shared style rules.

## Current Starting Point

`src/render-three/three-renderer.js` already has the important spine:

- a top-down orthographic camera;
- shared WebGL2 rendering with the Composer canvas;
- grouped world layers for background, fabric, semantics, entities, and
  foreground;
- a transparent Three render target composited over the ASCII frame;
- pooled primitive meshes for rings, discs, squares, and triangles.

The problem is not missing infrastructure. The problem is that most object
families still use parity primitives. The next pass should refactor before it
decorates.

## Pass 0 - Fixture And Layer Inventory

Tasks:

- add a renderer fixture mode or seeded route that puts every entity family on
  screen at once;
- extend renderer diagnostics to report counts by visual subgroup;
- capture scene/ascii/debug screenshots before changing object art;
- make the fixture use fresh browser and sim processes.

Acceptance:

- `npm run test:three` can assert the expected visual groups exist;
- a human screenshot shows player, wreck, star, comet/planetoid, portal, rival,
  threat ecology, semantic lane, and fabric at once.

## Pass 1 - Three Style Kit

Tasks:

- create a small `src/render-three/` style module for shared geometries,
  materials, render orders, and color roles;
- support both candidate pixel-asset paths: sprite/card helpers and
  pixel-textured top-down mesh helpers, with nearest-neighbor texture setup and
  allowed lighting rules;
- add subgroups for landmark entities, active entities, immediate VFX, and
  near-camera atmosphere;
- implement reusable contact matte, rim shell, trail, glint, and state spark
  helpers;
- keep projection and radius math in `src/coords.js`.

Acceptance:

- no new object family hand-builds its own one-off material stack;
- ships/threats/wrecks use 2D pixel assets or pixel-textured top-down 3D assets,
  not smooth low-poly miniatures;
- bridge primitives can be replaced family by family without changing the
  renderer's public adapter shape.

## Pass 2 - Separation On Existing Primitives

Tasks:

- put a contact matte under the existing player/AI triangles, wreck squares,
  portal rings, stars, comets, and rivals before changing their shapes;
- add a thin rim shell to the same existing active and interactable objects;
- add per-family material roles for player, rival, salvage, portal, ecology,
  star, and anomaly colors without changing gameplay truth;
- tune matte, rim, and glow values against busy ASCII screenshots;
- track aggregate matte coverage so entity crowds do not punch too many holes
  in the fabric.

Acceptance:

- objects read against the busiest ASCII field without labels;
- the frame stays mostly dark and does not become uniformly neon;
- Deck-native screenshots retain player and portal readability;
- dense frames preserve the ASCII fabric instead of becoming matte craters.

This pass proves the separation stack before the project spends art effort on
new shapes. If matte plus rim does not make current primitives readable, the
style kit is not ready.

## Pass 3 - Player Ship Asset Bake-Off

Tasks:

- author the same player footprint twice: one 2D pixel sprite card and one
  pixel-textured top-down mesh;
- use the same contact matte, rim shell, thrust/brake cues, and signal glow on
  both candidates;
- capture both at Deck-native scale in normal and busy fields;
- pick one asset path for the player/rival family before broad production.

Acceptance:

- a still screenshot keeps the player readable without labels;
- the chosen approach is better at Deck scale, not just prettier on desktop;
- a short clip shows acceleration/braking state without reading HUD numbers.

## Pass 4 - Ship And Rival Family

Tasks:

- replace player/remote/rival triangles with the chosen tiny pixel hull surface;
- define category-stable ship and threat silhouettes, with friend/foe/neutral
  distinguished by color, halo, trail heat, and state accents;
- add thrust, brake, roll/lean, and signal glow cues;
- reserve the cleanest silhouette and highest local contrast for the player;
- give AI/rival personalities small trail or hull differences without changing
  gameplay truth.

Acceptance:

- a still screenshot identifies player versus hostile versus remote;
- the same screenshot keeps ship, threat, loot, route, ecology, and anomaly
  categories distinct when viewed small or desaturated;
- a short clip shows acceleration/braking state without reading HUD numbers.

## Pass 5 - Portal Family

Tasks:

- upgrade portals with layered apertures, blocked state, instability ticks, and
  final-portal distinction;
- tune portal contact matte and aperture bloom against active fabric;
- keep the portal's sink/wave behavior as sim/fabric truth.

Acceptance:

- portal blocked/final states are visible in screenshots;
- extraction target reads before labels;
- portal glow does not wash out nearby ASCII or player silhouettes.

## Pass 6 - Wreck And Salvage Family

Tasks:

- replace wreck squares with pooled debris clusters;
- add derelict, debris field, vault, echo, and looted variants;
- align fragments and glints to drift where snapshot data provides velocity;
- keep looted wrecks visible but lower their reward accents.

Acceptance:

- salvage value reads as gold/amber glints, not text;
- looted wrecks do not look like active pickups;
- debris fields feel like physical wreckage without hiding currents.

## Pass 7 - Route Landmark Family

Tasks:

- upgrade stars with core/corona variants and type color;
- upgrade planetoids/comets with shaded bodies and cheap tails;
- upgrade slingshot affordances into lane/rail/release visuals.

Acceptance:

- route planning is possible at a glance: star, portal, comet, and slingshot
  lane each have a unique non-text read.

## Pass 8 - Ecology And Threat Family

Tasks:

- give fauna, sentries, and future threat families distinct silhouettes and
  motion trails;
- use green for ecology/sentry systems and magenta/violet only for Inhibitor or
  exotic corruption;
- delay busy creature detail until behavior is worth preserving.

Acceptance:

- ambient ecology and active threat do not share silhouettes;
- Inhibitor-adjacent visuals still feel alien because magenta stays rare.

## Pass 9 - Global Composition And Post

Tasks:

- align Composer and Three CRT/scanline/chromatic parameters;
- add optional source-driven lens flecks for stars, portals, and wells;
- keep near-camera particles sparse and speed-driven;
- avoid heavy depth of field; black void and sparse negative space make DOF read
  as blur more often than depth;
- document the future combined post stack for the eventual Three-owned graph;
- explicitly watch split-renderer failures while Composer and Three use
  separate post stacks: bloom threshold drift, cross-layer contrast drift, and
  grade/CRT mismatch.

Acceptance:

- screenshots feel like one world, not ASCII plus pasted icons;
- post-processing does not reduce HUD readability;
- performance remains inside the existing Three lane budget.

## Test Harness Updates

The daily suite should not grade taste, but it should guard contracts:

- renderer fixtures assert named layer groups and subgroup counts;
- visual lane captures nonblank `scene`, `ascii`, and `debug` modes;
- object family fixture catches black-on-black or `undefined` markers;
- perf probe tracks material/geometry count and frame budget;
- playtest lane uses fresh browser and sim processes before screenshot capture.
- Deck review captures Deck-native frames instead of relying on desktop
  downscales.

Human review then decides silhouette quality, dread, palette discipline, and
whether the object feels native to the ASCII ocean.

## Risks

- **Glow creep:** every entity gets bloom and the frame loses blackness.
  Mitigation: value budgets and rare accent rules in the visual hierarchy doc.
- **Renderer-only truth:** an object state appears in Three but not in sim.
  Mitigation: all entity visuals consume snapshots/events only.
- **Over-modeling:** tiny objects become smooth expensive miniatures.
  Mitigation: pixel sprites/cards first; pixel-textured top-down meshes only
  when they preserve the pixel read and justify the extra asset cost.
- **Fabric loss:** entity mattes erase too much ASCII.
  Mitigation: mattes are local, transparent, family-tuned, and capped by
  aggregate coverage or density-aware decay.
- **Silhouette overpromise:** tiny outlines are asked to carry category,
  affiliation, state, and hull subtype at once.
  Mitigation: silhouette owns category; color, halo, trail, motion, and state
  sparks own affiliation and urgency.
- **Premature asset-path lock:** sprite cards or top-down meshes are chosen by
  taste instead of evidence.
  Mitigation: run the player ship twice at the same footprint and compare
  Deck-native screenshots before production.
- **Test fragility:** pixel tests fail on harmless art changes.
  Mitigation: use semantic counts and broad nonblank checks; keep subjective
  art review manual.

## First Implementation Slice

Start with the player, wrecks, and portals. They cover the most important
readability needs:

1. contact matte and rim shell helper on existing primitives;
2. busy-field fixture screenshot and `npm run test:three` update;
3. player ship sprite-card versus pixel-textured-mesh bake-off at Deck scale;
4. portal aperture replacement with blocked/final states;
5. wreck debris cluster replacement.

Stars, comets, slingshot lanes, and ecology follow once the shared kit proves
itself on the most player-facing objects.

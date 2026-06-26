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
- add subgroups for landmark entities, active entities, immediate VFX, and
  near-camera atmosphere;
- implement reusable contact matte, rim shell, trail, glint, and state spark
  helpers;
- keep projection and radius math in `src/coords.js`.

Acceptance:

- no new object family hand-builds its own one-off material stack;
- bridge primitives can be replaced family by family without changing the
  renderer's public adapter shape.

## Pass 2 - Separation Before Decoration

Tasks:

- put a contact matte under the player, wrecks, portals, stars, comets, and
  rivals;
- add a thin rim shell to active and interactable objects;
- add per-family material roles for player, rival, salvage, portal, ecology,
  star, and anomaly colors;
- tune the matte/glow values against current screenshots.

Acceptance:

- objects read against the busiest ASCII field without labels;
- the frame stays mostly dark and does not become uniformly neon;
- Deck-scale screenshots retain player and portal readability.

## Pass 3 - Ship And Rival Family

Tasks:

- replace player/remote/rival triangles with tiny hull silhouettes;
- add thrust, brake, roll/lean, and signal glow cues;
- reserve the cleanest silhouette and highest local contrast for the player;
- give AI/rival personalities small trail or hull differences without changing
  gameplay truth.

Acceptance:

- a still screenshot identifies player versus hostile versus remote;
- a short clip shows acceleration/braking state without reading HUD numbers.

## Pass 4 - Wreck And Salvage Family

Tasks:

- replace wreck squares with pooled debris clusters;
- add derelict, debris field, vault, echo, and looted variants;
- align fragments and glints to drift where snapshot data provides velocity;
- keep looted wrecks visible but lower their reward accents.

Acceptance:

- salvage value reads as gold/amber glints, not text;
- looted wrecks do not look like active pickups;
- debris fields feel like physical wreckage without hiding currents.

## Pass 5 - Route Landmark Family

Tasks:

- upgrade stars with core/corona variants and type color;
- upgrade planetoids/comets with shaded bodies and cheap tails;
- upgrade portals with layered apertures, blocked state, instability ticks, and
  final-portal distinction;
- upgrade slingshot affordances into lane/rail/release visuals.

Acceptance:

- route planning is possible at a glance: star, portal, comet, and slingshot
  lane each have a unique non-text read;
- portal blocked/final states are visible in screenshots.

## Pass 6 - Ecology And Threat Family

Tasks:

- give fauna, sentries, and future threat families distinct silhouettes and
  motion trails;
- use green for ecology/sentry systems and magenta/violet only for Inhibitor or
  exotic corruption;
- delay busy creature detail until behavior is worth preserving.

Acceptance:

- ambient ecology and active threat do not share silhouettes;
- Inhibitor-adjacent visuals still feel alien because magenta stays rare.

## Pass 7 - Global Composition And Post

Tasks:

- align Composer and Three CRT/scanline/chromatic parameters;
- add optional source-driven lens flecks for stars, portals, and wells;
- keep near-camera particles sparse and speed-driven;
- document the future combined post stack for the eventual Three-owned graph.

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

Human review then decides silhouette quality, dread, palette discipline, and
whether the object feels native to the ASCII ocean.

## Risks

- **Glow creep:** every entity gets bloom and the frame loses blackness.
  Mitigation: value budgets and rare accent rules in the visual hierarchy doc.
- **Renderer-only truth:** an object state appears in Three but not in sim.
  Mitigation: all entity visuals consume snapshots/events only.
- **Over-modeling:** tiny objects become expensive miniatures.
  Mitigation: procedural silhouettes, instancing, and low fragment counts.
- **Fabric loss:** entity mattes erase too much ASCII.
  Mitigation: mattes are local, transparent, and family-tuned.
- **Test fragility:** pixel tests fail on harmless art changes.
  Mitigation: use semantic counts and broad nonblank checks; keep subjective
  art review manual.

## First Implementation Slice

Start with the player, wrecks, and portals. They cover the most important
readability needs:

1. contact matte and rim shell helper;
2. player hull replacement with thrust/brake cues;
3. wreck debris cluster replacement;
4. portal aperture replacement with blocked/final states;
5. fixture screenshot and `npm run test:three` update.

Stars, comets, slingshot lanes, and ecology follow once the shared kit proves
itself on the most player-facing objects.

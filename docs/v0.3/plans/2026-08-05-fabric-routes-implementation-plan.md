# Fabric Continuous-Routes — Grounded Implementation Plan

> Author: Orrery, 2026-08-04/05. Charter: `docs/v0.3/FABRIC-VISUAL-CHARTER.md`.
> Every claim below is grounded at HEAD `056af805` with file:line.
> Status: plan for step-through; nothing dispatches until ratified.

## Concept provenance (per the concept-reality contract, 2026-08-05)

The three panels at `/private/tmp/lbh-fabric-routes-concept/` are
**illustrative-only**: standalone canvas code, NOT derived from LBH
code or data. Their curves, envelopes, and spacing formulas are
invented; real seeded-sea routes are straight lines along train
headings with flow reversing every half-wavelength, plus concentric
circles around wells — shapes the diagrams do not show. They document
the route *grammar* (continuity, strength-varying marks, direction
chevrons, amber telegraph) and nothing about the visual style.

**Path to reality:** (1) half-step — a script that decodes a real
snapshot's `authoritativeField` (`src/authoritative-field.mjs:38-78`),
runs the actual RK2 integration, and renders those true polylines;
(2) full step — W1's in-engine spike behind its kill switch, captured
through the real ASCII/material pipeline.
**Arrival test:** the verification table below — specifically the
route-honesty node test (`directionAgrees` at every vertex against the
real field) and the on-screen continuity chain-scan. "Looks like the
diagram" is NOT an acceptance criterion anywhere in this plan.

## Why routes break today (the root cause, located)

The lane system is an analytic stripe lattice: lane centers are
`floor(across/1.50 + 0.5) * 1.50` — a fixed 1.5-world-unit periodic
stripe family perpendicular to the **local** flow direction
(`src/render/shaders/fluid.glsl.js:471-479`). When flow direction
changes across the screen, the lattice re-phases and marks break. No
tuning of contrast/density can make this continuous — the geometry has
no notion of "the same current, further along."

## The data is already on the wire (nobody uses it)

Verified against the live sim on :8787:

- `snapshot.session.seededSea.trains` — full parametric swell trains
  (heading, wavelength, speed, amplitude, influence, live phase;
  re-advanced every tick at `scripts/sim-runtime.cjs:6983`). The client
  receives this **and never reads it** (`grep seededSea src/**` → one
  unrelated hit).
- `snapshot.world.wells[i]` — position, orbitalDir, fabricSignature
  multipliers. Well current is exactly concentric circles at plateau
  speed (`src/physics.js:180-198`, `scripts/coarse-flow-field.cjs:86-108`).
- `snapshot.world.authoritativeField` — the composite 20×20 (Shallows)
  … 56×56 (Deep Field) current grid, already decoded client-side by
  `sampleAuthoritativeCurrent` (`src/authoritative-field.mjs:38-78`) —
  **the same data the shader samples as `u_coarse`** (texture unit 3,
  `src/fluid.js:460-462`).

Honesty consequence: parametric sources give *seed geometry*; the
composite field is the only honest carry truth (sources sum + renorm).
Routes therefore = **CPU streamlines integrated over
`sampleAuthoritativeCurrent`**, seeded from the parametric sources.
They match what the shader shows because both sample the same grid.

## Work items

### W1 — Route ribbon layer (charter: continuous routes)

**New `src/render/route-ribbons.js`** (pure module, no GL):
- Seeds: per well within current reach, 2–3 orbit radii
  (`broadOrbitalCurrentSpeed` importable client-side — already imported
  by `src/sim/flow-field.js:6`); per swell train, lines along `heading`
  through the highest-|v| cells of its influence.
- Integrator: RK2 over `sampleAuthoritativeCurrent`, toroidal wrap,
  fixed step ≈ cellSize/2, terminate on |v| < floor or closure.
- Output: polylines `[{x, y, mag}]` with per-vertex field magnitude.
- Rebuild: only when `authoritativeField.tick` advances (grid is ≤3136
  cells; integration cost trivial).

**New `src/render/passes/route-ribbon-pass.js`** (composer `Pass`,
`src/render/composer.js:105-121` contract):
- Inserted in `fullChain` between `fluid-display` and `bloom`
  (`src/main.js:1053-1063`) → **inherits ASCII glyph substitution for
  free** (ascii pass quantizes whatever luminance precedes it,
  `src/render/shaders/ascii.glsl.js:56-121`). No `FRAG_DISPLAY` edits,
  no uniform-budget impact (381/1024 stays), no string-contract breaks.
- Draws polylines as arc-length-parameterized dash marks: duty-cycled
  phase animated downstream (same grammar as `markPhase`,
  `fluid.glsl.js:525`), mark length/brightness ∝ per-vertex magnitude,
  sparse direction chevrons every N world units.
- `frameContext.routeRibbon = {polylines, camera…}` namespace per the
  existing pass convention (`src/main.js:4929-4972`).
- Kill switch: pass declared `kind:'post'`-style disableable for A/B
  (`?disable=route-ribbon`).
- Existing stripe-lattice channel system **stays on** initially; its
  level vs ribbons is a tuning decision, not this plan's.

### W2 — Direction & strength readability (charter: direction vs calm)

Inside W1's pass: chevron pitch, mark duty cycle, and brightness ramp
are the direction/strength channels. All three exposed as named
tunables with units and steps (per the tunables doctrine) in
`src/content/fabric.data.json` under a new `routeRibbon` block.

### W3 — Honesty core (charter: intensity ∝ carry)

Two real defects found, one optional plumb:
1. **`laneStrength` is worldScale-dependent** — saturates at
   `|current|·worldScale/1.98` (`fluid.glsl.js:369-370`), so the same
   physical current reads differently on 5/15/25 maps. Fix: normalize
   by a named `strengthReference` (units: world-units/s) in
   fabric.data.json, used by BOTH the display shader and the ribbon
   pass — one truth.
2. **Magnitude carries only 1.32× of channel brightness**
   (`mix(0.76,1.0,laneStrength)`, `fluid.glsl.js:511`) while existence
   is binary above a floor. Widen the magnitude band as a tunable;
   keep the locked existence rule ("strength changes emphasis, not
   existence" — `tests/fabric-display-contract.cjs:92-94`).
3. *(Optional, gated on movement clarity)*: displayed intensity is
   pre-cap; per-hull carry saturation is invisible.
   `capFabricCurrent` already returns `{cap, capped}` — discarded at
   `scripts/sim-runtime.cjs:4883`. Minimal plumb into the player
   projection + a ship-local "carry saturated" read. Ship-local, not
   fabric-wide, because the cap is per-hull.

### W4 — Telegraph contrast (charter ranking: telegraphy first)

No new feature: the wave data already deforms lanes
(`fluid.glsl.js:441-467`, `u_waveShape` 8 slots). The ribbon pass
consumes the same wave slots so crest crossings boost ribbon marks into
the amber family (concept panel C). Baseline restraint is what makes
this scream — enforced by W-V coverage bounds below.

### W5 — Gravitic seams (charter: body-first, warp later)

Ribbon builder takes an optional per-well transform hook (identity
now). Warp/flow-acceleration land later as independent tunables without
touching route topology. Documented seam only — no build now.

## Verification (all reuse existing machinery)

| Check | Rig | Assertion |
|---|---|---|
| Route honesty | pure-node `tests/route-ribbons.cjs` | every polyline vertex: `directionAgrees(authoritySample, tangent, authorityFloor)` (`src/authoritative-field.mjs:121-128`) on a fixture field; toroidal wrap continuity |
| Route continuity on screen | extend `tests/fabric-rich-current-capture.cjs` (deterministic seeded Shallows rig, seed 73043) | threshold render pixels on lane-color family, chain-scan along projected polylines: max gap ≤ Xpx over ≥80% of arc length |
| Direction readability | closed-form, mirror `tests/fabric-lanes.cjs:48-67` | chevron pitch in ship-diameters at 0°/45°/90°; plus Greg checklist: "name the flow direction anywhere in 1s" |
| No re-carpeting | mirror coverage probe `tests/fabric-lanes.cjs:69-93` | ribbon coverage fraction bounded; calm stays calm |
| Honesty monotonicity | node test | brightness/length params strictly increasing in |current|; identical normalization across worldScale 5/15/25 (parity) |
| Telegraph contrast | `tests/renderer.cjs` contrast machinery (`analyzeReferenceReadability`, floors contrast ≥18/peak ≥42) | forced-wave capture: crest vs baseline contrast floor |
| Perf | pass timing via composer stats | ribbon pass ≤ 0.5ms at Deep Field 56×56 |

## Sequencing

Blocked behind: Codex round 1 completion (doc stack + this plan commit
together), Greg's step-through of this plan, and the movement-clarity
gate for anything in W3.3/W5. W1+W2 are one lane; W3.1 (worldScale
normalization) is a candidate to ride along since both touch the same
constants. Route: Forge → LBH Orchestrator thread, per project contract.

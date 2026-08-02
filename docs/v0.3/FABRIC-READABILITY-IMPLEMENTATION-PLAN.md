# v0.3 Fabric Readability Implementation Plan

> Status: implementation contract awaiting Orrery review. Product base:
> `d9939949c2e7075f305998cfd18de34dac47be3c`. This is a v0.3 same-line
> feature program; it does not authorize promotion or cross-version work.

## Outcome

Replace the current beautiful-but-illegible fabric vocabulary with the three
approved player-readable layers:

1. sparse broad local-flow lanes;
2. persistent well deformation of those lanes;
3. one source-telegraphed outward event swell.

The playable result must let Greg enter an ordinary match and answer, without a
debug overlay: **which way is local space moving, which visible well is bending
it, and what caused the one approaching wave?**

## Locked Product Contract

- FREE flight is continuous. There is no SURF state, lane lock, alignment gate,
  or extra bonus meter.
- Fabric carry is a moving reference frame capped initially at 20% of hull
  calm-space reference speed.
- Wells have localized radial gravity with full-strength and falloff radii.
  Growth expands reach first; strength remains separate.
- Rotational current reaches 1.5x the gravity falloff end and uses a broad
  plateau rather than a narrow precision band.
- Standard waves are one outward delta-v impulse equal to 25% of hull reference
  speed, applied once per player crossing.
- Conducted waves are match-relative and staggered: 0 / 1 / 2 / 3 across four
  equal phases, one source at a time, never every well simultaneously.
- Every wave owns a visible source, stable event identity, explicit cause, and
  pre-launch telegraph. Anonymous periodic rings are retired.
- Art direction is pinned by the three concept sheets under
  `docs/v0.3/concepts/` and the decisions in `OPEN-DECISIONS.md`.

## Current Source Truth And Problem

- `scripts/coarse-flow-field.cjs` builds authority current, gravity, and wave
  channels. The serialized remote field currently carries only current XY.
- `src/fluid.js` already uploads that accepted current into a world-anchored
  coarse GPU texture, then blends it into the local fluid velocity texture.
- `src/render/shaders/fluid.glsl.js::FRAG_DISPLAY` presents the blended velocity
  through global brightness, hash noise, density excitation, a generic well
  surf band, halos, and ecology overlays. Those cues do not expose one stable
  route-scale direction.
- Existing waves remain an acceleration band in the coarse field. That does not
  satisfy the locked one-crossing impulse contract.
- Existing well shader shapes describe the rendered core/accretion rings, not
  the approved gravity and current reach profile.

The implementation must not treat those inherited approximations as design
requirements.

## Architecture Boundary

Gameplay truth remains server/sim-owned. The renderer may visualize, smooth,
and decorate accepted facts but never create current, gravity, wave hits, or
surge timing.

For remote product play, broad lane direction and strength must derive from the
existing accepted coarse-current texture. The blended local velocity texture
may add restrained material detail, but cannot rotate or contradict the lane.
Local/Bench/title presentation may use the same lane renderer with its local
flow source and must be labeled non-authoritative where relevant.

The first implementation should stay shader-local if it produces stable curved
lanes. It may sample the accepted coarse texture directly, use world-position
phase, and take a small bounded number of neighboring/upstream samples to keep
marks coherent. Do not add a new simulation, manager, update loop, or CPU
streamline graph merely to imitate a field plot. If the shader prototype pops,
breaks continuity, or cannot bend cleanly around wells in the first capture,
stop and compare one presentation-only lane texture or bounded polyline
fallback. Do not accumulate all approaches.

## Ordered Playable Verticals

### V1 — Canonical mechanical fabric profile

Own the named tuning in one content source and make authority sampling consume
it:

- reference-frame carry cap;
- full gravity radius, falloff end, minimum fraction, falloff curve, and short
  feather to zero;
- current reach multiplier and broad plateau profile;
- standard wave impulse fraction and front width;
- phase-relative conducted-wave counts and source spacing.

Delete or supersede contradictory max-range/profile constants. Preserve the
15 Hz gameplay clock and existing force order. This commit should make the
mechanical profile readable to humans in one place, not introduce a generic
field framework.

Focused proof: one pure profile/field fixture at representative distances plus
the existing movement golden fixture. No browser or full lane.

### V2 — Broad local-flow lane prototype

Render a small, fixed-density family of wide broken-ASCII lanes:

- world anchored, not camera or ship anchored;
- oriented by accepted current;
- moving downstream;
- stronger current lengthens and advances marks without increasing density;
- stable across camera translation and ordinary authority updates;
- low-contrast atmosphere remains visually subordinate.

Remove hash noise and global speed brightening as gameplay cues. Do not yet add
well or event-wave art beyond compatibility needed for the lane substrate.

Playable gate: one ordinary Shallows launch and a single bounded 10-second
capture must show a stable direction and large regions of rest. If it looks
like rails, arrows, a contour plot, or disconnected local dashes, fix the
prototype before continuing.

### V3 — Well deformation

Feed the renderer the authored field radii rather than inferring mechanics from
accretion-ring geometry. Apply the locked A+C treatment:

- restrained broad orbital bend beginning at `currentReach`;
- gradual inward envelope compression through gravity falloff;
- obvious but continuous deformation inside full gravity;
- sparse split/rejoin topology around the lethal core;
- reduced near-core detail so the body and immediate rim own danger.

Delete the generic cool surf band, repeated gravity contours, and broad outer
halo. Preserve authored well body/accretion visuals and current entity sprites.

Playable gate: the same map must make orbital handedness and inward danger
legible without adding arrows or a binary capture ring.

### V4 — Source-bound one-shot wave mechanics

Replace wave acceleration bands with a swept front-crossing contract:

- deterministic source well, cause, event id, launch time, radius, and width;
- bounded pre-launch telegraph state;
- one per-player receipt prevents repeat hits;
- crossing adds one radial outward delta-v of 25% hull reference speed;
- the impulse adds to velocity without rotating or normalizing it;
- expired waves and receipts leave bounded state;
- Conductor sources are deterministic and staggered inside phases; visible
  consumption and Vessel-overdrive causes remain independent.

Do not infer a hit from renderer timing. Do not preserve the old per-tick band
behind a compatibility flag.

Focused proof: one pure swept-crossing fixture covering approach, high-speed
crossing, no double hit, missed front, toroidal seam, and different hull
reference speeds; one Conductor schedule fixture proving 0 / 1 / 2 / 3,
single-source staggering, and match-length scaling.

### V5 — Event-wave presentation

Implement the approved B+C composite:

- the source well compresses/brightens and emits spatial audio before launch;
- one broad material swell travels through the lanes;
- a thin sparse broken crest preserves the leading edge;
- no detached sonar ring, intersection nodes, ripple train, filled trailing
  zone, or persistent halo;
- fabric behind the crest returns quickly to calm.

The existing source-bound public wave projection remains the identity seam.
Presentation consumes it and does not manufacture anonymous local rings.

Playable gate: one forced Bench event for iteration, followed by one natural
conducted event in an ordinary match. The cause must be apparent before the
front reaches the player.

### V6 — Cleanup, tuning, and handoff

Remove dead shader uniforms, old surf/halo/noise branches, superseded content
knobs, and debug labels that claim retired mechanics. Update Bench properties
only for the canonical controls Greg can actually tune. Keep the implementation
comments focused on why lane truth, well deformation, and one-shot receipts are
separate.

Run one focused renderer smoke and one natural playable capture at 1280x800.
Do not run broad CI until this coherent vertical is selected as a checkpoint or
RC candidate. Greg owns the final movement feel and visual-readability gate.

## File Ownership

Likely high-conflict owners:

- authority/content: `src/content/fabric.data.json`,
  `scripts/coarse-flow-field.cjs`, `scripts/sim-runtime.cjs`, and a narrow new
  `scripts/sim/` wave-crossing helper;
- presentation: `src/fluid.js`, `src/render/shaders/fluid.glsl.js`,
  `src/presentation/well-wave-presentation.js`, and the existing scene/frame
  projection only if new accepted fields are required;
- focused fixtures: new small files under `tests/`, avoiding expansion of the
  broad browser suites;
- docs: this plan, `OPEN-DECISIONS.md`, and `CHANGELOG.md`.

One writer owns each vertical. Do not let authority and shader writers edit
`src/fluid.js`, `scripts/sim-runtime.cjs`, or the display shader concurrently.
The v0.3 Workstream Sol integrates accepted commits in order.

## Stop Conditions

Stop and return a concrete blocker if:

- remote lanes cannot consume accepted current without a new protocol payload;
- the chosen shader technique cannot remain stable under camera movement;
- a wave hit would depend on render frames rather than authority ticks;
- the change corrupts movement truth, prevents a normal match from booting, or
  damages the worktree.

Do not stop for an unrelated broad-suite failure, stale screenshot fixture,
capture infrastructure retry, or visual taste question that Greg can judge in
the next playable build.

## Acceptance Receipt

Return each vertical as one meaningful commit with:

- exact branch and commit;
- player-visible result;
- smallest focused proof;
- one artifact path when the vertical is visual;
- honest remaining exposure;
- next playable vertical.


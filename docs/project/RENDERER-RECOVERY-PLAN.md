# Renderer Recovery Plan

> Restore black-hole readability, keep the flight physics honest, and give the jam a renderer contract that can survive three more days of work.

## The problem

The renderer currently overloads one concept — `density` — with too many meanings at once.

At different times it is standing in for:
- matter / accretion brightness
- void / absence
- flow energy
- directional readability
- glitch texture
- surf opportunity

That is why the visuals keep getting richer mathematically while getting worse as game communication.

The player does not need to read "density." The player needs to read:
- where spacetime is gone
- where spacetime is hot and dangerous
- where spacetime is moving
- where a current is useful to ride

## Recovery thesis

We stop treating `density` as the player-facing interpretation.

For rendering purposes, the useful concept is **fabric excitation**:
- low excitation = quiet void / dead space
- high excitation = active spacetime / hot ring / visible current
- negative shaping = collapse / absence / black hole core

The renderer should communicate phenomena, not raw sim internals.

## Three-layer contract

### 1. Physics truth

This layer exists to make the ship fly correctly.

It owns:
- fluid velocity
- well pull / star push / portal pull
- anything the ship samples for movement

It does **not** need to explain the world visually by itself.

**Rule:** if a change is purely visual, it should not be forced into the physics layer.

### 2. Scene shaping

This layer turns sim truth into player-readable spacetime.

It owns:
- void mask
- accretion heat / hot ring
- flow emphasis
- surf opportunity highlighting
- visual-only disturbances and ambient shaping

This is where we are allowed to fake aggressively as long as navigation still feels truthful.

**Rule:** black holes must read correctly here before ASCII quantization.

### 3. ASCII presentation

This layer maps the shaped scene into characters.

It owns:
- glyph weight from brightness / excitation
- directional glyph choice from flow
- restrained shimmer
- glitch transition
- low-fi dying-universe character treatment

It does **not** own black-hole definition.

**Rule:** ASCII should preserve a strong scene image, not invent one from scratch.

## Player-facing visual signals

Every scene with a major well should communicate four things immediately:

### A. Void
- The place you do not go.
- Visually subtractive.
- Must read as dark first, not merely low-contrast.

### B. Accretion
- The hot ring around the void.
- Bright, dense, and visibly dangerous.
- Should feel like compressed energy, not a generic glow.

### C. Flow
- The direction spacetime is moving.
- Primarily an ASCII directional-glyph problem.
- Must be readable even in darker regions.

### D. Surf lane
- The place where motion is useful, not just dangerous.
- This is the missing gameplay read right now.
- It can be partially faked in the scene-shaping layer.

If a renderer change does not improve at least one of those four reads, it is probably noise.

## Work split

### Forge owns

- renderer architecture and simplification
- display shader / scene shaping / ASCII quantization
- debug views and render diagnostics
- scaling discipline across map sizes and sim resolutions
- final integration review of visual changes

### Claude / Orrery owns

- gameplay features
- content and system work outside the renderer
- map/entity iteration that depends on the renderer contract, not the other way around
- screenshots / subjective playtest notes that feed back into renderer tuning

### Orb owns

- routing
- keeping the workstream isolated from unrelated feature churn
- handoffs, screenshots, and decision summaries

## Temporary rules while this plan is active

1. Forge is the only agent changing the core renderer files unless Greg explicitly says otherwise.
2. Claude can request visual outcomes and provide screenshots, but should not keep churning shader math in parallel.
3. We prefer debug views and field separation over clever combined formulas.
4. Friendlier image > physically purer image. We ship the feeling.

## The actual plan

### Phase 0 — Freeze the problem

**Goal:** Stop the renderer from drifting while features continue.

Tasks:
- Treat current ship-flight behavior as protected.
- Stop adding new visual effects until black holes read correctly again.
- Choose one title-screen screenshot and one gameplay screenshot as visual reference targets.

**Done when:** the team is comparing changes against the same two images instead of arguing from memory.

### Phase 1 — Make the renderer diagnosable

**Goal:** See the layers separately.

Tasks:
- Add debug views or toggles for:
  - raw fluid velocity / direction read
  - scene-shaping output before ASCII
  - void mask
  - excitation / brightness field
  - surf-lane highlight
  - final ASCII output
- Expose enough controls to isolate one effect at a time.

**Done when:** we can answer "is this bug in the sim, the scene shaping, or ASCII?" in seconds.

### Phase 2 — Restore black holes first

**Goal:** Make a black hole look like a black hole again.

Tasks:
- Separate void from excitation completely.
- Make the dark core a first-class visual signal.
- Rebuild the hot ring as a distinct read around that core.
- Reduce or remove decorative noise that muddies that silhouette.

**Done when:** the title screen and one gameplay well both show:
- a dark core
- a readable hot ring
- visible surrounding flow

### Phase 3 — Show rideable flow

**Goal:** Make "surf here" legible without new physics.

Tasks:
- Derive a visual-only surf signal from the existing field.
- Prefer directional/tangential opportunity over generic brightness.
- Make useful currents stand out from merely dangerous pull.

Candidate interpretations:
- tangential flow strength around wells
- shear bands where velocity changes rapidly
- wave-crest style highlight where direction and magnitude align with rideability

**Done when:** a player can see a lane worth riding, not just a dangerous bright region.

### Phase 4 — Fix scaling discipline

**Goal:** Make the renderer survive 3x3, 5x5, 10x10, and different sim resolutions without re-tuning every effect from scratch.

Tasks:
- Sort every renderer parameter into one of three buckets:
  - world-space meaning
  - UV/Gaussian-space meaning
  - screen/ASCII-space meaning
- Remove hybrid values where possible.
- Test at minimum:
  - 3x3, default sim res
  - 5x5, default sim res
  - 10x10, default sim res

**Done when:** major reads survive map size changes without bespoke emergency tuning.

### Phase 5 — Reintroduce polish carefully

**Goal:** Add back coolness without losing readability.

Allowed polish:
- restrained shimmer
- glitch transition
- subtle background fabric texture
- visual-only disturbances that do not fight the core reads

Not allowed:
- adding three new kinds of noise to compensate for weak composition
- making ASCII do the scene-shaping layer's job

**Done when:** the frame looks stranger and better, not busier and less legible.

## File ownership

These are the likely touch points for this recovery pass:

- `src/fluid.js`
- `src/ascii-renderer.js`
- `src/config.js`
- `src/dev-panel.js`
- `src/maps/title-screen.js`
- possibly a new small render-debug helper if needed

The likely output of the pass is not a huge rewrite. It is a stricter pipeline.

## Integration cadence

### Before Claude starts a feature that depends on visuals
- Forge states current renderer contract
- Orb routes around known visual instability

### After Forge lands a renderer slice
- Orb or Greg captures two screenshots:
  - title / compositional read
  - gameplay / navigation read
- Claude evaluates gameplay implications from those images, not shader internals

## Definition of done for jam week

We are done when:
- the ship still flies off the same underlying sim
- black holes read instantly
- surf opportunity is more legible than it is now
- the title screen looks like the pre-vis spirit again
- the renderer survives map-size changes without falling apart
- the final frame still feels like glitchy dying-universe ASCII, not generic neon noise

## Final rule

If a shader change makes the math more interesting but the frame less readable, it is the wrong change.

# Client Performance Analysis

## Current Read

The client slowdown on larger maps is not primarily a camera or frustum problem.

The viewport still shows roughly one world-unit across. The big cost increase comes from two structural issues:

1. the fluid sim is still a full-screen GPU solver that runs every fixed sim step
2. many world entities were injecting expensive full-screen splat passes every sim tick

That means map size hurts performance indirectly by increasing entity count and by pushing the large map onto a higher fluid resolution.

## Why 3x3 Holds While 5x5 and 10x10 Collapse

### Base solver cost

Every fluid step already does a large fixed stack of full-screen passes:

- curl
- vorticity
- advect velocity
- advect density
- distance-based dissipation
- divergence
- clear pressure
- pressure solve loop
- gradient subtract

With `pressureIterations = 30`, the solver base is already expensive before entity effects.

### The real spike was entity-driven splat spam

Before this pass, wells were by far the worst offender.

Per well, per sim step, the old path was approximately:

- `1x` `applyWellForce`
- `3 rings × N accretion points × (1 splat + 1 visualSplat)` = `9N` full-screen passes
- `1x` core `visualSplat`
- `12x` horizon `visualSplat`

That means:

- a `3-point` well cost about `41` full-screen passes per step
- a `5-point` well cost about `59`
- an `8-point` well cost about `86`
- a `12-point` well cost about `122`

Map totals were roughly:

- **3x3**: ~`245` well passes/step
- **5x5**: ~`508` well passes/step
- **10x10**: ~`1208` well passes/step

Stars were also expensive:

- old star path: `27` passes per star per step
- **3x3**: `54`
- **5x5**: `81`
- **10x10**: `162`

On `Deep Field`, those entity effects were then compounded by `fluidResolution = 512`, which is about `4×` the pixel cost of the default `256` sim.

## Cuts Landed

### 1. Dissipation anchors are now core field sources only

Distance-based density dissipation now tracks:

- wells
- stars

It no longer loops over loot, wrecks, portals, planetoids, ship, or scavengers.

That reduces per-texel loop work in one of the full-screen passes and makes the dissipation rule match the actual long-lived field anchors.

### 2. Well visuals moved out of the sim pass budget

Wells now do:

- `1x` `applyWellForce`
- `1x` subtractive core `visualSplat`

The accretion band is now primarily renderer-owned instead of being painted by dozens of splats every tick.

Per-well cost dropped from roughly `41–122` passes to `2`.

### 3. Star rays no longer burn sim passes

Stars now keep:

- `1x` outward force
- `1x` clearing splat
- `1x` core splat

The richer star spike look still belongs in presentation, not in the simulation pass budget.

Per-star cost dropped from `27` to `3`.

## What Still Costs

The remaining expensive levers are, in order:

1. **full-screen solver cost**
   - especially `pressureIterations`
2. **large sim resolution**
   - `Deep Field` currently forces `512`
3. **remaining splat-heavy systems**
   - wave rings
   - combat pulses
   - ship wake
   - planetoid wakes
4. **lockstep fixed sim cadence**
   - current in-process sim still targets `60 Hz`

## Recommended Next Gains

### Highest-confidence gain

Keep the renderer-owned black hole / accretion read and continue removing decorative splats from the sim path wherever the presentation layer can express the same idea more cheaply.

That is the cleanest long-term rule:

**If an effect is visual-only, it should not cost full-screen simulation work every fixed step.**

### Next likely gain

Reduce large-map sim resolution.

Recommended experiments:

- `3x3`: keep `256`
- `5x5`: keep `256`
- `10x10`: try `384`, then `256`

The current `512` target is expensive enough that it should be justified by obvious gameplay value, not just visual caution.

### Then reduce authoritative tick rate for big worlds

Reasonable current target:

- `3x3`: `60 Hz`
- `5x5`: `30 Hz`
- `10x10`: `20–30 Hz`

This is compatible with the longer-term client/server direction:

- client render stays `30–60 fps`
- authoritative world step drops to a cheaper fixed cadence

### Future architectural gain

Move more world truth onto a coarse flow-field model and let the expensive fluid / ASCII fabric stay client-side.

That is the path to:

- large maps
- more entities
- multiplayer

without tying gameplay scale to full-screen GPU passes.

## Practical Conclusion

The main bottleneck was not “too much visible world.” It was “too many entities making the whole fluid texture do work every tick.”

The first fix was to stop using the sim as a paintbrush.

If large maps are still slow after these cuts, the next two levers to pull are:

1. lower `Deep Field` resolution
2. lower sim tick rate on larger maps

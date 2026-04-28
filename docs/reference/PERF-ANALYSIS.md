# Client Performance Analysis

## Current Read — 2026-04-28

The client slowdown on larger maps is still primarily the local browser fluid sim,
not the richer Composer post chain.

The `tests/perf-probe.js` harness now measures map FPS, smoothed client timing,
fluid resolution, visible well count, active composer passes, and authoritative
snapshot payload sizes. Run it with:

```bash
npm run test:perf
```

Latest probe after the large-map tuning and presentation-smoothing pass:

| Map | FPS | Local sim ms | Fluid res | Render wells | Snapshot payload |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3x3 | ~60 | ~9.7ms | 256 | 4 / 4 | ~22 KB @ 10 Hz |
| 5x5 | ~60 | ~7.2ms | 256 | 8 / 8 | ~39 KB @ 8 Hz |
| 10x10 | ~60 | ~2.9ms | 256 | 2 / 20 | ~79 KB @ 6 Hz |

The viewport still shows roughly one world-unit across. The big cost increase came from two structural issues:

1. the fluid sim is still a full-screen GPU solver that runs every fixed sim step
2. many world entities were injecting expensive full-screen splat passes every sim tick

That means map size hurts performance indirectly by increasing entity count, increasing
well loops, and previously pushing the large map onto a higher fluid resolution.

## 2026-04-24 Cuts Landed

### 1. Map-specific client sim profiles

The in-process browser background/visual sim no longer treats every map like a 60 Hz 3x3 run:

- `3x3`: base profile remains `60 Hz`
- `5x5`: `30 Hz`, `maxStepsPerFrame = 3`, `pressureIterations = 24`
- `10x10`: `15 Hz`, `maxStepsPerFrame = 2`, `pressureIterations = 12`

This reflects the architecture direction: the visible client targets smooth play,
but larger-map fluid/object fidelity does not need to advance at 1/60th second.
Player presentation must stay frame-smoothed over the cheaper authority cadence;
otherwise the lower tick rate becomes visible as stutter.

### 2. Deep Field fluid resolution reduced

`Deep Field` now uses `fluidResolution = 256` instead of `512`.

The old value made every full-screen fluid pass roughly `4x` more expensive.
At 10x10 density, the extra texels were not buying enough gameplay value to justify
falling under 30 FPS.

### 3. Renderer well frustum for the display shader

The production display shader no longer loops all 20 Deep Field wells for every
screen pixel. It sends wells whose accretion shapes intersect the current camera
view, while always preserving the two nearest wells as a visibility floor.

Physics and death checks still see all wells. This is render-only culling.

### 4. Perf probe harness

`tests/perf-probe.js` is intentionally diagnostic, not part of `npm test`.
It starts a local browser harness, opens each playable map, teleports the ship to
a safe sample point, reports client timing, then starts a keep-alive transient sim
to report snapshot payload sizes.

### 5. Camera culling now reaches the sim systems

The first tuning pass exposed an important seam: several systems already had
camera culling for fluid injection, but `SimCore` was calling them without
camera coordinates. That made the culling inert.

`SimCore` now forwards `camX/camY` into wreck, portal, and comet updates. Wrecks
and portals reuse their existing cull checks, and comets now skip their bow shock,
eddy, and trail splats when outside the active camera neighborhood. Entity motion,
pickup checks, death checks, and server authority are unchanged; only offscreen
client-side fluid painting is skipped.

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
   - `Deep Field` was `512`; it is now `256`
3. **remaining splat-heavy systems**
   - wave rings
   - combat pulses
   - ship wake
   - planetoid wakes
4. **lockstep fixed sim cadence**
   - large maps now have cheaper local profiles, but this remains a tuning axis

## Recommended Next Gains

### Highest-confidence gain

Keep the renderer-owned black hole / accretion read and continue removing decorative splats from the sim path wherever the presentation layer can express the same idea more cheaply.

That is the cleanest long-term rule:

**If an effect is visual-only, it should not cost full-screen simulation work every fixed step.**

### Next likely gain

Reduce large-map sim resolution.

Recommended baseline:

- `3x3`: keep `256`
- `5x5`: keep `256`
- `10x10`: keep `256` unless a visual regression proves it needs more

`512` should only return behind an explicit high-end / capture-mode flag.

### Keep authority cheap, but smooth presentation

Current visual/background target:

- `3x3`: `60 Hz`
- `5x5`: `30 Hz`
- `10x10`: `15 Hz`

Remote snapshots are lower cadence (`10/8/6 Hz` by map scale), so the browser
keeps a small presentation target and interpolates/extrapolates the local ship
between fresh authoritative snapshots. Do not fix stutter by raising large-map
fluid ticks back to `60 Hz`; that reintroduces the original 5x5/10x10 CPU/GPU
cost cliff.

### Snapshot traffic

The authoritative sim still sends whole-world snapshots:

- all players
- all wells
- all stars
- all wrecks
- all planetoids/comets
- all scavengers/fauna/sentries

Large maps are not network-bound locally yet, but the 10x10 payload is already
~82 KB at 6 Hz. Before internet-facing multiplayer, snapshot payloads need either
interest filtering, delta snapshots, or both.

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
2. keep lower large-map sim tick rates, with explicit frame-rate presentation smoothing

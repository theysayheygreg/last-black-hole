# Sim Decoupling Plan

> Split LBH into an authoritative simulation process and a lighter player client without losing the current movement fantasy.

## Why do this now

The current build runs almost everything in one browser loop:
- fluid GPU sim
- entity updates
- AI
- ship movement
- combat
- spawning
- rendering
- HUD/audio

That is fine for a jam prototype, but it is the wrong shape for both multiplayer and scale.

The current pressure points are already visible:
- the ship reads velocity directly from the GPU fluid field
- scavengers do the same thing
- several systems inject into the fluid as a side effect of updating
- some updates are camera-culled, which means the simulation currently depends on what the player can see
- some systems run on `simDt`, others run on frame `dt`
- the render client and the world truth are the same process, so a render hitch is also a sim hitch

If we want authoritative multiplayer later, or just a smoother local client now, those need to split.

## Design goal

The visible client should be allowed to chase a steady 30-60fps and render a rich ASCII world.

The authoritative sim should be allowed to run slower, deterministically, and care about world truth instead of presentation.

Those are different jobs. They should not share a clock.

## The core decision

Do **not** make the current WebGL fluid simulation the authoritative server model.

That is the wrong thing to put on the server because:
- it is GPU-bound and browser-bound
- it is expensive to replicate over the network
- too many gameplay systems currently depend on reading the exact live texture
- a 100x100 world and 10x entity count will break long before the renderer does

Instead:
- the server/sim process should own **gameplay truth**
- the client should own **high-frequency visual reconstruction**

That means the server simulates entities, forces, hazards, timers, and coarse flow truth.
The client turns that into a detailed local field and ASCII image.

## Proposed process split

### 1. Sim Core (authoritative)

This is the future dedicated process. In local single-player it can start as a Web Worker or child process. In multiplayer it becomes the server.

It owns:
- world clock
- players and AI ships
- wells, stars, portals, wrecks, planetoids
- signal state
- wave-ring events
- extraction / death / win-loss state
- spawn timers and escalation
- collisions and interaction outcomes
- coarse navigational flow field

It does **not** own:
- ASCII rendering
- HUD
- audio
- glitch/shimmer/fabric polish
- full-resolution fluid textures

### 2. Client Runtime (player executable)

This is the visible game.

It owns:
- input capture
- render interpolation
- camera
- local HUD/audio
- local ASCII renderer
- local visual-only fluid/fabric simulation
- prediction for the local player if needed

It reads from Sim Core:
- snapshot state
- event stream
- local/coarse field samples or chunks

It sends to Sim Core:
- input commands
- menu/session commands

### 3. Field Adapter (bridge layer)

This is the crucial middle layer.

It converts authoritative world state into something the renderer can use.

It can exist inside the client at first.

It owns:
- local flow-field reconstruction around the player
- interpolation between authoritative snapshots
- optional higher-resolution visual field synthesis
- chunk activation / deactivation
- derived visual masks like surf-lane hints

This layer is how we avoid shipping the whole GPU fluid texture across process boundaries.

## What becomes authoritative

These should become plain-data authoritative state first:
- ship transforms, velocities, thrust state
- scavenger transforms, velocities, AI state
- well transforms, mass, growth, kill radius, orbital direction
- stars, portals, wrecks, planetoids
- wave ring descriptors
- signal totals and thresholds
- inventory / extraction state
- run timers and collapse progression

The authoritative sim should answer questions like:
- where is the ship
- what forces apply here
- did the player die
- did the player extract
- which portal is alive
- which wreck was consumed
- what is the local flow vector at this position

## What stays client-side

These should remain presentation-only unless they later prove mechanically necessary:
- glyph choice
- color grading
- shimmer/glitch
- post-process accretion polish
- debug overlays
- camera easing
- screen-space distortion
- high-frequency fabric noise

The client is allowed to fake these hard, as long as they do not lie about navigation.

## The key architectural shift

Right now the game asks:
- “what does the GPU fluid texture say at this UV?”

The decoupled version needs to ask:
- “what is the authoritative local flow state at this world position?”

That sounds similar, but it is a major change.

The current direct dependency on `fluid.readVelocityAt()` in `ship.js` and `scavengers.js` is the biggest seam to cut.

The replacement should be something like:
- `flowField.sample(wx, wy)`

At first, `flowField.sample()` can still be backed by the existing fluid sim.
Later, it can be backed by:
- coarse server field chunks
- analytic well/star contributions
- local reconstructed visual fluid
- or a blend of those

That one interface is the most important decoupling move in the whole system.

## Recommended simulation model

### Short version

Authoritative sim uses a **coarse CPU-side field + event model**.
The client uses a **local high-resolution visual field**.

### Why

LBH does not need server-authoritative Navier-Stokes to feel right.
It needs server-authoritative answers to:
- pull direction
- local current direction and strength
- rideable lanes
- hazard bands
- entity collisions and outcomes

Those can come from a cheaper model than the full visual sim.

### Suggested server-side field model

Use a layered field model:

1. **Analytic source forces**
   - wells pull inward
   - stars push outward
   - planetoids perturb locally

2. **Event-driven wave bands**
   - wave rings already exist conceptually
   - they are cheap to represent as descriptors instead of textures

3. **Coarse grid accumulation**
   - a low-res 2D vector field for ambient flow / drift
   - updated at fixed sim ticks

4. **Local query synthesis**
   - when the sim needs flow at `(wx, wy)`, sample the coarse grid and add analytic/event contributions

That is far more scalable than trying to make the current visual fluid texture the source of truth.

## Clock split

### Client render clock

- target: `30-60 fps`
- current practical target: keep visual client above `30 fps` minimum
- this is not authoritative

### Authoritative sim clock

Recommended first target:
- `15 Hz` fixed tick (`66.67 ms`)

Why 15 Hz:
- fast enough for surfing and hazards to feel alive once interpolated
- slow enough to scale much better than 60 Hz
- aligns with “game state” rather than “screen refresh”
- leaves room for more entities and larger maps

### Optional lower-frequency subsystems

Not everything needs the same tick.

Recommended bands:
- **15 Hz** — core movement, force integration, collisions, portals, wave events
- **5-10 Hz** — AI decision-making, spawn systems, strategic retargeting
- **1-2 Hz** — macro collapse systems, long growth timers, population pressure

That means scavengers can still steer every sim tick if needed, but only rethink their goal every few ticks.

### Why not 60 Hz authoritative sim

Because you are paying for it in the wrong place.

At 100x100 scale and 10x current entity count, 60 Hz authoritative full-world updates will spend budget on things the player cannot perceive. The client should burn cycles on image quality. The sim should burn cycles on truth.

## Snapshot/update strategy

For multiplayer or local process separation, I would use:

- **authoritative tick:** 15 Hz
- **snapshot broadcast / handoff:** 10-15 Hz
- **client interpolation:** every render frame
- **client visual fluid update:** 20-30 Hz local, decoupled from the authoritative tick if needed

That lets the client stay smooth even if the sim is comparatively sparse.

## Scale assumptions and breaking points

### Current likely breaking points

With the current architecture, the first failures at larger scale are likely:

1. **Full-field fluid cost**
   - one global fluid sim grows badly with map size and desired detail

2. **GPU readback coupling**
   - `readVelocityAt()` style gameplay queries do not scale nicely as shared truth

3. **Camera-coupled updates**
   - `lootSystem.update(... camX, camY)` and similar are not valid for authoritative simulation

4. **Mixed clocks**
   - some systems use `simDt`, some use frame `dt`, so decoupling will surface hidden drift bugs

5. **Entity-to-fluid side effects**
   - direct `fluid.splat()` mutations from multiple systems make it hard to reproduce or network

### At roughly 10x entities

Expect pressure on:
- scavenger update loops
- planetoid/wreck/portal iteration
- fluid injection count per frame
- collision/nearest-target scans

The sim will want:
- spatial indexing for nearby queries
- lower-frequency AI decisions
- active-region updates instead of whole-world high-detail updates

### At roughly 100x100 world scale

A single dense global field becomes the wrong abstraction.

You will want one of these:

1. **Chunked world field**
   - active chunks near players or major events
   - dormant or coarse chunks far away

2. **Hybrid analytic + chunk field**
   - wells and stars are analytic everywhere
   - chunk fields only capture local turbulence and surfability

3. **Player bubble simulation**
   - authoritative sim tracks global state cheaply
   - each player gets a local high-detail field bubble for navigation

My recommendation is option 2. It is the simplest thing that scales without losing the fantasy.

## The migration plan

### Phase 1 — Separate the interfaces inside one app

Do this before any real second process exists.

Tasks:
- introduce a `flowField.sample(wx, wy)` interface
- make `ship.js` stop calling `fluid.readVelocityAt()` directly
- make scavengers stop calling `fluid.readVelocityAt()` directly
- introduce a `SimState` plain-data object for entities and world timers
- isolate camera-culling out of simulation logic
- make the main loop call a `sim.updateFixed(step)` function
- keep renderer reading from state, not owning state

This is the highest-value step.

### Phase 2 — Create a real sim core module

Tasks:
- extract world update orchestration out of `main.js`
- move sim-owned systems behind `SimCore`
- give `SimCore` no render dependencies
- feed outputs into the existing renderer client

At the end of this phase, you still have one app, but the architecture is ready.

### Phase 3 — Move SimCore to a second process

Local single-player first:
- Web Worker in browser, or
- child process / local server for desktop builds

Then multiplayer later:
- same protocol, different host

### Phase 4 — Replace authoritative fluid with authoritative field model

Tasks:
- introduce coarse/chunked field state
- make flow queries derive from server data instead of the live GPU texture
- keep the client visual fluid as reconstruction/polish

This is the multiplayer unlock.

## Concrete file-level seams to attack later

These are the files most tied to the current single-process design:
- `/Users/theysayheygreg/clawd/projects/last-black-hole/src/main.js`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/src/ship.js`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/src/scavengers.js`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/src/fluid.js`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/src/map-loader.js`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/src/combat.js`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/src/wave-rings.js`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/src/planetoids.js`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/src/portals.js`

The first new files I would expect later are:
- `src/sim/sim-core.js`
- `src/sim/sim-state.js`
- `src/sim/flow-field.js`
- `src/sim/snapshot-schema.js`
- `src/client/client-runtime.js`
- `src/client/field-adapter.js`

## A reasonable first target architecture

If I were choosing the simplest real end state to aim at now, it would be this:

- **SimCore:** fixed 15 Hz authoritative world sim
- **Client:** 30-60 fps render/input runtime
- **FlowField:** authoritative coarse vector field + analytic sources
- **VisualFluid:** client-only high-res field for beauty and feel
- **Snapshots:** 10-15 Hz state sync
- **Interpolation:** client-side only

That gets you:
- cleaner single-player performance
- better long-term scale
- a direct path to multiplayer
- a renderer that can stay rich without dictating server cost

## What not to do

Do not:
- try to network the raw visual fluid textures
- make the server own the ASCII renderer
- preserve camera-culling inside authoritative sim logic
- keep physics truth tied to `readPixels`-style GPU queries forever
- insist on 60 Hz authoritative full-world simulation just because the client renders at 60 Hz

## The actual recommendation

Start by decoupling the **interface**, not the process.

If the code still asks the GPU texture what truth is, a second process will just be pain.
If the code asks a clean flow/state interface what truth is, process separation becomes mostly plumbing.

So the first serious milestone is not “run a server.”
It is:

**make the current app able to pretend the sim already lives somewhere else.**

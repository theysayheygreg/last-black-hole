# Carbon Engine Source Read

> v0.2 knowledge-base note, added 2026-07-01.

## Scope

CCP has opened source for a large slice of the Carbon Engine family at
<https://github.com/carbonengine>. This note treats Carbon as reference
material for Last Singularity, not as a runtime dependency or migration target.

Primary repos inspected:

- Carbon org: <https://github.com/carbonengine>
- Destiny simulation: <https://github.com/carbonengine/destiny>
- Trinity renderer: <https://github.com/carbonengine/trinity>
- Scheduler/runtime: <https://github.com/carbonengine/scheduler>
- Blue runtime/resource bridge: <https://github.com/carbonengine/blue>
- Pathfinder: <https://github.com/carbonengine/pathfinder>
- Resources tooling: <https://github.com/carbonengine/resources>
- Mesh tooling: <https://github.com/carbonengine/mesh>
- Audio: <https://github.com/carbonengine/audio>
- Spatial audio clustering: <https://github.com/carbonengine/spatial-audio-clustering>

The most useful transfer is not "EVE's engine, but smaller." It is the shape
of mature contracts around simulation authority, relevance filtering, render
passes, asset manifests, and performance budgets.

## Executive Takeaways

1. Keep one LBH run as one clear sim authority. Carbon's Destiny `Ballpark`
   reinforces that world truth should live in one boring kernel with explicit
   state changes.
2. Add stamped sim-event history before networking or replay grows. Destiny's
   client/server history and rebase tests are the strongest concrete pattern.
3. Treat relevance as a first-class contract. Carbon's bubble/character update
   batching maps to LBH player-local, global, debug, cinematic, and VFX lanes.
4. Build a small explicit Three render plan, not a grand render graph. Trinity
   is pass-driven and driver-coded; LBH should declare pass names, inputs,
   outputs, quality tier, debug view, and budget.
5. Add manifests before the asset library grows. Carbon's resource groups are
   heavier than LBH needs, but the checksum/version/use-case habit is right.
6. Budget audio and VFX like real systems. Carbon's audio prioritization and
   spatial clustering are a reminder that dense spectacle needs culling rules,
   not vibes alone.

## Simulation Lessons

Destiny's core object is the `Ballpark`, a space-partitioned simulation owner
for many dynamic objects. The related `Ball` type stores packed distributed
state: position, velocity, mass, radius, max velocity, agility, movement mode,
visibility flags, collision/proximity fields, and timestamps.

Relevant source paths:

- <https://github.com/carbonengine/destiny/blob/main/src/Ballpark.h>
- <https://github.com/carbonengine/destiny/blob/main/src/Ball.h>
- <https://github.com/carbonengine/destiny/blob/main/src/IDstConstants.h>
- <https://github.com/carbonengine/destiny/blob/main/src/Partition.cpp>

The important read is not the exact physics. EVE's ship movement modes, warp,
orbit, follow, harmonics, corporations, cloaking, and bubbles are EVE-specific.
The transferable part is the contract:

- hot movement facts are grouped in the sim object
- gameplay changes arrive as explicit state changes or actions
- behavior is deterministic between those changes
- the tick owns integration, collision, partition updates, and proximity
- partitions/relevance are part of the simulation boundary, not UI sugar

For LBH, this argues for strengthening `scripts/sim-runtime.cjs` and
PlayerBrain-style state as the only source of movement, pickup, extraction,
death, signal, and collision truth. The renderer can predict, smooth, and
decorate; it does not get to decide.

### Stamped History And Rebase

The best Destiny code to mine is its client/server history path:

- <https://github.com/carbonengine/destiny/blob/main/python/destiny/net/server/_actions.py>
- <https://github.com/carbonengine/destiny/blob/main/python/destiny/net/server/_ticker.py>
- <https://github.com/carbonengine/destiny/blob/main/python/destiny/net/server/_parkupdatebatcher.py>
- <https://github.com/carbonengine/destiny/blob/main/python/destiny/net/client/_ticker.py>
- <https://github.com/carbonengine/destiny/blob/main/python/destiny/net/client/_util.py>
- <https://github.com/carbonengine/destiny/blob/main/python/destiny/test/net/client/test_ticker.py>

Server-side, actions accumulate into system history and are flushed on tick.
The batcher then distributes full state, partial add/remove updates, bubble
history, and character-specific history. Client-side, updates are merged by
timestamp. A `SetState` acts as a reset/snapshot. Late or future updates can be
applied by rewinding to a saved snapshot and replaying forward. Tests cover
late arrival, future events, timestamp mismatches, and recoverable desync.

LBH-sized version:

- Record a short stamped action journal per run.
- Emit meaningful sim events for thrust, brake, slingshot engage/release,
  pickup, portal enter, signal spike, inhibitor beat, death, extraction, and
  collapse.
- Keep a bounded snapshot ring for local replay, visual validation, and future
  network correction.
- Add tests for stale events, late events, run reset, and snapshot rebase while
  the local stack is still small.
- Track desync/correction counters even before remote multiplayer needs them.

This is the same lesson as earlier EVE architecture research, but now with
source-level shape: fairness and debuggability come from stamped truth, not
from asking the renderer to infer what happened.

## Ships And Gameplay Ideas

Carbon's ship gameplay lesson is not "copy EVE movement." EVE's `Goto`,
`Follow`, `Stop`, `Warp`, `Orbit`, missile, formation, and other Destiny modes
serve a very different game. The useful part is explicit movement state.

LBH should name its own movement facts with similar discipline:

- drift/surfing state
- thrust impulse
- active brake/reverse thrust
- slingshot anchor approach
- slingshot capture
- slingshot release
- force-pulse impulse
- inhibitor control interference
- death/collapse transition

Those states should drive both sim and visuals. Thruster cones, braking sparks,
contact mattes, wake trails, signal heat, and hull stress should be derived from
speed, acceleration, force source, slingshot state, and PlayerBrain modifiers,
not from raw keypresses alone.

Pathfinder is also worth mining:

- <https://github.com/carbonengine/pathfinder/blob/main/EveMap.h>
- <https://github.com/carbonengine/pathfinder/blob/main/EvePathfinder.h>

Its static map topology is separate from runtime simulation. For LBH, that
suggests a route-graph/debug layer over authored map seeds: wells, stars,
wreck fields, portals, inhibitor lanes, and safe approaches are static anchors;
signal pressure, portal decay, scavenger activity, and collapse timing become
dynamic costs layered on top.

## Rendering Lessons

Trinity is a mature production renderer, not a drop-in answer for LBH. The
lessons are about boundaries.

Useful source paths:

- <https://github.com/carbonengine/trinity/blob/main/trinity/Include/ITr2MultiPassScene.h>
- <https://github.com/carbonengine/trinity/blob/main/trinity/ITr2RenderNode.h>
- <https://github.com/carbonengine/trinity/blob/main/trinity/Tr2RenderNodeEffect.cpp>
- <https://github.com/carbonengine/trinity/blob/main/trinity/Eve/EveSpaceSceneRenderDriver.cpp>
- <https://github.com/carbonengine/trinity/blob/main/trinity/PostProcess/Tr2PostProcess2.h>
- <https://github.com/carbonengine/trinity/blob/main/trinity/Tr2DirectInstanceData.h>
- <https://github.com/carbonengine/trinity/blob/main/trinity/Tr2RuntimeInstanceData.h>
- <https://github.com/carbonengine/trinity/blob/main/trinity/Tr2VolumetricsRenderer.cpp>
- <https://github.com/carbonengine/trinity/blob/main/trinity/Tr2GpuProfiler.h>
- <https://github.com/carbonengine/trinity/blob/main/trinity/TriDevice.cpp>

Trinity uses a practical hybrid of multipass scene phases, render jobs, render
nodes, named outputs, explicit driver sequencing, temporary GPU resources,
global shader/material parameters, instancing, postprocess, and profiling.
There is no need for LBH to recreate that scale. The right near-term move is a
small explicit render plan around the current Three renderer:

| LBH pass | Purpose | Contract |
|----------|---------|----------|
| `fabricSource` | Composer-owned fluid/ASCII source | produces canonical fabric texture |
| `voidDepth` | stars, dark parallax, lens depth | no gameplay truth |
| `gravityContours` | well/rift/inhibitor fabric emphasis | reads sim state only |
| `entityEchoes` | ships, wrecks, portals, stars, fauna | render facts from snapshots/events |
| `vfxEvents` | pooled particles and screen accents | bounded, renderer-neutral event input |
| `asciiComposite` | final product surface | canonical visual capture path |
| `hudBridge` | DOM/canvas readable UI | UI truth stays outside Three |
| `debugOverlay` | pass stats, budgets, fixture labels | test/dev only |

Each pass should declare:

- inputs and outputs
- render target size
- quality tier
- debug fixture/view
- target budget in milliseconds
- whether it participates in social/promotional captures

This keeps the Three scene free to get richer without hiding gameplay or
platform assumptions inside ad hoc scene objects.

### Materials And Instancing

Trinity's material/effect system is data-driven and permutation-heavy. LBH does
not need that machinery, but it does need a registry of named material
families:

- `asciiFabric`
- `gravityContour`
- `entityEcho`
- `shipContactMatte`
- `thrusterWake`
- `portalAperture`
- `inhibitorShard`
- `titleFault`
- `scanNoise`

The rule: no one-off shader uniforms scattered through gameplay or fixture
code. Material definitions should own uniforms, debug defaults, quality
variants, and Deck/web constraints.

Trinity's instance-data classes reinforce another practical point: large fields
of similar objects should be instance/buffer driven. LBH's wreck flecks,
starfield, debris, route glyphs, particles, and distant fauna should eventually
use pooled/instanced structures, not per-frame object churn.

### Postprocess And UI

Trinity treats postprocess as part of the product surface and composites UI
after the scene/post chain. LBH's equivalent stance:

- the final ASCII/CRT output is the player-facing visual truth
- raw pre-ASCII captures are diagnostics
- bloom, vignette, chromatic effects, scanlines, and future VFX need budgets
- DOM/canvas UI stays readable and authoritative for menus/HUD
- Three can add world-space/diegetic echoes, not own text-heavy UI state

This matches the current v0.2 UI/VFX split.

## Resources, Builds, And Assets

Carbon's resource group docs describe human-readable manifests with version,
resource count, compressed/uncompressed size, relative path, location, checksum,
and patch/bundle variants:

- <https://github.com/carbonengine/resources/blob/main/doc/source/DesignDocuments/resourceGroupFileFormat.rst>

LBH does not need Carbon's patcher. It should adopt the habit:

- build artifact manifests
- capture-pack manifests
- asset source/processed-output manifests
- checksum and commit hash on every deck/itch/Steam test artifact
- intended surface: gameplay, fixture, promo, store, debug

The same applies to art assets. Carbon Mesh handles mesh/skeleton/animation
serialization; LBH's smaller equivalent is a manifest-backed pipeline for
pixel/low-poly top-down assets with source file, processed texture, scale,
anchor, filter mode, pass, and validation status.

## Audio And Dense Effects

Carbon Audio is Wwise-based and not a direct LBH dependency:

- <https://github.com/carbonengine/audio>

The idea to mine is metadata-driven prioritization. Sounds should carry
category, radius, loop/one-shot, and vital/non-vital flags. Vital game events
must survive culling.

The spatial audio clustering plugin is the more immediately useful concept:

- <https://github.com/carbonengine/spatial-audio-clustering>

It groups dense nearby sources into centroid emitters to preserve the spatial
impression under a hard object budget. LBH can use the same design at a smaller
scale:

- player, portal, inhibitor, death, and command-confirm sounds are vital
- nearby visible hazards beat distant ambience
- debris/wreck/fauna fields can cluster by screen/world distance
- dense VFX particle sounds should share emitters instead of spawning one sound
  per visual fleck
- debug HUD should show active voices, clustered groups, and culled events

## What Not To Copy

Do not copy:

- Carbon's C++/Python service lattice
- EVE-specific ship movement, solar-system topology, corporation/alliance
  visibility, harmonics, or bubble semantics
- Wwise as a prerequisite for LBH audio
- Perforce/private dependency assumptions
- native renderer backend complexity before LBH's Three path is stable
- renderer-owned gameplay state

Do copy, in LBH scale:

- stamped authority
- explicit relevance lanes
- snapshot/rebase tests
- bounded work queues
- render pass names and budgets
- material/asset manifests
- profiler/debug surfaces that make drift obvious

## Candidate Follow-Up Tickets

1. **Sim action journal:** add a bounded per-run event log with timestamps,
   event kind, source, payload, and replay/debug hooks.
2. **Snapshot/rebase harness:** add tests for stale event drop, late event
   merge, run reset, and renderer correction after replay.
3. **Render plan descriptor:** centralize the Three pass list with names,
   inputs, outputs, budgets, fixture ownership, and capture policy.
4. **Material registry:** move ad hoc Three material/shader setup into named
   material families with quality variants.
5. **Route graph fixture:** create a static topology view over map seeds with
   dynamic cost overlays for signal, portals, inhibitors, and scavenger fields.
6. **Asset/capture manifest:** record commit, version, checksum, source mode,
   target platform, and intended use for release builds and promo captures.
7. **Audio priority budget:** define vital sounds, clusterable families, max
   active voices, and debug counters before adding more reactive audio.

## Bottom Line

Carbon's most valuable message for LBH is discipline. Large simulations survive
because authority is explicit, history is stamped, relevance is bounded,
rendering is pass-owned, assets are manifest-backed, and performance is visible.
LBH should stay small and weird, but it should borrow that seriousness now while
the v0.2 architecture is still malleable.

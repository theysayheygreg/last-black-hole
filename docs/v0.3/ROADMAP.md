# v0.3 Roadmap: Ballpark Authority

## Status

**Planning branch:** `codex/v0.3-ballpark-roadmap`

**Target line:** v0.3, after the v0.2 demo/build line is stable enough to show
publicly.

v0.3 should make Last Singularity feel less like a successful game-jam stack
and more like a small production game architecture. The key move is to give the
authoritative sim a boring, inspectable "Ballpark Lite" kernel that owns dynamic
world bodies, spatial queries, lifecycle, stamped events, and replication-ready
state. This keeps the current custom physics and ASCII-fluid identity, while
making later multiplayer, more entities, and alternate render targets less
fragile.

## Why This Release Exists

The v0.2 line proved the important product shape:

- server-authoritative local runs exist;
- Three is the default renderer direction;
- Deck and desktop packages are real targets;
- the UI/VFX identity is moving from prototype to product language;
- the game has enough content to play, capture, and tune.

The remaining risk is structural. Player movement, wrecks, portals, scavengers,
stars, planetoids, Inhibitors, events, snapshots, and renderer projection still
carry too many local assumptions from earlier refactors. The Carbon Engine read
reinforced a useful pattern: complex space games stay tractable when one clear
sim authority owns dynamic objects, history is stamped, relevance is explicit,
and renderers consume contracts instead of guessing state.

v0.3 should install those contracts in LBH-sized form.

## Release Goals

1. **Create a Ballpark Lite authority layer.** Dynamic bodies get stable IDs,
   generation counters, lifecycle state, radii, masks, replication lanes, and a
   spatial index instead of living only as bespoke arrays.
2. **Make movement and collision query one source of truth.** Player, AI,
   wreck, portal, well, star, and hazard interactions query the same body/world
   helpers and coordinate utilities.
3. **Add stamped events and snapshot discipline.** The sim keeps a bounded
   event journal and snapshot ring for debug, replay, late-event tests, future
   correction, and future multiplayer.
4. **Keep ECS-ready shape without forcing ECS now.** Systems can stay plain
   functions, but data is grouped in component-shaped stores so a future ECS
   migration becomes mechanical instead of conceptual.
5. **Make renderer contracts explicit.** Three gets a render-plan descriptor,
   material registry, and renderable hints from snapshots/events. It does not
   own gameplay truth.
6. **Upgrade the harness for structure, not only symptoms.** Tests should catch
   mismatched coordinate assumptions, unbounded sim growth, stale events,
   duplicate bodies, query drift, and renderer-owned gameplay before playtest.

## Non-Goals

- Do not port to Carbon, Destiny, Trinity, Godot, Metal, or a native engine in
  v0.3.
- Do not promise public multiplayer. Build the sim contracts as if multiplayer
  will return, but ship single-player/local authority first.
- Do not make GPU fluid the authoritative collision layer. The fluid can drive
  forces, visuals, and route readability; entity contact remains sim-owned.
- Do not turn the whole codebase into ECS before the value is proven.
- Do not rewrite UI/VFX merely because the sim architecture changes.
- Do not merge unfinished v0.3 architecture into `main` while `main` is needed
  for v0.2 demo fixes.

## Architecture Target

### Ballpark Lite

Add a small authoritative world kernel under `scripts/sim/` that owns dynamic
run bodies and query services. Browser-side `src/sim/*` may get adapters, but
the future authority belongs server-side first because that is where the local
stack already owns gameplay consequences.

Core concepts:

| Concept | Purpose |
|---------|---------|
| `SimBody` | Hot transform, velocity, radius, mass, masks, lifecycle, owner, and replication lane. |
| Public entity id | Existing snapshot/event ids stay stable and human-readable. |
| Internal handle | Numeric `{ slot, generation }` style refs stay private to the sim. |
| Generation counter | Prevents stale handles from touching recycled bodies. |
| Lifecycle state | `spawning`, `alive`, `dying`, `dead`, `removed`, with tick stamps. |
| Collision mask | Declares what can physically interact. |
| Interaction mask | Declares what can trigger pickups, extraction, signal, or abilities. |
| Replication lane | `self`, `near`, `global`, `debug`, `cinematic`, or `vfx`. |
| Spatial index | Fast toroidal circle/AABB/nearest queries through a uniform grid. |
| Stats | Body counts, query counts, broadphase cost, stale-id rejects, and churn. |

Initial component-shaped stores:

- `Transform`: `wx`, `wy`, previous position, wrapped displacement helpers.
- `Motion`: `vx`, `vy`, acceleration, max speed, movement mode, force source.
- `Collider`: radius, collision mask, interaction mask, grace or contact flags.
- `ForceEmitter`: wells, stars, planetoids, pulses, slingshot anchors, anomalies.
- `Pickup`: cargo, wreck state, vault/echo metadata, loot radius.
- `Portal`: capture radius, stability, destination/end state, final flag.
- `Threat`: scavenger/fauna/Inhibitor tracking and damage/contact behavior.
- `SignalSource`: signal class, intensity, decay, visibility lane.
- `RenderableHint`: category, silhouette key, material family, label/debug state.
- `Replication`: lane, last-changed tick, dirty flags, owner/client visibility.

This is intentionally ECS-ready, not ECS-mandatory. v0.3 should first prove the
shape with plain JavaScript modules and tests.

Migration rule: do not create duplicate truth. During the transition, existing
arrays/maps remain the materialized v0.2 protocol view while the registry is
introduced as an internal mirror. A gameplay lane only becomes Ballpark-owned
after its parity tests are in place and the old inline helper can be removed or
demoted to view construction.

Use a toroidal uniform grid before considering a quadtree. LBH's current world
is wrapped, dense, and radius-query heavy; a quadtree adds ceremony before the
project has evidence it needs that complexity.

### Sim Granularity

v0.3 should name the update cadence instead of letting every subsystem imply
its own clock.

| Cadence | Ownership |
|---------|-----------|
| 15 Hz | authoritative player integration, collision, pickup, extraction, well contact, and pulse contact |
| 5-10 Hz | AI decisions, spawn/relevance budgeting, and expensive proximity planning |
| 1-2 Hz | collapse/growth/macro pressure, route-cost refresh, and large-map economy pressure |
| profile-driven | coarse field and other scale-dependent approximations |

The Ballpark registry updates every authority tick. Lifecycle removals flush at
tick boundaries so snapshots, events, and renderer facts cannot see half-deleted
entities.

### Event Journal And Snapshots

The sim should keep a bounded event journal per run with monotonic sequence ids
and sim ticks. Events should be meaningful player/world facts, not every frame
of movement.

Candidate event families:

- `player.input`, `player.thrust`, `player.brake`, `player.pulse`
- `movement.slingshotCaptured`, `movement.slingshotReleased`
- `body.spawned`, `body.updatedMode`, `body.dying`, `body.removed`
- `cargo.pickedUp`, `cargo.dropped`, `cargo.lost`
- `portal.spawned`, `portal.decayed`, `portal.entered`, `portal.extracted`
- `signal.spike`, `signal.zoneChanged`
- `inhibitor.formChanged`, `inhibitor.glitch`, `inhibitor.contact`
- `run.started`, `run.ended`, `run.reset`, `run.timeout`

Snapshots should include:

- protocol version;
- `snapshotId`, `baselineSnapshotId`, run id, and map id;
- tick, sim time, and server time;
- body schema version;
- snapshot schema version;
- world scale;
- player bodies and authored world anchors;
- dynamic body lists by category/lane;
- recent event watermark / `lastEventSeq`;
- sim stats and optional debug counters.

The client can still render locally at its own frame rate. The important change
is that snapshots and events become debuggable products of one kernel.

### Renderer Contract

Three should consume snapshots, renderable hints, and renderer-neutral VFX
events. It should not inspect gameplay arrays and invent local truth.

Add a compact render-plan descriptor:

| Pass | Purpose | Budget Direction |
|------|---------|------------------|
| `fabricSource` | sim-fed fluid/ASCII source and gravity contours | strict |
| `voidDepth` | stars, dark parallax, backdrop depth | low |
| `entityEchoes` | player, AI, wrecks, portals, stars, fauna, route anchors | medium |
| `vfxEvents` | pooled particles and screen/world accents | bounded |
| `asciiComposite` | canonical product surface | strict |
| `hudBridge` | DOM/canvas UI above scene/post chain | readable |
| `debugOverlay` | pass stats, labels, fixture markers | dev only |

Each pass declares inputs, outputs, quality tier, render target size, debug
view, approximate budget, capture participation, and Deck caveats.

## Delegated Workstreams

These are written as subagent-ready packets. Each packet has a distinct owner
and expected output, so the main thread can coordinate without stepping on work.

### A. Ballpark Kernel

**Owner:** sim-core worker

**Primary files/modules:**

- `scripts/sim/body-registry.cjs`
- `scripts/sim/body-schema.cjs`
- `scripts/sim/spatial-index.cjs`
- `scripts/sim/sim-queries.cjs`
- `scripts/sim/lifecycle.cjs`
- `scripts/sim/body-masks.cjs`
- `scripts/sim-runtime.cjs`
- `scripts/sim-protocol.cjs`
- `tests/body-registry.cjs`
- `tests/spatial-index.cjs`
- `tests/sim-authority-registry.cjs`
- `docs/design/TEST-HARNESS.md`

**Tasks:**

- Implement stable id allocation with generation counters.
- Add body lifecycle states with created/changed/removed tick stamps.
- Add toroidal `queryCircle`, `queryAABB`, `nearest`, and mask-filtered query
  helpers.
- Register players, wells, stars, wrecks, portals, planetoids, scavengers,
  sentries, fauna, and wave/query emitters as internal bodies without changing
  public snapshot shape.
- Add broadphase stats for body count, query count, candidates, rejects, and
  elapsed time.
- Add schema validation for required body fields.
- Keep `scripts/sim-runtime.cjs` behind an adapter initially; do not migrate
  all gameplay loops in the first commit.

**Acceptance:**

- Unit tests cover insert/update/remove/recycle, stale id rejection, wrapped
  distance queries across world edges, deterministic query ordering by distance
  then handle/public id, mask filtering, and query stats.
- No current gameplay behavior changes when the kernel is present but not yet
  authoritative.
- Snapshot/event JSON stays unchanged for v0.2 clients until a deliberate
  protocol version bump.

### B. Movement And Body Adapters

**Owner:** movement/physics worker

**Primary files/modules:**

- `scripts/sim-runtime.cjs`
- `scripts/sim/player-movement.cjs`
- `scripts/sim/movement-integrator.cjs`
- `scripts/sim/flow-sample.cjs`
- `scripts/coarse-flow-field.cjs`
- `src/physics.js`
- `src/coords.js`
- `src/sim/flow-field.js`
- `src/sim/sim-client.js`
- `tests/remote-authority.cjs`
- `tests/physics.cjs`

**Tasks:**

- Extract the authoritative movement step into a small deterministic module.
- Mirror player, scavenger, wreck, portal, star, and planetoid runtime objects
  as Ballpark bodies.
- Replace nearest/relevance helper calls gradually: nearest well, nearest
  portal, nearest unlooted wreck, pulse radius scans, pickup checks, extraction
  checks, and `buildRelevanceView`.
- Preserve the current movement feel while routing body positions/radii through
  shared coordinate and world-distance helpers.
- Add explicit movement modes: drift, thrust, brake, slingshot approach,
  slingshot capture, slingshot release, inhibited, dying.
- Expose movement debug stats: current source force, flow sample, body speed,
  correction count, and last authoritative tick.

**Acceptance:**

- Existing authority movement tests still pass.
- A golden-step fixture can run the same input sequence and compare movement
  within a small tolerance before/after adapter migration.
- Deep-field relevance avoids per-player full-array sorts.
- No inline coordinate flips or renderer-local radius math appear in the moved
  code.

### C. Interaction And Collision Migration

**Owner:** gameplay-systems worker

**Primary files/modules:**

- `scripts/sim-runtime.cjs`
- `scripts/sim/interactions.cjs`
- `scripts/sim/body-radii.cjs`
- `scripts/sim/body-masks.cjs`
- `tests/remote-authority.cjs`
- `tests/inhibitor.cjs`
- `tests/controller.cjs`

**Tasks:**

- Move pickup, portal capture, well death, scavenger bump/contact, star push,
  planetoid/comet push, pulse contact, and Inhibitor contact to Ballpark
  queries one family at a time.
- Centralize body radii and interaction masks.
- Make collision grace/near-miss rules explicit, especially near wells and
  portals.
- Emit contact/interact events from the same code path that mutates gameplay.

**Acceptance:**

- Well death, portal extraction, loot pickup, and scavenger contact tests pass
  from authoritative snapshots.
- A local playtest can no longer die to a well that is not represented by the
  authoritative body/contact radius.
- Query stats stay bounded on 10x10 maps.

### D. Event Journal, Snapshots, And Replication Lanes

**Owner:** protocol/network worker

**Primary files/modules:**

- `scripts/sim-event-journal.cjs`
- `scripts/sim-snapshot-ring.cjs`
- `scripts/replication-lanes.cjs`
- `scripts/relevance-view.cjs`
- `scripts/sim-protocol.cjs`
- `scripts/sim-runtime.cjs`
- `src/sim/sim-client.js`
- `src/main.js`
- `src/test-api.js`
- `docs/project/LOCAL-PROTOCOL.md`
- `tests/protocol-journal.cjs`
- `tests/snapshot-rebase.cjs`
- `tests/remote-authority.cjs`
- `tests/sim-lifecycle.cjs`

**Tasks:**

- Replace the current small `recentEvents` ring with a stamped event journal
  that has sequence ids, tick stamps, run ids, and bounded retention.
- Add snapshot watermarks: `lastEventSeq`, `bodySchemaVersion`, and
  `snapshotSchemaVersion`.
- Add protocol envelope fields: `snapshotId`, `baselineSnapshotId`,
  `serverTime`, `eventSeq`, and capability metadata.
- Add lanes for `global`, `playerLocal`, `neighborhood`, `vfx`, `debug`, and
  `cinematic` events.
- Add `GET /events?since=<seq>&lane=<lane>` behavior without making the
  renderer parse every snapshot diff as an event.
- Add a small snapshot ring for debug/rebase tests.
- Track stale/future/duplicate event counters.
- Keep sim update relevance separate from replication interest. Relevance
  decides work cost; lanes decide what each client can or must know.

**Acceptance:**

- Tests cover stale events, late events, duplicate sequence handling, run reset,
  empty event windows, and snapshot watermark continuity.
- Tests prove duplicate events do not double-play VFX and reset snapshots
  invalidate old event streams.
- The remote client can continue to render from snapshots while also consuming
  explicit events for VFX and result narration.
- The contract is multiplayer-minded, even though public multiplayer is not a
  v0.3 feature promise.
- Do not build public hosting, WebSockets, matchmaking, or lobby UX in this
  slice. Full snapshots first, journal second, deltas third.

### E. Renderer Plan And Material Registry

**Owner:** render-contract worker

**Primary files/modules:**

- `src/render-three/three-renderer.js`
- `src/render-three/render-plan.js`
- `src/render-three/material-registry.js`
- `src/render-three/entity-visuals.js`
- `src/render-three/visual-style.js`
- `src/render-three/vfx/`
- `src/maps/renderer-fixtures.js`
- `tests/renderer.cjs`
- `tests/perf-probe.cjs`
- `tests/vfx.cjs`

**Tasks:**

- Add a render-plan descriptor for pass names, inputs, outputs, quality tiers,
  fixture ownership, capture policy, debug views, and budget targets.
- Add a material family registry for `asciiFabric`, `gravityContour`,
  `entityEcho`, `shipContactMatte`, `thrusterWake`, `portalAperture`,
  `inhibitorShard`, `titleFault`, and `scanNoise`.
- Add entity visual hints: category, role color, matte policy, VFX family,
  label policy, priority, and culling lane.
- Consume `RenderableHint` data from snapshots/events instead of coupling
  visuals to gameplay arrays.
- Report pass costs, draw calls where available, object counts, material
  counts, pooled objects, particle counts, VFX drops, matte coverage, snapshot
  bytes, and capture mode.
- Keep final ASCII capture as the product truth; raw scene/debug captures
  remain diagnostics.
- Keep `visualReference` and `shipBakeoff` as development fixtures, and add
  representative gameplay captures for production reads.

**Acceptance:**

- Renderer fixtures prove all major entity families are present, readable, and
  backed by the intended material families.
- Deck/default quality budgets remain visible in test output.
- VFX counts return to baseline after idle states.
- `vfx.enabled=false` and `renderQuality=minimal` do not change gameplay state.
- Labels-off Deck captures still separate player, threat, salvage, route
  anchor, ecology, and anomaly.

### F. Harness, Perf, And Observability

**Owner:** harness/perf worker

**Primary files/modules:**

- `tests/run-all.cjs`
- `tests/suite-manifest.cjs`
- `tests/perf-probe.cjs`
- `tests/sim-lifecycle.cjs`
- `tests/sim-scale.cjs`
- `tests/remote-authority.cjs`
- `tests/visual-reference.cjs`
- `docs/design/TEST-HARNESS.md`
- `docs/project/BUILD-STATUS.md`

**Tasks:**

- Add a `sim-structure` lane for Ballpark, event journal, snapshot schema, and
  lifecycle tests.
- Add a deterministic long-run bounded-growth test for match reset, title/death
  idle, and event/body retention limits.
- Add perf probes for body count, query count, event count, snapshot bytes,
  render pass costs, and tick time.
- Keep fresh sim/browser reset rules explicit for all playtest-style tests.
- Make visual-reference fixtures judge contrast/readability, not just blank
  frames.

**Acceptance:**

- `npm run test:fast` stays cheap.
- Full harness can prove no unbounded body/event/snapshot growth over a bounded
  simulated run.
- A failed test points to the contract that drifted: coords, sim body, event,
  snapshot, renderer pass, or UI readability.

### G. Branch Stewardship And Integration

**Owner:** main coordinator

**Primary files/modules:**

- `docs/v0.3/`
- `docs/v0.2/ROADMAP.md`
- `docs/project/ROADMAP.md`
- `docs/journal/DECISION-LOG.md`
- `docs/journal/CHANGELOG.md`

**Tasks:**

- Keep v0.3 commits small and reviewable.
- Merge `main` into the v0.3 branch after v0.2 demo fixes land.
- Avoid backporting structural work to `main` unless a small fix is independently
  useful for v0.2.
- Keep docs current when a workstream changes architecture or acceptance gates.
- Use subagents for independent slices, with disjoint write scopes.

**Acceptance:**

- `main` stays demo-focused.
- v0.3 remains reviewable, not a hidden mega-rewrite.
- Every structural commit explains its migration mode: scaffold, adapter,
  system migration, harness gate, or cleanup.

## Milestones

### v0.3.0-prep - Plan And Baseline

- Land this roadmap and branch contract.
- Confirm existing v0.2 tests and build status before structural work.
- Add empty v0.3 harness placeholders only if they do not affect mainline tests.

### v0.3.1 - Ballpark Kernel

- Add body schema, lifecycle, spatial hash, masks, and query tests.
- No gameplay migration yet except optional read-only body mirror diagnostics.

### v0.3.2 - Movement Mirror

- Mirror players and major world objects into Ballpark bodies.
- Extract movement step and compare against golden fixture tolerances.
- Add movement/body debug stats.

### v0.3.3 - Interaction Migration

- Migrate one interaction family at a time to Ballpark queries.
- Prioritize well death, portal capture, wreck pickup, scavenger contact, and
  star/planetoid push.

### v0.3.4 - Event Journal And Snapshot Ring

- Add stamped event journal, event watermarks, snapshot schema version, and
  snapshot ring.
- Add stale/late/duplicate/reset tests.

### v0.3.5 - Renderer Contract

- Add render-plan descriptor, material registry, and renderable hints.
- Keep final ASCII captures canonical while exposing pass diagnostics.

### v0.3.6 - Feel And Route Re-Tune

- Retune movement, slingshot, route readability, spawn safety, and near-well
  grace against the new authority structure.
- Confirm the player can intentionally move without hidden renderer/client
  assumptions.

### v0.3 RC - Public-Ready Architecture Gate

- Local source playtest passes.
- Steam Deck build is playable in Gaming Mode.
- Harness passes structure, authority, renderer, UI, and lifecycle lanes.
- Snapshots/events/render passes have clear budgets.
- v0.2 demo fixes from `main` are merged into the branch.

## Migration Options And Position

### Recommended: Custom Ballpark Lite

**Pros:**

- Fits LBH's toroidal space, fluid forces, and authored map scale.
- Solves the immediate problem: scattered entity loops and contact assumptions.
- Keeps server authority clear.
- Makes multiplayer contracts and ECS migration easier later.
- Avoids importing a large generic physics or ECS dependency.

**Cons:**

- We own broadphase/query correctness.
- We must write good tests around wrapping, stale ids, and lifecycle.
- It does not magically solve movement feel; it only makes feel tunable in one
  place.

**Position:** Do this first.

### Alternative: Adopt ECS Immediately

**Pros:**

- Better data layout discipline.
- Clear system ordering.
- Could scale to more entity types.

**Cons:**

- High churn before the code has a clean body/query boundary.
- Does not decide authority, events, movement, or replication on its own.
- Risks turning v0.3 into framework migration instead of game production.

**Position:** Do not start here. Make the Ballpark data ECS-shaped so ECS can
arrive later if it earns the cost.

### Alternative: Add A Physics Engine

**Pros:**

- Mature collision primitives and sweep tests.
- Useful if LBH grows complex rigid-body interactions.

**Cons:**

- Current gameplay is mostly circles, radii, flow, and authored contact rules.
- Generic physics may fight fluid movement and toroidal wrapping.
- Adds dependency and port/build risk for Deck/web without clear benefit.

**Position:** Spike only if Ballpark queries fail a concrete use case.

### Alternative: Native/Rust/C++ Sim

**Pros:**

- Long-term performance and portability headroom.
- Easier future native console story.

**Cons:**

- Too early. Current bottleneck is architecture clarity, not JS raw speed.
- Slows iteration and web/Deck packaging.
- Makes v0.2 demo fixes harder to share.

**Position:** Table until the JS contracts are clean and measured.

## Release Gates

v0.3 is not ready until:

- movement still feels good after the sim structure changes;
- contact, pickup, extraction, and death are all sim-owned through shared query
  helpers;
- snapshots and events are stamped, bounded, and reset correctly;
- renderer output is driven by snapshot/renderable hints and event streams;
- no renderer/client code owns gameplay outcomes;
- test harness proves no unbounded growth in bodies, events, snapshots, or VFX;
- Deck/default quality budgets are visible and acceptable;
- `main` v0.2 demo fixes have been merged forward.

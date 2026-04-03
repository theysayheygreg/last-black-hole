# Map Load Performance — Optimization Targets

> Noticeable hitch on map start, worse on larger maps. These are the likely hot paths.
> Loading screen covers the UX gap. This doc is the optimization backlog for Codex.

---

## Observed Behavior

- Visible frame hitch when starting any map from map select
- Hitch duration scales with map size (Shallows < Expanse < Abyss)
- Feels like 200-500ms on Shallows, potentially 1s+ on larger maps
- Occurs between "start run" input and first rendered frame of gameplay

## Likely Hot Paths (in order of suspicion)

### 1. Coarse Flow Field Construction
`buildCoarseFlowField()` in `coarse-flow-field.js` — builds a spatial grid from all wells + wave rings. Grid size scales with worldScale and cellSize. For large maps this could be tens of thousands of cells, each computing gravity/current contributions from every well.

**Optimization opportunities:**
- Lazy build (build on first sample, not on init)
- Incremental build (only rebuild cells near changed wells)
- Lower initial resolution, refine over first few ticks
- Background worker thread for field construction

### 2. First Snapshot Size
`snapshotBody()` in `sim-runtime.js` — the first snapshot contains the full world state: all wells, stars, wrecks (with loot arrays), planetoids, portals, scavengers, fauna, sentries, AI players, inhibitor state. This is serialized to JSON and sent over HTTP.

**Optimization opportunities:**
- Delta snapshots (first full, subsequent diffs)
- Compress snapshot payload (gzip on HTTP response)
- Split initial load: send wells/stars first (needed for rendering), defer entities
- Lazy entity inclusion (don't send fauna/sentries until client camera is near them)

### 3. AI Player Spawning
`spawnAIPlayers()` — creates 3 AI players with full PlayerBrain resolution, ability state, personality weights, safe spawn position search. Each `createPlayerBrain()` call resolves hull coefficients, rig upgrades, and artifact effects.

**Optimization opportunities:**
- Pre-compute AI brains (they don't have artifacts or rig upgrades, so brain is just hull base)
- Defer AI spawn to first tick instead of session init
- Stagger AI spawns across first 3-5 ticks

### 4. Wreck Loot Generation
`generateWreckLoot()` — called for every initial wreck in `cloneMapState()`. Each wreck rolls tier, picks items from catalog, generates instance IDs. Map wrecks × items per wreck = potentially 20-30 item rolls on init.

**Optimization opportunities:**
- Defer loot generation to first access (generate when player approaches, not on spawn)
- Pre-roll loot tables into a pool, draw from pool instead of per-wreck RNG
- Cache catalog tier pools (currently rebuilt on every roll)

### 5. Session Registry + Control Plane Bootstrap
`startSession()` registers with the control plane, bootstraps profiles, upserts session metadata. These are synchronous file I/O operations (JSON read/write to disk).

**Optimization opportunities:**
- Async file I/O (currently blocking the event loop during init)
- Cache profile data in memory, write-behind to disk
- Batch control plane writes

### 6. Client-Side: Fluid Sim Cold Start
Not server-side, but the client's WebGL fluid sim needs to compile shaders, allocate framebuffers, and run initial pressure iterations on the first frame. This is a one-time GPU cost that compounds with the server init delay.

**Optimization opportunities:**
- Pre-warm shaders during map select (compile before user clicks "start")
- Run first few fluid iterations during loading screen
- Reduce initial pressure iterations (visual quality ramps up over first second)

## Measurement Plan

Before optimizing, instrument these:
1. `console.time('coarseField')` around `buildCoarseFlowField()`
2. `console.time('snapshot')` around first `snapshotBody()` call
3. `console.time('aiSpawn')` around `spawnAIPlayers()`
4. `console.time('wreckLoot')` around wreck loot generation loop
5. `console.time('sessionInit')` around full `startSession()`
6. Measure first-snapshot HTTP response size in bytes

Log these to `tmp/perf-init.log` so we can compare before/after.

## Priority

Loading screen (UX bandaid) ships first. Optimization is follow-up work.
Likely biggest wins: #1 (coarse field) and #2 (snapshot size).

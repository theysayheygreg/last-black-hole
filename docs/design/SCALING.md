# Scaling: From Solo to Multiplayer, From Small to Vast

> How Last Singularity grows from a single-player jam game to a shared universe.

---

## Player Scaling: 1 → 10 → 100

### Phase 1: Solo (Jam Week)
What we're building. One player, AI scavengers, local simulation.

- All physics runs client-side
- AI scavengers simulate other "players" — they use portals, compete for loot, create time pressure
- The game is designed so that scavengers already teach the player the multiplayer dynamics: portal competition, signal awareness, territorial behavior
- **Key insight:** if the solo game feels like a multiplayer game with bots, the multiplayer transition is smooth

### Phase 2: Small Lobby (2-3 Players — Stretch Goal)
Greg wants this but it's a labeled stretch goal, not the jam plan. No networking code unless we're ahead by Thursday. The jam build uses clean architecture that *happens* to be multiplayer-ready (separate sim from rendering, entity state as plain data). See DECISION-LOG.md multiplayer entry.

**Architecture: Authoritative Server + Client Prediction**

```
┌──────────────┐         ┌──────────────┐
│  Client A    │◄──WS───►│              │
│  (renders,   │         │   Server     │
│   predicts)  │         │  (fluid sim, │
├──────────────┤         │   physics,   │
│  Client B    │◄──WS───►│   state)     │
│              │         │              │
├──────────────┤         ├──────────────┤
│  Client C    │◄──WS───►│  Fluid sim   │
│              │         │  runs HERE   │
└──────────────┘         └──────────────┘
```

- **Server owns the fluid sim.** The simulation is deterministic given the same inputs. Server runs the canonical sim, broadcasts fluid state snapshots at ~10Hz (not 60 — too much bandwidth).
- **Clients interpolate.** Between server snapshots, clients run their own fluid sim forward (prediction). On snapshot arrival, blend toward server state. Fluid is continuous and smoothly varying, so interpolation looks natural — you won't see "corrections" like you would with rigid body netcode.
- **Player inputs are thin.** Each tick: thrust direction (vec2) + thrust on/off (bool). ~12 bytes per player per tick. At 30 ticks/sec, 10 players = 3.6 KB/s total. Trivial.
- **State broadcasts are fat but compressible.** Fluid state is a 2D grid of density + velocity (3 floats per cell). At 128×128 grid: 196KB raw per snapshot. But fluid state is spatially coherent → delta compression + quantization gets this to ~10-20KB per snapshot. At 10Hz = 100-200KB/s. Manageable for WebSocket.
- **Entity state is small.** Ship positions, wreck states, portal status, signal levels — maybe 1KB per snapshot for 10 players + 20 entities.

**Signal mechanic becomes social.** Your signal isn't just attracting AI — it's visible to other players. The dark forest logic applies to humans: do you trust that other surfer, or are they going to race you for the last portal?

**Portal competition is real.** In solo, scavengers using portals creates time pressure. In multiplayer, another human extracting through YOUR planned exit is devastating. Alliances form around portal access.

**Inhibitor becomes collective threat.** Signal is summed across all players. One noisy player can wake the Inhibitor for everyone. Social pressure to play quietly. Blame when someone doesn't.

**What changes from solo:**
- AI scavengers reduced or removed (humans replace them)
- Portal count scales with player count (but not linearly — 10 players, 6-8 portals)
- Wreck density increases (more loot to distribute)
- Universe size increases (see below)
- Match length might increase to 12-15 minutes (more space, more drama)

### Phase 3: Large Scale (100 Players)
This is a different game. Not just "bigger lobby" — needs architectural changes.

**The problem:** 100 players in one fluid sim doesn't work. The sim resolution needed to give each player meaningful local physics is too high, and broadcasting full fluid state to 100 clients is too much bandwidth.

**Solution: Spatial Sharding with Fluid Boundaries**

```
┌─────────┬─────────┬─────────┐
│ Shard A │ Shard B │ Shard C │
│ (32×32) │ (32×32) │ (32×32) │
│ ~10 plrs│ ~10 plrs│ ~10 plrs│
├─────────┼─────────┼─────────┤
│ Shard D │ Shard E │ Shard F │
│         │(central │         │
│         │ well)   │         │
├─────────┼─────────┼─────────┤
│ Shard G │ Shard H │ Shard I │
│         │         │         │
└─────────┴─────────┴─────────┘
```

- Universe divided into shards (spatial regions)
- Each shard runs its own fluid sim at high resolution
- Shard boundaries exchange fluid state at edges (like ghost cells in parallel CFD)
- Players only receive full-resolution fluid data for their shard + neighbor shards
- Distant shards send coarse summaries (low-res fluid, entity positions only)

**Gravity wells span shards.** A black hole's force injection extends across shard boundaries. The wave equation runs on a global coarse grid; shard-local fluid sims receive wave forces from the global solver.

**This is hard and we should not think about it during the jam.** But the architecture is designed to allow it:
- Fluid sim is already grid-based → spatial decomposition is natural
- Entity positions are already separate from fluid state
- Signal mechanic is already a global scalar → sums across shards easily

**What 100 players enables (dream version):**
- Faction play — groups of surfers cooperating for portal access
- Territorial control of wreck clusters
- Inhibitor as a server event affecting multiple shards simultaneously
- Emergent dark forest dynamics at scale — trust networks, betrayals, signal wars
- Spectator mode — watch the universe collapse from above as ASCII art

---

## Universe Scaling: Small → Vast

### Jam Week: 4×4 Screens with Frustum
- 4 screens square = 16 total screens of game world (~7680×4320 pixels)
- Fluid sim: 512×512 or 1024×1024 grid (covers full universe)
- **Frustum rendering from day one** — ASCII post-process only on visible viewport + 1 screen buffer
- Camera follows player with edge markers for off-screen entities
- Enough space to "wander" and bump into things without feeling like a fishbowl
- Camera zoom/scale TBD through iteration — the ratio of ship size to visible area drives how "vast" it feels
- Entity updates run everywhere, entity rendering only in frustum

### Medium: Scrollable Universe (Post-Jam)
- 8-16 screens square
- Fluid sim: 1024×1024 grid
- Still runs client-side for solo play

**The frustum optimization:**
```
┌─────────────────────────────┐
│         buffer zone         │
│   ┌─────────────────┐      │
│   │                 │      │
│   │   visible       │      │
│   │   screen        │      │
│   │       ★ ship    │      │
│   │                 │      │
│   └─────────────────┘      │
│                             │
└─────────────────────────────┘

Fluid sim: full universe (GPU doesn't care about camera)
ASCII render: visible + buffer only
Entity update: full universe (cheap)
Entity render: visible + buffer only
HUD: screen-space only
```

The ASCII post-process shader is the biggest per-pixel cost. Only running it on the visible viewport + buffer saves proportional GPU time. The fluid sim itself runs on the full grid regardless — GPU parallelism means viewport doesn't matter for sim cost.

### Large: Many-Screens Universe (Post-Jam v2)
- 32+ screens square
- Fluid sim can't run at full resolution everywhere
- **Multi-resolution fluid:** high-res near player, low-res far away (adaptive mesh refinement)
- Or: **tiled fluid simulation** — run full-res sim on visible tiles, coarse sim elsewhere, blend at boundaries
- Entity AI uses the coarse sim for pathfinding, switches to fine sim when near player viewport

**LOD for ASCII rendering:**
- Nearby: full character resolution, full color, all effects
- Mid-distance: coarser character grid, reduced color palette
- Far: no ASCII render, just colored dots for entity positions on minimap

### Massive: Persistent Universe (Dream)
- The universe IS the server
- Players drop in and out of a continuously-running simulation
- Black holes grow, merge, and eventually consume everything over hours/days
- New universes spawn periodically
- This is an MMO. Different game. Different architecture. But the same core mechanic: surfing spacetime.

---

## Key Scaling Decisions

| Decision | Jam Week | Post-Jam | Dream |
|----------|----------|----------|-------|
| Fluid sim location | Client (solo) / Server (multi) | Server | Server (sharded) |
| Sim resolution | 512-1024 | 1024 | Adaptive per-shard |
| Player count | 1-3 | 2-10 | 10-100+ |
| Universe size | 4×4 screens | 8-16 screens | 32+ screens |
| Networking | WebSocket (stretch) | WebSocket, 10Hz state | WebSocket + WebRTC P2P |
| Entity update | All always | All always | Spatial indexing, LOD |
| ASCII render | Frustum + buffer | Frustum + buffer | Frustum + LOD |

---

## What This Means for the Jam

**Build the solo game as if multiplayer is coming.** Specifically:

1. **Separate simulation from rendering.** The fluid sim should produce a state buffer that the renderer reads. Don't bake rendering into the sim loop.
2. **Entity state as plain data.** Ships, wrecks, portals are data objects with position/velocity/state. The renderer reads them. The AI reads them. A future netcode layer would read/write them.
3. **Signal as a global value.** Track it as a number, not as a rendering effect. The rendering reads the number. A server would broadcast the number.
4. **Deterministic fluid sim.** Same inputs → same outputs. This is how client prediction works later. The PavelDoGreat sim is already deterministic (GPU floating point caveats aside).
5. **Input as a thin event stream.** Player input is thrust direction + on/off + loot/extract actions. Keep this clean and serializable.

None of this adds complexity to the jam build. It's just clean architecture that happens to be multiplayer-ready.

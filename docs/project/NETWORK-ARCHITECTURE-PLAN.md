# Network Architecture Plan

> Move LBH from a single-process jam build toward an authoritative sim with locally rendered clients, without locking the project to the current browser runtime forever.

## The four futures

LBH has four separate architecture futures. They should not be collapsed into one giant rewrite.

### 1. Private remote play on Greg's machines

This is the next real target.

- Mac mini runs the authoritative sim/server.
- MacBook runs a playable local-rendering client.
- Tailscale or local LAN handles transport.
- No public hosting, no account system, no matchmaking.

This is the first useful proof that the sim/client split is real instead of theoretical.

### 2. Hosted authoritative sessions

This is the next future after private remote play works.

The likely shape is run-scoped authoritative instances:

- one player can run solo
- one run can also host 4-8 players
- optional AI fills empty seats in smaller sessions
- the server owns the run and disappears when the run ends

This is a better fit for LBH than a persistent shared world. The game is fundamentally run-based and competitive: everyone is trying to outlast everyone else in the same dying universe.

### 3. Native client/runtime migration

This stays future work for now.

The current browser/Electron stack is good enough to prove the game. It is not sacred. If the protocol and client boundaries become clean, the renderer and packaging can move later without rewriting gameplay assumptions at the same time.

### 4. Engine/runtime port options like Godot

This also stays future work for now.

Godot is viable as a later client/runtime target because it already solves a lot of mature problems: packaging, input, rendering, deployment, and platform support. But it should be treated as a port target after the gameplay and protocol contracts are real, not as a rescue fantasy for current jam problems.

## What matters now

The next week should care about parts 1 and 2 together:

1. prove a private authoritative split between Greg's machines
2. freeze the first local client/server protocol that a hosted future would also use

That means the current work is not "multiplayer features" yet. It is network architecture and state ownership.

## Core decision

LBH is multiplayer-first with solo as fallback.

That means the architecture should optimize for:

- authoritative world truth
- multiple simultaneous human or AI players
- local rendering clients
- run-scoped match instances

It should **not** optimize for:

- a purely local single-player browser loop as the long-term truth
- streamed video/gameplay from the mini to the MacBook
- a persistent MMO-style shared universe

## Server-side shape

The long-term server-side model should be three layers, not one giant server process:

- **Persistent data + control plane** — durable profiles, loadouts, vault state, session registry, host/session lifecycle
- **Authoritative sim instance** — one disposable live run with full gameplay truth
- **Client** — local rendering, input, interpolation, and UI

The detailed design for that split lives in `docs/project/PERSISTENCE-AND-CONTROL-PLANE-PLAN.md`.

## Process model

### Authoritative Sim / Server

The server owns gameplay truth.

It should own:

- player and AI transforms
- velocities and thrust state
- wells, stars, portals, wrecks, comets, scavengers, and future threats
- collisions, extraction, death, and loot outcomes
- run timer and collapse progression
- signal state and later signal-driven threats
- a coarse gameplay-relevant flow model

It should not own:

- the ASCII renderer
- HUD or menus
- audio
- shimmer, glitch, and visual-only fabric effects
- full-resolution client-side fluid polish

### Client

The client renders locally.

It should own:

- input capture
- camera
- HUD and menus
- audio
- render interpolation and prediction
- local visual fluid/fabric reconstruction
- ASCII presentation

The client should receive authoritative snapshots and events, then reconstruct the look locally instead of receiving a streamed framebuffer.

## First protocol boundary

The first protocol does not need to be large.

It should cover:

- input messages from client to server
- state snapshots from server to client
- event messages for extraction, death, pickups, combat, and collapse changes
- local flow/query replies if the client still needs small authoritative field reads

The main job is to freeze the shape of the conversation between client and server while the game is still small.

## Why this comes before native or Godot

The important architectural question is not "what engine do we use?"

It is:

- what does the server own?
- what does the client own?
- what data crosses the boundary?

If those answers are vague, a Godot port or native rewrite just repeats the same confusion in a different runtime.

If those answers are clear, a later client migration becomes much safer.

## Next-week batch

### Batch A — Mini Server + MacBook Client

- run the authoritative sim on the mini
- run a local-rendering client on the MacBook
- connect them over Tailscale or LAN
- prove one playable remote run

Current progress:

- local sim server process exists
- first local protocol exists
- server now owns session state, map snapshots, safe spawns, and well death
- browser client can now opt into remote authority, start a fresh authoritative run, and drive a locally rendered ship from server snapshots
- server now also owns portal waves, extraction, cargo pickup, and the first gameplay-affecting equip effect
- server now also owns scavenger state in remote runs, with the browser rendering scavengers from snapshots instead of local AI
- server now also owns remote consumable activation, active item-state, and pulse cooldown/events
- server now also owns remote inventory/loadout mutation during live runs, including authoritative dropped-item wreck spawning
- same-map clients can now join an existing authoritative run instead of always resetting it
- server now also owns the remaining ship-contact hazards that were still local-only: star push, planetoid push, and scavenger bump collision
- remote clients now also mirror authoritative wave events instead of silently missing server-owned pulse/growth/consumption consequences in the visual layer, and they reconstruct pulse-driven disruption visuals locally so remote runs do not under-report combat feedback
- a later remote browser now joins the live authoritative run by default instead of resetting it to its own selected map
- remote clients can now leave a run without resetting the authoritative session for everyone else
- the session now has real host ownership instead of everyone implicitly being able to behave like a reset authority
- the browser control plane now exposes live session truth instead of hiding it: clients can see the live map, host identity, player count, whether they are the host, and whether launch will join or host-reset
- the authoritative sim now applies explicit map-size clock profiles so `5x5` and `10x10` runs stop paying the same server tick costs as `3x3`
- the authoritative sim now also applies map-size relevance radii so larger maps stop fully updating off-player stars, wrecks, planetoids, and scavenger AI every background tick
- the authoritative sim now also carries explicit AI spawn budgets and per-player hazard caps, so larger-player sessions do not scale linearly just because more remote clients exist
- the authoritative sim now also caps the expensive per-player force/source scans for wells, wave rings, pickups, and extraction checks instead of letting large sessions sum against every candidate every tick
- the authoritative sim now also has an explicit overload state machine, so run degradation is visible session truth instead of scattered implicit slowdown rules
- the authoritative sim now also uses an explicit coarse field for medium and large worlds, so larger-map motion truth is no longer only “the same direct-force model with tighter caps”
- broader lobby/session UX still needs to move over

### Batch B — Local Protocol Freeze

- define the input envelope
- define the snapshot schema
- define the event stream
- define how coarse flow or hazard state is exposed to the client

Current progress:

- `join`, `input`, `snapshot`, `events`, `session/start`, and `maps` now exist
- snapshot already carries world entities and player state
- browser client now actively consumes that protocol in a playable remote-authority mode
- protocol now carries cargo/loadout state closely enough for remote runs to extract and lose loot honestly
- protocol now carries enough world state for remote clients to render rival scavengers from authoritative snapshots
- remote snapshot sync now fully reconciles dynamic stars, wrecks, and planetoids instead of only patching shared index slots, so server-spawned world entities actually materialize on remote clients
- protocol now carries enough player effect state for remote clients to reflect active shield/time-slow and remote pulse cooldown honestly
- protocol now includes discrete authoritative inventory mutation requests instead of forcing loadout changes through local-only UI state
- protocol and browser path now support a second client joining the same running authoritative session
- server-owned scavenger consequence chains now also survive the boundary: remote clients see authoritative death spirals, debris wrecks, and explicit consumed/extracted outcomes instead of only local approximations
- browser clients now also materialize rival players from authoritative snapshots, so the protocol is no longer ahead of the visible multiplayer client
- protocol now has enough debug surface to place a remote player into authoritative hazard cases and prove the server-owned contact math
- protocol and browser path now replay authoritative wave consequences through the remote visual layer instead of leaving remote runs visually quieter than local runs
- browser startup semantics now respect the existing authoritative run as the default truth instead of treating each client as a hidden host reset button
- protocol now includes a leave path so a dead or finished client can exit without acting like a hidden host reset button
- protocol now has real host semantics: first joiner becomes host, only the host can start/reset a live run, and host promotion happens when the host leaves
- protocol/browser integration now exposes that host contract explicitly in map select, and the remote smoke proves a non-host browser sees "join live run" rather than pretending it can reset
- `/maps`, `/health`, and session state now expose map-sized sim clocks, and the browser client respects the authoritative `snapshotHz` instead of polling every map like a small-map session
- `/maps` and session state now also expose map-sized relevance radii so the larger-world cost model is not just a hidden server implementation detail
- `/maps` and session state now also expose AI spawn budgets and per-player hazard caps so future 4–8 player sessions have a visible server budget instead of folklore
- `/maps` and session state now also expose explicit per-player force budgets so authoritative motion cost stays inspectable instead of hiding inside implementation detail
- session state now also exposes `overloadState`, `overloadPressure`, and `timeScale`, and the server projects effective clocks/budgets from that overload state instead of silently mutating subsystem rules
- `/maps` and session state now also expose `fieldTickHz`, `useCoarseField`, `flowFieldCellSize`, and `fieldFlowScale`, and the server now uses that field as the primary large-map source for orbital current, well pull, and wave push
- remote join/start now bootstrap a stable player profile id and durable profile snapshot into the server instead of treating every remote run as stateless
- the sim now mirrors live session metadata into a control-plane/session-registry layer outside the disposable run instance
- the sim now also owns authoritative profile write-back for death, extraction, and leave/abandon, and the browser client resyncs its local profile from that server truth after a remote run
- protocol still needs to absorb more real gameplay systems before it is considered stable

These two batches belong together. The private remote play path is the proof. The protocol is the thing being proved.

## Explicit non-goals for next week

- public internet deployment
- lobby browser or matchmaking
- large-scale hosted infrastructure
- Godot/client rewrite
- native rendering rewrite
- streaming gameplay from the mini instead of local rendering

## Next architecture batch

The first migration is done enough that the next work should stop being generic boundary cleanup.

The next architecture batch is:

1. **PlayerBrain** — box and cache resolved player truth on the server
2. **Overload state machine** — make server degradation explicit and inspectable
3. **Coarse authoritative flow/hazard field** — stop scaling large maps only by force-source caps
4. **Session profiles** — make 1-player, 4-player, and 8-player server intent explicit

The detailed design for this phase lives in `docs/project/PLAYER-BRAIN-AND-OVERLOAD-PLAN.md`.

This batch matters because the server is already authoritative enough to play. The next problem is no longer “can the client and server be split?” It is “can the authoritative server stay coherent and cheap as map size, player count, and sim fidelity rise?”

## Open questions

- How much of the current fluid field should remain gameplay-authoritative versus becoming visual reconstruction only?
- What is the smallest snapshot cadence that still feels good with 4-8 players?
- How much client-side prediction do we need before input lag becomes noticeable?
- Should solo mode eventually mean "one human plus AI rivals" by default instead of a separate ruleset?

## Working position

Build toward an authoritative sim plus local-rendering clients.

Use private mini-to-MacBook play as the first real milestone.

Treat hosted run instances as the likely multiplayer future.

Defer native/Godot decisions until the sim/client contract is real.

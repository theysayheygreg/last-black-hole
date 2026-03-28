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
- true join-existing-session, consumables, and broader combat/gameplay authority still need to move over

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
- protocol still needs to absorb more real gameplay systems before it is considered stable

These two batches belong together. The private remote play path is the proof. The protocol is the thing being proved.

## Explicit non-goals for next week

- public internet deployment
- lobby browser or matchmaking
- large-scale hosted infrastructure
- Godot/client rewrite
- native rendering rewrite
- streaming gameplay from the mini instead of local rendering

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

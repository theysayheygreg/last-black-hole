# Local Protocol

> The first client/server contract for LBH. This is the protocol the MacBook client should speak to the mini-hosted sim before any public hosting exists.

## Purpose

Freeze the smallest viable conversation between:

- an authoritative sim/server
- a locally rendered client

The point is not to finish networking. The point is to stop hiding game-state ownership inside one browser loop.

## Current transport

For the first private milestone:

- transport can be plain HTTP over Tailscale or LAN
- server listens locally on one fixed port
- client polls snapshots and posts inputs
- browser client can opt into remote authority with `?simServer=http://<host>:8787`
- sim server can bind beyond localhost with `LBH_SIM_HOST=0.0.0.0 npm run sim`

This is not the final transport. It is the simplest useful transport for proving the boundary.

## Protocol version

`lbh-local-v1`

## Authoritative clocks

- sim tick: `15 Hz`
- snapshot cadence target: `10 Hz`

The client still renders locally at its own frame rate.

## Core messages

### `GET /maps`

Returns the authoritative playable map catalog.

This is the first step toward a real launch flow where the client does not invent its own map truth.

### `POST /join`

Registers a client/player with the authoritative session.

```json
{
  "type": "join",
  "clientId": "greg-macbook",
  "name": "Greg"
}
```

### `POST /input`

Client input envelope.

```json
{
  "type": "input",
  "clientId": "greg-macbook",
  "seq": 12,
  "moveX": 0.5,
  "moveY": -0.1,
  "thrust": 1.0,
  "pulse": false,
  "consumeSlot": null,
  "timestamp": 1774600000000
}
```

This is intentionally small. It is enough to prove:

- input crosses the process boundary
- the server owns the authoritative player state
- the client is no longer pretending to be the world

### `POST /inventory/action`

Discrete inventory/loadout mutation for authoritative runs.

```json
{
  "type": "inventoryAction",
  "clientId": "greg-macbook",
  "action": "equipCargo",
  "cargoSlot": 2,
  "equipSlot": 1,
  "consumableSlot": -1
}
```

This exists because inventory management is not really part of the continuous input stream. It is a state mutation request against the authoritative run.

### `GET /snapshot`

Authoritative state read.

```json
{
  "type": "snapshot",
  "protocolVersion": "lbh-local-v1",
  "session": {
    "id": "session-id",
    "status": "running",
    "mapId": "rush",
    "worldScale": 5,
    "tickHz": 15,
    "snapshotHz": 10,
    "maxPlayers": 4
  },
  "tick": 42,
  "simTime": 2.8,
  "players": [
    {
      "clientId": "greg-macbook",
      "name": "Greg",
      "wx": 0.2,
      "wy": -0.1,
      "vx": 0.8,
      "vy": -0.2,
      "lastInputSeq": 12
    }
  ],
  "world": {
    "wells": [],
    "stars": [],
    "wrecks": [],
    "planetoids": [],
    "portals": []
  },
  "recentEvents": []
}
```

### `GET /events?since=<seq>`

Pull recent authoritative events without forcing the client to parse every snapshot change as an event.

### `POST /session/start`

Starts or resets the local authoritative run instance.

## Server ownership

The server owns:

- player and AI state
- map identity and entity state
- collisions and run outcomes
- run timer and collapse progression
- item and pickup truth
- future signal truth
- a coarse gameplay-relevant flow model

In the current first slice, the server already owns:

- authoritative session lifecycle
- authoritative player transforms and velocities
- map entity snapshots for wells, stars, wrecks, and planetoids
- safe spawn selection
- well death and run reset boundary

In the current second slice, the browser client already:

- starts a fresh authoritative session from map select
- joins that session with a stable client id
- sends thrust/pulse input across the boundary
- renders locally from authoritative snapshots instead of local player truth

In the current third slice, the server also owns:

- portal wave spawning and expiry
- extraction capture checks
- cargo pickup from wrecks
- cargo loss on death
- the first gameplay-affecting equip effect (`reduceWellPull`)
- authoritative scavenger state for remote runs

In the current fourth slice, the server also owns:

- remote consumable activation
- remote pulse cooldown and pulse events
- shield and time-slow active effect state
- breach-flare portal spawning from authoritative item use

In the current fifth slice, the server also owns:

- remote cargo/equip/consumable slot mutation during live runs
- authoritative dropped-item wreck spawning from inventory actions
- the canonical eight-slot cargo model instead of the old variable-length cargo list
- same-map join-existing-session behavior for remote clients instead of always forcing a reset

## Client ownership

The client owns:

- local rendering
- camera
- audio
- HUD
- local interpolation and prediction
- visual fluid/fabric reconstruction

## Explicit non-goals

- streaming a rendered game view from the mini
- final multiplayer transport
- public hosting
- matchmaking
- Godot/native runtime decisions

## Next step after this protocol

Keep replacing client-owned world truth with server-owned truth behind the same message shapes.

The next useful transfers are:

- coarse authoritative flow sampling
- broader combat consequences beyond pulse events
- real lobby/session selection semantics instead of only "join current same-map run or start one"

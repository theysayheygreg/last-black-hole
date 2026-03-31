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

The first client to join a new run becomes the authoritative session host. If the host leaves, the server promotes another remaining client.

### `POST /leave`

Removes a client from the authoritative session without resetting the run.

```json
{
  "type": "leave",
  "clientId": "greg-macbook"
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

If a run is already active, only the current session host may start/reset it.

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

In the current sixth slice, the server also owns:

- star push and planetoid/comet push on the player ship
- scavenger bump collision against the player ship
- stellar-remnant wreck spawning when stars are consumed by wells
- the first explicit debug/player-state hook for remote-authority validation

In the current seventh slice, the remote client also mirrors the same wave consequences the server now owns:

- remote clients reconstruct authoritative pulse visuals locally from `player.pulse` events, including the shockwave ring, fluid splats, and temporary well-disruption presentation, without re-owning gameplay force math
- remote clients render growth/consumption rings from authoritative `well.grew`, `star.consumed`, and `planetoid.consumed` events
- remote visual mode now updates and injects those rings locally so the presentation layer stays in sync with server-owned contact forces

In the current eighth slice, remote browser startup semantics are also closer to a real multiplayer client:

- if an authoritative session is already running, a new remote browser joins that live run by default instead of resetting it to its own locally selected map
- the client now treats the authoritative session map as the source of truth at launch time, not the stale local menu selection

In the current ninth slice, remote clients can also leave a run cleanly:

- the protocol now supports `POST /leave`
- a remote browser can exit a run without resetting the authoritative session for everyone else
- death/extraction flows no longer force a full server reset just because one remote client is done

In the current tenth slice, the control plane has a real host concept:

- the first joining client becomes the session host
- only the host may start/reset an already-running session
- when the host leaves, the server promotes another remaining client instead of leaving reset authority ambiguous

In the current eleventh slice, the browser client finally exposes that control plane honestly:

- map select now polls and surfaces live session state instead of pretending every remote launch is a fresh host action
- the client now knows whether a live run exists, which map it is on, who the host is, how many players are in it, and whether this browser is the host
- `space/A` is now explicitly the join-or-host action, while `X/Y` is the host-only reset action for the selected map
- remote-authority coverage now proves that a non-host browser can see it will join the live run rather than reset it, and that the original browser reports host reset authority

In the current twelfth slice, the authoritative sim also starts scaling its clocks by map size:

- `shallows`, `expanse`, and `deep-field` now advertise explicit server-side scale profiles through `/maps`
- larger maps now run with cheaper authoritative `tickHz`, `snapshotHz`, and slower background-world cadences instead of pretending every world needs the small-map clock budget
- the server now keeps player/contact truth at the main tick rate while throttling background systems like stars, wrecks, planetoids, portals, growth, and scavenger AI to map-sized cadences
- the browser client now adapts its snapshot polling interval to the authoritative session’s advertised `snapshotHz` instead of polling small-map rates against every map

In the current thirteenth slice, the authoritative sim also starts scaling its spatial work by player relevance:

- map-scale profiles now advertise `entityRelevanceRadius` and `scavengerRelevanceRadius` alongside their clock budgets
- larger maps no longer update every star, wreck, planetoid, and scavenger every background tick just because they exist somewhere in the world
- background-world systems now only fully update entities near alive players, while dying scavengers remain authoritative until their consequence chain resolves
- player-contact systems reuse those same relevance-filtered sets, so large maps stop paying whole-world scan costs just to apply nearby star push, planetoid push, scavenger bump, and pickup truth

In the current fourteenth slice, the authoritative sim also starts carrying explicit AI and per-player hazard budgets:

- scale profiles now advertise AI spawn budgets (`spawnScavengersBase`, `spawnScavengersPerPlayer`, `maxScavengers`) instead of hardcoding one fixed ambient-AI count forever
- scale profiles also advertise per-player relevance caps for stars, planetoids, wrecks, and scavengers, so larger multiplayer sessions have an explicit upper bound on how much nearby hazard and AI work each player can force
- the server now spawns scavengers from those budgets and uses the same per-player caps to choose which nearby entities receive full background updates on larger worlds

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
- broader combat consequences beyond pulse events and contact forces
- real lobby/session selection semantics beyond the current "join live run / host reset selected map" control plane
- more aggressive map-scale simulation changes for 4-8 player sessions beyond the first clock-profile cut

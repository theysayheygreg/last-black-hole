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

This is not the final transport. It is the simplest useful transport for proving the boundary.

## Protocol version

`lbh-local-v1`

## Authoritative clocks

- sim tick: `15 Hz`
- snapshot cadence target: `10 Hz`

The client still renders locally at its own frame rate.

## Core messages

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
  "timestamp": 1774600000000
}
```

This is intentionally small. It is enough to prove:

- input crosses the process boundary
- the server owns the authoritative player state
- the client is no longer pretending to be the world

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
- collisions and run outcomes
- run timer and collapse progression
- item and pickup truth
- future signal truth
- a coarse gameplay-relevant flow model

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

Replace the stub sim shell with real authoritative game state behind the same message shapes.

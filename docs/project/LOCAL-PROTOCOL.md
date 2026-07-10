# Local Protocol

> Document revision: v0.3. Updated 2026-07-10 from
> `scripts/sim-protocol.cjs`, `scripts/sim-runtime.cjs`, and live protocol tests.

## Purpose

`lbh-local-v2` is the current contract between the authoritative sim and a
locally rendered client. It is intentionally HTTP/poll based: the release goal
is a clear process and authority boundary, not premature public networking.

Both processes run on the same packaged machine for desktop and Steam Deck.
Tailscale/LAN can host the sim elsewhere for development, but that is not the
default local game shape.

## Transport And Clocks

- control plane and sim are separate processes;
- packaged desktop owns both child runtimes on dynamic loopback ports;
- development defaults to sim port `8787`;
- authority ticks are profile driven (`15 Hz` Shallows, lower on large maps);
- snapshot cadence is profile driven (`10 Hz` Shallows);
- the renderer runs at its own frame rate;
- transport is plain HTTP for the current private/local milestone.

## Identity And Authority

Protocol version: `lbh-local-v2`.

Every command belongs to one run and one player. The server issues a command
credential; the client does not invent authority by naming a `clientId`.

Authority headers:

```text
x-lbh-command-credential: <server-issued secret>
x-lbh-player-id: <player id>
x-lbh-run-id: <active run id>
```

The same values may be included in command bodies. Header/body disagreement is
an error.

Two counters are deliberate:

- `commandSeq`: monotonic across every authoritative mutation request;
- input `seq`: monotonic across continuous input packets.

The server deterministically rejects stale run, stale command, stale input,
wrong player, invalid credential, and conflicting identity.

## Session Flow

### `POST /session/start`

Starts a run. If a run already has a host, the request requires host command
authority. A successful start returns session data plus a one-time `joinTicket`
for the requested host identity.

```json
{
  "mapId": "shallows",
  "requesterId": "pilot-1",
  "requesterName": "Quiet Void",
  "seed": 749456454
}
```

### `POST /join`

Claims a new player with the start ticket or reconnects an existing player with
its current command credential.

```json
{
  "runId": "run-id",
  "clientId": "pilot-1",
  "name": "Quiet Void",
  "joinTicket": "one-time-ticket",
  "profileId": "profile-id",
  "profileSnapshot": {},
  "hullType": "drifter"
}
```

Response authority:

```json
{
  "protocolVersion": "lbh-local-v2",
  "runId": "run-id",
  "playerId": "pilot-1",
  "commandCredential": "secret",
  "lastCommandSeq": 0,
  "nextCommandSeq": 1,
  "reconnected": false
}
```

Human joins accept only the public Drifter/Breacher roster. Internal hulls are
not selectable by wire requests.

### `POST /leave`

Requires command authority. It commits an uncommitted outcome, removes player
authority, and promotes another human host when available.

### `POST /session/reset`

Requires host authority. It starts a fresh run boundary and returns a fresh
host join ticket.

## Continuous Input

### `POST /input`

```json
{
  "type": "input",
  "runId": "run-id",
  "playerId": "pilot-1",
  "commandSeq": 42,
  "seq": 318,
  "moveX": 0.8,
  "moveY": -0.2,
  "thrust": 1.0,
  "brake": 0.0,
  "slingshot": false,
  "slingshotEdges": [7],
  "pulse": false,
  "extractConfirm": false,
  "ability1": false,
  "ability2": false,
  "consumeSlot": null,
  "timestamp": 1783630000000
}
```

Rules:

- movement vector magnitude is clamped to one;
- thrust/brake remain scalar intent;
- queued slingshot edge ids are deduplicated, bounded to eight, and
  acknowledged so short taps survive network cadence;
- pulse, consumable, and extraction confirmation are latched one-shots;
- `extractConfirm` succeeds only while authority says the player remains in an
  available portal zone;
- the server returns accepted command/input sequence and slingshot edges.

## Discrete Inventory

### `POST /inventory/action`

Requires command authority. Supported actions are cargo drop, equip, load
consumable, unequip, and unload consumable. Cargo/loadout mutation remains a
server fact and uses the canonical item shape.

## Reads

### `GET /protocol`

Returns the machine-readable current contract.

### `GET /maps`

Returns playable maps, session scale profiles, and route/signature briefing
facts used by launch UI.

### `GET /snapshot`

Returns the latest authority snapshot:

- protocol, schema, snapshot, and baseline identity;
- run/session identity and clocks;
- monotonic tick, sim/server time, and event watermark;
- players with transform, velocity, hull/rig, delta-v, ability, slingshot,
  cargo/loadout, effects, signal, status, and portal interaction state;
- authoritative wells, stars, wrecks, planetoids, portals, scavengers, fauna,
  and sentries;
- Inhibitor form/pressure/target facts;
- only public recent events.

Ballpark private handles and debug registries are not snapshot protocol.

### `GET /snapshots?since=<snapshotId>&runId=<runId>`

Reads the bounded snapshot ring. The response identifies stale, future,
missing, and valid continuity windows. Old run ids cannot rebase a new run.

### `GET /events?since=<seq>&runId=<runId>&lane=<lane>`

Reads the bounded event journal. Unauthenticated reads return public facts.
Authenticated reads additionally return events visible to that player.

Lanes include:

- `global`;
- `playerLocal`;
- `neighborhood`;
- `vfx`;
- `debug`;
- `cinematic`.

Private inventory, loot, effect, signal-crossing, and portal-interaction events
use `player:<id>` visibility and never leak into another player's read.

### `GET /profile?profileId=<id>`

Returns the durable profile plus the newest five run records for Chronicle.

### `GET /health`

Returns process identity, uptime/memory, session lifecycle, tick-loop state,
match bounds, journal/snapshot retention, Ballpark body/query/lifecycle stats,
overload profile, and control-plane connectivity.

## Gap Recovery

The client tracks both event and snapshot watermarks.

1. Read events from the last accepted sequence.
2. If the journal reports a gap/stale window, request snapshots for the active
   run.
3. Rebase only from a valid full snapshot and its `lastEventSeq` watermark.
4. Drop duplicate events and events from a previous run.
5. Resume event consumption strictly after the rebased watermark.

Recovery is corrective state replacement, not renderer-authored gameplay.

## Ownership

The sim owns movement integration, flow approximation, contacts, death, grace,
pickup, cargo, inventory, signal, abilities, AI, Inhibitor, portal residence,
extraction, outcomes, and profile writeback.

The client owns input sampling, local presentation/interpolation, Three scene
lifecycle, ASCII-fluid reconstruction, VFX, UI, audio, and diagnostics. It may
predict or smooth presentation; it may not author gameplay consequences.

The control plane owns durable profiles, run ledger, Chronicle records, echo
history, and session registry.

## Future Transport

Multiplayer may replace polling with a streaming transport and add interest
deltas, prediction, correction, and rollback. The v2 identity, sequence,
privacy, event, snapshot, Ballpark, and authority boundaries are designed to
survive that change.

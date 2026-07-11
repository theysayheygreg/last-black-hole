# Agent Prompt: Phase 1 Stream Protocol Discovery

> Small disjoint implementation packet for
> `codex/v0.4-multiplayer-architecture`.

## Purpose

Advertise the optional same-process `/stream` transport through the existing
static sim protocol description without creating a duplicated wire-version
constant or changing live runtime behavior. This lets future SimClient and
harness code discover the path, framing, version, enablement flag, and
authority topology from one source.

## Read First

- `scripts/sim-protocol.cjs`
- `scripts/multiplayer-wire-protocol.cjs`
- `tests/sim-protocol.cjs`
- `tests/multiplayer-wire-protocol.cjs`
- `docs/v0.4/phase1-json-wss-adapter-plan.md`

## Owned Files

- one new small shared protocol-constants module under `scripts/` if needed;
- `scripts/sim-protocol.cjs`;
- `scripts/multiplayer-wire-protocol.cjs`;
- `tests/sim-protocol.cjs` and/or one new focused Node test;
- `tests/multiplayer-wire-protocol.cjs` only if required for constant parity.

Do not edit `sim-runtime`, adapter files, package/build files, manifests, docs,
or client source.

## Required Result

- Define `lbh-multiplayer-json-v1` and `/stream` once in a cycle-free shared
  constants module; both static discovery and strict wire codec import it.
- Extend `createProtocolDescription()` with an optional transport descriptor
  naming path, wire version, JSON text framing, WebSocket Upgrade, same-process
  per-match authority, `LBH_SIM_WS_ENABLED`, and default disabled state.
- Keep `lbh-local-v2` as the sim protocol. Do not rename or imply that stream is
  enabled when the environment gate is off.
- Do not duplicate frame schemas or validation in the descriptor; the strict
  codec remains authoritative.
- Add focused proof that discovery and codec versions/path cannot drift and
  that existing protocol fields remain intact.

## Verification

```sh
node tests/sim-protocol.cjs
node tests/multiplayer-wire-protocol.cjs
node tests/protocol-runtime.cjs
git diff --check
```

Commit atomically with an `L0:` or `Docs:` message and report the exact
descriptor shape, tests, and hash.

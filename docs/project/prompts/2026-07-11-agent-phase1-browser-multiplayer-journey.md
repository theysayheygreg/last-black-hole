# Agent Prompt: Phase 1 Browser Multiplayer Journey

> Sequential implementation/validation packet for
> `codex/v0.4-multiplayer-architecture`. Start only after the dual-transport
> SimClient commit is integrated and independently reviewed.

## Purpose

Drive real browser clients through LBH over the stream transport and prove the
first honest four-player, then eight-player, shared journey. This is the gate
between “server transport exists” and “multiplayer is playable enough for Greg
to try.”

The journey must exercise movement, salvage/inventory, signal/consequence,
death, extraction, reconnect, and private-state isolation through normal
browser/client paths. It must not substitute synthetic socket clients for the
playable claim or hide failures behind fixture-only mutation.

## Read First

- the committed result of
  `docs/project/prompts/2026-07-11-agent-phase1-simclient-dual-transport.md`
- `src/main.js`, `src/sim/sim-client.js`, `src/test-api.js`
- `tests/remote-authority.cjs`
- `tests/agent-eval.cjs`
- `docs/design/AGENT-TESTING.md`
- `docs/design/TEST-HARNESS.md`
- `docs/v0.4/ROADMAP.md` Phase 1 gate
- `docs/v0.4/research/phase1-ws-runtime-baseline.md`

## Owned Files

- one new multi-browser stream journey under `tests/`
- minimal `src/test-api.js` secret-free observations/actions required for a
  natural journey
- `src/main.js` / `src/sim/sim-client.js` only for defects exposed by the
  journey, with each defect kept narrow and tested
- `tests/suite-manifest.cjs` after the journey is stable

Do not edit server authority semantics, renderer architecture, package/hosting,
integrated docs, or make broad gameplay/tuning changes in this slice.

## Required Changes

1. Start one authority and four independent browser contexts through normal
   session/join/stream paths. Repeat at eight after four is green.
2. Prove every browser agrees on run identity, authoritative tick progression,
   public player roster, world lifecycle, and event watermarks while receiving
   only its own owner-private overlay.
3. Exercise real held movement, slingshot edge, pulse, consumable,
   salvage/inventory, signal consequence, one death, and one portal extraction.
   Prefer normal play inputs; harness-only setup may shorten waiting but cannot
   directly write the asserted outcome.
4. Disconnect one browser with unacknowledged action/event state, reconnect it,
   and prove rotated connection authority, no duplicate consequence, and
   recovery within the documented local target.
5. Capture per-client input/action RTT, snapshot cadence/age, reconnect time,
   payload/queue diagnostics, browser errors, authority tick cost/mode, and
   aggregate application bytes. Name 4-player and 8-player results separately.
6. Assert stream mode makes no request-per-input or snapshot/event polling hot
   path. Keep HTTP mode as a separate diagnostic parity lane.
7. Produce representative 1280x800 evidence from at least host, another live
   pilot, death/reconnect, and extraction views. Automated screenshots prove
   journey state, not Greg's movement/art taste.
8. Register a distinct multiplayer-playable lane only after repeatability is
   green. Do not silently broaden existing remote-authority claims.

## Verification

- Four browsers complete the full journey twice consecutively.
- Eight browsers complete one full journey without privacy, cadence, queue,
  reconnect, or authority-mode failure.
- No rival owner marker crosses clients; no duplicate action/event consequence.
- Authority remains `NORMAL` near its 15 Hz tick / 10 Hz projection target.
- Screenshots and a JSON measurement report identify commit, run, client count,
  timings, bytes, failures, and fixture assistance.
- Existing multiplayer-network, authority, remote-authority, and client-stream
  suites remain green.

Commit harness/client fixes atomically. Report exact commands, artifacts,
4/8 measurements, natural-versus-assisted steps, tests, and hashes.

## Guardrails

- This is local/browser proof, not WAN, TLS-edge, hosted-cost, Steam Deck, or
  public-release proof.
- Art Is Product and Movement Is the Game still require Greg's final hands-on
  judgment; automated completion does not replace it.
- Do not add prediction, AOI, binary encoding, or raise participant caps to
  24/48/96 in this lane.

# Inhibitor Ecology v2

**Status:** locked v0.3 design owner. This is a design contract, not a claim
that every behavior is already implemented in the runtime.

Inhibitors are an accumulating cast and ecology, not one creature morphing
through Glitch, Swarm, and Vessel forms. More entities and late-match crowding
are intentional. The Conductor is the sole arrival and population authority.
Its current locked map-relative fronts are `0`, `0.15`, `0.30`, and `0.45` of
the selected `480s` / `600s` / `720s` match duration. Later tuning may adjust
data without restoring Signal pressure or changing ownership.

## Ecology Contract

### Phase 0: dormant grace

Phase 0 is brief framing and grace. It is not a hidden pressure-meter state.

### Phase 1: Glitches

The Conductor brings increasing Glitches: drifting, temporary corruption or
terrain hazards with damaging cores. Glitches do not hunt player Noise. Their
procedural magenta/fabric-corruption identity and announced arrival grammar
remain central to the Dread Over Difficulty pillar.

### Phase 2: Swarms

The Conductor adds mobile Swarms. They are Noise-oriented hunters with readable
acquisition, search, and loss behavior and heavy hull damage. They do not delete
cargo, apply a control-sluggishness debuff, or recursively spike player Noise
on contact.

### Phase 3: Vessels

The Conductor adds multiple late Vessels with announced edge entry and readable
trajectory. They apply strategic map-erasing pressure, with outer damage and an
instant-kill core.

Vessels overdrive wells into stronger, more intense, more dangerous but
potentially more useful slingshot terrain. Overdriven wells persist with
capped/tunable tiers; Vessels never consume or delete wells and do not empty
the map.

## Noise And Awareness

Glitch, Swarm, and Vessel may emit their own player-hearable Noise contacts;
those emissions never add to player Noise. Suggested far categories are
`STATIC`, `CORRUPTION`, and `THRUST`; close public classes are `GLITCH`,
`SWARM`, and `VESSEL`. The current playable starting radii are `1600m`,
`4600m`, and `4600m` for Glitch, Swarm, and Vessel, with `4200m` for EXFIL;
the shared Noise data owner also derives the `1425m` reference Deck
off-screen threshold and checks lethal warning in seconds at representative
cruise and closure. Swarm speeds are `0.25/0.6/1.1/1.6` world-units/s from
silent through flare states and Vessel strategic movement starts at `0.5`
world-units/s, so pursuit can close without becoming unavoidable. These are
playable starting biases and must avoid late-game marker spam. `cadenceSeconds`
is presentation pulsing metadata only; it never toggles audibility.

Swarms normally acquire player or decoy Noise and search from last-heard state.
An authored extended acquisition or lock exception is explicit and is threat
identity, not a receiver-stat system. Glitches do not listen. Vessels may use
authored strategic or omniscient knowledge without pretending that it is
player hearing. Player-facing `HEARD` and `LOCKED ON` remain distinct.

## Consequences And Deferrals

Inhibitors are non-destructible for now because combat does not exist. Future
combat and destruction interactions are deferred, not rejected forever. Common
present consequences are hull damage and fabric/force effects. A tailored Heat
interaction is reserved for a later pass; there is no generic Heat damage in
this contract.

The old final-portal rule of “60s after Vessel” is retired. Final exfil remains
match-progress owned and cannot be blocked by an Inhibitor.

## Implementation Status

**Phase 1 shipped:** the Conductor now owns a stable `runtime.inhibitorEntities`
collection and deterministic `inhibitor-glitch-N` lifecycle. Glitches accumulate
on the Phase-1 cadence up to the bounded cap, drift without reading Noise, expire
by lifetime, apply bounded core hull damage with contact cooldown, and publish
through `inhibitor.entities` and emits restrained `STATIC`/`GLITCH` world
Noise. The renderer-neutral, Three, HUD, audio, and ASCII seams consume the
collection and preserve procedural magenta/fabric corruption.

**Phase 2 shipped:** the Conductor now adds stable-id `inhibitor-swarm-N`
entities on the Phase-2+ cadence under an independent bounded cap while
Glitches continue to accumulate and replenish. Each Swarm owns Noise/decoy
acquisition, last-heard memory, HEARD/TRACKING/INVESTIGATING and search state,
movement, lifetime, contact cooldown, and heavy hull damage through the same
authority death/outcome seam as Glitches. Public snapshots and the
renderer-neutral/Three presentation expose the mixed collection with the
procedural magenta/fabric identity. Each live Swarm emits restrained
`CORRUPTION`/`SWARM` world Noise without increasing the player's Noise.

**Phase 3 shipped:** the Conductor now adds stable-id `inhibitor-vessel-N`
entities on a `24s` cadence up to a kind-specific cap of `3`. Each Vessel
enters from a deterministic map edge with a public `3s` inbound tell and
trajectory, then uses `STRATEGIC` nearest-alive targeting without hearing.
Vessels apply the configured outer hull damage and instant-kill core through the
existing authority outcome seam. A Vessel can persistently overdrive nearby
wells through capped tiers (`1.18x` per tier, cap `3`); the well keeps its
identity, position, base mass, and kill radius while authoritative force,
current, and slingshot mass use the derived multiplier. Public snapshots and
the renderer-neutral/Three presentation expose Vessel lifecycle, target,
awareness, procedural magenta identity, and well overdrive tier/multiplier. Each
live Vessel emits restrained `THRUST`/`VESSEL` world Noise without becoming a
player listener. Active exfils also emit `EXFIL TONE`/`EXFIL` through the same
emitter-owned contact lifecycle; their on-screen cyan presentation and
match-progress ownership are unchanged.

**Vertical 4 shipped:** HUD, audio, Three, ASCII, renderer-neutral scene, and
run-result consumers now use the accumulated collection and report reached
kinds/counts rather than a fake final form. The public and runtime scalar
compatibility projection, portal-block fields, well-consumption fields, and
independent exit-arrow path are removed. Focused authority/presentation proofs
cover live world contacts, inner identity, toroidal range/bearing, frozen
last-heard expiry, deterministic capping, and no player-Noise increase.
Browser, package, Deck, and full-suite evidence remain separate async gates.

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
`SWARM`, and `VESSEL`. Exact radii and cadence remain tuning work and must
avoid late-game marker spam.

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
through `inhibitor.entities`. The renderer-neutral presentation seam carries
the full collection and preserves procedural magenta/fabric corruption. The
legacy scalar form remains only as the labeled
`inhibitor.compatibility` projection for later Swarm/Vessel/client migration.

**Phase 2 shipped:** the Conductor now adds stable-id `inhibitor-swarm-N`
entities on the Phase-2+ cadence under an independent bounded cap while
Glitches continue to accumulate and replenish. Each Swarm owns Noise/decoy
acquisition, last-heard memory, HEARD/TRACKING/INVESTIGATING and search state,
movement, lifetime, contact cooldown, and heavy hull damage through the same
authority death/outcome seam as Glitches. Public snapshots and the
renderer-neutral/Three presentation expose the mixed collection with the
procedural magenta/fabric identity. The scalar `inhibitor.compatibility`
projection remains labeled and is no longer gameplay authority for Swarms.

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
awareness, procedural magenta identity, and well overdrive tier/multiplier.
The scalar `inhibitor.compatibility` projection remains labeled for the
unmigrated HUD/audio/results/shader vertical 4 surfaces only.

Inhibitor/exfil audible contacts and final cleanup remain deferred; they are not
claimed by this implementation.

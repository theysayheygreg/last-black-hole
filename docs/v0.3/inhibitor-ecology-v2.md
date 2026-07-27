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

The current runtime already has the Conductor's map-relative fronts and Noise
arrival/listener ownership. It is not yet a full Ecology v2 implementation.
The following gaps are explicit and must not be mistaken for shipped truth:

- `runtime.inhibitor.form` still exposes scalar legacy form state.
- `consumedByInhibitor` and related portal-block/legacy form behavior remain in
  `scripts/sim-runtime.cjs`.
- Swarm cargo drain and control debuff behavior remain in the runtime even
  though Ecology v2 retires them as the target contract.
- Legacy scalar-form presentation and behavior still require replacement with
  the accumulating cast, persistent overdriven wells, and phase-owned entity
  population described above.

These gaps are implementation work, not permission to reinterpret the old
Signal pressure meter or claim that the ecology is already shipped. No exact
Inhibitor emission radii, cadence, combat mechanics, or new population behavior
are invented here.

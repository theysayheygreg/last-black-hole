# Player Brain and Overload Plan

> Detailed next-step architecture for LBH after the first authoritative client/server migration. This is a design document, not an implementation task list.

## Why this is the next step

The first migration is real now.

The server already owns most run truth:
- sessions and host control
- player transforms and inventory mutation
- wells, stars, wrecks, planetoids, portals, scavengers
- extraction, death, loot loss, pulse events, consumable state
- map-scale tick profiles, relevance gating, AI budgets, and per-player force budgets

That means the next architecture work should stop being "move another system over the line" and start being "make the server's model of the run cleaner, cheaper, and more scalable."

The three next seams are:
1. formalize server-side player truth as a single boxed object
2. formalize overload/degradation as an explicit state machine
3. replace large-map direct-force truth with a coarser authoritative flow and hazard field

Those three moves fit together. They are the next version of the architecture, not three unrelated optimizations.

## Current architectural shape

Today the architecture looks like this:

- `scripts/sim-runtime.js` owns most run truth and session state
- `src/main.js` is a real rendering/input client in remote mode
- snapshots and events are already real enough for private remote play
- scale work exists, but it is still mostly implemented as budget caps inside the current force/contact model

That is good enough to play. It is not yet clean enough to scale far beyond the current map and player counts.

The current weakness is that the authoritative server still derives a lot of expensive, player-specific gameplay meaning on demand from scattered state:
- inventory and equipment
- active consumables
- hazard modifiers
- pulse/disruption modifiers
- per-player nearby-force selection
- world contact and extraction checks

The server works, but it is still too procedural. It needs more boxed state and more explicit performance modes.

## Design goals

The next architecture phase should produce these outcomes:

- one server-side object that answers "what is true about this player right now?"
- one server-side run state that answers "what performance mode is this run in right now?"
- one coarse large-map field model that answers "what local motion and hazard truth does the player need right now?"
- one clear split between snapshot truth and event truth
- one set of session profiles that make 1-player, 4-player, and 8-player runs intentional instead of accidental

## 1. PlayerBrain

### Purpose

`PlayerBrain` is the server-owned boxed package of resolved player truth.

It exists so the server does not keep rediscovering the same answer from scattered inventory, effect, and run state every tick.

### What belongs in it

Each live player should have a `PlayerBrain` or `PlayerRuntimeState` with four layers.

#### A. Identity and slot state

This is the minimal persistent identity needed during a run:
- `playerId`
- `profileId`
- `sessionId`
- `isHuman`
- `isAI`
- `shipClass` or hull id if that exists later
- alive / dead / escaped state
- host/non-host control flags if needed for the control plane

#### B. Raw inputs to the brain

These are the source truths the brain resolves from:
- equipped artifacts
- loaded consumables
- current cargo-derived constraints if any affect movement later
- temporary status effects
- progression upgrades
- map/session modifiers
- faction or run-mode modifiers later

This layer is not the thing hot paths should read directly. It is the thing the brain resolves from.

#### C. Resolved gameplay coefficients

This is the main reason the brain exists.

The server should resolve and cache a compact set of coefficients such as:
- `thrustScale`
- `turnScale`
- `dragScale`
- `wellPullScale`
- `waveResponseScale`
- `pickupRadiusScale`
- `pulseRadiusScale`
- `pulseForceScale`
- `pulseCooldownScale`
- `signalGainScale`
- `signalDecayScale`
- `visibilityScale`
- `portalUseScale`
- `shieldMode`, `shieldStrength`, `shieldRemaining`
- `timeDilationImmunity` or `timeAssistScale` if that ever exists

Not all of these need to exist immediately. The point is that the server tick should read resolved coefficients, not item definitions.

#### D. Derived runtime caches

This is the genuinely hot-path material:
- last-known nearby hazard set ids
- last-known nearby field cell / chunk id
- last-known target portal id
- current movement mode flags
- dirty flags for each subsystem
- last recompute tick
- next scheduled recompute tick for non-critical derived state

These caches are allowed to be transient and cheap to rebuild.

### Dirtying rules

The brain should rebuild only when relevant source state changes.

Dirty events include:
- equip
- unequip
- load consumable
- unload consumable
- consume item
- death
- respawn
- extraction
- pickup of stat-relevant cargo if that ever matters
- profile upgrade change
- server-side status effect add/remove/expire
- run-mode or overload-mode change that affects this player

### Brain API

The server should conceptually have functions like:
- `createPlayerBrain(player, loadout, profileState, sessionProfile)`
- `markBrainDirty(playerId, reason)`
- `resolvePlayerBrain(playerId)`
- `getResolvedPlayerCoefficients(playerId)`
- `projectPlayerSnapshot(playerId)`

The important rule is that gameplay systems should stop reaching into inventory and item definitions directly once the brain exists.

### What this buys you

- cheaper ticks
- fewer hidden dependencies between systems
- cleaner replication
- easier AI parity, because AI players can use the same brain model
- easier migration to another runtime later, because player truth has one shape

## 2. Run overload state machine

### Purpose

Today LBH degrades by scattered budgets and cadences.

That is better than nothing, but it is still implicit. The server should carry an explicit run-level performance state so overload behavior is inspectable and consistent.

### Proposed run states

#### `NORMAL`
- full intended cadence for the map/session profile
- normal snapshot rate
- normal AI budget
- normal force budgets

#### `THROTTLED`
- background world updates slow first
- AI spawn and AI think cadence reduced
- remote snapshot frequency trimmed slightly
- non-critical events may batch for one extra tick

#### `DEGRADED`
- force budgets tighten further
- non-local AI breadth reduces aggressively
- low-priority world consequences batch
- coarse authoritative field becomes primary source for large-map player motion truth
- visual-only client niceties may receive fewer event details

#### `DILATED`
- shared run clock slows deliberately
- player, AI, and world all step on the same slower clock
- event order stays honest
- the client should surface this as a real run state, not hide it

### What should trigger transitions

The exact thresholds should be tuned later, but the server should watch:
- average tick cost over a moving window
- worst tick cost over a shorter window
- snapshot send backlog
- event queue backlog
- player count
- AI count
- force-source scan pressure

A simple first model is enough:
- if the moving average exceeds budget for N windows, step down one state
- if it recovers with margin for M windows, step up one state
- only enter `DILATED` if degraded mode still cannot keep up

### What should not happen

Do not let every overloaded subsystem invent its own private slowdown rule. That is how server behavior turns inconsistent and impossible to reason about.

### What the client needs to know

Snapshots should include at least:
- `overloadState`
- `tickHz`
- `snapshotHz`
- `timeScale` if dilation is active

The client does not need all internal budget knobs. It does need the visible truth.

## 3. Coarse authoritative flow and hazard field

### Purpose

The current server-side scaling work still assumes that player motion truth is a sum over nearby force sources.

That works for now. It will eventually stop scaling well with:
- larger maps
- more wells and hazards
- more players
- richer wave and threat systems

The next step is not a full fluid sim on the server. It is a coarser authoritative field.

### Core idea

For larger maps and/or degraded states, the server should stop treating every player update as:
- scan nearby wells
- scan nearby rings
- scan nearby portals
- scan pickups
- integrate each source directly

Instead it should treat local movement truth as:
- sample a coarse field cell or small neighborhood
- combine that with a short capped list of explicit nearby hazards/interactions

### Proposed field layers

The coarse authoritative field should likely have three components.

#### A. Flow vector field

A 2D vector per cell representing the local spacetime current that matters to motion.

This is not the render fluid. It is the gameplay approximation.

#### B. Hazard scalar field

A scalar per cell representing the local danger intensity or collapse pressure.

This lets the server answer "this region is lethal / risky / calm" without direct source scans for every system.

#### C. Interaction anchors

Discrete objects that still matter as explicit entities:
- portals
- wrecks
- scavengers
- immediate well core/horizon interactions
- future objectives or combat projectiles

The field handles broad motion and broad risk. Anchors handle sharp interactions.

### Resolution

The server field should be much coarser than the renderer and coarser than the current client sim.

For example:
- small map: maybe direct-force model still fine
- medium map: coarse grid plus direct local anchors
- large map: coarse grid is the default truth, with only nearest critical anchors evaluated explicitly

### Update cadence

The coarse field does not need to update every player tick.

It can update on a slower cadence, and each player tick can sample the current field plus a small set of immediate anchors.

That is the right trade.

### Relationship to the client renderer

The client can still do much richer local visual reconstruction.

The server field is not there to make the game pretty. It is there to make authority cheap and honest.

## 4. Session profiles

The current map-scale profiles are a good start. They should grow into real session profiles.

A session profile should explicitly answer:
- intended player count
- AI fill policy
- tick and snapshot clocks
- relevance radii
- force budgets
- coarse field resolution
- overload thresholds
- host/session rules if needed

### Suggested first profiles

- `solo_ai_light`
- `duel_competitive`
- `four_player_pvp`
- `eight_player_stress`

These should exist as server-declared modes, not folklore.

## 5. Snapshot truth versus event truth

This needs to stay sharp as the architecture grows.

### Snapshots are for state

Snapshots should carry:
- player positions and resolved visible status
- world entity state
- session state
- overload state
- brain-projected player-facing state that the HUD needs

### Events are for meaning

Events should carry:
- consumed
- extracted
- picked up
- dropped
- pulse fired
- portal spawned
- scavenger died
- overload state changed
- host changed

The client should not have to infer meaningful transitions by diffing snapshots whenever an explicit event exists.

## 6. Control plane versus gameplay plane

The server is now real enough that control-plane concerns should stay out of the gameplay loop.

The control plane should own:
- session creation
- host assignment and transfer
- session profile selection
- map selection and reset rules
- later, reinforcement or priority rules

The gameplay plane should own:
- run simulation
- player brains
- field updates
- world entities
- combat, extraction, death, pickups

This separation matters because future hosted LBH will need it even if private mini-to-MacBook play does not yet feel complicated.

## Recommended implementation order

This is the order I would use once implementation resumes.

### Phase 1 — PlayerBrain skeleton
- create the server-side brain module and runtime storage
- move resolved coefficients out of ad hoc item/effect lookups
- make equip/consume/death/respawn dirty the brain
- project brain-derived state into snapshots for HUD/client needs

### Phase 2 — Overload state machine
- add explicit run states: `NORMAL`, `THROTTLED`, `DEGRADED`, `DILATED`
- move current map-scale budget logic under that umbrella
- expose overload state and time-scale to snapshots

### Phase 3 — Coarse field prototype
- add one coarse gameplay field for `deep-field` first
- use it for authoritative movement influence on large maps only
- keep direct-force model for smaller maps at first

### Phase 4 — Session profiles
- lift map-scale profiles into session profiles with player-count intent
- create at least `4-player PvP` and `8-player stress`
- make these visible in control-plane state

### Phase 5 — Multipliers and hosted readiness
- only after the above, revisit larger-player smoke, hosted instances, and runtime/engine questions

## What Claude can build against now

Claude can safely assume:
- server-first run truth is the rule
- client remains presentation, input, local interpolation, and richer local visual reconstruction
- future gameplay features that change player stats or state should be expressible as brain dirties and brain-derived coefficients
- future large-map mechanics should aim to fit the coarse-field model, not force the server back into full-resolution local-force scans

Claude should avoid assuming:
- direct inventory/item definition lookups in hot server paths are a long-term contract
- map-scale profiles are the final scale model
- local client-side force truth will survive on larger maps or more players

## Acceptance criteria for the architecture phase

This phase is successful when:
- player gameplay coefficients live in one server-owned boxed model
- the server can state its overload mode explicitly at any moment
- large maps can use a coarser authoritative movement/hazard model intentionally
- session profiles describe intended player-count and fidelity envelopes
- the client can remain mostly unchanged while those server-side changes land

## Working position

Do not treat the next phase as more migration cleanup.

Treat it as the first proper version of LBH's long-term multiplayer architecture:
- boxed player truth
- explicit overload policy
- coarse authoritative world field
- visible session profiles

That is the cut that will hold.

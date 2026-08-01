# Movement + Fabric Simplification

> Program base: `1eb6cdf3350accf68cd8b38372fbe0bda2050a94`
> (accepted Grapple Arc v3). This is the v0.3.1 implementation contract, not
> a new physics-engine plan.

## Player Vocabulary

The ship has three mutually exclusive movement modes:

1. **TERMINAL** — no movement.
2. **GRAPPLED** — Grapple Arc v3 exclusively owns the held arc.
3. **FREE** — control, one fabric sample, named impacts, drag, integrate.

FREE must stay readable in that order:

```text
THRUST / BRAKE -> FABRIC -> ATTRIBUTABLE IMPULSES -> DRAG + SPEED CAP -> MOVE
```

The game is not an orbital dynamics simulator. Every retained movement term
needs one short player explanation and one tuning owner. A field effect is
continuous fabric. An entity hit is a discrete impulse. A hazard may kill or
damage without becoming another invisible current.

## Current Source Truth

The server already owns the product game at a fixed 15 Hz and Grapple Arc v3
already makes GRAPPLED exclusive. FREE still spreads velocity mutation across
several places:

- `player-movement-step` applies thrust, Heat, current coupling, brake, drag,
  speed cap, and integration;
- `tickAuthorityPlayers` separately applies well gravity, star push,
  planetoid push, and live-wave push;
- hull abilities may add or replace velocity before that pipeline;
- sentries, fauna, scavenger contacts, pulse, and Inhibitor ecology write
  player velocity as named contacts or impulses outside it.

The authoritative coarse field is rebuilt every tick and already contains
seeded sea, orbital well current, well gravity, and live event waves. The old
research notes about stale coarse waves and 15/12/10 map clocks are historical.

Remaining contradictions and dead weight:

- FREE samples the same coarse field three times for current, gravity, and
  wave even though they are one field result.
- star and planetoid continuous pushes mutate velocity as extra force passes
  between fabric and drag.
- the local sandbox retains a second movement implementation. It is a debug
  approximation, never a second product truth.
- presentation still contains disabled planetoid "surfable wake" velocity
  code and tuning knobs. Authority has no such wake.
- remote semantic presentation reconstructs a local analytic field that omits
  the seeded sea instead of admitting when only authority has the truth.
- fabric constants are duplicated between authority, coarse-field, seeded-sea,
  and browser config owners.

## Ordered Verticals

### V1 — One named fabric contract

Centralize seeded-sea, well-current, and event-wave tuning in one shared data
owner with thin browser/authority adapters. Delete disabled planetoid velocity
wake code and its dead knobs. Remote presentation must not invent an analytic
semantic field when the server field is the only truth.

### V2 — One FREE movement step

Sample authority fabric once per player tick. Apply thrust/current coupling,
the remaining field acceleration, brake/drag/cap, and integration through one
ordered movement owner. Preserve exact component reporting in the force ledger.
Convert star and planetoid proximity pushes into inputs to that step rather
than independent velocity mutations.

### V3 — Contact ownership cleanup

Move sentry, fauna, scavenger, pulse, and Inhibitor velocity changes behind one
named impulse seam without changing their game effects. Delete zero-strength
or unreachable movement knobs instead of preserving compatibility aliases.
This vertical follows V1/V2 only if the source remains smaller and clearer.

### V4 — Human movement/fabric tuning

Greg plays the resulting FREE + GRAPPLED vocabulary. Tune only the named
owners. Camera/viewport, fabric visual hierarchy, density degradation, and
Deck zoom remain separate motion-comparison decisions.

## Non-goals

- no GPU readback authority, physics-engine migration, or full ECS rewrite;
- no change to 15 Hz, maps, match schedule, Grapple Arc v3, Heat, Noise,
  collision, extraction, or toroidal coordinates;
- no camera/viewport taste decision and no broad visual redesign;
- no broad suite, RC, package, Deck build, or performance soak in this task.

## Acceptance

- FREE has one obvious ordered source path and one authority field sample;
- retained forces have a named player-facing reason and central tuning owner;
- disabled/fake fabric motion is deleted, not hidden behind zeroes;
- focused deterministic movement and field checks pass;
- the game boots and accepts movement input when a cheap smoke is available;
- feel remains a Greg playtest gate.

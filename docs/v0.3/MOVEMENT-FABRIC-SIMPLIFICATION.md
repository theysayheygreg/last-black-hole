# Movement + Fabric Simplification

> Program base: `1eb6cdf3350accf68cd8b38372fbe0bda2050a94`
> (accepted Grapple Arc v3). This is the v0.3.1 implementation contract, not
> a new physics-engine plan.
>
> Source closure: `e24b8fcc17f0c43412b91a633150f816541765ee`.

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
- Flow Lock contributes named continuous acceleration inside FREE; discrete
  hull actions may still replace velocity before drive;
- Glitch and Vessel continuous forces enter FREE through the same named input;
  sentries, fauna, scavenger contacts, and pulse remain attributable impulses.

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

**Completed as a bounded correction.** Drifter Flow Lock and Glitch/Vessel
fabric pulls are continuous, so they now return named acceleration inputs to
the FREE step and have explicit force-ledger channels. Inhibitor ecology no
longer mutates player velocity. Sentry, fauna, scavenger, pulse, Eddy Brake,
and damage contacts remain discrete, player-attributable impulses; wrapping
them in a new event framework would add indirection without removing a
competing continuous owner.

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

## Implemented Checkpoints

- `16dd9cf78d305441ba06ade18fc351e402191485` — V1 establishes
  `src/content/fabric.data.json` as the shared seeded-sea, well-current, and
  event-wave tuning owner. Browser and authority use thin adapters. The
  unauthoritative disabled planetoid velocity wake and its dead knobs are
  deleted; SimCore is the sole local planetoid update owner; elapsed seconds
  own event-wave decay; remote presentation no longer invents local analytic
  field truth. Despite adding the canonical owner and focused proof, the
  feature commit removes 27 net lines.
- `e24b8fcc17f0c43412b91a633150f816541765ee` — V2 gives FREE one
  ordered authority call: drive/Heat/current, contact truth, well/star/
  planetoid gravity plus field wave, brake/drag/speed cap, then integration.
  One normalized authority sample supplies current, well gravity, and event
  wave for the tick. The prior split gravity/star/planetoid/wave velocity
  mutators are removed while their arithmetic order and force-ledger labels
  remain intact.
- The V3 correction closes two missed continuous paths without expanding the
  movement model. The player field sample is cached once and passed to Drifter
  Flow Lock. Flow Lock and per-player Glitch/Vessel accelerations enter FREE in
  their previous timing order and receive `ability` / `inhibitor` ledger
  labels. GRAPPLED and TERMINAL never consume those deferred contributions.
  Remaining collision, enemy-contact, pulse, and discrete ability mutations
  stay named impulses outside the continuous FREE channels.

The retained player vocabulary is still **TERMINAL / GRAPPLED / FREE**.
Grapple Arc v3 exclusively owns GRAPPLED; these changes add no tuning and do
not alter the fixed 15 Hz authority clock, Heat, Noise, collision, extraction,
map scale, schedule, or toroidal coordinate contracts.

Focused source proof covers canonical fabric parity, elapsed-time wave decay,
one cached player sample including Drifter, exact previous FREE arithmetic
order, continuous contribution ordering, direct-mutation removal, GRAPPLED
exclusion, force-ledger reconstruction, movement golden/trajectory parity,
authoritative field, well grace, swept contacts and extraction, protocol
authority, Heat, and map-rate/grapple contracts. No broad release claim is
made.

The remaining gates are human: Greg owns movement feel, and the fabric/camera/
viewport visual hierarchy still needs its separate in-game and Steam Deck
comparison pass.

The title attract scene is now outside this fallback entirely. Its authored
entity motion and fluid composition advance through
`src/presentation/title-scene-presentation.js`, with no ship, input, AI,
inventory, extraction, or run clock. `LocalSandboxSimCore` remains only because
Bench/local fallback, renderer fixtures, and remote visual hydration still
consume its existing system shapes. Removing those consumers is deferred until
each has a replacement; this cleanup does not pretend the fallback is dead.
The standalone `title-prototype.html` path is also retained as an explicit
calibration surface because `npm run test:title-prototype` still consumes it;
it is not the product title owner and was not safe dead-code deletion here.

## Acceptance

- FREE has one obvious ordered source path and one authority field sample;
- retained forces have a named player-facing reason and central tuning owner;
- disabled/fake fabric motion is deleted, not hidden behind zeroes;
- focused deterministic movement and field checks pass;
- the game boots and accepts movement input when a cheap smoke is available;
- feel remains a Greg playtest gate.

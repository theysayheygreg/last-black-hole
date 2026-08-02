# v0.3 Open Decisions

> Document revision: v0.3. Updated 2026-08-01. Resolved implementation choices
> are listed first so they are not repeatedly reopened during release work.

## Resolved For v0.3

### Physics Baseline

Keep the server's provisional `2.5` thrust baseline and tune through hull, rig,
flow, brake, and delta-v coefficients. Replacing the integrator is not a v0.3
release task.

### Locked Physical Units

Resolved on 2026-07-17. `src/content/units.data.json` locks `1 sim/world unit
= 1000 m`, Drifter hull length `12 m`, and ruler presentation default `100 m`.
The client and server derive `0.012` sim units for the hull, `0.45` sim units
as `450 m`, and `0.1` sim units as `100 m`. The decision changes no physics,
collision, camera, or enlarged readability glyph dimensions.

### Map-Relative Run Schedule

Resolved on 2026-07-17. The map-scale registry owns the product duration:
Shallows `480s`, Expanse `600s`, and Deep Field `720s`. Collapse, Inhibitor,
optional portal targets, and final exfil open are normalized to the selected
run; the final exfil closes 60 seconds after the 100% front. The prior Expanse
600-second schedule remains the anchor, with epoch 3 intentionally corrected to
75%. Portal durations, tells, cooldowns, action windows, effect lifetimes,
offset guards, and reconnect/reservation timers remain absolute. The locked
baseline is accepted for focused proof, while later multiplier balance remains
playtest-tunable.

### Teaching Route

Shallows is the first-current recognition route: movement/slingshot, salvage,
Noise consequence, then extraction. Before an exfil exists it teaches
`ROUTE: LISTEN`; once the universal EXFIL tone opens it may be immediately
audible and teaches sound, cyan identity, and distance. Expanse and Deep Field
remain the navigation-by-ear routes. Seed preview and authority use the same
route facts; map-specific hearing profiles are not open.

### Product-Rate Route Contract

Resolved for the simulation/harness source pass. Every authored map integrates
at `MOVEMENT.authority.integrationHz = 15` with canonical drag/fluid coupling
and one finite delta-v tank. The old per-map 15/12/10 profile is superseded;
the 60 Hz route remains diagnostic only. Deep Field route generosity remains a
Greg playtest/content question, not a reason to alter movement constants or
restore lower-fidelity physics.

### Movement and Fabric Ownership

Resolved on 2026-08-01. Player movement has three exclusive modes:
`TERMINAL`, Grapple Arc v3-owned `GRAPPLED`, and `FREE`. FREE consumes one
normalized authority field sample and advances through one ordered movement
owner at the canonical 15 Hz rate. Shared fabric tuning lives in
`src/content/fabric.data.json`; browser and authority may adapt it but cannot
copy or invent movement truth. Drifter Flow Lock and Glitch/Vessel fabric pulls
are named continuous FREE inputs with dedicated force-ledger channels. Sentry,
fauna, scavenger, pulse, Eddy Brake, and damage contacts remain named discrete
impulses outside those channels. Do not add a generalized force/event wrapper
unless an observed impact cannot be attributed or tuned.

### Extraction

Use cyan zone-plus-confirm. Entering the aperture exposes an interaction;
Enter/A confirms immediately; leaving aborts immediately. A high-speed sweep
through the aperture is not extraction.

### Public Hulls

Ship Drifter and Breacher as the honest public roster. Keep Resonant, Shroud,
and Hauler internal until each has complete sim mechanics, UI, balance, and a
natural journey proof.

### Progression

Show hull-specific rig tracks only. Legacy global upgrade values can migrate
old profiles but are not a player-facing promise.

### Color Language

Cyan means route/extraction. Magenta means Inhibitor, corruption, or anomaly.
Do not share those roles for convenience.

### Death Economy

Keep authored residue, cargo loss, and echo consequences. Do not add a generic
percentage tax.

### Chronicle

Show a compact career strip plus the newest five authoritative run records.
The control plane owns the ledger.

### Ballpark Scope

Use persistent, generation-checked body identity and Ballpark-owned spatial
queries without forcing a full ECS. Runtime arrays may remain materialized
payload stores during v0.3, but they cannot become fallback spatial authority.

### Renderer Direction

Three is the first-class renderer. Preserve top-down play and ASCII-fluid
identity while using real 3D layers, depth, parallax, lifecycle-owned entity
families, VFX, and post processing. Do not spend release work maintaining the
old 2D pipeline.

## Open Before Promotion

### 0. Movement And Fabric Redesign Direction

**Decision owner:** Greg

The current implementation is centralized but not yet a legible surfing game.
The [Movement, Physics, and Spacetime Fabric Redesign](reviews/2026-08-01-movement-physics-fabric-redesign.md)
recommends a derived, player-readable SURF condition inside FREE with bold
carry/cost, a Shallows comparison of Graphic Cosmic Swell, Wavefront Surfing,
and a Signed ASCII truth control, and a restrained 8–12% speed-camera range.
Before implementation, lock the SURF behavior, exaggerated outputs, comparison
variants, and camera constraints. Select the winning route language and final
Deck baseline only after the playable motion comparison; do not migrate every
map or add more fabric detail first.

### 1. Greg's Feel Verdict

**Decision owner:** Greg

Does Drifter movement, slingshot timing, braking, route pleasure, and portal
residence feel good enough for v0.3? Automated play proves control and
consequences work, not that they feel excellent.

### 2. Greg's Visual Verdict

**Decision owner:** Greg

Does the 1280x800 HUD, entity separation, route color language, UI motion,
fabric/camera/viewport hierarchy, and ASCII density meet the intended contrast
and couch/handheld standard?

### 3. Physical Steam Deck Acceptance

**Decision owner:** Greg with agent support

The automated Deck-sized evidence is necessary but not sufficient. The real
device must prove Gaming Mode launch, Steam Input, suspend/resume, readable
text, and packaged authority health.

### 4. Promotion Timing

**Decision owner:** Greg

When should `codex/v0.3-sim-harness-simplification` promote to `main` and
become the public/demo line? A green candidate does not make this decision
automatically.

### 5. v0.3.1 Authored Soundscape

**Decision owner:** Greg

The functional procedural contact-audio bridge is a useful RC baseline, not
the final soundscape. The
[v0.3.1 Authored Soundscape Plan](reviews/v0.3.1-authored-soundscape-plan.md)
now belongs to this version line. Greg owns the representative direction,
timbre, mix, fatigue, and physical-device listening verdict before v0.3.1 is
considered content-complete. The currently running RC/deploy may proceed as an
intermediate playtest build rather than waiting for the whole authored library.

## Deferred Product Decisions

These are intentionally beyond the v0.3 release gate:

- migrate the chosen fabric hierarchy and Deck camera baseline across later
  maps only after the Shallows motion comparison is playable and selected;
- which internal hull graduates next;
- multiplayer transport, prediction, rollback, and matchmaking shape;
- whether measured entity/network scale justifies a full ECS;
- native/console renderer strategy beyond the current Three/Electron path;
- public storefront timing, pricing, and Early Access messaging;
- route/content expansion after Shallows, Expanse, and Deep Field are tuned.

## Historical Review Source

The larger option set and original uncertainty are preserved in
`docs/project/2026-07-04-orrery-v0.3-deep-review.md`. This file records what is
still genuinely open after implementation.

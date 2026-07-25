# v0.3 Open Decisions

> Document revision: v0.3. Updated 2026-07-17. Resolved implementation choices
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

Shallows is the first-current route: movement/slingshot, salvage, signal
consequence, then extraction. Seed preview and authority use the same route
facts.

### Product-Rate Route Contract

Resolved for the Goal D source pass. Route measurements use the selected
authority profile (`15/12/10 Hz`) with canonical drag/fluid coupling and one
finite delta-v tank. The 60 Hz route remains a diagnostic baseline only. The
Deep Field measurement leaves a narrow final fuel margin; whether that route
feels generous enough is a Greg playtest question, not a reason to alter the
movement constants in this slice.

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

### 1. Greg's Feel Verdict

**Decision owner:** Greg

Does Drifter movement, slingshot timing, braking, route pleasure, and portal
residence feel good enough for v0.3? Automated play proves control and
consequences work, not that they feel excellent.

### 2. Greg's Visual Verdict

**Decision owner:** Greg

Does the 1280x800 HUD, entity separation, route color language, UI motion, and
ASCII density meet the intended contrast and couch/handheld standard?

### 3. Physical Steam Deck Acceptance

**Decision owner:** Greg with agent support

The automated Deck-sized evidence is necessary but not sufficient. The real
device must prove Gaming Mode launch, Steam Input, suspend/resume, readable
text, and packaged authority health.

### 4. Promotion Timing

**Decision owner:** Greg

When should `codex/v0.3-ballpark-roadmap` promote to `main` and become the
public/demo line? A green candidate does not make this decision automatically.

## Deferred Product Decisions

These are intentionally beyond the v0.3 release gate:

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

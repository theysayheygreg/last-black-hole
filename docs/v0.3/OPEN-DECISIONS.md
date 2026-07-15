# v0.3 Open Decisions

> Document revision: v0.3. Updated 2026-07-10. Resolved implementation choices
> are listed first so they are not repeatedly reopened during release work.

## Resolved For v0.3

### Physics Baseline

Keep the server's provisional `2.5` thrust baseline and tune through hull, rig,
flow, brake, and delta-v coefficients. Replacing the integrator is not a v0.3
release task.

### Provisional Units Peg

Use `1 sim unit = 1000 m` for v0.3.1 ruler/debug presentation. This keeps the
existing `0.45` well slingshot capture radius readable as `450 m`, and pegs the
fictional Drifter hull length at `12 m` (`0.012` sim units), matching S4's
`25 m` step at roughly two hull lengths. The peg is provisional and changes no
physics, collision, camera, or enlarged readability glyph dimensions.

### Teaching Route

Shallows is the first-current route: movement/slingshot, salvage, signal
consequence, then extraction. Seed preview and authority use the same route
facts.

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

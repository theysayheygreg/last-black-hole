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
75%. Optional portal apertures use that same normalized schedule: their authored
90/75/60/45/30-second Expanse durations are `0.15/.125/.10/.075/.05` of the
selected run, so Shallows and Deep Field do not inherit mismatched real-time
windows. Every optional aperture stays wholly inside one guarded Inhibitor
phase interval and clear of collapse fronts; the Conductor slides it earlier or
shortens it rather than letting either endpoint cross. Late pressure halves the
count range and aperture duration rather than silently removing the back half
of the route. The final 60-second exfil, tells,
cooldowns, action windows, effect lifetimes, offset guards, and
reconnect/reservation timers remain absolute. The locked baseline is accepted
for focused proof, while later multiplier balance remains playtest-tunable.

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

### Fabric Reference Frame

Resolved on 2026-08-02. FREE flight does not switch into a SURF state. The ship
owns velocity relative to local space; the fabric owns a current velocity
vector; world velocity is their vector sum. At full authored current strength,
the fabric vector starts capped at 20% of the hull's calm-space reference speed.
An unpowered ship therefore drifts with the fabric, with-current travel can be
up to 20% faster, against-current travel can be up to 20% slower, and
cross-current travel drifts laterally. Gravity and event-wave vectors remain
separate named consequences. Coupling must be `dt`-stable and never multiply
velocity every authority tick.

### Localized Well Gravity And Reach-First Growth

Resolved on 2026-08-02. Well radial gravity is localized and independently
authored from rotational fabric current. Each well owns a lethal core,
`fullGravityRadius`, `falloffEndRadius`, `minimumGravityFraction`, and an eased
falloff shape; radial gravity is zero beyond its localized envelope after a
short derived feather. Gravity strength remains a separate authored control.

Implemented on 2026-08-04. The first growth implementation changes **reach
only**: each well stores a seeded `baseMass` and `reachMultiplier`; scheduled,
star-, wreck-, and planetoid-consumption growth scale the full-strength and
falloff radii by the shared `0.50x` reach-per-mass step while baseline gravity
strength remains fixed. `killRadius` remains its independent existing curve.
Vessel overdrive is the sole sanctioned runtime strength multiplier: it makes a
well angrier, not bigger. Large wells or large-map variants may later author
greater strength explicitly, but ordinary growth must not simultaneously
enlarge the field and increase its force. Add strength variation sparingly and
only when the player can read the distinction.

### Wider Rotational Well Current

Resolved on 2026-08-02. A well's persistent rotational current extends beyond
its localized radial-gravity envelope so the outer approach creates a broad,
readable eddy before inward pull becomes important. The first relationship is
derived rather than separately authored:

`currentReach = falloffEndRadius × currentReachMultiplier`, starting at `1.5x`.

Growth expands the shared reach basis, so both the gravity envelope and broader
eddy grow spatially while their strengths remain fixed. Rotational current is a
persistent field. It does not create a mechanical wave by itself; growth,
consumption, or another explicit event must emit a discrete wavefront.

Standard wells use a broad plateau rather than a narrow precision band. Current
ramps up outside the lethal core, reaches full authored strength by the
full-gravity radius, remains broad across the gravity-falloff region, then eases
to zero through the outer eddy region at `currentReach`. This profile derives
from existing radii and adds no new standard-well tuning knobs. A future unusual
well may author a narrow current band as an explicit identity.

### Source-Bound Single-Impulse Waves

Resolved on 2026-08-02. A well-emitted wave is one visible outward-moving
front that applies one authored delta-v impulse when it crosses a player. It is
not a per-tick acceleration band and cannot hit the same player twice. Front
width remains presentation/crossing tolerance rather than accumulated-force
duration.

No anonymous periodic pulse may occur. Every wave owns a visible source well,
stable event identity, and explicit cause. Valid initial causes are a
Conductor-scheduled match-relative well surge, visible mass consumption, a
Vessel overdrive transition, or another future event that explicitly names its
source and reason. The source well telegraphs before emission through a bounded
intensity change and spatial audio; Conductor timing may orchestrate a surge
but may not conceal its cause behind a generic timer.

Conductor surges are staggered local events, never a simultaneous all-well
pulse. The Conductor selects one eligible source, completes that well's
telegraph and emission, then observes a readable quiet interval before another
conducted source may begin. Naturally caused waves such as consumption or
Vessel overdrive remain independent and do not require the whole map to wait;
the runtime may defer a scheduled surge briefly when overlapping fronts would
make their causes unreadable.

The initial pacing uses the existing four equal match-relative phases. Phase 1
emits no conducted waves. Phase 2 schedules one, Phase 3 schedules two, and
Phase 4 schedules three. Events are distributed inside their phase rather than
on its boundaries, so the cadence scales automatically with the selected match
length and cannot collide merely because a new phase began. These counts are
the first tuning baseline, not a requirement that every well emit once.

The standard crossing impulse is a fixed outward delta-v equal to 25% of the
active hull's calm-space reference speed. It adds to existing velocity without
normalizing, replacing, or rotating it, and it has no lingering acceleration.
This is deliberately large enough to read in play. Unusual or overdriven wells
may later author a stronger impulse explicitly; ordinary wells share this one
baseline.

The V1-V6 implementation now consumes only the canonical fabric profile and
source-bound wave projection. The retired collapse-epoch live-wave multiplier,
coarse `wave`/surf shadow channels, and gravity-contour presentation names are
not live tuning or renderer contracts.

### Three-Layer Fabric Grammar

Resolved on 2026-08-02. The player-facing fabric has only three primary layers:

1. **Local fabric flow:** broad continuous direction and carry.
2. **Well distortion:** persistent localized radial gravity plus rotational
   eddy around a visible source.
3. **Event wave:** a brief source-bound outward front and one crossing impulse.

Every shader, VFX, HUD, and audio contribution must identify which layer it is
communicating. Contributions that do not make one of these layers clearer are
removed, greatly subdued as non-gameplay ambience, or held for a later authored
object identity. Solar wind and moving-body disturbances remain mechanical
catalog items but do not earn separate dominant fabric layers in the first
readability pass.

Broad local flow uses sparse, soft, world-anchored lanes made from broken
ASCII-like streaks. The locked visual target combines Concept Panel A's low
density and visual rest with Panel C's broad bend/split/rejoin topology near
wells. Panel B's tactile sand-like grain is permitted only as restrained detail
inside those lanes, never as the default full-field density. Direction comes
from downstream mark motion; strength comes from longer, faster marks rather
than more marks.

Persistent well distortion uses Concept Panel A's restrained broad rotational
bend combined with Panel C's split/rejoin topology. The final treatment uses
fewer lanes and substantially less near-core detail than Concept C so the dark
well silhouette and immediate rim remain dominant. Pure radial convergence as
shown in Panel B is rejected because it reads as a scientific field diagram,
not a game material.

Source-bound event waves use Concept Panel B's fabric-native material swell
plus a thinner, sparser version of Panel C's broken leading crest. Panel A's
detached sonar-like ring is rejected, as are Panel C's bright lane-intersection
nodes. The source well visibly compresses and brightens before launch, fades as
the single front departs, and leaves calm sparse lanes behind the crest.

### Extraction

Use cyan zone-plus-confirm. Entering the aperture exposes an interaction;
Enter/A confirms immediately; ordinary residence still aborts immediately on
leaving. The authority measures the semantic aperture plus the physical ship
body and one small `0.012` near-miss allowance, rather than treating the ship
as a point. A high-speed sweep never extracts by itself: it opens the same
prompt for a brief `0.35s` explicit-confirm grace, then expires without a
delayed extraction.

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
now keeps FREE flight continuous: there is no SURF state or alternate physics.
The moving-reference-frame behavior is locked above; this remaining gate is
visual and experiential. Before locking its visual grammar, catalog stars,
solar wind, wells, moving masses, Inhibitors, event fronts, and large
non-gravitational destinations such as stations or megastructures. That
[source catalog is complete](reviews/2026-08-02-fabric-force-and-world-object-catalog.md):
only seeded sea, wells, and event rings currently own shared fabric motion.
Next compare Graphic Cosmic Swell, Wavefront Surfing, and a Signed ASCII truth control
within a restrained 8–12% speed-camera range. Select the winning route language
and final Deck baseline only after the playable motion comparison.

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

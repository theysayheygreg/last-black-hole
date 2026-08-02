# Fabric Force And World-Object Catalog

> **Status:** Source-truth audit and design inventory.
> **Audited source:** `848f511f90b16eecccee595e68dbc107586cb15b`
> **Date:** 2026-08-02
> **Purpose:** Catalog causes before selecting a final fabric visualization.

> **Cleanup checkpoint:** `6bada3ad12e0a50e09bbcd369003d0f428ef3103`
> resolves remote well rotation, source-bound growth-wave presentation,
> effective overdrive intensity, star subtype solar-wind parity, honest
> environment channels, fast small-object contacts, and title/local authority
> separation. Extraction remains intentionally residence plus confirmation.

## Design Boundary

FREE flight continuously respects the local fabric. “Surfing” is the fantasy
of moving well through that field, not a lock, threshold, state, or alternate
physics mode. The locked model treats the fabric as a moving reference frame:
the ship owns velocity relative to local space, the fabric owns a current
vector capped at **20% of hull calm-space reference speed**, and world velocity
is their vector sum. An unpowered ship therefore drifts with the fabric.
Gravity and event waves remain separate named vectors. Coupling must be
`dt`-stable and must not multiply velocity each authority tick.

Every world influence belongs to one of four ownership categories:

1. **Base field:** the continuous local fabric current.
2. **Field shaper:** something that bends, strengthens, compresses, or emits a
   disturbance through that field.
3. **Direct consequence:** an impulse, collision, grapple, damage event,
   ability, or debuff applied directly to an actor.
4. **Destination or obstacle:** a navigationally important object that does not
   automatically become gravitational merely because it is large.

The shader should not visualize all four categories as generic background
motion. Only base-field and field-shaper truth belongs in the semantic fabric.

## Gravity Well Audit

| Behavior | Authority truth | Presentation truth | Classification and action |
| --- | --- | --- | --- |
| Radial gravity | Live. `scripts/sim/well-gravity.cjs` feeds `scripts/coarse-flow-field.cjs`, then the ordered FREE movement step. | Gravity vectors are not projected. The browser receives mass, kill radius, and aggregate current but cannot show the inward vector honestly. | **Field shaper.** Retain as localized inward danger; give it stable source-centered contours rather than anonymous turbulence. |
| Rotational current | Live. `fabric.data.json::wellCurrent` and per-well `orbitalDir` produce tangential authority current. | Current reaches the authority field, but it is mixed with ambient sea. Remote synchronization does not preserve `orbitalDir`, so the analytic ring may visibly rotate opposite the authoritative current. | **Field shaper.** Retain. Sync direction and make curvature legible as the well's main route opportunity. |
| Scheduled growth | Live. Authority adds `growthRate`, increases mass, recalculates kill radius, and emits `well.grew`. | Mass and kill radius update remotely. Several older CONFIG, dev-panel, and anomaly controls imply tuning ownership they do not have in remote play. | **Field evolution.** Retain, but move cadence to match-relative Conductor phases and consolidate tuning ownership. |
| Growth wave | Live. Every growth event spawns an expanding radial ring with gameplay force. | Ring snapshots exist, but remote projection drops `sourceWellId`; remote mode does not inject or draw an authoritative product wavefront. | **Discrete field-shaper event.** Preserve source identity and render one explicit outward front. |
| Collapse escalation | Live. Collapse changes ambient sea and live-wave multipliers. | The player mostly receives a busier background and stronger invisible waves. | **Conductor modifier.** It should alter recognizable current, gravity, or wave behavior—not add undifferentiated visual noise. |
| Vessel overdrive | Live. Effective gravity/current can reach approximately `1.64x` after three `1.18x` tiers. | Tier and multiplier serialize, but well visual mass uses base mass and the client does not present `inhibitor.wellOverdriven`. | **External field escalation.** Use a persistent unmistakable overdrive phase plus one transition event; render effective intensity. |
| Anomaly identity | Partly live. Catalog multipliers affect gravity, current, ambient sea, waves, and growth. | Distinct identities share the same base-well behavior and visual language. Some authored claims exceed implementation. | **Authored field-shaper profile.** Keep only identities that produce a readable combination of the canonical forces. |
| Local compatibility well stack | Live only in offline/title/local compatibility paths. It separately approximates gravity, current, waves, and growth. | Easy to mistake for shipping remote authority truth. | **Compatibility only.** Label and progressively remove as product tuning authority where remote play owns truth. |
| Player pulse disruption | Older client combat code temporarily disrupts accretion presentation near a well. | It is not the same thing as the authority growth wave despite both being called a pulse. | **Direct ability presentation.** Rename distinctly; do not treat it as a baseline well force without an authority contract. |

### Resolved well truth defects

1. Authoritative `orbitalDir` now reaches remote well presentation.
2. Growth-wave `sourceWellId` now survives remote projection.
3. Authoritative source-bound wavefronts are now drawn rather than implied through ambient
   fluid disturbance.
4. Visual intensity now uses effective mass/overdrive rather than base mass alone.

### Remaining well design work

1. Replace the absolute 45-second growth loop with the already-decided
   match-relative four-phase Conductor structure.
2. Mark inert CONFIG/dev-panel/signature controls as compatibility or retire
   them from product tuning.

### Locked localized-gravity envelope

Radial gravity is not a map-wide tail. It uses four readable controls:

- `fullGravityRadius`: full authored pull inside this boundary;
- `falloffEndRadius`: outer end of the main falloff;
- `minimumGravityFraction`: remaining pull at that outer edge;
- `falloffCurve`: the eased transition between full and minimum pull.

A short derived feather reaches zero outside the envelope. The lethal core is
separate. Rotational current may remain readable beyond radial gravity's
localized reach.

Reach and strength are independent. The first growth implementation expands
`fullGravityRadius` and `falloffEndRadius` only; it does not increase baseline
gravity strength. Stronger gravity remains available as an explicit authored
property for unusually large wells or large-map variants. This is intentionally
not another automatic mass multiplier: ordinary growth should introduce one
player-readable change at a time.

### Locked wider rotational eddy

Persistent well current reaches beyond localized radial gravity:

`currentReach = falloffEndRadius × currentReachMultiplier`

The starting multiplier is `1.5x`. This creates an outer region where the
player can read and ride the rotational fabric before entering meaningful
radial pull. Growth expands the common reach basis, so the eddy grows with the
gravity envelope without automatically becoming stronger.

This is a persistent eddy, not a wave. A mechanical wave remains a discrete,
source-bound front emitted by well growth, consumption, or another explicit
event. Visual microtexture may suggest fluid motion but must not obscure that
gameplay distinction.

The standard current profile is deliberately broad:

1. ramp from the lethal core toward full rotational current;
2. reach full current by `fullGravityRadius`;
3. hold a plateau across the radial-gravity falloff region;
4. ease to zero between `falloffEndRadius` and `currentReach`.

This reuses the gravity-envelope radii and introduces no additional standard
knobs. Narrow peak bands are reserved for later authored well identities.

### Locked emitted-wave contract

The first simplified wave applies one outward delta-v impulse per player when
its visible front crosses them. A stable event/player receipt prevents repeat
hits. Width controls presentation and forgiving crossing detection, not the
number of acceleration ticks.

Every wave must answer “what caused that?” before it reaches the player:

1. retain a source well and explicit reason in authority truth;
2. telegraph that well before emission through visible intensity and spatial
   audio;
3. launch one visible source-bound front;
4. apply one readable impulse on crossing;
5. expire without becoming ambient background motion.

The absolute anonymous 45-second growth pulse is retired as design direction.
Conductor scheduling must be match-relative and announce a specific well surge.
Consumption and Vessel overdrive remain naturally visible causes. Future causes
must opt in explicitly rather than reusing a generic pulse timer.

Conducted waves use a staggered single-source queue. Only one well may be in a
Conductor-owned telegraph or emission window at a time, followed by a quiet
readability interval before the next scheduled source. The system must not
iterate every well on the same phase boundary. Event-caused waves remain
independent, while a scheduled wave may slip rather than pile onto an already
illegible moment.

Initial match-relative baseline: split the match into four equal phases;
schedule zero conducted waves in Phase 1, one in Phase 2, two in Phase 3, and
three in Phase 4. Space them within each phase, away from the boundaries. The
six-wave total is independent of well count, and source selection may revisit
an eligible well rather than manufacturing an all-well cycle.

The standard wave crossing adds a single radial-outward delta-v equal to 25%
of the player's hull calm-space reference speed. It adds to the current
velocity vector and does not normalize, replace, or rotate it. There is no
follow-on force. Stronger unusual or overdriven waves require an explicit
authored identity rather than hidden scaling on ordinary wells.

## Locked Three-Layer Fabric Grammar

The initial player-readable fabric is constrained to:

| Layer | Mechanical truth | Presentation job |
|---|---|---|
| Local fabric flow | Broad continuous current contributing up to the locked reference-frame band. | Show one coherent local direction and relative speed opportunity. |
| Well distortion | Persistent localized radial gravity and wider rotational eddy around a visible well. | Show the source, the broad bend, and where carry changes without drawing every force sample. |
| Event wave | One source-bound outward front and one 25% crossing impulse. | Telegraph the cause, preserve a clean advancing edge, then disappear. |

All fabric-facing visual or audio work must serve one of these jobs. Unmapped
contributions are removed, reduced to quiet non-gameplay ambience, or deferred
until an unusual object has a distinct authored identity. Solar wind and
moving-body disturbance may remain in mechanical truth, but the first visual
cleanup folds them into local flow or source VFX instead of adding dominant
full-screen layers.

### Layer 1 locked presentation: flow lanes

Broad local flow should appear as a small number of wide, world-anchored lanes
whose internal marks move with the accepted current vector. Direction is shown
by downstream motion; strength is shown by longer, faster marks rather than by
adding visual density. Lanes bend continuously and persist long enough to plan
a route. They are not rails, collision geometry, or a SURF state.

The current shader's hash noise, global speed brightening, and generic well
"surf band" are removal candidates because they imply activity without clearly
communicating the accepted flow vector. Ambient texture remains quiet. Ecology
distortion stays local to its visible source. The renderer must not create a
second decorative vector field that disagrees with authority movement truth.

The approved composition uses the low-density visual rest of Concept A and the
broad bend/split/rejoin behavior of Concept C. Concept B contributes only
restrained tactile grain within a lane. It is not permission to restore dense
full-field texture.

### Layer 2 locked presentation: deform the lanes

Persistent well gravity and rotational current do not receive independent
full-screen overlays. A visible well deforms the approved flow-lane material:

1. lanes begin a broad handed bend at `currentReach`;
2. spacing compresses toward the source across the gravity falloff;
3. curvature and compression become obvious inside `fullGravityRadius` without
   creating a binary capture boundary;
4. lanes split around the lethal core while the body/accretion silhouette owns
   immediate danger.

Downstream mark motion continues to report accepted current direction. The
envelope convergence is a qualitative gravity affordance, not a fabricated
velocity sample. This replaces generic halos, the old surf band, and repeated
gravity contours with one source-bound material response.

The approved art target combines Concept A's restrained orbital bend with
Concept C's split/rejoin topology. Reduce Concept C's lane count and near-core
density so the dark body remains the primary danger read. Concept B's uniform
radial field-line treatment is rejected.

### Layer 3 presentation candidate: one material swell

The source-bound event-wave concept sheet compares a detached ring, a lane
swell, and a hybrid crest. The preferred composition uses the broad material
deformation of Panel B plus a thin sparse broken leading edge from Panel C.
Panel A's generic neon/sonar ring is rejected. Panel C's bright intersection
nodes are also rejected because they imply discrete devices or collision
points.

The well telegraphs by visibly compressing and brightening at its immediate
source before launch. That source state fades as one crest travels outward;
the lanes behind it promptly return to calm. This preserves cause, direction,
and the one-crossing impulse without turning the event into a persistent band.

## Canonical Mechanical Fabric Causes

The current catalog supports three fabric causes without creating three
simulation states:

- **Current:** a continuous signed direction and strength. It is the base field
  and remains active throughout FREE flight.
- **Gravity:** a localized inward influence around an authored massive body.
- **Wave:** a discrete moving front emitted by a growth event, object, or other
  explicit cause.

These causes can overlap continuously. They are not CALM/SWELL/BREAK modes.
Collapse, anomaly identities, and Inhibitor overdrive should modify these
recognizable causes instead of inventing additional invisible forces.

## Non-Well World Audit

| Object or system | Live authority truth | Classification and design action |
| --- | --- | --- |
| Seeded sea | Two to four deterministic traveling sine trains form the only persistent non-well background current and are mixed directly into the serialized authority field. | **Base field.** The reference-frame prototype caps this current vector at 20% of hull calm-space reference speed. Reduce overlapping trains only after comparing readable alternatives. |
| Stars / solar wind | Alive stars apply direct outward inverse-power acceleration to players. They do not enter the coarse field or deform fabric. Authority ignores subtype `pushMult`, so current star types differ physically only through mass despite legacy local/type presentation claiming otherwise. | **Direct consequence and grapple anchor**, not currently a field shaper. Decide later whether outward solar wind should become a real spatial field; first reconcile subtype truth. |
| Planetoids / comets | Follow deterministic moving paths, apply close-range repulsion, and can be consumed by wells, adding mass and emitting an event wave. They create no wake or fabric term. | **Moving grapple anchor/obstacle plus direct consequence.** A moving-mass wake is future design, not current truth. |
| Event wave rings | Well growth or consumption emits a radial front that expands, decays, and applies outward acceleration through the authority field. | **Transient field shaper.** This is the live spatial pulse and needs a visible source-bound front. |
| Conductor/collapse fronts | Advance schedules and alter system multipliers but are not spatial forces themselves. | **Scheduler.** Never draw a physical wave merely because a timeline entered a new phase. |
| Portals / exfils | Apply no suction or current. Extraction uses an aperture, residence/confirm truth, and destination/noise presentation. | **Destination.** Keep out of fabric physics unless a later explicit design adds a field effect. |
| Wrecks, debris, remnants, echoes | Drift slowly toward wells, can be consumed, and serve as swept pickups. They do not obstruct, collide with, or exert force on the player. | **Destination/pickup.** Their visual mass must not imply gravity or collision they do not own. Shelter or split-current mechanics remain future options. |
| Scavengers | Move under their own AI, receive well gravity, loot, extract, collide directly with players, and emit Noise. They do not alter the field. | **Moving obstacle, direct consequence, and competing destination actor.** Do not resurrect their legacy local fluid wakes accidentally. |
| AI pilots/rivals | Use the same movement field as players but are not field sources; player-to-player collision is absent. | **Active actors.** Trails are presentation, not moving fabric. |
| Gradient sentries | Orbit wells, lunge, and apply a direct impulse toward the well on contact. | **Moving obstacle/direct consequence.** Not a fabric source. |
| Fauna | Move or investigate Noise; contact applies a tiny direct bump and consumes the fauna. | **Ambient moving obstacle/minor consequence.** Existing comments still describe superseded Signal behavior and need cleanup. |
| Inhibitor Glitch | Applies a small player-specific outward acceleration and lethal core damage. It is not inserted into the shared field. | **Direct consequence.** The current `fabricForce` naming is misleading unless Greg later promotes it to a shared deformation. |
| Inhibitor Swarm | Hears Noise, hunts, and damages on contact. It has no continuous field force. | **Moving threat/direct consequence.** |
| Inhibitor Vessel | Pulls players directly, damages/kills nearby, and permanently overdrives wells. The Vessel itself is not a coarse-field source; the overdriven well is. | **Direct consequence plus indirect persistent field shaper.** Show the well's changed truth, not a fictional Vessel field. |
| Moving-mass wakes | No live authority object—star, planetoid, wreck, ship, scavenger, fauna, sentry, or Inhibitor—currently creates one. Existing trails, dye, and legacy wake splats are presentation or sandbox code. | **Absent.** Add one deliberate authority rule later if the gameplay warrants it; do not infer wakes from visuals. |
| Stations / megastructures | No live authority entity, collision, field, destination, or snapshot family exists yet. | **Future destination/obstacle by default.** Large scale does not imply gravity. Shelter, split-flow, lee-side, or authored wake behavior requires an explicit design. |

### Non-well truth defects and decisions

1. Star subtype solar wind is now shared authority truth at
   `0.6x / 1x / 2x / 3x` and is attributed separately from well gravity.
2. Planetoid, sentry, fauna, and Swarm contacts now use post-movement sweeps so
   fast crossings preserve their existing consequences.
3. High-speed exfil fly-through remains deliberately ineligible. The current
   product contract requires a movement step to end inside the cyan aperture
   and then receive explicit confirmation; changing that is a Greg design
   decision, not collision cleanup.
4. Large dormant local systems still duplicate authority stars, planetoids, wrecks,
   scavengers, portals, wells, and waves. Label them as compatibility and avoid
   using their tuning as product truth.
5. Title visual stepping is now presentation-only; the remaining fallback is
   explicitly named `LocalSandboxSimCore`. Bench, renderer fixtures, remote
   hydration, and the standalone title calibration prototype still consume it,
   so deleting it requires migrating those real consumers first.
6. Moving-mass wakes, station shelter, and megastructure flow splitting are
   useful future possibilities, not current mechanics.

## Decisive Current Catalog

At the audited source, only three things own shared fabric motion:

1. **Seeded sea** is the base field.
2. **Wells** are the persistent field shapers through gravity and rotational
   current.
3. **Event rings** are transient field shapers.

Vessel overdrive changes a well and therefore indirectly changes the field.
Everything else is presently a direct force/contact, actor, destination,
pickup, scheduler, or visual treatment. This is the honest input set for the
first moving-reference-frame movement and presentation prototype.

## Visualization Hold

Do not yet lock Spacetime Rivers, Wavefront Surfing, or another final shader
grammar. The comparison remains useful, but its inputs must be the audited
authority causes rather than inferred decorative fluid.

The eventual presentation must answer, without debug overlays:

1. What direction is the local base current moving?
2. How strong is its continuous influence here?
3. Is a nearby massive body bending the route or pulling me inward?
4. Is a discrete wavefront approaching, and what emitted it?
5. Which visible object is a physics source versus a destination or obstacle?

If one visual mark cannot answer one of those questions cleanly, remove it or
demote it to non-semantic microtexture.

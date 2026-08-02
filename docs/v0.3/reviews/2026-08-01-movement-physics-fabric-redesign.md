# Movement, Physics, and Spacetime Fabric Redesign

> **Status:** Design review; implementation has not started.
> **Reviewed source:** `433b85a16c3a71a8e82c18d61bcdbcde6ecf552c`
> **Date:** 2026-08-01

## Verdict

The implementation is now centralized enough to change safely, but the game is
still asking the player to understand too many simultaneous forces through one
beautiful, noisy background. The fabric reads as animated atmosphere rather
than traversable terrain. Surfing is mostly a hidden velocity adjustment rather
than a deliberate, learnable movement state.

The next movement vertical should not add fidelity. It should make the original
fantasy playable:

> **Read a giant spacetime swell, enter it at a useful angle, feel the ship get
> carried, then grapple a massive landmark and release into the next swell.**

The recommended direction is **Graphic Cosmic Swell**: 2D movement truth shown
as shallow 2.5D relief, with one dominant current, one disturbance, and one
player reaction visible at a time. Z explains the field but never becomes a
navigable axis.

## What Is Wrong Today

### The physics vocabulary is still a coefficient pile

FREE movement can receive thrust, current coupling, well gravity, star and
planetoid pushes, seeded waves, Inhibitor pulls, abilities, reverse thrust,
drag, caps, and contacts in one authority step. Central ownership makes those
forces easier to debug, but it does not make them easier to play.

Several of these inputs are too small to perceive individually, while near a
well multiple related inputs can dominate together. The result is neither an
arcade rule nor a readable simulation: the player cannot reliably predict which
force produced the motion.

### The fabric relationship is passive and unreadable

The ship is continuously blended toward a sampled current. There is no crisp
motion response or visible field relationship. A player can be receiving a
technically correct influence without knowing how local space changed their
route.

### The visual fabric does not expose signed gameplay truth

The authority knows more than the renderer receives. The browser presentation
gets a current vector, while gravity, wave, hazard, and other semantic context
are not projected as one legible route description. The decorative fluid solver
then adds its own motion and density on top.

The ASCII direction treatment also loses sign in places, so opposite directions
can produce the same glyph family. Shimmer, rings, noise, halos, bloom,
aberration, scanlines, parallax, corruption, and entity effects all compete for
the same pixels.

### Quiet space is not quiet

The seeded sea is active across most of the map. When everything moves, motion
cannot identify an opportunity. Massive disturbances often increase visual
entropy when they should organize the scene around one obvious decision.

### The viewport distorts the terrain

The square world window is stretched into wide displays. Circles, slopes, and
angles therefore do not preserve their gameplay meaning. On Steam Deck the
camera also spends too much of its scale budget showing the map rather than
making the ship, route, and nearby terrain readable.

## Preserve

- Server-authoritative 2D movement inside the 3D Ballpark.
- The `TERMINAL / GRAPPLED / FREE` ownership split.
- Grapple Arc v3 as the arcade landmark movement verb.
- The canonical 15 Hz gameplay integration rate.
- One authoritative field sample and one shared tuning owner.
- Heat as thrust commitment and Noise as discoverability consequence.
- ASCII-fluid art direction, real 3D layering, lensing, and cosmic scale.
- Large wells, stars, portals, and Inhibitors as scene-defining landmarks.

## Retire Or Rework

- Retire the always-active seeded sea as the primary route language.
- Demote decorative fluid simulation to low-contrast microtexture. It must not
  decide which route looks fast.
- Replace hidden passive current coupling with one continuous, readable fabric
  influence during FREE. There is no SURF state, threshold, lock, or alternate
  physics. The ship is always flying freely and always relates continuously to
  the local fabric.
- Stop stacking separate radial well pull, star push, planetoid push, and tiny
  Inhibitor fabric pulls when the landmark can author one readable lane, zone,
  or discrete consequence.
- Replace unsigned or randomly shimmering directional cells with signed field
  marks where direction matters.
- Replace the stretched square projection with an isotropic rectangular view.
- Make brake oppose velocity. Input direction must not determine whether the
  brake works.

## The New Player Language

Movement should have five verbs:

| Verb | Player rule | Required tell |
| --- | --- | --- |
| **THRUST** | Spend Heat to change velocity deliberately. | Heat, exhaust, and acceleration react together. |
| **COAST** | Preserve momentum through quiet fabric. | Sparse wake and stable camera. |
| **BRAKE** | Reduce current velocity regardless of facing. | Wake compresses and speed falls visibly. |
| **GRAPPLE** | Attach to a massive landmark, ride its arc, release tangent. | Existing reel, arc, and release language. |
| **IMPACT** | A strong front, hazard, or collision changes the line. | One coherent hit, displacement, and recovery cue. |

For visual exploration, fabric may be described at three points on a continuous
spectrum:

| Visual point | Meaning | Presentation |
| --- | --- | --- |
| **CALM** | Re-aim, coast, cool, and listen. | Near-black field, sparse slow glyph drift, no false route. |
| **SWELL** | A broad directional opportunity. | Wide cyan/blue-white ribbon with signed motion and a readable crest. |
| **BREAK** | A compressed edge, shear, or dangerous front. | Bright bone/amber edge with reduced local detail and a strong consequence. |

Seeded sea, wells, and event waves shape this spectrum. Other actors,
destinations, and threats keep separate presentation unless their authority
contract deliberately changes. Vessel overdrive may change the well's fabric
truth; the Vessel itself is not a shared field source.

`CALM / SWELL / BREAK` are art-direction shorthand, not simulation states or
thresholds. They blend continuously. “Surfing the fabric” is the fantasy
produced by free flight through that moving reference frame, not a separate
player state or alignment gate.

## Mechanical Starting Point

The first locked tuning hypothesis is deliberately simple:

- **Locked reference-frame model:** the ship owns velocity relative to local
  space. The fabric owns a current velocity vector. World velocity is the
  vector sum of those two truths.
- The current vector is capped at **20% of the hull's calm-space reference
  speed** at full authored current strength. Traveling with it can therefore be
  up to 20% faster; traveling directly against it can be up to 20% slower;
  cross-current travel drifts laterally.
- With no thrust or player-relative velocity, the ship still drifts gently with
  the local fabric. Gravity and discrete event-wave vectors remain separate
  named consequences.
- The current is sampled and coupled in a `dt`-stable manner. It is never a
  per-tick velocity multiplier and cannot compound without bound.
- BRAKE should cut speed roughly in half over about half a second before later
  tuning.
- A well should author one curved surf lane and one lethal core, not several
  overlapping invisible radial contributions.
- Well radial gravity is localized through a full-strength radius and an eased
  falloff-to-minimum radius, then feathers to zero. Growth initially expands
  those reach controls without increasing gravity strength; exceptional large
  wells or large-map variants may author strength separately later.
- Event waves should be large, coherent moving fronts. A front may temporarily
  suppress microtexture so its direction and edge remain readable.
- Hull and equipment identities should change obvious vocabulary: wider swell
  capture, stronger carry, farther grapple reach, larger flat release bonus, or
  faster braking. Hidden alignment thresholds and 5–15% modifiers should not
  lead the design.

The first prototype must expose the real current vector truthfully through
motion, wake, and field presentation. If the 20% cap remains imperceptible in
ordinary play, tune that mechanical cap before inventing stronger visual
fiction, additional states, or more forces.

The source-backed ownership inventory is maintained in the
[Fabric Force And World-Object Catalog](2026-08-02-fabric-force-and-world-object-catalog.md).
At the audited source, shared fabric motion has only three owners: seeded sea
as base current, wells as persistent gravity/rotational shapers, and event rings
as transient wavefronts. Other forces and objects must not be drawn as fabric
unless their authority contract changes deliberately.

## Visual Direction: Graphic Cosmic Swell

The scene should present **one current, one disturbance, and one player
reaction**.

1. **Current:** broad signed lanes with three readable magnitudes: still,
   carrying, and fast. Their spacing, width, and value contrast carry the route
   before animation does.
2. **Disturbance:** a well or front bends, compresses, tears, or deletes the
   lane. Wells use a single hot horizon band plus faint lensing rather than many
   equal rings. Inhibitors retain separate threat presentation; only a
   Vessel-overdriven well changes shared fabric truth.
3. **Player reaction:** the ship wake shows whether it is RIDING, CUTTING, or
   FIGHTING the field. A brief word cue may teach those relationships
   initially, but the wake must remain sufficient after the lesson.

The shader may keep rich microtexture, but at half or less of its current
contrast and animation. If disabling microfluid, bloom, parallax, or scanlines
changes which route looks correct, the semantic layer has failed.

This follows the useful lesson from *Journey*: the surface, trail, and movement
response make traversal understandable before instrumentation does. It also
uses the cinematic lesson from *Interstellar*: visual accuracy is subordinate
to an image an audience can actually parse. *The Fantastic Four: First Steps*
adds the right graphic scale language: dominant silhouettes, retro-science
color blocks, and one enormous object organizing the composition.

References:

- [Journey movement and sand interview](https://www.pushsquare.com/news/2012/02/interview_thatgamecompany_journey)
- [The technology behind Journey's sand](https://www.gamedeveloper.com/art/video-the-technology-behind-the-sand-in-i-journey-i-)
- [Gravitational lensing by spinning black holes in astrophysics and in the movie Interstellar](https://authors.library.caltech.edu/records/njdcq-95891)
- [Marvel on the cosmic visual language of The Fantastic Four: First Steps](https://www.marvel.com/articles/movies/the-fantastic-four-first-steps-galactus-silver-surfer-ralph-ineson-julia-garner)

## Camera And Projection

- Preserve an orthographic/top-down gameplay camera. Relief explains the 2D
  field; it does not create a third movement axis.
- Render world units isotropically on wide displays.
- Start closer on Steam Deck so the ship, wake, and adjacent route remain
  readable at physical size.
- Permit only a restrained **8–12%** speed-context widening plus velocity lead.
- Freeze zoom during grapple, extraction, damage, and abrupt reversals.
- Never change zoom because entity count increased.

## Prototype: Shallows Only

Build the next work as a reversible Shallows tuning mode before migrating the
whole game.

### Mechanical control

- Make BRAKE oppose velocity.
- Start by cataloging seeded-sea motion, gravity, rotational well current,
  stars/solar wind, planetoids, moving masses, event fronts, Inhibitor effects,
  and non-gravitational destinations. Do not disable a live force until its
  gameplay ownership and replacement are explicit.
- Route the existing signed authority current directly into semantic
  presentation instead of mixing its route language with decorative fluid.
- Apply the locked moving-reference-frame model throughout FREE with a current
  magnitude capped at 20% of hull calm-space reference speed.

### Three presentation variants

1. **Spacetime Rivers / Graphic Cosmic Swell — recommended.** Sparse broad
   streamlines and ribbons with three magnitudes, signed marching marks, and
   shallow lensing relief.
2. **Wavefront Surfing.** One or two giant moving fronts per viewport. The
   player reads and times the crest rather than following a persistent river.
3. **Signed ASCII Field — truth control.** Eight directions and three
   magnitude tiers with no shimmer in directional cells. It is intentionally
   plain and proves whether the mechanic is readable before art is layered on.

Lensing Sheets may be explored as the rendering treatment for the winning
variant, not as a fourth mechanical model.

### Twenty-two-second comparison capture

1. `0–3s`: CALM; the player can see that no route is active.
2. `3–6s`: one giant SWELL enters the viewport.
3. `6–10s`: the ship aligns; wake locks, speed rises, camera leads slightly.
4. `10–13s`: the ship cuts across; wake fractures and the carry falls away.
5. `13–17s`: a well compresses the swell into a BREAK and lethal core.
6. `17–22s`: the player grapples the well and releases toward an exfil route.

Capture each variant at 100%, 50%, and 25% decorative detail. Choose the lowest
detail level that still sells the fantasy.

## Human Acceptance Gate

The prototype succeeds when Greg can do all of the following without debug
overlays:

- identify the flow direction, fastest route, danger, and intended line within
  two seconds;
- predict which of two routes will be faster before the ship enters either;
- tell fast fabric from slow fabric in a paused frame and in motion;
- perceive with-current speed, against-current resistance, and cross-current
  drift without experiencing a mode switch;
- understand the result from the ship wake, motion, audio, and camera rather
  than a meter;
- read the same decision on a physical Steam Deck;
- see a massive disturbance reduce the scene to one dominant decision rather
  than add visual clutter.

Automated tests can protect the signed field and movement state transitions.
They cannot decide whether surfing feels good or whether the image reads.

## Decisions To Lock Before Production

1. **Does FREE use the moving-reference-frame model with current capped at 20%
   of hull calm-space reference speed?** Locked. Playtesting decides whether
   its motion and presentation are legible.
2. **Which three route-language variants enter the comparison?** Recommendation:
   Graphic Cosmic Swell / Spacetime Rivers, Wavefront Surfing, and Signed ASCII
   Field. Select the primary language only after the playable motion captures.
3. **Does the camera use restrained speed context?** Recommendation: yes;
   8–12% widening and velocity lead, with state freezes and a closer Deck
   baseline.

Supporting taste choices—including the winning route language and final Deck
baseline, brief RIDING/CUTTING/FIGHTING teaching text, universal semantic
values versus map hue, the exact well horizon treatment, and physical ship
minimum size—should be judged from the comparison capture rather than locked
in prose.

## Implementation Order After Decisions

1. **Force catalog:** identify every current and intended field shaper, direct
   consequence, and non-gravitational destination before locking visual rules.
2. **Truth and projection:** expose the signed semantic field and correct the
   isotropic viewport.
3. **Playable Shallows vertical:** real brake, the 20%-capped moving reference
   frame, continuous visual shorthand, and player wake.
4. **Motion comparison:** capture the three variants and let Greg choose.
5. **Migration:** make seeded sea, wells, event waves, hull response, camera,
   and map palettes use the chosen semantic language. Stars, moving masses,
   Inhibitors, portals, wrecks, and future structures retain their own
   actor/destination/threat language unless their authority contract changes.
6. **Deletion:** remove superseded decorative physics inputs, false route
   texture, and redundant shader paths only after the winning vertical works.

## Non-Goals

- No orbital, fluid-dynamics, or gravitational realism pass.
- No third navigable movement axis.
- No full renderer rewrite before a playable Shallows comparison.
- No new movement meter or telemetry-first explanation.
- No migration across every map before Greg selects the winning feel.
- No broad test-suite work as a substitute for the motion prototype.

This review supersedes the current direction-setting portions of
`v0.3.1-fabric-design.md` and the deferred
`v0.3.2-fabric-surfing-camera-review.md`. Those files remain historical design
evidence until the winning prototype updates the durable movement and visual
style contracts.

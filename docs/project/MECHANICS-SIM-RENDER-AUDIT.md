# Mechanics, Math, and Sim/Renderer Audit

Date: 2026-06-22

This pass looks at the current Three renderer, local movement code, server sim,
field math, and test coverage after the Three migration work. It is not a
rewrite plan. It is a ranked set of improvements that preserve the current game
identity: top-down ASCII fluid extraction, movement as economy, and a strict
separation between authoritative sim truth and client rendering.

## Short Take

LBH is in a good architectural place, but the next step is not "move more code
into Three." The highest leverage step is to make the invisible field model a
shared contract.

Right now there are several overlapping ideas of "the field":

- Local flight samples GPU velocity through `FlowField` and `fluid.readVelocityAt()`.
- The server samples an analytical/coarse field for current, gravity, wave, and
  hazard.
- The display shader derives visual excitement from density, visual density,
  velocity, and analytic well rings.
- The Three renderer consumes a finished canvas image, plus a small camera/ship
  motion context for parallax.

Those are all individually reasonable. The risk is that tuning any one of them
can make the others lie. The next foundation should be a named field sample
contract that both sim and renderer understand.

## What Is Strong Already

- `coords.js` is the right authority for world, screen, well, and fluid-UV
  conversion. Keeping that discipline will matter even more once Three owns more
  world entities.
- `physics.js` centralizes the main force profiles and gives the project a
  vocabulary for pull, push, wavefronts, and timestep application.
- The client fluid sim now separates physical density from `visualDensity`, so
  cosmetic signals can be loud without corrupting gameplay velocity.
- The camera-anchored fluid window plus world-anchored coarse memory is a good
  answer for large maps. It keeps local detail while giving offscreen flow a
  plausible return path.
- The Three backend has the right first shape: an orthographic top-down camera,
  depth-sorted scene groups, a render target, and a present pass. It is a real
  renderer shell, not just a flag.
- The rebuilt harness now checks renderer backend shape and nonblank captures,
  which is the minimum useful baseline for visual work.

## Main Gaps

### Field Truth Is Split

Local play uses GPU velocity as movement truth. Server authority uses the
coarse analytical field. Renderer passes infer surf lanes and field intensity
from textures. None of those currently share one typed sample shape.

Recommendation: introduce a shared `FlowSample` concept:

```js
{
  current: { x, y },
  gravity: { x, y },
  wave: { x, y },
  hazard: 0..1,
  surf: 0..1,
  signalShadow: 0..1,
  sources: { wellId, ringId, anchorId },
  confidence: 0..1
}
```

The exact implementation can stay adapter-based because the browser and server
run in different processes. The important part is that local, remote, tests,
and rendering all agree on what the channels mean.

### Baseline Current Coupling Differs Between Client And Server

The client always lerps ship velocity toward sampled flow using
`CONFIG.ship.fluidCoupling * currentCoupling`. The server only applies flow when
`currentCoupling !== 1.0`, and then it applies a delta relative to 1.0.

That means the default hull gets no server current coupling, while Drifter and
Breacher get a relative adjustment. This is likely to distort remote/local
movement feel before tuning even begins.

Recommendation: make server movement consume the same field-coupling model as
local movement. If the server should be less fluid-driven for performance or
netcode reasons, make that an explicit `authorityFluidCoupling` constant rather
than an accidental baseline-zero path.

### Remote Brake Direction Is Fragile

The client sends `moveX/moveY` to remote authority based on thrust, not on
facing. If the player brakes without thrust, the input vector can be zero, while
server brake subtracts along that vector. Tests post a manual `moveX: 1`, so
they cover the server brake math but not the actual client input packaging.

Recommendation: send facing direction independently of thrust intensity, or
define `intentX/intentY` as "current facing vector" and keep thrust/brake as
separate scalar economy verbs.

### Slingshot Authority Is Regression-Watch

Server-side slingshot authority has shipped. Remote-authority mode should render
affordance, engagement, orbital lock, banked energy, release, and chain state
from sim-owned snapshot state rather than local-only prediction.

Recommendation: treat future slingshot work as parity-sensitive tuning. The
server remains the owner of:

- anchor catalog and eligibility
- engage/release edge detection
- orbit direction and engage radius
- banked energy and chain count
- release impulse
- snapshot state for affordance rendering

The client can still predict the overlay and short-term movement, but the
authoritative state needs to be server-owned before slingshot route design can
be trusted in multiplayer or packaged remote play.

### Entity Rendering Has Not Crossed Into Three Yet

The Three backend owns a scene, but the fluid/ASCII image comes from the legacy
Composer and most game objects are still drawn on the 2D overlay after the Three
present pass. That is a sensible bridge, but it means visual depth, parallax,
and screen-space effects cannot yet respond cleanly to individual entities.

Recommendation: migrate entities into Three before porting the fluid solver.
The best order is ship, velocity readout/slingshot VFX, wave rings, portals,
wrecks, planetoids, remote players, scavengers, sentries, fauna, then inhibitor
forms. HUD and menus can stay 2D longer.

## Functional Improvements

1. Build field parity before more tuning.

   Add a browser/server parity suite that samples the same map points and
   compares current, gravity, wave, and hazard channels. This should run without
   requiring visual screenshots.

2. Promote movement into a shared integrator contract.

   Local and server code do not need the same module, but they should share the
   same step order and fixture cases:

   - read intent
   - spend delta-v
   - apply thrust/brake
   - sample field
   - apply current coupling
   - apply gravity/wave/star/planetoid forces
   - apply anchor mechanics
   - drag and speed cap
   - integrate and wrap
   - pickups, death, signal

   The exact order matters. Slingshot currently corrects after local ship
   gravity, while the server has no equivalent anchor phase.

3. Make surf a mechanic, not only a shader impression.

   The movement docs want readable wave catching and surf lanes. Add a gameplay
   scalar such as `surfOpportunity` based on flow alignment, wavefront/ring
   proximity, local hazard, and velocity alignment. Use it for:

   - a small assist or lock window
   - Drifter flow-lock eligibility
   - AI path scoring
   - renderer surf-lane color/glyph hints
   - test assertions

4. Normalize slingshot math against `physics.js`.

   Slingshot radial cancellation currently uses a local `mass / dist^2` style
   estimate, while well pull uses `inversePowerForce()` with reference distance,
   minimum distance, falloff, and max range. That can make cancellation tune
   differently from the force it is meant to counter.

   Use the same force profile for cancellation, then expose a single
   `gravityCancelFraction` tuning value.

5. Add route-design metrics for maps.

   Slingshot makes geography a puzzle. Maps should expose useful metrics:

   - number of 2-hop routes
   - number of 3-chain routes
   - average hazard along route
   - delta-v saved versus direct thrust
   - portal approach options
   - wreck density along high-skill lanes

   These can be offline map validation tests before they become UI.

6. Treat delta-v as a balancing budget.

   Give each hull expected budgets for "cross one screen," "recover from a bad
   well approach," "brake from surge," and "finish one route with two mistakes."
   Then tune tank size, burn efficiency, regen, drag, and current coupling
   against those budgets instead of isolated constants.

## Math Improvements

1. Fix the force-curve documentation mismatch.

   `physics.js` describes quadratic range fade in its overview and formula, but
   `inversePowerForce()` now uses a linear range fade. The code comment inside
   the function explains why. The header should be updated so future tuning does
   not assume the wrong curve.

2. Add a units table for every movement constant.

   The code already has world units, fluid UV, screen pixels, camera window
   units, and ASCII cells. Add a compact reference doc or config comments for:

   - acceleration, velocity, drag, and force units
   - world-scale versus fixed camera-window radii
   - values that should scale with map size
   - values that should stay constant across 3x3, 5x5, and 10x10 play

3. Make ring scale an explicit policy.

   Ring widths, accretion bands, kill radii, surf hints, wave widths, and route
   affordance radii should each declare whether they live in world units, fluid
   window UV, or screen/ASCII cells. This is the open problem that will keep
   returning as maps get larger.

4. Reduce gameplay dependence on synchronous GPU readback.

   `readPixels` is acceptable as a bridge, but it should not be core gameplay
   truth. Use analytical/coarse flow for gameplay, and let the GPU fluid remain
   the high-frequency visual field. If local single-player needs extra texture
   detail, cache a small sampled grid once per fixed tick rather than reading
   one point ad hoc through the render path.

5. Use semantic field channels for shaders.

   The display shader is already doing smart inference, but it should not have
   to rediscover gameplay truths from density and speed. Add a small semantic
   field target or texture with channels such as:

   - R: excitation or field energy
   - G: surf opportunity
   - B: hazard or collapse pressure
   - A: signal/inhibitor corruption

   ASCII and Three post effects can then make clearer visual promises.

## Visual Improvements

1. Promote world entities into Three in passes.

   Start with the ship and movement VFX because they benefit immediately from
   parallax and screen-space treatment. Then move hazards and interactables.
   Keep HUD text outside Three until world readability is settled.

2. Render surf lanes as an authored affordance.

   The current shader hints at surf bands near wells. Make this a deliberate
   layer driven by the `surf` channel:

   - faint cyan/green contour in the scene pass
   - directional ASCII glyph bias in the ASCII pass
   - stronger reveal when velocity aligns with the lane
   - suppression when hazard is too high

3. Add screen-space effects keyed to mechanics, not time.

   Good candidates:

   - high acceleration: mild chromatic shear along motion vector
   - near kill radius: radial lens compression and glyph starvation
   - high signal: unstable cell substitution and false edge echoes
   - slingshot charge: tightening orbital arc and release vector ghost
   - flow lock: quieter exhaust and cleaner current glyphs

4. Use depth as a readability tool.

   Three can keep the flat camera while still separating layers:

   - far starfield and grid respond gently to camera velocity
   - fluid/ASCII fabric stays gameplay readable
   - ship, anchors, and interactables sit above the fabric
   - warnings and HUD stay screen-space

   The goal is not "more 3D." The goal is a readable flat view with enough
   parallax to make movement feel physical.

5. Make route planning visible.

   Slingshot turns maps into networks. Add temporary route ghosts when an anchor
   is eligible: next-anchor glints, tangent entry marks, release-vector shadows,
   and chain-window fadeouts. These should be faint until the player is near an
   affordance so the screen does not become a route map all the time.

## Performance Implications

- Replacing per-frame point `readPixels` with analytical/coarse gameplay samples
  should improve consistency and remove a GPU/CPU synchronization hazard.
- Adding semantic field targets costs GPU memory and one or more passes, but it
  can reduce shader guesswork and make visual tests more deterministic.
- Moving entities into Three should be cheap if geometry is pooled and updated
  in place. The risk is not triangles; it is material churn and per-frame object
  allocation.
- Full fluid-solver migration to Three should wait until field semantics and
  entity rendering are stable. Porting the solver first would produce more risk
  than player-visible gain.
- Large-map performance should be tested with both `rich` and `minimal` render
  quality. Semantic channels need to degrade cleanly in minimal mode.

## Test Harness Improvements

1. Field parity tests:

   Compare local/browser field samples against server coarse field samples on
   known maps and synthetic single-well/wave fixtures.

2. Remote input packaging tests:

   Exercise real client `sendInput()` output for thrust-only, brake-only,
   thrust+brake, and inventory-open suppression. The current server brake test
   bypasses the client packaging path.

3. Movement order fixtures:

   Run deterministic one-second cases for thrust, brake, current, well pull,
   wave push, drag, speed cap, and wrapped world edges.

4. Server slingshot tests:

   Once implemented, test engage eligibility, chain rejection on same-anchor
   loops, release energy, snapshot state, and remote/local visual affordance.

5. Renderer semantic tests:

   In addition to nonblank screenshots, assert that surf, hazard, signal, and
   entity layers produce measurable pixels in deterministic fixtures.

6. Performance gates:

   Track frame time, renderer pass count, object count, material count, texture
   count, and any GPU-readback count. Make readback count visible in
   `__TEST_API.getPerfStats()`.

## Suggested Build Order

1. Field contract and parity fixtures.

   Define the shared sample shape, wire server/client adapters, and add tests.
   Do not change visuals yet.

2. Movement parity repair.

   Align current coupling, remote brake intent, force order, and slingshot force
   profiles. Keep numbers mostly unchanged until behavior matches.

3. Server-authoritative slingshot.

   Move anchor engagement and release into the sim, then restore remote
   affordance rendering from snapshot state.

4. Three entity migration.

   Move ship, movement VFX, slingshot overlays, waves, and interactables into
   Three while keeping the ASCII fabric source intact.

5. Semantic render channels.

   Add surf/hazard/signal field channels and teach ASCII/Three post passes to
   consume them.

6. Route and map redesign.

   Add offline route metrics, then adjust maps for 2-hop and 3-chain routes.

7. Feel and visual tuning.

   Tune delta-v, drag, current coupling, surf assist, slingshot release, and
   signal visuals with the new parity tests protecting the foundations.

## Bottom Line

LBH should stay visually weird and mechanically legible. The next architecture
move is to make the field readable to every system: sim, AI, renderer, tests,
and eventually players. Once that contract exists, Three can become more than a
presentation shell without stealing authority from the sim.

# Grapple Arc v3

Status: **current locked v0.3.1 movement contract** (2026-08-01)

Grappling is an arcade movement verb, not an orbital-dynamics simulation. The
player flies close, holds F / controller Y to catch an anchor, rides one clean
arc, then releases to leave on its tangent. The rule should be legible after a
single successful grapple.

## Player Rule

1. Any finite nonzero approach velocity can hook. A radial approach is valid.
2. The hook reach is visibly larger than the held swing radius. A swept query
   across the next authority step catches fast fly-bys that would miss at both
   sampled endpoints.
3. Capture reels the ship to the swing radius over 150 ms while preserving its
   entry speed and bending into a deterministic clockwise/counterclockwise arc.
4. Capture grants one immediate flat speed bonus derived from anchor family and
   physical scale. Holding longer never banks more speed.
5. While F / Y remains held, the grapple owns movement: the ship follows a
   fixed-radius kinematic arc. Thrust, fabric coupling, gravity, star/planetoid
   push, wave push, and drag do not stack into that authority step. Hazard
   contacts, pickups, and extraction still resolve.
6. Button-up releases tangent to the arc. Compatible outward input may bias the
   tangent by at most 10 degrees; backward, inward, or wild input is ignored.
   The tether/heading visually unspools for 125 ms without creating a second
   simulation state.
7. Brake aborts immediately on the tangent at entry speed and discards the
   grapple bonus.

## Size Contract

Every anchor derives both radii from its current physical/visible scale. A well
that grows gains a larger grapple silhouette instead of leaving an invisible
fixed-distance target at its center.

```text
swing radius = family clearance + physical radius * family swing scale
hook radius  = swing radius * 1.5
flat bonus   = family base bonus + physical radius * family bonus scale
```

For wells, physical radius is current `killRadius`; for Stars it is their visual
type multiplier and mass; for planetoids it is their radius or the family
minimum. Starting values live only in
`src/content/grapple-arc.data.json`. Authority and local affordance presentation
both read that file.

## State And Ownership

- **FREE:** ordinary movement forces run.
- **GRAPPLED:** authority runs only the reel/fixed arc plus contact and
  extraction consequences.
- **TERMINAL:** existing death/extraction rules own the player.

Aim rings, tether, arc line, release ghost, audio, and the 125 ms unspool are
presentation. Reliable F/Y rising edges plus held level remain transport truth;
server authority owns capture, arc position, speed, abort, and release.

There is no tangential-speed gate, energy bank, arc-degree payoff curve,
mechanical chain counter/window/multiplier, gravity cancellation, range-break
clamp, or hull coupling-window multiplier. Consecutive grapples naturally
compound because the next grapple receives the already-higher entry speed.
Future hull differences, if added, must be large readable verbs such as longer
reach or a larger flat boost—not fractional coupling windows.

## Acceptance

The mechanic is ready for Greg feel tuning when radial and high-speed approaches
hook generously, reel-in reads continuously, hold is stable under noisy nearby
forces, release is tangent and forgiving without steering backward/inward,
brake clearly aborts, and larger/grown anchors visibly own larger grapple arcs.
Automated fixtures protect only those source truths; human play owns feel.

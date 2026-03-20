# Gravity Slingshot — Design Document

> Turn the most dangerous thing in the universe into a highway.

---

## Fantasy

Wells are currently pure threats — things you avoid. Slingshot makes them the fastest route IF you're skilled enough. Skilled players seek out wells for speed. Unskilled players avoid them. That's the whole skill ceiling for movement.

---

## Design Principles

1. **Explicit player action required.** Proximity alone doesn't start a slingshot. You must press a button AND be in range. Like drift in Mario Kart (shoulder button + turning), grappling hooks (press + valid target), or rail grinds (jump + near rail + affordance conditions).
2. **Predictable outcome.** When you press the button, you know what's going to happen. Visible lane, clear entry, readable arc. Not a physics exploit — a deliberate verb.
3. **Player-controlled arc length.** Hold the button to orbit, release to exit with boost. Short hold = small turn + small boost. Long hold = full semicircle + max boost. The player controls the tradeoff between direction change and speed gain.
4. **Visual affordances before, during, and after.** The player can see the slingshot opportunity before engaging, see their arc during, and see their boosted trajectory after.

---

## Reference Mechanics

### Mario Kart (drift boost)
- **Initiate:** press shoulder button while turning. Not automatic — deliberate action.
- **Hold:** hold the button to build charge. Longer hold = bigger boost.
- **Release:** release button, boost fires in current direction.
- **Key lesson:** the initiation is explicit, the duration is player-controlled, the payoff scales with commitment.

### Grappling hook (Titanfall, Spider-Man, etc.)
- **Initiate:** press button + aim at valid grapple point. Must be in range AND have line of sight.
- **Ride:** physics swings you around the anchor point. You control when to let go.
- **Release:** let go at any point, exit velocity = current swing velocity.
- **Key lesson:** the grapple target must be visible and reachable. The swing arc is physics-driven but anchored to a clear point.

### Rail grinding (Tony Hawk, Jet Set Radio)
- **Initiate:** jump + be near rail + moving roughly along it. The game snaps you onto the rail.
- **Ride:** locked to the rail path. Some steering within the rail.
- **Exit:** jump off or reach the end.
- **Key lesson:** generous snap-to zone (you don't need pixel-perfect alignment), but you must be in the right neighborhood AND press the right button.

### Kerbal Space Program (orbital mechanics)
- **Reference for:** realistic gravity slingshots (too literal for us, but the feel of entering/exiting an orbit is instructive).
- **What we take:** the sense that orbits have predictable geometry. You can plan a trajectory.
- **What we don't take:** the manual precision. We want "fly near, press button, ride the lane" not "calculate burn vectors."

---

## The Slingshot Verb

### What the Player Sees (before engaging)

Around every well (and star), a **slingshot lane** is visible — a ring at a fixed distance showing where the orbital current is strongest.

The lane shows:
- **Where slingshot is possible** — the ring radius and position
- **Current orbital direction** — which way the lane flows
- **That a slingshot is available** — visual brightness/affordance intensifies when you're within activation range

The lane is always there, always visible. Part of reading the spacetime fabric. Like seeing a rail in Tony Hawk — you don't grind every rail, but you always know they're there.

### What the Player Does

1. **Approach** — fly toward a well or star. You can see the slingshot lane.
2. **Enter range** — when you're within activation distance of the lane, a visual cue intensifies (lane brightens, affordance appears). You're in the "can grapple" zone.
3. **Press X** — commit to the slingshot. Your ship snaps onto the lane and begins orbiting. This is a commitment — you're now on the rail.
4. **Hold X** — ride the arc. Your ship follows the lane at increasing speed. The longer you hold, the further around you go, the more speed you build.
5. **Release X** — exit the orbit. Your ship launches tangentially from the current position on the arc, with boosted velocity proportional to how long you held.

### The Arc

- **Entry:** snap onto the lane from any approach vector/direction. v1 has one lane at a fixed distance — the game snaps you to the nearest point on the ring.
- **During:** ship follows the circular lane path. Speed increases over the arc. The well's gravity is doing the work.
- **Exit:** tangential launch from current arc position. Exit direction = tangent to the circle at point of release. Exit speed = entry speed + boost accumulated during the arc.

**Arc length is player-controlled:**
- Quick tap of X (~0.3s) = small arc, small direction change, small boost. A nudge.
- Hold X for a quarter orbit = 90° turn + medium boost. A redirect.
- Hold X for a half orbit = 180° turn + maximum boost. The full slingshot. Reverse your direction at high speed.
- Hold beyond 180° = continue orbiting, but no additional boost gain beyond max. Safety valve — you can orbit for positioning but the speed payoff caps at 180°.

### Speed and Boost

- **During orbit:** ship accelerates along the lane. Speed increases by `energyPerQuarterOrbit` each 90°.
- **On release:** exit velocity = current orbital velocity (which is higher than entry). Plus a flat `boostMultiplier` applied to speed for `boostDuration` seconds, decaying exponentially.
- **Bigger wells = faster slingshots.** Lane orbital velocity scales with well mass. The most dangerous wells are the fastest highways.
- **Stars = smaller boost but safer.** No kill radius. Shallower deflection. Like a billiard bank shot instead of a full swing.

---

## Visual Affordances

### Always visible (lane)
- Ring around each well at slingshot distance
- Rendered in scene-shaping layer or overlay — coordinate with Forge
- Brightness/density indicates orbital current strength
- Rotates with well's orbital flow direction

### In activation range (ready to grapple)
- Lane brightens or pulses when player is close enough to activate
- Could show a subtle "entry gate" marker at the nearest point on the lane

### During slingshot (on the rail)
- Ship trail shifts color (blue → amber as speed builds)
- Exit direction indicator: line or arrow showing where you'll go if you release NOW. Rotates as you orbit.
- Speed buildup visual: trail gets longer/brighter

### On release (boost)
- Burst of trail particles in release direction
- Brighter, longer wake during boost window
- Speed lines or screen effect during boost decay

---

## Lane Properties

### v1 (jam scope)
- **One lane per well/star** at a fixed distance
- **Distance scales with well mass/strength** — bigger wells have lanes further out (safer margin from kill radius)
- **Entry from any vector** — snap to nearest point on the ring
- **Single orbital direction** — matches well's orbital flow

### v2 (future)
- **Near/far lanes** with different speed injections based on distance (close = dangerous + fast, far = safe + slow)
- **Direction matching bonus** — entering in the direction of the well's spin gives extra speed vs opposing spin
- **Chain detection** — releasing from one slingshot into another well's activation range shows the next lane's entry opportunity

---

## Interaction with Other Systems

| System | Interaction |
|--------|------------|
| Wells | Primary slingshot targets. Bigger well = faster lane, wider kill margin. |
| Stars | Secondary targets. Safer, smaller boost. Deflection rather than full orbit. |
| Force pulse | Can be fired during slingshot. Breaks out of orbit (emergency abort) + pulse effect. |
| Scavengers | Vultures can slingshot too (AI behavior). Creates "they know how to do THAT?" moments. |
| Planetoids | Future: moving slingshot targets. The lane moves with the planetoid. |
| Audio | Slingshot should have distinct audio: rising tone during orbit, snap on release, speed-rush during boost. |
| Signal (future) | Orbiting a well probably generates signal. Slingshot is a loud, fast maneuver — skill reduces signal cost (shorter orbits). |

---

## CONFIG Section

```javascript
slingshot: {
  activationRange: 0.08,        // world-units, how close to the lane to press X
  laneRadiusMult: 3.0,          // lane radius = well.killRadius * this
  snapSpeed: 8.0,               // how fast ship snaps onto lane (world-units/s)
  baseOrbitalSpeed: 0.4,        // world-units/s base orbital velocity
  orbitalSpeedMassMult: 0.3,    // orbital speed += well.mass * this
  energyPerQuarterOrbit: 0.15,  // speed gain per 90° of arc
  maxBoostOrbits: 0.5,          // boost caps at this many orbits (0.5 = 180°)
  boostMultiplier: 2.0,         // exit speed multiplier
  boostDuration: 2.5,           // seconds of boosted speed
  boostDecay: 0.5,              // exponential decay rate
  starBoostMultiplier: 1.4,     // stars give less boost than wells
  laneVisualRadius: 0.003,      // visual thickness of lane in UV-space
}
```

---

## Input

| Input | Keyboard | DualSense | Action |
|-------|----------|-----------|--------|
| Engage slingshot | E (or key TBD) | X | Press while in activation range → snap to lane |
| Hold orbit | Hold E | Hold X | Continue orbiting, building speed |
| Release | Release E | Release X | Exit tangentially with boost |
| Emergency abort | Spacebar (force pulse) | Square (force pulse) | Break out of orbit + fire pulse |

---

## Open Questions

1. **Cancel without pulse?** If you release X, you get the boost. If you pulse, you abort. Is there a "cancel without boost or pulse"? Maybe tap thrust (R2) to break out at current speed, no boost. Or just: release = always boost. Keep it simple.
2. **Lane visual ownership:** scene-shaping layer (Forge) or overlay (Claude)? For the prototype, overlay is faster. For the final game, scene-shaping is more integrated.
3. **Star slingshot arc:** wells do a full semicircle max. Stars should probably do a shallower deflection — maybe 90° max? Since they push outward, the physics metaphor is different.
4. **Multiple wells close together:** if two wells' lanes overlap or are very close, which one does X lock onto? Nearest well by distance? Or nearest lane by proximity to your position on the lane?
5. **Slingshot + tether interaction:** are these mutually exclusive (can't tether while slingshotting), or could tether → slingshot be a combo (tether to a planetoid near a well, release tether, immediately slingshot the well)?

---

## Prototype Plan (Saturday)

1. Single lane ring rendered on overlay around each well
2. X button (DualSense) / E key engages when in range
3. Ship follows circular arc at fixed radius while held
4. Speed increases per quarter-orbit
5. Release = tangential exit with boost multiplier
6. Exit direction indicator during orbit
7. Tune: lane radius, activation range, boost multiplier, orbital speed
8. Greg playtest: does it feel like a deliberate, satisfying maneuver?

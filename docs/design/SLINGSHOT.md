# Gravity Slingshot — Design Document

> Turn the most dangerous thing in the universe into a highway.

---

## Fantasy

Right now, wells are pure threats — things you avoid. But the best movement games turn obstacles into tools. Grinding rails in Tony Hawk. Grappling in Titanfall. Drifting in Mario Kart. The dangerous thing becomes the fastest route if you're skilled enough.

Gravity slingshot means: skilled players SEEK OUT wells for speed, while unskilled players avoid them. That's the whole skill ceiling for movement.

---

## The Core Loop

```
APPROACH → CATCH → ORBIT → RELEASE → BOOST
```

### 1. Approach

Fly toward a well at an angle — not directly at it. The skill is choosing your approach vector. Too direct = you spiral in and die. Too tangential = you don't catch the orbital band.

### 2. Catch

When you enter the **catch zone** (a ring between the kill radius and the outer pull boundary), AND your velocity has a strong tangential component (you're moving across the well's face, not straight at it), the game begins assisting.

Visual cue: the orbital current near you brightens. Your ship trail starts curving with the orbit.

**Catch condition:** `dot(normalize(velocity), tangentDirection) > tangentialThreshold`

The tangent direction is perpendicular to the radial line from ship to well, in the direction of the well's orbital flow.

### 3. Orbit

You're swinging. The well's pull provides centripetal force. Your tangential velocity carries you around. This is where energy builds:
- Each partial orbit accelerates you (angular momentum accumulation)
- The fluid's orbital current pushes you in the same direction (additive)
- An **orbital assist force** keeps you in the sweet spot band

The ship is NOT on rails — you're still in the physics sim — but the assist prevents turbulence from knocking you out of orbit. Like wave magnetism, it makes the physics feel like it "wants to carry you."

**Energy buildup:** speed increases by `energyPerOrbit` for each quarter-orbit completed. After a full orbit, you're significantly faster than you entered.

### 4. Release

Thrust to disengage. Your accumulated orbital velocity converts to linear velocity in whatever direction you're facing at the moment of release. The longer you orbited, the faster you go.

**The risk:** orbiting too long is dangerous. The well grows over the run. The catch zone shrinks toward the kill radius. A slingshot that was safe at minute 2 might kill you at minute 6. Max orbit limit (2 full orbits) provides a safety valve — forced release after that.

### 5. Boost

Brief post-release speed multiplier. Your ship is temporarily faster than normal max speed — the slingshot gave you escape velocity. Decays over 2-3 seconds back to normal.

During boost: wake is extra bright, ship feels fast, you can cover huge map distances in seconds.

---

## Input Model: Hybrid (Recommended)

**Automatic catch + thrust-to-release.**

- The game detects when you're in a viable slingshot and assists (no button needed)
- NOT thrusting = orbiting (you're riding the gravity, going with it)
- Thrusting = exit slingshot with boost (you're breaking free deliberately)

This is elegant because it ties into the surfing philosophy: the game rewards you for reading the physics and going with it. Thrusting near a well = fighting gravity = the panic instinct. Drifting near a well at the right angle = slingshot = the skilled move.

The game teaches players: sometimes, letting go IS the power move.

### Alternative input models (documented for testing)

**A. Fully automatic:** No input to engage or disengage. The physics handles everything. Pro: no new keybind. Con: hard to feel deliberate, might accidentally catch.

**B. Explicit key:** Hold a key to engage slingshot mode, release to disengage with boost. Pro: deliberate. Con: another keybind, feels "gamey."

If hybrid doesn't feel right in playtesting, try B.

---

## Visual Feedback

Visual feedback is critical. The player needs to KNOW they're in a slingshot.

### During catch
- Ship trail color shifts (blue → amber as energy builds)
- Orbital current near ship brightens (scene-shaping layer — coordinate with Forge)

### During orbit
- Trail becomes a continuous arc showing the orbit path
- Speed indicators: trail gets longer and brighter with accumulated energy
- Release direction indicator: a faint line or arrowhead showing where you'll go if you release NOW. This rotates as you orbit. Timing the release to point at your target is the skill.

### On release
- Burst of trail particles in the release direction
- Boost trail: brighter, longer wake during the speed boost window
- The fluid gets a visible disturbance from the high-speed departure

### Audio (when audio system exists)
- Catch: rising tone, pitch proportional to orbital speed
- Orbit: whooshing loop, pitch rising with energy
- Release: satisfying "snap" + speed-rush sound
- Boost: engine surge, decaying

---

## Interaction with Other Systems

### Force pulse during orbit
Eject radially outward at high speed. Emergency abort from a slingshot gone wrong. The pulse force ADDS to your orbital velocity for extra-dramatic escape.

### Scavengers can slingshot
Vultures especially. Watching an AI ship slingshot around a well to beat you to a portal creates "oh no, they know how to do THAT?" Advanced vulture behavior — only triggers when the vulture's target is roughly on the other side of a well.

### Planetoid slingshot
Same mechanic but on moving objects. The catch zone moves with the planetoid. Harder to time, but the payoff is speed from a moving reference frame (faster total velocity). This is the expert-level maneuver.

### Chaining
Releasing from one slingshot into another well's catch zone should naturally work — you're going fast, you hit a catch zone, you orbit again. No explicit chain bonus needed; the physics reward is sufficient (compounding speed). But the VISUAL could acknowledge chains (trail color escalation, maybe a subtle screen effect on the third consecutive slingshot).

### Tether + slingshot
Tether is the safe/slow version: attach and ride passively. Slingshot is the dangerous/fast version: active orbital maneuver with skill expression. Good skill ladder for players to progress through.

---

## Risk/Reward

| Risk | Reward |
|------|--------|
| Well kill radius (death) | 2-3x normal max speed |
| Signal generation from proximity (future) | Cross the map in seconds |
| Well grows over run — catch zone shrinks | Beat scavengers to portals/wrecks |
| Orbital path takes you through accretion disk | Chain slingshots for extreme traversal |
| Mis-timed release = wrong direction | Route through wells instead of around them |

The ideal slingshot is: approach at an angle, one half-orbit, release aimed at your target. 2-3 seconds total. High reward, medium risk. Full orbits are greedier — more speed but more time in danger.

---

## CONFIG Section

```javascript
slingshot: {
  catchInnerRadius: 0.08,      // world-units, inside this = death zone
  catchOuterRadius: 0.25,      // world-units, outside this = too far
  tangentialThreshold: 0.5,    // min dot(vel, tangent) to qualify (0-1)
  assistStrength: 0.4,         // orbital correction force multiplier
  boostMultiplier: 2.5,        // speed multiplier on release
  boostDuration: 2.0,          // seconds of boosted speed
  boostDecay: 0.5,             // exponential decay rate
  maxOrbits: 2.0,              // safety valve: forced release
  energyPerQuarterOrbit: 0.15, // speed gain per quarter-orbit
  trailColorShift: true,       // visual: trail amber during orbit
  releaseIndicator: true,      // visual: show release direction
}
```

---

## Open Questions

1. **Input model:** hybrid (auto-catch, thrust-to-release) vs explicit key? Needs playtesting. Hybrid is the recommendation but may feel too subtle.
2. **How readable does the trajectory need to be?** A projected arc is the clearest feedback but requires overlay rendering. Trail color change + speed buildup might be enough.
3. **Stars too?** Stars push outward — a star "slingshot" would be a flyby that flings you. Could be interesting but might dilute the mechanic. Defer until wells feel right.
4. **Chain bonus:** explicit reward for consecutive slingshots, or just let the compounding speed speak for itself?
5. **Catch zone vs kill radius growth:** as wells grow, does the catch zone shrink (harder to slingshot late-game) or stay constant (always viable)? Shrinking creates natural difficulty curve.
6. **Orbital direction:** must you orbit in the well's orbital flow direction, or can you slingshot against it? Against would be harder (fighting the current) but could create different trajectory options.
7. **Slingshot + signal interaction (future):** does orbiting a well generate signal? If yes, slingshot is loud (risk). If no, slingshot is the quiet fast-travel (reward for skill). Recommendation: generate LESS signal than equivalent thrust distance — slingshot rewards the skilled.
8. **When to prototype:** this is the most feel-dependent feature. Numbers won't be right on first try. Needs dedicated tuning session with Greg.

---

## Implementation Notes

The core mechanic is ~100-150 lines:
- Detect catch condition (distance + tangential velocity check)
- Apply orbital assist force while in catch zone and not thrusting
- Track accumulated energy (quarter-orbits counted by angular position change)
- On thrust (release): apply boost multiplier to velocity, decay over time
- Overlay rendering for trail color shift and release direction indicator

Can live in `slingshot.js` or be integrated into `ship.js` as an update phase.

Key dependencies: ship position/velocity, well positions, well kill radii. All already accessible.

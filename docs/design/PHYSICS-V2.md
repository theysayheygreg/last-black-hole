# Physics V2: Steady Currents + Event Waves

> Replaces the oscillating force injection model from V1.
> The V1 approach (wells pulse sinusoidally) created chaotic, unreadable
> movement. This design separates steady-state flow from dramatic events.

---

## The Insight from Playtesting V1

The first prototype used oscillating force injection at each well to fake gravitational waves. The result:
- The ship got pushed and pulled chaotically with no readable pattern
- You couldn't plan routes because the flow reversed every half-second
- "Surfing" felt like being in a washing machine, not riding a wave
- Multiple wells made it worse — overlapping oscillations created pure noise

**Root cause:** Pulsing force at the source ≠ propagating waves. The Navier-Stokes sim dampens and disperses the oscillation before it becomes a coherent wavefront. You get turbulence near the well, not rideable swells at distance.

**The fix:** Separate the steady state from the dramatic events.

---

## How Gravity Actually Works (The Metaphor We Should Follow)

Black holes don't pulse. They pull. Constantly.

**Steady state (what wells do all the time):**
- Spacetime flows toward the well like water toward a drain
- The flow is faster closer, slower far away — a smooth gradient
- Objects near the well get pulled in. Objects at distance feel a gentle tug.
- Two wells near each other create complex but *steady* flow: saddle points, orbital paths, convergence zones
- This is constant, readable, navigable. The terrain doesn't flicker.

**Events (what creates waves):**
- Gravitational waves in real physics come from *events* — mergers, collapses, sudden mass changes
- They're finite-duration phenomena, not steady-state
- They propagate outward from the event at a specific speed
- Between events, spacetime is smooth (just curved)

---

## The Two Movement Regimes

### Regime 1: Steady Currents (90% of gameplay)

The default state. Wells pull constantly. The fluid flows inward toward wells, creating:

**Inward flow** — persistent pull toward each well. Stronger near the center, weaker at distance. This is the "drain" effect.

**Orbital currents** — fluid doesn't fall straight in. Angular momentum creates circular flow patterns around wells. These are the "highways" of the map — persistent currents you can ride for free speed without thrust.

**Saddle points** — between two wells, their pulls balance. The flow is complex but stable — convergence zones where currents from different wells meet. These are the interesting navigation puzzles.

**Lee zones** — behind obstacles (future wrecks), the flow is calmer. Natural rest points.

**What this feels like to play:**
- You read the current map and plan routes
- Riding a current gives you free speed (no thrust = no signal)
- Fighting a current is slow and loud (thrust = signal)
- The skill is reading the flow and choosing efficient paths
- The terrain is stable enough to learn but complex enough to reward mastery

### Regime 2: Event Waves (dramatic moments)

Rare, powerful disruptions that create temporary surfable wave fronts.

**What triggers events:**
- **Well merger** — two wells drift close enough to combine. Massive outward shockwave reshapes the entire flow field. The biggest ride in the game. (Already in the design as "merger events" in MOVEMENT.md.)
- **Well growth pulse** — as the universe dies, wells periodically gain mass. Each growth step could emit a brief outward pulse as the new equilibrium settles. Smaller than a merger, but regular enough to create surfable moments.
- **Collapse event** — a portal evaporating, a wreck getting consumed by a well. Localized disturbance that radiates outward briefly.
- **Player actions** — force pulse (stretch goal) creates a deliberate wave.

**What event waves feel like:**
- You see it coming (visual cue: well brightening, flow speeding up, audio shift)
- You have a few seconds to position (the "lineup" from surfing)
- The wave passes through as a coherent outward-moving front
- If you're positioned right, it carries you (free speed, dramatic)
- If you're positioned wrong, it disrupts your path (pushed sideways, toward a well)
- After it passes, the flow settles back to steady state

**Implementation: explicit wave rings**
Instead of oscillating the well force, spawn ring-shaped force impulses that propagate outward at a fixed speed. Each ring:
- Starts at the event source
- Expands outward at a configurable speed (pixels/sec)
- Has a width (how thick the wavefront is)
- Has amplitude (how much force it applies to the ship/fluid as it passes)
- Decays with distance (amplitude decreases as the ring expands)
- Is visible in the ASCII (bright expanding ring of dense characters)
- Interacts with the fluid (pushes fluid outward as it passes, creating a visible bow wake in the ASCII)

---

## Orbital Flow: The Core Navigation Mechanic

With pulsing removed, the primary movement mechanic becomes **reading and riding orbital currents.**

### What Creates Orbital Flow

Wells don't just pull straight in. The Navier-Stokes sim naturally creates rotational flow around a drain. But we should enhance this:

**Injected angular momentum** — each well adds a slight tangential force component, not just radial. This creates persistent circular currents around the well. The direction (clockwise/counterclockwise) could be per-well, creating interesting interactions.

**Inter-well channels** — between two wells, the flow creates natural highways. Fluid pulled by well A passes near well B and gets redirected. These channels are the "rip currents" from the surfing metaphor — fast, directional, rideable.

**What the player does:**
- Far from wells: calm, slow, must thrust (loud) to move
- Near a well: strong currents, free speed, but risky (too close = death spiral)
- Between wells: the most interesting space. Currents from different wells create lanes, eddies, and saddle points. This is where skilled navigation pays off.

### How Orbital Flow Maps to the Surfing Metaphor

| Surfing Concept | V1 (Pulsing) | V2 (Steady Currents) |
|-----------------|-------------|---------------------|
| Catching a wave | Timing an oscillation cycle (chaotic) | Entering an orbital current at the right angle (readable) |
| Riding the face | Being pushed outward by a pulse (uncontrollable) | Riding an orbital highway between wells (smooth, sustained) |
| The lineup | Hoping to be in the right spot when the pulse hits | Positioning upstream of a current you want to ride |
| Reading the sets | Impossible (oscillations are too fast and irregular) | Reading the flow field to see where currents go |
| Getting caught inside | Being pushed/pulled randomly | Drifting too deep into a well's inward pull |
| Rip current | N/A | Inter-well channel — fast but takes you where it wants |
| Big wave | N/A (all waves feel the same) | A merger shockwave — rare, massive, dramatic |

---

## What Changes in the Code

### Remove
- Oscillating force injection from wells (`waveAmplitude`, `waveFrequency` in wells.js)
- The sinusoidal `waveAmp` calculation
- Density ring injection that was faking wave visibility

### Add
- **Tangential force component** in the well shader — adds angular momentum to create orbital flow
- **Wave ring system** — explicit propagating ring entities with position, radius, speed, amplitude, decay
- **Wave ring shader pass** — applies ring forces to the fluid as they propagate
- **Well growth events** — periodic mass increase triggers a new wave ring
- **Visual wave ring rendering** — bright expanding circles in the ASCII/overlay

### Modify
- Well gravity remains constant (no oscillation)
- Ship fluid coupling stays the same
- Affordances (wave magnetism) shift to work with wave rings instead of oscillation frequency
- CONFIG gains new values for orbital flow, wave ring parameters, event timing

### New CONFIG Values

```
wells: {
  // existing
  gravity, falloff, clampRadius, terminalInflowSpeed,
  shipPullStrength, shipPullFalloff,

  // NEW: orbital flow
  orbitalStrength: 0.3,     // tangential force as fraction of radial pull
  orbitalDirection: 1,       // 1 = counterclockwise, -1 = clockwise (per-well later)

  // REMOVE: waveAmplitude, waveFrequency (replaced by event system)
},

events: {
  // wave ring parameters
  waveSpeed: 200,            // pixels/sec propagation speed
  waveWidth: 30,             // pixels — thickness of the wavefront
  waveDecay: 0.95,           // amplitude multiplier per 100px of travel
  waveMaxRadius: 600,        // pixels — ring dies at this radius

  // well growth events
  growthInterval: 15,        // seconds between growth pulses
  growthAmount: 0.05,        // mass increase per pulse
  growthWaveAmplitude: 1.0,  // strength of the wave emitted on growth
}
```

---

## Acceptance Criteria for V2

- [ ] Wells pull constantly (no oscillation) — flow is steady and readable
- [ ] Orbital currents visible in the ASCII (circular flow patterns around wells)
- [ ] Ship can ride orbital currents for free speed
- [ ] Inter-well channels exist (flow lanes between wells)
- [ ] The flow field is readable — you can look at it and predict where you'd drift
- [ ] Event waves propagate outward as visible expanding rings
- [ ] Event waves push the ship when they pass (surfable moments)
- [ ] Well growth events trigger wave rings periodically
- [ ] Between events, the flow is calm and navigable
- [ ] 60fps maintained
- [ ] The game feels less chaotic and more strategic than V1

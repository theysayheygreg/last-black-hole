# Fauna — The Signal Feedback Loop

> The universe isn't empty. It's just very quiet until you aren't.

## What Fauna Is

Fauna are not enemies. They're environmental interference — like wind that notices you. Small, non-intelligent, individually harmless, collectively dangerous. They don't decide to attack. They drift toward noise because that's what they are.

They exist to give signal immediate, visible, physical consequences before the big systems (hostile scavengers, Inhibitor) kick in. A player at WHISPER sees a few moths flutter past. A player at BEACON is swimming through a cloud that makes everything harder. The feedback loop teaches signal cost through experience, not through a number on a HUD.

## The Three Types

### Drift Jellies

> They were here before the stars. They'll be here after.

**Fantasy:** Ancient, passive, part of the fabric. They don't hunt — they exist. You bumped into them because you were moving too fast.

**Appearance:** 3-4px translucent blobs. Teal-cyan glow (`#40E0D0`), pulsing slowly (0.5 Hz sine on alpha, range 0.3-0.7). Faint radial glow (2px halo). They look like bioluminescent plankton.

**Behavior:**
- Zero thrust. Pure fluid coupling. They go where the current goes.
- Spawn in clusters of 3-8 in deep void (far from wells, far from wrecks).
- Lifespan: 40-60 seconds, then dissolve (alpha fade over 3 seconds, final glow pulse).
- No attraction to signal. They're ambient — the baseline life of the universe.
- Bump contact: tiny velocity nudge to player (0.005 wu/s impulse), +0.01 signal spike.

**Density:** Always present. 5-10 on the map at any time regardless of signal level. They're scenery that occasionally gets in the way.

**Why they matter:** They establish that the universe has life before anything threatening shows up. When a player first bumps a jelly and sees the signal tick up, they learn: touching things has cost. The lesson is gentle.

**Rendering:** Canvas overlay, same layer as wrecks and scavengers. Teal circle with alpha pulse. No fluid injection (too small and numerous to splat — performance).

### Signal Moths

> They can hear you breathing.

**Fantasy:** Drawn to energy signatures the way moths track light. Each one is harmless. Fifty of them changing your trajectory is a problem.

**Appearance:** 2-3px bright points. Purple-blue glow (`#7B68EE`, medium slate blue). Rapid flicker (4-6 Hz, random phase per moth). Short motion trail (2-3px). They look like sparks or fireflies.

**Behavior:**
- Low thrust toward the highest nearby signal source (player, scavenger, or signal flare).
- Attraction force: `0.01 wu/s²` toward signal source, capped at `0.03 wu/s` max speed.
- Also coupled to fluid (drift with currents), but signal attraction overrides when close.
- Spawn at signal sources when signal ≥ WHISPER (0.15). Spawn rate scales with signal level.
- Lifespan: 20-40 seconds. Dissolve with a bright flash (final burst, no fade).
- Bump contact: small velocity nudge (0.008 wu/s impulse), +0.02 signal spike per hit.

**The feedback loop:**
```
Player thrust → signal rises → moths spawn → moths bump player
→ signal spikes (+0.02 each) → more moths spawn → more bumps → ...
```

This loop is self-limiting: moths have a lifespan, and if the player stops thrusting, signal decays, fewer moths spawn, the cloud thins. But if the player keeps thrusting (to escape the moths), the loop accelerates. The correct response is counterintuitive: stop. Drift. Let them pass.

**Density scaling:**

| Signal Zone | Moths on Map | Spawn Rate | Feeling |
|-------------|-------------|------------|---------|
| GHOST (0-0.15) | 0 | 0 | Alone |
| WHISPER (0.15-0.35) | 3-8 | 1 per 5s | Occasional sparkle nearby |
| PRESENCE (0.35-0.55) | 8-15 | 1 per 3s | Noticeable cloud forming |
| BEACON (0.55-0.75) | 15-30 | 1 per 1.5s | Thick swarm, bumps frequent |
| FLARE (0.75-0.90) | 30-50 | 1 per 0.8s | Overwhelming. Hard to navigate. |
| THRESHOLD (0.90+) | 50+ | 1 per 0.5s | The universe is screaming |

**Spawn location:** Spawn at random positions within 0.3-0.6 wu of the signal source. Not on top of the player — near enough to drift in, far enough to see coming.

**Interaction with flares:** Moths track the highest signal. If a flare is active and louder than the player, moths redirect toward the flare. When the flare expires, they snap back to the player. Flares are moth bait.

**Interaction with scavengers:** Moths track any signal source. A loud vulture gets moths too. A Hunter trailing you brings its own moth cloud. Observable: the Hunter approaching has a purple haze around it.

**Rendering:** Canvas overlay. Purple-blue point with flicker. No fluid injection per moth, but at high densities (30+), inject a single faint purple visual splat at the swarm centroid — the cloud itself becomes visible in the fabric.

### Rift Eels

> Something lives in the gradient.

**Fantasy:** Predators that patrol the boundary between gravity and void. They don't chase — they guard the routes you need to take. Going through the gravity gradient near a well means passing through their territory.

**Appearance:** 8-12px elongated shapes. Cool green glow (`#00FF88`, bright mint). Body rendered as 3-4 connected segments (each segment 3px, with 2px gaps). Subtle undulation animation (sine wave on segment offsets, 1 Hz). They look like eels or worms swimming through the fabric.

**Behavior:**
- Patrol along gravity gradients: they orbit wells at a fixed distance band (between ringOuter and ringOuter × 2.0). Not in the accretion disk — just outside it, where the gradient is steepest.
- Movement: tangential to the well's gravity field at their orbit distance. Same direction as accretion rotation. Speed: 0.03-0.05 wu/s (faster than drifting, slower than thrusting).
- Territorial: if the player enters their patrol band (within 0.08 wu of an eel), the eel lunges — brief acceleration toward player (0.1 wu/s for 0.5 seconds), then returns to patrol.
- Lunge contact: significant velocity nudge toward the well (0.02 wu/s impulse, directed INWARD), +0.05 signal spike. This is dangerous — they push you toward the thing that kills you.
- No signal attraction. They don't care how loud you are. They care about territory.
- Lifespan: permanent for the run. They don't spawn or despawn based on signal. They're features of the well's ecosystem.

**Spawn:** 2-4 eels per well, spawned at run start. Larger wells (higher mass) get more eels. Eels orbit at slightly different radii to avoid clumping.

**Counterplay:**
- Timing: eels orbit predictably. Watch the pattern, pass through the gap between eels.
- Force pulse: pulse an eel away. It's knocked out of orbit briefly (2-3 seconds), then returns.
- Speed: thrust through the patrol band fast enough that eels can't react. But thrusting = signal.
- The eel pushes you TOWARD the well. If you're already inside the patrol band heading inward (looting, extracting), this is dangerous. If you're heading outward, the push is just a bump.

**Why they matter:** Wells are where the good stuff is (wrecks drift toward them, accretion disks have loot). Eels make well approach a navigational puzzle, not just "fly to well, grab stuff." You need to read the patrol pattern and time your approach.

**Rendering:** Canvas overlay. 3-4 green segments in a line, undulating. Faint green trail. No fluid injection per eel, but eels glow in the fabric layer — inject a small green visual splat at each eel's position (one splat per eel per frame is fine, there are only 2-4 per well).

## Fauna Interaction Matrix

| | Drift Jelly | Signal Moth | Rift Eel |
|---|---|---|---|
| **Player bump** | +0.01 signal, tiny nudge | +0.02 signal, small nudge | +0.05 signal, push toward well |
| **Scavenger bump** | Same as player | Same as player | Same as player |
| **Force pulse** | Scattered (fluid push) | Scattered (fluid push) | Knocked from orbit 2-3s |
| **Signal flare** | No reaction | Redirects toward flare | No reaction |
| **Inhibitor (Swarm)** | Consumed (dissolve) | Consumed (dissolve) | Consumed (dissolve) |
| **Inhibitor (Vessel)** | Consumed | Consumed | Consumed |
| **Well gravity** | Pulled in, dies at kill radius | Pulled in, dies at kill radius | Orbits (immune to pull at patrol distance) |
| **Fluid currents** | Full coupling | Partial (signal overrides) | Tangential to gradient only |

**Fauna don't interact with each other.** No moth-on-jelly collisions, no eel-eating-moth behavior. This is a complexity budget decision — three distinct behavior models is enough. Intra-fauna interaction adds computation and visual noise without adding decision space for the player.

## The Ecosystem Feeling

At the start of a run, you see drift jellies. Ambient. Pretty. You bump one accidentally, see the signal blip, think nothing of it.

You start looting. Thrust to a wreck. Signal rises. A few moths appear, flickering purple at the edge of your vision. You ignore them.

You loot aggressively. Thrust against the current to reach a high-tier wreck. Moths thicken. You bump a few — signal spikes. More spawn. Now the cloud is interfering with your navigation. You stop thrusting, drift. The cloud thins.

You approach a well to grab a drifting wreck. Eels patrol the gradient. You time the gap, slip through, grab the wreck. On the way out, an eel lunges — you get pushed inward. You thrust to escape. Signal spikes. Moths swarm. You pulse to clear space. The pulse spikes signal more. A vulture notices. It starts heading your way.

The ecosystem creates a cascade: each layer feeds the next. Fauna → signal → more fauna → scavenger attention → more signal → Inhibitor pressure. The player who understands the cascade plays quietly. The player who doesn't creates their own disaster.

## Audio

| Fauna | Sound | Notes |
|-------|-------|-------|
| Drift jelly bump | Soft wet pop | Barely audible. Ambient. |
| Moth bump | Quick crystalline ping | Higher pitch than jelly. Repeats in clusters = signal alarm. |
| Moth swarm (10+) | Faint collective hum | Stereo spread, positional. You hear the cloud before you see it. |
| Eel lunge | Sharp hiss + thud | Directional. Warning sound — eels give a 0.3s audio cue before lunging. |
| Eel patrol (ambient) | Low rhythmic pulse | Very subtle. You hear it when orbiting near a well — helps time the gaps. |
| Fauna consumed by Inhibitor | Brief crackle + silence | Each consumed fauna is a tiny pop. A wave of pops = the Inhibitor just swept through. |

The moth swarm hum is important: at high densities, the collective hum becomes the dominant ambient sound. It's the audio equivalent of the visual cloud — you can hear your signal level even if the HUD is degraded.

## Config Block

```javascript
CONFIG.fauna = {
  // Global
  enabled: true,
  maxTotal: 80,               // hard cap on all fauna combined

  // Drift Jellies
  jellyCount: 8,              // ambient count, always present
  jellySpawnInterval: 8,      // seconds between replacements
  jellyLifespan: [40, 60],    // seconds [min, max]
  jellyBumpForce: 0.005,      // wu/s impulse on contact
  jellyBumpSignal: 0.01,      // signal spike on contact
  jellyColor: [64, 224, 208], // #40E0D0 teal-cyan
  jellyPulseHz: 0.5,          // alpha pulse frequency
  jellySize: 3,               // px radius

  // Signal Moths
  mothAttraction: 0.01,       // wu/s² toward signal source
  mothMaxSpeed: 0.03,         // wu/s cap
  mothSpawnRange: [0.3, 0.6], // wu from signal source
  mothLifespan: [20, 40],     // seconds [min, max]
  mothBumpForce: 0.008,       // wu/s impulse
  mothBumpSignal: 0.02,       // signal spike per hit
  mothColor: [123, 104, 238], // #7B68EE purple-blue
  mothFlickerHz: [4, 6],      // flicker frequency range
  mothSize: 2,                // px radius
  mothSwarmSplatThreshold: 30,// inject visual splat when count exceeds this
  mothSwarmSplatColor: [0.3, 0.2, 0.6], // faint purple in visual density

  // Spawn rates by signal zone (moths per second)
  mothSpawnRate: {
    ghost: 0,
    whisper: 0.2,
    presence: 0.33,
    beacon: 0.67,
    flare: 1.25,
    threshold: 2.0,
  },

  // Rift Eels
  eelsPerWell: [2, 4],        // [min, max], scaled by well mass
  eelOrbitMin: 1.0,           // multiplier on ringOuter for inner orbit edge
  eelOrbitMax: 2.0,           // multiplier on ringOuter for outer orbit edge
  eelSpeed: [0.03, 0.05],     // wu/s patrol speed
  eelLungeSpeed: 0.1,         // wu/s during lunge
  eelLungeDuration: 0.5,      // seconds
  eelLungeRange: 0.08,        // wu — triggers lunge
  eelLungeRecovery: 2.5,      // seconds before returning to patrol
  eelBumpForce: 0.02,         // wu/s impulse TOWARD well
  eelBumpSignal: 0.05,        // signal spike
  eelColor: [0, 255, 136],    // #00FF88 bright mint green
  eelSegments: 4,             // body segment count
  eelSegmentSize: 3,          // px per segment
  eelUndulationHz: 1.0,       // body wave frequency
  eelPulseAudioHz: 0.3,       // low patrol pulse frequency
  eelLungeWarning: 0.3,       // seconds of audio cue before lunge
};
```

## Implementation Notes

### FaunaSystem class (`src/fauna.js`, ~400 lines estimated)

```
FaunaSystem
├── update(dt, signalLevel, signalPos, ship, wells, flowField, scavengers)
│   ├── spawnJellies(dt)
│   ├── spawnMoths(dt, signalLevel, signalPos)
│   ├── updateAll(dt, flowField, wells, ship)
│   ├── checkCollisions(ship, scavengers)
│   └── cull()  // remove expired fauna
├── render(ctx, camX, camY, canvasW, canvasH)
│   ├── renderJellies()
│   ├── renderMoths()
│   └── renderEels()
├── getVisualSplats() → [{x, y, r, g, b, radius}]
└── initRun(wells)  // spawn eels at well orbits
```

Each fauna entity is a lightweight object: `{type, wx, wy, vx, vy, age, lifespan, phase, ...}`. No class instances per fauna — flat objects in typed arrays or plain arrays. Performance matters when there are 80 entities.

### Collision Detection

Fauna are small and numerous. Per-frame collision check against player + every scavenger would be O(fauna × entities). At 80 fauna × 10 scavengers = 800 checks — trivial.

But: check player first (always), scavengers only if within 0.5 wu of any scavenger (spatial culling). Moths can use a grid for fast neighbor lookup if count gets high.

### Rendering

All fauna render on the canvas overlay (same as scavengers, wrecks). No shader passes needed per fauna.

At high moth density (30+), inject a single faint purple visual splat at the swarm centroid into the visual density buffer. This makes the cloud visible in the fabric layer — you can see a purple smear in the ASCII even when individual moths are too small to read.

Eels inject individual green splats (one per eel per frame). There are at most ~20 eels on a big map. Negligible cost.

### Build Order

1. **Drift Jellies** — ambient spawning, fluid coupling, dissolve lifecycle, bump detection. Teaches the collision/signal connection without any threat.
2. **Signal Moths** — signal-attracted spawning, attraction force, density scaling. The feedback loop is the test: does signal create moths, do moths create signal?
3. **Rift Eels** — well-orbit patrol, lunge behavior, push-toward-well mechanic. The navigational puzzle.
4. **Audio** — per-type sounds, swarm hum, eel patrol pulse.
5. **Cross-system wiring** — fauna feeding into scavenger awareness, Inhibitor pressure, signal flare redirection.

## What This Doesn't Cover

- Fauna evolution (types changing over a run) — deferred
- Fauna loot (killing fauna drops items) — probably not. They're environment, not enemies.
- Fauna rendering in the ASCII shader (fauna as fabric distortions) — possible future upgrade, not needed for v1. Canvas overlay is sufficient.
- Boss fauna (large, unique creatures) — not designed. The Inhibitor fills that role.
- Depth-layer interaction (fauna at different parallax layers) — deferred to DEPTH-LAYERS implementation

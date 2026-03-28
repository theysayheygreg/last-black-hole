# The Inhibitor

> It doesn't belong here. Neither do you.

## What It Is

The Inhibitor is an entity that exists in the fluid/fabric layer of the universe — not a canvas-rendered sprite floating on top, but a distortion in the ASCII field itself. It looks like the universe is breaking. It hunts you by signal. It escalates across three forms during a match.

It is the consequence of your choices. Every thrust, every loot, every pulse added to the pressure that woke it. The Inhibitor didn't attack you. You summoned it.

## Core Design Principles

**It's an entity, not a map effect.** It has position, velocity, intent. It moves. It hunts. But it renders on the fluid/fabric layer (or a Z-plane above it), not as a vector object on the canvas overlay. This makes it feel like part of the universe's fabric breaking down — not a game enemy pasted on top.

**Map mutations happen separately.** Wells drifting, portals destabilizing, fluid corruption — these are the universe dying on its own clock. The Inhibitor is what happens when you make too much noise in a dying universe. Both systems exist. They're not the same thing.

**Three escalating forms.** Not difficulty scaling — identity shifts. Each form looks, moves, and threatens differently. The player encounters them in order across a match as pressure builds.

**Horror through complicity.** From Stellaris's Horizon Signal: the most effective horror comes from the player choosing every step. Each signal spike was your decision. The Inhibitor is the bill.

## Rendering: The Fabric Layer

All three forms render in the fluid/display shader layer or a Z-plane directly above it — never on the canvas entity layer. This is a hard design constraint.

Why: canvas entities (ship, wrecks, stars) feel like things IN the universe. The Inhibitor should feel like the universe itself going wrong. It's not a creature in space — it's space becoming hostile.

**Rendering techniques:**
- Character corruption: ASCII characters shift to wrong glyphs (`Ψ Ω ∞ ⌁ ∑ ∫`)
- Color intrusion: magenta/wrong-pink (`#FF2D7B`) bleeding into the normal palette
- Density injection: visual density splats in the fluid buffer with wrong colors
- Geometric override: hard straight lines cutting through organic fluid patterns
- Shimmer increase: affected area has 15-20% character flicker vs 0.5-2% normal

The Inhibitor's visual presence should be unmistakable but alien — it uses a color and geometry language nothing else in the game uses.

## Form 1: The Glitch

> First warning. Something noticed.

**When:** Inhibitor pressure reaches ~70% of wake threshold. This is the "stirring" phase.

**What it looks like:** A localized area of ASCII corruption — 20-30 cells where characters flicker to wrong glyphs. Math symbols, equation fragments, Unicode that doesn't belong. The corruption zone is roughly circular, 0.1 world-units diameter. Faint magenta color bleed at the edges.

It's ambiguous. Could be a rendering artifact. Could be interference from a nearby well. The first time a player sees it, they might not even register it as a threat. That's intentional — dread builds from uncertainty.

**Behavior:**
- Spawns at map edge farthest from player
- Drifts slowly toward the player's last high-signal position (not current position)
- Speed: 0.02 world-units/s (very slow — star drift speed)
- If player signal drops below Whisper (0.15) for 10+ seconds, the Glitch dissipates and reappears elsewhere later
- If player signal stays above Presence (0.35), the Glitch solidifies and begins tracking more aggressively (0.04 wu/s)
- No direct threat — the Glitch cannot kill you. It's a warning.

**Audio:** Faint tonal shift in the ambient drone. A barely perceptible high-frequency whine that fades in when the Glitch is within 0.5 world-units. The player should feel uneasy without knowing exactly why.

**Player interaction:** The Glitch teaches the player that signal has watchers. If you're playing carefully, you might never see Form 2. If you're reckless, the Glitch solidifies quickly and Form 2 arrives.

## Form 2: The Swarm

> It's awake. It's hunting.

**When:** Inhibitor pressure crosses the wake threshold (0.82-0.98, randomized per run). This is the moment. Irreversible for the rest of the run.

**The wake moment:**
- Screen flash (white, 0.3s)
- All ASCII characters glitch simultaneously for 1 second
- Audio: drone drops an octave, distortion spikes, deep boom, then 2 seconds of silence
- Then everything returns — but wrong. The drone has a new dissonant harmonic. The color palette is slightly warmer.
- Events log: "something has noticed you"

**What it looks like:** A roiling mass of corrupted ASCII — like the Gemini pre-vis image. A region of intense character corruption 0.2-0.4 world-units across, dense with wrong-colored characters, magenta and hot pink bleeding through the fabric. Characters churn and shift constantly — it looks alive. Organic but wrong.

The Swarm has tendrils — lines of corruption that extend outward along fluid current lines, following the flow. When the fluid carries particles past the Swarm, those particles come out corrupted (color-shifted, wrong characters) for a few seconds.

**Behavior:**
- Tracks the player by signal, not by line of sight
- Movement speed scales with player signal level:

| Player State | Swarm Speed | Feeling |
|-------------|-------------|---------|
| Drifting (silent) | 0.02 wu/s | Slow wander. Searching. You have time. |
| Light thrust | 0.05 wu/s | Following. Steady. It knows your direction. |
| Heavy thrust / against current | 0.10 wu/s | Closing. Your noise is feeding it. |
| Flare+ signal | 0.15 wu/s | Locked on. You need a portal NOW. |

- Updates target position every 3 seconds from accumulated signal
- When player is silent for 5+ seconds: enters search pattern (slow expanding spiral around last known position)
- NEVER gives up. NEVER despawns. But CAN be evaded through discipline.

**Threat:**
- Contact is not instant death
- Contact drains: removes one random cargo item per second of contact
- Contact corrupts: ship controls become sluggish (reduced thrust, delayed turning) for 5 seconds after escaping
- Contact generates massive signal spike (+0.25)
- Proximity (within 0.15 wu): fluid becomes highly turbulent, currents unpredictable, drift accelerates
- The Swarm is a rolling hazard zone — you navigate around it, through it only in desperation

**Fluid interaction:**
- The Swarm injects visual density in wrong colors (magenta/pink into the visual density buffer)
- It creates a local turbulence zone (velocity perturbation in the fluid sim)
- Wreck drift accelerates near it (it's a gravity disturbance)
- It corrupts the display shader output in its radius — characters shift wrong, colors bleed

**Audio:** Ring modulation of the drone × an irrational frequency (drone × √2). The entire soundscape sounds "wrong" — like a radio being jammed. Intensity scales with proximity. The Inhibitor's tone progressively takes over the mix as it gets closer. By close range, all other audio is suppressed except the drone and the Inhibitor tone.

## Form 3: The Vessel

> Last warning. The universe is closing.

**When:** 90-120 seconds after the Swarm wakes. Or immediately if player signal hits 1.0 while the Swarm is active.

**What it looks like:** Geometric. Sharp. The anti-fluid. Where everything in the game is organic curves and flowing ASCII, the Vessel is hard straight lines — rectangles, triangles, grids cutting through the character field. Like the pre-vis image: a bright magenta/pink diagonal slash across the screen.

The Vessel is large — 0.3-0.5 world-units across. It's the biggest non-well entity on the map. It doesn't flow — it slices. Its edges are crisp where everything else is soft. It renders as geometric override of the ASCII grid: cells within its boundary display grid patterns, straight lines, angular characters (`╔ ║ ╗ ═ ╬ ░ ▓ █`).

**Behavior:**
- Doesn't chase — it advances. Constant speed (0.08 wu/s) toward the player's position.
- No search pattern. No evasion. It knows where you are. Always.
- It consumes wells in its path — absorbing their mass, growing its own gravity field
- It blocks portals: any portal within 0.2 wu of the Vessel becomes non-functional (can't extract)
- It distorts the map: wells near it drift toward it (it's a super-attractor)

**Threat:**
- Contact is death. No grace period. No hull absorption. Dead.
- Its gravity field pulls the ship starting at 0.3 wu distance (like a well but with no orbital current — pure inward pull)
- The pull is strong enough that you need thrust to escape from 0.2 wu — but thrusting means signal, which means the Swarm (still active) tracks faster

**The endgame:**
- The Vessel + the Swarm are both active simultaneously. The Swarm hunts reactively (by signal). The Vessel advances steadily (by position). Two threats, two avoidance strategies that conflict.
- Portals are closing (universe clock). The Vessel is blocking some. The Swarm is between you and others.
- The player must navigate to an open portal while avoiding both. This is the peak decision-making moment.

**60 seconds after the Vessel appears:**
- A guaranteed final portal spawns (15 second lifespan) at the map position farthest from the Vessel
- This is the "get out NOW" moment
- If the player misses it: universe collapses, run ends in death

## Wake Mechanics: Threshold + Variance

From the three options evaluated (hard threshold, probability ramp, threshold + variance), we use **Option C: randomized threshold per run**.

```javascript
// Per-run setup
const inhibitorThreshold = CONFIG.inhibitor.thresholdMin +
  rng() * (CONFIG.inhibitor.thresholdMax - CONFIG.inhibitor.thresholdMin);
// Typically 0.82-0.98

// Per-frame pressure accumulation
inhibitorPressure += signalLevel * dt;                              // signal is primary driver
inhibitorPressure += (runElapsedTime / runDuration) * 0.001 * dt;  // time contributes too
inhibitorPressure += totalWellMassGrowth * 0.05;                   // universe aging

// Form transitions
if (inhibitorPressure > inhibitorThreshold * 0.7) → Form 1 (Glitch)
if (inhibitorPressure > inhibitorThreshold) → Form 2 (Swarm) — irreversible
if (inhibitorPressure > inhibitorThreshold * 1.3 || signalLevel >= 1.0) → Form 3 (Vessel)
```

The threshold varies per run (±~8%) so you can't memorize the exact moment. You feel it approaching but don't know exactly when. From EVE wormhole design: rules are consistent, parameters are hidden.

## Signal Flare Interaction

The signal flare (consumable) creates a decoy signal source. Both the Glitch and the Swarm track toward the highest signal. If the flare is louder than you, they pursue it instead. When the flare expires, they reorient to you — but the flare bought you time and potentially repositioned the threat.

Reading fluid currents matters for flare deployment: a flare dropped into a strong current will drift away from you faster, extending the diversion.

The Vessel ignores flares. It knows where you are. Always.

## HUD Degradation

As the Inhibitor approaches (any form), the HUD degrades:
- Panel positions jitter (1-3px random offset)
- False readings flash briefly
- Color bleeds between panels
- Text characters occasionally corrupt
- Intensity scales with proximity to any Inhibitor form

This is implemented via CSS transforms and filters on the HUD elements — no special rendering needed.

## Audio Architecture

| Phase | Audio Change |
|-------|-------------|
| Stirring (Form 1 nearby) | Barely perceptible high-frequency whine |
| Wake moment | Drone drops octave, boom, 2s silence, returns with dissonant harmonic |
| Swarm active | Ring modulation (drone × √2). Progressively takes over mix. |
| Swarm close | All audio suppressed except drone + Inhibitor tone |
| Vessel appears | Key change to tritone-based scale. Audio becomes *wrong*. |
| Vessel close | Tinnitus effect — persistent high-frequency tone |

The audio inversion moment (wake): ALL audio briefly plays through a ring modulator with extreme carrier frequency. Everything sounds alien for 0.5 seconds, then returns with the Inhibitor tone woven in permanently.

## Configuration

```javascript
CONFIG.inhibitor = {
  thresholdMin: 0.82,          // randomized per run [min, max]
  thresholdMax: 0.98,
  pressureFromSignal: 1.0,     // multiplier on signal contribution
  pressureFromTime: 0.001,     // time contribution per second
  pressureFromGrowth: 0.05,    // well growth contribution

  // Form 1: Glitch
  glitchRadius: 0.1,           // world-units — corruption zone size
  glitchSpeed: 0.02,           // wu/s base drift
  glitchSolidifySpeed: 0.04,   // wu/s when player signal is high
  glitchDissipateTime: 10,     // seconds of low signal to despawn

  // Form 2: Swarm
  swarmRadius: 0.3,            // world-units — corruption zone size
  swarmSpeedSilent: 0.02,
  swarmSpeedLight: 0.05,
  swarmSpeedHeavy: 0.10,
  swarmSpeedFlare: 0.15,
  swarmTrackInterval: 3,       // seconds between target updates
  swarmSearchDelay: 5,         // seconds of silence before search pattern
  swarmContactDrain: 1,        // cargo items lost per second of contact
  swarmContactSignalSpike: 0.25,
  swarmControlDebuff: 5,       // seconds of sluggish controls after escape

  // Form 3: Vessel
  vesselSpawnDelay: 100,       // seconds after Swarm wake
  vesselSpeed: 0.08,           // wu/s — constant advance
  vesselSize: 0.4,             // world-units across
  vesselGravityRange: 0.3,     // wu — pull starts here
  vesselGravityStrength: 0.8,  // strong pull
  vesselPortalBlockRange: 0.2, // wu — portals non-functional within this
  vesselKillRadius: 0.05,      // wu — instant death

  // Final portal
  finalPortalDelay: 60,        // seconds after Vessel appears
  finalPortalLifespan: 15,     // seconds — last chance

  // Visual
  corruptionColor: [255, 45, 123],  // #FF2D7B — the wrong pink
  glitchChars: 'ΨΩ∞⌁∑∫√∂∆≈≠±×÷',  // math symbols for corruption
  vesselChars: '╔║╗═╬░▓█╚╝╠╣',      // box-drawing for geometric form
};
```

## What This Doesn't Touch

**Map mutations** (wells drifting toward player, portals destabilizing, fluid corruption) are a separate system — "the universe is dying" happens on its own clock regardless of the Inhibitor. The Inhibitor is what happens when you're too loud in a dying universe. Both systems create pressure. They stack but don't depend on each other.

**Scavenger behavior changes** (hostile vultures, cargo raids, hunters) are signal-driven but not Inhibitor-driven. Scavengers react to signal. The Inhibitor reacts to accumulated pressure. Different triggers, different consequences, same input (player actions).

## Implementation Order

1. Inhibitor pressure system (accumulation + threshold)
2. Form 1: Glitch (visual corruption zone, simple drift AI)
3. Form 2: Swarm (wake event, signal-based hunting, contact effects)
4. Audio integration (ring modulation, mix takeover)
5. HUD degradation
6. Form 3: Vessel (geometric rendering, well consumption, portal blocking)
7. Final portal guarantee

## Lore (Implied, Never Explained)

The Inhibitor is not named in-game. There is no lore popup. The name exists in design docs and data core flavor text. What the player knows:

- Something was dormant.
- Your noise woke it.
- It doesn't belong in normal physics (it ignores fluid, uses wrong colors, wrong shapes).
- It consumes wells — the most powerful objects in the universe are food to it.
- It existed before the wells. Before the stars. Before everything you see.
- It is the reason civilizations left ruins instead of cities.

Data cores from derelict stations hint: "they tried to be quiet. it wasn't enough." Beacon archives: "the signal threshold was lower then. it woke earlier. there was no time." Vault logs: "we built the portals as escape routes. the inhibitors learned to close them."

The mystery is the point. The Inhibitor is scarier unexplained.

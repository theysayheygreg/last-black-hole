# Scavengers V2 — Signal-Reactive AI

> They were here first. They know the rules better than you.

## What Exists Now

Two archetypes (drifter/vulture), full physics model, state machine (drift → seekWreck → loot → seekPortal → extract → fleeWell), death spiral + loot drops, wake injection, bump collision, faction naming. 782 lines. It works — scavengers feel alive.

What's missing: they don't react to the player's signal level, they can't steal cargo, there's no Hunter archetype, and they don't coordinate. The threat model designed all of this but it never got built.

## Design Goals

1. Scavengers should feel like they're reading the same universe you are
2. High signal should change the social landscape, not just spawn more enemies
3. The player should be able to predict scavenger behavior from observable cues
4. Scavenger interactions should create stories, not just obstacles

## Signal-Reactive Behavior Tiers

The core idea: scavengers don't have magic knowledge of your signal number. They observe your behavior — thrust trails, wake intensity, proximity. Signal level is the game's internal shorthand for what they'd notice.

### Tier 1: Indifferent (GHOST / WHISPER — signal 0.00-0.35)

Current behavior. No changes needed.

- Drifters drift. Vultures compete for wrecks. Nobody cares about you specifically.
- Scavengers generate their own signal from thrusting. Vultures are louder than drifters.
- Visual: normal colors, normal speed.

### Tier 2: Aware (PRESENCE — signal 0.35-0.55)

Scavengers notice you exist but don't change their priorities.

**Drifters:**
- Reroute: if drifter's current path brings it within 0.3 wu of player, bias thrust direction away. Not fleeing — just giving you a wider berth.
- Reduce thrust intensity near player (quieter, less wake). Self-preservation instinct.

**Vultures:**
- Shadow: vultures that aren't actively pursuing a wreck will drift in the player's general direction (0.02 wu/s bias, very subtle). They're not attacking — they're positioning.
- Contested wreck priority increases: if a vulture and player are within 0.5 wu of the same wreck, vulture speeds up earlier (was: only when player is closer. Now: always, if at PRESENCE+).

**Visual cue:** Vulture eye (the bright pixel at the ship's nose) shifts from amber to a slightly brighter gold. Subtle enough that you'd only notice if you're looking.

### Tier 3: Hostile (BEACON — signal 0.55-0.75)

The social contract breaks. Scavengers start taking from you.

**Drifters become informants:**
- When a drifter "sees" the player (within 0.4 wu), it accelerates toward the nearest vulture.
- On arrival (within 0.15 wu of vulture), drifter emits a brief visual pulse (cyan flash) — the "report."
- The vulture that received the report gets a target lock on the player's last-known position.
- Drifter returns to normal behavior after reporting. One report per crossing per drifter.
- This is observable: you can see the drifter change course, see the flash, see the vulture change heading. Readable. Counterplayable — pulse the drifter away before it reports.

**Vultures begin cargo raids:**
- Vulture within 0.2 wu of player: enters new `RAID` state.
- RAID: thrust directly at player, bump on contact.
- Bump steals one random cargo item. Item spawns as a mini-wreck at player's position.
- Vulture immediately grabs the mini-wreck and transitions to `SEEK_PORTAL`.
- If vulture dies before extracting: item drops as debris wreck. Recoverable.
- If vulture extracts: item is gone. Consequence.
- Cooldown: a vulture that just raided won't raid again for 20 seconds.

**Portal blocking:**
- Vultures that are in `SEEK_PORTAL` state at BEACON+ signal will orbit the portal instead of immediately extracting.
- Orbit: slow circle at ~0.1 wu radius, body-blocking the approach.
- If player approaches within 0.15 wu: vulture extracts (taking the portal).
- If player doesn't approach within 15 seconds: vulture extracts anyway.
- The blocking is opportunistic, not coordinated. A vulture happens to be near a portal and decides to wait.

**Visual cue:** Vulture glow brightens. Thrust trail turns orange-red (angrier). Drifters that are heading to report have a faint cyan tint on their trail.

### Tier 4: Predatory (FLARE — signal 0.75-0.90)

Pack behavior. This is EVE's "tackle and gank."

**All vultures converge:**
- Every vulture on the map gets a target lock on the player (regardless of drifter reports).
- Vultures abandon current wreck/portal targets and enter a new `HUNT` state.
- HUNT: thrust toward player, matching speed but not entering raid range immediately.
- Formation: vultures try to approach from different angles (offset target position by ±60° per vulture). Creates a loose encirclement.
- When 2+ vultures are within 0.3 wu: they coordinate a push — alternating force pulses to shove the player toward the nearest well.

**Drifters flee:**
- All drifters transition to `SEEK_PORTAL` immediately. They know something bad is happening.
- Drifters that can't reach a portal in time drift to map edges and go passive.

**The squeeze:** Vultures aren't trying to kill you. They're trying to push you into a well. The well kills you. This is the dark forest at work — you drew attention, and the attention has consequences.

**Visual cue:** Vulture trails turn red. Formation approach is visible — you can see them fanning out. Drifters visibly scatter.

### Tier 5: Threshold Panic (THRESHOLD — signal 0.90+)

The Inhibitor is stirring or awake. Everything changes.

**All scavengers flee:**
- Every scavenger transitions to `SEEK_PORTAL`. Even vultures. Even mid-raid.
- They know what's coming. They've seen it before.
- Scavengers at this tier thrust at maximum intensity (loud, panicked, long trails).
- They race for portals with no regard for the player.

**The irony:** The most dangerous moment for portal competition is when everything is trying to leave at once. You and every scavenger are racing for the same exits. The cooperative flee creates the most competitive portal situation.

**Visual cue:** All scavenger trails turn white-hot (fear response). Thrust intensity at maximum. Visible panic.

## The Hunter

A third archetype. Not a promoted vulture — a different species.

**When:** First Hunter spawns when signal crosses BEACON (0.55) and stays there for 10+ seconds. Maximum 2 Hunters per run. They don't spawn from existing scavengers — they arrive from map edge, like they were drawn in by the noise.

**Appearance:** Red-orange hull `#C44020`. Slightly larger than vultures (80% player size vs 70%). Angular — sharper triangle shape. No faction name. Callsign is always a single word: "Warden", "Silence", "Correction", "Redline", "Terminus".

**Behavior:**
- Ignores wrecks. Ignores portals. Ignores other scavengers.
- Single state: HUNT. Always hunting the player.
- Movement: same physics model (thrust + fluid + gravity), but higher thrust magnitude (1.2× player max thrust). Fast, but still bound by currents.
- Targeting: updates position every 2 seconds from player's current position (not signal — the Hunter sees you directly). This is the key difference from the Inhibitor, which tracks by signal.
- Force pulse: fires at player when within 0.15 wu. Separate cooldown from player (8 seconds). Pushes player toward nearest well.
- Pulse pattern: always aims to push you wellward. The Hunter calculates the direction from player to nearest well and pulses from the opposite side.

**Counterplay:**
- The Hunter is fast but not infinitely fast. Surfing with current can outrun it.
- Force pulse knockback: pulse the Hunter away. It's subject to the same physics.
- Signal flare: Hunter ignores flares (it tracks by sight, not signal). Unlike the Inhibitor.
- The Hunter dies to wells. Same kill radius. You can bait it into a gravity well.
- Drifting silent doesn't help — the Hunter sees you. This is the opposite of Inhibitor counterplay. Signal flare doesn't work. Silence doesn't work. Movement skill is the only defense.

**Death:** Hunter consumed by a well drops a guaranteed rare-tier item. Reward for baiting it in. The wreck is named "Remains of [callsign]."

**Why only 2 per run:** The Hunter is a pressure tool, not a DPS check. One Hunter changes your routing. Two Hunters plus the Inhibitor plus vultures is the maximum decision density the game supports without becoming an action game. More than that collapses the dread into chaos.

## Scavenger Signal Generation

Scavengers generate signal too. This matters for the Inhibitor (which tracks peak signal) and for fauna (which swarm any signal source).

| Archetype | Thrust Signal | Loot Signal | Notes |
|-----------|--------------|-------------|-------|
| Drifter | 0.3× player rate | 0.5× player rate | Quiet. Rides currents. |
| Vulture | 0.8× player rate | 1.0× player rate | Loud. Races. |
| Hunter | 1.5× player rate | N/A (doesn't loot) | Very loud. Draws fauna. |

A loud vulture racing to a portal can attract fauna, which bump the vulture, which spike its signal, which attract more fauna. The feedback loop works for everyone, not just you. This creates emergent moments: a vulture gets swarmed by fauna and spirals into a well. The universe is consistent.

The Inhibitor tracks the highest single signal source. If a Hunter or a panicked vulture is louder than you, the Inhibitor drifts toward them. This is an advanced tactic: stay quiet, let the Hunter draw the Inhibitor's attention. But the Hunter is also trying to push you into a well, so you're playing two threats against each other.

## State Machine V2

```
                    ┌─────────────────────────────────────────┐
                    │                DRIFT                     │
                    │  (default — ride current, random thrust) │
                    └──────┬──────────┬───────────┬───────────┘
                           │          │           │
                    wreck nearby   signal≥FLARE   signal≥THRESHOLD
                           │          │           │
                    ┌──────▼──────┐   │    ┌──────▼──────┐
                    │ SEEK_WRECK  │   │    │   PANIC     │
                    └──────┬──────┘   │    │ (seek portal│
                           │          │    │  max thrust) │
                    ┌──────▼──────┐   │    └─────────────┘
                    │    LOOT     │   │
                    └──────┬──────┘   │
                           │          │
               ┌───────────▼──────────▼─────┐
               │       SEEK_PORTAL          │
               │  (vulture: may BLOCK first)│
               └───────────┬────────────────┘
                           │
               ┌───────────▼───────────┐
               │       EXTRACT         │
               │  (portal consumed)    │
               └───────────────────────┘

    OVERRIDE STATES (can interrupt any state):
    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
    │FLEE_WELL │  │  REPORT  │  │   RAID   │  │  HUNT    │
    │(all)     │  │(drifter) │  │(vulture) │  │(vulture @│
    │          │  │          │  │          │  │ FLARE)   │
    └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

**New states:**

- `REPORT` (drifter only, BEACON+): rush to nearest vulture, deliver player position, visual pulse, return to previous state
- `RAID` (vulture only, BEACON+): rush player, bump to steal cargo item, grab mini-wreck, flee to portal
- `BLOCK` (vulture only, BEACON+): orbit a portal instead of immediately extracting, body-block approach
- `HUNT` (vulture only, FLARE+): converge on player from offset angles, coordinate push toward wells
- `PANIC` (all, THRESHOLD+): abandon everything, seek portal at max thrust

Hunter has only: `HUNT` and `FLEE_WELL`. No other states. It doesn't loot, drift, extract, or flee from the player.

## Interaction with Other Threat Systems

### Scavengers × Fauna
- Fauna bump scavengers the same as player (signal spike, velocity nudge)
- A swarmed scavenger gets louder, attracts more fauna — same feedback loop
- Hunters are very loud and attract fauna. A Hunter trailing you brings a fauna cloud with it.
- Vultures at FLARE+ ignore fauna entirely (focused on the hunt). Drifters in PANIC ignore fauna.
- Fauna don't distinguish player from scavenger. They track signal.

### Scavengers × Inhibitor
- When Inhibitor wakes: all scavengers enter PANIC (existing behavior in Tier 5)
- Inhibitor tracks peak signal source — could be a scavenger, not you
- A Hunter's 1.5× signal rate means it might become the Inhibitor's primary target
- Scavengers can die to the Vessel (Form 3) — instant kill, same as player
- Swarm contact drains scavenger cargo too (they lose loot)

### Scavengers × Map Mutations
- Wells drifting toward player also drift toward loud scavengers
- Portal destabilization affects scavenger escape routes too
- The universe is dying for everyone, not just you

## Observable Tells

The player should never be surprised by a scavenger behavior change. Every state transition has a visual or audio cue:

| Transition | Tell |
|-----------|------|
| Drifter starts REPORT run | Cyan trail tint, changes heading suddenly |
| Drifter delivers report | Cyan flash at meeting point |
| Vulture enters RAID | Trail turns orange-red, heading locks onto player |
| Vulture steals cargo | Screen shake (minor), item-drop sound, mini-wreck visible |
| Vulture enters BLOCK | Orbiting pattern visible, amber pulse on portal |
| Vultures enter HUNT | Red trails, visible fan-out formation |
| Hunter spawns | Arrival sound (low boom), red-orange ship enters from edge |
| Hunter fires pulse | Directional shockwave toward player (visible in fluid) |
| All enter PANIC | Trails go white-hot, frantic thrust, scatter pattern |

The audio layer matters: scavenger state changes should have subtle SFX (thruster intensity shift, directional ping for raid). The player who pays attention can read the board before the threat arrives.

## Config Block

```javascript
CONFIG.scavengers = {
  // ... existing config (thresholds, speeds, loot targets, spawn) ...

  // Signal-reactive behavior
  awarenessRange: 0.4,         // wu — drifter "sees" player within this
  reportSpeed: 0.06,           // wu/s — drifter speed when reporting
  reportCooldown: 60,          // seconds — one report per drifter per crossing
  raidRange: 0.2,              // wu — vulture enters RAID within this
  raidCooldown: 20,            // seconds — per vulture, after raiding
  raidBumpForce: 0.04,         // velocity impulse on cargo steal
  blockOrbitRadius: 0.1,       // wu — portal blocking orbit
  blockTimeout: 15,            // seconds — gives up and extracts
  huntConvergeRange: 0.3,      // wu — formation distance before coordinated push
  huntAngleSpread: 60,         // degrees — offset per vulture in formation

  // Hunter archetype
  hunterEnabled: true,
  hunterSpawnSignal: 0.55,     // BEACON threshold
  hunterSpawnDelay: 10,        // seconds of sustained BEACON before spawn
  hunterMaxPerRun: 2,
  hunterThrustMult: 1.2,       // relative to player max thrust
  hunterPulseCooldown: 8,      // seconds
  hunterPulseStrength: 1.5,    // relative to player pulse
  hunterTrackInterval: 2,      // seconds between position updates
  hunterColor: [196, 64, 32],  // #C44020

  // Signal generation
  drifterSignalMult: 0.3,      // relative to player
  vultureSignalMult: 0.8,
  hunterSignalMult: 1.5,

  // Tier thresholds (match signal system zones)
  awareTier: 0.35,             // PRESENCE
  hostileTier: 0.55,           // BEACON
  predatoryTier: 0.75,         // FLARE
  panicTier: 0.90,             // THRESHOLD
};
```

## Implementation Notes

The existing scavenger code (782 lines) needs these additions:

1. **Signal awareness:** `update()` receives player signal level. Tier lookup drives behavior changes.
2. **New states:** REPORT, RAID, BLOCK, HUNT, PANIC added to state machine. Each is a method on the Scavenger class.
3. **Hunter class:** Extends or parallels Scavenger with stripped-down state machine. Could be a third archetype in the existing system (preferred — same physics, same rendering, different decision logic).
4. **Cargo steal mechanic:** Needs `inventorySystem` reference to remove a random item. Spawns mini-wreck via `wreckSystem.addWreck()`.
5. **Per-scavenger signal:** Each scavenger tracks its own signal level (simplified — just thrust-based, no equipment). Fed to fauna and Inhibitor systems.
6. **Observable tells:** Trail color modulation per state. Sound events on state transitions.

Estimated additions: ~200 lines for signal tiers + new states, ~100 lines for Hunter, ~50 lines for observable tells. Total: ~350 lines added to scavengers.js.

## What This Doesn't Cover

- Scavenger dialogue/barks (flavor text on state transitions — future polish)
- Scavenger loadout (equipment affecting behavior — future, ties into signal equipment system)
- Scavenger-scavenger combat (vultures attacking each other — not designed, may not need it)
- Multiplayer scavenger behavior (how scavengers react to multiple players — deferred)

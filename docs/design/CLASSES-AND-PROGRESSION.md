# Ship Classes, Progression, and PlayerBrain

> How pilots specialize, what gear means, and what gets tracked.

---

## The Core Insight

Every reference game converges on the same structure: **lock the verbs, free the adjectives.**

- Your class determines your *relationship to the game's core systems*
- Your build configures *how you express that relationship*
- Your gear provides *transient power that can be lost*

In LBH, the core system is the fluid sim. Class identity is your relationship to spacetime itself. Not "who deals more damage" — who *moves differently through the same ocean*.

---

## The Three Identity Layers

| Layer | Permanence | What It Decides | LBH Equivalent |
|-------|-----------|-----------------|----------------|
| **Hull** | Permanent per pilot | Your verbs. How you relate to physics. | Ship class |
| **Rig** | Persistent, upgradeable | How your verbs behave. Specialization. | Upgrade tracks + loadout slots |
| **Salvage** | Transient, at-risk | Power right now. Tactical options. | Run cargo, equipped artifacts |

Hull is who you are. Rig is what you've built. Salvage is what you're risking.

---

## The Five Hulls

Class identity comes from relationship to the fluid. Same ocean, five different ways to be in it.

### Drifter

*The current is the engine. You are the sail.*

- **Core verb:** ride
- **Fantasy:** the surfer. Patient, efficient, reads the water. Extracts with modest hauls but extracts *often*. Wins by reading the room, not dominating it.
- **Weakness:** terrible against opposing currents. When the fluid isn't helping, Drifters are slow and loud.
- **AI personality mapping:** Ghost, Prospector

**Ability kit:**

| Ability | Type | Description |
|---------|------|-------------|
| **Flow Lock** | passive trigger | When current-aligned for 3s, lock into a surfing state: +40% speed, signal generation drops to 10% of normal. Breaking alignment ends it. 5s cooldown before re-engaging. The Drifter's signature — this is what makes surfing feel like a class identity, not just a tactic. |
| **Current Sight** | passive | Flow lines render as faint trails in the HUD within sensor range. Other hulls fly blind; Drifters can read the river. Higher rig levels extend range and show flow intensity (color-coded). |
| **Eddy Brake** | active, 20s cooldown | Dump velocity into the fluid, creating a short-lived counter-eddy behind you. Instant stop + a 2s turbulence zone that slows pursuers. The Drifter's only combat verb — defensive, not offensive. |
| **Slip Stream** | passive | When following another ship's wake (within 0.1 wu behind, same heading), gain +20% speed and -30% signal. The convoy bonus. Works with AI ships — a Drifter trailing a Breacher gets a free ride at the Breacher's signal cost. |

### Breacher

*The current is in the way. You go through it.*

- **Core verb:** thrust
- **Fantasy:** the raider. Fast, aggressive, lives on the edge. Big hauls or spectacular deaths. Gets in, grabs the good stuff, gets out before the Inhibitor catches up.
- **Weakness:** signal management. Breachers are loud. They attract everything. If the run goes long, the Inhibitor is coming for them specifically.
- **AI personality mapping:** Raider, Desperado

**Ability kit:**

| Ability | Type | Description |
|---------|------|-------------|
| **Burn** | active toggle, fuel-limited | Overdrive thrust: 2× acceleration, 3× signal generation. Fuel pool (30s total per run, recharges slowly when not burning). The Breacher's clock-within-the-clock — burn too early and you're walking home. |
| **Shockwave** | enhanced pulse | Force pulse is 1.5× radius and applies a 2s stun to fauna/sentries (they stop patrolling). High signal cost (+0.15 spike). The Breacher doesn't sneak past threats — they blow them aside. |
| **Momentum Shield** | passive | At high velocity (>80% max speed), incoming well pull is reduced by 25%. Breachers can skim well edges that would capture slower hulls. Encourages the "fly fast, clip the gravity well, don't stop" playstyle. |
| **Smash Grab** | passive | Wreck pickup while moving at full speed (other hulls must slow to pickup radius). The flyover loot verb. Combined with Burn, this is the "hit the wreck at full burn and don't stop" move. |

### Resonant

*The current is a weapon. You bend it.*

- **Core verb:** pulse
- **Fantasy:** the controller. Doesn't just navigate the ocean — manipulates it. Creates favorable conditions rather than finding them. The "caster" archetype.
- **Weakness:** stationary vulnerability. Eddies are position-dependent. A Resonant who has to abandon their eddies loses their advantage. The Inhibitor dissolves eddies on contact.
- **AI personality mapping:** Vulture (uses pulse tactically)

**Ability kit:**

| Ability | Type | Description |
|---------|------|-------------|
| **Harmonic Pulse** | enhanced pulse | Force pulse creates a persistent eddy (5-8s) that spirals toward the Resonant's position. Stacking 2-3 eddies creates a local current network — wrecks drift to you, fauna get swept away. The Resonant's signature: building infrastructure in the fluid. |
| **Resonance Tap** | active, 15s cooldown | Place a resonance anchor at current position. While within 0.3 wu of the anchor, pulse cooldown is halved and pulse radius +30%. Moving away from the anchor costs these bonuses. The "set up shop" ability — rewards territorial play. |
| **Frequency Shift** | active, 45s cooldown | Invert the next pulse: instead of pushing, it *pulls*. Everything in radius moves toward the Resonant. Pulls wrecks, pulls fauna, pulls other ships. Extremely powerful for loot collection and extremely dangerous near wells (pulling yourself and everything else toward one). |
| **Dampening Field** | passive | Resonant's eddies slow the Inhibitor's movement by 30% while it's inside them. The only hull that can directly impede the Inhibitor. Doesn't stop it — just buys time. Eddies dissolve on Vessel contact (form 3 ignores them). |

### Shroud

*The current doesn't know you're there.*

- **Core verb:** hide
- **Fantasy:** the ghost. Moves through a world full of threats by being invisible to them. Wins by never being the loudest thing in the room. The extraction specialist — modest cargo, but almost always gets out.
- **Weakness:** combat. Shrouds have the weakest pulse, the smallest cargo hold, the lowest thrust. When forced into a fight, they lose. Their game is avoidance, not confrontation.
- **AI personality mapping:** Ghost

**Ability kit:**

| Ability | Type | Description |
|---------|------|-------------|
| **Wake Cloak** | active, 30s cooldown | Instantly drop signal by one full zone (BEACON → PRESENCE). Can be triggered while moving. The "duck into the shadow" emergency button. Doesn't work at THRESHOLD (too loud to hide). |
| **Signal Sight** | passive | See the signal level of all entities within sensor range as color-coded auras (green=ghost, yellow=presence, red=flare). See where the Inhibitor is tracking. Other hulls fly blind to the signal landscape; Shrouds see the whole threat picture. |
| **Ghost Trail** | passive | When below WHISPER signal, the Shroud's ship trail becomes invisible to other players and AI. Fauna ignore the Shroud entirely below PRESENCE. Scavengers don't detect until bumping range. The "I was never here" passive. |
| **Decoy Flare** | active, 60s cooldown, 2 charges per run | Launch a signal decoy at your current position. The decoy emits signal equal to your current level, decaying over 8s. Fauna, scavengers, and Inhibitor (forms 1-2) track the decoy instead. The Shroud's only offensive option — misdirection, not force. |

### Hauler

*The current is a cost of doing business.*

- **Core verb:** carry
- **Fantasy:** the trucker. The deep-space longshoreman. Not glamorous, not fast, but when a Hauler extracts, the vault *fills*. Wins by volume, not speed or stealth.
- **Weakness:** speed. Haulers are the slowest hull. They can't outrun the Inhibitor, can't keep up with Breachers, can't surf with Drifters. They need to plan routes carefully because they can't improvise.
- **AI personality mapping:** Prospector (patient, value-focused)

**Ability kit:**

| Ability | Type | Description |
|---------|------|-------------|
| **Salvage Lock** | active, 2 charges per run | Tag a wreck from sensor range. Tagged wrecks yield +1 bonus item and glow on HUD. The "I came for THAT specifically" ability. Tags persist until the wreck is looted (by anyone) or consumed by a well. Seeing your tagged wreck get looted by an AI player is the Hauler's worst nightmare. |
| **Reinforced Hull** | passive | Survive one well contact that would kill other hulls (resets per run). The well ejects you violently instead of consuming you, scattering 1-2 cargo items. Not a free pass — you lose some loot and get thrown — but you live. The Hauler's "too stubborn to die" moment. |
| **Tractor Field** | active, 25s cooldown | Short-range beam (0.15 wu) that slowly pulls one entity toward you — wrecks, stars, fauna. 3s channel, must maintain facing. Can pull a wreck away from a well before it's consumed. Can't pull players, portals, or the Inhibitor. The "save that loot from the gravity well" tool. |
| **Deep Scanner** | passive | Haulers see wreck contents (item tiers) before looting. Other hulls see "wreck" — Haulers see "wreck: T2, T3, T1." Combined with Salvage Lock, this lets Haulers plan routes around the highest-value targets. The information advantage that makes slow speed worth it. |

---

## How Hulls Work Mechanically

Hulls are weight tables on shared physics, not different code paths. Every hull has the same base variables — the hull sets the multipliers.

### PlayerBrain Coefficient Table

These are the resolved values that the sim ticks against. The hull provides base multipliers. The rig and salvage modify them further.

| Coefficient | What It Does | Drifter | Breacher | Resonant | Shroud | Hauler |
|------------|-------------|---------|----------|----------|--------|--------|
| `thrustScale` | Max acceleration | 0.7 | 1.4 | 0.9 | 0.8 | 0.6 |
| `dragScale` | Velocity decay rate | 0.85 | 1.0 | 0.95 | 0.90 | 1.1 |
| `currentCoupling` | How much fluid flow affects you | 1.6 | 0.7 | 1.0 | 1.0 | 0.8 |
| `signalGenMult` | Signal generation multiplier | 0.5 | 1.5 | 0.8 | 0.4 | 1.0 |
| `signalDecayMult` | Signal decay speed multiplier | 1.0 | 0.8 | 1.0 | 1.5 | 0.9 |
| `pulseRadiusScale` | Force pulse radius | 0.8 | 1.0 | 1.5 | 0.6 | 0.9 |
| `pulseCooldownScale` | Pulse cooldown multiplier | 1.0 | 1.0 | 0.6 | 1.3 | 1.0 |
| `pulseSignalScale` | Signal cost of pulse | 1.0 | 1.0 | 0.5 | 1.2 | 1.0 |
| `cargoSlots` | Max cargo capacity | 4 | 4 | 4 | 3 | 6 |
| `pickupRadius` | Loot collection range | 1.0 | 1.0 | 1.0 | 0.8 | 1.4 |
| `sensorRange` | Detection range for entities | 1.0 | 0.8 | 1.0 | 1.3 | 0.9 |
| `wellResistScale` | Resistance to well pull | 1.0 | 1.2 | 1.0 | 0.9 | 0.8 |
| `controlDebuffResist` | Multiplier on debuff duration | 1.0 | 0.7 | 1.0 | 1.0 | 1.2 |

Plus the class mechanic (a unique ability with its own state, cooldown, and rules).

### Coefficient Resolution Pipeline

```
Hull base multipliers
  + Rig upgrade modifiers (persistent, additive)
  + Equipped artifact effects (transient, per-run)
  + Active consumable buffs (temporary, ticking down)
  = Resolved PlayerBrain coefficients (what the sim uses)
```

Stacking rules:
- **Additive** within a layer (two rig upgrades each giving +0.1 thrustScale = +0.2)
- **Multiplicative** between layers (hull 0.7 × rig 1.2 × artifact 1.1 = 0.924)
- **Hard caps** per coefficient (thrustScale never exceeds 2.0, signalGenMult never below 0.2)
- **Conflicts:** some effects are mutually exclusive (can't equip two pulse modifiers simultaneously)

---

## The Rig (Persistent Progression)

The rig is your persistent build — upgrade tracks that survive across runs. This is where specialization happens.

### Upgrade Tracks (3 per hull)

Each hull has three upgrade tracks that push it deeper into its identity. You spend Exotic Matter (EM, the meta-currency from extraction) to advance. Tracks are linear — each level requires the previous.

**Example: Drifter tracks**

| Track | Focus | Levels | What It Does |
|-------|-------|--------|-------------|
| **Laminar** | Current mastery | 5 | +currentCoupling, -signal in flow lock, flow lock activates faster |
| **Edgerunner** | Well navigation | 5 | +wellResistScale, signal masking in accretion shadows, well proximity shows kill radius |
| **Gleanings** | Extraction value | 5 | +pickupRadius, chance for bonus loot on extraction, wreck value estimation in HUD |

**Example: Breacher tracks**

| Track | Focus | Levels | What It Does |
|-------|-------|--------|-------------|
| **Afterburner** | Raw speed | 5 | +thrustScale, burn duration, burn cooldown reduction |
| **Ironclad** | Survivability | 5 | +wellResistScale, +controlDebuffResist, shield charge on burn activation |
| **Smash & Grab** | Speed-looting | 5 | +pickupRadius while above PRESENCE signal, instant-pickup on flyover, cargo eject on death scatters further |

Each hull's tracks are intentionally asymmetric — they don't cover the hull's weaknesses, they deepen its strengths. A max-Laminar Drifter is a *better Drifter*, not a Drifter-who-can-also-breach.

### Why Not Cover Weaknesses?

Because gear (salvage) covers weaknesses. The rig sharpens your identity. Gear patches your gaps. If the rig covered weaknesses, every hull would converge to the same build at max level. Instead, a max-level Drifter and a max-level Breacher are *more different* than base versions, not less.

---

## Salvage (Transient Gear)

Salvage is found during runs and stored in the vault between runs. You choose what to bring. You lose what you're carrying on death.

### Item Tiers

| Tier | Rarity | Effect Magnitude | Risk Level |
|------|--------|-----------------|------------|
| **T1 Common** | Abundant | +5-10% to one coefficient | Low — easy to replace |
| **T2 Uncommon** | 1-2 per wreck | +15-25% to one coefficient, or minor unique effect | Medium |
| **T3 Rare** | 1 per 3-4 runs | +30%+ or build-warping unique effect | High — losing this hurts |
| **T4 Exotic** | ~1 per 10+ runs | Changes how a mechanic works entirely | Extreme — vault it or risk it? |

### Loot Affinity System

Three categories of artifacts:

| Category | Who Can Equip | Effect | Design Intent |
|----------|--------------|--------|---------------|
| **Universal** | Any hull, full effect | General-purpose buffs, utility | Every drop is useful right now |
| **Affinity** | Any hull, +50% on affinity hull | Strong effects, hull-tagged | "This would be amazing on my Drifter" |
| **Exclusive** | One hull only, strongest effects | Build-warping, class-defining | "This IS a Resonant item" |

Loot tables should be ~50% universal, ~35% affinity, ~15% exclusive. This means most drops are immediately useful, some are "save for my other pilot," and a few are powerful enough to be worth building a new pilot around.

### Build-Warping Examples (T3-T4)

- **Gravity Lens** (T4, Resonant exclusive): your pulse *attracts* instead of repelling. Completely inverts the verb. Pulling wrecks to you, pulling fauna into wells, creating inward eddies.
- **Dead Man's Thruster** (T3, Drifter affinity): thrust generates zero signal, but you can't brake. Constant velocity once moving. On a Drifter with Flow Lock, this is silent permanent surfing. On other hulls, it's a dangerous gamble.
- **Echo Chamber** (T4, Shroud exclusive): your signal decays into "ghost signals" — fake readings at your previous positions. Stacks with Decoy Flare for total misdirection.
- **Overcharged Core** (T3, Breacher affinity): +50% to all generation rates (thrust, signal, pulse) but -30% to all decay rates. Everything is louder and stays louder. On a Breacher with Burn, this is a supernova.
- **Void Anchor** (T4, universal): place a recall beacon. Once per run, teleport back to it. The only position-resetting item in the game. Changes extraction routing for any hull.
- **Cargo Brace** (T3, Hauler exclusive): cargo items can't be drained by the Inhibitor Swarm. The Hauler's insurance policy — you keep what you picked up.
- **Tidal Resonator** (T3, universal): near wells, your pulse creates a standing wave that persists for 10s. Any hull can surf it. Creates temporary infrastructure in dangerous space.

### The Vault Decision

Vault space is limited (starts at 20 slots, expandable through milestones). After each run:
- Extracted cargo goes to vault
- You decide what to keep, what to sell for EM, what to bring next run
- Bringing a T4 exotic into a run is a real decision — the upside is enormous, but death means it's gone

This is Marathon's Rook insight applied differently: the risk isn't "do I bring gear at all" — it's "do I bring my BEST gear."

---

## Stat Tracking (The Chronicle)

Track everything. Surface it as player identity and progression triggers.

### Per-Pilot Stats (Permanent)

**Run stats:**
- Total runs attempted / completed / abandoned
- Total extractions (per hull, per map seed)
- Total deaths (per cause: well, inhibitor swarm, inhibitor vessel, sentry push)
- Longest survival time (per map scale)
- Fastest extraction (per map scale)
- Runs with zero signal above WHISPER (ghost runs)
- Runs with signal above FLARE for >50% of duration (hot runs)

**Economy stats:**
- Total EM earned / spent
- Total items extracted (by tier)
- Total items lost to death (by tier)
- Most valuable single extraction
- Most valuable item ever lost
- Vault high-water mark (most items stored at once)

**Combat/interaction stats:**
- Total force pulses fired
- Total fauna bumped
- Total sentries evaded / lunged by
- Total AI players out-extracted (you escaped, they didn't)
- Total AI players beaten to a wreck (you looted it first)
- Total portals used (by type: standard, rift, unstable, final)
- Closest well approach without death (distance)
- Longest flow lock streak (Drifter)
- Highest burn chain (Breacher — consecutive burns without cooldown reset)
- Most eddies active simultaneously (Resonant)
- Longest time without detection (Shroud — no entity reacted to you)
- Most cargo extracted in a single run (Hauler)

**Signal stats:**
- Peak signal ever reached
- Time spent in each zone (cumulative)
- Total zone crossings (up and down)
- Fastest ghost-to-threshold spike
- Longest time at THRESHOLD without death

### Per-Run Stats (Ephemeral, Saved to Run History)

- Hull used, rig state at run start, salvage brought
- Map seed, map scale, well count
- Movement heatmap (coarse grid of time spent per cell)
- Signal curve over time
- Cargo timeline (what was picked up when, what was lost when)
- Inhibitor form reached, time of each form transition
- AI player outcomes (who extracted, who died, with what)
- Event log (every published event, timestamped)

### Milestone Triggers

Stats drive unlocks. Not achievements — content gates.

| Milestone | Trigger | Unlock |
|-----------|---------|--------|
| **First Blood** | Extract once | Vault access (was preview-only before first run) |
| **Seasoned** | Extract 10 times | Second loadout slot |
| **Ghost Protocol** | Complete 5 ghost runs (max WHISPER) | Shroud hull unlock |
| **Burn Notice** | Reach THRESHOLD 10 times | Breacher hull unlock |
| **Salvage King** | Extract 100 total items | Hauler hull unlock |
| **Resonance** | Fire 50 force pulses in a single run | Resonant hull unlock |
| **The Deep** | Survive 180+ seconds | Expanded vault (+10 slots) |
| **Inhibitor Survivor** | Extract after Vessel appears | T4 exotic drop guarantee on next extraction |
| **Current Master** | 60s+ flow lock streak | Drifter "Laminar" upgrade track tier 4 |
| **Completionist** | Extract with all 5 hulls | Universal rig slot (cross-hull upgrade) |

Starting hulls: **Drifter** (default, most forgiving) and **Breacher** (unlocked after 3 extractions — the aggressive option comes fast). Other three are milestone-gated.

---

## How This Maps to PlayerBrain

The PlayerBrain object in the sim resolves all of this into flat coefficients:

```
PlayerBrain {
  // Identity (from profile)
  pilotId, hullType, rigLevels[3],

  // Resolved coefficients (hull × rig × salvage)
  thrustScale, dragScale, currentCoupling,
  signalGenMult, signalDecayMult,
  pulseRadiusScale, pulseCooldownScale, pulseSignalScale,
  cargoSlots, pickupRadius, sensorRange,
  wellResistScale, controlDebuffResist,

  // Class mechanic state
  classMechanic: { type, cooldown, charges, active, ... },

  // Transient state (run-scoped)
  cargo[], equipped[], consumables[], activeEffects[],
  signal: { level, zone },
  controlDebuff,

  // Stats accumulator (written to profile on extraction/death/teardown)
  runStats: { ... }
}
```

The sim never reads the profile directly. It reads PlayerBrain coefficients. This is the Codex architecture's "boxed object" — hydrated from persistence at run start, written back at run boundaries.

---

## Decided (2026-03-31)

1. **Hull count: all five.** We have the design horsepower. Archetypes are differentiated by abilities, not just signal coefficients.

2. **No respec.** Rig upgrades are permanent. Deleting a pilot to start over is the old-school roguelike answer. Implications deferred.

3. **AI hulls: complementary, no duplicates.** Avoid duplicating the human's hull. Avoid all-same lobbies (Marathon's all-assassin problem — changes the pace of gameplay in ways we don't want). Personality constrains hull assignment.

4. **Rook: backlogged.** The zero-risk entry concept does a lot right in Marathon. Not for now, but worth revisiting. See BACKLOG.md.

5. **Loot: mixed universal + specialized.** Some artifacts are universal (any hull, full effect). Some have hull affinity (any hull can equip, +50% effect on affinity hull). Some are hull-exclusive (only that hull, strongest effects). This creates "relevant now" drops AND "save this for my other pilot" moments.

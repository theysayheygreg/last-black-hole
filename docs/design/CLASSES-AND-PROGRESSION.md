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

- **Core verb:** ride. Drifters generate almost no signal while current-aligned. They see further along flow lines. Their thrust is weak but their current coupling is extraordinary — where others fight the fluid, Drifters ARE the fluid.
- **Fantasy:** the surfer. Patient, efficient, reads the water. Extracts with modest hauls but extracts *often*. Wins by reading the room, not dominating it.
- **Class mechanic:** **Flow Lock** — when current-aligned for 3+ seconds, enter a locked-on surfing state with boosted speed and near-zero signal. Breaking flow lock has a cooldown.
- **Weakness:** terrible against opposing currents. When the fluid isn't helping, Drifters are slow and loud.
- **AI personality mapping:** Ghost, Prospector

### Breacher

*The current is in the way. You go through it.*

- **Core verb:** thrust. Breachers have raw acceleration that no other hull matches. They fight currents that would trap a Drifter. Their signal is high but their speed means they can outrun consequences — for a while.
- **Fantasy:** the raider. Fast, aggressive, lives on the edge. Big hauls or spectacular deaths. Gets in, grabs the good stuff, gets out before the Inhibitor catches up.
- **Class mechanic:** **Burn** — overdrive thrust mode that doubles acceleration but triples signal generation. Time-limited per run. The clock within the clock.
- **Weakness:** signal management. Breachers are loud. They attract everything. If the run goes long, the Inhibitor is coming for them specifically.
- **AI personality mapping:** Raider, Desperado

### Resonant

*The current is a weapon. You bend it.*

- **Core verb:** pulse. Resonants have enhanced force pulse — wider radius, lower cooldown, lower signal cost. They reshape the local fluid field around them. Pushing wrecks toward themselves, deflecting sentries, creating temporary eddies.
- **Fantasy:** the controller. Doesn't just navigate the ocean — manipulates it. Creates favorable conditions rather than finding them. The "caster" archetype.
- **Class mechanic:** **Harmonic Pulse** — force pulse creates a persistent eddy (5-8s) that flows toward the Resonant's position. Stacking eddies creates local current networks.
- **Weakness:** stationary vulnerability. Eddies are position-dependent. A Resonant who has to abandon their eddies loses their advantage. The Inhibitor dissolves eddies on contact.
- **AI personality mapping:** Vulture (uses pulse tactically)

### Shroud

*The current doesn't know you're there.*

- **Core verb:** hide. Shrouds have the deepest signal masking in the game. Enhanced decay in wreck wakes and accretion shadows. Fauna ignore them below PRESENCE. Scavengers don't detect them until bumping range. They see the signal levels of all nearby entities.
- **Fantasy:** the ghost. Moves through a world full of threats by being invisible to them. Wins by never being the loudest thing in the room. The extraction specialist — modest cargo, but almost always gets out.
- **Class mechanic:** **Wake Cloak** — entering a wreck wake zone instantly drops signal by one zone (BEACON → PRESENCE). 30s cooldown. The "duck into the shadow" move.
- **Weakness:** combat. Shrouds have the weakest pulse, the smallest cargo hold, the lowest thrust. When forced into a fight, they lose. Their game is avoidance, not confrontation.
- **AI personality mapping:** Ghost

### Hauler

*The current is a cost of doing business.*

- **Core verb:** carry. Haulers have expanded cargo (6 slots vs standard 4), enhanced pickup radius, and the unique ability to loot wrecks that other hulls can't access (heavy wrecks, locked containers). Their relationship to the fluid is pragmatic — not elegant, just effective.
- **Fantasy:** the trucker. The deep-space longshoreman. Not glamorous, not fast, but when a Hauler extracts, the vault *fills*. Wins by volume, not speed or stealth.
- **Class mechanic:** **Salvage Lock** — can mark a wreck for priority loot. Marked wrecks yield +1 bonus item. 2 marks per run. The "I'm here for THAT wreck specifically" play.
- **Weakness:** speed. Haulers are the slowest hull. They can't outrun the Inhibitor, can't keep up with Breachers, can't surf with Drifters. They need to plan routes carefully because they can't improvise.
- **AI personality mapping:** Prospector (patient, value-focused)

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

### Build-Warping Examples (T3-T4)

- **Gravity Lens** (T4): your pulse *attracts* instead of repelling. Completely inverts the verb. A Resonant with Gravity Lens plays a different game — pulling wrecks to you, pulling fauna into wells, creating inward eddies.
- **Dead Man's Thruster** (T3): thrust generates zero signal, but you can't brake. Constant velocity once moving. Drifters love it. Breachers fear it.
- **Echo Chamber** (T4): your signal decays into "ghost signals" — fake readings at your previous positions. Shrouds become impossible to track. Other hulls gain decoy capability they shouldn't have.
- **Overcharged Core** (T3): +50% to all generation rates (thrust, signal, pulse) but -30% to all decay rates. Everything is louder and stays louder. The Breacher's drug.
- **Void Anchor** (T4): you can place a recall beacon. Once per run, teleport back to it. The only position-resetting item in the game. Changes extraction routing completely.

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

## Open Questions for Greg

1. **Hull count:** five feels right for the archetypes, but is it too many for initial implementation? Could ship with Drifter + Breacher + one of {Resonant, Shroud, Hauler} and add the others later.

2. **Rig respec:** should upgrading be permanent, or should EM allow respec? Marathon's approach (permanent unlocks, no respec) creates commitment. D4's approach (free respec) creates experimentation. Leaning toward: respec costs EM but is possible.

3. **Starting hull for solo:** if solo = 1 human + 3 AI, should the AI hulls be assigned randomly, or should they complement the human's hull? (Drifter human → Breacher + Resonant + Shroud AI team for coverage)

4. **The Rook question:** should LBH have a zero-risk entry mode? You bring nothing, you spawn with disadvantages, but you can't lose anything. Marathon's Rook is brilliant for onboarding. Counterargument: the dread of loss IS the game.

5. **Cross-hull artifacts:** should some T4 exotics be hull-locked (only Resonants can equip Gravity Lens) or universal? Hull-locking creates trading/gifting incentive in multiplayer. Universal means every find is relevant to you.

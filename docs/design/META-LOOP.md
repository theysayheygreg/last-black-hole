# The Meta-Loop: Between Runs

> What happens after the portal closes. Where runs become a career.

---

## The Flow

```
RUN ENDS
   ↓
RESULTS SCREEN (extract or death — same structure, different data)
   ↓
VAULT + UPGRADES + LOADOUT (one screen, three tabs)
   ↓
CHRONICLE (accessible anytime, not gating)
   ↓
DROP (select map, confirm loadout, launch)
```

The meta-loop should take 30-90 seconds for a returning player who knows what they want. No forced tutorials, no mandatory menus, no unskippable animations. Get in, see what happened, make decisions, drop back in.

---

## Results Screen

Same skeleton for extraction and death. The inputs differ, the structure doesn't.

### Layout

```
┌─────────────────────────────────────────────────┐
│                                                 │
│              [STATUS LINE]                      │
│              [HULL ICON]                        │
│                                                 │
│  ─────────── RUN SUMMARY ───────────            │
│                                                 │
│  survival        3:42                           │
│  signal peak     FLARE (0.81)                   │
│  inhibitor       form 2 (swarm)                 │
│  wells visited   3 / 5                          │
│                                                 │
│  ─────────── CARGO ───────────                  │
│                                                 │
│  [item]  [item]  [item]  [ ]                    │
│   T2      T3      T1     empty                  │
│                                                 │
│  ─────────── NOTABLE ───────────                │
│                                                 │
│  closest well approach   0.04 wu (personal best)│
│  AI players outlasted    2 / 3                  │
│  new milestone: DEEP DIVE                       │
│                                                 │
│  ─────────── EARNINGS ───────────               │
│                                                 │
│  cargo value         340 EM                     │
│  survival bonus       50 EM                     │
│  milestone bonus     100 EM                     │
│  ────────────────────────                       │
│  total               490 EM                     │
│                                                 │
│  [CONTINUE]                                     │
└─────────────────────────────────────────────────┘
```

### Extraction vs Death — What Changes

| Field | Extraction | Death |
|-------|-----------|-------|
| **Status line** | `EXTRACTED` (green) | `CONSUMED` / `SHREDDED` / `DEVOURED` (red, cause-specific) |
| **Cargo section** | Shows items brought home — these go to vault | Shows items lost — crossed out, red, with tier labels. "You were carrying:" |
| **Earnings** | cargo value + survival bonus + milestones | survival bonus only (reduced by 50%). No cargo value — it's gone. |
| **Death cause** | n/a | `CAUSE: well collapse` / `inhibitor vessel` / `swarm drain` — with the entity name if it was a well ("consumed by Charybdis") |
| **Tone** | Brass warmth. "You made it." The numbers feel earned. | Cold. Clinical. "This is what you lost." No comfort, no softening. |
| **AI outcomes** | "Steady Hand extracted. Redline died." — you see what the competition did | Same — the AI outcomes don't change, but seeing "Redline extracted with 4 items while you died" stings |
| **Animation** | Items cascade into vault (brief, satisfying) | Items shatter/dissolve (brief, visceral) |

### Death Cause Taxonomy

| Cause | Status Line | Flavor |
|-------|------------|--------|
| Well kill radius | `CONSUMED BY [well name]` | "The singularity was patient." |
| Inhibitor Vessel (form 3) | `DEVOURED` | "The vessel found you." |
| Inhibitor Swarm cargo drain (all items drained, then killed) | `SHREDDED` | "Nothing left to take." |
| Sentry push into well | `CONSUMED BY [well name]` | Same as well death — the sentry didn't kill you, gravity did. |
| Time expiry (run duration exceeded) | `COLLAPSED` | "The universe closed." |

### Run Summary Fields

Always shown:
- **survival** — mm:ss format
- **signal peak** — highest zone reached + numeric value
- **inhibitor** — highest form reached (or "dormant" if never triggered)
- **wells visited** — how many unique wells you came within 0.3 wu of

Contextual (shown only if interesting):
- **flow lock time** — Drifter only, total seconds in flow lock
- **burn fuel used** — Breacher only, seconds of burn consumed
- **eddies created** — Resonant only, total harmonic pulse eddies placed
- **time undetected** — Shroud only, seconds where no entity reacted to you
- **cargo extracted** — Hauler only, total items (including bonus from salvage lock)

### Notable Events

The results screen highlights 2-3 "notable" moments from the run, pulled from the event log:
- Personal bests (closest well approach, longest flow lock, fastest extraction)
- Milestone unlocks (always shown, always highlighted)
- AI player outcomes that are interesting ("Duskwalker extracted with a T4 exotic" / "All In died to the Inhibitor")
- Near-misses ("survived well contact via Reinforced Hull" / "shield burst absorbed Charybdis")

### Earnings Calculation

```
cargo_value = sum(item.value for item in extracted_cargo)
survival_bonus = floor(survival_seconds * 0.5)  // ~1 EM per 2 seconds
milestone_bonus = sum(milestone.reward for milestone in newly_unlocked)
death_penalty = 0.5  // death gets 50% of survival bonus, no cargo

extraction_total = cargo_value + survival_bonus + milestone_bonus
death_total = floor(survival_bonus * death_penalty) + milestone_bonus
```

EM is never negative. You always earn *something* — even a death run where you survived 30 seconds gets 7-8 EM. The floor is low but it's not zero. This prevents the "I wasted my time" feeling while keeping extraction dramatically more valuable.

---

## Run Result Package

This is the data that flows from the sim to the persistence layer when a run ends. Codex's control plane writes this at the extraction/death/disconnect boundary.

```javascript
RunResult {
  // Identity
  runId,
  pilotId,
  profileId,
  hullType,
  rigLevels: [track1, track2, track3],

  // Outcome
  outcome: "extracted" | "dead" | "abandoned" | "disconnected",
  deathCause: null | "well" | "inhibitor_vessel" | "inhibitor_swarm" | "collapse",
  deathEntityId: null | string,  // which well/inhibitor killed you
  survivalTime: number,          // seconds

  // Cargo
  cargoExtracted: Item[],        // items that made it home (empty on death)
  cargoLost: Item[],             // items lost to death/drain
  salvageBrought: Item[],        // what loadout items were risked

  // Signal
  signalPeak: number,            // highest signal level reached
  signalPeakZone: string,        // zone name at peak
  timePerZone: { ghost: s, whisper: s, ... },  // seconds in each zone

  // Inhibitor
  inhibitorFormReached: 0-3,
  inhibitorFormTimes: [null, t1, t2, t3],  // simTime when each form appeared

  // Economy
  emEarned: number,              // total EM from this run

  // AI context
  aiOutcomes: [{ personality, hullType, outcome, cargoCount }],

  // Notable events (filtered from event log)
  notables: [{ type, description, value }],

  // Milestones unlocked
  milestonesUnlocked: [{ id, name, reward }],

  // Stats delta (what changed on the profile)
  statsDelta: {
    runsAttempted: +1,
    runsCompleted: +0 or +1,
    totalSurvivalTime: +survivalTime,
    totalEmEarned: +emEarned,
    // ... per-stat increments
  },

  // Map context
  mapId: string,
  mapScale: number,
  wellCount: number,
  seed: number,
}
```

---

## Vault + Upgrades + Loadout

One screen, three panels. Always accessible between runs. This is where you spend time — but not too much time.

### Layout

```
┌───────────────────────────────────────────────────────────┐
│  PILOT: Steady Hand    HULL: Drifter    EM: 2,340        │
│  ═══════════════════════════════════════════════════════  │
│                                                           │
│  [VAULT]          [RIG]            [LOADOUT]              │
│   ▼ active         ○               ○                     │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                                                     │ │
│  │   VAULT (20 / 30 slots)                             │ │
│  │                                                     │ │
│  │   [T3 Dead Man's Thruster ◆DFT]  [T2 Hull Plate]   │ │
│  │   [T2 Signal Dampener]           [T1 Cargo Net]     │ │
│  │   [T1 Flow Reader]              [T4 Void Anchor ★]  │ │
│  │   [T2 Pulse Amplifier]          [T1 Shield Cell]    │ │
│  │   ...                                               │ │
│  │                                                     │ │
│  │   ──── ACTIONS ────                                 │ │
│  │   [SELL] selected → 45 EM    [EQUIP] → loadout      │ │
│  │                                                     │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  [DROP]  select map →                                     │
└───────────────────────────────────────────────────────────┘
```

### Vault Panel

The vault is a flat grid of items. No categories, no folders — just items sorted by tier (T4 first) then by name.

- **Capacity:** starts at 20 slots, expandable via milestones (max 40)
- **Sell:** select items, see total EM value, confirm. Bulk sell supported.
- **Item display:** `[T3 Dead Man's Thruster ◆DFT]` — tier, name, affinity tag (◆DFT = Drifter affinity, ★ = universal, ◇RES = Resonant exclusive)
- **Item inspect:** select an item to see its coefficients, flavor text, and which hull benefits most
- **Sort:** by tier (default), by affinity (group by hull), by value (EM sell price)

### Rig Panel

Three upgrade tracks per hull. Linear progression. No respec.

```
┌─────────────────────────────────────────────────────────┐
│  RIG: Drifter                                           │
│                                                         │
│  LAMINAR (current mastery)          ████░ 4/5           │
│   next: flow lock activates 0.5s faster                 │
│   cost: 350 EM                     [UPGRADE]            │
│                                                         │
│  EDGERUNNER (well navigation)       ██░░░ 2/5           │
│   next: +10% wellResistScale                            │
│   cost: 200 EM                     [UPGRADE]            │
│                                                         │
│  GLEANINGS (extraction value)       █░░░░ 1/5           │
│   next: wreck value estimation in HUD                   │
│   cost: 150 EM                     [UPGRADE]            │
│                                                         │
│  total invested: 1,100 EM                               │
└─────────────────────────────────────────────────────────┘
```

Each level shows: what you get next, what it costs. No hidden information. The progress bar is visual shorthand for "how deep into this track am I."

### Rig Upgrade Tracks (All 5 Hulls)

**Drifter**

| Track | Focus | L1 | L2 | L3 | L4 | L5 |
|-------|-------|----|----|----|----|-----|
| **Laminar** | Current mastery | +0.1 currentCoupling | Flow lock: -0.5s align time | +0.1 currentCoupling | Flow lock: -0.5s align time | Flow lock signal mult → 0.05 (halved) |
| **Edgerunner** | Well navigation | +0.1 wellResistScale | Signal masking in accretion shadows (+20% decay) | +0.1 wellResistScale | Well kill radius visible in HUD | Eddy brake cooldown -5s |
| **Gleanings** | Extraction value | +0.1 pickupRadius | Wreck value estimation (tier visible before loot) | +0.1 pickupRadius | Chance for +1 item on extraction (20%) | Slip stream signal reduction → 0.5 |

**Breacher**

| Track | Focus | L1 | L2 | L3 | L4 | L5 |
|-------|-------|----|----|----|----|-----|
| **Afterburner** | Raw speed | +5s burn fuel | +0.1 thrustScale | +5s burn fuel | Burn recharge rate +50% | Burn thrust mult → 2.5 |
| **Ironclad** | Survivability | +0.1 wellResistScale | +0.15 controlDebuffResist | Momentum shield threshold -10% | Shield charge on first burn activation per run | Shockwave stun duration +1s |
| **Smash & Grab** | Speed-looting | Smash grab: pickup at 90% speed (was 100%) | +0.1 pickupRadius | Smash grab: pickup at 70% speed | Cargo eject on death scatters further (others can grab) | Loot spikes signal -30% |

**Resonant**

| Track | Focus | L1 | L2 | L3 | L4 | L5 |
|-------|-------|----|----|----|----|-----|
| **Harmonics** | Eddy mastery | +1 max eddy | Eddy duration +2s | Eddies pull wrecks (not just flow) | +1 max eddy | Eddies visible to all players (team utility) |
| **Anchor** | Territorial control | Resonance tap range +0.1 wu | Tap cooldown -5s | Pulse cooldown -20% while near anchor | Tap anchor persists through death (others can use it) | Frequency shift cooldown -15s |
| **Dampening** | Anti-inhibitor | Dampening field slow +10% | Eddies reduce signal of anyone inside (-0.005/s) | Dampening field slow +10% | Eddies block inhibitor form 1 (glitch dissolves on contact) | Dampening field works on form 3 vessel (30% slow, doesn't dissolve) |

**Shroud**

| Track | Focus | L1 | L2 | L3 | L4 | L5 |
|-------|-------|----|----|----|----|-----|
| **Phantom** | Stealth depth | Ghost trail threshold → PRESENCE (was WHISPER) | +0.1 signalDecayMult | Wake cloak cooldown -10s | Ghost trail: scavengers never detect (not just bumping range) | Wake cloak works at THRESHOLD (drops to FLARE) |
| **Sensor** | Information | +0.1 sensorRange | Signal sight: see inhibitor tracking target | +0.1 sensorRange | See wreck contents (like Hauler deep scanner) | See other players' equipped items |
| **Decoy** | Misdirection | +1 decoy flare charge | Decoy duration +4s | Decoy cooldown -20s | Decoys attract fauna (not just inhibitor/scavengers) | Decoys can be placed remotely (at cursor position, 0.3 wu range) |

**Hauler**

| Track | Focus | L1 | L2 | L3 | L4 | L5 |
|-------|-------|----|----|----|----|-----|
| **Cargo** | Carrying capacity | +1 cargo slot (→7) | Tagged wrecks glow brighter (visible further) | +1 cargo slot (→8) | Cargo brace: first swarm drain blocked per run | Salvage lock +1 charge |
| **Salvage** | Loot quality | Deep scanner shows item names (not just tiers) | Tagged wreck bonus +1 item (→+2 total) | Tractor field range +0.05 wu | Tagged wrecks can't be looted by others for 10s | Tractor can pull portals (slowly, 0.01 wu/s) |
| **Endurance** | Survivability | Reinforced hull: eject scatters 0 cargo (was 1-2) | +0.1 wellResistScale | Tractor field cooldown -10s | Reinforced hull +1 charge (→2 per run) | Hauler moves 10% faster when cargo is full |

### Upgrade Costs

| Level | Cost (EM) | Cumulative |
|-------|----------|------------|
| L1 | 100 | 100 |
| L2 | 200 | 300 |
| L3 | 350 | 650 |
| L4 | 500 | 1,150 |
| L5 | 750 | 1,900 |

Total to max one track: 1,900 EM. Total to max all three: 5,700 EM. At ~300-500 EM per successful extraction, maxing a hull takes 12-20 good runs. That's the right arc — meaningful progression without grinding.

### Loadout Panel

```
┌─────────────────────────────────────────────────────────┐
│  LOADOUT                                                │
│                                                         │
│  equipped:                                              │
│   slot 1: [T3 Dead Man's Thruster ◆DFT]  ← AT RISK     │
│   slot 2: [T2 Signal Dampener]            ← AT RISK     │
│   slot 3: [empty]                                       │
│                                                         │
│  consumables:                                           │
│   slot 1: [Shield Cell]                   ← AT RISK     │
│   slot 2: [empty]                                       │
│                                                         │
│  ──── AT RISK ────                                      │
│  everything equipped is LOST on death.                  │
│  total value at risk: 580 EM                            │
│                                                         │
│  [INSURE] one item (150 EM) — returns to vault on death │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Equip slots:** 3 artifact slots (from vault). These modify PlayerBrain coefficients. Lost on death.

**Consumable slots:** 2 consumable slots (from vault). Single-use during run. Lost on death (used or not).

**Insurance:** pay EM to insure ONE equipped item per run. If you die, the insured item returns to vault instead of being destroyed. Cost scales with item tier:

| Tier | Insurance Cost |
|------|---------------|
| T1 | 25 EM |
| T2 | 75 EM |
| T3 | 200 EM |
| T4 | 500 EM |

Insurance is the answer to "I found a T4 exotic but I'm terrified to bring it." It's expensive enough to be a real decision but available enough to prevent the "vault queen" problem (hoarding your best stuff forever).

**AT RISK warning:** the loadout screen always shows total EM value at risk. This is the dread lever — you see exactly what you're gambling. The number should make you pause. If it doesn't, you're either brave or poor.

---

## Chronicle (Pilot Stats)

The chronicle is the "who am I" screen. Always accessible. Not gating progression — it's a mirror.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  CHRONICLE: Steady Hand                                 │
│  Hull: Drifter    Runs: 47    Extractions: 31 (66%)     │
│  EM earned: 14,200    EM spent: 11,800                  │
│  ═══════════════════════════════════════════════════════ │
│                                                         │
│  [CAREER]    [RECORDS]    [MILESTONES]    [HISTORY]      │
│                                                         │
│  ──── CAREER ────                                       │
│                                                         │
│  runs attempted      47                                 │
│  extractions         31  (66%)                          │
│  deaths              14                                 │
│  abandons             2                                 │
│                                                         │
│  total survival     2h 34m                              │
│  avg survival       3:17                                │
│  longest survival   8:42                                │
│                                                         │
│  items extracted     142                                │
│  items lost          68                                 │
│  best single haul    6 items (T4 + 3×T3 + 2×T2)        │
│                                                         │
│  ──── SIGNAL PROFILE ────                               │
│                                                         │
│  time in ghost       38%  ████████████░░░░░░░░          │
│  time in whisper     24%  ██████████░░░░░░░░░░          │
│  time in presence    18%  ███████░░░░░░░░░░░░░          │
│  time in beacon      12%  █████░░░░░░░░░░░░░░░          │
│  time in flare        6%  ██░░░░░░░░░░░░░░░░░░          │
│  time in threshold    2%  █░░░░░░░░░░░░░░░░░░░          │
│                                                         │
│  peak signal       0.94 (THRESHOLD)                     │
│  avg peak per run  0.61 (BEACON)                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Career Tab

Top-level stats. The "baseball card." At a glance, you know who this pilot is.

- Runs / extractions / deaths / abandons (with extraction rate %)
- Total / average / longest survival
- Items extracted / lost / best single haul
- EM earned / spent / current balance
- Favorite map (most runs on)
- Kill stats: wells that consumed you (with names), inhibitor encounters

### Records Tab

Personal bests. The "I did THAT" wall.

- Closest well approach without death
- Longest flow lock streak (Drifter)
- Highest burn chain (Breacher)
- Most eddies active simultaneously (Resonant)
- Longest undetected streak (Shroud)
- Most cargo in single extraction (Hauler)
- Fastest extraction (per map)
- Most EM earned in single run
- Highest signal reached
- Most AI players outlasted in single run

### Milestones Tab

Progress toward unlocks. Shows completed + in-progress.

```
  ████████████████████  SEASONED         extract 10 times (10/10) ✓
  ████████████░░░░░░░░  GHOST PROTOCOL   5 ghost runs (3/5)
  ██░░░░░░░░░░░░░░░░░░  CURRENT MASTER   60s flow lock (12/60s)
  ░░░░░░░░░░░░░░░░░░░░  INHIBITOR SURVVR extract after vessel (0/1)
```

Each milestone shows: name, requirement, progress bar, reward on completion. Completed milestones show unlock date.

### History Tab

Run-by-run log. Last 50 runs stored.

```
  #47  extracted  3:42  Drifter  Shallows   490 EM  ▲ T3 found
  #46  died       1:18  Drifter  Shallows    12 EM  well: Charybdis
  #45  extracted  5:11  Drifter  Depths     820 EM  ▲ milestone
  #44  extracted  2:55  Drifter  Shallows   340 EM
  #43  died       4:30  Drifter  Depths     105 EM  inhibitor vessel
```

Each line: run number, outcome, survival time, hull, map, EM earned, notable flag. Select a run to see its full results screen (stored as RunResult).

### Signal Profile

The signal profile is the most interesting piece of the chronicle. It shows what KIND of pilot you are — not through self-reported fantasy, but through measured behavior.

A pilot whose signal profile is 60% ghost / 25% whisper is clearly a Shroud-style player even if they're flying a Breacher. A pilot whose profile is 5% ghost / 40% flare / 20% threshold is a maniac regardless of hull.

The signal profile could drive subtle game responses:
- Scavengers who've "seen you before" react differently based on your historical signal profile
- The Inhibitor's wake threshold could have a ±0.02 modifier based on career average signal
- Flavor text on the results screen could reference your signal history ("You were quiet. For once.")

These are stretch features, not core — but the data is there because we're tracking everything.

---

## The Insurance Decision

Insurance deserves its own section because it's the most interesting decision in the loadout screen.

**The problem it solves:** without insurance, rational players never bring T4 exotics. The risk/reward is wrong — one T4 exotic makes the run dramatically better, but losing it is catastrophic. The optimal strategy becomes "hoard T4s, run with T2s."

**How insurance fixes it:** for a steep but payable cost, you can protect one item. This creates three loadout archetypes:

1. **The Conservative:** bring T1-T2 gear, no insurance. Low risk, low power. The "practice run."
2. **The Calculated:** bring one T3-T4 item with insurance, fill other slots with T1-T2. Medium risk, one strong tool. The "standard run."
3. **The All-In:** bring T3-T4 in every slot, insure the best one. High risk, maximum power. The "I'm good at this game" run.

Insurance cost scales so you can never protect everything. At T4 (500 EM), insuring one item costs more than many entire runs earn. The decision is real.

**One item only.** This is critical. If you could insure everything, there's no risk. One item means you choose: which of my three equipped artifacts matters most? The other two are truly at risk.

---

## Item Value Scaling (EM)

Items need sell values for vault management and risk calculation.

| Tier | Base Sell Value | Insurance Cost | Relative Rarity |
|------|----------------|---------------|-----------------|
| T1 | 15-30 EM | 25 EM | Common, 1-3 per wreck |
| T2 | 50-120 EM | 75 EM | Uncommon, 1-2 per wreck |
| T3 | 200-400 EM | 200 EM | Rare, ~1 per 3-4 runs |
| T4 | 800-1500 EM | 500 EM | Exotic, ~1 per 10+ runs |

Sell values have ranges because items within a tier aren't equal. A T2 that gives +0.15 thrustScale is worth less than a T2 that gives +0.2 signalDecayMult (signal decay is harder to find).

---

## Open Questions

1. **Multiple pilots per account?** The no-respec decision implies you might want multiple pilots with different hulls. Should the vault be per-pilot or per-account? Leaning per-account (items are items, hull affinity handles the specialization).

2. **Pilot deletion:** if no respec, deleting a pilot loses all rig progress. Should deletion refund any EM? Leaning no — deletion is the roguelike reset, not a respec workaround.

3. **Insurance availability:** should insurance be available from run 1, or unlocked via milestone? Leaning: available from run 1. New players need it most (they lose their first T3 and quit). Let them learn the value early.

4. **Loadout presets:** save multiple loadout configurations? Probably yes (2-3 presets per hull), but not for first implementation.

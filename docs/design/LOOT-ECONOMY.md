# Loot Economy: Time-Pressure Value Scaling

> The longer you stay, the better the loot. But the longer you stay, the closer the Inhibitor.

---

## Core Principle

Loot value is a function of time. Early wrecks hold scraps. Late wrecks hold treasures. The best loot in the game only exists in the danger zone — deep into a run, when the Inhibitor is stirring and the portals are thinning.

This is the fundamental extraction tension: leave early with guaranteed small value, or stay late gambling for rare drops that might not come before the universe closes.

---

## Two Clocks, One Loot Table

Loot rolls are influenced by two time values:

1. **Session time** — how long since the run started (drives tier gate unlocking)
2. **Wreck age** — how long this specific wreck has existed (drives value scaling within a tier)

Both push loot toward higher value over time, but through different mechanisms.

### Session Time: Tier Gates

Rare tiers don't exist in the loot table until enough session time has passed. You literally cannot find a T4 exotic in the first minute. The universe hasn't cooked long enough.

| Tier | Available After | Rationale |
|------|----------------|-----------|
| T1 | 0:00 (always) | Scraps from the start. Grab and go. |
| T2 | 0:30 | Uncommon gear appears after the opening scramble settles. |
| T3 | 2:00 | Rare items only spawn mid-run. You have to commit time to see them. |
| T4 | 4:00 | Exotics require deep runs. By 4:00, the Inhibitor is likely at form 1+. The best loot and the biggest threat arrive together. |

These gates apply to wreck loot generation. When a wreck spawns (or when loot is rolled for a wreck), items above the current tier gate simply don't appear in the pool. A wreck that spawns at 0:15 can only contain T1. A wreck that spawns at 3:30 can contain T1-T3.

### Wreck Age: Value Scaling

Within a tier, item value (EM sell price and coefficient magnitude) scales with how long the wreck has been alive. A T2 item from a wreck that's been drifting for 3 minutes is worth more than a T2 from a fresh wreck.

```
valueMultiplier = 1.0 + (wreckAge / 120) * 0.5
// caps at 1.5× at 120s age (2 minutes)
```

This means:
- Fresh wreck T2: 50-80 EM base value
- 60s old wreck T2: 62-100 EM (1.25×)
- 120s+ old wreck T2: 75-120 EM (1.5×)

The multiplier applies to both EM sell value and coefficient magnitude. A "aged" T2 thrust booster gives +0.18 thrustScale instead of +0.12. Same item, better roll.

**Why wreck age matters separately from session time:** wrecks spawned early that nobody loots become increasingly valuable as they drift toward wells. A wreck at the 5-minute mark that spawned at 0:30 has been aging for 4.5 minutes — its T2 loot is now at max value, and it's probably dangerously close to a well. The risk-reward is physical: the loot is good because it's been falling toward death.

---

## Loot Roll Mechanics

When a wreck's loot is generated (at wreck spawn time), the roll works like this:

```
sessionTime = runtime.simTime
wreckAge = 0 (just spawned — age scaling applies when looted, not spawned)

// Determine available tiers
availableTiers = [T1]
if sessionTime >= 30:  availableTiers.push(T2)
if sessionTime >= 120: availableTiers.push(T3)
if sessionTime >= 240: availableTiers.push(T4)

// Roll items (1-3 per wreck, based on wreck type)
for each item slot:
  tier = weightedRandom(availableTiers, tierWeights)
  item = randomFromTierCatalog(tier)
  item.baseValue = rollValueInRange(tier)
```

### Tier Roll Weights

Higher tiers are always rare, even when available. The gate just makes them *possible*, not common.

| Tier | Weight (when available) | Approx % of drops |
|------|------------------------|-------------------|
| T1 | 60 | ~55-65% |
| T2 | 30 | ~25-30% |
| T3 | 8 | ~7-10% |
| T4 | 2 | ~1-3% |

These weights are constant — they don't change with session time. The gates handle the time progression. Once T4 is in the pool at 4:00, it's a 2% chance on every subsequent roll. You might find one, you might not. That uncertainty is the hook that keeps you in the run.

### Value Application at Loot Time

When a player actually loots the wreck, the wreck's age multiplier is calculated and applied:

```
wreckAge = runtime.simTime - wreck.spawnTime
ageMult = min(1.5, 1.0 + (wreckAge / 120) * 0.5)

finalValue = floor(item.baseValue * ageMult)
finalCoefficient = item.baseCoefficient * ageMult
```

This means the same wreck gets more valuable the longer it sits. A Hauler with Deep Scanner can see "this wreck has a T3 in it" and choose to let it age before looting — if they can keep it from falling into a well.

---

## Interaction with Other Systems

### Inhibitor Pressure

The tier gates are tuned to align with Inhibitor escalation:

| Session Time | Loot Available | Inhibitor State (typical) |
|-------------|---------------|--------------------------|
| 0:00-0:30 | T1 only | Dormant, pressure building |
| 0:30-2:00 | T1-T2 | Dormant or Glitch forming |
| 2:00-4:00 | T1-T3 | Glitch active, approaching Swarm |
| 4:00+ | T1-T4 | Swarm likely, Vessel possible |

The best loot and the worst danger arrive on the same clock. This is "Universe Is the Clock" — the timer isn't a countdown, it's the loot table opening up while the world closes in.

### Hauler Advantage

Haulers with the Salvage track benefit disproportionately from the aging system:
- **Deep Scanner** shows wreck contents before looting — they can identify high-value aged wrecks
- **Tractor Field** can pull aging wrecks away from wells, preserving their value
- **Salvage Lock** tags a wreck for +1 bonus item — tagging an aged T3 wreck is the Hauler's jackpot play

This makes the Hauler's slowness a feature: they arrive late to wrecks, but the wrecks they arrive at are worth more.

### Drifter Advantage

Drifters with Flow Lock can stay in runs longer at lower signal cost. More session time = more tier gates open = more chances at T3-T4. The Drifter's extraction rate is high because they can afford to wait.

### Breacher Disadvantage

Breachers burn hot and fast. Their signal pressure accelerates the Inhibitor, which means less time at the T3-T4 gates. A Breacher who wants T4 loot has to manage burn fuel carefully — every second of burn is a second closer to the Inhibitor waking up. The Breacher's game is smash-and-grab at T1-T2, with T3 as a lucky bonus.

---

## Wreck Spawn Timing

Wrecks don't all spawn at run start. They spawn in waves, with later waves containing more slots and benefiting from later tier gates:

| Wave | Spawn Time | Wrecks | Item Slots | Max Tier at Spawn |
|------|-----------|--------|------------|-------------------|
| 1 | 0:00 | 4-6 | 1-2 each | T1 |
| 2 | 0:45 | 3-5 | 2-3 each | T1-T2 |
| 3 | 1:30 | 2-4 | 2-3 each | T1-T2 |
| 4 | 2:30 | 2-3 | 2-4 each | T1-T3 |
| 5 | 4:00 | 1-2 | 3-4 each | T1-T4 |
| 6+ | every 90s | 1 | 3-5 | T1-T4 |

Late waves spawn fewer wrecks but each wreck is richer. Wave 5 at the 4-minute mark is the first chance for T4 loot — and it's 1-2 wrecks on a map where the Inhibitor is probably awake. Finding and reaching those wrecks before they fall into a well or get looted by AI is the deep-run challenge.

### Wreck Spawn Locations

Later waves spawn in increasingly dangerous positions:
- Wave 1-2: safe zones, away from wells
- Wave 3-4: medium proximity to wells (0.2-0.4 wu)
- Wave 5+: near wells (0.1-0.2 wu) or in accretion disk zones

The best loot spawns where the danger is highest. Not as a punishment — as a natural consequence of where valuable wreckage would accumulate in a collapsing universe. Things fall toward gravity. The treasures of dead civilizations concentrate at the bottom of the gravity wells.

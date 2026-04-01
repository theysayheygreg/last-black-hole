# Item Catalog

> Every artifact and consumable the loot system can generate.
> Each item has exact coefficients, affinity, sell value, and flavor.

---

## How to Read This

- **Affinity:** `U` = universal (any hull, full effect), `A:hull` = affinity (any hull, +50% effect on named hull), `X:hull` = exclusive (only that hull)
- **Coefficients:** multiplicative on PlayerBrain values unless noted as additive (+)
- **Value:** EM sell price range (low-high). Actual value rolled within range, scaled further by wreck age.
- **Tier:** T1 (common) → T4 (exotic). Higher tier = rarer, stronger, more at risk.

---

## T1 — Common (available from run start)

Workhorse items. Small bonuses. Easy to replace. You bring these when you don't want to risk anything good.

| # | Name | Affinity | Coefficients | Value | Flavor |
|---|------|----------|-------------|-------|--------|
| 1 | Patched Thruster | U | thrustScale: 1.08 | 15-25 | it works. barely. |
| 2 | Scrap Plating | U | wellResistScale: 1.06 | 15-20 | dented but functional |
| 3 | Signal Baffle | U | signalGenMult: 0.93 | 18-28 | muffles the loudest frequencies |
| 4 | Worn Coupling | U | currentCoupling: 1.06 | 15-22 | still catches the current |
| 5 | Drag Foil | U | dragScale: 0.94 | 15-20 | sheds velocity slower |
| 6 | Cargo Netting | U | cargoSlots: +1 | 20-30 | one more thing fits |
| 7 | Pulse Lens | U | pulseRadiusScale: 1.10 | 18-25 | wider but thinner |
| 8 | Sensor Dish | U | sensorRange: 1.10 | 15-22 | sees a little further |
| 9 | Flow Vane | A:drifter | currentCoupling: 1.08 | 18-25 | catches eddies others miss |
| 10 | Burn Canister | A:breacher | (burn fuelMax: +3s) | 18-25 | three more seconds of fire |

---

## T2 — Uncommon (available after 30s)

Meaningful bonuses. Worth bringing. Losing one stings but doesn't ruin you.

| # | Name | Affinity | Coefficients | Value | Flavor |
|---|------|----------|-------------|-------|--------|
| 11 | Tuned Thruster | U | thrustScale: 1.15 | 50-80 | responsive. eager. |
| 12 | Gravity Sheath | U | wellResistScale: 1.15 | 55-85 | the pull slides off |
| 13 | Signal Dampener | U | signalGenMult: 0.85 | 60-90 | your thrust whispers |
| 14 | Decay Accelerator | U | signalDecayMult: 1.20 | 55-85 | silence comes faster |
| 15 | Current Amplifier | A:drifter | currentCoupling: 1.18 | 60-90 | the river carries you |
| 16 | Afterburner Injector | A:breacher | thrustScale: 1.12, signalGenMult: 1.10 | 55-80 | faster, louder |
| 17 | Resonance Coil | A:resonant | pulseRadiusScale: 1.20, pulseCooldownScale: 0.90 | 65-95 | your pulse rings wider |
| 18 | Ghost Weave | A:shroud | signalGenMult: 0.82, sensorRange: 1.12 | 70-100 | see everything, be nothing |
| 19 | Cargo Brace | A:hauler | cargoSlots: +1, pickupRadius: 1.10 | 60-90 | room for one more |
| 20 | Pulse Sharpener | U | pulseSignalScale: 0.80, pulseRadiusScale: 0.90 | 50-75 | quiet pulse, tight radius |
| 21 | Debuff Purge | U | controlDebuffResist: 1.30 | 50-75 | shakes off the swarm faster |
| 22 | Hull Reinforcement | U | wellResistScale: 1.10, controlDebuffResist: 1.15 | 55-85 | tough all over |
| 23 | Drag Coefficient | U | dragScale: 0.88 | 55-80 | holds speed in the void |
| 24 | Pickup Magnet | U | pickupRadius: 1.25 | 50-75 | loot comes to you |

---

## T3 — Rare (available after 2:00)

Build-defining items. Strong enough to change your approach for the run. Losing one hurts. You think twice before equipping.

| # | Name | Affinity | Coefficients | Value | Flavor |
|---|------|----------|-------------|-------|--------|
| 25 | Dead Man's Thruster | A:drifter | signalGenMult: 0.0 (thrust only), dragScale: 1.30 | 200-320 | silent thrust. no brakes. |
| 26 | Overcharged Core | A:breacher | thrustScale: 1.30, signalGenMult: 1.50, signalDecayMult: 0.70 | 220-350 | everything louder, everything faster |
| 27 | Harmonic Anchor | A:resonant | (eddyDuration: +4s, maxEddies: +2) | 250-380 | your eddies outlast you |
| 28 | Phase Veil | A:shroud | (ghostTrail threshold → BEACON, wakeCloakCooldown: -15s) | 240-360 | invisible at volumes that should be impossible |
| 29 | Cargo Brace Mark II | X:hauler | (swarm drain immunity for first 3 items) | 230-340 | the swarm takes nothing |
| 30 | Tidal Resonator | U | (pulse creates standing wave, 10s, surfable) | 200-300 | you make your own current |
| 31 | Well Skimmer | U | wellResistScale: 1.35, thrustScale: 0.90 | 210-320 | hugs the edge of oblivion |
| 32 | Signal Siphon | U | signalDecayMult: 1.50, signalGenMult: 1.15 | 200-310 | decays fast, generates faster. a gamble. |
| 33 | Precision Pulse | U | pulseRadiusScale: 0.60, pulseSignalScale: 0.40, pulseCooldownScale: 0.50 | 220-340 | tiny pulse, almost silent, fires constantly |
| 34 | Drift Engine | A:drifter | currentCoupling: 1.40, thrustScale: 0.75 | 230-350 | the current IS the engine now |
| 35 | Burn Extender | X:breacher | (burn fuelMax: +15s, burn rechargeRate: ×2) | 250-370 | forty-five seconds of fire |
| 36 | Sensor Array | U | sensorRange: 1.50, signalGenMult: 1.08 | 200-300 | sees everything. hums slightly. |

---

## T4 — Exotic (available after 4:00)

Run-warping items. Equipping one changes how you play. Losing one changes how you feel about the game for a week. These are the items you tell stories about.

| # | Name | Affinity | Coefficients / Effect | Value | Flavor |
|---|------|----------|----------------------|-------|--------|
| 37 | Gravity Lens | X:resonant | Pulse PULLS instead of pushing. All pulse effects inverted. | 800-1200 | the current bows to you |
| 38 | Echo Chamber | X:shroud | Signal decay creates ghost signals at previous positions. Decoys are automatic and free. | 900-1300 | you were never here. or were you? |
| 39 | Void Anchor | U | Place a recall beacon. Once per run, teleport back to it. | 800-1100 | one door home, anywhere |
| 40 | Singularity Drive | X:breacher | While burning, well gravity REVERSES (pushes away). Can fly through wells during burn. | 1000-1500 | the wells fear you |
| 41 | Laminar Flow Core | X:drifter | Flow Lock has no cooldown. Entering flow lock is instant (0s align time). Signal during flow lock: 0. | 900-1300 | you and the current are one |
| 42 | Salvage Titan | X:hauler | Cargo slots +3. Can loot wrecks that have been consumed by wells (ghost wrecks). | 800-1200 | nothing is truly lost |
| 43 | Inhibitor Resonance | U | Dampening field effect on ALL hulls. Your eddies (from Tidal Resonator or Resonant abilities) slow Inhibitor by 30%. | 850-1200 | the void hesitates |
| 44 | Temporal Displacement | U | On well contact that would kill you, instead teleport to a random position 0.5+ wu away. Once per run. | 900-1300 | death missed |

---

## Consumables

Single-use during a run. Activated from consumable slots. Lost on death (used or not).

| # | Name | Tier | Effect | Value | Flavor |
|---|------|------|--------|-------|--------|
| C1 | Shield Cell | T1 | Absorb one well contact. Consumed on use. | 20-30 | one free mistake |
| C2 | Signal Purge | T1 | Instantly drop signal to 0. 60s cooldown (can't chain purges). | 25-35 | silence, bought and paid for |
| C3 | Time Dilator | T2 | 3s of 0.5× time for your ship (half speed, half signal, half everything). | 60-90 | the universe slows down |
| C4 | Breach Flare | T2 | Spawn a temporary portal at your position. 15s lifespan. Anyone can use it. | 80-120 | make your own exit |
| C5 | Signal Flare | T1 | Deploy a decoy signal source at current position. 8s duration, decays at 50% rate. | 20-35 | look over there |
| C6 | Emergency Thrust | T2 | 5s of 2× thrust with 0 signal generation. The silent sprint. | 70-100 | run. now. |
| C7 | Cargo Jettison | T1 | Eject all cargo. Each item becomes a temporary wreck at your position. Recovery possible. | 15-20 | dump and run |
| C8 | Well Repulsor | T3 | 10s of immunity to well gravity (you float free). | 200-280 | gravity forgets you |

---

## Catalog Stats

| Category | Count | Tier Distribution |
|----------|-------|-------------------|
| T1 artifacts | 10 | ~55% of drops |
| T2 artifacts | 14 | ~28% of drops |
| T3 artifacts | 12 | ~12% of drops |
| T4 artifacts | 8 | ~3% of drops (when available) |
| Consumables | 8 | Separate pool, 1-2 per wreck |
| **Total** | **52** | |

| Affinity | Count | % of Catalog |
|----------|-------|-------------|
| Universal | 26 | 50% |
| Affinity (hull-tagged) | 17 | 33% |
| Exclusive (hull-locked) | 9 | 17% |

These ratios match the design target from CLASSES-AND-PROGRESSION.md: ~50% universal, ~35% affinity, ~15% exclusive.

---

## Coefficient Stacking Example

A Drifter pilot with Laminar rig track at L3 equipping a T3 Drift Engine:

```
Base:           currentCoupling = 1.6 (hull)
Rig L1:         + 0.1 → 1.7
Rig L3:         + 0.1 → 1.8
Drift Engine:   × 1.4 → 2.52
Cap:            min(2.52, 2.5) → 2.5 (capped)
```

That Drifter is at max current coupling. Flow Lock with this setup means they're barely touching the controls — the current IS the game. But their thrust is 0.7 × 0.75 = 0.525, so when the current isn't helping, they're crawling. Trade-offs hold.

---

## Item Generation Rules

When loot is rolled for a wreck:
1. Check tier gate (session time determines max available tier)
2. Roll tier from weighted pool (T1: 60, T2: 30, T3: 8, T4: 2)
3. Roll item from tier catalog (uniform random within tier)
4. Apply wreck age value multiplier (1.0× to 1.5×)
5. If item has affinity and player hull matches, flag for HUD highlight

Consumables roll from a separate pool: each wreck has a 40% chance of containing 1 consumable (any tier the wreck qualifies for).

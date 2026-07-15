# Stellaris PVE Entity & AI Design — Research

> Research pass 2026-07-14 (Orrery, for the v0.3.1 design review S13/S16).
> Reference for hostile-AI, fauna, and encounter-table design.
> Flags: [C] confirmed-from-source, [I] inference. Primary sources: wiki,
> Paradox dev diaries (DD#46/47 Leviathans, DD#101 Marauders, DD#172/239
> AI, DD#175 Space Fauna, DD#245 Situations, DD#355-358 Grand Archive).

## 1. Entity taxonomy (abridged)

| Class | Hostility model | Movement | Telegraph | Reward |
|---|---|---|---|---|
| Tiyanki | Passive grazer; retaliates | True migration, pods, nursery system, pop cap | Visibly docile | Energy/gases by life stage; political object (GC laws) |
| Amoebas | Aggressive roaming predator | Migrate to seed territory | Known archetype | Debris tech; pacified ones fight FOR you |
| Crystalline | Territorial-neutral | Sessile until mid-game year, then expands | Home-system anchoring | Kill-the-source premium (Nidus → superior tech) |
| Void Clouds | Sessile guardian | Fixed at black holes (VLUUR roams w/ storm trail) | Location IS telegraph | Scarcity-gated unique weapon tech |
| Leviathans | Territorial apex, dormant until provoked | Fixed lairs (2 roaming exceptions w/ compensating tells) | Skull icon, event prose, paid intel | Unique techs/relics/identity, not loot piles |
| Marauders | Extortionist | Fixed home; raid fleets travel | Tribute demand IS the warning; travel time = timer | Tribute sink; mercenaries |
| Great Khan | Mid-game crisis | Snowballs outward | Galaxy event; player provocation raises odds | Satrapy politics; collapse spawns successor states |
| Endgame crises | Existential | Edge/hub/portal invasion | 5–7 yrs staged warnings (or self-inflicted zero-warning) | Escalation scales with territory held |

## 2. "You are not ready yet" (Leviathan lessons)

- [C] **Skull, not number**: guardians show a skull icon instead of fleet
  power. Category legibility beats stat legibility.
- [C] **Sell precise intel diegetically**: Curators sell "how would we
  fare" prose verdicts and +25% damage briefings.
- [C] **Territorial by default; roamers get compensating telegraphs**
  (announced spawn date, retreat timer, visible storm trail).
- [C] **Greed-triggered aggression**: Asteroid Hive wakes faster per
  mining station (MTTH 33.3 yrs at 1 → 0.4 yrs at 5); Voidspawn pulses
  after you build; Shard spawns when you dig. The player authors their
  own doom — the trigger is the telegraph.
- [C] **Behavioral anti-cheese**: Ether Drake punishes hit-and-run
  (destroys starbases) and attrition (heals at home). Rare but right.
- [C] Design intent (DD#47): "a serious challenge for a mid-game empire."

## 3. Escalation & timer design (Conductor-relevant)

- [C] Doom clock is a player-visible setting (endgame year, crisis
  strength) with jitter (5-year checks, weighted "nothing" outcome).
  Contract: you know roughly WHEN, not exactly WHAT or WHERE.
- [C] Warning length is threat personality: Prethoryn ~7 yrs of watched
  approach; Contingency ~5 yrs of interior dread; Unbidden zero-warning
  but self-inflicted (your Jump Drives are the fuse).
- [C] Escalation is territorial feedback, not script; de-escalation must
  be legible in the doom itself (Contingency hubs: each kill visibly
  slows reinforcements).
- [C] Mid-game dooms self-destruct into new terrain (Khan dies 15–45 yrs,
  collapse spawns successor states).
- [C] Situations system (DD#245): every threat chain gets a trackable
  progress entry.

## 4. Implementation reality ("alive" despite simple logic)

- [C] The whole AI is weight tables + event system: attitudes → behavior
  flags → ai_weight, highest wins. No behavior trees. Fauna are country
  types with canned profiles; "behavior" is calendar dates, hop-count
  radii, population thresholds.
- [C] DD#172: a debug overlay made the AI "appear more intelligent
  through transparency" — perceived intelligence is presentation.
- Techniques that generate life: lifecycle stages with different yields;
  nursery home systems + caps (extinction possible and noticed); a
  hostility SPECTRUM (variety of when/why things attack IS the ecology);
  **one consequential side-effect per species** (tiyanki seed planets);
  named singular entities with unique prose; fauna as political objects;
  timers-as-lifecycle.

## 5. Traps (what Paradox got wrong)

- [C] Passive fauna → loot-chore irrelevance; adding fauna *systems*
  without fauna *behavior* (Grand Archive) didn't fix it.
- [C] Crisis anticlimax: "zerg rush or stall" — binary military check
  arriving after the game is decided.
- [C] Threats that scale slower than the player become irrelevant (Khan).
- [C] Upkeep-shaped counterplay is a tax, not a threat — piracy was
  deleted wholesale in 4.0.
- [C] Activity without telegraph reads as unfair spawns, not a living
  world (post-Grand-Archive hostile fauna complaints).
- [C] Solved-loadout bosses: every guardian has a wiki-ized counter;
  behavioral anti-cheese is the countermeasure.

## 6. Distilled rules (applied in v0.3.1 S13/S16/S24)

1. Hostility spectrum over hostile flag (grazer / sessile territorial /
   roaming predator / ambusher / timed parasite / apex elder).
2. Skull-not-number threat glyphs; precise intel sold via equipment.
3. Fixed lairs default; every roamer needs a compensating telegraph.
4. Greed-triggered aggression (extraction intensity wakes danger).
5. Player-visible doom clock with jitter; warning length as personality.
6. Escalation/de-escalation legible in the doom mechanics.
7. Mid-tier threats self-destruct into new terrain.
8. One consequential side-effect per species buys the most "alive" per
   line of code.
9. Avoid: passive piñata fauna, under-scaling threats, upkeep
   counterplay, solved bosses.

## Sources

stellaris.paradoxwikis.com (/Spaceborne_aliens, /Guardians, /Crisis,
/Marauders, /Enclaves, /AI_modding, /Situations, crisis subpages);
Paradox dev diaries #46, #47, #101, #172, #175, #199, #239, #245, #341,
#355–358; community threads on crisis anticlimax, Khan irrelevance,
piracy tedium, Grand Archive reception; StarNet/Glavius AI mods as
weight-table proof.

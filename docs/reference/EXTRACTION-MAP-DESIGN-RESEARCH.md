# Extraction-Game Map Design — Research (Tarkov / ARC Raiders / Marathon 2026)

> Research pass 2026-07-14 (Orrery, for v0.3.1 S24/encounter generation).
> Flags: [C] confirmed, [I] inference. Marathon shipped 2026-03-05
> (Metacritic 81–83, ~1.2M copies, strong retained-player sentiment,
> sharp casual drop-off).

## The core formula

**Geometry is sacred, contents are dice.** [C across all three] Layout,
POI identities, and loot *themes* never change — that is the mastery
substrate. Rerolled per match: where within the known structure value
and danger appear. Three layers:

1. **Static (mastery):** terrain, POI names/positions, key-door
   locations, loot-zone themes, chokepoints. Learning this IS
   progression. (Buyanov [C]: "knowledge wins more raids than expensive
   equipment" is community law; map legibility via verisimilitude, no
   minimap.)
2. **Random (freshness):** spawn assignment among fixed points (with
   adjacency suppression), loot rolls within zones, boss dice (~30%/raid
   Tarkov), exfil availability, dynamic events.
3. **Emergent (the real variance):** other players — the cheapest
   infinite-content generator. Maps are designed to funnel humans into
   unscripted collisions (shared exfils, loud vault cues, events as
   dinner bells).

Balance law: randomize **position and timing**, never **structure and
theme**. Too much randomness destroys mastery value; too little produces
solved maps → speedrun routes → loot-goblin meta.

## Marathon 2026 (priority findings)

- [C] Four maps, level-gated ladder (Perimeter → Dire Marsh → Outpost →
  Cryo Archive weekend endgame).
- [C] **Exfil beacons spawn semi-randomly** once extraction phase
  begins; a used exfil despawns and another may spawn — exfil camping
  structurally weakened. Bungie fixed a same-spot Final Exfil bug —
  they treat exfil predictability as a defect.
- [C] **Final Exfil ~25 min: closes all others and converges every
  surviving squad on one point** — a designed endgame collision.
- [C] Guarded exfils spawn AI security when triggered — extraction
  generates PvE pressure.
- [C] Anti-solved-route patch: Pinwheel strongboxes now relocate per
  run ("can't leg it to the loot anymore").
- [C] Dynamic events: Anomaly (escort), Lockdown (hazard cube over a
  POI), Heat Cascade (weather that reshapes usable space), Tox Clear
  (card + terminal). Event grammar ≈ Destiny public events [I].
- [C] Loot: randomized within POI-guaranteed *types* — zone farming
  works, pixel farming doesn't.
- [C] Knowledge economy, three tiers: **persistent keys** (across runs,
  ~6 named per map) + **in-raid keycards** (Pinwheel needs three,
  multi-POI route) + **per-raid Security Clearance meter** (Cryo: 0→5,
  squad-shared, gates vaults AND exfil; Vault 7 boss requires all six
  prior vault items — raid-team knowledge progression in extraction).
- [C] **Opening a gold key room broadcasts an audio cue to nearby
  players** — knowledge-gated loot is deliberately loud; mastery paints
  a target.
- [C] What survives seasonal wipes: faction reputation and knowledge,
  not gear.

## ARC Raiders

- [C] **Map Conditions** — the headline: per-match modifiers in two
  tiers. Minor = loot-theme shifts (Beachcombing, Husk Graveyard…);
  Major = rule changes (Night Raid, EM Storm, Hidden Bunker with
  extended match, Locked Gate card hunt). Risk and reward move
  together. (= LBH S9b field effects, validated.)
- [C] ARC machines are a roaming third force; spawn rates, patrols,
  drone density, loot distribution tuned per map for distinct rhythm.
- [C] **PvE pressure decay** (design lead Watkins): high-end players
  got "so effective at taking out the Arc that it didn't become the
  mitigating factor we intended"; they camp event entrances; deadly
  gate-guard ARCs got neutralized too. Redesigning from live data.
  Clearest confirmed statement of the genre's core failure mode:
  static-map PvE pressure decays as player skill compounds.
- [C] Long-tail: 100-hr reviews glowing; 700-hr players report goal
  exhaustion. Extract camping ("rats") is the loudest complaint;
  community invented reverse-camping vigilantism.

## Tarkov

- [C] Spawns: fixed points, random assignment, adjacency suppression.
- [C] Loot post-12.12: fixed container pools + loose loot randomized
  over zones 3–5× larger than old pixel spawns.
- [C] Extracts: per-raid availability roll + conditional extracts
  (item, flare, paid, faction-only).
- [C] Veteran skill = audio-to-geometry mapping, spawn-read (predicting
  everyone's first 60 s), key ownership as tradeable route ownership,
  knowing when to leave.

## POI grammar (cross-game)

- One crown POI per map (best loot = most contested), mid-tier ring,
  quiet fringes. Risk maps to reward geographically.
- Locks = prior investment + route commitment + noise.
- Flow: edge spawns → contested middle → edge/rotating exfils;
  out-and-back through danger; connector terrain breaks sightlines.
- Events re-concentrate dispersed players mid-match.

## Failure modes → countermeasures

| Failure | Countermeasure observed |
|---|---|
| Spawn rushing | Adjacency-suppressed assignment; edge-ring spawns |
| Solved loot routes | Zone randomization; relocating caches; theme-not-item guarantees |
| Exfil camping | Semi-random respawning beacons; AI-guarded exfils |
| PvE pressure decay | Live-data event redesign; escalating conditions; new maps as reset |
| Goal exhaustion | Wipes with permanent reputation/knowledge; map-unlock ladder |

## LBH transfer notes (applied in v0.3.1 encounter-generation doc)

LBH deliberately inverts one axis: geometry is dice (set pieces move),
so the mastery substrate must live entirely in the **stable language** —
spawn tables (fixed counts per map), encounter internals (learnable like
POIs), physics rules, Conductor grammar. Encounter internals therefore
need Tarkov-grade stability: variants, not randomization. Exfil design
(S15) is validated and extended by Marathon's convergence Final Exfil
and guarded activation; locked-loot loudness confirms the greed-trigger
+ dinner-bell coupling; ARC conditions validate map fields (S9b);
Watkins' decay warning maps to severity-wave escalation needing live
tunables.

Open decision surfaced for Greg: **key persistence tiers** — Marathon
runs three (persistent keys / in-run keycards / per-run clearance).
LBH S15 currently implies in-run only.

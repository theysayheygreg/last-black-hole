# Entity Catalog — The Parts List

> Every seed draws from this catalog. No two runs populate the same way.

## The Four Tiers

Each tier has a distinct gameplay contract. The map generator picks from each tier's catalog per seed. Not every type appears every run — variety comes from combination, not exhaustion.

| Tier | Contract | Impact | Example (other games) |
|------|----------|--------|----------------------|
| **Ambient** | Texture. Tells. Atmosphere. | LOW — occasional course adjustment | Birds in Marathon, fish in Subnautica |
| **Active** | Obstacle. Singular directive. Predictable. | MODERATE — regular challenge, workable | ARC in Arc Raiders, UESC in Marathon |
| **Adversarial** | Competitor. Full toolkit. Unpredictable. | HIGH — drives core tension and decisions | Other runners in Marathon, PMCs in Tarkov |
| **Existential** | Inescapable. Non-interactive. Always building. | ABSOLUTE — you run or you die | Blue circle in BR, Inhibitor |

### How Seeds Use the Catalog

The map generator (MAP-GENERATOR.md) already places wells, stars, wrecks, and portals per seed. Entity population works the same way:

```
Per seed:
  Ambient:      pick 1-3 types from ambient catalog
  Active:       pick 1-2 types from active catalog
  Adversarial:  always present (AI players are core)
  Existential:  always present (Inhibitor is core)
```

The count and mix within each type is tuned per map size and difficulty, but which TYPES appear is seed-driven. A run with jellyfish and spore clouds feels different from one with current-riders and signal blooms, even if the gameplay impact is similar.

This also means we can keep adding to the catalog over time without redesigning the system. New ambient type? Add it to the list. New active hazard? Into the catalog. The generator just has a bigger menu.

---

## Tier 1: Ambient Catalog

**Contract:** You notice them. They tell you things about the universe. They occasionally make you adjust. They never ruin your run. They make empty space feel alive.

**Shared traits:**
- No state machine. Simple update rule (position + velocity + maybe one attraction force).
- Lightweight rendering (canvas points/shapes, no per-entity shader work).
- Collision with player: tiny signal spike (0.01-0.02), negligible velocity nudge.
- Lifespan: spawn, live 20-60s, dissolve. Constant population maintained by spawner.
- No interaction with portals, wrecks, or extraction. They don't participate in the game.

### The Catalog

**Drift Jellies** — teal bioluminescent blobs, float with currents, always present regardless of signal. The baseline "this universe has life." Bump for +0.01 signal.

**Signal Blooms** — purple-blue particle clouds that form near signal sources. Denser when signal is higher. They're a VISUAL TELL of your signal level — you see the bloom thickening before you check the HUD. Minimal mechanical impact (occasional bump for +0.01), maximum atmospheric feedback. These replace signal moths but without the aggressive feedback loop.

**Current Riders** — tiny bright streaks that follow fluid velocity lines. They trace the currents, making flow patterns visible. Hitting one while surfing gives a tiny speed boost (+0.002 wu/s for 1s) — positive reinforcement for reading the flow. No signal cost. Pure "the universe rewards you for understanding it."

**Spore Clouds** — clusters of dim amber particles that hang in dead space (low velocity regions). They mark stagnant zones where drifting is slow. Passing through one leaves a faint trail (visual density injection for 2-3s) that temporarily reveals your path to others. A tell, not a threat.

**Static Wisps** — brief flickering white points near well gravity gradients. They appear and disappear rapidly (0.5-1s lifespan). They mark the boundary where gravity starts to matter — a natural warning sign. No collision, purely visual.

### Per-Seed Selection

Map generator picks 1-3 ambient types. Every map gets drift jellies (baseline life). Second and third types are random from the remaining catalog.

Population density scales with map size and empty space: bigger maps with fewer wells get more ambient life to fill the void.

---

## Tier 2: Active Catalog

**Contract:** They have ONE job. They do it consistently and predictably. You learn the pattern, you work around it or remove it. They challenge you but don't surprise you.

**Shared traits:**
- Simple state machine (1-3 states max). Singular behavioral directive.
- Standard physics model (thrust + fluid coupling + gravity). They exist in the same physics as you.
- Can die to wells, force pulse, Inhibitor. Mortal.
- Generate signal from their activity (feeds fauna density, Inhibitor pressure).
- Observable tells for every behavior. Readable. Counterable.
- Location-based OR roaming — both are valid, map generator can mix.

### The Catalog

#### Location-Based (tied to map features)

**Gradient Sentries** (renamed from Rift Eels) — patrol the gravity gradient around wells, in the band between accretion disk and open space. Singular directive: guard this zone. Lunge at intruders, push them toward the well. Counterable by timing, pulse, or speed. 2-4 per well, permanent for the run. Visual: bright green segments, undulating. Sound: rhythmic patrol pulse helps you time gaps.

**Wreck Wardens** — orbit high-value wreck clusters. Singular directive: protect this wreck. Ram ships that approach within pickup range. Don't chase beyond 0.3 wu from their wreck. Counterable by luring them away (signal flare), pulsing them, or approaching from the current-side (they're slower against flow). Visual: amber, stocky shape. Drop a common item on death.

**Portal Wasps** — swarm near portals. Singular directive: sting anything that lingers. If you enter the portal zone and start extracting, wasps harass (bumps that interrupt extraction progress). Counterable by clearing them first (pulse scatters them for 5s) or extracting fast. They reform after scattering. Visual: yellow-white, fast, erratic. They create a "do I pulse first or try to extract through the harassment?" decision.

#### Roaming (move through open space)

**Scavenger Drones** — autonomous harvest units, not ships with pilots. Singular directive: collect wreck loot. They fly wreck-to-wreck, hoover up items, then fly to a "collection point" (map edge or a megastructure) and despawn. They don't extract through portals — they're not playing your game. They're reducing the loot on the map on their own clock. If you destroy one (pulse into a well), its collected loot scatters as debris. Visual: small, grey, utilitarian. No faction personality.

**Current Hunters** — predators that ride fluid highways (high-velocity current zones). Singular directive: patrol the fast lane. They cruise along strong currents at high speed. If you're surfing the same current, they close on you from behind. Bump contact pushes you off the current and spikes signal (+0.04). Counterable by exiting the current before they reach you, or timing your surf between their patrol cycles. Visual: red-orange streak, fast. They make the best surfing routes dangerous.

**Herders** — slow, heavy entities that push fluid in a direction. Singular directive: move this way. They inject constant force into the fluid field, creating local current shifts. They herd you toward wells if you're drifting passively. Counterable by thrusting against (costs signal) or routing around. Visual: large, dark, slow. They change the flow map, which changes the surfing calculus.

### Per-Seed Selection

Map generator picks 1-2 active types. At least one location-based and optionally one roaming. Mix depends on map layout:
- Well-dense maps favor gradient sentries + current hunters (well ecosystem + surfing challenge)
- Wreck-rich maps favor wreck wardens + scavenger drones (loot competition)
- Portal-sparse maps favor portal wasps (extraction is contested)
- Open maps favor herders + current hunters (empty space has teeth)

---

## Tier 3: Adversarial — AI Players

**Contract:** They're playing the same game you are. Same toolkit. Same goals. Same constraints. They make decisions you can't predict. They're the reason you check over your shoulder.

This is the big new system. In solo mode: 1 human + 3 AI players. In multiplayer: human players replace AI slots. The game is always 4 players — the question is how many are real.

### Why AI Players, Not Smarter Scavengers

Scavengers have a singular directive (loot and extract, or hunt and push). They're obstacles. AI players have the FULL decision space:

- When to thrust vs. drift (signal management)
- Which wrecks are worth the signal cost
- When to extract (risk vs. reward — stay for more loot or leave now?)
- How to route around active threats
- When to use consumables (pulse, flare, tether)
- Whether to engage other players or avoid them
- How to read the Inhibitor threat and adjust

A scavenger drone collecting wrecks is a timer on the loot. An AI player deciding to stay for one more wreck even though the Inhibitor is stirring — that's a story. That's adversarial.

### AI Player Architecture

AI players run the same systems as the human player:
- Same ship physics (thrust, fluid coupling, drag, gravity)
- Same inventory system (cargo slots, equipped items, consumables)
- Same signal generation (thrust signal, loot spikes, pulse cost)
- Same extraction mechanic (fly to portal, extraction timer)
- Same death conditions (well kill radius, Inhibitor contact, Vessel)
- Same loadout from profile (or generated loadout per AI personality)

They're the same entity class as the player, with an AI decision layer instead of keyboard input.

### AI Personalities (the catalog within the catalog)

Each AI player has a personality that biases their decision-making. Not scripted behavior — weighted preferences that create distinct playstyles.

**The Prospector** — risk-averse, efficiency-focused. Surfs currents expertly, loots methodically, extracts early with modest haul. Avoids conflict. Low signal footprint. The AI player who always extracts with 4-5 items and lives. Analogous to the Tarkov rat — they're not exciting, but they're effective. You rarely fight them because they're never where the action is.

**The Raider** — aggressive, opportunistic. Targets high-tier wrecks, willing to thrust against current for valuable loot. Takes risks. Higher signal footprint. Will contest a wreck or portal if another player is nearby (force pulse to shove them away, grab the loot, flee). The AI player who either extracts with a huge haul or dies trying. Analogous to the Tarkov chad.

**The Vulture** — reactive, player-tracking. Doesn't initiate — waits for others to do the dangerous work, then swoops. Follows other players at distance, lets them trigger active threats (sentries, wasps), then moves in when the coast is clear. Will steal a portal exit after you've cleared the wasps. Low signal when waiting, spikes when striking. The most annoying opponent because they benefit from your effort.

**The Ghost** — stealth-focused, signal-minimizing. Masters fluid riding, barely thrusts, takes suboptimal routes to stay silent. Loots only what's on the current's path. Extracts through whatever portal they drift near. Very hard to track. Low loot yield but very high survival rate. The AI player you didn't know was on the map until they extract.

**The Desperado** — high-risk, late-extract. Stays in the universe longer than anyone should. Loots aggressively, ignores rising signal, bets on finding a portal at the last moment. Often dies. When they survive, they have the biggest haul. Creates dramatic late-game moments: you're heading for the last portal and the Desperado is racing you from across the map.

### Per-Seed AI Selection

3 AI players per run. Personalities drawn from the catalog. At least 2 distinct personalities per run (no 3× Prospector games). Personality affects:
- Starting position bias (Prospectors start near current highways, Raiders start near high-value wrecks)
- Decision weights (extract threshold, combat willingness, signal tolerance)
- Loadout (Ghosts favor signal-shaping equipment, Raiders favor thrust upgrades)

### Observable Behavior

AI players are visible. You can see their ships, their thrust trails, their signal (per the "visual cues" decision — glow/trail reveals approximate signal level). You can infer their personality from watching their behavior:
- A ship riding currents with no thrust trail = Ghost
- A ship heading straight for every wreck against the current = Raider
- A ship hovering at distance, matching your heading = Vulture

This observability is critical. Adversarial life is only interesting if you can READ the other player and make decisions based on what you think they'll do. "That's a Raider heading for the same wreck" is a decision moment. "Something is out there but I don't know what" is just noise.

### AI Player Interactions

With each other:
- AI players compete with each other, not just with you
- A Raider will contest an AI Prospector for a wreck
- A Vulture will follow an AI Raider
- Portal consumption applies to all — AI players take exits from each other too

With active life:
- AI players trigger sentries, get harassed by wasps, lose loot to scavenger drones
- They react to these obstacles the same way a human would (pulse, dodge, reroute)
- A smart Vulture personality lets the Raider clear the sentries first

With Inhibitor:
- AI players react to Inhibitor phases (flee during Vessel, alter routes during Swarm)
- AI player signal contributes to Inhibitor pressure
- A loud Raider can wake the Inhibitor, affecting everyone

With the player:
- Force pulse shoving (non-lethal combat per COMBAT.md)
- Portal racing
- Wreck competition
- Signal flare misdirection
- Indirect: their noise attracts active threats your way

### What AI Players Are NOT

- Not omniscient. They read the same information the player sees (nearby entities, fluid state, signal cues). No map hacks.
- Not optimal. Personalities introduce suboptimal-but-interesting decisions. The Desperado stays too long. The Prospector leaves too early. These "mistakes" make them feel human.
- Not lethal. Same non-lethal interaction toolkit as the player (pulse, flare, tether). They can shove you into a well, but they can't shoot you.
- Not coordinated. AI players don't team up. They're solo operators. (Multiplayer squads are a future consideration.)

### Implementation Scope

This is the heaviest system in the game. Rough architecture:

```
AIPlayerController
├── personality: Personality        // decision weights
├── perception: PerceptionSystem    // what can this AI see?
│   ├── nearbyWrecks()
│   ├── nearbyPortals()
│   ├── nearbyPlayers()
│   ├── nearbyThreats()
│   └── signalEstimate(target)      // estimate other players' signal from visual cues
├── decision: DecisionSystem        // what should this AI do?
│   ├── evaluateTargets()           // score wrecks by value/risk/distance
│   ├── evaluateExtracts()          // score portals by safety/competition
│   ├── evaluateThreats()           // am I in danger?
│   ├── evaluateEngagement()        // should I contest this player?
│   └── chooseAction()              // weighted pick from scored options
├── navigation: NavigationSystem    // how does this AI move?
│   ├── plotRoute(target)           // pathfind considering currents
│   ├── surfCurrent()               // ride the flow
│   └── avoidThreats()              // dodge wells, sentries, Inhibitor
└── ship: Ship                      // same Ship class as player
```

The AI decision loop runs every 0.5-1.0 seconds (not per-frame). Between decisions, the AI follows its current navigation target using the same thrust/drift mechanics as the player.

**Server architecture note:** AI players run server-side (Codex's architecture work). The server owns their state, the client renders them the same as any other ship. In multiplayer, the server replaces AI slots with real player connections. The rendering and interaction code is identical — only the decision source changes.

Estimated implementation: ~600-800 lines for AIPlayerController + personality system. Leverages existing Ship class, inventory system, and signal system.

### Build Order for AI Players

1. **Ship class extraction** — ensure the Ship class in ship.js can be instantiated multiple times (currently may assume singleton). Each AI player gets their own Ship.
2. **Basic AI loop** — spawn 3 AI ships, give them "seek nearest wreck → loot → seek portal → extract" behavior. Essentially current scavenger-level intelligence but using the real Ship class.
3. **Perception system** — AI can see nearby entities, estimate distances, read flow field.
4. **Decision system** — personality-weighted target scoring. The Raider values high-tier wrecks more. The Prospector values nearby wrecks more.
5. **Navigation system** — current-aware pathfinding. AI can plan routes that ride flow.
6. **Combat decisions** — when to pulse, when to contest, when to flee.
7. **Signal awareness** — AI manages own signal level, reacts to others' signal.
8. **Personality tuning** — make each personality feel distinct through playtesting.

---

## Tier 4: Existential — The Inhibitor

**Contract:** Inescapable. Non-interactive. Always building. You run or you die.

No catalog here — the Inhibitor is singular and always present. Its three forms (Glitch → Swarm → Vessel) are the escalation, not different types.

The Inhibitor is the blue circle. It exists to:
1. Create time pressure (you WILL be forced out eventually)
2. Funnel adversarial players toward each other (portal scarcity increases as Inhibitor blocks exits)
3. Punish signal accumulation (louder = faster escalation)
4. Create the extraction decision: leave now safely or stay for more value?

See INHIBITOR.md and INHIBITOR-IMPLEMENTATION.md for full design.

---

## How The Tiers Interact

The cascade that makes LBH's ecology work:

```
Player action (thrust, loot)
  → Signal rises
    → Ambient reacts (blooms thicken = visual tell)
    → Active reacts (sentries alert, drones accelerate)
    → Adversarial reacts (AI players can see your signal, adjust strategy)
    → Existential reacts (Inhibitor pressure builds)
      → Inhibitor phases change
        → Active entities flee or change behavior
        → AI players shift to extraction mode
        → Portal scarcity intensifies
          → Adversarial conflict peaks (everyone racing for exits)
```

Each tier amplifies the one below it. Ambient tells you the pressure is building. Active makes the pressure cost you something. Adversarial makes the pressure competitive. Existential makes the pressure terminal.

---

## The Catalog Summary

| Tier | Type | Location | Per-Seed | Always Present? |
|------|------|----------|----------|----------------|
| **Ambient** | Drift Jellies | Open space | ✓ (baseline) | Yes |
| | Signal Blooms | Near signal sources | Pick 1-2 more | No |
| | Current Riders | Flow highways | | No |
| | Spore Clouds | Dead space | | No |
| | Static Wisps | Gravity gradients | | No |
| **Active** | Gradient Sentries | Well orbits | Pick 1-2 | No |
| | Wreck Wardens | Wreck clusters | | No |
| | Portal Wasps | Portal zones | | No |
| | Scavenger Drones | Roaming | | No |
| | Current Hunters | Flow highways | | No |
| | Herders | Roaming | | No |
| **Adversarial** | AI Players (5 personalities) | Map-wide | 3 per run | Yes |
| **Existential** | Inhibitor (3 forms) | Map-wide | 1 | Yes |

Total catalog: 5 ambient + 6 active + 5 AI personalities + 1 Inhibitor = **17 entity types**.

Per run: 2-4 ambient + 1-2 active + 3 AI + 1 Inhibitor = **7-10 entity types** active. Every run is a different combination. Every seed tells a different story.

---

## What This Replaces

The scavenger V2 design (SCAVENGERS-V2.md) and fauna design (FAUNA.md) are superseded by this catalog. The ideas from those docs are redistributed:

- Signal moths → simplified into Signal Blooms (ambient, visual tell only)
- Rift eels → promoted to Gradient Sentries (active tier, proper gameplay challenge)
- Drifter scavengers → absorbed into AI Players (Ghost/Prospector personalities)
- Vulture scavengers → absorbed into AI Players (Raider/Vulture personalities)
- Hunters → absorbed into active tier as Current Hunters (singular directive)
- Cargo raids, informants, pack hunting → natural behaviors of adversarial AI players
- Scavenger drones → new active type (loot timer, not a player analog)

## Decisions (2026-03-28)

1. **Player count per run:** 4-8 total (human + AI filling remaining slots). Server architecture scoped for this range.
2. **AI visibility / detection range:** Deferred. Interesting design space with lots of knobs but not load-bearing yet. Future feature.
3. **Scope:** No jam constraints. Pushing toward real game. Full catalog is the target, items naturally sequence into the roadmap by dependency and complexity.
4. **AI player extraction visibility:** Open — do you see their haul on extract?
5. **Active type naming:** Open — mechanical names or lore-friendly?

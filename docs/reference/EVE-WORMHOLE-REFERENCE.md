# EVE Wormhole Mechanics — Design Reference for Last Singularity

> What to steal, what to adapt, what to admire from a distance.

---

## Patterns That Map Directly

### 1. Engineered Uncertainty on Exits

EVE wormholes have two independent drain axes: **time** (they close after ~24h) and **mass** (every ship that transits subtracts from a mass budget). Crucially, both are **imprecise** — the time display shows "less than 4h" not "3h47m", and the mass budget has ±10% randomization. You can never be exactly sure when it will collapse.

**For Last Singularity:** Our portals (breaches?) already evaporate over time. We should add a **usage drain** — each extraction through a portal weakens it. In multiplayer, this means every player who extracts makes the remaining portals less stable for everyone. And the timing should be imprecise — the HUD shows "UNSTABLE" not "closing in 47 seconds."

**This is the dual-depletion model:** portals drain from time AND from use. Creates pressure from two independent vectors.

### 2. Asymmetric Information Is the Core Loop

In EVE wormhole space, there's no local chat — you have ZERO passive intel about who else is in the system. Everything you know, you had to actively discover. And every act of discovery (launching probes, jumping through a hole) risks revealing YOUR presence.

**For Last Singularity:** Signal IS this mechanic. Every action that gathers information (moving to see what's there, looting to learn what a wreck contains) also broadcasts information about you. The parallel is exact:

| EVE Concept | LBH Equivalent |
|-------------|----------------|
| D-scan (passive, free, limited range) | Drifting (silent, see what's in view) |
| Combat probes (active, reveals you) | Thrusting toward a wreck (generates signal) |
| Cloaking (invisible but can't interact) | Drifting in wreck wake (hidden but stuck) |
| Wormhole activation flash | Signal spike from looting |
| Local chat discipline | Signal management |

### 3. Environmental Effects That Force Adaptation

EVE's wormhole system effects (Wolf Rayet, Pulsar, Black Hole, etc.) completely change viable strategies. A Wolf Rayet C6 gives +200% small weapon damage — frigates become glass cannons, normal fleet doctrine inverts.

**For Last Singularity:** This maps to the "one strong cosmic signature per run" idea from Forge's review. Each universe should have a dominant environmental modifier:

| Universe Type | Effect | How It Changes Play |
|---------------|--------|-------------------|
| **Tidal** | Long slow currents, predictable waves | Surfing-focused, navigation rewarded |
| **Turbulent** | Chaotic flow, frequent merger pulses | Reactive play, can't plan routes |
| **Viscous** | Thick from the start, controls sluggish | Momentum management, commit to directions |
| **Sparse** | Low density, few wrecks, rich loot | High-value targets, long traversals |
| **Dense** | Many wrecks, busy flows, lots of fauna | Target-rich, high signal risk |
| **Decaying** | Starts fast, degrades quickly | Short aggressive runs |

### 4. Mass Limits as Natural Force Caps

EVE wormholes limit what can pass through by per-transit mass AND total mass. This prevents blob warfare — you can't bring unlimited ships.

**For Last Singularity (multiplayer):** Portal capacity. Each breach can only handle N extractions before collapsing. In a 3-player game with 4 breaches, that's tight. One breach per player plus one spare. If someone double-dips (extracts, re-enters on a new breach, extracts again), they consume exit capacity for everyone.

### 5. The K162 Rule (Commitment Creates Information)

In EVE, when you warp to a wormhole entrance, the other side doesn't see anything. But the moment you JUMP THROUGH, a signature appears in the destination system. Scouting is free. Committing is visible.

**For Last Singularity:** Approaching a breach should be quiet. But entering the extraction sequence should create a signal spike. Everyone nearby knows someone is leaving. This creates the "do I follow them to this breach or find my own?" decision.

### 6. Rolling as Strategic Resource Management

EVE players deliberately collapse their own wormholes to control access — collapsing a dangerous connection at the cost of losing it yourself.

**For Last Singularity:** Could a player deliberately destabilize a breach to deny it to competitors? Force pulse into a breach could accelerate its evaporation. Costs: you lose that exit too. Benefits: one fewer exit for the player who was heading for it. This is dark forest logic applied to exits.

---

## Patterns to Admire But NOT Build This Week

### Probe Scanning System
EVE's 3D triangulation probing is deep and skill-expressive but is an entire game system. For the jam: your "scan" is just your viewport + the audio cues. You see what you can see, you hear what you can hear. No explicit scanning mechanic needed.

### Chain Mapping
EVE groups map multi-system wormhole chains. Beautiful emergent complexity, but we have one universe per run. Not applicable for jam.

### Seeding and Infiltration
Logging off scouts in enemy territory for days. Requires persistence across sessions. Post-jam multiplayer feature.

### Eviction Warfare
Multi-day siege mechanics. Different game entirely.

---

## Naming Inspiration

EVE's wormhole vocabulary is strong:

| EVE Term | What It Means | LBH Potential |
|----------|---------------|---------------|
| K162 | Generic exit signature | The exit side of a breach could always look the same — you don't know where it leads until you commit |
| Static | A wormhole that always regenerates to the same class | Could inform persistent universe features post-jam |
| Rolling | Deliberately collapsing a connection | "Sealing a breach" — spending resources to close an exit |
| Polarization | 5-min timer preventing re-transit same direction | Commitment mechanic — once you start extracting, you're committed |
| Crit | A wormhole at <10% mass, visually tiny and flickering | Our breaches should visually shrink as they destabilize |
| Hole control | Knowing and controlling all exits | The metagame of breach awareness |

---

## The Big Takeaway

EVE wormhole space works because **every action that helps you also exposes you.** Scanning finds targets but reveals your probes. Jumping gives you access but alerts the other side. Rolling secures your borders but risks trapping you.

That's exactly what signal should be in Last Singularity. The game is about the tension between doing things and being seen doing them. EVE built an entire ecosystem around this. We need to nail it in one fluid sim.

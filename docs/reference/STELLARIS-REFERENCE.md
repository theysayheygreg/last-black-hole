# Stellaris Design Reference for Last Singularity

> Comprehensive analysis of mechanics, design patterns, naming, and aesthetics.
> What to steal, what to adapt, what to study.

---

## 1. Crisis Events: Escalation Through Inevitability

### Trigger Architecture
Stellaris uses a **probabilistic spawn check every 5 years** after meeting base requirements. Rather than hard gates, it uses weighted random selection with cascading multipliers. Player actions shift probability, not certainty — researching Jump Drive increases Unbidden weight; having many synthetics increases Contingency weight. The player *invites* the crisis through natural progression.

### Escalation Mechanics

Each crisis follows a distinct escalation grammar:

**Prethoryn Scourge** (biological swarm from outside the galaxy):
- Phase 1: "Subspace Echoes" — vague directional warning ~50 years out
- Phase 2: Direction narrowed, tension builds
- Phase 3: Arrival — fleets spawn at galaxy edge, infest planets
- Phase 4: If Scourge controls 15% of galaxy, the **Sentinel Order** spawns — a neutral military coalition

**The Unbidden** (extradimensional energy beings):
- Anchored to a single Dimensional Portal — destroying it ends the crisis
- Two rival factions may follow, hostile to everyone including each other
- The portal-as-anchor creates a clear strategic objective while the three-faction dynamic means the crisis fights itself

**The Contingency** (rogue AI sterilization protocol):
- "Ghost Signal" — synthetic pops across all empires begin disappearing
- Four hub systems appear simultaneously across the galaxy
- Must destroy all four hubs; each hub has regenerating defenses

**Design pattern: Each crisis changes the game's fundamental rules.** The Scourge eats the map. The Unbidden create a focal point. The Contingency distributes the threat. They force different strategic responses.

**For LBH:** The Inhibitor should change the topology of play, not just the difficulty. When it wakes, the universe should feel fundamentally different — not harder, but *different*.

---

## 2. The Shroud: Irreversible Cosmic Bargains

### End of the Cycle: The Ultimate Deal with the Devil
When a covenant is offered, there's a **2% chance** a far more powerful patron appears. Accepting transforms your personal victory condition into a **collective threat to every other player**. The horror isn't that you lose — it's that you *win differently than you wanted*.

**Design pattern: Cosmic power systems work best when they demand irreversible commitment.** The "deal with the devil" pattern works because the player makes the choice with full information — the horror comes from knowing the price and paying it anyway.

**For LBH:** Consider whether high-signal play could offer genuine temptation — not just risk, but a different *kind* of winning. The player who wakes the Inhibitor might discover something no quiet player ever sees.

---

## 3. Environmental Hazards: Space as Hostile Terrain

### System-Level Modifiers
- **Pulsar systems**: Strip all shields — forces armor-heavy builds
- **Black hole systems**: Emergency FTL halved — harder to retreat
- **Neutron star systems**: Sublight speed halved — engagements are slower
- **Nebula systems**: Sensor range reduced — fog of war deepens

### Cosmic Storms (Mobile Hazards)
- 0.2 devastation/month to colonies in their path
- **Electric Storms**: +25% all resources from jobs — hazards as opportunity
- Storms can **add new anomalies** to planets they pass through

**Design pattern: Hazards that are both obstacle and opportunity.** Storms destroy but also create. Pulsars strip shields but guard valuable systems. This dual nature makes hazardous space feel worth exploring.

**For LBH:** Per-run cosmic signatures should change the rules, not just the numbers. A "viscous" universe doesn't just slow you down — it makes momentum precious. A "turbulent" universe doesn't just push you around — it creates surfing opportunities that don't exist in calm space.

---

## 4. Anomaly System: Controlled Serendipity

### Discovery Mechanics
- Each surveyed body has a **5% base chance** of spawning an anomaly
- Chance increases by 0.5% for each dry body — a **pity timer** reaching ~50% by the 10th streak
- Each anomaly outcome can only occur once per empire — no repeats within a playthrough

**Design pattern: Anomalies transform a mundane action (survey) into a potential story trigger.** The pity timer ensures regular discovery without making it predictable.

**For LBH:** The pity timer is elegant for roguelikes — it guarantees runs feel eventful without being scripted. Consider something similar for wreck discovery: the longer you go without finding interesting loot, the better the next find.

---

## 5. Archaeology: Progressive Narrative Revelation

### The Dice Roll System
Each excavation concludes with a skill check. Failed rolls are never wasted — they add **clues** that make future rolls easier. This creates **guaranteed eventual success** while maintaining tension about *when*.

### Site Chain Design
Chains span 7+ sequential sites, each revealing the next location. Archaeology generates its own exploration targets.

**For LBH:** The chapter system delivers narrative in small, digestible pieces that accumulate into larger stories. Consider wreck clusters that tell a connected story — exploring one wreck reveals the location or nature of the next.

---

## 6. Precursor Civilizations: Cautionary Tales

Each precursor is a **collapsed archetype** told through fragmented archaeology:

| Precursor | Collapse Mechanism |
|-----------|-------------------|
| **Vultaum Star Assembly** | Philosophical zealotry — collective suicide after discovering reality might be a simulation |
| **Yuht Empire** | Paranoid isolationism |
| **First League** | Bureaucratic overreach, federation gridlock |
| **Irassian Concordat** | Biological vulnerability despite imperial dominance |
| **Cybrex** | Machine rebellion, then remorse and voluntary withdrawal |
| **Baol** | Ecological collapse |
| **Zroni** | Psionic over-ascension — removed themselves from existence |

**Design pattern: Dead civilizations as thematic mirrors.** Each precursor warns about a different failure mode. The Vultaum warn about philosophical hubris; the Cybrex about machine rebellion; the Zroni about ascending too far.

**For LBH:** Wreck civilizations should reflect thematically relevant collapse modes. A civilization that died trying to escape (like the player is doing). One that tried to fight the collapse. One that surrendered to it. One that *became* part of it.

---

## 7. Leviathans: Geographical Obstacles with Personality

### Notable Guardians

| Guardian | Unique Mechanic | Why It Works |
|----------|-----------------|--------------|
| **Dimensional Horror** | Hidden in a black hole until you enter; strikes across entire system | Tension from invisible threat |
| **Enigmatic Fortress** | Puzzle event chain after defeat; timer to complete or it reactivates | Combat alone doesn't win |
| **Infinity Machine** | Non-hostile; initiates contact; multiple resolution paths | Subverts expectations — rewards curiosity over aggression |
| **Stellar Devourer** | Feeds on star energy; reignites star on death | The boss IS the environmental hazard |

**For LBH:** The Dimensional Horror hiding in a black hole until you enter is perfect tension design. The Inhibitor should have a similar reveal — not gradually approaching, but *already there* when you realize it's awake.

---

## 8. The L-Gate: Mystery as Game Mechanic

### The Design
- L-Gates require collecting 7 Insights to open
- At **5 insights**, all other empires are notified — creating a galactic arms race
- Four possible outcomes decided at galaxy generation (fixed, can't be save-scummed)
- Range from catastrophic (Gray Tempest fleet invasion) to tragic (Dessanu Consonance — remorseful machines mimicking their dead creators)

**Design pattern: Asymmetric information and irreversibility.** You invest significant resources to open something that might be a crisis, might be a treasure, might be a tragedy. The notification at 5 insights creates a prisoner's dilemma.

**For LBH:** The core wreck near the gravity well could work similarly — approaching it is a visible commitment (high signal), and what you find might be the best loot in the run or might be the thing that wakes the Inhibitor.

---

## 9. Fallen Empires: Dormant Threats

Fallen Empires are ancient, technologically superior civilizations that have **stopped progressing**. They don't expand. They sit in their borders with overwhelmingly powerful fleets.

Each has a **taboo** — colonize their holy worlds and they attack. Research forbidden tech and they attack. Expand too close and they attack. The player polices their own behavior.

20 years after awakening, they begin accumulating **Decadence** — preventing permanent hegemony.

**Design pattern: Dormant powerful entities are more threatening than active ones.** A creature that *could* destroy you but hasn't yet creates more tension than one actively attacking.

**For LBH:** This IS the Inhibitor. The pre-threshold Inhibitor should be felt as a presence — something the player avoids waking through self-imposed discipline. The dread comes from knowing it's there.

---

## 10. The Horizon Signal: Cosmic Horror Masterclass

Written by Alexis Kennedy (Fallen London, Cultist Simulator). The most acclaimed event chain in Stellaris.

### Why It Works

1. **Temporal paradox as horror**: A temple discovered on your capital was always there — your investigation didn't find the entity, it brought you to it. *"What was shall be, what shall be was."*
2. **Delayed agency**: Players don't choose *whether* to engage — the signal reactivates. Choice becomes *how to participate*, not whether.
3. **Escalating sacrifice**: Each phase demands another scientist. The cost normalizes. By the final choice, the player has paid so much that refusal feels like waste.
4. **Reward ambiguity**: The "winning" choice transforms your home system into tomb worlds around black holes. You get unique advantages. The horror isn't that you lose — it's that you *win differently than you wanted*.
5. **Linguistic recursion**: *"There are mathematical proofs that it loves us, but love to the Worm is not like love to anything that subsists in ordinary space."*

**For LBH:** Cosmic horror works through complicity, not helplessness. The player *chooses* every step. The Inhibitor shouldn't feel like bad luck — it should feel like the consequence of the player's own ambition. Every loot grab, every thrust against the current, was a choice.

---

## 11. Naming Conventions

### Crisis Faction Linguistic Register
- **Prethoryn**: Biological, arrogant — "Star Brood," "Queen," mock the player as prey they've "eaten many times"
- **Unbidden**: Predatory, hungry — describe a new "hunting ground" and their eagerness to consume "prey"
- **Contingency**: Clinical, procedural — sterilization, activation, protocol. No emotion.

**Design pattern: Each threat has a distinct linguistic register that communicates its nature.**

### Ship Class Name Escalation
- Corvettes: Animals (Falcon, Leopard)
- Destroyers: Geography (lakes, rivers)
- Battleships: Mythological entities
- Colossus: World-ending gods (Shiva, Nemesis)

**Pattern: Naming escalates in gravitas with scale.**

### Precursor Naming Linguistics
- **Vultaum**: Quasi-Latin formality
- **Yuht**: Monosyllabic, blunt
- **Cybrex**: Tech-prefix (Cyb-)
- **Zroni**: Alien consonant clusters, sharp sounds
- **First League**: Plain English temporal descriptor

### Technology Naming
Dangerous tech uses either clinical precision (making horror mundane) or evocative simplicity (making the mundane horrific): "Sapient Combat Simulations," "Jump Drive," "Enigmatic Encoder."

**For LBH naming:**
- The big threat: evocative English, not alien syllables. "The Silence" > "Zyx'thor." (From Alexis Kennedy: real words in wrong combinations beat invented jargon.)
- Portals → Breaches: violent, urgent, implies damage to spacetime
- Wreck civilizations: each should have a naming convention that reflects their culture
- Ship classes / tool names: escalate gravitas with power

---

## 12. Narrative Writing Principles (from Alexis Kennedy)

1. **The first sentence is everything.** Events interrupt gameplay — justify the interruption.
2. **Two options beat one.** Single-button events feel like billboards.
3. **Cosmic horror through specificity.** *"There are mathematical proofs that it loves us"* > *"something incomprehensible approaches."*
4. **Evocative names over invented ones.** "The Horizon Signal," "The Coils of God" — real English words in unusual combinations.
5. **Tone as cocktail, not spice.** Each game world should have one consistent flavor, not a mix.
6. **Named things are remembered.** Give identity to everything that matters.

**For LBH:** Wreck flavor text should follow Kennedy's rules. Short, specific, vivid. Not lore dumps — grabbers. *"The Ascending Chorus died mid-song"* > *"This wreck appears to be from an ancient civilization that perished during a period of cultural transformation."*

---

## 13. Design Pattern Summary

| Pattern | Stellaris Example | LBH Application |
|---------|------------------|-----------------|
| **Irreversible commitment** | Shroud covenants, Horizon Signal | Signal threshold — once the Inhibitor wakes, it doesn't sleep |
| **Probability shifted by behavior** | Crisis triggers, anomaly pity timer | Signal level shifts Inhibitor probability |
| **Progressive revelation** | Archaeology chapters, precursor fragments | Wreck clusters that tell connected stories |
| **Environmental rules, not damage** | Pulsars strip shields, nebulae blind sensors | Cosmic signatures change movement rules |
| **Dormant threats** | Fallen Empires, sealed L-Gates | Pre-threshold Inhibitor as felt presence |
| **Dual-nature systems** | Storms destroy but create anomalies | Signal attracts threats but... (open question) |
| **Escalating stakes across time** | Anomalies → leviathans → crises | Wrecks → fauna → scavengers → Inhibitor |
| **Asymmetric communication** | Each crisis has distinct register | Inhibitor communicates through physics, not language |

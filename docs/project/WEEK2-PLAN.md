# Week 2 Plan: Systems & Progression

> March 25-31, 2026. Transform the jam prototype into a replayable game.
> Week 1 built the feel. Week 2 builds the reason to come back.

---

## Week 2 Completion Status (2026-03-31)

| Item | Status | Notes |
|------|--------|-------|
| Loot variety | SUPERSEDED | Replaced by hull-based item affinity system (CLASSES-AND-PROGRESSION.md) |
| Inventory limits | DONE | 3-6 cargo slots (hull-dependent via PlayerBrain) |
| Vault | DESIGNED | Per-account vault, 20-40 slots (META-LOOP.md) |
| Meta screen | DESIGNED | Results/vault/rig/loadout/chronicle (META-LOOP.md) |
| Upgrade tree | DESIGNED | 3 rig tracks × 5 levels per hull (META-LOOP.md) |
| Missions | DEFERRED | Not in current design — runs are self-motivated, not quest-driven |
| XP + Levels | REJECTED | Replaced by EM economy + milestone gates. No XP system. |
| NPC factions | DEFERRED | AI players fill the adversarial niche. Factions are post-hull-system work. |
| Session events | PARTIAL | Inhibitor forms, portal waves, wreck waves. No mid-run faction arrivals yet. |
| Signal + Inhibitor | DONE | Full implementation (6 zones, 3 inhibitor forms) |
| Server architecture | DONE | Authoritative sim, persistence, control plane, overload states |
| Ship classes | DONE | 5 hulls with abilities, PlayerBrain, physics wiring |
| Loot economy | DESIGNED | Tier gates, wreck aging, value scaling (LOOT-ECONOMY.md) |

**Major pivot from original plan:** The hull/class system (CLASSES-AND-PROGRESSION.md) replaced the flat upgrade tree. Instead of "improve your one ship," progression is now "deepen your hull's identity through rig tracks." This is a better fit for the extraction loop — specialization creates replayability.

---

## What Exists (from Week 1)

**Core loop:** drop → fly → loot wrecks → extract via portal (or die)
**Physics:** fluid sim, wells, stars, planetoids, wave rings, toroidal world, 3 map sizes
**Entities:** AI scavengers (drifter/vulture), wreck system (3 types, 3 tiers), portal waves
**Combat:** force pulse (player + scavenger)
**Presentation:** ASCII shader, cosmic signatures (6), HUD (collapse/portals/salvage/scavengers/pulse/portal arrow)
**Architecture:** SimCore + FlowField + SimState decoupled from renderer

**Not yet built (from Week 1 backlog):**
- Signal system + Inhibitor
- Tether + slingshot
- Audio tuning
- Between-run progression
- Balance pass

---

## What We're Adding (Week 2 features)

### Tier 1: Meta Loop Foundation (Days 1-2)
*Without this, nothing else has meaning. Loot needs a purpose.*

**A. Loot variety** — items have categories, not just names and values
- Salvage (sell for exotic matter)
- Components (needed for specific upgrades)
- Data cores (faction intel / map reveals)
- Artifacts (rare, equippable effects)

**B. Inventory limits** — 8-12 slots per run. Full = swap or leave. Creates decisions.

**C. Vault** — persistent storage between runs (localStorage). Extract → items go to vault.

**D. Meta screen** — DOM-based between-run interface. Vault management, sell items, see currencies.

### Tier 2: Spend Loop (Days 2-3)
*Exotic matter has a purpose. Runs feed progression.*

**E. Upgrade tree** — ship performance + ability upgrades, 3-5 tiers each
- Performance: thrust, hull, coupling, drag, sensors
- Abilities: pulse upgrades, signal dampening, current reader, tether, slingshot assist
- Loadout: pick 2-3 abilities per run

**F. Missions** — accept 1-3 before a run from a mission board
- Retrieve, scout, deliver, sabotage, survive
- Reward: XP + exotic matter + faction rep

**G. XP + Levels** — accumulates from everything, gates upgrade tiers and content

### Tier 3: World Depth (Days 3-5)
*The universe has politics and surprises.*

**H. NPC factions** — 3 factions with identity, behavior, reputation
- Collectors (knowledge, passive, trade intel)
- Reapers (aggressive, resource strippers)
- Wardens (portal guardians, toll collectors)
- Plus unaligned drifters (existing)

**I. Session events** — mid-run surprises
- Well mergers, breach storms, faction arrivals, hawking flares, dead zones, distress calls

**J. Signal system + Inhibitor** — from Week 1 backlog. Signal as tax on ambition. Inhibitor as existential threat.

### Tier 4: Movement Depth (Day 5-6)
*Movement skill ceiling.*

**K. Tether** — attach to wrecks/planetoids (designed, not built)

**L. Slingshot** — gravity hook-and-swing (designed in detail, not built)

### Tier 5: Polish (Day 6-7)
*Make it feel finished.*

**M. Real UI** — proper inventory panel, mission tracker, minimap/compass, faction encounter UI, vault grid, upgrade tree visual, ship loadout screen, player stats

**N. Audio tuning** — unmute, tune timbre per phenomenon, spatial mixing

**O. Balance pass** — run timing, escalation, upgrade costs, loot rates

**P. Deploy** — itch.io or web hosting

---

## Dependency Graph

```
                Loot Variety (A)
                    │
            ┌───────┼───────┐
            │       │       │
     Inventory (B)  │  Vault (C)
            │       │       │
            └───────┼───────┘
                    │
              Meta Screen (D)
                    │
         ┌──────────┼──────────┐
         │          │          │
   Upgrades (E)  Missions (F)  XP/Levels (G)
         │          │          │
         │     ┌────┘          │
         │     │               │
    NPC Factions (H) ──────────┘
         │
  Session Events (I)
         │
  Signal + Inhibitor (J) ←── from Week 1 backlog

  Tether (K) ──── independent, can build anytime
  Slingshot (L) ── independent, can build anytime

  Real UI (M) ──── depends on all systems existing
  Audio (N) ────── independent
  Balance (O) ──── depends on all systems existing
```

---

## Day-by-Day Schedule

### Day 1 (Tue Mar 25): Loot + Inventory

**Goal:** Items have meaning. Inventory creates pressure.

| Task | What | Est |
|------|------|-----|
| Loot categories | Salvage, components, data cores, artifacts. Each with properties. | 1-2hr |
| Item generation | Wrecks generate category-appropriate loot. Vaults have artifacts. | 1hr |
| Inventory limits | 8 slots. Full = swap UI. Pickup blocked when full. | 1-2hr |
| Inventory HUD | Expandable panel showing items with category colors and tier | 1hr |

**Done when:** picking up loot feels meaningful because you have limited space and items have different purposes.

### Day 2 (Wed Mar 26): Vault + Meta Screen + Currencies

**Goal:** Extraction has permanence. You can sell and save.

| Task | What | Est |
|------|------|-----|
| Vault (localStorage) | Persistent item storage. Extract → items to vault. | 1-2hr |
| Exotic matter | Currency from selling salvage. Persists via localStorage. | 30min |
| Meta screen shell | DOM screen between runs. Vault grid, sell button, currency display. | 2-3hr |
| Game flow | Extract → meta screen → "drop again". Death → meta screen (empty-handed). | 1hr |

**Done when:** you can extract, see your loot in the vault, sell some for exotic matter, and drop again with your currency intact.

### Day 3 (Thu Mar 27): Upgrades + Loadout

**Goal:** Exotic matter buys power. Runs feel different with different loadouts.

| Task | What | Est |
|------|------|-----|
| Upgrade tree data | Define all upgrades, tiers, costs, effects | 1hr |
| Upgrade purchase | Buy upgrades on meta screen, deduct exotic matter | 1-2hr |
| Apply upgrades to gameplay | Purchased upgrades modify CONFIG at run start | 1hr |
| Loadout system | Pick 2-3 abilities before a run. Equip screen. | 1-2hr |
| Upgrade UI | Visual tree or grid on meta screen | 1-2hr |

**Done when:** you can buy Thrust Power tier 2, equip Signal Dampening, and feel both in the next run.

### Day 4 (Fri Mar 28): Missions + XP + Factions

**Goal:** Runs have goals. The world has politics.

| Task | What | Est |
|------|------|-----|
| Mission system | Mission data, accept/track/complete logic | 2hr |
| Mission board UI | Available missions on meta screen, accept 1-3 | 1hr |
| XP + level system | XP from loot/missions/survival, level thresholds, gates | 1-2hr |
| Faction data | 3 factions with rep tracks, ship colors, behavior modes | 1-2hr |
| Faction scavengers | Extend scavenger system with faction affiliation + faction-specific AI | 2hr |

**Done when:** you accept a "retrieve a Quantum Core" mission, drop in, see Collector and Reaper ships with different colors and behaviors, extract with the core, get XP + rep.

### Day 5 (Sat Mar 29): Session Events + Signal + Inhibitor

**Goal:** Runs are unpredictable. Signal creates tension. The Inhibitor creates dread.

| Task | What | Est |
|------|------|-----|
| Session event system | Event scheduler, 4-6 event types, CONFIG-driven timing | 2-3hr |
| Signal system | Signal level, emission sources, decay, tiers | 2hr |
| Inhibitor | Spawn at threshold, hunt, kill, UI corruption | 2-3hr |

**Done when:** mid-run a "breach storm" opens 4 portals for 30 seconds. Your signal is at BEACON from looting. The Inhibitor wakes. You have to choose: race for a breach portal or go silent and wait.

### Day 6 (Sun Mar 30): Tether + Slingshot + Audio

**Goal:** Movement skill ceiling. The game sounds right.

| Task | What | Est |
|------|------|-----|
| Tether | Attach to wrecks/planetoids, ride, break on thrust | 2hr |
| Slingshot | Snap-to-lane, hold-to-orbit, release-to-boost (from design doc) | 3hr |
| Audio tuning | Unmute, tune timbre, spatial mixing, event sounds | 2hr |

**Done when:** you tether to a planetoid for free travel, release near a well, slingshot around it at 2x speed aimed at a portal. The drone hums, wells throb in stereo, the pulse sounds like a shockwave.

### Day 7 (Mon Mar 31): UI + Balance + Deploy

**Goal:** Ship it.

| Task | What | Est |
|------|------|-----|
| Real UI pass | Inventory panel, mission tracker, faction encounter, minimap | 3-4hr |
| Balance pass | Run timing, upgrade costs, loot rates, faction tuning | 2-3hr |
| Edge cases | Resize, tab switch, localStorage errors | 1hr |
| Deploy | itch.io or web hosting | 1hr |

**Done when:** you'd share the link.

---

## Scope Ratchets

| After Day | If ahead | If behind |
|-----------|----------|-----------|
| Day 2 | Pull upgrades forward | Cut categories to 2 (salvage + components) |
| Day 4 | Pull signal + Inhibitor forward | Cut factions to 1 + unaligned. Simplify missions to 2 types. |
| Day 5 | Deeper session events, faction quests | Cut session events to 2 types. Cut Inhibitor to fixed-timer spawn. |
| Day 6 | UI polish, cosmetics, difficulty scaling | Cut tether OR slingshot (not both). Ship audio as-is. |

---

## What We're NOT Doing This Week

- Multiplayer networking (architecture is ready but no WebSocket code)
- Mobile/touch support
- Generative music (beyond the current synthesis)
- Visual regression testing
- Dual-solver physics experiment
- Feedback buffer / motion trails

These stay on the backlog for Week 3+.

---

## Workstream Split (if Codex is available)

**Forge/Codex:** renderer polish, ASCII quantization improvements, scene-shaping, scaling across map sizes, perf optimization
**Claude/Orrery:** all gameplay systems above, meta screen, UI, balance
**Orb:** routing, handoffs, keeping workstreams isolated

Same split as Week 1. Renderer lane stays with Codex. Gameplay lane stays with Claude.

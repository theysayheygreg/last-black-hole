# Week 2 Status — March 27, 2026 (End of Day 3)

## What's Built

### Core Systems (Week 1)
- [x] Fluid sim (GPU Navier-Stokes, toroidal wrapping)
- [x] Ship controls (keyboard + gamepad, fluid coupling)
- [x] Wells (gravity, accretion disks, kill zones, growth)
- [x] Stars (4 types, push force, orbital systems, drift, well consumption)
- [x] Wrecks (3 types, loot, fluid obstruction, drift toward wells)
- [x] Portals (wave spawning, extraction)
- [x] Comets (teardrop body, canvas tail, orbit/figure8/transit paths)
- [x] Scavengers (2 archetypes, behavioral AI, portal competition)
- [x] Combat (force pulse, cooldown, well disruption)
- [x] Wave rings (expanding, ship push, fluid injection)
- [x] ASCII renderer (character dithering, shimmer)
- [x] Display shader (analytic well rings, fabric noise, flow visualization)

### Week 2 Additions
- [x] Item system (4 categories, 26 items, loot tables)
- [x] Inventory (8 cargo + 2 equip + 2 consumable slots)
- [x] Profile system (3 save slots, localStorage persistence)
- [x] Home screen (4 tabs: ship/vault/upgrades/launch)
- [x] 6 upgrade tracks (thrust/hull/coupling/drag/sensor/vault)
- [x] Vault (25 slot cap, expandable, sell for EM, equip/load from vault)
- [x] Meta flow (title → profile → home → map → play → home loop)
- [x] Wreck drift (gravity pull, natural loot lifespan)
- [x] Scavenger death drops (debris wrecks ejected from well)
- [x] Star consumption remnants (vault wreck at death site)
- [x] 4 consumable effects (shield burst, time slow, breach flare, signal purge stub)
- [x] 4 equippable effects (kill radii, flow arrows, reduce well pull, signal dampen stub)
- [x] Proximity flavor labels (all entities named, distance-based fade)
- [x] SNES audio engine (27 events, context-aware, bit crush + echo)
- [x] Edge indicators (off-screen wells and wrecks)
- [x] Hull/sensor upgrade gameplay effects
- [x] Death tax (10% EM)
- [x] Vault sorting
- [x] 7 test suites, 31+ tests

## What's NOT Built Yet

### Designed, Not Implemented
- [ ] Signal system (SIGNAL-DESIGN.md — signal generation, visibility penalties, fauna attraction)
- [ ] Slingshot mechanic (SLINGSHOT.md — gravity assist, hold-to-orbit)
- [ ] Tether tool (attach to objects for anchoring/free travel)
- [ ] Inhibitor entity (the end-game threat)
- [ ] Fauna (signal moths)
- [ ] Missions/XP/levels
- [ ] NPC faction reputation system
- [ ] Session events (cosmic storms, rift cascades)

### Backlogged
- Comet tail fluid wake injection
- Server-side save
- Death penalty nuance
- Upgrade respec
- Profile name text sanitization
- Multiplayer / WebSocket
- Visual regression tests
- Fast sqrt approximation (if pattern hits GPU)

## Tomorrow's Plan (Day 4 — March 28)

### Priority 1: Slingshot Mechanic
The big missing movement verb. Design is complete (SLINGSHOT.md). Approach → catch → orbit → release → boost. This transforms wells from pure threats into movement tools. High impact on gameplay feel.

### Priority 2: Signal System
The tension mechanic. Every action generates signal (thrust, loot, combat). Signal attracts scavengers and (eventually) the Inhibitor. Creates risk/reward for aggressive play. Design complete (SIGNAL-DESIGN.md). Ungate the signal items when built.

### Priority 3: Session Events
Cosmic storms, rift cascades, mass growth spikes. These break the steady state and create drama. Some design exists but needs fleshing out.

### Priority 4: Balance + Polish
- Audio tuning pass (levels, timing, character)
- Drift tuning (is it too fast? too slow?)
- Upgrade cost balancing
- Map content review (enough wrecks? right positions?)

## Architecture Health

**Code review (March 27):** Full audit of 11 source files. 0 bugs found outside audio.js (memory leak fixed). Phase transitions complete. State resets verified. Coordinate math consistent. All toroidal wrapping correct.

**Test coverage:** 7 suites, 31+ tests. Covers: validation, smoke, physics, coordinates, flow, inventory (18 tests), and systems (10 tests). Meta flow partially covered. Physics suite has a known flaky timing issue (passes on retry).

**Performance:** 60fps on all maps. Growth events staggered. Wreck drift is O(wells × wrecks) per frame — acceptable for current entity counts. Audio voices auto-disconnect after 5s to prevent graph accumulation.

**File count:** 25 source files, 15 design docs, 7 test files, 4 map files.

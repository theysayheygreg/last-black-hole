# Meta Flow: Player Profiles, Home Screen, Upgrades

> The loop between runs. Where loot becomes power.

## Flow

```
TITLE SCREEN
    ↓ space
PROFILE SELECT (A / B / C)
    ↓ pick slot
HOME SCREEN
    ├─ Ship (stats + equipped loadout)
    ├─ Vault (stored items, sell for EM)
    ├─ Upgrades (spend components + EM to rank up)
    ├─ Missions (stub for now)
    └─ Launch (→ map select)
        ↓
MAP SELECT → PLAY → extract or die
    ↓ extract                ↓ die
HOME SCREEN              HOME SCREEN (cargo lost)
    (cargo → vault)
```

Both death and extraction return to home screen. Players may want to change loadout, sell items, or upgrade between rounds regardless of outcome. Death loses cargo but you still visit home.

## Save Slots

### What's in a slot

```javascript
{
  name: 'Pilot Alpha',       // player-chosen or default
  created: '2026-03-27T...',
  lastPlayed: '2026-03-27T...',

  // Currency
  exoticMatter: 1250,

  // Stored items (not equipped, not in cargo)
  vault: [ ...items ],

  // Equipped loadout (persists across runs)
  loadout: {
    equipped: [item | null, item | null],
    consumables: [item | null, item | null],
  },

  // Upgrade levels (0 = base, 1-3 = upgraded)
  upgrades: {
    thrust: 0,    // 0=base, 1=Quantum Coil, 2=Fusion Core
    hull: 0,
    coupling: 0,
    drag: 0,
    sensor: 0,
  },

  // Stats
  totalExtractions: 0,
  totalDeaths: 0,
  totalItemsSold: 0,
  bestSurvivalTime: 0,
  totalExoticMatterEarned: 0,

  // Ship type (single for now, expandable later)
  shipType: 'standard',
}
```

### Storage

localStorage with key per slot:
- `lbh_profile_0`, `lbh_profile_1`, `lbh_profile_2`
- `lbh_profiles_index` — which slots exist, last used

Migration: existing `lbh_vault` data auto-imports into slot 0 on first load.

Server save is out of scope now — backlog task for later versions. The save format is JSON-serializable by design so it can POST to an API unchanged.

### Profile select screen

Simple: 3 slots displayed vertically. Each shows:
- Pilot name (or "empty slot")
- Exotic matter balance
- Total extractions
- Last played timestamp

Controls: up/down to select, space to load/create, X to delete (with confirm).

## Home Screen

Canvas-rendered, not DOM. Consistent with the game's visual identity. Dark background, monospace text, minimal chrome.

### Layout (rough)

```
┌─────────────────────────────────────────┐
│  PILOT: Alpha    EM: 1,250              │
│                                         │
│  [SHIP]  [VAULT]  [UPGRADES]  [LAUNCH]  │
│                                         │
│  ┌─ active subscreen ──────────────┐    │
│  │                                 │    │
│  │  (content varies by tab)        │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ← → navigate tabs    space: confirm    │
└─────────────────────────────────────────┘
```

### Subscreens

**SHIP** — current stats with upgrade levels highlighted
```
thrust:   ████░░  rank 2/3  [Quantum Coil installed]
hull:     ██░░░░  rank 1/3
coupling: ██████  rank 3/3  MAX
drag:     ████░░  rank 2/3
sensor:   ░░░░░░  rank 0/3
```
Plus equipped artifact slots and consumable hotbar slots (same as in-game inventory but editable here).

**VAULT** — scrollable list of stored items. Actions:
- Sell (→ exotic matter)
- Equip (artifacts → loadout)
- Load (consumables → hotbar)

**UPGRADES** — the upgrade tree (see below)

**LAUNCH** — map select (moved here from being its own phase)

## Upgrade System

### Five upgrade tracks

| Track | Base stat | What it does | CONFIG key |
|-------|-----------|-------------|------------|
| Thrust | 1.7 accel | Ship acceleration | ship.thrustAccel |
| Hull | 1 (new) | Survive glancing well contact | — (new mechanic) |
| Coupling | 1.2 | Fluid current influence | ship.fluidCoupling |
| Drag | 0.06 | Velocity damping | ship.drag |
| Sensor | 0 (new) | Wreck/portal detection range | — (extends label fade distance) |
| Vault | 25 slots | Storage capacity | — (profile.vaultCapacity) |

### Rank requirements

Each track has 3 ranks. Rank 1 is cheap, rank 3 is expensive.

| Rank | Component required | EM cost | Stat change |
|------|-------------------|---------|-------------|
| 1 | (none — EM only) | 200 EM | +15% improvement |
| 2 | Specific uncommon component | 500 EM | +30% total |
| 3 | Specific rare component | 1200 EM | +50% total |

**Component matching:** Each upgrade track has exactly one uncommon and one rare component that unlocks its rank 2 and rank 3 (the `upgradeTarget` field in items.js already maps these).

**The component is consumed** when you upgrade. You need both the component AND the exotic matter.

**Rank 1** requires no component — just exotic matter. This lets players start upgrading immediately after their first extraction without needing a lucky rare drop.

**Vault space** is special — EM only (no component), but escalating costs: rank 1 = 500 EM (→ 35 slots), rank 2 = 1500 EM (→ 50 slots), rank 3 = 4000 EM (→ 75 slots). This is the EM sink that prevents hoarding.

### How upgrades modify gameplay

At game start (when entering a run), the profile's upgrade levels are read and applied as multipliers to CONFIG:

```javascript
// Example: thrust rank 2 = 30% boost
const thrustMult = 1 + profile.upgrades.thrust * 0.15;
CONFIG.ship.thrustAccel *= thrustMult;
```

Revert on run end (or just re-read from defaults + apply).

### Hull and Sensor (new mechanics)

**Hull** — currently death is instant on well contact. With hull upgrades:
- Rank 0: instant death (current)
- Rank 1: 0.3s grace period on well edge (can escape if fast)
- Rank 2: survive one glancing contact per run (like a free shield burst)
- Rank 3: 0.5s grace + survive one contact

**Sensor** — extends the proximity label fade distance:
- Rank 0: labels visible at 0.15-0.4 world units (current)
- Rank 1: 0.2-0.55
- Rank 2: 0.25-0.7
- Rank 3: 0.3-0.85

Also extends wreck/portal indicator range on the HUD edge arrows (when we build those).

## Currency Model

Two currencies, one explicit and one implicit:

**Exotic Matter (EM)** — the universal currency
- Gained by: selling salvage, components, data cores at the vault
- Spent on: rank 1 upgrades (no component needed), rank 2-3 upgrades (alongside components)
- Selling price = item's `value` field (already exists)

**Components** — the upgrade ingredients
- NOT sold for EM (or at least worth very little if sold)
- Used directly: consumed when upgrading to rank 2 or 3
- Each component maps to exactly one upgrade track + rank
- Players need to decide: sell the Quantum Coil for 80 EM, or save it for thrust rank 2?

This creates a natural tension: sell everything for currency (safe, incremental), or hoard components for big upgrade jumps (risky, you might die and lose them — unless they're in the vault).

## Implementation Plan

### Phase 1: Save system + profile select (today)
- New `src/profile.js` — save slot management, load/save/create/delete
- Refactor `vault.js` to work within a profile
- New game phase: `profileSelect` between title and home
- Profile select screen rendering in main.js

### Phase 2: Home screen shell (today)
- New game phase: `home` with tab navigation
- Canvas-rendered tabs: SHIP / VAULT / UPGRADES / LAUNCH
- Stub all subscreens with placeholder text
- Wire LAUNCH to map select

### Phase 3: Vault subscreen (today)
- Scrollable item list from profile.vault
- Sell action (item → EM)
- Equip/load actions (move to loadout)

### Phase 4: Upgrade subscreen (today/tomorrow)
- Display 5 tracks with current ranks
- Upgrade action: check component + EM, consume, increment rank
- Apply upgrade multipliers at run start

### Phase 5: Ship subscreen (later)
- Stat display with upgrade levels
- Loadout editor (equip/unequip from vault)
- Ship type selector (future — single type for now)

## Decisions (2026-03-27)

1. **Profile names:** Player-entered with random name generator as default. Character limit (16). Spaces allowed. Text input sanitization backlogged.
2. **Vault size limit:** 25 slots. Expandable via vault space upgrades (expensive EM cost, multiple ranks). Vault pressure forces sell/equip/upgrade decisions.
3. **Components sellable:** Yes. Inventory and vault space are the forcing functions — you sell, equip, upgrade, or run out of room.
4. **Death penalty:** Yes, some EM loss on death. Nuance deferred — death penalties are a whole feature for later.
5. **Upgrade respec:** No for now. Pinned for future discussion.
6. **Data cores:** Keep dropping as inventory items. Faction system comes later — they're sellable for EM in the meantime.

### Additional decisions
- **Death flow:** Always returns to home screen (not map select). Players may want to respec loadout after a death.
- **Item quantities:** EM is a pure number (not item-based). Components and artifacts remain single-slot items. No stack sizes for now — each item occupies one slot. Vault space pressure handles the economy.
- **Vault space upgrade:** New 6th upgrade track. Ranks increase vault capacity: 25 → 35 → 50 → 75. Costs only EM (no component), but expensive.

# Score Screen — Run Results

> you made it out. here's what you brought back.

---

## Design Intent

The score screen is the payoff for a run. It replaces the current bare "ESCAPED" / "CONSUMED" text with a full results breakdown. It tells the story of what happened — how long you survived, what you found, how close you cut it.

Two variants: extraction (success) and consumption (failure). Both show stats. Success shows loot and a score multiplier. Failure shows what you lost.

---

## Extraction Screen (success)

Rendered on the overlay canvas (same as current escaped screen). Fluid sim continues running in background, dimmed.

### Layout

```
                    ┌──────────────────────────┐
                    │       EXTRACTED           │
                    │   out of a dying universe │
                    │                           │
                    │   wave 3 ── 2.0x bonus    │
                    │                           │
                    │   ── salvage ──            │
                    │   Quantum Lattice Fragment │
                    │   Void Shard              │
                    │   Temporal Coil            │
                    │   Phase Matrix             │
                    │                           │
                    │   4 items from 2 wrecks   │
                    │   survived 5:42           │
                    │                           │
                    │   ── score ──              │
                    │       2,840               │
                    │                           │
                    │   press space to continue │
                    └──────────────────────────┘
```

### Elements

1. **Title:** "EXTRACTED" in cyan (`rgba(100, 255, 255)`) — same color as current escaped screen
2. **Subtitle:** "out of a dying universe" in muted blue
3. **Wave indicator:** which portal wave you escaped on + the multiplier (wave 1 = 1.0x, wave 5/final = 5.0x)
4. **Salvage list:** scrollable if long. Item names in white, tier color-coded (common=white, uncommon=green, rare=cyan, unique=gold)
5. **Run stats:** items collected, wrecks looted, time survived (mm:ss format)
6. **Score:** total value × wave multiplier. Large, centered.
7. **Prompt:** "press space to continue" → map select

### Animations

- Elements fade in sequentially (0.3s gaps): title → subtitle → wave → salvage list (items appear one by one, 0.1s each) → stats → score (last, dramatic)
- Score does a brief "counting up" animation (0.5s from 0 to final)
- All text uses `shadowBlur` for readability (no overlay veil — fluid visible behind)

---

## Consumption Screen (failure)

### Layout

```
                    ┌──────────────────────────┐
                    │       CONSUMED            │
                    │   the universe won         │
                    │                           │
                    │   survived 7:23           │
                    │   2 wrecks looted         │
                    │   3 items lost            │
                    │                           │
                    │   press space to continue │
                    └──────────────────────────┘
```

### Elements

1. **Title:** "CONSUMED" in red (`rgba(255, 30, 30)`) — same as current
2. **Subtitle:** "the universe won" in dim gray
3. **Stats:** time survived, wrecks looted, items lost (not "collected" — they're gone)
4. **Prompt:** → map select

### Variant: Universe Collapsed (all portals gone)

Same as consumption but:
- **Title:** "COLLAPSED"
- **Subtitle:** "no way out"
- Color: deep purple instead of red

---

## Data Model

The score screen reads from a `RunResult` object assembled at run end:

```javascript
{
  outcome: 'extracted' | 'consumed' | 'collapsed',
  timeElapsed: 342,              // seconds
  wrecksLooted: 2,
  items: [                       // collected loot
    { name: 'Quantum Lattice Fragment', value: 150, tier: 'uncommon' },
    // ...
  ],
  portalWave: 3,                 // which wave the extraction portal belonged to
  waveMultiplier: 2.0,
  totalScore: 2840,              // sum of item values × multiplier
  mapName: 'The Expanse',
}
```

Assembled in main.js at phase transition time. Persists until next run starts.

---

## Implementation Notes

- Renders on overlay canvas (2D context), same as current death/escape screens
- Text shadows for readability, no overlay veil (per feedback)
- Sequential fade-in via a `scoreAnimTimer` that increments each frame
- Score counting animation: lerp from 0 to final value over 0.5s
- After animation completes, show prompt. Space → map select.
- The current `deathTimer` / `escapeTimer` can drive the animation phases

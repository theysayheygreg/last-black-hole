# Ring Scale Across Map Sizes

> How accretion ring screen coverage should scale with WORLD_SCALE.
> Open design question from 2026-03-25 shader fixes.

## The Problem

CONFIG.wells.accretionRadius (0.023) is UV-space. getRenderShapes() multiplies by WORLD_SCALE to get world-space. Ring screen coverage grows linearly with map size because the camera shows a smaller fraction of the texture while rings get physically larger.

The 10x10 mega-well (mass 2.5) fills 48% of the screen. The 3x3 equivalent (mass 1.5) fills 9%.

## Current Coverage: Every Well on Every Map

### Shallows (3x3)

| Well | Mass | Screen % |
|------|------|----------|
| 0 | 1.5 | **8.6%** |
| 1 | 0.8 | 4.6% |
| 2 | 1.2 | 6.9% |
| 3 | 0.5 | 2.9% |

### Expanse (5x5)

| Well | Mass | Screen % |
|------|------|----------|
| 0 (central) | 2.0 | **19.2%** |
| 7 (outlier) | 1.5 | 14.4% |
| 2 | 1.2 | 11.5% |
| 1, 8 | 1.0 | 9.6% |
| 3, 6 | 0.8-0.9 | 7.7-8.6% |
| 5 | 0.7 | 6.7% |
| 4 | 0.6 | **5.8%** |

### Deep Field (10x10)

| Well | Mass | Screen % |
|------|------|----------|
| 0 (mega) | 2.5 | **47.9%** |
| 1 | 1.5 | 28.8% |
| 3 | 1.4 | 26.8% |
| 2 | 1.3 | 24.9% |
| 4 | 1.2 | 23.0% |
| 8, 12 | 1.0 | 19.2% |
| 5, 9 | 0.9 | 17.3% |
| 7, 11 | 0.8 | 15.3% |
| 6, 10 | 0.7 | 13.4% |
| 17, 18 | 0.6 | 11.5% |
| 14, 16, 19 | 0.5 | 9.6% |
| 13, 15 | 0.4 | **7.7%** |

## Options

### A: Current (linear scaling)

`accretionWorld = accretionUV × WORLD_SCALE`

| Map | Smallest | Largest |
|-----|----------|---------|
| 3x3 | 2.9% | 8.6% |
| 5x5 | 5.8% | 19.2% |
| 10x10 | 7.7% | **47.9%** |

Rings are physically larger on bigger maps. Simple. But the 10x10 mega-well overwhelms the screen, and the visual jump from 5x5 to 10x10 is jarring.

### B: World-space constant

`accretionWorld = accretionUV × FLUID_REF_SCALE` (always 3.0, regardless of map)

| Map | Smallest | Largest |
|-----|----------|---------|
| 3x3 | 2.9% | 8.6% |
| 5x5 | 3.5% | 11.5% |
| 10x10 | 2.3% | **14.4%** |

Consistent screen presence. But rings feel small on bigger maps — loses the "bigger universe, bigger drama" escalation.

### C: Sqrt scaling (recommended)

`accretionWorld = accretionUV × sqrt(WORLD_SCALE × FLUID_REF_SCALE)`

| Map | Smallest | Largest | Sqrt factor |
|-----|----------|---------|-------------|
| 3x3 | 2.9% | 8.6% | 1.0× |
| 5x5 | 3.7% | 11.1% | 1.29× |
| 10x10 | 5.3% | **15.8%** | 1.83× |

Rings grow, but sub-linearly. The 10x10 mega-well is 16% — dramatic without being overwhelming. Min/max ratio stays consistent at ~3x within each map.

### D: Per-map overrides

Each map sets `configOverrides.wells.accretionRadius`. Complete control but requires tuning 3+ values and documenting why each differs.

## Decision Matrix

| | Linear | Constant | Sqrt | Overrides |
|---|--------|----------|------|-----------|
| Simplicity | best | good | good | fair |
| Visual consistency | poor | best | good | varies |
| 10x10 legibility | poor | best | good | tunable |
| Sense of scale | best | poor | good | tunable |
| Implementation | 0 lines | 5 lines | 5 lines | 15 lines |

## Recommendation

**Option C (sqrt scaling).** One formula, no per-map tuning, rings grow at a controlled rate. The 10x10 mega-well reads as imposing at 16% without eating the screen. Implementation is 5 lines in coords.js + wells.js.

If sqrt feels too conservative after playtesting, we can always fall back to per-map overrides (D) for surgical adjustments.

## Implementation

```js
// coords.js
export function accretionScale() {
  return Math.sqrt(WORLD_SCALE * FLUID_REF_SCALE);
}

// wells.js getRenderShapes()
const accretionWorld = accretionUV * accretionScale();
```

Display shader unchanged — dist already uses worldScale correctly.

# HUD — In-Game Information Display

> enough to make decisions. not enough to feel safe.

---

## Design Intent

The HUD is minimal, atmospheric, and lives in DOM (not WebGL). It shows what the player needs to make decisions: how long they've been here, how many exits are left, and what they're carrying. It should feel like a ship's instrument panel in a universe that's falling apart.

v1 is deliberately sparse. More panels arrive with more systems (signal, hull). Start with the essentials and let the game world communicate everything else.

---

## Architecture

DOM elements overlaid on the canvas at z-index 10+. CSS-styled, no framework. Updated from the game loop via direct DOM manipulation.

```
┌────────────────────────────────────────────────────┐
│                                                    │
│  00:00              [GAME WORLD]        ◉ 2 exits  │
│                                                    │
│                                                    │
│                                                    │
│                                                    │
│                                                    │
│  ◈ 3 salvage                                       │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## v1 Elements

### Run Timer (top-left)
- Format: `mm:ss`
- Font: monospace, 16px, `rgba(150, 170, 200, 0.7)` — dim, not distracting
- Counts up from 00:00
- No explicit "deadline" shown — the universe clock is emergent, not displayed
- At 8:00+: color shifts toward amber. At 9:00+: red. Player learns what this means.

### Portal Count (top-right)
- Format: `◉ N exits` when portals are active, `no exits` when between waves (dim)
- Color: portal purple `rgba(180, 120, 255, 0.8)` when active, dim gray when none
- When portals are about to expire (last 15s): blinks
- When a new wave spawns: brief flash/pulse animation

### Salvage Count (bottom-left)
- Format: `◈ N salvage`
- Color: gold `rgba(212, 168, 67, 0.8)`
- Increments on wreck pickup with a brief scale-up pulse
- Shows count only, not item list (score screen shows details)

### Center Warnings (center, transient)
- Large text, fades in/out, color-coded
- v1 warnings:
  - `portal wave incoming` (purple, 5s before wave spawn)
  - `portal collapsing` (red, when a portal enters its last 15s)
  - `last exit` (red, pulsing, when final portal spawns)
  - `wreck salvaged` (gold, brief flash on pickup)

---

## Styling

### Font
- Monospace system font for v1 (no external font loading during jam)
- `font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace`
- Lowercase for all HUD text (matches title screen style)

### Color Palette
| Element | Color | Hex |
|---------|-------|-----|
| Timer (normal) | dim blue-gray | `rgba(150, 170, 200, 0.7)` |
| Timer (warning) | amber | `rgba(240, 144, 58, 0.9)` |
| Timer (critical) | red | `rgba(232, 25, 0, 0.9)` |
| Portal count | purple | `rgba(180, 120, 255, 0.8)` |
| Salvage count | gold | `rgba(212, 168, 67, 0.8)` |
| Center warnings | varies | green/orange/red/purple per type |

### Effects
- All text gets `text-shadow: 0 0 8px currentColor` for soft glow (matches title screen approach)
- No background panels or boxes — text floats over the game world
- Opacity kept low enough that HUD never competes with the fluid sim visually

---

## Center Warning System

Warnings appear center-screen, stack vertically if multiple, auto-dismiss.

```javascript
function showWarning(text, color, durationMs = 2500) {
  // Create DOM element, animate in, auto-remove after duration
}
```

### Animation
- Fade in: 0.3s opacity 0→1, slight scale 0.95→1.0
- Hold: duration
- Fade out: 0.5s opacity 1→0, slight scale 1.0→1.02
- If a new warning arrives while one is showing, old one slides up

---

## Update Flow

HUD updates happen in the game loop render phase (after sim, after overlay):

```javascript
// In gameLoop, after overlay rendering:
if (gamePhase === 'playing') {
  updateHUD(runElapsedTime, portalSystem, inventory);
}
```

HUD elements are created once in `init()`, shown/hidden based on game phase. Only visible during `playing` phase — hidden during title, map select, death, escape screens.

---

## Future Elements (not v1)

These arrive with their respective systems:

| Element | Position | System | When |
|---------|----------|--------|------|
| Signal meter | top-left (below timer) | Signal (L2) | Wednesday |
| Hull bar | bottom-left (above salvage) | Combat (L2) | Wednesday+ |
| Nearest portal direction | top-right (below count) | Portal waves | When useful |
| Minimap | bottom-right | Stretch goal | Maybe never |

---

## Implementation Notes

- **HTML:** add a `<div id="hud">` to the HTML file with child elements for each panel
- **CSS:** position fixed, pointer-events none, z-index 10
- **JS:** `src/hud.js` — `initHUD()`, `updateHUD()`, `showWarning()`, `hideHUD()`, `showHUD()`
- **No framework.** Direct DOM: `document.getElementById`, `textContent`, `style.color`
- HUD should be fully functional in ~100 lines of JS + ~50 lines of CSS

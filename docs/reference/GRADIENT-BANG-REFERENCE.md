# Gradient Bang Starfield Reference

> A React Three Fiber space visualization library (`~/clawd/projects/gradient-bang/client/starfield/`). Procedural galaxies, nebulae, dust, tunnels, terminal dither — and a visual register that sits very close to LBH's ASCII-over-fluid.
>
> This doc inventories what we can steal, adapt, and leave alone. Parallel in intent to RETURNAL-REFERENCE.md: observation + application, not a direct adoption plan.

---

## Why This Matters to LBH

The screenshot Greg shared shows a Bayer-dithered image with what looks like an accretion disk above a fragmentary dot-matrix scene below. Two things are doing the work:

1. A **procedural nebula/galaxy shader** producing the swirling streak field.
2. An **ordered 4×4 Bayer dither post-process** quantizing the whole output to binary pixels with halftone-like structure.

LBH does ASCII-over-fluid — character-based density mapping on top of a Navier-Stokes sim. That's its own visual identity. But LBH has one visual mode for everything, and gradient-bang demonstrates that a small library of post-effects (dither / scanline / sharpen / exposure / tint / terminal) can make a scene feel like it's being *read through an instrument*, not rendered to a screen. That is exactly the language LBH is reaching for.

---

## Architecture (1-paragraph summary)

React Three Fiber 3D scene library. Scene objects (`Ship`, `Planet`, `Galaxy`, `Nebula`, `Sun`, `Tunnel`, `Stars`, `VolumetricClouds`, `Dust`, `Fog`, `LensFlare`) live in `src/objects/`. Custom GLSL shaders in `src/shaders/`. Post-processing stack (via the `postprocessing` library) in `src/fx/`. Zustand stores coordinate state. Controllers (`Scene`, `Camera`, `GameObjects`, `Animation`, `PostProcessing`) orchestrate. Scene transitions debounce and queue. 8 color palettes in `colors.ts`, 4 performance profiles in `profiles.ts` (auto-detects GPU tier). The whole thing is a consumable library — it ships as an ES module the main client imports.

**We cannot import any of it directly.** LBH is vanilla JS + WebGL 2, no Three.js, no React, no `postprocessing` library. What we can steal is **shader source** (GLSL strings are portable), **visual concepts**, and **structural patterns** (render layers, palettes, post-processing pipeline).

---

## Shaders Worth Studying

### `DitherShader.ts` — ordered 4×4 Bayer dither
The thing that makes Greg's screenshot look like Greg's screenshot. Takes any input color, computes luminance, thresholds against a 4×4 Bayer matrix, produces pure binary output. Optional grayscale, optional invert, optional pixelation, DPR-aware grid. **~100 lines of GLSL.**

**What it gives LBH:** a second visual mode. Not a replacement for ASCII, a *different* mode for different contexts — title screen, loading screens, high-signal states, death linger, menu backgrounds. The Bayer dither has a very different texture from character-mapped dither: it's uniform and geometric where ASCII is organic and directional.

**How to adopt:** strip the Three.js `postprocessing` wrapper, keep the GLSL verbatim. Wire it as an optional full-screen pass that can be enabled per-context. Even simpler: run it AFTER the ASCII shader as a "hard quantize" pass when we want the image to read as printed rather than displayed.

### `NebulaShader.ts` — domain-warp volumetric nebula
Produces the swirling streak field. Uses an iterated domain-fold fractal (`fieldFunc`) plus FBM stars. Configurable via `iterPrimary`, `iterSecondary`, `domainScale`, `warpOffset`, `warpDecay`. Two color channels (`nebulaColorPrimary`, `nebulaColorSecondary`) plus a global tint. **~100 lines.**

**What it gives LBH:** a real visual for the void. Right now LBH's empty space is black. A low-opacity nebula layer behind the fluid sim would give the universe depth — *something was here before*. Tune it dark and sparse so the ASCII stays readable; this should feel like the ghost of a galaxy, not a cloud.

**How to adopt:** render to an offscreen buffer once at session start (cheap — it's static), sample into the fluid render's background. Or sample directly per-frame if we want it to drift.

### `MilkyWayShader.ts` — lightweight galactic band
Cheaper than the galaxy shader. Just a dot(axis) band + core + rotation + coverage + noise distortion. No FBM. **~150 lines.**

**What it gives LBH:** the "you are in a galaxy" framing without expensive fractal math. Could anchor a cosmic signature — heavy current signatures get a dense band behind them, thin space signatures get a faded one.

### `GalaxyShader.ts` — FBM galaxy baked to equirect texture
The full pipeline for rendering a spiral galaxy as a skybox. Baked once to a 2D texture, then sampled. **~200 lines.**

**What it gives LBH:** a pre-baked background texture for deep maps. Probably overkill for us — our void is supposed to feel empty. Worth knowing exists.

### `TunnelShader.ts` — radial streaks (hyperspace)
Center-hole-to-edge streak field with rotation and depth pixelation. Pre-baked noise texture for streaks. **~100 lines.**

**What it gives LBH:** an alternate transition visual. LBH's current "dimensional tear" is an ASCII-corruption hold. A tunnel flash could be the visual for specific events: final portal opening, Inhibitor vessel arrival, the moment a pilot dies to a well and is spaghettified. Not replacing the tear — adding a peer to it.

---

## Post-Processing Effects (the Real Gold)

### `ScanlineEffect.ts` — CRT scanlines
Classic `sin(uv.y * resolution.y * frequency) * intensity + ...`. **~90 lines.**

**What it gives LBH:** our DESIGN-SYSTEM.md §8 specifies scanlines but we don't have a per-context scanline shader yet. Greg's PILLARS.md pillar #4 "Universe Is the Clock" wants visible environmental pressure — scanlines intensifying as the universe approaches collapse is a direct read of that pillar. This is a 30-line shader and a drawcall.

### `SharpenEffect.ts` — edge sharpening
Post-fluid sharpen. **~70 lines.**

**What it gives LBH:** our ASCII shader produces soft-edged characters. A light sharpening pass after could make the characters feel more "printed" and less "painted." Worth a 10-minute experiment.

### `TerminalEffect.ts` — character-substitution (alternative ASCII)
Different approach from LBH's ASCII shader. Instead of a glyph atlas with density mapping, it generates character patterns procedurally (`█▓▒░.:;`) from luminance thresholds. **~100 lines.**

**What it gives LBH:** not a replacement — a reference implementation. Their approach is CRUDER than ours. LBH's directional-ASCII-with-glyph-atlas is better for gameplay legibility. But their approach is good for backgrounds or UI layers where we want "this is text" vibes without needing character direction.

### `ExposureEffect.ts` — exposure ramping
Global luminance ramp, animatable.

**What it gives LBH:** the death linger I shipped uses an overlay-alpha ramp. Exposure ramping is more physical — the world dims from *the inside*, not from a black layer dropped on top. Would feel more like the pilot's visor failing. Direct upgrade for the linger phase.

### `LayerDimEffect.ts` — per-layer selective dimming
Dim specific render layers independently.

**What it gives LBH:** depends on us having render layers. Which we should (see next section).

### `TintEffect.ts` — global color tint
Multiplicative color grade. Signature-driven tint is a direct fit for cosmic signatures — "heavy current" tints teal, "signal storm" tints magenta, "dark run" tints deep blue.

---

## Structural Patterns Worth Adopting

### Render layers
Gradient-bang defines: `DEFAULT`, `SKYBOX`, `BACKGROUND`, `FOREGROUND`, `GAMEOBJECTS`, `OVERLAY`.

LBH implicitly has all these but doesn't formalize them. Formalizing would let us:
- Dim the overlay without dimming the world (signal spike UI, without losing the world)
- Dim the world without dimming the overlay (death linger, keeping the HUD fading separately)
- Apply post-effects per-layer (scanlines on overlay only)

**Cost:** low — it's a convention, not a refactor.

### Color palettes as data
8 palettes, each with `c1 / c2 / tint / base / saturation / contrast`. Loaded by name.

**What it gives LBH:** our cosmic signatures are currently coefficient bundles. They should also be palette bundles. Heavy current = cyan-gold. Dead calm = deep-blue-grey. Signal storm = magenta-hot. Dark run = bone-black. A 4-palette system tied to signatures would make each run feel visually distinct without any gameplay change.

### Performance profiles
`low` / `mid` / `high` / `extreme`, auto-detected via GPU tier.

**What it gives LBH:** we don't currently scale visual fidelity. This is out of scope for LBH right now — the fluid sim is the expensive thing and that's already tuned — but worth noting for the Deck/mobile port conversation.

### Post-processing pipeline as composable stack
`PostProcessingManager` singleton that chains effects in a defined order. Adding a new effect is adding an entry to the stack.

**What it gives LBH:** right now our shader chain is hand-wired in main render. A composable effect stack would let us:
- Toggle scanlines per context
- Apply dither selectively
- Add signature-driven tints without touching core render code

**Cost:** medium — it's a small rewrite of the render path, not a reimagining.

---

## The Dust / Fog / Stars Objects

### Stars
6000-point particle cloud. Spherical distribution. Configurable size, opacity range, fade, blend mode. Background layer.

**LBH application:** the void is currently empty. A subtle 2D star layer behind the fluid — not directional, just far-distant points — would add depth. Extremely cheap to render.

### Dust
Ambient particle field — closer, moving particles that give motion parallax.

**LBH application:** low-priority, but a small drift of dust motes with the current would sell the "you are inside a fluid" idea harder. Would need to be on its own layer so the ASCII shader doesn't mangle it.

### VolumetricClouds / Fog / LensFlare
Specific to 3D scenes. Skip.

---

## The 8 Color Palettes (specific recommendations)

| Gradient Bang | LBH Cosmic Signature Mapping |
|---|---|
| `celestialBlue` | baseline / title screen / no signature |
| `deepSpace` | "dark run" — sensorRange 0.6× |
| `nebulaDust` | "signal storm" — everyone is loud |
| `cosmicTeal` | "heavy current" — teal + gold |
| `stellarGold` | extraction successful (title flash) |
| `voidblack` | "dead calm" — coupling 0.5× |
| (their pale rose) | could work for "thin space" |
| (their deep wine) | could work for "deep gravity" |

Exact hex values in `client/starfield/src/colors.ts`. Each palette has `c1 / c2 / tint / base / saturation / contrast` — applies cleanly to our tint effect + hud accent colors.

---

## Four Things to Actually Do

If you want me to ship any of this, here's the sequenced queue. Each is testable standalone.

### 1. Bayer dither as a second visual mode (small, high impact)
Port DitherShader to LBH. Apply it to specific surfaces first, not the whole game:
- Title screen background
- Loading screen while waiting for first snapshot
- Map-select background
- Home screen (home tab only)

**Not on the gameplay scene** in v1. That stays ASCII. This is about making menus feel like printed terminal outputs while the world feels like ASCII dust. Two different modes, two different registers.

**Effort:** ~3 hours. Port the GLSL, wire a full-screen quad, toggle per context.

### 2. Static nebula background layer (small, medium impact)
Port NebulaShader, render once to an offscreen buffer at session start, blend under the fluid sim at low opacity (0.15?). Now the void has depth. Tune for "ghost of a galaxy" not "pretty space wallpaper."

**Effort:** ~4 hours. Port shader, bake to texture, composite under existing render.

### 3. Signature-driven color palettes (medium effort, high feel)
Extend cosmic signatures with palette data (c1, c2, tint). Apply via a TintEffect-style shader pass. Players see the visual world change when the signature changes.

**Effort:** ~6 hours. Define 6 palettes (one per signature), write tint pass, wire signature → palette, test across all signatures.

### 4. Render-layer formalization (medium effort, foundation)
Introduce SKYBOX / BACKGROUND / FOREGROUND / GAMEOBJECTS / OVERLAY. Don't rewrite anything — label existing render calls. Then build #1, #2, #3 on top of the layer system.

**Effort:** ~2 hours. It's a convention + a small ordering helper.

**Recommended sequence:** 4 → 2 → 1 → 3. Layers first (cheap, unlocks the others), nebula second (easiest atmospheric win), dither third (the Greg-screenshot steal), palettes fourth (biggest ongoing payoff).

---

## What We Do NOT Steal

- **React Three Fiber / Three.js.** Wrong framework, wrong dependencies, would unravel the fluid-sim-first architecture.
- **`postprocessing` library.** We'd port the effects directly, not pull a library.
- **The 3D scene graph.** LBH is 2D top-down. Their camera + scene-transition framework doesn't apply.
- **Leva dev controls.** We have our own dev panel.
- **Zustand state management.** Event-driven is working.
- **The galaxy/planet/sun objects.** Those are for a different game.

What we want from gradient-bang is the **shader bag** and the **pipeline pattern** — not the engine.

---

## See Also

- `DESIGN-SYSTEM.md` §8 Animation & Juice — already specifies scanlines + dither philosophy; this doc offers concrete shaders
- `SIGNATURES.md` — cosmic signatures, the natural home for palette-per-signature
- `RETURNAL-REFERENCE.md` — parallel prior-art doc for narrative + UI tone
- `docs/design/PILLARS.md` §1 "Art Is Product" — the mandate that makes this research matter

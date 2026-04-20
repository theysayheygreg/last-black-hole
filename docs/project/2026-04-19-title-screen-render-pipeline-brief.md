# Title Screen Render Pipeline Prototype — Implementation Brief

> Intended consumer: Codex. Companion to `docs/reference/GRADIENT-BANG-ANALYSIS.md` (architectural tradeoffs) and `docs/reference/GRADIENT-BANG-REFERENCE.md` (shader inventory).
>
> Greg directed: we are past the jam/prototype stage. Real render pipeline is the win. Title screen is the first surface to build it on. Iterate until clear, then expand to other scenes.

---

## Decisions (committed)

1. **Architecture: Option 4 (hybrid).** Fluid sim stays in hand-rolled WebGL 2, unchanged. Everything else — scene composition, ASCII post-pass, background layers, post-processing chain — lives in a scene graph.
2. **Scene graph library: plain Three.js.** Imperative, not declarative. No React, no R3F. Matches LBH's existing code style (imperative WebGL setup in `main.js`). Avoids introducing React as a paradigm boundary.
3. **Language: JavaScript.** No TypeScript for the rendering subsystem. TS would be an ergonomic win but the ambient LBH code is JS, and Greg's "may not keep this in web code forever" framing means the migration target will be Rust/Godot/Unity, not TS. Don't invest in a type layer that gets thrown out.
4. **Build tool: Vite.** Standard, fast, supports ES modules + bundling + dev server. `npm install && npm run build` as the onboarding path for anyone cloning from GitHub.
5. **Migration strategy: two code paths.** The existing fluid → ASCII render path stays intact and continues rendering gameplay. The new Three.js pipeline starts with the title screen and only the title screen. Per-scene switchover, not a flag day.
6. **Shader portability invariant.** All GLSL sources are kept as plain string exports (not embedded in library-specific material types). This preserves the ability to lift shaders out of Three.js for a native port.

---

## What We're Building

A replacement for the current title screen (`loadScene(MAP_TITLE)` path in `src/main.js`), rendered through a Three.js pipeline. Scope:

1. The existing fluid simulation module continues to run, but renders to an offscreen WebGL texture instead of directly to the canvas.
2. A Three.js scene samples that texture on a full-screen quad ("world layer").
3. Behind the world layer, a static nebula background ported from `gradient-bang/client/starfield/src/shaders/NebulaShader.ts` renders as a skybox.
4. The existing ASCII shader becomes a `ShaderPass` in Three.js's `EffectComposer`, applied to the composited scene.
5. A post-processing chain runs after ASCII: `ExposurePass` (uniform-driven global luminance) and `TintPass` (uniform-driven color grade).
6. Title text ("LAST SINGULARITY") is rendered as DOM overlay on top of the Three.js canvas, transitioning in via CSS. Existing menu UI (profile select, map select) remains DOM and continues to work.

What this does NOT include:
- Gameplay scenes (map, playing, paused, dead, escaped) — all stay on the existing render path.
- Migration of the HUD or results screen.
- New scene transitions for enter/leave title.
- Touching sim-runtime, control-plane, or any server code.

---

## Scene Graph Structure

Target composition, in draw order from back to front:

```
Layer 0: SKYBOX
  - Static nebula sphere (or large quad at infinity)
  - Uses NebulaShader (ported from gradient-bang)
  - Rendered once, result cached to an offscreen texture
  - Sampled each frame by the skybox material

Layer 1: WORLD
  - Full-screen quad
  - Samples the fluid sim's output texture (updated each frame)
  - No other material, no camera movement

Post-pass 1: ASCII
  - Existing ASCII shader wrapped as a Three.js ShaderPass
  - Takes the composited Layer 0 + Layer 1 as input
  - Applies character mapping, density quantization, velocity readout
  - Output is the "world as ASCII"

Post-pass 2: EXPOSURE
  - Single uniform: u_exposure (0.0 to 1.0)
  - Multiplies fragment color by u_exposure
  - Drives the global luminance — useful for title entry fade-in,
    future death-screen linger, loading fluid dim

Post-pass 3: TINT
  - Uniform: u_tintColor (vec3), u_tintStrength (float)
  - Mixes scene color with tint color by strength
  - Drives signature palettes, inhibitor color warp, extraction gold flash

Final output: rendered to the main canvas element
DOM overlay: title text, menu, CSS transitions
```

This composition is the template. Future scenes (map select, gameplay, results) will add/remove layers and passes, but the pattern is fixed.

---

## Fluid Sim Integration

The fluid sim currently renders to the canvas's default framebuffer. That needs to change to render to a WebGL texture so Three.js can sample it.

The cleanest way:
1. The existing `fluid.render(...)` call continues to take a render target, but the target becomes an offscreen `WebGLRenderTarget` owned by the new scene module instead of the default framebuffer.
2. The fluid sim's output texture is wrapped as a `THREE.Texture` and used as the material map on the world-layer quad.
3. On each frame, the render sequence is: fluid step → fluid output to offscreen RT → Three.js scene render (which samples the RT) → post-pass chain → to canvas.

The fluid sim module is a black box from Three.js's perspective. No fluid sim code changes. The "render target" parameter is the only contact point.

**Validation check before building the full scene:** confirm the fluid sim's output texture is compatible with Three.js `THREE.Texture` wrapping. WebGL 2 textures from an existing context generally are, but DPR, color space, and format (RGBA8 vs RGBA16F) need to match. If there's a conflict, resolve it before proceeding.

---

## Directory Layout

```
src/
  render/                     # NEW — the scene graph + post-processing code
    index.js                  # Public API: init(), renderTitle(), dispose()
    title-scene.js            # Title scene assembly (skybox + world quad + passes)
    passes/
      ascii-pass.js           # ASCII shader wrapped as ShaderPass
      exposure-pass.js        # Exposure ShaderPass
      tint-pass.js            # Tint ShaderPass
    layers/
      nebula-layer.js         # Nebula sphere with gradient-bang shader port
      world-layer.js          # Full-screen quad sampling fluid texture
    shaders/
      nebula.glsl.js          # Nebula fragment shader (ported from gradient-bang)
      ascii.glsl.js           # Existing ASCII shader, relocated from src/ascii-renderer.js
      exposure.glsl.js
      tint.glsl.js
  main.js                     # UNCHANGED for now; calls render/ from loadScene(MAP_TITLE)
  fluid.js                    # UNCHANGED — now renders to an offscreen target when title is active
  ...existing structure...
```

Rationale for `src/render/` as a separate namespace: it's the new rendering subsystem. Keeping it namespaced means the existing code paths continue working and the new ones don't leak into old files. When we migrate additional scenes later, each gets its own module in `src/render/` and `main.js`'s `loadScene()` dispatches to the right one.

---

## Build Tooling

Add Vite. The `index-a.html` currently loads `src/main.js` as a bare ES module. After Vite:
- `npm run dev` — dev server with HMR, similar performance to current raw ES modules
- `npm run build` — production bundle to `dist/`
- Existing `scripts/stack.js` and `scripts/dev-server.js` continue to work — the `static-server.js` can serve from `dist/` for packaged builds or from `src/` during development

This is a mechanical change to the build pipeline. The existing dev flow (`npm start` → open browser) should be identical from the user's perspective.

The Electron desktop build already has a build step. Adding Vite to the browser side aligns the two paths.

---

## Acceptance Criteria

The prototype is complete when all of the following are true:

1. **Visual parity.** The title screen looks at least as good as the current title screen. Same ASCII feel, same fluid motion, same readable character density.
2. **Nebula visible.** A subtle nebula layer (around 10-20% effective opacity after ASCII quantization) is visible behind the fluid when the title screen is active. Tuning is per Greg's taste; start at ~15% and iterate.
3. **Exposure control works.** A test invocation that ramps `u_exposure` from 0.0 to 1.0 over 1 second produces a visible fade-in. Demonstrates the hook is real and can be driven by gamePhase transitions.
4. **Tint control works.** A test invocation that sets `u_tintColor = rgb(204, 26, 128)` at `u_tintStrength = 0.4` produces a visible magenta grade. Demonstrates the signature-palette hook.
5. **Frame rate.** 60fps sustained on an integrated GPU. Measure via the existing FPS overlay.
6. **Gameplay unchanged.** `npm start`, click into a cycle, play to death or extract. No regression. Gameplay rendering still uses the old path.
7. **Clean code separation.** All new code lives in `src/render/`. `main.js` has a single `renderTitle()` entry point for the title scene.
8. **Build works from source.** `git clone && cd last-black-hole && npm install && npm start` produces a working title screen with nebula visible. Cross-platform (macOS, Linux, Windows).

---

## What Greg Reviews After Implementation

Once the prototype lands, Greg iterates on the visual target. The infrastructure is fixed at that point; the work becomes:

- Nebula color / density / scale tuning
- Exposure envelope timing
- Tint strength for the title screen ambient
- Skybox positioning (fixed vs slowly rotating)
- Title text appearance / dissolution

These are shader uniform tweaks and timing curves, not code changes. The dev cycle is: edit numbers, see result, commit.

---

## Portability Notes (for future native port)

Decisions made now that keep the native-port door open:

- **GLSL sources are plain string exports.** `src/render/shaders/nebula.glsl.js` is `export default "uniform float intensity; ..."`, not embedded in `new THREE.ShaderMaterial({ ... })`. A native port can lift the strings, wrap them in Vulkan/GL pipelines, and reuse them.
- **Scene assembly is imperative.** `title-scene.js` is a function that creates a scene, adds meshes, and returns a render callback. Straightforward to port to any engine's scene API.
- **No framework-specific abstractions when plain ones work.** Avoid Three.js addons that don't have native analogs (e.g. heavy use of `postprocessing`-library-specific features). Use `EffectComposer` + plain `ShaderPass` which translates to "render target + fragment shader" in any engine.
- **Fluid sim is isolated.** Already portable because it's plain WebGL 2 GLSL. The integration point is a texture, which is a universal concept.

---

## Out of Scope

- **R3F / React.** Not for any rendering subsystem in LBH.
- **TypeScript.** Not for this subsystem.
- **`postprocessing` library.** We use Three.js's built-in `EffectComposer` + `ShaderPass` only, because they have the clearest mapping to a future native port's render-pass concept.
- **Scene graph migration for non-title scenes.** Each additional scene is a separate brief once the title prototype is validated.
- **Build a renderer selection UI ("use new renderer / use old renderer").** Not needed. Title uses new, rest uses old, no toggle.
- **Performance tuning below 60fps target.** If the prototype drops below 60fps, fix the cause; don't add a fidelity toggle.

---

## Taste Target (confirmed via gradient-bang.com reference)

Greg's direction: a mix of "swirling centerpiece" and "staged moments." Live observation of gradient-bang.com provides the template.

### Gradient-bang's title pattern (for reference)

Captured 4 frames over ~15 seconds of idle:
- Pure black void baseline (#000)
- Procedural galactic accretion band drifts diagonally across the screen, continuously, slowly. Rotates subtly over time.
- Bayer 4×4 dither post-pass quantizes the whole scene to pure binary white/black pixels (visible threshold matrix when zoomed).
- Faint horizontal scanlines layered on top as a second post-effect.
- Title text ("GRADIENT BANG") rendered AS PART OF THE SCENE — dither and scanlines pass through it. Not a DOM overlay.
- Terminal-style blinking cursor "_" after the title.
- Menu card uses terminal-frame styling (corner brackets, no rounded corners). Inverted primary CTA, outlined secondary.
- No camera moves, no zooms, no cuts. Fixed frame, living content.

**The lesson:** static cinematography + continuously-living motion. The idle state IS the motion. There is no cinematic intro that resolves to an idle.

### LBH's title target (divergent where it should)

Same template, different subject matter:
- **Gradient-bang composition:** "you are looking across a galaxy" — band stretching edge-to-edge.
- **LBH composition:** "you are looking at a dying star close enough to kiss it" — a single well at screen center, visible accretion disk, fluid sim doing its work around it.

Specifically:
- A well (gravity + accretion disk) anchored at screen center or slightly off-center
- Fluid sim running around it — currents, swirls, velocity reading through the ASCII pass
- Nebula layer *behind* everything at low intensity (depth without drawing attention)
- Bayer dither optional for title screen — ASCII is already our primary quantizer, a layered Bayer post-pass might double-quantize badly. Test both; pick one.
- Scanlines: subtle, per DESIGN-SYSTEM.md §8
- Title text "LAST SINGULARITY" rendered as DOM overlay BUT positioned so the fluid+ASCII shows through around the letters (not a solid backing — transparent letters with glow)
- Terminal-style blinking cursor after the title (free win, do it)
- Menu card styled per existing DESIGN-SYSTEM.md §4 (terminal-frame brackets, already in use)
- Staged moments: initial entry (0-2s), settled idle (2s+), hover-response on menu items (ambient tint shift — see below)

### Hover-response / ambient pulse (observed, needs confirmation)

Between frames 3 and 4 of the gradient-bang capture, the "BE THE FIRST IN THE UNIVERSE" header shifted from white to warm-orange tint. Either a hover state or a slow ambient pulse. Worth copying either way — LBH's menu card could have a faint accretion-gold tint cycle in idle, brightening on hover.

### Success-criteria update

In addition to the 8 criteria from the earlier section, the title screen must:
9. Feel alive — returning to the title after a cycle should not feel like looking at a freeze-frame. The fluid/nebula should be drifting.
10. Read as "the game's subject matter in the title art" — a visible well/black hole as centerpiece, not a generic space background.
11. Terminal-style cursor blink on the title text.
12. Infrastructure permits layered post-passes so the Bayer vs ASCII question can be resolved experimentally.

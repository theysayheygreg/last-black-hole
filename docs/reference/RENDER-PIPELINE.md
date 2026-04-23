# Render Pipeline

`Last Singularity` runs a lightweight multi-pass render pipeline on vanilla
WebGL 2 — no Three.js, no framework, no build step. This doc is the contract
for adding and sequencing render passes without reading the whole codebase.

The rule is simple:

- one Composer per scene (owns ping-pong FBOs and the pass chain)
- each effect is a Pass subclass with a two-method contract
- new effects slot into the chain with one `composer.add()` line
- the fluid sim's internal physics passes are out of scope — this is only
  the display chain that runs after `fluid.step()`

## Files

```
src/render/
├── composer.js                 # Composer + Pass base + shared quad VAO / vertex shader
├── passes/
│   ├── fluid-display-pass.js   # wraps FluidSim.render() — writes analytic scene color
│   ├── bloom-pass.js           # bright-pass + separable gaussian + additive composite
│   └── ascii-pass.js           # FRAG_ASCII quantization; terminal (renders to screen)
└── shaders/
    └── ascii.glsl.js           # shared FRAG_ASCII source + font atlas generator
```

## Current chains

All current visual lanes use the same Composer contract. Production now defaults
to the rich chain; the minimal chain is an explicit perf baseline.

| Surface                   | Chain                                                  |
|---------------------------|--------------------------------------------------------|
| Main game default (`src/main.js`) | `FluidDisplayPass → BloomPass → TonemapPass → ColorGradePass → VignettePass → ASCIIPass → ChromaticAberrationPass → ScanlinesPass` |
| Main game `?minimalrender=1`      | `FluidDisplayPass → TonemapPass → ASCIIPass` |
| Title prototype                   | focused Composer/Bloom visual probe |

Production Bloom is now live but intentionally lower intensity than the title
prototype. Use `?minimalrender=1` and `?disable=bloom,color-grade,vignette,chromatic-aberration,scanlines`
when isolating perf or readability regressions.

## The Composer contract

```js
const composer = new Composer(gl);
composer.add(new FluidDisplayPass(fluid));
composer.add(new BloomPass(gl, { threshold: 0.5, strength: 1.2 }));
composer.add(new ASCIIPass(gl));

// Per frame, after fluid.step():
composer.render({
  fluidDisplay: { wellUVs, wellMasses, wellShapes, camFU, camFV, worldScale, totalTime, inhibitorData },
  ascii:        { velocityTex, cellSize, contrast, shimmer, /* ... */ },
});
```

The Composer owns two ping-pong RGBA8 FBOs at canvas resolution. Between
passes it alternates which FBO is target and which is input, so the second
pass reads what the first just wrote. The **terminal pass** (last in chain,
`rendersToScreen = true`) writes to the default framebuffer.

The caller provides a single `frameContext` object with a namespace per
pass. Passes pick out their own namespace; they never reach into each
other's data.

## The Pass contract

```js
import { Pass } from '../composer.js';

export class MyPass extends Pass {
  constructor(gl, opts = {}) {
    super({ name: 'my-pass', rendersToScreen: false });
    // ... store options; defer GL-program creation until render() so
    //     the composer's shared vertex-shader compiler can be used.
  }

  resize(w, h) {
    // Recreate any owned render targets at the new canvas size. Optional.
  }

  render({ gl, prevOutputTex, targetFBO, frameContext, composer }) {
    // Composer has already bound targetFBO (or default framebuffer for
    // terminal passes) and set the viewport. A simple pass just:
    //   1. useProgram(this.program)
    //   2. bind textures (prevOutputTex + any external textures from frameContext)
    //   3. set uniforms
    //   4. composer.drawQuad()
  }
}
```

- `prevOutputTex` is the texture the previous pass wrote. `null` for the
  first pass in the chain (first passes have no scene input to read).
- `targetFBO` is `{ fbo, tex, w, h }` for off-screen passes, `null` for
  terminal passes (composer has already bound FBO 0).
- Use `composer.compileProgram(fragSrc, label)` to build shader programs
  that work against the shared fullscreen-quad vertex shader. Returns
  `{ program, uniforms }` where `uniforms` is a name → location map with
  array support.
- Use `composer.drawQuad()` for the fullscreen quad draw call.
- Passes that need their own scratch FBOs (e.g. BloomPass for blur)
  create and manage them internally in `resize()`.

## How to add a new pass

Example: a vignette pass (darken corners).

1. Create `src/render/passes/vignette-pass.js`:
   ```js
   import { Pass } from '../composer.js';

   const FRAG = `#version 300 es
   precision highp float;
   uniform sampler2D u_input;
   uniform float u_strength;
   in vec2 v_uv;
   out vec4 fragColor;
   void main() {
     vec2 p = v_uv - 0.5;
     float v = 1.0 - dot(p, p) * u_strength;
     fragColor = vec4(texture(u_input, v_uv).rgb * v, 1.0);
   }`;

   export class VignettePass extends Pass {
     constructor({ strength = 1.2 } = {}) {
       super({ name: 'vignette', rendersToScreen: false });
       this.strength = strength;
       this.prog = null;
     }
     render({ gl, prevOutputTex, composer }) {
       if (!this.prog) this.prog = composer.compileProgram(FRAG, 'vignette');
       gl.useProgram(this.prog.program);
       gl.activeTexture(gl.TEXTURE0);
       gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
       gl.uniform1i(this.prog.uniforms.u_input, 0);
       gl.uniform1f(this.prog.uniforms.u_strength, this.strength);
       composer.drawQuad();
     }
   }
   ```

2. Slot it into a chain. In `title-prototype.js` or `main.js`:
   ```js
   composer.add(fluidDisplayPass);
   composer.add(new VignettePass({ strength: 1.5 }));  // NEW
   composer.add(asciiPass);
   ```

That's the whole workflow. No GL plumbing, no manual FBO management, no
vertex-shader boilerplate.

## Terminal-pass rules

Exactly one pass in the chain has `rendersToScreen: true`, and it must be
the last pass. The composer binds the default framebuffer and the canvas
viewport before that pass's `render()`.

`ASCIIPass` is the current terminal pass on both surfaces. If you want a
new effect *after* ASCII (post-glyph grading, CRT scanlines, a final
compositor), you have two options:

1. **Demote ASCII**: set `asciiPass.rendersToScreen = false`, make your
   new pass the terminal. ASCII's output then flows into your pass.
2. **Add a PresentPass**: a trivial passthrough that's terminal and just
   copies `prevOutputTex` to screen. Every non-terminal pass then gets
   its normal treatment. Cleaner but adds one extra FBO copy per frame.

## Live-mutable tunables

Pass options are stored as plain properties. Mutate them at runtime:

```js
bloomPass.threshold = 0.7;
bloomPass.strength = 0.8;
```

This is how the dev panel / test API should bind to passes. Don't invent
a `setThreshold()` method — just let the property be the interface.

## View mode (dev / test API)

`ASCIIPass.setViewMode('scene' | 'ascii')` toggles between the ASCII
quantization and a raw passthrough of the scene color. Used by
`__TEST_API.setRendererView` for debugging the pre-ASCII scene.

## Open questions

### Bloom in production

Currently title-only. The decision — production, title-only, or
config-gated — is blocked on perf profiling of 5×5 and 10×10 maps where
entity count, well count, and competing post-effects (chromatic
aberration, grade, scanlines) will stress the budget. When that perf pass
happens, the answer is one of:

- **Title-only** (current): bloom only on the title-prototype chain
- **Production-on**: move bloom into `src/main.js`'s chain
- **Config-gated**: a `CONFIG.render.bloom = true/false` flag, composer
  conditionally adds the pass at init

Recommendation default until that pass: stay title-only. Revisit after
5×5 / 10×10 perf work.

### HDR upgrade (RGBA16F ping-pong)

Composer currently uses RGBA8 ping-pong FBOs. That means the fluid
display shader's output clamps at 1.0 — so BloomPass's `threshold`
parameter is a heuristic against clamped tonemapped output rather than
actual HDR values.

If we want threshold-based bloom that *only* catches real highlights
(hot accretion band, not fabric noise), the path is:

1. Switch Composer's ping-pong FBOs to `RGBA16F` (requires
   `EXT_color_buffer_float` — already loaded for the fluid sim).
2. Let the fluid display shader emit values > 1.0 on the hottest pixels
   (accretion rim, event horizon glow).
3. Raise bloom threshold above 1.0 so only HDR-bright pixels bloom.
4. Add a final tonemap pass (ACES, Reinhard, Uncharted 2) before
   ASCIIPass quantizes to glyph density.

This is a meaningful change — touches Composer, FluidDisplayPass, adds
a TonemapPass — so it's deferred until we're adding more effects where
HDR would actually pay off. Single pass of bloom on RGBA8 is fine.

## Performance notes

- Each pass is one or more fullscreen fragment-shader draws. Budget
  roughly 0.1–0.3ms per simple pass at 1920×1080 on integrated GPUs.
- BloomPass downsamples blur to half-res by default (`scale: 0.5`) —
  4× cheaper than full-res blur. Lower to 0.25 if bloom becomes a
  bottleneck.
- Composer's ping-pong FBOs are RGBA8 at canvas resolution. Resize is
  cheap (just `texImage2D`).
- FluidSim's internal physics passes (curl, advect, pressure solve ×30,
  gradient subtract) dominate the GPU budget. The display chain is
  comparatively cheap.

## Test harness

```
npm run test:title-prototype   # headless puppeteer probe of the title chain
```

The probe hits `title-prototype.html?probe=1`, which flips
`preserveDrawingBuffer: true` so `readPixels` returns real sampled
values instead of zeros after canvas swap. Without the `?probe=1`
flag, `preserveDrawingBuffer` is `false` (faster) and readback is
unreliable.

Screenshot output lands in `tests/screenshots/`.

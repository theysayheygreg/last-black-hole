# Switch 1 / Atmosphere Feasibility

Status: research spike. This is not a current shipping target.

## Plain Answer

Switch 1 is feasible as a future port target, not as a direct build target for
the current LBH app.

The current runtime assumes:

- Electron/Chromium for the app shell;
- Three.js/WebGL2 for rendering;
- Node processes for the control plane and authoritative sim;
- browser DOM surfaces for HUD, debug, and status overlays.

That stack maps well to desktop, Steam Deck, web, itch, and early Steam builds.
It does not map cleanly to Nintendo Switch 1 homebrew or to the official Switch
SDK environment.

## Recommendation

Do not try to make the current Electron package run on Switch 1.

Use Switch 1 as a later "Run It Twice" probe after the platform contract is
portable:

1. Freeze an engine-neutral snapshot, input, content, save, and golden-sim
   contract.
2. Build a tiny recorded-snapshot renderer probe.
3. Compare a JavaScript/WebGL-like homebrew lane against a native C/C++ lane.
4. Move any serious commercial work through the official Nintendo developer
   route.

Atmosphere can be useful for private R&D on owned lab hardware. It should not
be treated as a public release path, a store path, or a substitute for Nintendo
developer access.

## What The Homebrew Lane Can Teach Us

The homebrew ecosystem gives enough surface area to answer early technical
questions:

- Can the ASCII field remain readable at 720p handheld scale?
- Can a Switch 1-class Tegra hit 60fps with LBH's field density and post stack?
- Can controller input feel sharp enough without Steam Input or browser APIs?
- Can the renderer consume LBH snapshots without reimplementing the game?
- Does the sim/renderer split survive on a console-shaped runtime?

Good research lanes:

- **devkitPro/libnx C/C++:** the realistic native baseline for Switch 1
  homebrew. This is the route to a small `.nro` renderer probe.
- **SDL2 or OpenGL-style samples:** useful for first window/input/texture tests
  before investing in a bespoke renderer.
- **deko3d:** the deeper native GPU lane if the simple graphics layer becomes
  the bottleneck.
- **nx.js:** worth one spike because it advertises JavaScript, WebGL2, WASM,
  audio, and input surfaces on Switch homebrew. It is still not Electron, Node,
  or a browser DOM.

Bad first lanes:

- porting Electron;
- porting the Node authority stack as separate local console processes;
- rewriting the whole game in C++ before the snapshot contract exists;
- using Godot as a shortcut before the sim/content contract is portable.

## Official Nintendo Route

For anything commercial, public, or eShop-bound, the correct path is Nintendo's
developer program, platform access request, NDA-backed SDK, dev hardware, and
official middleware/native tooling.

This matters because public Godot and web export templates do not legally ship
console SDK support. Godot console support exists through licensed/private
templates and porting partners, not through normal public exports.

## Sim / Renderer Split

The current desktop shape intentionally owns sim and renderer as separate
processes. That remains correct for PC/web/Steam Deck.

For Switch 1, assume a different shape:

- **First probe:** no local authority. Replay recorded authoritative snapshots
  from a file or baked asset bundle.
- **Second probe:** remote renderer client talking to a PC/Mac authority over a
  simple local-network protocol, only if networking is worth testing.
- **Third probe:** embedded or ported sim core only after golden vectors can
  prove movement, slingshot, signal, inventory, extraction, and death parity.

The console build should not become a second game. If a Switch client computes
gameplay truth locally, it must do so from shared contracts and fixtures, not
from a hand-copied reinterpretation of the current JavaScript runtime.

## Rendering Implications

LBH's Three scene concepts can survive, but the implementation changes:

- no Electron window;
- no browser DOM HUD;
- no desktop wrapper lifecycle;
- no direct reuse of the current multi-process Node authority stack;
- likely no direct Three.js scene graph unless nx.js proves strong enough;
- a native renderer would need its own mesh/text/field/post pipeline.

The aesthetic target should stay continuous:

- top-down camera;
- flat-playfield readability;
- ASCII/dither field as product identity;
- subtle parallax and screen-space motion cues;
- controller-first UI scale at handheld distance.

Switch 1 should bias toward:

- 720p handheld first;
- dynamic internal field resolution;
- larger ASCII cells than desktop when necessary;
- pooled geometry and fixed-size buffers;
- minimal post passes until frame pacing is proven;
- HUD rendered as game UI, not DOM.

## Proof-Of-Concept Plan

### 0. No Console Work Yet

Before touching Switch-specific code:

- version the snapshot schema;
- version the input action schema;
- add recorded snapshot fixtures from real runs;
- add golden sim vectors for movement and slingshot behavior;
- document the renderer semantic channels for flow, hazard, signal, waves, and
  source ids.

### 1. Hello Renderer Probe

Create a separate experimental target that can render:

- black background;
- fixed camera;
- one ship marker;
- one gravity well;
- one ASCII/field texture placeholder;
- controller input telemetry;
- frame-time telemetry.

Pass condition: stable 60fps at handheld resolution on prepared lab hardware.

### 2. Recorded Snapshot Probe

Render real LBH recorded snapshots:

- ship and remote entities;
- wells;
- wrecks/portal markers;
- coarse field channels;
- minimal HUD-critical values.

Pass condition: screenshots are recognizably LBH, controller input remains
responsive, and field readability survives handheld scale.

### 3. Run It Twice Renderer Choice

Compare two small implementations:

- nx.js/WebGL-like probe for maximum JS and shader reuse;
- C/C++ libnx graphics probe for realistic native performance.

Kill either lane quickly if it cannot hit frame pacing, input latency, or asset
loading targets.

### 4. Sim Port Decision

Only after the renderer shell passes:

- decide whether Switch needs embedded local sim truth;
- decide whether a remote-authority client is enough for research;
- decide whether any sim core should be ported to C/C++, WASM, or another
  shared runtime.

## Risks

- **Runtime mismatch:** current Electron/Node app shape does not carry over.
- **Renderer rewrite:** native Switch means rebuilding Three-owned presentation.
- **HUD rewrite:** DOM UI does not exist in the native/homebrew shape.
- **Process model:** console targets usually want one predictable app process.
- **Performance:** ASCII fluid, post, and entity overlays must fit Tegra-class
  GPU and handheld battery limits.
- **Legibility:** 720p handheld may demand different glyph scale and UI density.
- **Legal/distribution:** Atmosphere is research only; commercial release needs
  official Nintendo access.
- **Product drift:** any local sim rewrite can fork LBH's movement feel unless
  golden fixtures lead the work.

## Decision Gates

Proceed to a Switch 1 probe only when all are true:

- Steam Deck Gaming Mode is stable enough to be a known-good handheld baseline.
- The snapshot/input/content contracts are versioned.
- Recorded snapshots can drive a renderer without the browser client.
- Golden sim vectors catch movement and slingshot drift.
- The probe is scoped to rendering and input, not a full product port.

Stop the probe if:

- handheld 720p cannot hold 60fps with a representative field;
- the ASCII identity becomes illegible at real handheld distance;
- the implementation starts duplicating gameplay systems without fixtures;
- Atmosphere-specific work starts replacing the official commercial path.

## References

- [Nintendo Developer Portal](https://developer.nintendo.com/)
- [Nintendo developer registration](https://developer.nintendo.com/register)
- [Godot console support](https://docs.godotengine.org/en/stable/tutorials/platform/consoles.html)
- [Godot console porting page](https://godotengine.org/consoles/)
- [Atmosphere repository](https://github.com/Atmosphere-NX/Atmosphere)
- [libnx documentation](https://switchbrew.github.io/libnx/)
- [devkitPro deko3d](https://github.com/devkitPro/deko3d)
- [switch-examples](https://github.com/switchbrew/switch-examples)
- [nx.js](https://github.com/TooTallNate/nx.js/)

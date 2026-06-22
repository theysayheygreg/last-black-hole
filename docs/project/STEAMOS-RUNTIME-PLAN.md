# SteamOS Runtime Plan

Last Singularity's Deck target is a SteamOS game launched from Steam in Gaming
Mode. Desktop Mode is useful for setup and crash triage, but it is not the
product target.

## Current Position

The immediate Deck build remains the Linux Electron package:

- renderer: bundled Chromium/WebGL2/Three path;
- sim: embedded Node child process;
- control plane: embedded Node child process;
- deploy: Tailscale SSH + rsync to `/home/deck/Games/last-singularity`;
- launch: `run-last-singularity.sh`, then a scripted Steam non-Steam library
  entry for Gaming Mode.

This is the shortest path to playable Deck iteration because it preserves the
current game code, controller code, HUD, and authoritative local sim.

The first Deck failure was not a reason to abandon Electron by itself. It exposed
two concrete package/runtime issues:

- the desktop server bundle was missing new CJS dependencies;
- Chromium's Deck GPU process needed the Deck launcher profile now encoded in
  `LBH_DECK=1`.

## SteamOS Requirements

Use Valve's Deck criteria as the bar:

- launch through Steam with no mouse-required launcher;
- default controller mapping reaches all game content;
- 1280x800 support, with 1280x720 as fallback;
- readable text at handheld distance;
- playable framerate at 800p, with LBH still targeting 60fps for motion clarity;
- text input works through controller or Steamworks keyboard APIs;
- suspend/resume does not lose or corrupt local run state.

References:

- [Getting your game ready for Steam Deck and Steam Machine](https://partner.steamgames.com/doc/steamhardware/recommendations)
- [Steam Deck and Steam Machine Compatibility Review](https://partner.steamgames.com/doc/steamhardware/compat)
- [How to load and run games on Steam Deck and Steam Machine](https://partner.steamgames.com/doc/steamhardware/loadgames)

## Non-Chromium Options

| Option | Deck fit | Preserves current JS/WebGL client | Chromium-free | Read |
|---|---:|---:|---:|---|
| Fixed Electron | Good | Excellent | No | Immediate path |
| Tauri / WebKitGTK | Risky | Good in theory | Linux only | Prototype only |
| CEF | Good | Good | No | Not useful here |
| SDL3 + wgpu native renderer | Excellent | Sim only | Yes | Best future bridge |
| Godot | Good | Poor | Yes | Rewrite-sized |
| Bevy / Rust custom renderer | Excellent | Sim partial | Yes | Strong eventual target |

### Electron

Electron stays as the near-term shell. It is heavy, but it lets us keep the
existing Three/WebGL renderer and prove the game on the real Deck first.

Keep tightening it:

- preserve the Deck launcher profile and persistent logs;
- add Steam non-Steam or Devkit launch validation;
- avoid expanding desktop UI or launcher surfaces;
- keep the renderer and sim health checks visible through Stack Status.

### Tauri / WebKitGTK

Tauri is not the final answer for LBH. It replaces Chromium with system webviews,
but on Linux that means WebKitGTK and distro/runtime variance. For a WebGL-heavy
game on SteamOS, that trades one browser runtime problem for a less controllable
one.

Tauri can be prototyped for tooling or companion apps, not the main Deck game.

References:

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri webview versions](https://v2.tauri.app/reference/webview-versions/)

### CEF

CEF keeps Chromium and asks us to own more Chromium packaging ourselves. It is
useful if we need a custom browser shell, but it does not solve the
non-Chromium goal.

Reference:

- [CEF project](https://chromiumembedded.github.io/cef/)

### SDL3 + wgpu

The best future bridge is a native renderer process:

- SDL3 owns windowing, gamepad, fullscreen, suspend-aware lifecycle hooks, and
  platform input;
- wgpu owns the GPU abstraction over Vulkan on Deck, Metal on macOS, and D3D on
  Windows;
- the existing Node sim/control process can remain separate during the first
  prototype;
- renderer state crosses a narrow local protocol instead of the whole browser
  DOM and WebGL stack.

The prototype goal is not to port the entire game. It should prove:

- top-down 1280x800 window in Gaming Mode;
- gamepad input;
- ship marker, wells, field/fabric layer, HUD-critical text;
- a small ASCII or glyph-grid pass;
- one local protocol snapshot from the existing sim;
- 60fps on the Deck.

References:

- [SDL3 GPU API](https://wiki.libsdl.org/SDL3/CategoryGPU)
- [wgpu crate documentation](https://docs.rs/wgpu/latest/wgpu/)

### Bevy / Rust Native

Bevy is credible because it already sits on wgpu and brings a full game-engine
runtime. It is also a rewrite-sized decision. If LBH goes this way, it should be
after the SDL3/wgpu prototype proves the renderer shape and after the sim
process topology question is settled.

References:

- [Bevy](https://bevy.org/)
- [Bevy WebGPU notes](https://bevy.org/news/bevy-webgpu/)

## Recommended Phases

### Phase 0: Deck Electron

Ship the current Electron package as the private Deck test lane.

Done when:

- the app launches from Steam/Gaming Mode;
- embedded control and sim health are green;
- controller can start, fly, brake, slingshot, pause, and exit;
- no Deck coredump appears after a five-minute play session;
- logs are readable from Tailscale SSH.

### Phase 1: Steam Integration

Add Steam-facing platform work without changing runtime:

- scripted Steam non-Steam shortcut install now;
- SteamOS Devkit Client upload later;
- Steam Input action set draft;
- controller glyph strategy;
- controller-safe text entry path;
- 1280x800 HUD pass;
- suspend/resume test checklist.

### Phase 2: Native Renderer Prototype

Create `lbh-native-renderer` as an experiment, not a replacement branch:

- connect to existing local sim;
- render a minimal 2.5D scene with SDL3 + wgpu;
- use native gamepad APIs;
- compare Deck CPU/GPU/frame pacing against Electron;
- keep the browser build untouched until the prototype earns migration.

### Phase 3: Runtime Decision

Choose one:

- keep Electron for Early Access if it behaves well enough;
- ship native renderer for Deck while browser remains web/demo;
- migrate all desktop builds to native renderer and keep web as a separate
  public demo lane.

The preferred long-term shape is native renderer plus authoritative sim code
that can run either in-process or as a local process depending on platform.

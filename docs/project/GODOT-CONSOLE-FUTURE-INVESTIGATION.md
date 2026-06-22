# Godot Console Future Investigation

Status: parked for later. This is not the current Deck plan.

## Current Decision

Do not split Last Singularity into "Three.js for PC/web" and "Godot for
console" by default.

The near-term product path is:

- Three.js / WebGL2 / Electron for PC, web, and Steam Deck iteration;
- Steam Deck treated as a SteamOS/Linux handheld target, not as proof that a
  console-engine rewrite is needed;
- Godot reserved as a later feasibility probe after the sim and renderer
  contracts are portable enough to test without duplicating game logic.

## Why It Is Parked

Godot solves real console-adjacent problems: mature editor tooling, input
surfaces, packaging shape, scenes, animation, UI, and a known path through
licensed console porting partners.

The danger is sim drift. LBH's current truth lives in:

- authoritative Node control plane and sim processes;
- shared content JSON;
- HTTP protocol snapshots and events;
- renderer-owned Three/ASCII presentation;
- browser/Electron input and HUD surfaces.

A Godot console build would become a second game if it reimplemented movement,
slingshot, signal, run results, AI, inventory, and meta-loop behavior in
GDScript/C#/C++ without a shared contract.

## Prerequisites Before A Godot Probe

Build these first:

1. **Snapshot schema:** a versioned description of the renderable world state.
2. **Input action schema:** named actions independent of keyboard/gamepad/Steam
   Input/Godot InputMap details.
3. **Golden sim vectors:** deterministic fixtures for movement, slingshot,
   inventory, signal, extraction, and death.
4. **Content contract:** JSON manifests with schema validation and version
   markers.
5. **Renderer semantic channels:** field/current/wave/signal/hazard channels
   described in engine-neutral terms.
6. **Save/profile boundary:** a portable read/write contract for local and
   hosted profiles.

Without those, Godot is not a port target; it is a rewrite.

## Future Probe Shape

When revived, keep the first Godot spike thin:

- consume a recorded or live authoritative snapshot;
- render a top-down 2.5D field, ship, wells, portal, and HUD-critical data;
- map controller actions only;
- do not implement AI, inventory, signal, progression, or physics locally;
- compare latency, frame pacing, UI legibility, and content workflow against
  the SDL3/wgpu native-renderer probe.

The probe passes only if Godot can act as a renderer shell around shared LBH
truth.

## Console Notes

Godot officially supports Steam Deck through normal Linux export templates.
Other console exports require platform-holder approval and SDK-backed private
export templates or licensed middleware. That makes Godot viable later, but it
does not remove the need for a portable sim/content contract.

References:

- [Godot console support](https://docs.godotengine.org/en/stable/tutorials/platform/consoles.html)
- [Godot console porting page](https://godotengine.org/consoles/)

## Revisit Trigger

Reopen this after:

- the Deck build has passed real Gaming Mode playtests;
- controller-only flow reaches menu, flight, slingshot, pause, extraction, and
  death;
- the native SDL3/wgpu probe has rendered at least one authoritative snapshot;
- the platform contract above is documented and covered by tests.

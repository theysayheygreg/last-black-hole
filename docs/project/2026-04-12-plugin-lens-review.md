# LBH Plugin-Lens Review — 2026-04-12

This review looks at `Last Singularity` through two new lenses:

- macOS app discipline
- game-studio/browser-game discipline

The point is not "we should rewrite LBH into whatever a plugin likes." The point is to use those lenses to see where the project is already strong, where it is drifting, and which changes will make feature work safer and more shippable.

## What LBH Is Already Doing Right

LBH is ahead of the median game prototype in four important ways:

1. **Simulation and rendering are already separated.**  
   The project has a real authoritative sim, a control plane, and locally rendered clients. That is already the right long-term shape.

2. **The test harness has grown up.**  
   There is a real distinction between client smoke, architecture smoke, authority truth, and renderer fixtures. That is rare and valuable.

3. **The design docs are unusually good.**  
   The project has a real design system, feature specs, architecture plans, and a decision trail. That means future work can be intentional instead of purely reactive.

4. **The desktop wrapper is no longer just theoretical.**  
   The Electron app already embeds the control plane and sim for packaged local play. The product is further along than some of the docs still admit.

## The Main Gaps

### 1. The runtime modes are real in code, but not explicit enough as a product

LBH currently supports several distinct ways of running:

- browser-only local client
- local host stack
- remote client against an authority elsewhere
- packaged desktop app with embedded authority
- test harness

Those modes exist, but they are still too implicit. A teammate has to know ports, scripts, query parameters, and process assumptions to understand what is actually running.

**Conclusion:** runtime modes should be first-class.

### 2. The desktop app story is stronger in code than in docs

The packaged Electron build now embeds `control-plane-runtime.js` and `sim-runtime.js`, but some project docs still describe packaged builds as if they were only rendering clients.

That creates avoidable confusion about what "desktop build" means and what should happen when someone double-clicks the app.

**Conclusion:** the docs and build-plan language need to catch up to the code.

### 3. The design system is still more documented than enforced

`DESIGN-SYSTEM.md` is strong, but a lot of HUD implementation still lives as:

- inline style strings
- repeated rgba literals
- repeated font declarations
- repeated warning/selection color choices

That makes feature work drift-prone even with good taste and good docs.

**Conclusion:** the design system needs a code bridge:

- implementation-side tokens
- HUD primitives
- fewer one-off inline styles

### 4. Content truth is still scattered

LBH has great docs for:

- hulls
- loot
- AI personalities
- signal zones
- signatures
- map behavior

But the live content contract is still split across:

- docs
- runtime constants
- generation logic
- sim code

That is good enough for a sprint, but it will eventually slow feature work and make agent-built slices riskier.

**Conclusion:** the next maturity step is content manifests and shared data contracts.

### 5. The test harness is excellent at architecture truth, but thinner on player-facing playtest loops

The harness answers:

- did the stack boot?
- did the authority path stay honest?
- did the renderer stay coherent?

It is weaker at:

- does a new player understand the launch path?
- does controller-only menu traversal feel correct?
- does a whole host/join/extract/death flow feel good as a play session?

**Conclusion:** keep the current deterministic harness, but add named human playtest flows.

## Recommended Changes

### Priority 1 — Productize the current stack

Make the runtime explicit and legible.

- one canonical stack launcher
- explicit runtime modes
- explicit stack status
- embedded/local/remote paths documented in one place

This is the highest leverage change because it makes every other task easier to reason about.

### Priority 2 — Turn the design system into code

Add a small implementation bridge:

- `src/ui/design-tokens.js`
- `src/ui/hud-primitives.js`
- shared CSS variables for HUD and overlay styles

This keeps the original visual intent intact while making future changes much safer.

### Priority 3 — Add structured stack observability

The three-process architecture needs easier visibility.

At minimum, logs and status should consistently expose:

- mode
- map
- session id
- client id
- host
- player count
- overload state

This does not need to be fancy. It does need to be consistent.

### Priority 4 — Centralize content manifests

Move toward explicit content/data contracts for:

- hull definitions
- item catalog
- AI personalities
- signature definitions
- session/map profiles

This is how we keep feature velocity high without turning `sim-runtime.js` into a museum.

### Priority 5 — Add human playtest packs

Keep the deterministic harness as truth, but add a few named playtest flows:

- first boot
- host and join
- controller-only menu traversal
- extract and writeback
- death and return
- large-map drift/perf session

## Recommended Implementation Order

1. make runtime modes explicit
2. add stack status / observability
3. bridge the design system into code
4. clean up docs to match embedded-stack reality
5. begin content-manifest extraction

## Guardrail

The original intent must stay intact:

- the sim remains authoritative
- the client remains a local renderer and intent sender
- the ASCII/fluid aesthetic stays primary
- the center of the screen stays sacred
- productization must clarify the game, not flatten it

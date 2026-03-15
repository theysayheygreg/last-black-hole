# Forge Review — 2026-03-15

## Verdict

The game has a real hook. "Surf a dying universe" is strong, unusual, and worth building. The visual identity is also real. ASCII over a fluid sim with an EVA HUD is memorable.

The danger is not that the concept is weak. The danger is that the current plan is trying to build three games at once: a fluid-navigation game, an extraction roguelike, and a scalable multiplayer simulation platform. The jam version needs to be one game.

The one game should be this: move through a beautiful, hostile flow field, loot wrecks, and get out before the map becomes impossible. Everything that does not strengthen that loop should be cut or deferred.

## Showstoppers

### 1. The dual-physics plan is too ambitious for week one

Running both a stable fluid sim and a separate wave equation solver is a research toy, not a jam-first decision. It may be elegant later, but it is the wrong place to spend Monday and Tuesday.

You do not need two systems to prove the fantasy. You need one system that creates directional currents, local danger, and moments of acceleration that feel surfable.

My recommendation is simple: start with one fluid field and fake the wave language visually and mechanically. Inject oscillating forces from wells, merger pulses, and current bands into the same sim. If that feels good, you have the game. If it does not, a second solver will not save you in seven days.

### 2. Multiplayer is architectural drag right now

The scaling doc is thoughtful, but it is poison during a jam if it starts steering implementation. Do not build toward server-authoritative fluid, delta snapshots, or deterministic client prediction this week. Those are future problems.

You already have the right single sentence in your own docs: build the solo game as if multiplayer is coming. That means clean data boundaries, not actual multiplayer complexity.

### 3. The current scope of threats is too wide

Scavengers, fauna, Inhibitors, portals, wrecks, signal, black hole growth, Hawking radiation, viscosity decay, and procedural identity is too much for a seven-day build unless half of it stays thin.

The Inhibitor is the one threat that actually matters to the fantasy. Fauna and scavengers are optional until the core loop is alive.

## Risks

### 1. Signal may become a punishment meter instead of a decision meter

This is the most important design risk.

The current pitch is strong because signal is supposed to create choices. If every meaningful action increases signal and signal mostly causes bad things, players will quickly learn the wrong lesson: do less, move less, engage less.

That will turn your game from "surf a collapsing universe" into "tiptoe and wait." That is the death of the fantasy.

Signal has to buy something. Better scans, better loot rates, faster extraction charge, temporary visibility of hidden wrecks, something. The dangerous thing must also be tempting.

### 2. The Inhibitor may flatten the rest of the threat design

The Inhibitor is strong because it is absolute. But that same strength can trivialize all your other systems if it arrives too early or too often. If players think "everything before the Inhibitor is just prelude," then scavengers and fauna stop mattering.

The Inhibitor should feel like crossing a line you chose to approach, not a routine tax.

### 3. The visual stack may get expensive before the gameplay is proven

Fluid sim, scene render, feedback buffer, ASCII post, HUD, particles, distortion, multi-grid layering. This is plausible on paper, but it is also the exact sort of pipeline that eats half a jam if you start polishing before the game feels good.

The risk is not just frame time. The risk is iteration time. If changing one thing requires touching four render passes, you will slow down exactly when you need to be tuning movement feel by the hour.

### 4. Procedural identity may be too text-light to land emotionally

Civilization name, death cause, age, loot table is a decent start. It is not enough by itself to make runs feel haunted or memorable.

Right now it risks feeling like a label generator. You need one more layer of distinction per wreck cluster, even if it is small.

## Opportunities

### 1. Make surfing the reward, not just the movement

The game should reward elegant navigation directly.

For example:
- riding an outbound current reduces signal gain for a few seconds
- surfing a crest charges a scan burst
- staying in smooth flow increases extraction stability
- tight well slingshots boost loot recovery or portal access

If movement mastery feeds the economy, then the game becomes coherent fast.

### 2. Wrecks should shape the flow

This feels like one of the highest-value technical choices in the whole design.

If wrecks create lee zones, vortices, and sheltered pockets, then they stop being just loot nodes and become terrain. That is excellent. It gives you stealth, navigation, and scavenging in one object.

Even a crude version of this will do a lot of work.

### 3. Give each run one strong cosmic signature

Do not overgenerate everything. Pick one dominant per-run identity and let the rest stay light.

Examples:
- this universe has long slow tidal currents
- this universe is full of violent merger pulses
- this universe is thick and viscous from the start
- this universe is rich in wrecks but poor in portals

That is enough to make runs feel different without building a lore engine.

### 4. Audio can carry more design weight than you are currently using

The audio plan is one of the better parts of the whole project. Use it aggressively for information.

Let players hear:
- portal instability
- signal danger
- incoming merger pulses
- whether they are in "good surf" or dead water

That will make the game feel deeper than it is, which is exactly what a jam game should do.

## Recommendations

### Recommendation 1: Collapse the physics plan to one sim for jam week

Use the Pavel fluid base. Add force injection patterns that create the feeling of surfable waves. Do not build a separate wave solver in the jam version unless the one-sim approach absolutely fails.

If you need a phrase for the team: fake the theorem, ship the feeling.

### Recommendation 2: Re-scope the week around one threat ladder

I would build the threat stack like this:

- Monday: surfing and visual identity
- Tuesday: wrecks and extraction
- Wednesday: signal as risk/reward
- Thursday: Inhibitor only
- Friday onward: optional fauna or scavengers if the game already works

That means fauna and scavengers are stretch systems, not core systems.

### Recommendation 3: Make signal buy capability

Signal should not just wake the bad thing. It should also unlock short-term power.

Concrete jam-friendly options:
- high signal makes nearby wrecks easier to detect
- high signal increases loot pickup radius
- high signal reveals unstable portals sooner
- high signal briefly increases ship-wave coupling, making surfing stronger but riskier

Pick one. Keep it obvious.

### Recommendation 4: Use one killer visual move, not six

The core visual move is already enough: ASCII density field over fluid motion, with a crisp EVA HUD on top.

That is the look.

Grid distortion, multi-grid compositing, screen feedback, star fields, and full chromatic gravity warps should all be treated as optional polish after the game feels good.

If the render stack starts fighting you, cut everything except:
- fluid field
- ASCII post
- clean ship overlay
- clean HUD

### Recommendation 5: Do not add lethal combat in the jam build

The non-lethal tools doc is correct. Keep it that way.

If you need one interaction tool beyond movement, make it a force pulse. It belongs to the physics, it creates good spectacle, and it can serve navigation, panic recovery, and enemy disruption without inventing a full combat game.

### Recommendation 6: Move procgen toward "one memorable detail"

For each wreck, add one more sharp differentiator beyond the text label. Not a whole system. Just one.

Examples:
- silhouette class
- local flow anomaly
- unique hazard field
- distinct loot bias
- visual remnant color

That will do more than doubling the amount of lore text.

## Direct answers to the main design bets

### Does the core fantasy hold together?

Yes. It is strong.

### Are there tonal collisions?

A few. "Cosmic dread extraction game" works. "Cosmic dread extraction game with too many systemic knobs" weakens the tone because it starts feeling like a feature matrix. Keep the world oppressive and elegant. Cut anything that feels gamey for its own sake.

### Is the universe-as-clock enough pressure?

Yes, if the decay is legible and spatial. No extra countdown is needed at first. The map itself shrinking, thickening, and losing exits is enough.

### Is signal interesting or just punitive?

Right now it is at risk of being punitive. It needs upside.

### Is the Inhibitor the right threat?

Yes. It is the best threat in the package. Protect it from overuse.

### Is the procedural identity enough?

Almost. It needs one more non-text distinction per run or per wreck type.

## What I would cut immediately

- Separate wave solver for jam week
- serious multiplayer implementation work
- full scavenger + fauna + Inhibitor all as equal-priority systems
- any rendering flourish that is not serving readability or motion feel
- lethal combat

## What I would keep no matter what

- fluid movement as the center of the game
- ASCII post-process as the signature look
- extraction loop
- signal as a meaningful dial
- Inhibitor as the existential threat
- procedural wreck identity at a light but sharp level

## The build I would actually ship

By the end of the week, the winning version is:

A small universe. One or two wells. Excellent drift and thrust feel. Wrecks as terrain and loot. Portals evaporating. Signal as temptation. One terrifying Inhibitor. Strong HUD. Strong audio. Strong extraction tension.

That game can land.

The full simulation opera can wait.

# Endless Sky ↔ Last Singularity — Compare/Contrast & Import List

> Orrery, 2026-08-07. Source: full-repo study of endless-sky @ `18ebeba`
> (three deep-read reports: movement, rendering, systems — file:line
> evidence throughout; clone at `/private/tmp/lbh-research-endless-sky`).
> ⚖️ **License note first:** Endless Sky is GPL-3. Everything below is
> imported as *ideas, algorithms, and design patterns re-implemented in
> our code* — never verbatim code copying, which would bind LBH to GPL.

## The frame

ES is ten years of shipped decisions in a deterministic 60Hz
single-player sandbox with a static hand-authored galaxy. LBH is a
15Hz server-authoritative extraction roguelike with procedural
per-run worlds. The overlap (2D top-down space flight, data-driven
content, modest-hardware rendering) is enormous; the divergences are
LBH's actual identity: **environmental forces (fabric/wells/currents
— ES has literally none), server authority, per-run generation, the
ASCII aesthetic, and extraction structure.** Nothing below proposes
touching those. What ES offers is everything *around* the identity:
feel, legibility, AI craft, content architecture, and verification.

## Where each game stands

| Area | Endless Sky | LBH today | Verdict |
|---|---|---|---|
| Flight integration | semi-implicit Euler, 60Hz lockstep, drag only-while-thrusting, coast forever | 15Hz authority, always-on drag → equilibrium speeds, fabric carry | Different philosophies; ES's is worth one experiment (below) |
| Steering/AI | fractional-turn commands, stopping-point arrival incl. turnaround time, turning-radius gates | AgentPlay struggles with portal approach; arrival overshoot class of bugs | **ES flatly better — import the primitives** |
| Environmental forces | none at all | fluid fabric, wells, currents, waves | **LBH's moat — ES confirms nobody else has this** |
| Rendering | uniform-per-sprite + batched strips, texcoord motion blur, SDF HUD shaders, static starfield VBO | fluid sim + ASCII pass + Three entities; HUD mid-migration | ES's HUD/label/radar grammar is directly importable |
| Content architecture | one DataNode format for everything incl. saves and tests; condition store; LocationFilter missions | JSON data files + code; chronicle/profile fields scattered | ES's condition store is the single biggest architectural import |
| Verification | integration tests as data files driving the content-visible condition language | AgentPlayEval as bespoke code, chronically red | ES's shape is what AgentPlay wants to be |
| Multiplayer/authority | none | shipped | LBH ahead |

## The import list — ranked by meaningfulness to LBH now

### Tier 1 — direct hits on current, known pain

**1. The four steering primitives (AgentPlay + AI pilots).**
ES ships never jitter or overshoot because of four small, portable
ideas: *fractional turn commands* (`-angle/turnRate` on the final
frame instead of bang-bang ±1 — AI.cpp:2531), *stopping-point arrival*
that includes turnaround time (`v·(degreesToTurn/turnRate) + v²/2a`,
then seek the stopping point, not the target — AI.cpp:3695, 2592),
*the turning-radius thrust gate* (refuse to thrust inside your own
turn circle — AI.cpp:2990: the fix for orbit-of-death seeking), and
*the last-frame stop-snap* (kill the oscillation around zero —
Ship.cpp:5138). Our AgentPlay portal-controller red and
hazard-approach wobbles are exactly the failure class these erase.
**Arrival test:** AgentPlay reaches a portal center under N seconds
with zero facing reversals in the last 2s, across 20 seeded runs.

**2. The condition store (progression as one namespace).**
One `map<string, int64>` with primary (saved) and derived (computed)
entries, an expression language over it, and scope prefixes for
per-run / per-pilot / per-install. This is the architecture our
chronicle, unlocks, echo fragments, gamerule-style modifiers, and
adaptive content all want — and it makes every piece of game state
*assertable by tests and addressable by content* without binding code.
Pairs with #3. **Arrival test:** chronicle facts and one unlock gate
read from the store; a content file references a derived condition
with zero engine changes.

**3. Integration tests as data (the AgentPlay upgrade).**
ES tests inject an inline savegame, drive frames of input, and assert
in the same condition language content uses — with `status: known
failure` so broken tests live honestly in CI, and shared subroutines
(`"Depart"`, `"Land"`). Our chronically-red AgentPlayEval and the
undiffable red-classifications both dissolve in this shape.
**Arrival test:** one LBH journey test authored as data (seed state →
inputs → condition asserts) running in the fast lane.

**4. The SDF HUD shader grammar (feeds the HUD migration).**
Four tiny analytic shaders — ring/arc-with-dashes, tapered pointer,
line, Sobel outline — cover ES's entire in-world HUD with constant-
pixel AA at any radius (ring.frag's angular-falloff×radius trick).
Import the grammar into the HUD migration for: noise ring, two-phase
timer arcs, target/contact brackets (count-encoded pointer rings:
4=ship, 5=portal, 3=salvage), and off-screen contact arrows. Also
steal the **radar rim-clamp** (out-of-range contacts clamp to the rim,
never vanish — Radar.cpp:118) and **viewport corner brackets on the
radar** for our audible-contact ring.

**5. Label placement solved once, and labels under ships.**
ES places every planet label at system entry by testing 12 candidate
angles against all other labels, all bodies, at *all seven zoom
levels* — then never re-runs it; labels draw *under* sprites; text
uses non-rounded positioning to prevent jitter (PlanetLabel.cpp).
Our IN-RANGE-panel-occludes-the-well finding and label/prompt
collisions are this problem. Import: precomputed collision-free
anchors for proximity labels + world labels under entities.

### Tier 2 — feel and identity experiments (post movement-clarity gate)

**6. The coasting experiment (thrust-only drag).**
ES applies drag *only while thrusting* (`if(acceleration)` —
Ship.cpp:5126) with a dot-product damper that mathematically cannot
reverse or explode: coasting is free, momentum is never quietly eaten,
top speed still capped. LBH's always-on drag gives equilibrium
cruise; ES's gives conservation + the "space drift" feel. With fabric
as our only passive force, thrust-only drag could make currents feel
*stronger* (they'd be the only thing that moves you uninvoked).
**Flag: Greg feel-decision, one tunable switch behind the movement
proving gate — not a recommendation yet, an experiment.**

**7. Top speed decoupled from mass.**
ES: acceleration = thrust/mass, but vmax = thrust/drag — cargo taxes
agility, never cruise. Makes loadout consequences legible ("heavier =
sluggish" not "heavier = slow"). Worth adopting when hauler-class
identity returns in v0.4.

**8. Camera and zoom feel.**
Velocity-tracking camera lag (two constants; off/on/reversed as a
preference), log-space zoom easing between *data-authored* discrete
zoom levels, and the quadratic landing push-in. All cheap, all feel.
Our locked camera predates the readability program; a lag/zoom pass is
now safe to consider.

**9. Texcoord motion blur for the entity layer.**
Per-sprite smear along camera-relative velocity — 11 taps, free when
still, one uniform to disable. Our world already smears via the
fluid; the *entities* don't read speed except as a number. This gives
motion perception to ships/wrecks for shader pennies, and the
blur-aware cull box comes with it.

### Tier 3 — content architecture (the v0.3.2/v0.4 bank)

**10. LocationFilter + template missions + Pólya payloads + phrase
substitution.** A complete procedural job is 16 lines of data: source/
destination as *filters*, `payment` and `deadline` as auto-scaling
formulas, long-tailed payload rolls, grammar-based flavor text. This
is the shape for our encounter catalog, wreck-field jobs, and any
future contract layer.

**11. Personality vocabulary for the ecology and rivals.** 39 single
words (`nemesis staying harvests plunders` is a complete villain), a
composite alias table (`heroic = daring+hunting`), plus `confusion`
as an aim-scatter knob. Our AI rivals and scavengers deserve this
authoring surface.

**12. Fleet variant tables + period spawning.** Weighted multiset
variants under one fleet name; spawn authored as a single period
integer (`1 in N frames`), globally scalable by one gamerule. Our
ecology cadences are near this already — the variant table is the
missing half.

**13. Save discipline.** Readable text saves in the content format;
rolling backups with player-configurable depth; a separate
"safe-at-port" snapshot (≈ our post-extraction moment); transactions
that freeze the serialized state across risky UI flows. Direct
transfer to profile/vault persistence.

**14. Gamerules as content.** Data-defined rule presets, selectable
per-pilot, lockable per-run — a ready-made run-modifier/difficulty
system that fits extraction structure perfectly.

**15. Audio coalescing.** Same-frame identical sounds merge into one
source at the loudness-weighted centroid (`d = 1/(1+|p|²)` weights —
Audio.cpp:464). Twenty swarm hits become one clean voice. Direct
import for our Web Audio bus caps; composes with the audio guide's
mix tiers. Plus: 12 independent volume categories as the preferences
model.

**16. Faction recolor via swizzle matrices + masks.** 4×4 color
matrices in data + a mask channel so hulls recolor while glass/glow
stay fixed. Palette-relevant for tier/faction variants of shared
sprites without new art.

**17. Preferences surface as string enums + tooltips as data.** Every
setting is a named option list (not booleans), each with an authored
tooltip. Our pause menu's missing-settings gap has a proven shape to
copy. Blend-mode-in-filename (`+` = additive) is a related trick for
the asset pipeline.

**18. Process steals:** the changelog discipline (content vs engine
split at every level), `check_content_style` linters, a PrintData-
style CLI dump for balance spreadsheets, and the parse-all-content
smoke test as the cheapest data-game guard.

### Explicitly NOT importing

- **No-gravity/no-forces physics** — our fabric is the game.
- **Ship-ship non-collision** — our contacts/bumps are gameplay.
- **Cliff-free heat** — ES has an overheat cliff too, but our
  heat-as-economy with lockout is ratified design.
- **Static galaxy** — our per-run generation is the roguelike.
- **GPL code** — patterns re-implemented only, per the license note.

## Suggested sequencing

Tier 1 items 1+3 are one lane (AgentPlay craft), item 4+5 fold into
the already-planned HUD migration, item 2 is its own small
architectural PR that everything later leans on. Tier 2 waits on the
movement-clarity gate (item 6 explicitly needs Greg's feel session).
Tier 3 banks until v0.3.2/v0.4 content pushes — except #15 (audio
coalescing), which can ride the audio program now.

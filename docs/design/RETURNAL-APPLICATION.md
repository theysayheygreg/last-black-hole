# Returnal Application Plan

> RETURNAL-REFERENCE.md is the observation. This is the work order.
>
> Ten specific steals, scored by effort and impact, sequenced, and tied to existing LBH systems. Each steal cites DESIGN-SYSTEM.md for its visual tokens. Nothing in this doc is speculative — every item is either "implement now" or "implement in sprint N with this dependency cleared."

---

## How to Read This

Each proposed steal has:
- **What it is** — one sentence, what the player sees/feels
- **Where it plugs into LBH** — the existing system it attaches to
- **Effort** — small (<4h), medium (1-2d), large (3d+)
- **Impact** — low / medium / high on the question "does this change what LBH feels like?"
- **Dependencies** — what has to ship first, if anything
- **Ship order** — sprint 1, 2, 3, or later

At the bottom there's a sequenced roadmap that groups these by sprint.

---

## The Ten Steals, Scored

### 1. Loop Vocabulary: "Cycle" Not "Run"

**What:** Replace the word "run" with "cycle" across UI and docs. `[cycle 47]` instead of `run 47`. `this cycle` instead of `this run`. The results screen says "cycle ended" not "run ended."

**Where it plugs in:** Every UI surface that references runs — HUD, results screen, META-LOOP, CHRONICLE, home screens. Also all agent-facing docs for voice consistency.

**Effort:** small — it's a find-and-replace with ~20 touches, plus a few careful rewrites where "run" is used as a verb.

**Impact:** medium. This sounds trivial, but vocabulary is how the game tells you what it thinks of you. "Run" implies you're running a race you could win. "Cycle" implies inevitability. The word does the work before any mechanic kicks in.

**Dependencies:** none.

**Ship order:** sprint 1. Free win.

**Citation:** RETURNAL-REFERENCE.md §Mechanical Reference > The Loop, Pillar 5 "Dread Over Difficulty."

---

### 2. Death Screen That Lingers

**What:** When you die or extract, the camera doesn't cut to results immediately. It holds on the last frame for 2-3 seconds. Sound goes distant (low-pass filter). HUD fades first, then the world. Then the results screen resolves from black.

**Where it plugs in:** Current results screen transition. We already have the structure — we just need the linger.

**Effort:** small — maybe 3 hours. Add a pre-results "fade hold" state between `gamePhase = 'dead'` and the full results render. Gate the audio low-pass filter behind a `deathHoldActive` boolean. Fade HUD opacity separately from the rest.

**Impact:** high. This is the single biggest tone shift we can get for the smallest effort. Returnal nailed this feeling and we can steal it wholesale. The existing results screen already has ~66 lines of beautiful staged reveal code — it just currently rushes into that from a hard cut.

**Dependencies:** audio system has to support a low-pass filter on the master bus (probably already does via Web Audio API).

**Ship order:** sprint 1. High priority.

**Citation:** RETURNAL-REFERENCE.md §UI/UX Reference > Death Screen.

---

### 3. Edge-of-Screen Dimming Toward Threats

**What:** When the Inhibitor is approaching off-screen, the edge of the screen closest to its approach vector dims / reddens. No arrow, no tooltip. The universe just darkens toward the thing that's coming for you.

**Where it plugs in:** Inhibitor state machine (form 1+) + the HUD rendering layer. We already publish Inhibitor position in the snapshot. We need to compute the approach vector relative to the player's camera and draw a radial gradient vignette on the overlay canvas.

**Effort:** medium — maybe 1 day. The math is straightforward (direction vector from player to Inhibitor, project onto screen edge, draw a gradient). The tuning is the hard part: it has to be dramatic enough to notice, subtle enough not to feel like a HUD element.

**Impact:** high. Directly serves Pillar 5 "Dread Over Difficulty." The Inhibitor becomes scarier the moment you *sense* it before you see it. It also serves the design system rule "gold = value, magenta = threat" — the dimming is inhibitor magenta.

**Dependencies:** the overlay render layer has a free draw pass (it does).

**Ship order:** sprint 1-2. Want this before the ghosts work ships so the ghost+Inhibitor interaction has the visual vocabulary ready.

**Citation:** RETURNAL-REFERENCE.md §UI/UX > In-Game HUD, DESIGN-SYSTEM.md §2 Color Palette (inhibitor magenta).

---

### 4. Chronicle Fragments as Unreliable Narrators

**What:** META-LOOP currently stores structured run data (cargo counts, outcomes, death causes). In addition, the chronicle stores a short text fragment per run — not a summary, but a *voice* — written in first person, terse, sometimes contradictory across runs. E.g. `"the drifter told me the current was safe. it was not."`

**Where it plugs in:** META-LOOP.md chronicle system + the RunResult builder in sim-runtime.js. A new field `chronicleFragment: string` on the RunResult, populated by selecting from an authored pool keyed on `(deathCause, hullType, signalPeak)`. Maps to death flavor.

**Effort:** medium — 1 day for the system, plus 2-3 days for writing the pool (40-60 fragments).

**Impact:** high. Pure atmosphere, and it unlocks the scout fragment system (steal #5) and the chronicle wreck inscription system (steal #10).

**Dependencies:** none for the system. The writing is the blocker.

**Ship order:** sprint 2. Writing pool can start immediately in parallel.

**Citation:** RETURNAL-REFERENCE.md §UI/UX > Scout Logs, GHOSTS.md §3 Scout Fragments.

---

### 5. Signal as Voice (Not Just a Meter)

**What:** When the signal meter ticks up, the pilot *hears something* — a whisper, a name, a single breath, a word you don't remember speaking. Brief, quiet, right on the edge of hearing. Tied to zone transitions (GHOST → WHISPER → PRESENCE → SPIKE → FLARE → BEACON). Each zone has its own sound bank of 3-5 fragments.

**Where it plugs in:** Signal zone transitions (already publishing events via `signal.zoneChanged`). Audio system hooks into those events and plays one fragment from the appropriate bank.

**Effort:** medium — 1 day for the audio wiring, plus 1-2 days to source or synthesize the whispers.

**Impact:** high. This is the most Returnal-ish thing we could do. It rewrites the pillar "Signal Is Consequence" as "Signal Is What The Universe Is Saying Back." No mechanical change, total tone shift.

**Dependencies:** audio rescore plan (Codex has three audio direction docs in flight — this should coordinate with that work). Could ship standalone if the audio rescore is delayed.

**Ship order:** sprint 2-3. Wait for the audio rescore framework to land first, then slot this in.

**Citation:** RETURNAL-REFERENCE.md §Narrative Reference > The White Shadow, SIGNAL-DESIGN.md.

---

### 6. Alien Glyphs for Affinity Tags

**What:** Item affinity tags (drifter / breacher / resonant / shroud / hauler) render as single unicode glyphs instead of text, colored per hull. Over time, as the player spends runs with a given hull, the glyph "resolves" and shows the text name underneath. Early-game: unreadable shapes. Late-game: you can read them without thinking.

**Where it plugs in:** Item rendering in the vault, cargo, and inventory UI. Also chronicle wreck inscriptions.

**Proposed glyphs:**
- Drifter: `◍` (circle with flow)
- Breacher: `◆` (sharp diamond)
- Resonant: `◈` (layered diamond)
- Shroud: `◐` (half-tone)
- Hauler: `▣` (boxed)

**Effort:** small — half a day. The UI already has affinity strings; this is a lookup table + a "resolution level" from the chronicle.

**Impact:** medium. It's a vibe unlock, not a mechanic. But the *experience of learning the glyphs* is one of Returnal's most-praised design moments and we get a taste of it for cheap.

**Dependencies:** chronicle system tracks "runs per hull" (META-LOOP.md says it does — verify).

**Ship order:** sprint 2. Can ship with or without resolution-over-time; start with just the glyphs.

**Citation:** RETURNAL-REFERENCE.md §UI/UX > Alien Glyphs.

---

### 7. The Silhouette You Only Glimpse Once

**What:** Before the Inhibitor has fully formed (i.e. while the Inhibitor's pressure is below the spawn threshold), the player occasionally sees *something* at the edge of sensor range — a dim character cluster that's there one frame and gone the next. Not a mechanic. Not a threat. A haunt. Tied to signal zone — only appears when signal is PRESENCE or higher.

**Where it plugs in:** Sensor range rendering + a new "pre-spawn haunt" subsystem in sim-runtime.js. On high-signal ticks, roll (seeded) against a small chance to spawn a 1-frame phantom at the sensor range edge opposite the player's motion vector.

**Effort:** medium — 1 day. The hard part is tuning. Too frequent and it's a mechanic; too rare and it's invisible.

**Impact:** medium-high. This is pure dread. Directly serves Pillar 5. Also serves as an aesthetic commitment: LBH can have things it doesn't explain (see the Returnal orb conversation).

**Dependencies:** signal zones need to be server-authoritative (they are).

**Ship order:** sprint 2-3. Ship AFTER the edge-of-screen dimming (steal #3) so the visual language is consistent.

**Citation:** RETURNAL-REFERENCE.md §Aesthetic > The Figure in the Distance.

---

### 8. Rotating Minimap

**What:** Replace the top-down static minimap with a rotating one that spins with the player's heading. Same content, different frame of reference. Shows discovered wells, portals, wrecks.

**Where it plugs in:** Minimap rendering in the HUD overlay canvas.

**Effort:** small-medium. We already have a minimap (if we don't, this is larger). The work is: transform each entity position by `-cameraAngle` before drawing, rotate the minimap frame with a `ctx.rotate()` call.

**Impact:** medium. Feels more inhabited. Returnal credits a lot of its spatial tension to this.

**Dependencies:** we need a minimap first. Check current state.

**Ship order:** sprint 3+. Nice-to-have, not urgent.

**Citation:** RETURNAL-REFERENCE.md §UI/UX > In-Game HUD.

---

### 9. Hologram Inspection Screens

**What:** When the player opens an item detail view (vault inspection, run results cargo list, loot preview on map select), the item renders as a floating "hologram" — slowly spinning, phosphorescent-outline, with radial stats around it instead of a list. Scan lines and slight chromatic aberration during high-signal or high-inhibitor states.

**Where it plugs in:** Vault item display (home screen vault tab), loot pickup animation, seed preview sample loot.

**Effort:** large — 3-5 days. This is a whole new rendering mode, not a tweak. Requires a new item-render subsystem with its own shader-ish effects (chromatic aberration can be CSS `filter: drop-shadow()` stacks).

**Impact:** high — but only if executed well. A bad hologram is worse than a good list. This is the steal with the highest upside and highest risk.

**Dependencies:** needs design pre-vis before implementation. Greg should sketch what "LBH hologram" looks like vs "Returnal hologram" (we're ASCII over fluid, not polygonal).

**Ship order:** sprint 4+ (after ghosts v1 ships). Pre-vis work can start now.

**Citation:** RETURNAL-REFERENCE.md §UI/UX > Inspection Screens.

---

### 10. The Ship Interior Is Quietly Wrong

**What:** The between-runs home screen becomes a diegetic "ship interior" — a minimal illustrated space where the pilot is between cycles. Over dozens of runs, *things change subtly*. A second chair appears. A painting you don't remember hanging. A child's drawing taped to a console for a week, then gone. The player notices. Nothing is explained. No mechanic. Pure atmosphere.

**Where it plugs in:** Home screen. Currently the home screen is a canvas-rendered tab UI. The "ship interior" layer sits *behind* the tabs — the tabs and panels stay functional, but there's a slowly-shifting ambient scene behind them.

**Effort:** large — 3-5 days for the shift system, plus ongoing writing/art for the noticed objects. Could be shrunk with authored simplicity (10 "shift events," each a one-line text appearing in a fixed location of the home screen).

**Impact:** high. This is the single most Returnal-ish thing we can add to LBH. It's also the most creatively risky — it depends entirely on taste and the specific "noticeable objects" being well-chosen.

**Dependencies:** a slightly enriched home screen layout. Right now the home screen is 100% functional — no space for atmosphere.

**Ship order:** sprint 4+. Post-ghosts v1. Greg should author the first 5-10 "shift events" personally. Agents can't invent the right tone for this.

**Citation:** RETURNAL-REFERENCE.md §Narrative > The Home.

---

## Sequenced Roadmap

Grouped by sprint. Each sprint is a themed block of work that ships together.

### Sprint 1: Tone Cheap Wins
Fast, high-impact vocabulary and polish. Total effort: ~1 week.

| Steal | Effort | Impact |
|-------|--------|--------|
| 1. "Cycle" vocabulary | small | medium |
| 2. Death screen lingers | small | high |
| 3. Edge-of-screen dim toward threats | medium | high |

**Ship criterion:** LBH feels more dread-heavy without any mechanical change. Player testers describe the game with different adjectives ("tense" → "haunting").

### Sprint 2: Voice and Narrative Drip
The chronicle fragment system + the signal voice system + the silhouette haunt. Total effort: ~1.5 weeks.

| Steal | Effort | Impact |
|-------|--------|--------|
| 4. Chronicle fragments (unreliable narrators) | medium | high |
| 6. Alien glyphs for affinity | small | medium |
| 7. Silhouette haunts | medium | medium-high |

**Also running in parallel:** ghost system v1 (GHOSTS-V1.md). The fragments from steal #4 are the writing pool that GHOSTS-V1 uses for chronicle wrecks.

**Ship criterion:** players start finding fragments evocative enough to screenshot and share. Non-deterministic — we'll know if it worked.

### Sprint 3: Audio Rescore Integration
Wait for Codex's audio rescore framework to land, then slot in steal #5.

| Steal | Effort | Impact |
|-------|--------|--------|
| 5. Signal as voice (whispers per zone) | medium | high |

**Ship criterion:** muting the HUD still makes the player feel the signal rise.

### Sprint 4+: Big Visual Lifts
Longer-horizon work that needs pre-vis before implementation.

| Steal | Effort | Impact |
|-------|--------|--------|
| 8. Rotating minimap | small-medium | medium |
| 9. Hologram inspection screens | large | high (if executed well) |
| 10. Ship interior quietly wrong | large | high (if executed well) |

**Ship criterion:** we have a version of LBH that visibly borrows from Returnal without feeling like a knockoff. Players who've played Returnal say "this feels related, not copied."

---

## What's Not on This List (And Why)

**Things from Returnal we deliberately don't take:**
- Bullet hell combat — wrong genre
- Third-person camera — wrong perspective
- Voice acting — no budget
- Selene as a character — pilots are anonymous-by-design
- The hospital/home flashbacks — too literal, LBH's metaphysics are different

**Things from RETURNAL-REFERENCE.md that I merged into other steals:**
- "Dead civilization as evidence, not enemy" is implicit in the Chronicle Wreck design in GHOSTS.md — not a separate steal.
- "Parasites / adrenaline / malignancy" map onto our existing signal system — no separate work needed.
- "Biomes as states of mind" maps onto our cosmic signature system, which already exists.

---

## Open Questions for Greg

1. **Does "cycle" replace "run" everywhere, or only in player-facing UI?** I lean "everywhere" — consistent internal vocabulary changes the tone of how we talk about the game too. But it's a nontrivial doc edit.
2. **Is the death-screen linger gated behind Pillar 5 "Dread Over Difficulty" as a hard requirement, or is it optional per-session?** I lean hard requirement — opting out of dread defeats the feature. But if playtesting shows it drags, we need a clean revert.
3. **Should the silhouette haunts (steal #7) also respond to *low* signal? As in, if you're being too quiet the universe notices differently?** Interesting idea but could be too subtle. Flag for later.
4. **Are the alien glyphs for affinity a real commitment, or a gesture? If the glyph system is only 5 symbols, it's a gesture. If we want resolution-over-time, it's real work and we should scope the "you learn the glyphs" curve.**
5. **Who writes the chronicle fragment pool?** 40-60 one-liners. Greg should write the first 10 to set tone. Agents can extend afterward.
6. **The rotating minimap — do we HAVE a minimap currently, or is this a two-step ("add minimap, then rotate it")?**

See DESIGN-SYSTEM-APPLICATION.md for the design token compliance work that precedes all of this, and GHOSTS-V1.md for the feature this plan runs parallel to.

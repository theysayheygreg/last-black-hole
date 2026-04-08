# Returnal Reference

> Housemarque, 2021. PS5. Third-person bullet-hell roguelike with a narrative that straddles cycles of death and rebirth.
>
> LBH and Returnal share a thesis: you cannot escape the thing you carry with you. Returnal just figured out how to *dramatize* the cycle in a way we should learn from. This doc inventories what we can steal from Returnal (and its metroidvania ancestors) for aesthetic, UI, and narrative direction.

---

## Why Returnal Matters to LBH

Returnal is a roguelike that takes the loop seriously as a **metaphysical condition**, not just a retry mechanic. Most roguelikes treat death as a reset with metaprogression sugar on top. Returnal treats death as an event that happened to a character who has always been dying — the cycle is the setting.

LBH has the same bones:
- **A universe that is dying around the player** (LBH's well collapse, Returnal's Atropos biome rot)
- **A signal/attention mechanic that marks you** (LBH's signal → Inhibitor, Returnal's malignancy + vengeful Echoes)
- **An extraction loop that isn't really escape** (LBH's portals, Returnal's cycle resets)
- **A dead civilization that is evidence, not enemy** (LBH's wrecks, Returnal's Citadel / Overgrown Ruins)

What Returnal has that LBH hasn't fully claimed yet: **the cycle is the story**. The player isn't grinding toward a "true ending" — the player is *inside* the cycle, and the game's tone is built around that being the horror, and also the intimacy.

---

## Mechanical Reference

### The Loop
- Selene crashes on Atropos and dies; dying restarts her at the crash site.
- "Cycles" not "runs" — the word choice reframes retry as metaphysics.
- Metaprogression is permanent gear unlocks, permanent alien glyphs (language), permanent story beats. The *world* persists across cycles. The *character* persists. The *items* do not.
- Some rooms and doors permanently open once you find the right artifact (metroidvania gating over roguelike procgen).

### Biomes as States of Mind
- Six biomes, each a different flavor of decay: overgrown ruins, red desert, frozen wastes, flooded citadel, glitching techno-void, apocalyptic storm.
- Biomes aren't just "level 1/2/3" — each one has a different emotional register. The Citadel is grand and tragic. The Desert is hostile and mocking. The Techno-Void is existentially wrong.
- **Application to LBH:** our maps (Shallows, Expanse, Abyss) should each have a *register*, not just a size. A "feel" a player can describe in one adjective. Cosmic signatures already push this direction — lean harder into it.

### Scout Corpses (see GHOSTS.md for full treatment)
- Dead Selene corpses appear in the world. They are traversal landmarks, narrative artifacts, and occasionally cursed objects.
- Each scout corpse carries an **audio log** — a fragmentary recording of Selene discovering something, describing something, failing at something.
- Logs are deliberately unreliable narrators. Selene contradicts herself. Selene forgets her own name. Selene asks "is this the first time?"
- Some corpses are your own — from your own past cycle. Yours are *marked* differently (red HUD glyph). Looting them is both rewarding and risky.

### Adrenaline and Malignancy (not directly portable, but instructive)
- **Adrenaline:** kill streaks without taking damage grant stacking buffs that reset on any hit. Creates a "dance on the knife edge" feedback loop.
- **Malignancy:** picking up cursed items (which are often the best items) fills a corruption meter. Too much malignancy = random debilitating "malfunctions" until you clear them.
- Both systems express the same pillar: **upside always comes with cost attached**. The best play is greedy but disciplined.
- **Application to LBH:** this is already baked into our signal system (signal = tax on ambition). We don't need Adrenaline/Malignancy as mechanics, but we *should* internalize the language: every meter the player looks at should feel like a bet they're losing on purpose.

### Parasites and Traits
- Parasites are buffs with attached penalties (e.g., +30% weapon damage, -10 integrity per minute). Clear double-edge.
- Weapon Traits roll procedurally and level up with use. A gun you use a lot *becomes better at being itself*.
- **Application to LBH:** rig tracks already do this — the deeper you go into Laminar, the more of a Drifter you become. Returnal confirms the instinct: let specialization narrow, not generalize.

---

## Aesthetic Reference

### Visual Language
Returnal is Gigeresque organic horror fused with brutalist architecture fused with deep-space emptiness. Three palettes dominate:

1. **Corpse red + bone white** — organic decay, wet ruin, exposed flesh architecture. The Citadel, the Overgrown Ruins.
2. **Phosphorescent magenta + sickly green** — alien illumination, the signs of the Guardians, bioluminescent warning colors. Inhibitor-adjacent.
3. **Cathedral gold + void black** — the rare "this was holy once" palette. Megalithic structures against pure black sky.

The fluid sim in LBH means we can't copy these palettes directly — we're ASCII-over-fluid, not polygonal horror. But the **color relationships** translate: high contrast against deep black, phosphorescent accents that mean "the universe is watching," deep reds that mean "this was alive."

### Texture Vocabulary
- **Carved glyphs** — alien writing on ruined surfaces. Indecipherable until late-game. LBH could have "wreck glyphs" that the player learns to read over runs — affinity tags that resolve into real item names.
- **Dangling fronds / tendrils / cabling** — nothing in Returnal is cleanly manufactured. Everything is grown or corrupted. Even the tech looks like it was pulled out of flesh.
- **Holograms and scan lines** — the HUD and inspection screens are distinctly "hologram on vacuum helmet visor" — translucent, flickering, phosphorescent. This is a direct steal for LBH's between-run screens.
- **Water and wet surfaces** — puddles, dripping, reflections. Adds the sense that the environment is still reacting to you, wet and alive.

### Lighting and Composition
- Single dramatic light sources in darkness. Not rim lighting — single-source storytelling. A beam of light from a ceiling crack, a burning console, the glow of a relic.
- Backgrounds have depth through fog/particulate, not detail. You can't see far, and what you can see is hostile.
- **Application to LBH:** our ASCII fluid can do this with signal and density — well collapse fronts, wreck fires, sentry patrol beacons. Lean into "what is lit" as narrative. A wreck that you can see is a wreck that wants to be found.

### The Figure in the Distance
Returnal has recurring encounters with silhouettes — cloaked humanoid figures that appear at the edge of sight and vanish. Never explained. Never fought. They watch.

**Application to LBH:** the Inhibitor should have this quality *before* it wakes. The player should occasionally *glimpse* a shape at the edge of sensor range that isn't there when they look again. Not a mechanic — a haunt. Tied to cosmic signature or signal zone.

---

## UI / UX Reference

Returnal's UI is the reason it's on this list. It solves problems LBH has.

### In-Game HUD (minimal)
- **Integrity** (health): single crescent bar on the left, labeled with a number only when hovered. Soft glow, never pulses for routine damage. Pulses red for critical.
- **Adrenaline**: small tiered pip meter. No numbers. Tier changes flash briefly.
- **Weapon**: weapon name at the top, proficiency as a thin bar underneath. Ammo as large numeric readout. Alt-fire is a separate icon with its own cooldown.
- **Minimap**: bottom-left corner, *rotates with the player*, shows only discovered rooms. Not a fog-of-war overlay — a discovery trail.
- **Proximity threat indicator**: edges of screen dim red when off-screen enemies are shooting. No threat arrows, no reticle clutter. Just "the edge of reality darkens toward danger."

**LBH implications:**
- We have a pulse cooldown meter already. Treat it like Returnal's weapon proficiency: thin, underneath, not demanding.
- We should consider a rotating map instead of a flat one. Returnal's rotating minimap feels inhabited in a way a static one never does.
- The "edges dim toward threat" idea is a direct steal. Our Inhibitor warning could *darken the screen edges from the direction the Inhibitor is approaching*. No arrow needed.

### Inspection Screens (hologram-rich)
- Weapon/item inspection is a **floating 3D hologram** with stats radiating around it.
- Stats are not in a table. They're in a **radial pattern**, each glyph a separate floating element.
- Text uses a deliberate monospace font with slight chromatic aberration. It looks like it's being displayed on a visor HUD.
- Tooltips are lowercase, terse, evocative. Not "+15% damage vs bosses." Something more like "resonance: the deeper wound, longer."

**LBH implications:**
- Our vault/rig/loadout screens currently use flat canvas text. They should be reframed as "hologram projections on the ship's viewport" — floating, phosphorescent, slightly translucent, with a visible CRT/scanline layer.
- Item inspection should feel *weighty* — spin the item slowly, show the affinity glyph prominently, use sparse evocative text.
- Chromatic aberration on text during high-signal states is a direct steal.

### Alien Glyphs (learning the world)
- Early in Returnal, signs are in an alien script. The player cannot read them.
- As you find **glyph translators**, portions of the script become decipherable.
- Late-game, you can read environmental warnings that have been around you the whole time — and they were trying to warn you.
- The **sensation of literacy arriving** is one of Returnal's best-designed feelings.

**LBH implications:**
- Our item catalog has *affinity tags* (drifter/breacher/etc.). These should be rendered as **unreadable glyphs for the first few runs**, gradually resolving as the player unlocks hull mastery.
- Wrecks could have unreadable chronicle inscriptions that resolve over time. The wreck you passed over in run 1 becomes legible in run 12 and tells you something you wish you hadn't ignored.
- This is a direct progression hook with no mechanical cost — pure vibe.

### Scout Logs (fragmentary audio)
- Picking up a dead Selene plays her voice log in-universe. The log is a 10-20 second audio fragment. It's not a cutscene. The player keeps moving.
- Logs are numbered and archived in the ship for later re-listening.
- **The logs contradict each other.** Selene says things that are not true. Selene refers to events that haven't happened. Selene addresses a "you" that is sometimes the player.

**LBH implications:**
- Our chronicle system (META-LOOP.md) currently stores structured data: outcomes, cargo counts, death causes. Returnal's approach suggests we should *also* store **flavor fragments** — short evocative strings written by the pilot (or the universe) describing that death.
- These fragments can be played back when visiting a wreck from a past run. "pilot was here for 4:12. last word on the log: 'wasn't looking at it.'"
- They don't need to be voice — text is fine for our budget. The emotional contract is: every wreck has a voice, and the voice is unreliable.

### Death Screen
- Returnal's death transition is slow, beautiful, and heavy. The camera drifts. Sound goes distant. The HUD fades before the world does. You hear Selene breathing, then not breathing.
- Then: a cut to Selene standing on the beach at the crash site. Cycle begins again. No menu. No "YOU DIED." Just the loop.

**LBH implications:**
- Our current results screen is already moving in this direction (signal peak, inhibitor form reached, AI outcomes). We should lean into the **linger**. Don't rush the player back to the menu. Show them what they were doing in the last 10 seconds. Show them the wreck they almost reached.
- No "CONSUMED / EXTRACTED / COLLAPSED" big text. Subtitle-only. The feeling should be "the universe closed over you," not "game over."

---

## Narrative Reference

### The Meta-Fiction: Is Any of This Real?
Returnal is deliberately ambiguous about whether Atropos is a physical place, a dream, a purgatory, a hallucination, or a memory. The ending does not resolve this — it multiplies the ambiguity.

Selene has a son. Selene drove into a tree. Selene is lying in a hospital bed. Or Selene is an astronaut investigating a signal on an alien world. Or both. Or neither. The game treats these as *simultaneously true*.

**What LBH can learn:** we don't need a clean diegetic frame. The pilot is in a dying universe. Maybe. The pilot is inside a black hole's accretion disk. Maybe. The pilot is a consciousness being spaghettified across causal light cones. Maybe. We can let all of these be true at once. The chronicle fragments can be unreliable narrators *about the universe itself*.

### The Home (the House Sequences)
- Periodically, Selene walks through a first-person rendering of her childhood home. No combat, no UI. She opens doors. She sees memories. The house is unreal and deeply real.
- The house sequences are where the game's thesis lives. The astronaut suit is armor against memory. The loop is grief.

**What LBH can learn:** we don't need house sequences. We have *the ship interior* (already in design for the home tab). What if the ship interior is the analog — between runs, you're at your station, but the station is *quietly wrong*. Paintings on the wall you don't remember hanging. A second chair that shouldn't be there. A child's drawing taped to a console for a week then gone.

Pure atmosphere. No mechanic. Just the thing the player notices and can't un-notice.

### The White Shadow / The Called-To Thing
- Selene is on Atropos because she followed a "white shadow" signal. It's her son. It's a god. It's herself. It's death.
- The signal is both what she's chasing and what's killing her.
- You *cannot not follow it*.

**What LBH can learn:** LBH's signal system is *this*, but we haven't made it narrative yet. What if every time the signal zone ticks up, the pilot **hears something** — a whisper, a name, a static fragment. Signal as a voice. The Inhibitor is what the voice becomes when it finally gets tired of being quiet. The pillar "Signal Is Consequence" becomes "Signal Is What The Universe Is Saying Back."

---

## The Metroidvania Lineage (Why "Dead Civ, Fallen, Rotting" Works)

Returnal isn't alone in this. The dead-civilization roguelike/metroidvania lineage runs through:

| Game | Dead Civilization | What They Tell Us |
|------|-------------------|-------------------|
| **Super Metroid** | The Chozo (bird-people who raised Samus, now dead) | Evidence-as-architecture. Every room is a note the dead left. |
| **Metroid Prime** | Chozo + Space Pirates + Phazon corruption | Three *overlapping* dead civs. Archaeology as combat. |
| **Castlevania: SOTN** | Dracula's court, the fallen aristocracy, the damned | The castle is cursed *because* it was once loved. |
| **Dark Souls** | The gods of Anor Londo, gone mad or gone cold | The player is the ash of a world that already ended. |
| **Hollow Knight** | The Pale King's kingdom, consumed by Infection | You fight your way through the memory of a civilization that chose wrong. |
| **Tunic** | A pre-fall age whose instructions are lost | You can't even read the manual. The fall took literacy with it. |
| **Returnal** | The Guardians of Atropos, possibly Selene herself | The dead are you. You are the dead. |

**The pattern:** in every one of these games, the dead civilization is not "lore flavor" — it's the mechanical identity of exploration. You *traverse* the dead, you *loot* the dead, you *become* the dead, and the question is always "did they find something they shouldn't have?"

**For LBH:** our wrecks are currently loot nodes with tier labels. They should be *evidence of a decision*. Each wreck should imply a civilization that came to the black hole looking for something — and every one of them got it wrong in a different way. Over a long enough playtime, the player should begin to suspect that their own wrecks are just the next generation of evidence.

---

## Specific Steals

Short list of things we should copy as directly as we can get away with:

1. **Rotating minimap** (not a flat overlay, a wireframe that spins with the ship)
2. **Hologram inspection screens** (item detail as floating radial hologram, not a list)
3. **Alien glyphs that gradually resolve** (affinity tags start unreadable)
4. **Edge-of-screen dimming toward threats** (Inhibitor approach vector, no arrow)
5. **Scout logs as fragmentary unreliable narrators** (chronicle fragments are *voices*, not stats)
6. **Single-light-source dramatic framing** (a lit wreck is a chosen wreck)
7. **The silhouette you only glimpse once** (pre-Inhibitor hauntings)
8. **Loop as metaphysics, not retry** ("cycle" vocabulary, not "run")
9. **The ship interior as quietly wrong** (between-run hub that notices you)
10. **Death screen that lingers** (show the final 10 seconds, don't rush)

---

## What We Do NOT Steal from Returnal

Worth saying explicitly:
- **Bullet hell combat.** LBH is not a shooter. Returnal's combat density doesn't translate — our "combat" is surfing and positioning.
- **Third-person perspective.** We are top-down ASCII. The camera language is different.
- **The voiceover / heavy cinematics.** We don't have a voice actor budget. Text fragments carry the narrative instead.
- **The specific character (Selene).** LBH pilots are anonymous-by-design. Named only by hull. The void doesn't care about individuals.
- **The real-world "mother and son" frame.** LBH's pilot has no backstory to go home to. There is no home. That's the point.

What we want from Returnal is the **tone of the loop** and the **language of the UI**, not its literal content.

---

## Open Questions

1. **Does our chronicle system get rewritten to carry unreliable fragments, or do fragments live separately?** META-LOOP currently stores structured run data. Fragments are a different data shape.
2. **How much do we commit to diegetic ambiguity ("is this real")?** A little ambiguity is vibes. Too much is meaningless. Greg's call.
3. **Do we have the art budget for rotating-minimap + hologram-inspection + CRT-distortion UI?** These are visual pillars that need pre-vis before committing.
4. **Is the "ship interior is quietly wrong" idea a v1 feature or a post-ship atmospheric pass?** It's a small mechanic with outsized effect. Probably v1.

See GHOSTS.md for the companion mechanic proposal (wrecks, scouts, doppler-ghosts).

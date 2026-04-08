# Echoes: The Evidence of Past Cycles

> The dead are not gone. They are data, they are landmarks, and they are threats.
>
> This doc establishes **echoes** as LBH's canonical term for past-cycle residue: the wrecks, voices, silhouettes, and phenomena that persist across the seams between collapsed cycles. Builds on META-LOOP.md, MAP-SEEDS.md, RETURNAL-REFERENCE.md. The v1 implementation spec is in ECHOES-V1.md.

---

## What an Echo Is

An echo is a fragment of a past cycle that has, through whatever mechanism the void permits, slipped forward into the present one.

When a cycle ends — when a pilot dies, when the universe collapses, when the Inhibitor claims something — most of it is simply gone. But sometimes, in the brief moment between one collapse and the next, things pass across the seam. A wreck that shouldn't exist. A voice that was never quite recorded. A shape at the edge of sensor range that nothing in this cycle is projecting. A pilot's last words, drifting in a current that hasn't flowed yet.

Echoes are **not ghosts**. Ghosts imply a soul, an intention, a haunting done on purpose. Echoes are residue. Mechanical remainders of decisions that were made by pilots who may or may not have existed in the same universe the current pilot is standing in.

The universe does not remember every cycle. But it remembers the loud ones.

### Voice and Flavor (Qud-style)

LBH echoes borrow the voice of Caves of Qud's *extradimensional* affix: direct, uncertain, slightly askew. Things that exist but don't quite belong. When flavor text describes an echo, it should carry the feeling that another version of events happened somewhere nearby.

**Example flavor strings:**

- "this wreck belongs to a cycle that is no longer adjacent to this one."
- "carried once by a pilot whose callsign this universe does not remember."
- "an echo — brought forward from a collapse that already happened, or that will."
- "the contents of this wreck were real in a cycle that did not finish the way this one will."
- "pulled across a dimensional seam during the last collapse. it does not fully belong here."
- "there is a cycle where this pilot did not die. this is not that cycle."
- "fragmentary. incomplete. the part the universe could not keep."

**Guidelines when writing echo flavor:**
- Direct but uncertain. "This is from somewhere" not "this might be from somewhere."
- Imply other cycles without naming them. Never say "parallel universe" — it's too science-fiction.
- The universe is the constant; the cycles are disposable. Echoes travel between cycles, not between realities.
- Occasionally address the reader. Not always.
- Lowercase, terse, no proper endings unless the rhythm demands it.

---

## Prior Art

Three roguelike traditions informed the design:

| Game | What It Does | What It Taught Us |
|------|--------------|-------------------|
| **DCSS player ghosts** | When you die, your character is serialized into a ghost file. The ghost spawns in another player's game with your stats, spells, and equipment. Killing it gives XP. | "Can new-you beat old-you?" becomes a skill test. Echoes as self-challenge. |
| **Caves of Qud tombstones + extradimensional affix** | Dead characters leave tombstones at their death location. Extradimensional items are subtly wrong — from somewhere else. | Mortality as setting, dimensional seepage as flavor. The *affix* pattern is what we're borrowing most. |
| **Returnal scout corpses** | Dead Selene corpses appear in biomes as landmarks. Each carries a voice log (unreliable). Your own corpses are marked and spawn vengeful Echoes when approached. | Unreliable voice logs, recognition dread, your past self as a named threat. |

None of them map cleanly. The synthesis is ours.

---

## Design Goals

In priority order:

1. **Make past cycles persist in the world.** A pilot who dies at 03:12 leaves evidence another pilot (or the same pilot's next cycle) can find.
2. **Create existential dread through recognition.** The most unsettling wreck is the one you recognize — your own, or one that looks like yours, or one that was doing what you're about to do.
3. **Give dying a positive feedback loop without undermining the pillar "Loss Is Loss."** Echo loot is a reward for whoever finds it, not a refund to the pilot who died.
4. **Feed the pillar "Universe Is the Clock."** Echoes are more common the longer you play, because more cycles have collapsed by then. The universe accumulates history.
5. **Tie into signal naturally.** Echoes should leak signal. Approaching them is both rewarding and a tax on quietness.
6. **Work within our determinism layer.** Echo placement should be seeded-deterministic where possible, so the same seed produces the same echo-memory map across all clients.
7. **Serve the flavor.** Every echo the player encounters should feel like it came from a cycle that was real, and is now not.

---

## The Three Echo Classes

Three complementary mechanical layers.

### 1. Chronicle Wrecks (ECHOES-V1.md — shipping first)
**The loud dead persist as evidence.**

When a pilot dies with peak cargo value above a threshold, their position is recorded as a **chronicle wreck** — a lootable derelict that carries the pilot's name, hull type, death cause, a short unreliable chronicle fragment, and 60% of their final cargo. Persisted per-seed in the control plane. A pilot replaying the same seed will encounter their own chronicle wrecks and those of other pilots.

Full v1 spec: see ECHOES-V1.md.

**Signal contract:** chronicle wrecks passively leak signal (0.02/s within sensor range) and spike loudly on pickup (+0.10 extra). They are the loudest loot in the game. Quiet pilots avoid them. Loud pilots dance with them.

**Death condition:** a pilot's cycle must have meaningfully progressed (peak cargo value ≥ 200 EM) to leave a chronicle wreck. Dying empty produces no echo. Not every cycle is loud enough for the universe to remember.

### 2. Phantoms (shipped as THE PHANTOM)
**Unexplained silhouettes at the edge of sensor range.**

Already implemented. See the phantom state machine in `src/main.js`. A phantom is a client-only visual phenomenon — no server entity, no snapshot field, no tooltip, no loot. At high signal, sometimes, a ship-shaped glyph cluster appears at the edge of sensor range opposite the player's motion vector. It dissolves instantly on proximity and the game never acknowledges it happened.

**Canonical framing:** phantoms are echoes of pilots whose cycles ended so badly the universe doesn't even remember their names. You are allowed to see them at all only because you are being loud enough for the void to let a little of the past bleed through.

**No persistence.** Phantoms do not carry loot or fragments. They are evidence that the system works, not part of the system.

### 3. Scout Drifts (deferred, v2)
**Voices drifting in the current.**

Phosphorescent motes in the flow field. Each carries a short unreliable fragment from the echo voice pool. Free to pick up (no cargo slot), go directly to the pilot's persistent Chronicle. Only visible when the player's signal is above WHISPER — "you don't see the dead until you start becoming them."

**Deferred to v2** because the client needs a stable signal-zone visibility layer first, and the Chronicle screen needs a place to display collected fragments. Neither blocks v1 shipping.

### 4. Doppler-Echoes (deferred, v3)
**Your own past cycle running alongside you.**

Deferred. See GHOSTS.md historical notes (ECHOES.md predecessor). The design is sound but the tuning risk is high — a ghost copy of your own past self competing with you for wrecks could feel amazing or could feel gimmicky depending on pacing. Ships after the other two classes are playtested.

---

## How They Work Together

A pilot's cycle might look like:

> At 01:12 the player passes a chronicle wreck tagged `[ashfield]`, a Drifter whose cycle ended at a well called Mictlan 17 cycles ago. The wreck carries a fragment: *"the well was smaller a minute ago."* The player picks it up, takes the signal spike, and carries forward two items from the dead pilot's cargo.
>
> At 02:47 the player's signal climbs into PRESENCE and they glimpse a phantom — a faint red ship-shape at the edge of sensor range, opposite their motion. They turn toward it; it dissolves. They don't know what it was.
>
> At 03:40 they encounter another chronicle wreck tagged `[lantern]`. It's a Hauler. The fragment reads: *"the hauler i saw at 03:11 — was that you?"* The player is a Hauler. The player was at that position at 03:11.

Each echo class serves a different feeling:
- Chronicle wrecks = persistent evidence, recognition dread
- Phantoms = unexplained haunting, the universe letting something slip
- Scout drifts (v2) = slow narrative drip, fragments found in the flow
- Doppler-echoes (v3) = your past self as competitor

---

## Signal Interaction Summary

Every echo class pulls the player toward louder play. This is intentional — it fights the "be quiet" pillar and creates dramatic tension between ambition and quietness.

| Echo class | Signal cost | When it appears |
|-----------|-------------|-----------------|
| Chronicle wreck (ambient) | +0.02/s in sensor range | Always present on seed, from prior cycles |
| Chronicle wreck (pickup) | +0.10 spike on loot | Triggered when player takes the cargo |
| Phantom | none (zero-cost to the player) | Only when signal zone ≥ PRESENCE |
| Scout drift (v2) | none (pickup is free) | Only visible when signal zone ≥ WHISPER |
| Doppler-echo (v3) | Witness penalty on loss, reward on win | Spawns at cycle start if conditions met |

The echoes together create a gravity well of their own: the more echoes you interact with, the louder you get, the more echoes show up, the faster the Inhibitor wakes. The player has to decide how deeply to engage with the past.

---

## Determinism

Every echo class must be deterministic from the seed + history:

- **Chronicle wrecks** are keyed by `(seed, deathTimestamp, deathPosition)`. The control plane stores a roster of wrecks per seed. Two clients on the same seed see the same chronicle wrecks in the same positions.
- **Phantoms** are seeded via `session.rng.rawStream('phantom')` — same seed + same simTime → same phantom spawns (fixed in Codex review as of the phantom tick-quantum commit).
- **Scout drifts (v2)** will use seeded `scoutDriftPos` and `scoutDriftKey` streams.
- **Doppler-echoes (v3)** are deterministic from `(profileId, hullType, mostRecentDeathOnThisMap)`.

Players sharing a seed share a memory of the dead.

---

## What We're Not Doing

Explicitly out of scope for the feature family:

- **Echoes as a menu screen.** You do not open a tab called "Echoes." They are in the world. They are the world.
- **Echoes as collectibles.** No achievement, no checklist, no percentage. Pickup is a moment, not a milestone.
- **Echoes as lore dumps.** No fragment should explain the game. Fragments are voices, not exposition.
- **Echoes that give mechanical bonuses.** Echoes carry items; items give bonuses. The echo itself is not a power-up.
- **Echoes from other LBH installations.** No network effects, no shared leaderboard of pilot deaths. Every player's echoes are keyed to their own control plane state (plus per-seed sharing within that plane). Cross-player echoes are a post-multiplayer discussion.

---

## Three Sentences to Hold Against Every Echo Decision

1. **The dead are in the world with you.** Not in a menu, not in a history log — in the world.
2. **Recognition is the payload.** The scariest echo is the one you recognize. The most meaningful fragment is the one that describes what you're about to do.
3. **The loop is the story.** Echoes are not "content added to a roguelike." They are the direct mechanical expression of the pillar "The Universe Is The Clock." Pilots die. The universe keeps score. The score is the game.

---

## See Also

- `ECHOES-V1.md` — implementation spec for chronicle wrecks (v1 feature)
- `RETURNAL-REFERENCE.md` — prior art and aesthetic framing
- `RETURNAL-APPLICATION.md` — parallel application plan
- `META-LOOP.md` — RunResult + chronicle foundation
- `MAP-SEEDS.md` — determinism layer
- `INHIBITOR.md` / `INHIBITOR-V1.md` — the other "the universe notices you" system

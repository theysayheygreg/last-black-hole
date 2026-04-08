# Ghosts, Wrecks, and the Evidence of Past Runs

> Dead pilots are not gone. They are data, they are landmarks, and they are threats.
>
> This doc proposes how past-run echoes manifest in LBH — the mechanical, aesthetic, and narrative system for "the dead are in the world with you." Builds on META-LOOP.md, MAP-SEEDS.md, RETURNAL-REFERENCE.md.

---

## Prior Art

Three traditions in how roguelikes handle the dead:

| Game | What It Does | What It's For |
|------|--------------|--------------|
| **DCSS player ghosts** | When you die, your character is serialized into a ghost file. The ghost spawns in another player's game with your stats, spells, and equipment. Killing it gives XP. | A skill test. "Can new-you beat old-you?" Also shared-world feel — you kill other players' ghosts, they kill yours. |
| **Caves of Qud tombstones** | Your dead characters leave tombstones at their death location. Mostly ornamental — you can visit them, read them, but they're not gameplay threats. | Mortality as setting. The world accumulates the history of its players. |
| **Returnal scout corpses** | Dead Selene corpses appear in biomes as landmarks. Each carries a voice log (unreliable). Your *own* corpses are marked and spawn vengeful Echoes when approached. | Narrative artifacts. Every corpse is a story fragment and an ambient threat. |

All three have something to teach LBH. None of them map cleanly on their own — we need our own synthesis.

---

## Design Goals

What we want the ghost system to do, in priority order:

1. **Make past runs persist in the world.** A player who dies at 03:12 leaves evidence another pilot (or the same pilot's next run) can find.
2. **Create existential dread through recognition.** The most unsettling wreck is the one you recognize — your own, or one that looks like yours, or one that was doing what you're about to do.
3. **Give dying a positive feedback loop without undermining the pillar "Loss Is Loss."** Ghost loot is a reward for whoever finds it, not a refund to the pilot who died.
4. **Feed the pillar "Universe Is the Clock."** Ghosts are *more common the later into a run you are*, because more pilots have died by then. The longer you play, the more crowded with the dead the universe becomes.
5. **Tie into signal naturally.** Ghosts should leak signal. Approaching them is both rewarding and a tax on quietness.
6. **Work within our determinism layer.** Ghost placement should be seeded-deterministic where possible, so the same seed produces the same ghost-memory map across all clients.

---

## The Three Ghost Classes

We propose three distinct mechanical layers. They are complementary, not alternatives.

### 1. Chronicle Wrecks (the Qud style, baseline)
**The dead persist as evidence.**

When a pilot (human or AI) dies, their position is recorded as a **chronicle wreck** — a lootable derelict that carries:
- The pilot's name and hull type
- A short unreliable chronicle fragment (see below)
- A small loot package drawn from what they were carrying (but NOT all of it — loss is still loss)
- A death cause tag (well, vessel, collapse, inhibitor, etc.)

Chronicle wrecks persist across sessions. They are stored in the control plane, keyed by map seed and death timestamp. A pilot replaying the same seed will encounter chronicle wrecks from their own previous attempts on that seed and from other pilots who played that seed before them.

**Mechanically:**
- Tier: chronicle wrecks roll their tier from the *pilot's actual cargo peak* during their run. A pilot who reached a T4 item leaves a T3+ wreck. A pilot who died with nothing leaves a T1 wreck. Quality scales with what they earned, not a random roll.
- Value: 60% of the original cargo value. The rest is *lost to the void* — LBH's "Loss Is Loss" pillar holds. The dead player does not get their stuff back by dying near a friend.
- Signal leakage: chronicle wrecks leak signal at a low constant rate (0.02/s while within sensor range). Approaching them is noisy.
- Limit per seed: max 8 chronicle wrecks per seed to avoid visual/performance sprawl. Oldest evicted first.

**Aesthetically:**
- Larger, more broken-looking than regular wrecks
- Each has a name inscribed on it (the pilot's callsign or hull nickname)
- Faint pulse of signal visible even at distance (one of the "figures in the fog" from RETURNAL-REFERENCE.md)
- Tier color is *muted* — chronicle wrecks always look like the thing happened a while ago

**Narrative:**
- Each carries a fragment: one-line unreliable text. Examples:
  - `"the drifter told me the current was safe. it was not."`
  - `"i did not hear the inhibitor. i felt it first."`
  - `"this was going to be my last run. it is."`
  - `"i think the wells are breathing."`
  - `"wasn't looking at it."`
- Fragments are authored by us (not procedural), drawn from a pool of 40-60 lines. Selected by RNG stream keyed to the pilot's death cause + hull.
- The fragment shows as a tooltip when a player comes within pickup range. Delivered terse, lowercase, no attribution.

### 2. Doppler-Ghosts (the DCSS style, gameplay test)
**Your own past self hunts you.**

A doppler-ghost is an **AI player spawned at the start of a run that replays the last failed cycle of this hull type**. The doppler inherits:
- Your hull (same class as yours for this run)
- Your rig levels (at time of death)
- Your equipped artifacts (ghost copies — they don't count as your loot)
- Your personality? No — the ghost uses an **aggressive scavenger-like AI** tuned to pursue you specifically. It knows you're coming.

The doppler-ghost is **not an enemy in the combat sense** — LBH doesn't have combat like that. Instead the doppler-ghost competes with you for wrecks, beats you to portals, and *drops the signal it generates on your head*. The doppler is a scavenger who moves faster than you, because it knows the currents you should have known last run.

**Mechanically:**
- Spawns once per run where a doppler condition is met: you have at least one recorded death with the current hull type, on the current map, in the last 5 runs.
- Doppler has your hull's full coefficient resolution at your time of death. If you died with Laminar 3 + Gleanings 1, the doppler is also Laminar 3 + Gleanings 1.
- Doppler is visually *tinted* — ghost-cyan outline, name shown as `[ghost] <your callsign>`.
- Doppler CANNOT die in conventional ways. It can be outpaced, evaded, and *extracted away from* — but not killed by pulses or wells. It persists until you extract or die.
- If the doppler extracts before you, you get a **witness penalty**: +0.05 flat signal for the rest of the run. "Your better self got out. You didn't."
- If you outpace the doppler (extract first), you get a **resolution reward**: +20% EM on this run's cargo, plus a permanent chronicle entry that the doppler has been *beaten*. The dead version of you is released.

**Aesthetically:**
- Ghost-cyan outline with faint scan-line distortion
- The ship itself is a literal copy of yours — same hull, same rig, same equipped items, rendered in the ghost palette
- When it passes through currents, it leaves a phosphorescent wake the regular ships don't
- Has its own ability animations — watching it use flow lock or burn is *uncanny*, like watching a replay of your own hands from outside
- Appears at map start in a position *farther from you* than any well — usually on the opposite edge of the map

**Narrative:**
- "you died here before. you are watching yourself do it differently."
- Thematically: the doppler is the pillar. The universe is the clock, and some of the clock's ticks are *the versions of you that didn't make it*. Every run has a witness. The witness is you.

### 3. Scout Fragments (the Returnal style, ambient narrative)
**Voices from pilots who came before.**

Scout fragments are **small environmental pickups** — not wrecks, not ghosts. They are data packets the player finds scattered in the world, drifting in the current. Each is a short text fragment, numbered, that the player can read in the Chronicle screen.

**Mechanically:**
- Spawn at seeded positions, 3-6 per run, in currents (not at wells).
- Picking one up is free — no signal cost, no cargo slot required. They go directly into the pilot's persistent Chronicle.
- Each fragment has a **key** (e.g., `scout-047-drift-rev`) so the same fragment won't show twice until the full pool is seen.
- Pool: 80-120 fragments authored by us, spread across themes: first-run discoveries, late-run despair, observations about the Inhibitor, notes about other pilots, things that don't make sense, things the pilot thought they saw.

**Aesthetically:**
- Scout fragments are tiny phosphorescent motes in the fluid — almost invisible at low signal, easier to see when your own signal is up. "You only see the dead when you're loud enough for them to hear you."
- Pickup animation: the fragment briefly becomes a floating hologram of text, then dissolves. The text plays in a chronicle-tab overlay for 3 seconds.
- Audio: a single held synth note, unresolved. (Future audio pass.)

**Narrative:**
- Deliberately unreliable. Fragments contradict each other, reference things that didn't happen, occasionally address the reader directly.
- Some fragments are "first-run honest" — clearly written by a pilot encountering something for the first time. Others are "late-run broken" — clearly written by a pilot who has been through this too many times. The player cannot tell which is which.
- Examples:
  - `[scout-012] the currents taste different today. brighter. is that a word for current.`
  - `[scout-047] i have been here before. not this run. before everything.`
  - `[scout-063] the hauler i saw at 03:11 — was that you?`
  - `[scout-084] i think the wells are not holes. i think they are ears.`
  - `[scout-099] do not follow the signal. it is not a direction.`

---

## How They Work Together

The three classes are designed to stack:

- **Chronicle wrecks** are the ambient evidence — most runs will have 2-4 visible at a glance.
- **Doppler-ghosts** are the personal challenge — up to 1 per run, competing with you directly.
- **Scout fragments** are the slow drip of narrative — 3-6 per run, read between runs.

A normal run at the 3-minute mark might look like this:

> The player is surfing a current toward a wreck wave. They see another wreck in the distance — a chronicle wreck of a Drifter named `[lantern]` who died on this seed two cycles ago, when a different player took it. Picking it up takes 4 seconds and costs 0.3 signal, but gives a partial T3 item loadout from `[lantern]`'s final inventory.
>
> Meanwhile, the player's doppler-ghost — `[ghost] you`, a Resonant with the exact rig they had when they died last Tuesday — is on the far side of the map, visible as a cyan outline drifting toward the first portal. The player can feel the timer: either they extract before the doppler, or they eat the witness penalty.
>
> Also floating in the current, the player passes a phosphorescent mote — `[scout-063] the hauler i saw at 03:11 — was that you?` — and the player happens to be playing a Hauler, and the timer reads 03:11, and the player does not know what to do with that information.

**This is the feeling we want.**

---

## Signal Interaction

Ghosts tie into the signal system in specific ways:

- **Chronicle wrecks** passively leak signal (0.02/s at close range). Looting them spikes signal like looting a T2+ wreck. Adding them to a run makes the universe noticier.
- **Doppler-ghosts** generate signal independently. The doppler is *always loud* — its signal level is fixed at 0.4. This means the Inhibitor wakes faster when a doppler is present. Your past self is making the universe notice the present you.
- **Scout fragments** are silent to pick up but only visible when the player's signal is above WHISPER. Quiet pilots miss most fragments. "You don't see the dead until you start becoming them."

This means ghosts pull the player *toward* louder play — a pressure that fights the existing "be quiet" pillar. That's intentional. Ghosts are the dramatic pull of ambition; the existing signal system is the cost of ambition. They balance each other.

---

## Seed Determinism

For client-side prediction to work, ghosts must be deterministic from the seed:

- **Chronicle wrecks** are keyed by `(seed, deathTimestamp, deathPosition)`. The control plane stores a roster of wrecks per seed. When a new run starts on that seed, the roster is queried and the first N wrecks are placed deterministically.
- **Doppler-ghosts** are deterministic from `(profileId, hullType, mostRecentDeathOnThisMap)`. The ghost's hull, rig, and equipped items are frozen at time of death. The ghost's spawn position is rolled from a seeded stream (`dopplerSpawn`).
- **Scout fragments** are fully seed-driven. Positions roll from a `scoutFragmentPos` stream. The specific fragment keys roll from a `scoutFragmentKey` stream. Same seed = same fragments in the same places.

This means players sharing a seed share a *ghost memory*. "Seed 4821, the chronicle wreck near Charybdis has a Drift Engine, and there's a scout fragment at 2:14 that says something about the hauler."

---

## What This Costs Us (Honestly)

This is a big system. Here's the actual lift:

**Server-side:**
- Chronicle wreck persistence layer (extend control plane schema)
- Doppler-ghost spawn + AI path (extend existing AI player system)
- Scout fragment pool (new module) + seeded placement
- New RNG streams: `chronicleWreckPlacement`, `dopplerSpawn`, `scoutFragmentPos`, `scoutFragmentKey`

**Client-side:**
- Chronicle wreck visual (distinct from regular wrecks)
- Doppler-ghost visual (ghost palette + outline)
- Scout fragment visual (phosphorescent motes)
- Pickup UI for scout fragments (brief hologram text overlay)
- Chronicle screen addition (new tab for collected scout fragments)

**Content:**
- 40-60 chronicle wreck fragments (one-line flavor)
- 80-120 scout fragments (short flavor)
- All authored, not procedural. This is the single largest content cost.

**Balance:**
- Doppler-ghost tuning (how fast should it move? when does it win?)
- Chronicle wreck loot scaling (60% feels right, needs playtest)
- Signal costs of ghost interaction

Rough estimate: **1-2 weeks of work for the v1 implementation**, plus 2-3 days of writing for the fragment pools.

---

## Decisions Needed From Greg

1. **Which class ships first?** Chronicle wrecks are the easiest and most atmospheric. Dopplers are the most dramatic but risk "I beat a ghost of myself" feeling unearned if not tuned right. Scout fragments are the cheapest per-unit but the slowest to show value (you need a populated pool). My recommendation: chronicle wrecks first, scout fragments second, dopplers last.
2. **Do fragment pools ship all-at-once or grow over updates?** A growing pool creates a "something new in the void" feel. A locked pool is easier to balance.
3. **How tight should the "loss is loss" pillar be?** Currently the design says 60% of dead-pilot cargo shows up on their chronicle wreck. That's a 40% tax. Greg's call.
4. **Does the doppler-ghost concept survive contact with Greg's taste?** It's the most Returnal-ish mechanic but also the one that could feel gimmicky or punitive. If it doesn't fit, it dies and we ship the other two.
5. **Are scout fragments ambient only, or do some unlock things?** Unlocks feel metroidvania-adjacent (cool). They also create pressure to read them for gameplay reasons (bad — they should be atmosphere, not checklist).

---

## Vibes We're Chasing

Three sentences to hold against every design decision on this system:

1. **The dead are in the world with you.** Not in a menu, not in a history log — in the world.
2. **Recognition is the payload.** The scariest wreck is the one you recognize. The most meaningful fragment is the one that describes what you're about to do.
3. **The loop is the story.** Ghosts are not "content added to a roguelike." They are the direct mechanical expression of the pillar "The Universe Is The Clock." Pilots die. The universe keeps score. The score is the game.

See RETURNAL-REFERENCE.md for the aesthetic and UI direction this plugs into.

# Echoes v1: Chronicle Wrecks

> ECHOES.md establishes the feature family ("echoes of past cycles") and lists four classes: chronicle wrecks, phantoms, scout drifts, and doppler-echoes. This doc is the v1 implementation spec for the first class only — **chronicle wrecks**, the persistent loot-bearing wrecks of pilots who died loudly enough for the universe to remember.
>
> Phantoms are already shipped as THE PHANTOM (client-only visual). Scout drifts are v2. Doppler-echoes are v3. They all share the same determinism layer but add complexity that should wait until chronicle wrecks have been playtested.
>
> **Lore framing:** every chronicle wreck is an echo of a cycle that ended. The wreck belongs to a pilot whose cycle collapsed, in the same seed, before the current cycle began. The wreck is not a memorial — it is a piece of the universe that did not fully clear when that cycle ended. Loot is still loot, but the item was carried by someone who is no longer here, in a cycle that did not finish the way this one will.

---

## What V1 Is

**One sentence:** when a pilot dies on a seed, their death creates a persistent wreck on that seed that other pilots (and the same pilot in later cycles) can find, loot for partial inventory, and read a short unreliable chronicle fragment from.

**Not in V1:**
- Doppler-echoes (AI that replays your last death). Deferred to v3.
- Scout fragments floating in currents. Deferred to v2.
- Pilot-authored inscriptions (player types their own epitaph). Deferred until we know the writing pool holds up.
- Cross-seed echo propagation (your death on seed A shows up on seed B). Out of scope — breaks the determinism story.

---

## Cite This Section

Every visual token in this doc is pulled from `DESIGN-SYSTEM.md`. Where this doc says "accretion gold," it means `#FFD966`. Where it says "inhibitor magenta," it means `#CC1A80`. If this doc invents a token, that's a bug.

---

## Data Shapes

### ChronicleWreck (persisted)

Stored in the control plane, keyed by `(mapId, seed, wreckId)`. Wreck id is a deterministic hash of `(seed, deathTick, pilotClientId, deathPosition)`.

```js
{
  wreckId: "wreck-4821-0f3c1a",         // deterministic hash
  mapId: "shallows",                     // map topology this wreck belongs to
  seed: 482190847,                       // the map seed this wreck belongs to
  createdAt: "2026-04-07T19:24:11Z",     // ISO timestamp for eviction
  pilotName: "lantern",                  // pilot callsign at time of death
  hullType: "drifter",                   // one of the 5 hulls
  deathCause: "well",                    // well | vessel | collapse | swarm | scavenger | disconnect
  deathEntityId: "well-charybdis",       // the well/entity that killed them, if any
  wx: 1.42, wy: 2.18,                    // death position in world coords
  survivalTime: 192.4,                   // seconds at death
  signalPeak: 0.62,                      // 0..1
  signalPeakZone: "flare",               // zone label at peak
  peakCargoValue: 420,                   // the highest cargo value they ever held, for tier rolling
  tier: 3,                               // derived from peakCargoValue (see §Tier Table)
  loot: [                                // 60% of their final cargo, frozen at death
    { id: "drift-engine", tier: 3, value: 287, ... },
    ...
  ],
  fragment: "wasn't looking at it.",     // authored chronicle fragment (see §Fragment Pool)
}
```

### Control Plane Schema Addition

New table (or JSON collection) `echoes`:

```
echoes/
  {mapId}/
    {seed}/
      {wreckId}.json   ← individual wreck records
      index.json       ← { wrecks: [wreckId, ...], evictedAt: timestamp }
```

**Cap:** max 8 chronicle wrecks per seed. When a 9th would be created, evict the oldest by `createdAt`.

**TTL:** no automatic TTL in v1. Wrecks persist until manually cleared or evicted by cap. V2 may add a 30-day expiry.

---

## Spawn Rules

### On Death (server-side, sim-runtime.js)

When `commitPlayerOutcome(player, "dead")` fires for a human pilot (not AI), *after* the existing run-result package is built, call `maybePersistChronicleWreck(player, runtime, session)`:

```js
function maybePersistChronicleWreck(player, runtime, session) {
  // Only persist for human pilots who earned a tier
  if (player.isAI) return;
  if (!session.seed) return;
  if (!player.cargo || player.cargo.every(slot => slot == null)) return;

  const peakCargoValue = getPlayerPeakCargoValue(player);  // tracked across run
  const tier = chronicleTierFromCargoValue(peakCargoValue);
  const loot = selectPartialLoot(player.cargo, 0.6);       // 60% rule
  const fragment = pickChronicleFragment(session.rng, player);

  const wreck = {
    wreckId: hashWreckId(session.seed, runtime.tick, player.clientId, player.wx, player.wy),
    mapId: session.mapId,
    seed: session.seed,
    createdAt: new Date().toISOString(),
    pilotName: player.name || player.hullType,
    hullType: player.hullType,
    deathCause: player.deathCause || "unknown",
    deathEntityId: player.deathEntityId || null,
    wx: player.wx,
    wy: player.wy,
    survivalTime: runtime.simTime,
    signalPeak: player._signalPeak || 0,
    signalPeakZone: player._signalPeakZone || "ghost",
    peakCargoValue,
    tier,
    loot,
    fragment,
  };

  controlPlaneClient.saveEchoWreck(wreck);
}
```

### On Session Start (server-side, sim-runtime.js)

In `startSession()`, *after* `applyRunSeed()` and the initial map state is built, fetch any existing chronicle wrecks for this `(mapId, seed)` pair and inject them into `runtime.mapState.wrecks`:

```js
// After applyRunSeed()
const existingEchoes = await controlPlaneClient.getEchoesForSeed(session.seed, session.mapId);
for (const echo of existingEchoes) {
  runtime.mapState.wrecks.push(hydrateEchoWreck(echo));
}
```

`hydrateEchoWreck()` converts the persisted shape into a live wreck that `tickWrecks` and `tickPlayerPickups` understand, plus these extra fields:

```js
{
  ...echo,
  type: "chronicle",              // distinguishes from regular derelicts
  alive: true,
  looted: false,
  pickupCooldown: 0,
  vx: 0, vy: 0,
  spawnTime: 0,                   // from tick 0, since they're ambient
  isChronicle: true,              // used by visual + signal systems
}
```

### Deterministic Placement

The wreck position (`wx, wy`) is stored as-is from the death location. No re-seeding on spawn. If the wreck would overlap another wreck or a well's kill radius on hydration, nudge it outward along the vector from the nearest obstacle until clear. Log the nudge.

---

## Tier Rolling (peakCargoValue → tier)

Chronicle wrecks inherit tier from *what the pilot earned*, not a random roll. A pilot who reached a T4 item leaves a T3-4 wreck. A pilot who only had T1s leaves a T1 wreck.

| Peak Cargo Value | Chronicle Tier |
|------------------|----------------|
| 0-200 EM         | 1 |
| 201-800 EM       | 2 |
| 801-2500 EM      | 3 |
| 2501+ EM         | 4 |

Rationale: it's the dead pilot's accomplishments, not luck. Matches the "evidence of a decision" framing.

**Peak tracking:** add `player._peakCargoValue` to the player state, updated whenever cargo changes. Initialize to 0 on spawn. Never decreases during a run.

---

## Loot Selection (the 60% Rule)

```js
function selectPartialLoot(cargo, keepRatio = 0.6) {
  const filled = cargo.filter(Boolean);
  const keepCount = Math.ceil(filled.length * keepRatio);
  // Keep the highest-value items (deterministic: sort by value descending)
  const sorted = [...filled].sort((a, b) => (b.value || 0) - (a.value || 0));
  return sorted.slice(0, keepCount).map(item => ({ ...item }));
}
```

**Why the highest-value ones?** So the chronicle wreck feels like it's carrying the pilot's best moments. A wreck full of T1 scrap reads as "this pilot never made it." A wreck with a single T3 item reads as "this pilot almost had it."

The remaining 40% is *lost to the void* — LBH's "Loss Is Loss" pillar holds. The dead pilot does not get their stuff back; someone else can find 60% of it.

---

## Fragment Pool

Authored text fragments. v1 ships with 40 fragments across 5 death cause categories. Selection is seeded via `session.rng.pick('chronicleFragment', pool)` so the same seed + same death cause = same fragment.

**Pool shape:**
```js
const CHRONICLE_FRAGMENTS = {
  well: [
    "the drifter told me the current was safe. it was not.",
    "wasn't looking at it.",
    "the pull was louder than i was.",
    "i thought i could surf the edge of it.",
    "never fight the river. i forgot i knew that.",
    "it had a name. charybdis. that should have been enough.",
    "the well was smaller a minute ago.",
    "i hesitated.",
  ],
  vessel: [
    "i heard it before i saw it.",
    "the figures in the distance were not distant.",
    "there is something in the void that does not want us here.",
    "i did not hear the inhibitor. i felt it first.",
    "it was not a shape. it was a decision.",
    "the signal was me. i was loud.",
    "i thought if i stayed quiet it would forget.",
    "it was never going to forget.",
  ],
  collapse: [
    "the universe ran out before i did.",
    "i was still looking for another portal.",
    "there is no such thing as a safe pace.",
    "i was going to leave. i always was.",
    "the clock was the universe all along. the universe was the clock.",
    "i think the wells are breathing slower now.",
    "last cycle i made it.",
    "if you find this, you had more time than i did.",
  ],
  swarm: [
    "they drained everything. even the name of the thing i was holding.",
    "i dropped it so i could run. then i dropped the other one.",
    "the hauler i saw at 03:11 — was that you?",
    "every swarm is the same swarm.",
    "i didn't hear them arrive.",
    "there is no silence loud enough.",
    "i thought i could outrun them. i could not outrun them.",
    "the swarm is what the void remembers.",
  ],
  scavenger: [
    "someone beat me to it.",
    "i was not the only one watching the wreck.",
    "the scavengers are us from another cycle. i think.",
    "they don't talk to me anymore.",
    "i recognized the callsign. i should not have.",
    "the vulture had my old paint on it.",
    "i got greedy.",
    "i think they were warning me.",
  ],
};
```

**Selection:**

```js
function pickChronicleFragment(rngStreams, player) {
  const cause = player.deathCause || "collapse";
  const pool = CHRONICLE_FRAGMENTS[cause] || CHRONICLE_FRAGMENTS.collapse;
  return rngStreams.pick('chronicleFragment', pool);
}
```

**Authoring notes:**
- All lowercase. Terse. Unreliable. No proper punctuation at ends (except where it adds weight).
- First person. The pilot is writing.
- Contradictions across fragments are a feature. Don't try to make them consistent.
- The fragments should occasionally address "you" — the player reading them. Not always. Just sometimes.
- No spoilers, no mechanics explanations, no tutorial content. These are *voices*, not info.

**Writing budget:** 40 fragments for v1 is enough. Pool grows to 80-120 in v2 when scout fragments ship.

---

## Visual Spec

Chronicle wrecks render differently from regular wrecks. They should be **immediately distinguishable** from normal derelicts at a glance.

### Canvas Overlay (wreck render in `main.js`)

Cite DESIGN-SYSTEM.md §2 color tokens:

| Element | Token | Value |
|---------|-------|-------|
| Wreck glyph glow | Accretion gold | `#FFD966` |
| Wreck glyph color at rest | Muted gold | `rgba(255, 217, 102, 0.5)` |
| Wreck glyph color in pickup range | Bright gold | `rgba(255, 217, 102, 0.95)` |
| Inscription text | Accretion gold | `rgba(255, 217, 102, 0.7)` |
| Pilot name tooltip | Accretion gold | `rgba(255, 217, 102, 0.85)` |
| Signal leak pulse | Inhibitor magenta | `rgba(204, 26, 128, 0.15)` — soft, slow pulse |
| Fragment text (when displayed) | Accretion gold | `rgba(255, 217, 102, 0.9)` |

**Key visual differences from regular wrecks:**
- **Size:** chronicle wrecks render at 1.3× the glyph count of a regular wreck (they're "bigger," more broken)
- **Glyphs:** use a heavier character set — `#`, `%`, `@`, `&`, `8` — instead of the regular wreck's lighter set
- **Pulse:** a slow 1.5s sine pulse on the wreck's outer glow (regular wrecks are static). Pulse is subtle — max 10% brightness variation.
- **Signal leak halo:** a barely-visible magenta aura at ~1.5× the wreck radius, pulsing opposite-phase to the gold glow. This is the visual cue that approaching the wreck costs signal.
- **Tier ring:** a ring of faint characters around the wreck whose count reflects the tier (1-4 concentric layers).

### Tooltip (on approach within sensor range)

When the player's ship comes within sensor range of a chronicle wreck, a small tooltip overlay appears near the HUD bottom-center:

```
[  chronicle wreck                       ]
[  pilot: lantern (drifter)              ]
[  lost at 03:12 — well                  ]
```

Tooltip uses the standard HUD panel spec from DESIGN-SYSTEM.md §4:
- Background: `rgba(0, 2, 12, 0.6)`
- Border: `1px solid rgba(80, 100, 140, 0.2)`
- Padding: `8px 12px`
- Font: JetBrains Mono 11px
- Text color: accretion gold `rgba(255, 217, 102, 0.85)`
- Radius: 2px

### On Pickup (fragment display)

When the player successfully loots a chronicle wreck, the fragment text displays as a transient centered overlay — same animation as existing warning messages (0.3s fade in, 2500ms hold, 0.5s fade out).

Style:
- Font: JetBrains Mono 14px, lowercase
- Color: accretion gold `rgba(255, 217, 102, 0.9)`
- Text shadow: `0 0 8px rgba(255, 217, 102, 0.4)`
- Position: center screen, above warnings, below timer
- Format: `"{fragment}"` in quotes, with a smaller attribution below: `— {pilotName}, cycle ended`
- No background panel. Text floats over the sim.

---

## Signal Integration

Chronicle wrecks leak signal. This is the feature that makes them a tradeoff — they're free loot that costs quietness.

**Passive leak:**
- When a player is within sensor range of a chronicle wreck, add `0.02/s` to the player's signal generation. Applied in `tickPlayerSignal` as a new contributing term.
- Stacks per wreck — sitting between two chronicle wrecks is double the leak.
- Does not apply to chronicle wrecks the player has already looted (flipped `looted: true`).

**Loot spike:**
- Looting a chronicle wreck causes a signal spike like looting a regular wreck of the same tier, *plus* an extra `+0.10` bonus spike. "Taking something from the dead makes noise."

**Why this works:**
- Chronicle wrecks are the loudest loot in the game. That's the right feel — they're dramatic, they're stories, they're not free.
- Pilots who want to run quiet will avoid them entirely. Pilots who want to dance with the Inhibitor will dive in.
- Ties directly to Pillar 3 "Signal Is Consequence" and the Returnal-Application steal #5 "Signal as Voice."

---

## Integration Points (file by file)

### scripts/sim-runtime.js
- Add `player._peakCargoValue` tracking on cargo updates
- Add `player.deathCause` and `player.deathEntityId` population in death event paths (well death, vessel death, collapse, swarm, scavenger)
- Add `maybePersistChronicleWreck()` call in `commitPlayerOutcome`
- Add echo wreck hydration in `startSession` after `applyRunSeed`
- Add chronicle wreck signal leak in `tickPlayerSignal`
- Add extra signal spike in chronicle wreck pickup path

### scripts/seeded-generation.js
- Add `CHRONICLE_FRAGMENTS` pool (server + client mirror)
- Add `pickChronicleFragment(rngStream, deathCause)` function

### src/seeded-generation.js
- Mirror the pool and picker for client-side rendering

### scripts/control-plane-runtime.js + control-plane-store.js
- Add `/echoes/:seed` endpoints (GET list, POST create)
- Add `echoes/` storage directory
- Add 8-per-seed cap with oldest-eviction

### scripts/control-plane-client.js
- Add `saveEchoWreck(wreck)` and `getEchoesForSeed(seed, mapId)` methods

### src/main.js
- Add chronicle wreck rendering in the wreck render pass (distinct visual)
- Add chronicle wreck tooltip on approach
- Add fragment overlay on successful loot
- Extend wreck pickup response handler to display fragment

### src/hud.js
- Extend warning display to handle "chronicle fragment" as a new warning type (different styling)

### Protocol
- `run.result` event already carries enough data. No new events needed for v1.
- Snapshot includes chronicle wrecks in `world.wrecks` with `type: "chronicle"` — client discriminates on type.

---

## Determinism Story

- **Wreck positions** are deterministic per death (pilot died there, we store the coordinates). Not seeded.
- **Fragment selection** is seeded via `session.rng.pick('chronicleFragment', ...)`. Same seed + same death cause = same fragment.
- **Loot selection** is deterministic — highest-value 60%, sorted stable.
- **Hydration order** sorts by `createdAt` ascending so the most recent 8 are preserved consistently.

Result: two clients on the same seed will see the same chronicle wrecks in the same places with the same loot and the same fragments, *assuming the same death history has been persisted* in the control plane for that seed.

---

## Playtest Plan

Once v1 ships, three things to check:

1. **Do chronicle wrecks feel like stories?** Play 5 cycles on the same seed. Die in different ways. Come back and find your own wrecks. Do you react emotionally to seeing `"the drifter told me the current was safe. it was not."` on a wreck where you died to Charybdis?
2. **Does the 0.6 loot ratio feel right?** Too high and death is a refund. Too low and chronicle wrecks are ambient art. 60% is the starting bet.
3. **Does the signal leak feel like a real cost?** If players loot every chronicle wreck without thinking, the leak is too weak. If they never loot any, it's too strong. Aim for "sometimes yes, sometimes no, always calculated."

---

## Cut Lines (if under time pressure)

In descending order of cut-ability:

1. **Tier rings (the concentric glyph count)** — decorative, can ship without.
2. **Magenta signal leak halo** — can land with just the gold pulse.
3. **Tooltip on approach** — pilot name + death cause can wait for v2; v1 just shows the fragment on pickup.
4. **Peak cargo value tracking** — could default all chronicle wrecks to tier matching what they died with in that moment. Less narrative resolution but shippable.
5. **Fragment pool diversity** — could ship with 20 fragments instead of 40.

**Do not cut:** the persistence layer, the spawn rules, the pickup fragment display. Those are the core feature.

---

## Open Questions

1. **Does the control plane need a write-through or write-behind cache?** Saving a wreck on every death is a single HTTP call — fine for local, might lag on Tailscale. Probably fine for v1.
2. **What's the eviction behavior when max is hit?** Currently: oldest by `createdAt`. Alternative: oldest by "lowest-value" — evict the T1 wrecks first, keep the T3+ ones. The timestamp rule is simpler and more respectful of history. Going with timestamp.
3. **Should AI player deaths create chronicle wrecks?** Currently no — v1 is human-pilot-only. AI deaths are ambient, not memorial. If we include them the fragment pool would need "AI flavor" variants and the immersion claim ("these are pilots like you") gets muddied. V2 decision.
4. **Do chronicle wrecks count toward the "named wreck" feature in MAP-SEEDS.md?** No — named wrecks are a separate (procedural) feature. Chronicle wrecks and named wrecks can coexist on the same seed.
5. **What happens when a pilot extracts? Do they leave a chronicle wreck too?** No. Extractions are not deaths. Chronicle wrecks are specifically for cycles that did not complete.

---

## Ship Checklist

Codex-usable checklist for the implementation PR:

- [ ] Add `player._peakCargoValue` tracking
- [ ] Populate `player.deathCause` and `deathEntityId` at all death sites
- [ ] Add `CHRONICLE_FRAGMENTS` pool to scripts/seeded-generation.js
- [ ] Mirror pool to src/seeded-generation.js
- [ ] Add `pickChronicleFragment(rngStream, cause)` helper (both sides)
- [ ] Add `maybePersistChronicleWreck()` in commitPlayerOutcome path
- [ ] Add control plane schema for `echoes/{seed}/`
- [ ] Add `/echoes/:seed` GET/POST endpoints
- [ ] Add client methods `saveEchoWreck`, `getEchoesForSeed`
- [ ] Add hydration in `startSession` after `applyRunSeed`
- [ ] Add signal leak in `tickPlayerSignal` for chronicle wrecks within sensor range
- [ ] Add extra loot spike for chronicle wreck pickups
- [ ] Add chronicle wreck visual (distinct glyphs, gold glow, magenta leak halo)
- [ ] Add approach tooltip (HUD overlay)
- [ ] Add fragment display on pickup (centered overlay)
- [ ] 8-per-seed cap with oldest-eviction
- [ ] Determinism test: same seed + same deaths produces same chronicle wrecks
- [ ] Playtest pass

Estimated implementation: **3-4 days of Codex work**. Writing the 40 fragments is ~2 hours of Greg work.

---

## See Also

- `ECHOES.md` — the full three-class proposal (this doc is v1 of class 1)
- `RETURNAL-REFERENCE.md` — the "why" (scout corpses as prior art)
- `RETURNAL-APPLICATION.md` — the parallel application plan
- `DESIGN-SYSTEM-APPLICATION.md` — the compliance pass that precedes this work
- `DESIGN-SYSTEM.md` — the token source of truth
- `META-LOOP.md` — the RunResult + chronicle foundation this builds on
- `MAP-SEEDS.md` — the seed determinism layer this rides on

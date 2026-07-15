# W2-B: The Singularity Anchor Ownership Sketch

> Design-only sketch. S9a is reopened for an explicit Greg decision. This
> document does not guarantee a supermassive anomaly or assign the endgame.

Read with the [S9a/S9b review source](../v0.3.1-design-review.md), the
[W2-B handoff](../v0.3.1-part1-handoff.md), and the
[anomaly catalog contract](../../ANOMALY-CATALOG.md).

## Feel target

The map should feel like a dying universe with a legible center of gravity,
without making every run tell the same radial story. When a supermassive is
present, it can earn the full Interstellar art budget: accretion disk, lensing
band, and doppler-bright approaching side. When absent, that absence must be
authored map character, not missing content.

The anchor question has four separable parts: landmark, endgame owner,
art-budget centerpiece, and optional/seeded versus guaranteed presence.

## Player-facing tell / verb

If selected, the supermassive is the most persistent briefing/world read. Its
existing anomaly tell is paired with a broad, slow fabric signature; its verb
is a committed long orbit or deliberate avoidance, not a new power. The player
should be able to name its direction and risk gradient without a HUD timer.

If absent, the cast/field briefing says so and another route structure carries
orientation. No substitute "fake singularity" silently inherits its endgame or
art role. No option introduces time dilation or a per-player clock.

## Contract / tunables

The existing anomaly contract remains the boundary: bounded fabric signature,
interaction verb, HUD-independent tell/growth behavior, and shared tunables
with units, ranges, steps, and runtime sources, including gravity strength and
reach plus current strength and reach. Presence and ownership are cast/role
decisions, not new physics.

| Option | Landmark | Endgame owner | Art centerpiece | Distribution | Tradeoff |
|---|---|---|---|---|---|
| A. Singular center | Supermassive | Supermassive | Supermassive | Guaranteed where the tier has an anchor slot | Strong title/finality read; risks one radial route and a cramped 5x5. |
| B. Seeded omen | When drawn | Final exfil/Conductor | When drawn | Optional seeded cast | More variety; an absent run needs a replacement orientation read. |
| C. Tiered center | Larger maps | Per-tier choice | One selected XL centerpiece | Optional 5x5, guaranteed or strongly eligible 15x15/25x25 | Protects teaching space; creates tier-specific expectations. |
| D. Anchor slot | Selected XL entry | Selected XL entry or final exfil | Selected XL entry | One seeded XL slot, form open | Preserves the cut if the anchor is not supermassive; weakens the literal title read. |

These are design options, not implementation rulings. Any selected option uses
the existing seeded cast, anomaly adapter, and Conductor contracts.

The ratified shipping trio remains catalog vocabulary: supermassive, micro
black hole, and pulsar. Ratification does not mean every map contains every
member. The 15-entry shipping cut keeps one XL anchor slot; all 50 catalog
entries remain designed. Persistent keys remain deferred, so the anchor cannot
become a persistent-key gate.

Map-scale interaction remains open with the presence rule:

- 5x5: an XL centerpiece competes with teaching space and may be absent or
  optional.
- 15x15: one anchor can define a readable risk gradient without consuming the
  route; use a deliberate tier rule or seeded draw.
- 25x25: a supermassive supports long-route orientation and deep salvage, but
  an optional cast keeps other XL forms and the conditional Roil legible.

## Authority ownership

- Seeded generation owns eligible cast, presence/absence, and placement input.
- The authoritative sim owns the selected anomaly's position, signature,
  growth, contact, and world events through the existing adapter.
- The Conductor owns severity waves and extraction timing. It owns terminal
  transition only if Greg selects the supermassive as endgame owner; otherwise
  final-exfil/convergence remains the candidate owner.
- Renderer owns only the selected cast's Interstellar presentation.

The Roil remains conditional on existing Conductor severity waves. An anchor
cannot manufacture those waves by implication.

## Risks

- A guarantee can make route knowledge a single radial solution or overfill
  5x5; optional presence can make the title promise feel absent.
- Combining landmark, endgame, and art roles couples three tuning problems.
- A non-supermassive XL centerpiece can preserve variety but blur the trio's
  emotional roles.
- Narrative language must not leak in persistent keys, per-player time, or
  bespoke endgame physics.

## Focused test / evidence

Compare same-seed families across 5x5, 15x15, and 25x25, including absent-
anchor cases where the chosen policy permits them:

1. Preview and authority agree on cast, presence, placement, risk gradient,
   and final-exfil clearance.
2. HUD-less reviewers order the selected tell and find a coherent orientation
   read when it is absent.
3. The 15-entry cut, trio, no-persistent-key boundary, and no-per-player-time
   boundary remain intact.
4. The Roil's wave origin remains the existing Conductor evidence; an anchor
   alone cannot produce Roil waves.

This docs-only pass ran no gameplay, browser, or harness tests.

## Open Greg decisions

1. **Presence rule:** guaranteed on every eligible map, guaranteed only on
   15x15/25x25, or optional/seeded on all bands?
2. **Ownership split:** landmark-only, endgame owner, or replaceable XL slot?
3. **Art promise:** does the centerpiece budget follow the supermassive only,
   or whichever XL anchor is cast?
4. **Teaching and trio:** how should 5x5 and the ratified vocabulary be shown
   when the supermassive is absent?

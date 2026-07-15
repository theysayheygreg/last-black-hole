# W2-B: Map Field Effects Sketch

> Design-only sketch. EVE w-space is the model: one map-wide condition, or
> none, selected from a catalog and applied uniformly to every participant.

Read with the [S9a/S9b review source](../v0.3.1-design-review.md), the
[W2-B handoff](../v0.3.1-part1-handoff.md), and the
[anomaly catalog contract](../../ANOMALY-CATALOG.md).

## Completion status

- **Outcome:** Done as a design-only W2-B sketch; no field is implemented.
- **Evidence:** Source links resolve, the accepted/open/later boundary is
  explicit, and the docs-only contradiction and diff checks pass.
- **Deviations:** None from the accepted S9b boundary; no bespoke physics,
  authority, per-player time, or gameplay implementation is introduced.
- **Anchor Updates:** No anchor drift. S9a/S9b, W2-B, and the anomaly catalog
  remain the review anchors.

## Status boundary

| Accepted constraints | Open Greg decisions | Later implementation |
|---|---|---|
| One map-wide field or none; preset vectors over existing authority contracts only; uniform effect; no bespoke physics or per-player time; Roil conditional on existing Conductor severity waves. All 50 encounters remain designed; only the ratified 15 are shipping scope. | Catalog eligibility, vector envelope, signal timing, and briefing tell remain in [Open Greg decisions](#open-greg-decisions). | Any field manifest, seeded selection, authority application, briefing/world presentation, tuning, or runtime evidence follows only after Greg decides. |

## Feel target

The briefing should make a familiar map feel like a different universe before
the drop. A field changes route and loadout decisions without adding a new
ruleset: it is a named preset vector over existing authority contracts, not
bespoke physics, a local zone, or a second per-player clock.

## Player-facing tell / verb

The drop briefing names the field beside the anomaly cast and gives its two or
three largest consequences in existing units or readable multipliers. The
world repeats that identity through existing fabric, wave, signal, or movement
tells. The verb is loadout and route choice: ride the field, quiet down, spend
a pulse differently, or choose a safer line. Everyone gets the same modifier.

## Contract / tunables

Each field is one preset vector. Every component names an existing authority
contract, has a unit, and stays inside a bounded field envelope. These are
design envelopes and starting examples, not implementation orders.

| Existing term | Unit | Candidate envelope | Authority source |
|---|---|---:|---|
| severity wave weight/budget | x over existing wave budget | 0.75x-1.50x | Conductor severity waves |
| signal propagation | x over propagation distance | 0.50x-1.50x | Existing signal contract; S10 eligibility gate |
| drag | x over existing drag | 0.80x-1.25x | Shared movement/physics tunable |
| pulse cost | x over existing cost | 0.75x-1.25x | Existing pulse ability contract |
| pulse loudness | x over existing loudness | 0.75x-1.50x | Existing pulse/signal contract |
| collapse rate | x over existing collapse timing | 0.75x-1.35x | Existing collapse/Conductor schedule |

Starter catalog, expressed only as those terms:

| Field | Preset vector | Read |
|---|---|---|
| Red Giant | `waveWeight 1.25x`; pair with existing loot/difficulty budget | Waves feel closer and richer, not merely punitive. |
| Dark Nebula | `signalPropagation 0.50x` | Quiet universe with shorter information reach; ineligible while S10 is tabled. |
| Ionized Fabric | `pulseCost 0.80x`; `pulseLoudness 1.25x` | Pulses are easier to spend but announce the spend. |
| Dense Fabric | `drag 1.20x`; `pulseCost 1.10x` | Movement settles faster and utility spending matters more. |
| Collapse Wake | `collapseRate 1.15x`; pair with existing reward budget | The same collapse grammar advances faster. |

The risk/reward pairing is a selection invariant: if a field raises danger,
the existing difficulty/loot relationship must raise available reward too. It
does not permit a field currency, loot table, or reward mechanic. No field adds
a force, collision rule, local volume, entity AI, private timer, or player-time
multiplier.

## Seeded selection / eligibility

Proposed order:

`seed -> map size/tier -> eligible field (or none) -> anomaly cast -> existing difficulty/loot budgets -> Conductor schedule`

Use a deterministic field-cast stream independent of anomaly, sea, and loot
draws. Eligibility is data, not a side effect:

- 5x5 may use none or one fixed teaching-safe field.
- 15x15 may draw from the starter catalog after readability and budget checks.
- 25x25 may draw the broader catalog, with stronger but bounded vectors and no
  stacking.

Weights, map eligibility, and whether `none` is a real draw remain open. Reject
a field if its contract is inactive, its paired reward cannot fit the budget,
or its briefing tell is indistinguishable from the anomaly cast.

The Roil remains conditional on existing Conductor severity waves. A field may
scale an already-eligible wave term, but cannot make The Roil appear, create a
wave origin, or replace the Conductor schedule.

## Drop briefing / readability

The route briefing shows field name or `No field`, affected terms and bounded
values, one plain-language route consequence, and the reward/budget consequence
when danger rises. The run repeats the field identity in a compact world tell
and authoritative snapshot/seed-preview truth. One field maximum keeps the
learnable identity to `map + field + anomaly cast`.

## Authority ownership

- Seeded generation owns field selection, eligibility, and immutable match
  vector.
- Sim and Conductor apply it at existing pre-generation or schedule boundaries.
- Server owns resulting movement, pulse, wave, collapse, signal, and reward
  facts.
- UI, fluid, audio, and VFX expose the field; none infer or mutate it.

## Risks

- A global tell can flatten the anomaly cast or make 5x5 impossible.
- Stacking makes briefing and balance unreadable.
- Signal terms could accidentally reopen S10 or smuggle in a new noise model.
- Danger-only effects become a hidden tax; 25x25 may feel unchanged under a
  weak vector.

## Focused test / evidence

1. Same seed reproduces field id, eligibility, vector, briefing, and authority
   snapshot; a changed seed can vary the field without shifting other streams.
2. Every participant receives the same vector, and observed changes map to an
   existing authority contract with no local physics or player clock.
3. Briefing, world tell, and run state agree for 5x5, 15x15, and 25x25 samples.
4. Bounds reject out-of-envelope values, reward pairing holds, and no second
   field is selected.
5. Roil waves still come from Conductor severity scheduling; a field-only
   sample cannot create Roil.

This docs-only pass ran no gameplay, browser, or harness tests.

## Open Greg decisions

1. **Catalog:** which starter fields are eligible, and is `No field` valid on
   each 5x5, 15x15, and 25x25 band?
2. **Envelope:** are the bounds and starting values strong/readable enough?
3. **Signal timing:** keep Dark Nebula design-only until S10, or omit signal
   terms from v0.3.1 entirely?
4. **Briefing tell:** what compact world cue identifies the field without
   competing with the anomaly cast or ASCII-fluid identity?

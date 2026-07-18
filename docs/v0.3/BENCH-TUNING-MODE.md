# The Bench — Tuning Mode Proposal

> **Status: proposal under review.** This is the canonical place to develop the
> Bench proposal, but the complete design is not ratified. The product and
> architecture boundaries marked **Ratified** below are the current authority.
> Unmarked details remain implementation hypotheses and must not silently become
> product commitments.

The Bench is a deterministic scenario runner with an archetype inspector. It
is not a miniature Unity/Godot editor, a map authoring tool, or a second gameplay
authority.

## Ratified product loop

A developer launches one dev-only Bench and enters a fixed-seed Gallery campus
containing every player-visible entity, object, objective, and system family in
named isolated scenario bays. Only the active bay simulates unless the
developer explicitly enables another bay.

The developer clicks an object, sees curated WYSIWYG/contextual properties for
its archetype or linked system, changes a value through the real local
authority, and observes every existing and future instance of that type update
at the declared application time. They can then replay the identical setup
with the active tuning overlay or reset the change.

- Mouse-first developer tool. Deck remains the player and review target.
- Click-to-select is primary. Every instance of the selected type highlights.
- No per-instance value overrides. Instance lifecycle and state are read-only
  or changed only by named scenario actions.
- Direct manipulation is limited to naturally spatial values such as radius,
  distance, and angle, and follows the authority/inspector truth path. Arbitrary
  body dragging and saved stage-layout authoring are out of scope for v1.
- The probe ship is invulnerable and has infinite fuel.

The existing mockups in [`bench-mockups/`](bench-mockups/) are visual reference,
not a ratified interaction contract. Their body-drag and stage-layout concepts
are superseded by the v1 boundary above.

## Contract and authority boundary

Inspector rows come from curated contract metadata, never raw object
introspection. Each tunable declares:

| Field | Meaning |
|---|---|
| `label`, `effect` | Human name and one-sentence gameplay effect |
| `group`, `unit` | Presentation grouping and physical/game unit |
| `min`, `max`, `step` | Valid numeric domain and snap step |
| `scope` | `type`, `family`, or `system` |
| `applies` | `live`, `next-tick`, or `restart` |
| `drawKind` | Optional truthful ruler/overlay affordance |
| `reset` | Shipped baseline and reset behavior |

Every gameplay edit goes through an explicit authority-owned adapter/applicator.
The Bench must not generic-merge arbitrary runtime objects or present client
`CONFIG` as simulation truth. Unsupported selections say **NO TUNABLE CONTRACT
YET** while still exposing read-only identity and scenario actions.

A tuning patch is a validated in-memory JSON overlay. It clearly separates
live-applied changes from restart-banked changes, supports export/import, and
never writes source files. The Bench offers Replay Same Setup, Reset Property,
Reset Type, Revert All, Undo Last Change, and scenario focus/teleport.

“Same setup” means the same Gallery layout, active bay and scenario state,
seed, and tuning overlay. Replay comparisons normalize authority world truth to
exclude volatile IDs and timestamps.

## Gallery scenario contract

The Gallery is a dev-only authority bootstrap outside `PLAYABLE_MAP_IDS` and is
disabled behind an explicit Bench authority gate in release builds. Source
files may still be packaged; the honest boundary is disabled, not stripped.

Named actions are more important than editor features:

- scavengers and other hostiles: patrol, detect, chase, attack, die;
- wrecks and loot: intact, loot, destroy;
- portals and objectives: announce, open, blocked, extract;
- wells and slingshot: growth, wave, engage/release;
- Conductor: phase and event triggers.

The old dev panel remains available until measured Bench coverage equals its
useful knob coverage. Raw or unclear controls retire only as truthful Bench
replacements land.

## Tracked implementation plan

### F0 — Foundation vertical

- [ ] One command/dev entry opens the Bench.
- [ ] Dev-only authority-owned Gallery bootstrap outside `PLAYABLE_MAP_IDS`.
- [ ] Common read-only picking/identity projection for all snapshot families.
- [ ] Generated inspector shell backed by an explicit adapter registry.
- [ ] Honest unsupported-family state: `NO TUNABLE CONTRACT YET`.
- [ ] Same-setup replay, property/type/all resets, one-step undo, and validated
      in-memory patch import/export with live vs restart separation.

### F1 — First complete proof

- [ ] Wells plus linked slingshot contract and one scavenger scenario.
- [ ] Real selection, readable metadata, live/restart authority application,
      existing/future type propagation, ruler overlay, and scenario action.
- [ ] Normalized same-seed replay assertion and patch roundtrip proof.

### F2 — Family coverage

- [ ] Ships and enemies.
- [ ] Debris, wrecks, and loot.
- [ ] Stars, anomalies, and planetoids.
- [ ] Portals and objectives.
- [ ] Fauna and sentries.
- [ ] Conductor states.

Land these as coherent family commits rather than one giant change. Maintain a
coverage ledger against the legacy dev panel before removing useful controls.

### F3 — Later usability

- [ ] Spatial radius/angle/distance handles after the truth path is proven.
- [ ] Better comparison/A-B tools after the core replay loop is useful.
- [ ] Careful legacy panel retirement after measured coverage parity.

Stage-layout authoring remains excluded unless Greg explicitly reopens it.

## Focused proof budget

For each feature commit, run the smallest pure/contract tests and one bounded
interactive proof only when a real world interaction changes. Capture one
visual at a coherent Gallery/inspector checkpoint, not for every small commit.
Full suites, package, Deck deploy, soak, broad browser runs, multiplayer, and
cross-version work are checkpoint lanes rather than per-feature requirements.

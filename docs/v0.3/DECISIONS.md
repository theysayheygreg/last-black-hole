# v0.3 Decisions

> Detailed v0.3 decisions recorded from 2026-07-14 forward.
>
> Earlier Ballpark, authority, renderer-contract, roster, and RC decisions
> remain in the historical `docs/journal/DECISION-LOG.md`. Curate them here
> only when current work needs an explicit active/superseded verdict.

Use **ACTIVE**, **PROVISIONAL**, **REJECTED**, or **SUPERSEDED** on new entries.
The project-wide decision log receives only durable cross-version rules and a
larger v0.3 promotion/release summary.


## 2026-07-14 — v0.3.1 design review decisions (Greg)

Full context and rationale in `docs/v0.3/reviews/v0.3.1-design-review.md`.

- **ACTIVE** — v0.3.1 bar: every system reaches at least v2; nothing
  ships at scaffold quality.
- **ACTIVE** — The sea is authored, not simulated; seeded per match
  (same seed, same sea). GPU fluid is presentation of the authoritative
  field; nothing on screen may promise a force the authority won't
  deliver.
- **ACTIVE** — Canonical thrust 2.5 stick-relative; client conforms.
  Slingshot release capped, no teleport (25% route-margin test).
- **ACTIVE** — Tunables: screen-readable units (meters), declared steps
  (one felt difference), sub-0.01 constants are red flags; undrawable
  tunables fail review.
- **ACTIVE** — Wells become an anomaly catalog (cast, not bestiary);
  trio supermassive + micro + pulsar; Shallows fixed overture. No time
  dilation; never per-player time.
- **ACTIVE** — Conductor replaces Inhibitor pressure: seeded phases,
  severity waves, interval lerps, offset guard, spawn-radius handler.
  Pressure variable and meter deleted.
- **ACTIVE** — Portals: manually activated, extraction always loud;
  locked exfils (keyed loot); final exfil deterministic and guaranteed
  at main-timer end.
- **ACTIVE** — Salvage: interact + dwell, progressive reveal; reveal
  speed is an equipment/skill axis.
- **ACTIVE** — Hostile AI: absolute speed classes (m/s), MGS-style
  spotted indicator, hidden radii with debug visibility, greed-triggered
  aggression; complex behaviors gated behind Wave 1 movement proof.
- **ACTIVE** — Design docs version by release line; freeze old, v2 docs
  become spec.
- **PROVISIONAL** — Death economy: tax carried cargo only, never banked
  EM (Orrery recommendation; Greg call pending).
- **PROVISIONAL** — Planetoid wake: zeroed/disabled until stepped
  through in a later design pass.
- **SUPERSEDED** — Signal-as-level design work: tabled to Wave 3;
  possible future noise+fuel unification (Marathon 2026 heat model).

# v0.3 Changelog

> Detailed v0.3 branch changes recorded from 2026-07-14 forward.
>
> Earlier v0.3 history remains in `docs/journal/CHANGELOG.md`, the v0.3 review
> notes, and git. Summarize larger v0.3 releases or merges once in the
> project-wide changelog instead of replaying every entry.

## Unreleased

### 2026-07-14 — v0.3.1 design review (Parts 1 + 2)

Greg + Orrery full-day design pass. All 18 systems audited; running doc
`docs/v0.3/reviews/v0.3.1-design-review.md` plus companions
(`v0.3.1-velocity-ledger.md`, `v0.3.1-fabric-design.md`) and the
execution package `v0.3.1-part1-handoff.md` (items W1-A..X-C; completion
MDs land in `docs/v0.3/reviews/completions/` for Orrery review).

- Doctrines: screen-readable units (meters), step-change rules, fabric
  truth contract (one flow truth, two resolutions), ruler-layer debug
  overlay, telegraph registry.
- Research inputs: full velocity-contributor inventory, full fabric
  effect inventory (three-seas finding), Wave Race 64 physics, Stellaris
  PVE/AI, deterministic-physics-engine evaluation (verdict: no engine).
- v2 designs locked: movement ladder, slingshot 5-knob contract,
  wrecks (dwell salvage + progressive reveal), portals (manual
  activation, locked exfils, guaranteed final exfil), hostile AI
  (spectrum, greed triggers, anti-cheese), Inhibitor (Conductor clock +
  severity waves; pressure integrator deleted by design).
- The Conductor: seeded sim-controller timing module — threshold fields,
  severity waves, interval lerps, offset guard, spawn-radius handler.
- Tabled deliberately: signal/noise (Wave 3), hulls (one ship first),
  economy spend side, AI player brains (Part 3).


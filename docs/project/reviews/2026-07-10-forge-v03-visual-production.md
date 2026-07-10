# Forge Review: v0.3 Visual Production

> Review date: 2026-07-10. Branch: `codex/v0.3-ballpark-roadmap`.
> Scope: generated art, Three entity lifecycle, UI styling/motion, visual
> evidence, AgentPlayEval, and promo capture truth after the first complete
> v0.3 visual production pass.

## Verdict

The visual direction is coherent and the ownership boundaries are sound. The
review found several real implementation and evidence defects that would have
made dense scenes, reduced-motion play, compact layouts, or promo claims
unreliable. Those defects were fixed rather than accepted as polish.

## Findings Closed

1. Offscreen entity array entries consumed visual budgets before projection.
   Budgets now count successful visible submissions.
2. Explicit zero budgets were replaced by defaults through `||`. Visual
   families now preserve zero as an intentional quality choice.
3. Three backend context listeners survived disposal. Listener ownership is now
   symmetric across create/dispose/recreate.
4. Generated entity art could exist without runtime or reference ownership.
   The catalog is now bidirectionally classified; wells and Inhibitors are
   explicit procedural/reference exclusions.
5. Reduced-motion transitions still ran shader corruption, while runtime timing
   ignored the configured motion duration. One configured clock now owns the
   handoff, overlay, and glitch intensity; reduced motion settles without the
   full-frame fault.
6. The salvage report accepted confirm before its accounting and CTA appeared.
   Visibility and input now share one readiness fact, including reduced motion.
7. Home and route-select minimum columns clipped below 984 pixels. A compact
   three-panel calculation now fits 960x720 and remains covered visually.
8. Profile prompts advertised load/delete on empty slots and normal navigation
   during modals. Copy now reflects the actual selected state.
9. AgentPlayEval retried an entire journey around an unproven slingshot edge.
   It now records and proves one acknowledged engage/release transaction with
   no whole-suite retry masking.
10. The asset compiler embedded a timestamp and retained removed output files.
    Rebuilds are deterministic, generated directories are replaced as a unit,
    and dedicated consumable icon families take precedence over broad matches.
11. Default renderer evidence still spent time on the retired `shipBakeoff`.
    It now lives in the deliberate deep lane; production perf owns call/pool
    ceilings and production play evidence owns the actual hull path.
12. Promo tooling treated fixture-injected gameplay/results as representative
    and could mirror weak/error captures. Capture provenance and failure gates
    are now explicit before iCloud handoff.

## Intentionally Deferred

- Sprite atlas/instancing is measurement-gated. Current production scenes must
  approach the new Three call or pool ceilings, or physical Deck profiling must
  show a bottleneck, before that complexity is justified.
- Canvas named-region checks are brightness/backing proxies, not semantic WCAG
  contrast calculations. Final couch/handheld judgment remains a human gate.
- The dev-only visual reference scene remains part of validation and is not a
  default promo source.

## Required Handoff Evidence

- focused Three lifecycle, UI motion/meta, asset, and slingshot tests;
- fresh `test:fast`, `test:visual`, `test:agent-eval`, and performance evidence;
- promo manifest with provenance, required phases, media metadata, browser
  errors, weak-frame verdict, and iCloud destination;
- Greg's final visual taste and physical Deck Gaming Mode checks remain open.

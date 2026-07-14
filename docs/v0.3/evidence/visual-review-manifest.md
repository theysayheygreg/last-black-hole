# v0.3 Visual Review Manifest

Status: repeatable review index, not an artifact archive.

The screenshot harness writes timestamped output under `tests/screenshots/`, which
is intentionally ignored. This file records the review contract and the most
recent baseline produced in this isolated implementation worktree; it references
those outputs without copying them into source control.

## Overnight baseline record

- Source commit: `47ca73e` (`Palette: lock v0.3 visual direction and evidence`).
- Evidence type: deterministic fixture captures. These are **not** player-reachable proof.
- Command: `npm run test:visual`
- Result: HudDeck, Renderer, and UIVisual passed on 2026-07-11.
- Artifact retention: the worker-local `tests/screenshots/` outputs were ignored
  and were not retained. This records the command result, not durable visual
  evidence. A reviewer must rerun the lane and record fresh paths before making
  a visual acceptance claim.

## RC baseline record

- Source lineage: `codex/v0.3-ballpark-roadmap`, final RC hash reported by
  `npm run release:status`.
- Evidence type: deterministic renderer/UI fixtures plus two natural journeys.
- Commands: `npm run test:visual` and `npm run test:agent-eval` as part of the
  no-retry full lane.
- Result: HudDeck, Renderer, UIVisual, and both AgentPlayEval journeys passed on
  2026-07-14.
- Artifact retention: raw timestamped captures remain ignored. The current run
  paths are recorded in the build-status and RC-gate documents for local review.

Do not turn this index into an artifact archive. Durable selected evidence may
be added later as a small curated set; raw frame sequences, duplicate exports,
and historical promo directories remain outside source control.

## Review matrix

| Surface / behavior | Harness fixture or surface | Required views | Evidence source | What the capture can prove | What it cannot prove |
|---|---|---|---|---|---|
| World family separation | `entityShowcase`, `visualReference`, `shipBakeoff` | scene, ASCII composite, grayscale, 25% proxy at 1280×800 | fixture | assets load, category count, broad contrast, local hierarchy | player-reachable behavior or final taste |
| Player movement | player thrust, brake, slingshot readiness/engage/release | normal and reduced motion temporal capture | fixture or natural journey, labeled at capture time | state accent settles and does not hide the hull | movement feel or gameplay truth beyond published facts |
| Portal route state | ready, blocked, expiring, final, rift | scene, ASCII composite, grayscale | fixture or natural journey, labeled at capture time | aperture remains readable and black-centered | a fixture is not extraction proof |
| Salvage state | intact, looted, cluster, drift | scene, grayscale, 25% proxy | fixture or natural journey, labeled at capture time | value/glint hierarchy and broken mass | loot authority unless natural journey evidence says so |
| Ecology separation | fauna and sentry | scene, grayscale, 25% proxy, temporal capture | fixture | shape/motion distinction at target scale | live AI behavior beyond the fixture |
| UI composition | title, Home, map select, HUD, pause, inventory, extracted/death results | 1280×800, 1280×720 compact, 25% proxy | UI fixture | first-glance hierarchy, selected/warning treatment, local backing | full controller journey unless a natural journey is labeled |
| Motion accessibility | title and UI reduced-motion surfaces | settled 1280×800 still plus temporal comparison | UI fixture | required state survives without motion | subjective comfort across all hardware |

## Capture and labeling protocol

1. Use the existing harness only. Do not edit historical ignored screenshot
   directories or hand-copy images into this document.
2. Capture 1280×800 first; retain 1280×720 compact UI coverage. Generate scene,
   ASCII composite, grayscale, and 25% couch-proxy views where the harness
   supports them.
3. Name every review row `fixture`, `natural journey`, or `representative flow`.
   A fixture may prove presentation contracts; only a natural journey may be
   described as player-reachable proof.
4. Review labels off first. Then inspect grayscale, bright-light display
   conditions, 25% couch proxy, normal motion, and reduced motion.
5. For temporal states, preserve a short capture or frame sequence for thrust /
   brake, slingshot engagement / release, portal transition, wreck interaction,
   and ecology / sentry motion. A still image alone cannot approve those states.
6. Record the exact ignored output path and test command in the commit or PR
   body. This manifest is the stable index, not a mutable run log.

## Review questions, in priority order

1. Can the viewer read a travel line and fabric direction before looking at art?
2. Can they identify player, immediate threat, route anchor, portal, and
   actionable salvage without labels?
3. Does one state accent clarify each entity without becoming a persistent halo,
   ring, trail, label, and sparkle stack?
4. Does the selected UI action, warning, critical gauge, and next input survive
   the two-second 25% couch read?
5. Do normal and reduced motion communicate the same required state?

A passing capture is evidence, not approval. Greg's feel/taste verdict and a
physical Deck review remain separate gates.

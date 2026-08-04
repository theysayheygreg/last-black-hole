# v0.3 Suite Manifest Completeness Receipt

Base: `b5d0a704bf36ada3232cfd107892c7bdc47490dd`
Scope: Item 2 of `docs/project/prompts/2026-08-04-codex-v03-feature-set-repair-program.md`.

`tests/manifest-completeness.cjs` is a fast/core/static/full guard. It inventories
every top-level `tests/*.cjs` file and fails when a file is neither a manifest
suite nor a checked-in exclusion with a reason. It also rejects duplicate,
missing, stale, and both-wired-and-excluded entries.

## Triage

| Prior orphan | Status | Lane or reason |
| --- | --- | --- |
| `agent-play-report.cjs` | Excluded | Shared AgentPlay report helper. |
| `agent-play-route.cjs` | Excluded | Shared AgentPlay route helper. |
| `browser-driver.cjs` | Excluded | Shared CDP driver. |
| `continuous-free-contributions.cjs` | Wired | Fast/core/authority movement ordering. |
| `coordinate-presentation-seams.cjs` | Wired | Fast/core/Three presentation coordinate parity. |
| `deck-ui-map-select-capture.cjs` | Excluded | One-shot Deck capture receipt. |
| `entity-presentation-scale.cjs` | Wired | Fast/core/Three entity-size contract. |
| `fabric-event-wave-capture.cjs` | Excluded | One-shot wave capture receipt. |
| `fabric-lanes.cjs` | Wired | Fast/core/Three fabric corridor contract. |
| `fabric-profile.cjs` | Wired | Fast/core/authority canonical fabric profile. |
| `fabric-readability-cleanup.cjs` | Wired | Fast/core source-wide retirement guard. |
| `fabric-rich-current-capture.cjs` | Excluded | One-shot rich-current comparison capture. |
| `fabric-simplification.cjs` | Wired | Fast/core fabric ownership contract. |
| `fabric-wave-v4.cjs` | Wired | Fast/core/authority conducted-wave contract. |
| `fabric-wave-v5.cjs` | Wired | Fast/core/Three wave presentation contract. |
| `fabric-well-presentation.cjs` | Wired | Fast/core/Three well presentation contract. |
| `free-movement-step.cjs` | Wired | Fast/core/authority ordered FREE movement step. |
| `helpers.cjs` | Excluded | Shared harness helper module. |
| `honest-environment-channels.cjs` | Wired | Fast/core/authority force-attribution guard. |
| `inhibitor-cap-run-reset.cjs` | Wired | Isolated authority/sim reset-cap coverage. |
| `inhibitor-ecology.cjs` | Wired | Isolated authority/sim ecology coverage. |
| `interaction-volumes.cjs` | Wired | Fast/core/authority swept interaction volumes. |
| `noise-radius.cjs` | Wired | Fast/core/authority noise contract. |
| `orrery-route-teaching.cjs` | Wired | Fast/core route and ruler teaching contract. |
| `perf-probe.cjs` | Excluded | Manual performance diagnostic. |
| `pilot-delete-global-mute.cjs` | Wired | Playtest/full browser usability regression. |
| `presentation-evidence.cjs` | Wired | Fast/core HUD and authority-clock presentation. |
| `probe-fuel.cjs` | Excluded | Manual fuel-feel probe. |
| `probe-ship-speed.cjs` | Excluded | Manual ship-speed probe. |
| `probe-slingshot.cjs` | Excluded | Manual slingshot diagnostic probe. |
| `probe-title-prototype.cjs` | Excluded | Manual title-prototype capture. |
| `probe-title-scene.cjs` | Excluded | Manual title-scene capture. |
| `release-package.cjs` | Excluded | Explicit `npm run test:package` release-artifact proof. |
| `run-all.cjs` | Excluded | Manifest runner implementation. |
| `slingshot-input-feedback.cjs` | Wired | Fast/core slingshot input feedback. |
| `slingshot-input-path.cjs` | Wired | Playtest/full normal-input browser route. |
| `star-solar-wind-parity.cjs` | Wired | Fast/core/authority solar-wind parity. |
| `suite-manifest.cjs` | Excluded | Manifest data module. |
| `time-slow-retirement.cjs` | Wired | Fast/core retirement guard. |
| `ui-motion-temporal.cjs` | Wired | Fast/core UI temporal states. |
| `ui-motion-timeline.cjs` | Wired | Fast/core UI timeline values. |
| `ui-rendered-repair-capture.cjs` | Excluded | One-shot dense-UI capture receipt. |
| `well-visual-persistence.cjs` | Wired | Fast/core/Three well visual persistence. |

No prior orphan is deleted in this item. The exclusions are intentionally
conservative: a diagnostic or capture is not silently promoted into a flaky
CI suite, while every executable product contract is now scheduled.

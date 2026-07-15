# v0.3 Changelog

## 2026-07-15

- **Pause/resume reconciliation:** accepted the local-overlay contract: remote
  authority and snapshot intake continue under pause, held/edge input is
  neutralized once on entry, covered presentation coalesces to newest authority
  truth, short resume follows normally, and `1500ms` long resume settles
  camera/fluid/presentation and clears stale UI motion. Terminal, phase, and run
  changes route directly, with cached terminal events scoped to the exact run;
  local sandbox freeze remains separate.
- **Acceptance boundary:** accepted source commits are `59b1646b` plus the
  run-scoping correction `341268b1`; focused proof is `PauseResume 49/49` with
  syntax/diff clean. No headed or visual proof is required for this docs
  acceptance; visual feel remains deferred.
- **Map Select survey terminal:** documented the shipped three-panel hierarchy:
  map-class register, uncertain `SURVEY RECONSTRUCTION`, and possible-contents /
  confidence rail. Player-facing route anchors, path sequence, exact wells,
  portals, wrecks, spawn, object layout, and signal pressure are no longer
  style-guide claims.
- **State and accessibility contract:** valid rows expose launch; locked rows
  expose no action and use withheld/redacted data. Reduced motion uses static
  corruption. Deck/controller surfaces use the accepted graphical glyph family
  without raw keyboard fallback.
- **Scale labels:** active presentation labels are Shallows `5x5`, Expanse
  `15x15`, and Deep Field `25x25`. W2-A4, `codex/v0.3-map-scale-5-15-25` at
  `a5dc28d8`, remains separately implemented and under review; it is not an
  integrated production authority-parity dependency.
- **Accepted proof:** valid Deck capture
  `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/map-select-valid-expanse-deck.png`
  (`2a5d7ee301f2aafbc4b6a341f270559078c2420299b0c1b8495a0a5a8d1a3290`), locked
  Deck capture
  `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/map-select-locked-sector-05-deck.png`
  (`6525190afc7d3a65220ddd5bf65909e503d1961cd155973d8eacd504ae504ea1`), and
  manifest
  `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/manifest.json`
  (`1eb4fbfb5ac7f8bf9e1fa240281490103ce9735c2533a6e2d31e2e248950bb04`).

# v0.3 Changelog

## 2026-07-16

- **v0.3.1 Deck UI Lane A:** added the controller-visible title `B EXIT` path
  through the packaged Electron quit bridge; centralized Deck-safe spacing,
  icon/detail-aware rows, and backed action rails across title, Home, lists,
  inventory, and Map Select; replaced Map Select box clusters with deterministic
  coarse contour surveys for `5x5`, `15x15`, and `25x25`; replaced misleading
  possible-content meters with canonical aggregate descriptions; and separated
  nearby in-match wreck labels with local presentation mattes.

- **Version train:** development now targets `0.3.1`; internal candidates use
  `0.3.1.<commit-hash>`. The deployed `0.3.0.f56175f6` Preview keeps its
  existing identity until a real `0.3.1` artifact replaces it.
- **Deck deploy:** reused the checksum-verified `0.3.0.f56175f6` Linux artifact
  without rebuilding and deployed it to
  `/home/deck/Games/last-singularity-v03`. Remote executable and `app.asar`
  hashes match local. Gaming Mode entry `Last Singularity v0.3 Preview` remains
  app id `3771676273`; Steam userdata `31747533` was backed up before shortcut
  key `19` was refreshed.
- **Side-by-side preservation:** the v0.2 Demo remains at
  `/home/deck/Games/last-singularity-v02`, shortcut key `18`, app id
  `2947990413`. The v0.3 log namespace and launchers exist and no Last
  Singularity coredumps were recorded after deployment. Current candidate boot,
  controls, readability, suspend/resume, feel, and audio remain Greg gates.

## 2026-07-14

- W2-A4 made `shallows`, `expanse`, and `deep-field` authoritative at 5x5,
  15x15, and 25x25 through one ESM/CJS map-scale registry.
- Authored bounds and positions now migrate deterministically by normalized
  composition; scale-encoded active map modules were renamed accordingly.
- Session profiles, signature eligibility, authority `/maps` metadata, coarse
  fields, and fixed local render resources consume the canonical tiers.
- Added density/travel floor and ceiling proofs and bounded 25x25 coarse-field
  and snapshot/resource proofs. No authored population correction was needed.
- Corrected the travel proof to integrate canonical drag and zero-flow
  coupling: authored observations are `1.48 / 1.55 / 8.52 / 1.22 / 1.98 /
  14.22` seconds, with tier-aware bounds rather than the invalid `0.4` to
  `4.5` range. No movement constants changed.
- Repaired validation to consume the shared loader and canonical filenames,
  moved the static browser module table into `src/maps/playable-map-loader.js`,
  and made coarse-field and snapshot byte ceilings fail closed. Deep Field is
  `3136/4096` cells and an observed `323430/500000` snapshot bytes; client
  resources remain `192` fluid, `3` world units local, and `64` coarse.
- Deferred the broader S24 population catalog to a later decision.

## 2026-07-15

- **Consolidated RC boot correction:** fixed the merged title-scene path so
  id-less presentation fixtures preserve their authored scale while anomaly
  lookup receives canonical `shallows` identity. Playable 5/15/25 maps remain
  strict. Accepted source commit `ba39606f` is integrated at `f56175f6`.
- **RC build receipt:** `release:internal`, `release:status`, and
  `test:package` are green for all five targets at build
  `0.3.0.f56175f6`. The playtest ZIP SHA-256 is
  `5d53dd2d5305f09cd284ac9e25fbc4c9ae938b1a2894333842d41a2ef080fb66`;
  Linux `resources/app.asar` is
  `cedaeb57c5d72feb373f71d1fb924ba754ca4cb367165faa1b9e9852431daece`.
- **Evidence boundary:** the no-retry full lane was stopped after 215 seconds
  when its isolated checkout lacked Python audio packages, `three`, and
  Electron packager dependencies. It was not retried. Package boot is green;
  broad RC CI remains unclaimed for this hash.
- **Deck boundary:** preflight resolved the Deck at `100.77.19.24`, but
  Tailscale ping and SSH port 22 timed out. No deployment or Gaming Mode update
  occurred, and the v0.2 Demo slot remains untouched.

- X-D measured current cruise and Breacher Burn travel at live profile dt for the 5x5, 15x15, and 25x25 registry, including raw runs, authority read radii, and a derived decisions-per-minute proxy; no gameplay constants changed.
- X-A completed the bounded config red-flag audit: movement drag, wreck drift,
  and signal rates now use readable units with exact parity conversions; dead
  client knobs were removed. The existing per-player `timeSlow` path remains
  flagged for Greg under the durable "never per-player time" ruling.
- Corrected X-A compatibility coverage: Spacecraft/Surfer preset drag, saved
  profile drag ranks, all hull/item drag scales, and Ship wake terminal velocity
  now share the canonical half-life seam with parent-literal parity fixtures.
- Restored the parent wake boundary: Ship wake terminal velocity uses converted
  base drag only; composed `dragScale` remains movement-only.
- X-B froze the bounded jam/v0.2 design family into versioned history archives,
  retained stable pointer paths, and added `DESIGN-INDEX.md` as the living
  v0.3/v0.3.1 ownership route. See
  [`X-B completion`](reviews/completions/X-B-design-doc-versioning.md).
- **Map Select survey terminal:** documented the shipped three-panel hierarchy:
  map-class register, uncertain `SURVEY RECONSTRUCTION`, and possible-contents /
  confidence rail. Player-facing route anchors, path sequence, exact wells,
  portals, wrecks, spawn, object layout, and signal pressure are no longer
  style-guide claims.
- **State and accessibility contract:** valid rows expose launch; locked rows
  expose no action and use withheld/redacted data. Reduced motion uses static
  corruption. Deck/controller surfaces use the accepted graphical glyph family
  without raw keyboard fallback.
- **Scale labels:** Map Select consumes the canonical W2-A4 authority tiers:
  Shallows `5x5`, Expanse `15x15`, and Deep Field `25x25`.
- **Accepted Map Select proof:** valid Deck capture
  `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/map-select-valid-expanse-deck.png`
  (`2a5d7ee301f2aafbc4b6a341f270559078c2420299b0c1b8495a0a5a8d1a3290`), locked
  Deck capture
  `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/map-select-locked-sector-05-deck.png`
  (`6525190afc7d3a65220ddd5bf65909e503d1961cd155973d8eacd504ae504ea1`), and
  manifest
  `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/manifest.json`
  (`1eb4fbfb5ac7f8bf9e1fa240281490103ce9735c2533a6e2d31e2e248950bb04`).
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

# W1-A3 Dead Movement Knobs

Outcome: done.

## What Changed

- Deleted `Resonant` `abilities.harmonicPulse.eddyStrength` from the canonical
  hull manifest.
- Deleted `Drifter` `abilities.slipStream.speedBonus` from the canonical hull
  manifest. The sibling `slipStream.signalReduction` remains unchanged; the
  live Drifter ability consumers for movement and signal remain
  `flowLock.speedBoost` and `flowLock.signalMult`.
- Deleted `AI_PLAYER_CONFIG.thrustAccel` and `AI_PLAYER_CONFIG.drag` from the
  authority runtime config. AI navigation still writes `lastInput`, and the
  main tick applies the shared player movement step.

## Per-Knob Disposition

| Entry | Disposition | Why |
| --- | --- | --- |
| Resonant `eddyStrength` | Deleted | No production consumer. Resonant runtime reads `eddyDuration` and preserves the live `maxEddies` sibling. |
| Drifter `slipStream.speedBonus` | Deleted | No production consumer. The named speed bonus never reaches movement; `slipStream.signalReduction` remains present. |
| `AI_PLAYER_CONFIG.thrustAccel` | Deleted | No production consumer. AI players set `lastInput`; shared authority movement owns thrust. |
| `AI_PLAYER_CONFIG.drag` | Deleted | No production consumer. Shared authority movement owns drag through the PlayerBrain coefficients. |

## Evidence

- `git diff --check`: passed.
- Direct config/content/runtime assertions: 9 passed, including manifest
  absence checks, preserved sibling checks, AI config shape, and live
  `flowLock` consumer checks.
- Deleted-name search `rg -n "eddyStrength|speedBonus|AI_PLAYER_CONFIG\\.(thrustAccel|drag)" src scripts`: 0 matches.
- `node tests/movement-contract.cjs`: 2 passed, 0 failed.
- `node tests/movement-trajectory-parity.cjs`: 1 passed, 0 failed.
- `node tests/player-brain.cjs`: 4 passed, 0 failed.
- No full, core, browser, package, release, or visual suites were run.

## Deviations

None. No save migration, schema migration, or movement-feel change was
required because all four entries were unused configuration.

## Open Questions

None discovered in this bounded slice.

## Anchor Updates

The review anchors remain valid. Runtime tracing confirmed that
`tickAIPlayers` writes `lastInput` and the main player loop calls the shared
movement step before gravity, slingshot, and integration. No source-of-truth
review document was edited.

## Remaining W1-A Gap

None in the handoff rows: W1-A1 canonical thrust/brake parity and W1-A2
gravity-family completion are present on this base, and this closes the
remaining dead-knob row. Broader branch integration and reviewer acceptance
were not performed here.

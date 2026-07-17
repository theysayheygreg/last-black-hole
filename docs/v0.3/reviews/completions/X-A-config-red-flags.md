# X-A Config Red-Flag Audit

Date: 2026-07-15
Branch: `codex/v0.3-xa-config-red-flags`
Base: `0eced674b92a1ef055118aca4f6443073fd3931a`

## Outcome

The bounded gameplay-config audit is complete. Raw movement drag, wreck drift
acceleration, and signal rates now have player-readable units and exact
conversion seams. Dead or reserved client config keys were deleted. Default
gameplay is unchanged at equivalent values; no feel tuning was performed.

The former per-player time path was retired in the v0.3.1 follow-up under the
durable ruling "never per-player time". No replacement effect was added.

## Audit Table

| Constant | Old form | New form / disposition | Owner | Unit, range, step, start bias | Parity evidence |
| --- | --- | --- | --- | --- | --- |
| `MOVEMENT.player.baseDragPer60HzFrame` | `0.015` fraction removed per 60 Hz frame | `coastHalfLifeSeconds = 0.7643727575403364` | Shared player movement step, local `Ship` and authority | Seconds to halve coasting speed; `[0.25, 4]`, step `0.05 s`, authority baseline | `tests/config-red-flags.cjs`; movement contract and trajectory parity tests |
| Authority wreck gravity `strength` | `0.0045` acceleration coefficient | `referenceDriftSpeed = 0.003`, with `dragRate = 1.5`; adapter derives exact `strength = referenceDriftSpeed * dragRate` | Shared authority well-gravity family and `tickWrecks` | World-units/s at 1 wu from a mass-1 well; `[0, 0.02]`, step `0.001`, quiet drift. Drag is `1/s`; `[0.5, 3]`, step `0.25`, standard damping | Representative distances, gravity matrix (30 rows), and wrap proof |
| Local wreck `CONFIG.wrecks.driftStrength` | `0.08` raw acceleration coefficient | `referenceDriftSpeed = 0.05333333333333334`; exact local strength recovered from speed x drag rate | Local `src/wrecks.js` movement | World-units/s at 1 wu from a mass-1 well; `[0, 0.2]`, step `0.005`, quiet drift | Conversion assertion preserves local `0.08`; default consumer ordering unchanged |
| Local wreck `driftDrag` | `1.5` legacy-prefixed decay rate | `dragRate = 1.5` | Local wreck movement | `1/s`; `[0.5, 5]`, step `0.25`, standard damping | Same exponential `exp(-dragRate * dt)` path |
| `SIGNAL_CONFIG.thrustBaseRate`, `wellProximityRate`, `coastRate` | Fractions/s: `.005`, `.002`, `.001` | `.5%`, `.2%`, `.1%` full-scale/s via `signalFractionPerSecond()` | Authority `tickPlayerSignal` | Full-scale percent/s; ranges `[0, 5]`, `[0, 2]`, `[0, 2]`; steps `.5`, `.1`, `.1`; quiet/opposition, environmental tax, barely audible | Exact helper conversion assertions |
| `SIGNAL_CONFIG.decayBase`, `decayWreckWake`, `decayAccretionShadow` | Fractions/s: `.025`, `.040`, `.050` | `2.5%`, `4%`, `5%` full-scale/s via the same helper | Authority `tickPlayerSignal` | Full-scale percent/s; `[0, 10]`, step `.5`; quiet baseline, wake relief, shadow relief | Exact helper conversion and authority signal tests |
| `CONFIG.ship.drag` | Raw movement coefficient and duplicate dev-panel knob | Deleted; movement derives from the shared half-life. Wake terminal velocity derives from the converted base drag only, matching the parent | Local `Ship` | No surviving contract | Source scan plus movement and wake parity |
| `ascii.colorTemperature`, `input.gamepadTurnRate` | Unused client config | Deleted | None; no runtime consumer | No contract | Runtime source scan |
| `vfx.shipMotion`, `portalSparks`, `pickupGlints`, `inhibitorFaults`, `nearCameraAtmosphere`, `debugBounds`, `freezeSeed` | Future/reserved or unused client flags | Deleted | None; no runtime consumer | No contract | Runtime source and dev-panel scan |
| `pressureFromTime` | Handoff example `0.0005/s` | No current runtime/config name; no new behavior invented | None in current source | No contract | Source scan; already absent after the prior pressure ruling |
| Former `timeSlowLocal` consumable path | `0.3` player-only time multiplier for `3.0 s` | **Retired**; catalog entries, runtime state/expiry, client presentation, and audio cues removed. Old loadout IDs/effect are sanitized to empty slots at load boundaries. | Shared catalog, profile/loadout loading, authority, client, audio | No surviving gameplay contract; no replacement effect | `tests/time-slow-retirement.cjs` plus focused catalog/runtime/audio checks |

Existing local wreck `driftFalloff`, `driftMaxRange`, and
`driftTerminalSpeed` remain named, human-unit controls with their existing dev
panel ranges and steps. They were not behaviorally changed.

## Consumer Trace And Boundary

- The local movement path reads `CONFIG.ship.coastHalfLifeSeconds`; the
  authority and shared movement step read the manifest half-life. The wake
  derivative reads the same exposed client value.
- Authority wreck gravity derives its old acceleration coefficient at the
  gravity seam. Local wreck gravity performs the same algebra using its own
  legacy default, preserving local-sandbox output without silently tuning it to
  authority.
- Signal values remain fractions internally. Only the contract-facing form was
  changed; `signalFractionPerSecond()` is the one conversion boundary.
- Fluid viscosity, dissipation, well-fluid gravity, star radiation, portal
  glow, wake splats, planetoid wakes, and other UV/shader or presentation
  controls were inspected but remain outside this bounded gameplay audit. They
  are not promoted to gameplay authority by this change and retain a separate
  presentation/config pass boundary.
- The accepted X-D travel probe remains measurement evidence only. Its
  `wu/cell` interpretation is a measurement convention, and it does not authorize meters
  conversion or gameplay tuning here.

## Focused Proof

- `node tests/drag-compatibility.cjs`: 6 passed; 15 compatibility cases,
  60 trajectory rows, and 15 Ship wake-terminal rows.
- `node tests/config-red-flags.cjs`: 6 passed, 0 failed.
- `node tests/movement-contract.cjs`: 2 passed.
- `node tests/movement-trajectory-parity.cjs`: 1 passed.
- `node tests/gravity-family.cjs`: 4 passed; 30 matrix rows and 3 wrap rows.
- `node tests/wreck-drift.cjs`: 1 passed.
- `node tests/player-brain.cjs`: 4 passed.
- `node tests/ruler-contract.cjs`: 4/4 passed.
- `node tests/validation.cjs`: 47 passed, 0 failed.
- CJS/ESM syntax checks and `git diff --check`: passed.
- Deleted-name scan: no stale runtime or dev-panel names; remaining old-form
  literals are parity assertions and test evidence only.
- No browser, broad CI, package, gameplay-tuning, merge, or push work was run.

## P1 Compatibility Correction

The follow-up correction preserves the parent `0eced674` drag behavior across
all surviving compatibility paths:

- Spacecraft `0.05` and Surfer `0.02` preset drag now convert to exact
  half-lives through the canonical seam instead of disappearing.
- Saved `upgrades.drag` ranks use one conversion in local `Ship` and authority
  `PlayerBrain`; hull and item `dragScale` composition remains multiplicative.
- Ship wake terminal velocity consumes converted base drag only. Hull, profile,
  and item `dragScale` continue to affect movement decay but, matching parent
  `0eced674`, do not change wake onset or intensity.
- Legacy `ship.drag` preset/scene aliases convert to half-life. Conflicting or
  invalid aliases throw instead of creating an ignored config property.
- `src/content/tuning.js` is the sole ESM/CJS contract for conversion math,
  ranges, steps, units, and start bias. The duplicated server contract module
  was deleted and dev-panel metadata references the canonical objects.
- The gravity parity oracle retains literal pre-migration `strength: 0.0045`
  and the old inverse-power formula; it does not derive expected output from
  the migrated speed-times-damping representation.

## Greg Decision

Greg's 2026-07-17 ruling is executed: retire `timeSlowLocal`. Future
consumables must be multiplayer-aware and cannot alter per-player sim time.

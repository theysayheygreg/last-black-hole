# Build Health

> Status: v0.2 verification record. This doc explains the formal automated
> health gate. For the human/playable answer to "where does the local build
> stand?", start with `docs/project/BUILD-STATUS.md`.

This file exists so humans and agents have one tracked place to check automated
verification before committing work.

## Rule

If `BUILD-HEALTH.json` is missing, stale, or red for the current `HEAD`, do not assume the tree is healthy.
Run the verifier first and either fix the failures or make an explicit decision to defer them.

Do not use stale build health as proof that recent work did not happen. The git
log and `BUILD-STATUS.md` capture targeted fixes and playable-state caveats
between full verifier refreshes.

## Commands

- Check current status:
  - `node scripts/build-health.cjs status`
- Record fresh build health:
  - `node scripts/build-health.cjs verify`
- Run only the renderer fixture suite:
  - `npm run test:renderer`
- Run only the standalone title prototype probe:
  - `npm run test:title-prototype`
- Run only the structured telemetry canary:
  - `npm run test:telemetry`

## What the verifier does

Right now it records:

- `npm test`
- `npm run test:renderer`
- `npm run test:title-prototype`

That is intentionally narrow. It covers the real architecture stack, deterministic renderer fixtures, and the standalone title-prototype Composer lane without trying to turn every commit into a release build.

Telemetry smoke is intentionally kept in the authority lane, not the everyday
core `npm test` lane. Run `npm run test:telemetry` or the authority lane when a
change touches stack status, embedded runtime logs, or process health.

`npm run test:title-prototype` guards the LBH-native title prototype path specifically: `FluidDisplayPass -> BloomPass -> ASCIIPass`, non-black GPU readback pixels, and canvas export. This keeps the prototype/title visual canary from becoming another invisible side quest.

## Interpretation

- `ok: true` and matching `gitHead` means the recorded health is current for this exact commit.
- `ok: true` can also remain valid for one follow-up commit if that commit only updates `docs/project/BUILD-HEALTH.json` after a successful verification run.
- A different `gitHead` means the record is stale, even if the last run was green.
- `ok: false` means the last recorded verification failed and should be fixed before more work piles on.

## Relationship To Build Status

Use `BUILD-HEALTH.json` for the narrow question: "did the formal automated
verifier pass for this commit?"

Use `BUILD-STATUS.md` for the broader operator question: "what is the local
build believed to do right now, what should I launch, what was recently fixed,
and what caveats remain?"

Use `npm run stack:status` only for live process health. A running stack can be
healthy while the repo's build health is stale, and a green build-health record
can be stale while the live stack is down.

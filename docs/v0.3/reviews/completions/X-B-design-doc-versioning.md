# X-B Design-Doc Versioning

Date: 2026-07-15
Branch: `codex/v0.3-xb-design-doc-versioning`
Base: `a86f0d0d10fc8bd86953b359f092ba1a9be07cc3`

## Outcome

Executed the bounded S6 versioning slice. Historical jam/v0.1 and v0.2
slingshot design bodies now have versioned archive homes with explicit frozen
and superseded metadata. Stable legacy paths remain available as short
pointers, while v0.3 read-first material routes through a living design index.

## What Changed

- Archived five jam-era design bodies under `docs/v0.1/design/`.
- Archived the three-document v0.2 slingshot family under
  `docs/v0.2/history/design/`.
- Added stable pointer files at all eight former canonical paths.
- Added `docs/v0.1/README.md` and `docs/v0.2/history/README.md` archive indexes.
- Added `docs/v0.3/DESIGN-INDEX.md` for living S4/S5/S8/S9/S10/S13 owners and
  current v0.3 renderer/harness contracts.
- Updated `CLAUDE.md`, v0.2/v0.3 README read-order pointers, the current
  controls cross-link, and the v0.3 changelog.

## Evidence

- Target branch was clean at the exact accepted X-A base before edits.
- Historical bodies compare equal to their pre-move versions after removing
  only the added metadata and the documented relative-link repairs.
- The eight former canonical paths resolve to pointer files; all pointer
  targets and v0.3 read-first links resolve to living docs or archive indexes.
- `git diff --check` passed before commit.

## Deviations

- This is intentionally bounded to the S6 examples and their directly coupled
  slingshot family. It does not rewrite current product decisions or migrate
  every existing `docs/design/` file.
- The v0.3.1 review remains the living owner for systems whose standalone v2
  document has not yet been extracted; this commit adds the ownership index
  rather than copying review prose into parallel files.
- No code, tests, `main`, v0.2 runtime, governance, or branch operation changed.

## Open Questions

- Extract standalone v2 documents for the remaining review systems when their
  design passes close; update `DESIGN-INDEX.md` at that time.
- Revisit other older design families in a separate bounded pass when their
  v0.3 owner is accepted. They are outside this commit's inventory.

## Anchor Updates

- Living design owner: `docs/v0.3/DESIGN-INDEX.md`
- Historical v0.1 archive: `docs/v0.1/README.md`
- Historical v0.2 archive: `docs/v0.2/history/README.md`
- Completion artifact: this file

## Before -> After Inventory

| Before canonical path | After historical body | After canonical pointer / living owner |
| --- | --- | --- |
| `docs/design/PILLARS.md` | `docs/v0.1/design/PILLARS.md` | `docs/v0.3/DESIGN-INDEX.md#pillars-and-product-identity` |
| `docs/design/MOVEMENT.md` | `docs/v0.1/design/MOVEMENT.md` | `docs/v0.3/DESIGN-INDEX.md#movement` |
| `docs/design/SIGNAL-DESIGN.md` | `docs/v0.1/design/SIGNAL-DESIGN.md` | `docs/v0.3/DESIGN-INDEX.md#signal` |
| `docs/design/SCAVENGERS.md` | `docs/v0.1/design/SCAVENGERS.md` | `docs/v0.3/DESIGN-INDEX.md#scavengers` |
| `docs/design/DESIGN-DEEP-DIVE.md` | `docs/v0.1/design/DESIGN-DEEP-DIVE.md` | `docs/v0.3/DESIGN-INDEX.md` |
| `docs/design/SLINGSHOT.md` | `docs/v0.2/history/design/SLINGSHOT.md` | `docs/v0.3/DESIGN-INDEX.md#slingshot` |
| `docs/design/SLINGSHOT-V2.md` | `docs/v0.2/history/design/SLINGSHOT-V2.md` | `docs/v0.3/DESIGN-INDEX.md#slingshot` |
| `docs/design/SLINGSHOT-NETWORK.md` | `docs/v0.2/history/design/SLINGSHOT-NETWORK.md` | `docs/v0.3/DESIGN-INDEX.md#slingshot` |

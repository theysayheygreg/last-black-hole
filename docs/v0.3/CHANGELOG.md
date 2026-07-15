# v0.3 Changelog

## 2026-07-14

- W2-A4 made `shallows`, `expanse`, and `deep-field` authoritative at 5x5,
  15x15, and 25x25 through one ESM/CJS map-scale registry.
- Authored bounds and positions now migrate deterministically by normalized
  composition; scale-encoded active map modules were renamed accordingly.
- Session profiles, signature eligibility, authority `/maps` metadata, coarse
  fields, and fixed local render resources consume the canonical tiers.
- Added density/travel floor and ceiling proofs and bounded 25x25 coarse-field
  and snapshot/resource proofs. No authored population correction was needed.
- Deferred the broader S24 population catalog to a later decision.

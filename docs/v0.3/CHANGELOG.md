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

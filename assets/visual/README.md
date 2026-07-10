# v0.3 Visual Asset Kit

The checked-in runtime assets under this directory are derived from the
ImageGen source atlases in `assets/source/generated/v0.3/`.

- `entities/` contains top-down pixel sprites for world-object families.
- `item-families/` contains the generated mechanical icon vocabulary.
- `items/` contains one stable icon per `catalogId`. Tier rails and a small
  deterministic identity mark keep related items coherent without pretending
  every catalog entry is an unrelated object.
- `ui/` contains modular frame parts for canvas and DOM composition.
- `manifest.json` records every generated runtime file and item mapping.

Run `npm run assets:visual` after replacing a source atlas. The runtime assets
are committed so release builds do not need Sharp or an image-generation API.

The source images are production inputs, not screenshots or UI specifications.
Runtime tint, state, motion, backing, accessibility, and layout remain owned by
the presentation and UI systems.

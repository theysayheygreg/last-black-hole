# v0.4 Multiplayer Unit-Economics Evidence

This evidence is a deterministic planning calculation for the admitted
one-through-four-player product path. It is not a provider quote, a measured
host-density proof, or evidence for eight, 24, 48, or 96 players.

The output binds full source commit
`00f91f14fe0281bfc643b2c239763a9ecd55314c`, the semantic config SHA recorded
inside `model.json`, and raw file SHA-256 values in `checksums.json`.

Regenerate exactly from that source checkout:

```bash
node tests/v04-multiplayer-unit-economics.cjs
node scripts/v04-multiplayer-unit-economics.cjs \
  --config docs/v0.4/evidence/unit-economics/config.json \
  --output docs/v0.4/evidence/unit-economics/model.json \
  --source-commit 00f91f14fe0281bfc643b2c239763a9ecd55314c
shasum -a 256 \
  docs/v0.4/evidence/unit-economics/config.json \
  docs/v0.4/evidence/unit-economics/model.json \
  scripts/v04-multiplayer-unit-economics.cjs
```

Every provider price imported from the July 10 research snapshot is marked
`pendingRefresh`. Zero-dollar player-hosted inputs and the three storefront
fee bands are planning assumptions, not universal current defaults.

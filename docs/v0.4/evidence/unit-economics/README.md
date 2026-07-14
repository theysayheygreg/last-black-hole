# v0.4 Multiplayer Unit-Economics Evidence

This evidence is a deterministic planning calculation for the admitted
one-through-four-player product path. It is not a provider quote, a measured
host-density proof, or evidence for eight, 24, 48, or 96 players.

The output binds full source commit
`5758ccf36f1de5640bb9edb496989a25cd9aa8c0`, provider refresh commit
`963c4427b78d60e9fd4cd481debd5920ea39002f`, the semantic config SHA recorded
inside `model.json`, and raw file SHA-256 values in `checksums.json`.

Regenerate exactly from that source checkout:

```bash
node tests/v04-multiplayer-unit-economics.cjs
node scripts/v04-multiplayer-unit-economics.cjs \
  --config docs/v0.4/evidence/unit-economics/config.json \
  --output docs/v0.4/evidence/unit-economics/model.json \
  --source-commit 5758ccf36f1de5640bb9edb496989a25cd9aa8c0
shasum -a 256 \
  docs/v0.4/evidence/unit-economics/config.json \
  docs/v0.4/evidence/unit-economics/model.json \
  scripts/v04-multiplayer-unit-economics.cjs
```

The Fly/Hetzner/Cloudflare-DO authority rates are official-source-derived from
the July 14 refresh. Fly egress is an official-source rate. R2 storage remains
`pendingRefresh`; zero-dollar player-hosted inputs and the three storefront fee
bands are planning assumptions, not universal current defaults.

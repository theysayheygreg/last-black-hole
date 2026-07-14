# S20 compression evidence

All four product artifacts bind clean commit
`9ff1b06b638e082d760539819d1a678a70e31c40` and validate their own immutable
checksums.

| Order | Artifact | Composite SHA-256 |
|---|---|---|
| A1 | `round-a/baseline` | `34889e19a112a3288d35eeafa575ace90f0319d14eb27c0ccc53c13245f13594` |
| A2 | `round-a/candidate` | `d9b732599aa5e036bdedced3c6d14d8301cc6fa4e9015d633bf7e751bf43d6ac` |
| B1 | `round-b/candidate` | `8cc0f77b58048420449a8116e998a27d428240b19e8047608268b9b38e48ee2c` |
| B2 | `round-b/baseline` | `a11dbbefd132173d3f45cba687aa7693a6126a491284c38ae604c24dd92b594d` |

`codec-selection.json` is the six-codec, twelve-round representative corpus.
`codec-adversarial.json` is the bounded envelope/malformed corpus. The
executable validator recomputes fixed-window traffic, codec and cleanup gates,
per-round admission, and counterbalanced eight-player CPU/tail non-regression:

```sh
node tests/multiplayer-state-pair-compression-evidence.cjs
```

The product runs were generated with:

```sh
LBH_S13_OUTPUT_DIR=/tmp/s20-final-a-base node tests/multiplayer-state-pair-clock-attribution.cjs
LBH_S20_COMPRESSION=1 LBH_S20_OUTPUT_DIR=/tmp/s20-final-a-cand node tests/multiplayer-state-pair-clock-attribution.cjs
LBH_S20_COMPRESSION=1 LBH_S20_OUTPUT_DIR=/tmp/s20-final-b-cand node tests/multiplayer-state-pair-clock-attribution.cjs
LBH_S13_OUTPUT_DIR=/tmp/s20-final-b-base node tests/multiplayer-state-pair-clock-attribution.cjs
```


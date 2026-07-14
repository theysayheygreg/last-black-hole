# S23T Tail Attribution Evidence

All captures bind clean commit
`65e3676f01e398f1a2d41c50681d6686ac61b9e2`.

| Capture | Path | Population order | Composite SHA-256 |
| --- | --- | --- | --- |
| A1 | S23 profiler on | 1, 8 | `e6c23b119de3326a74d83715f4ed1a010fe5e30ff0b6765ee6379c6677ac7406` |
| B | S23 profiler off | 8, 1 | `7b59cece97583ffdab93281f613377b593b5b5c4a78e5ff22a9950a337d79c7f` |
| A2 | S23 profiler on | 8, 1 | `dbca2fd2947b43a7b51ba87c91dea1029945cee852fd070e0b96c248bb40e8b6` |
| S20-1 | S20 profiler on | 1 | `f07dc0a48b0ecf093c271a4ec8cd06350109ab5034e05d960c6a29e37706973a` |

The raw machine-local artifacts include immutable run manifests, per-file
checksums, cleanup proof, exact accounting, isolated-client diagnostics, and
the bounded source-beat ring. `analysis.json` is the checked compact semantic
summary and retains the raw composite bindings.

The method passes overhead, cardinality, reconciliation, repeatability,
correctness, cleanup, and stage-selection gates. Public source/body preparation
is the only selected family. See
`docs/v0.4/MULTIPLAYER-STATE-PAIR-S23T-TAIL-ATTRIBUTION.md` for interpretation
and the exact S23P boundary.

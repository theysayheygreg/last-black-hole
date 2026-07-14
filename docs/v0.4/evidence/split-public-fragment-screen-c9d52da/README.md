# Split public-fragment short abort screen

This directory preserves the unmodified generated JSON from the one and only
eight-client short screen at implementation commit
`c9d52dac492293976ff6974e002f4b84847df763`.

- Topology: one match-local logical gameplay authority, eight isolated clients.
- Warmup: 2 seconds.
- Measurement: exact 3 seconds.
- Composite SHA-256:
  `35fdbe0a00e6e3f2ee3e576685c4472466bc8dc8373634e5dd64e7cc9bd6a9a9`.
- Terminal trigger: projection/publish p95 `55.9045 ms` exceeded the
  operator-provided pre-screen `>55 ms` abort threshold. The raw artifact does
  not itself encode the threshold.
- Other observations: `NORMAL`, 9.6667 Hz receiver cadence, 49,386.7 B/s worst
  recipient mean, 49,922 B/s one-second recipient-window p95, 0.510 authority
  core, and no observed queue transition, recovery request, or client error.

The raw logical-pair count failure is an instrumentation false negative, not a
semantic failure: the harness counted the fragment and overlay physical wires
as two logical pairs. The JSON and checksums remain untouched. No rerun or
sealed 20-second capture exists.

Validate the immutable files, exact revert targets/restored baseline tree,
declared abort comparison, historical instrumentation cause, and absence of
the capability from live source:

```sh
node tests/split-public-fragment-terminal-negative.cjs
```

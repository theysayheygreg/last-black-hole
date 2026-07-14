# S17 Lazy State-Pair Candidate Evidence

S17 keeps the S15 positional JSON wire as the release default and changes only
how one match authority chooses that wire. One dedicated logical authority
process remains the sole gameplay writer for one match/group. Concurrent
matches multiply that boundary horizontally; this evidence does not describe
one global writer or one machine per match.

The publisher now builds one canonical header and four unique lane payloads,
derives four exact-size descriptors, preserves the S15 tie order, and composes
only the selected outer frame. The candidate benchmark proves 1,200 exact wire,
1,200 exact selection-transcript, and 1,200 decoded-semantic comparisons with
zero mismatch. Across both execution orders, mean publish time falls
27.05--28.07%, selection p95 falls 43.37--45.91%, prepared hash work falls
50%, and the explicitly labeled outer reference-slot allocation proxy falls
75%. The proxy is not a measured V8 heap allocation.

The profiler-off process artifact uses one isolated authority process plus
isolated clients, a five-second warmup, and one fixed 20-second measurement
window at 1/4/8 players. Compared with sealed S15, candidate receiver cadence
is 9.80/5.60/3.80 Hz, projection/publish p50 is 18.43/89.85/171.32 ms, p95 is
21.14/124.80/199.18 ms, and authority CPU is 22.32/57.13/72.87% of one core.
All correctness, exact schedule, queue, pressure, cleanup, and ledger checks
pass. At normalized 10 Hz, worst mean/p95 traffic is 59,196/61,564,
66,802/73,114, and 77,233/83,346 B/s. Only one player passes the complete
product gate. Four and eight remain below 9 Hz, clock-failing and `DILATED`;
collapsed cadence receives no bandwidth credit.

The retained stage-profile attempt is explicitly rejected as product evidence:
the eight-player row timed out waiting for complete stage-profile beats, and
instrumentation overhead contaminates product timing. Its completed 1/4 rows
are used only to focus the next bounded lane. Pair choice remains the largest
completed synchronous stage, followed by public-core construction, public
delta construction, and public projection construction.

Decision: keep the lazy selector because it is material and byte-identical,
but do not admit four/eight. The next bounded lane is trusted same-operation
lane-validation and size-proof cleanup while preserving S15 bytes and S17
one-frame materialization. S16 binary remains opt-in. Compression, deliberate
cadence policy, hosted/fleet economics, heavier simulation, and 24/48/96 are
outside this artifact.

Bindings:

- profiler-off candidate composite:
  `9001726f56fbfd895d32f5d3111dd50b16cb80bd1a0903772bffbdc78307d149`
- sealed S15 baseline composite:
  `c2df9114ce2cfd7ab29ff613b214498b214cebd7df71d1e0c74750b974f6e266`
- S17 analysis composite:
  `cd8120b600bf82dd9d78b036c4a17344bd12c95e188022cfe33174629cdcbd57`
- exact benchmark transcript:
  `ec1ab6ca33a83f28fc09501c3711401bf60edc72baba94dd40398dd9195058d6`

`analysis.json` contains the recomputed gates and normalized traffic.
`manifest.json` binds implementation and proof sources. `checksums.json` seals
the analysis, benchmark, and manifest. `candidate-process/` and the sealed S15
baseline retain their own independent checksum manifests.

# Split public-fragment short abort screen

This directory preserves the unmodified generated JSON from the one and only
short eight-client screen at implementation commit `c9d52da`.

- Warmup: 2 seconds.
- Measurement: exact 3 seconds.
- Topology: one match-local logical authority and eight isolated clients.
- Generated composite SHA-256:
  `35fdbe0a00e6e3f2ee3e576685c4472466bc8dc8373634e5dd64e7cc9bd6a9a9`.
- Verdict: `FAIL`; projection/publish p95 was 55.905 ms against the 55 ms
  abort boundary.

`normal-8.json` also records 20 Hz authority cadence because this first screen
classified both physical fragment and overlay frames as logical state-pair
acceptances. The closure patch corrected the accounting class after capture.
The raw JSON and its checksums remain untouched, no screen rerun was made, and
no sealed 20-second candidate evidence exists.

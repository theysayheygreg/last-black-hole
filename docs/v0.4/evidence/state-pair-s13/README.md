# S13 paired authority/client clock attribution

This evidence asks one narrow question: is the 4/8-client cadence collapse in
the S12 codec-aware experiment primarily caused by running every synthetic
receiver in the coordinator process, or does the already separate one-authority-
per-match process remain slow when every receiver gets its own process?

Both rounds bind clean commit `3f95da8`, seed `1403105358`, one logical
authority process for one match, populations 1/4/8, 5 seconds of warmup, 20 seconds of
measurement, and exactly 200 input plus one action step per client. Round A ran
co-located then isolated; round B reversed that order. The isolated topology
uses one authority process, one coordinator, and one receiver process per
client. The receiver-colocated topology keeps the same separate authority
process but runs all receivers inside the coordinator's event loop.

## Result

| Players | Receiver-colocated authority minimum | Receiver-isolated authority minimum | Isolated receiver minimum | Isolated projection/publish p95 | Isolated authority CPU |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.75–9.80 Hz | 9.80 Hz | 9.80 Hz | 28.96–29.07 ms | 29.72–29.79% of one core |
| 4 | 4.90–5.05 Hz | 5.00–5.05 Hz | 5.00 Hz | 117.02–117.23 ms | 61.72–61.97% of one core |
| 8 | 2.90–2.95 Hz | 2.90–2.95 Hz | 2.90–2.95 Hz | 258.78–262.88 ms | 80.05–80.45% of one core |

In two 20-second, order-counterbalanced, machine-local loopback review pairs at
fixed seed and config, moving each receiver out of the coordinator and into its
own Node process did not materially restore 4- or 8-recipient authority-accepted
state-pair cadence. The paired authority deltas were +0.10/0.00 Hz at four and
+0.05/-0.05 Hz at eight. All four 4/8 runs remain `DILATED`, with projection
p95 already over the 100 ms 10 Hz budget, while receiver cadence continues to
track the accepted-send boundary. This attributes the observed collapse to
work at or inside the instrumented authority boundary rather than receiver/
coordinator event-loop co-location. It does not prove a universal server-
capacity curve.

The isolated per-recipient exact application downlink mean ranges were
59.13–59.43 kB/s at one client, 34.26–34.40 kB/s at four, and 22.96–23.47 kB/s
at eight. These lower multi-client means reflect the collapsed publication
cadence and must not be used as configured-10-Hz network budgets. Every sealed
scenario has a zero partial-tail interval, exact input/action counts, zero
cumulative transport-high-water or queue-policy transitions. The validators
verify checksums, cleanup, S12 provenance, and stored cadence/admission
arithmetic; isolated artifacts additionally reconstruct authority/receiver
counts, rates, exact traffic, CPU arithmetic, and process boundaries from
retained evidence. Authority CPU arithmetic is exact over each recorded
20.755–20.979 second health-sample envelope, not the shared 20 second scoring
window. Isolated client CPU uses each process's recorded roughly 20.25–20.48
second envelope and is not an exact shared-window CPU share.

The valid next lane is to remove S12's four full candidate serializations while
preserving the exact winner and serializing it once. These measurements do not
admit fleet packing, hosted costs, concurrent matches, or 24/48/96 clients.

## Validation

```sh
node tests/multiplayer-state-pair-product-gate.cjs --validate-artifact \
  docs/v0.4/evidence/state-pair-s13/round-a/colocated
node tests/multiplayer-state-pair-clock-attribution.cjs --validate-artifact \
  docs/v0.4/evidence/state-pair-s13/round-a/isolated
node tests/multiplayer-state-pair-clock-attribution.cjs --validate-artifact \
  docs/v0.4/evidence/state-pair-s13/round-b/isolated
node tests/multiplayer-state-pair-product-gate.cjs --validate-artifact \
  docs/v0.4/evidence/state-pair-s13/round-b/colocated
```

The exact order, paired composite hashes, execution contract, accounting
boundaries, and S12 binding are cross-recorded in `manifest.json` and sealed by
the evidence commit.

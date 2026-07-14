# S24 Factorized Scale Preflight

Status: **S24 NOT PROVEN.** Synthetic components pass their screening budgets,
but the product gate remains closed because this run did not pace the live
authority, open 24 real sockets, observe backpressure, capture on-wire bytes,
or prove `NORMAL` without TiDi.

## Authority boundary

This is one 24-human match with one dedicated logical authority, one canonical
writer, one Node process, one event-loop thread, and zero workers. It is not 24
authorities and it is not one global server for every match. Concurrent matches
would multiply independent authority units horizontally.

## Method

The preflight combines production `BallparkMirror` indexing and Node Brotli-q1
with deterministic synthetic player, movement, consequence, AI, field, world,
event, projection, owner-overlay, and socket-accounting work.

- Writer fit: counterbalanced full `2^7` factorial, four repeats, 512 raw rows.
  Factors are 6/24 players, 100/400 bodies, distributed/stacked density, 12/48
  AI due, 64/256 field tiles due, 25/100 world jobs due, and 8/32 events.
- Replication fit: counterbalanced full `2^5` factorial, eight repeats, 256 raw
  rows. Factors are 6/24 recipients, 100/400 public bodies, 25/100 changed
  bodies, delta/keyframe state, and 8/32 public events.
- H24 representative: 600 raw beats at 30 Hz model time with 24 humans, 400
  bodies, 48 expensive AI at 6 Hz, 256 field tiles and 100 world jobs at 3.75
  Hz, 32-event work and replication at 10 Hz.
- H24 dense sensitivity: 300 beats with all 400 bodies clustered into every
  player query. It is a pileup sensitivity, not normal content.
- Replication encodes one compressed shared public fragment per beat and one
  owner-private overlay per recipient. Encoding is shared; public bytes still
  fan out to every client. Keyframes are 0.5 Hz and deltas 9.5 Hz.

All designs are full rank. Maximum standardized condition number is 2.19;
minimum stage `R^2` is 0.776. The artifact includes every raw row/beat,
coefficients, covariance matrices, standard errors, residual sigma, execution
order, and model-fit sensitivity bands.

## Provenance

- Source commit: `ccdeff8aaff9963a097082fd7de672789fcbd6d8`
- Git status before capture: clean
- Host: `GregBot.local`; Apple M4, 10 logical CPUs, 32 GiB RAM
- Runtime: Darwin arm64 `27.0.0`; Node `v22.22.3`; V8
  `12.4.254.21-node.56`
- Topology: one process, one writer/event-loop thread, no workers
- Window: `2026-07-14T09:01:01.749Z` to `2026-07-14T09:01:08.838Z`
- Artifact SHA-256: `b15bd3a1037f710c0643fda6b0eb14f47bed16d32b32685fcc5a96752364f9d4`
- Script SHA-256: `c2581afdc19f0935e9b59caae1df9e8f10632d53fbc2bc773751a241cf606d20`
- Test SHA-256: `43d7a236534f0fa73db87517a6b9f8485fcd8f9748da7060a9c8bee53a431eb2`

## Measured synthetic H24

These are fixture measurements, not live-sim or socket proof.

| Metric | Representative H24 | Dense sensitivity |
|---|---:|---:|
| writer p50 | 0.462 ms | 3.170 ms |
| writer p95 | 0.828 ms | 3.417 ms |
| writer p99 | 1.417 ms | 4.333 ms |
| writer max | 2.814 ms | 9.929 ms |
| candidates / contacts per beat | 96 / 96 | 9,600 / 9,600 |
| authority beat incl. replication p95/p99 | 0.864 / 1.558 ms | sensitivity only |
| synthetic paced mean core demand | 0.0168 | sensitivity only |
| p99 writer frame utilization at 30 Hz | 4.25% | sensitivity only |
| application downlink/client | 13,468 B/s | same schema assumption |
| application downlink/match | 323,235 B/s / 2.586 Mbit/s | same schema assumption |
| application messages/match | 480/s | same schema assumption |
| one-beat synthetic queued bytes peak | 89,728 B | not a real socket queue |

The 30 Hz synthetic writer screens are 16.667 ms p95 and 23.333 ms p99;
representative and dense fixtures fit. Synthetic traffic is below 64 KiB/s per
client. Neither result proves live `NORMAL` operation.

Controlled explicit-GC endpoints recorded `-830,856` heap bytes and `+884,736`
RSS bytes. Seventy-six GC observations had 0.790 ms p95 and 1.725 ms p99/max.
The accelerated synchronous harness deliberately blocked the event loop
(150.1/154.0 ms p95/p99), so those values are recorded but excluded from paced
cadence/TiDi claims.

## Fitted scenarios

H24 alone is measured by the synthetic fixture. H48/H96/X96 are coefficient
extrapolations. `best / base / worst` are model-fit scenario sensitivities, not
product confidence intervals. They exclude live-runtime, hosted CPU, WAN, TLS,
loss/retransmit, content-design, and nonlinear model-form uncertainty.

| Vector | synchronized-due writer ms | mean synthetic core demand | B/s/client | match Mbit/s | app msg/s |
|---|---:|---:|---:|---:|---:|
| H24 | 0.342 / 0.512 / 0.930 | 0.0091 / 0.0143 / 0.0269 | 12,931 / 13,299 / 13,666 | 2.483 / 2.553 / 2.624 | 480 |
| H48 | 0.964 / 1.207 / 1.631 | 0.0263 / 0.0337 / 0.0465 | 25,978 / 26,354 / 26,729 | 9.976 / 10.120 / 10.264 | 960 |
| H96 | 2.191 / 2.646 / 3.100 | 0.0606 / 0.0743 / 0.0881 | 49,726 / 50,150 / 50,573 | 38.189 / 38.515 / 38.840 | 1,920 |
| X96 | 85.425 / 86.769 / 88.112 | 2.552 / 2.593 / 2.633 | 117,614 / 118,219 / 118,825 | 90.327 / 90.792 / 91.257 | 1,920 |

Ordinary extrapolations remain below 64 KiB/s/client under this exact packed
schema assumption. X96 fails writer and network screens. H48 and H96 exceed the
measured body/recipient domain by 2.25x/2x and 4.5x/4x. Their narrow bands must
not be treated as capacity evidence.

## Gate and next lane

S24 remains **closed**. Synthetic writer, packed-network, fit-identifiability,
and short cleanup components pass; required live evidence is absent.

Exactly one next lane is permitted: a warmed, counterbalanced 24-client
loopback capture against the live authority, after the root checkpoint. It must
record paced cadence and overload, writer stages, actual process CPU,
event-loop delay, GC/RSS, public/owner payloads, real queue/transport memory,
application and on-wire bytes/PPS, disconnect cleanup, and checksums. It may
not retry a costly/full-network suite or promote S24 from this preflight.

Raw artifact: `factorial-preflight.json`.


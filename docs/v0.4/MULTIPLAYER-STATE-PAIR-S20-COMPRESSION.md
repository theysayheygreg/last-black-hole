# S20 State-Pair Compression Pilot

Status: accepted for negotiated 1–4 player sessions; measured but rejected for
8-player admission. S18 positional JSON remains the mandatory fresh-session
fallback.

## Boundary

S20 changes bytes, not authority. Each match/group still owns one dedicated
logical gameplay authority, its canonical tick writer, recipient ACK/base
history, and private owner projection. If 100 matches are concurrent, the fleet
runs 100 isolated match authorities; this work does not create a global sim
authority or share mutable gameplay state between matches.

The server and client explicitly negotiate `state-pair-brotli-v1` on top of the
full positional capability chain. The ticket, welcome, and client receiver pin
that choice for the session. A compressed session accepts only the versioned
binary envelope for state pairs; it never mixes object JSON, positional text,
or the S16 binary codec. A fresh session that lacks the compression capability
uses S18 positional JSON.

## Selected codec and envelope

The Node-builtins-only comparison tested deflate-raw levels 1/3/6 and Brotli
qualities 1/3/5 over one cold keyframe plus 120 representative scored wires.
The corpus contains 128 public entities with 16 changing per beat and the
product-dominant `public-delta + owner-keyframe` shape. Twelve counterbalanced
rounds produced 8,712 byte-exact comparisons and 121 selected-envelope semantic
and ACK-transcript comparisons. Brotli quality 1 won: authority compression p95
was 0.0124 ms and p95 envelope/source ratio was 0.346.

Every message is independent: no permessage-deflate, context takeover,
dictionary, or cross-recipient state. The 64-byte envelope binds magic,
version, codec ID, immutable manifest digest, compressed/original lengths, and
a truncated SHA-256 digest over the manifest plus original positional bytes.
Decode rejects truncation, trailing/concatenated streams, wrong manifest or
version, invalid flags/lengths, integrity failure, malformed Brotli, and output
overrun.

The outer limit is 256 KiB. Compressed sessions admit at most 245,696 inner
bytes, reserving 16 KiB plus the 64-byte header for incompressible expansion.
The adversarial corpus proves deterministic max and max-minus-one random-like
inputs, 512 exact round trips, 13 malformed classes, and zero mismatches.

## Exact ownership and retention

The authority publisher selects and retains one exact positional wire. The
adapter verifies its byte count and digest, compresses it once, and retains the
exact envelope for retransmission. Retention is bounded per connection to 12
frames and 2 MiB, retires cumulatively only after an authority-accepted ACK,
and is released on connection cleanup and run rotation. Invalid identity,
capability, lineage, or current-binding checks happen before compression;
rejected queue/send attempts roll back newly retained bytes.

The isolated client dispatches state-pair framing without parsing it first, so
the receiver performs one decode/validate/apply pass. Accounting charges exact
compressed envelope bytes for original and retransmitted sends.

## Product evidence

Two profiler-off isolated-process runs were counterbalanced A/B then B/A. Each
row is one match, one dedicated logical authority, and the listed simultaneous
recipients. Traffic is per-recipient application payload normalized to 10 Hz.

| Round | Players | Hz base → compressed | State | Mean B/s base → compressed | p95 B/s base → compressed | projection p95 ms base → compressed | authority core base → compressed |
|---|---:|---:|---|---:|---:|---:|---:|
| A | 1 | 9.70 → 9.70 | NORMAL | 60,724 → 26,181 | 63,600 → 27,695 | 16.09 → 16.75 | 0.173 → 0.176 |
| A | 4 | 9.80 → 9.80 | NORMAL | 74,651 → 31,018 | 78,210 → 32,766 | 56.98 → 55.04 | 0.584 → 0.585 |
| A | 8 | 4.95 → 5.00 | DILATED | 80,398 → 32,694 | 84,503 → 34,346 | 121.39 → 119.94 | 0.651 → 0.647 |
| B | 1 | 9.70 → 9.70 | NORMAL | 63,049 → 25,529 | 67,079 → 27,246 | 13.25 → 15.80 | 0.155 → 0.170 |
| B | 4 | 9.80 → 9.85 | NORMAL | 71,994 → 30,203 | 75,200 → 32,361 | 53.35 → 54.65 | 0.574 → 0.589 |
| B | 8 | 5.00 → 4.90 | DILATED | 79,588 → 31,959 | 83,106 → 33,618 | 118.06 → 129.17 | 0.640 → 0.659 |

Both four-player candidates clear NORMAL >=9 Hz, 64 KiB/s mean, 80 KiB/s
p95, 100 ms projection p95, and <=1.05 paired authority-CPU ratio. Four is
therefore admitted when compression is negotiated. Eight remains rejected:
both rounds are DILATED below 9 Hz. Its counterbalanced median cadence,
projection-p95, and authority-CPU ratios are 0.995, 1.041, and 1.011, so S20
does not materially worsen the existing eight-player clock failure, but it does
not solve it.

These are machine-local macOS loopback results without TLS, hosted placement,
fleet packing, AOI, or WAN effects. They make no 24/48/96-client claim.

The registered 40-suite `multiplayer-network` lane ran once with retries
disabled: 39 passed. Its sole failure was the historical S18 evidence checker
comparing a sealed source manifest with current S20 wire source. The checker
now hashes sealed commit `266e8c8` and passes focused validation; the full lane
was intentionally not rerun.

## Decision

Keep S20 as the preferred negotiated codec for 1–4 player sessions and keep
S18 positional JSON as fresh-session fallback. Do not admit 8, change cadence,
or infer high-count capacity from compression. The next bounded lane should
profile and isolate the authority projection/publish clock cost that still
forces eight into DILATED mode before any 24/48/96 extrapolation.

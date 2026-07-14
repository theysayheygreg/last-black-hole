# S18 Trusted Authority Proof

S18 is a CPU optimization inside one dedicated logical match authority. It does
not create a global authority, move truth to clients, share mutable state across
matches, change cadence, or alter the S15 positional wire.

## Boundary

The proof exists only after normalized canonical public/owner projections have
produced all four immutable keyframe/delta lane payloads. Authority-private
origin records bind each payload to its exact projection/delta object and hash.
Canonical component records bind exact UTF-8 text and byte count. The proof
binds those references to the exact header, recipient, epochs, manifest,
state-pair/snapshot/base lineage, and deterministic tie order.

Each publisher instance owns its issuer, consumer, token registry, and
settlement ticket in one closure. None is exported or passed to the wire
module. The proof has no public symbol or structural shape and is consumed from
the closure-private `WeakMap` before size proof or positional selection. A
failed downstream limit/composition settles as a rejection; no proof survives
a tick, recipient, selection, error, or retransmit boundary. The selected
immutable wire/digest remains the only retained output.

Unsupported/general wire callers and S16 binary have no proof-facing API and
run the complete semantic validator. Double consumption and cross-operation
use fail closed with `invalid-trusted-proof`; candidate failure preserves the
existing atomic keyframe fallback behavior and reason accounting. Durable
diagnostics count create, consume, reject, and fallback even when selection
throws.

## Decision

Keep S18. It materially reduces trusted positional authority work and restores
the four-player clock to normal 9.85 Hz. Do not call four product-admitted:
normalized mean downlink is still 75,770 B/s versus the 64 KiB/s gate. Eight
remains a CPU/cadence and bandwidth failure at 5.00 Hz.

Next, share public projection/core/delta preparation once per match tick across
recipients. Owner overlays, connection epochs, ACK bases, recovery, accounting,
and settlement truth remain recipient-specific and under the same one-writer
authority.

The final no-retry network lane ran once: 36/37 suites passed, including both
S18 suites. The only failure was a historical S17 source-binding check against
live S18 files; it now binds the sealed `e57bf53` tree and passes focused
validation. The full lane was not rerun.

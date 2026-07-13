# S9 independent red-team review

The independent review found no S9-specific P1 defect in manifest binding,
canonical textual rejection, semantic equivalence, privacy, encoded-byte
accounting, or default-off rollback.

## Decisive gate blocker

The blocker is a pre-existing protocol convergence defect exposed by sustained
multi-client load:

1. The authority builds from the latest ACKed base.
2. The receiver retains only its latest materialized base.
3. A one-beat ACK lag lets the authority send a delta based on an older snapshot.
4. The receiver rejects `base-mismatch`, clears both bases, then rejects later
   deltas as `missing-base` until a full recovery keyframe arrives.
5. Recovery-request cooldown drops repeats only after parsing them, so the
   request/keyframe work forms a positive feedback loop.

The S8 and S9 4-player evidence exhibit the same signature. This is not a
positional codec or queue-size failure. ACK rejects can remain zero while the
receiver is failing to converge, because the valid ACK stream and the selected
delta base are separate facts.

## Findings closed during review

- Queue byte overrides were caller-supplied without an end-to-end equality
  assertion. S9 now preserves the exact encoded byte count through coalescing
  and drain, and fails the connection closed if flush re-encoding differs.
- Semantic validation originally applied the wire limit to expanded object JSON
  before/after positional transport. S9 now applies the per-frame cap to actual
  positional bytes while retaining full semantic validation; ordinary object
  callers cannot bypass their expanded-wire cap.
- Adapter encode counters did not include publisher candidate/full-keyframe
  sizing encodes. Publisher sizing now has separate count, byte, and timing
  diagnostics with its lifetime/warmup scope labeled explicitly.
- Prototype-like string values were initially rejected unnecessarily. They now
  round-trip as data without becoming dynamic keys or altering object
  prototypes.
- The product client now verifies the exact codec manifest embedded in the
  fetched content-addressed session manifest, rather than trusting only a local
  constant.

Focused codec, wire, queue, runtime-integration, accounting, and manifest tests
pass. The full `multiplayer-network` lane passes all 27 selected suites without
retries. Artifact validation passes, but product admission correctly rejects
the 4/8-player result.

## Residual coverage note

Current frames are far below the 256 KiB positional limit. The semantic/actual
wire boundary is covered by implementation guards and the product path, but a
synthetic frame whose expanded object exceeds 256 KiB while positional bytes
remain below it would be useful narrow regression coverage in a later harness
cleanup. It is not an admission blocker for this bounded result.

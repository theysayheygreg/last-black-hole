# W1-B+C Seeded Sea Completion

Status: artifact 3 source artifact ready for Workstream review; headed capture
is deferred until this source commit is explicitly accepted.

Date: 2026-07-14
Branch: `codex/v0.3-w1bc-seeded-sea`
Base: `f41e86389493ac35792569c3989f1d111f745d72`

## Authority Boundary

The server/sim remains the sole gameplay owner. Its coarse field combines well
terms, seeded ambient swell, and live event-wave terms, then serializes only
the current vector per row-major cell for renderer forcing. The browser adapter
decodes that packed payload, applies the shared `coords.js` world-Y to texture-V
and world-velocity-to-fluid conversions, and registers the latest packet before
simulation steps. The GPU fluid is presentation detail around that registered
authority; it does not rebuild wells, seeded trains, waves, or RNG state.

Local/offline play uses the existing `FlowField` movement path and existing
honest well/star current presentation. It explicitly clears the remote
authority texture, so it does not display a second renderer-authored seeded sea.
Migration of local gameplay and GPU presentation onto the server-owned seeded
field is deferred rather than duplicated here. Remote play uses the packed
server field and suppresses client-authored well/star velocity injection.

## Delivery Bound

The wire schema is
`float32le-current-y-down-row-major-v1`: `schemaVersion`, `tick`,
`worldScale`, `cellSize`, `columns`, `rows`, `authorityFloor`, `cellCount`,
and base64 `data`. Each cell contributes exactly two little-endian float32
values (`currentX`, `currentY`); object-rich cell metadata never crosses the
snapshot boundary. The runtime caches the serialized packet by coarse-field
identity and authority tick, so repeated snapshots in one tick reuse the same
payload.

Representative packet measurements from the focused fixture:

| Field | Cells | Raw packed bytes | JSON bytes |
| --- | ---: | ---: | ---: |
| 3x3 fixture | 144 | 1,152 | 1,719 |
| 5x5 fixture | 256 | 2,048 | 2,915 |
| 10x10 fixture | 529 | 4,232 | 5,827 |

The 10x10 fixture is the locked focused proof shape: 529 cells and 5,827
serialized bytes.

## Keep / Kill / Redesign

| Effect | Disposition |
| --- | --- |
| Server well terms, seeded swell trains, and live event waves | Keep; authoritative coarse field terms |
| Honest wakes and dyes | Keep; presentation-only where they do not write gameplay current |
| Legacy client coarse-current formula | Kill; no client baseline or coarse well reconstruction |
| Random ambient velocity splats | Kill; deterministic dye seeding has no gameplay current |
| Portal suction | Kill; zero presentation force |
| Pulse well disruption | Kill; retained zero lever, no field mutation |
| Wreck zero-velocity obstruction splat | Kill; retained disabled lever |
| Well/star/ring/shockwave flow | Redesign as authority-driven visual terms in remote play; local fallback retains existing honest presentation |
| Planetoid bow-shock/wake | Deferred and disabled at zero; lever remains present and is neither promoted nor deleted |

## Focused Evidence

Current pure/source proof is recorded by `tests/renderer-authority.cjs` and
includes the shared coordinate adapter, authority-floor direction agreement,
packed row-major decoding, packet-size bounds, same-tick packet reuse, the
local fallback split, and removal of the client coarse-current formula.

The headed two-seed capture section will be filled only after this source
artifact is explicitly accepted. The browser slot is available, but no browser
or capture command has been run in this source checkpoint.

## Deferred Decisions

- Local/offline migration to the shared seeded authority object remains
  deferred; no renderer-side duplicate authority is permitted.
- Planetoid bow-shock/wake remains an unratified Greg decision and stays zero.
- No inferred Wave Race behavior or new effect has been promoted.

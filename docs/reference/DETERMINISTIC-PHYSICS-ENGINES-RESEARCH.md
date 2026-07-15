# Deterministic Physics Engines vs Hand-Rolled Forces — Research

> Research pass 2026-07-14 (Orrery, for v0.3.1 seeded-sea determinism
> question). Verdict adopted: **no engine** — see v0.3.1 review S8a.
> Flags: [C] confirmed, [I] inference.

## Question

Would adopting Box2D / PhysX / a modern engine make LBH's
seeded-deterministic stack (authored parametric sea, server-authoritative,
fixed tick) easier than the hand-rolled forces?

## Per-engine determinism reality

- **Box2D v3.1+** [C]: same-binary AND cross-platform deterministic (no
  fast-math, FMA disabled, custom sinf/cosf/atan2f). No rollback support
  (internal state can't rewind; recreate world for clean replay).
  box2d.org/posts/2024/08/determinism/
- **Box2D JS/WASM ports** [C/I]: Planck.js — same-runtime-only
  reproducibility (inherits Math.*); box2d-wasm wraps pre-determinism
  v2.4. A WASM build of v3.1 would likely be bit-deterministic across
  browsers (WASM float ops fully specified) — inference, uncertified.
- **PhysX** [C]: narrow guarantee — same scene, same insertion order,
  same release, same platform. eENABLE_ENHANCED_DETERMINISM adds only
  island isolation at a perf cost. Not cross-platform/cross-version. No
  sanctioned WASM/Node path.
- **Rapier (Rust/WASM)** [C]: strongest story — `enhanced-determinism`
  gives bit-level cross-platform determinism on IEEE 754-2008 platforms;
  excludes parallel/SIMD; and YOUR code's Math.sin still breaks it.
- **Jolt** [C]: cross-platform deterministic with
  CROSS_PLATFORM_DETERMINISTIC=ON; C++/3D; no WASM story here.
- **Bullet** [C]: not deterministic by default; extremely hard even
  same-platform. Ruled out.
- **Matter.js** [C]: reproducibility failures across runs/platforms
  documented. Ruled out.

## Fit analysis (grounded in LBH code)

What an engine would replace vs what stays custom regardless:

- Stays custom (no engine equivalent): current-coupling velocity lerp,
  wave-band forces, authored radial gravity falloffs (custom exponent +
  max range), slingshot energy/cancel logic, deltaV economy.
- Engine overlap: swept circle-circle contact (~90 lines, already
  torus-aware with deterministic tie-breaks in `world-geometry.cjs`) and
  broadphase (`spatial-index.cjs` is torus-aware with deterministic
  result ordering).
- Engines' actual product (restitution, stacking, joints, resting
  contacts) is absent from LBH's inventory: wells kill rather than
  bounce; bumps are one-shot impulses; ships are point masses.
- Costs: **no engine wraps a torus** (teleport seams break swept tests;
  ghost bodies = 4× bookkeeping); per-tick JS↔WASM marshalling for every
  body; determinism hostage to engine internals and version pinning.

## The seeding reality

- [C] LBH already has: seeded RNG streams (`rng-stream.cjs` — mulberry32,
  integer-only ops → bit-identical across platforms; named stream
  isolation) and a fixed tick.
- [C] JS `+ - * /` are IEEE-754-exact everywhere; transcendentals
  (Math.sin/cos/pow...) are NOT specified and have changed across V8
  versions and differ across engines/OS libm.
- **Load-bearing fact:** server-authoritative, one sim per match →
  determinism must hold on ONE Node process, where the current sim is
  already fully deterministic (given rng-stream discipline + sorted
  iteration, both present). Lockstep/rollback-grade cross-machine
  determinism (fixed-point, same-binary discipline — the StarCraft/GGPO
  machinery) is NOT required by this architecture.
- Cross-platform float variance matters only if (a) client prediction
  must bit-match (it doesn't — reconciliation tolerates drift) or
  (b) clients reconstruct the sea locally from seed (fix: hash-based
  noise or a ~20-line bundled deterministic sin — Box2D's own move).

## Verdict (adopted)

Net-harder; do not adopt an engine for determinism. Guardrails instead:
1. Replay-checksum test: N ticks from one seed, twice, hash must match
   (handoff W1-C).
2. Lint the sim path for bare `Math.random` (live `|| Math.random`
   fallbacks exist, e.g. sim-runtime.cjs:3181-era anchors).
3. If clients later evaluate the sea from seed: hash-based noise /
   bundled deterministic sin for the sea evaluator only.
Revisit Rapier-WASM only if genuine rigid-body needs appear (rotating
hulls, resting contacts, debris stacking).

## Key sources

box2d.org determinism post + FAQ; Planck.js limitations docs;
birch-san/box2d-wasm; NVIDIA PhysX 5 rigid-body docs + PxSceneFlag;
rapier.rs determinism guides (Rust + JS); JoltPhysics discussion #617;
Bullet forum + Ubisoft deterministic-Bullet paper; matter-js issues
#1190/#1269/#1040; macwright.com "Math keeps changing"; Mozilla fdlibm
thread; "1500 Archers on a 28.8" (AoE lockstep); GGPO; SnapNet netcode
series; WebAssembly nondeterminism doc.

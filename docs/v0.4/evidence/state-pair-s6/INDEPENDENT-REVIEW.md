# S6 Independent Red-Team Verdict

Verdict: **ACCEPT** after two implementation fixes and one evidence-analyzer
fix. Product admission remains denied.

The independent review attacked opaque-brand forgery and mutation; same-cursor
substitution; schema, manifest, match, session, recipient, incarnation, lane,
and cursor isolation; owner-private leakage; stale ACK bases; reconnect,
rebase, and retention behavior; negative zero; prototype pollution; v1 and
mixed rollback; cleanup; exact wire/client equivalence; and A/B method binding.

The review found and closed:

1. Legacy mode accepted `tick: -0` while prepared mode rejected it. Shared
   canonical view validation now rejects negative-zero integer lineage in both
   modes.
2. Prepared mode dereferenced malformed null input before canonical validation.
   Both modes now return the same structured `unknown-schema` failure.
3. The first analysis helper could vacuously accept disjoint legacy/prepared
   population sets and hardcoded method claims. It now binds clean aggregate
   and run commits, machine, seed, environment, profiler/monitor settings,
   warm-up/window/input rate, symmetric per-pair populations, the 3/1/3 repeat
   plan, and both execution-order directions. The demonstrated
   `r1-legacy::r4-prepared` adversary now fails.

Final review verification:

- `PreparedReplicationProjections`: 4/4.
- `CanonicalStructuralDelta`: 9/9.
- `AuthorityDeltaPublisher`: 17/17.
- Exact 12-frame equivalence SHA-256:
  `8ef78dc4b375c65d01cd584cf10d1ee4fcae355b2a88c8ec1a39b2d082eff176`.
- All eight artifact checksum manifests pass.
- `analysis.json` regenerates exactly apart from its timestamp and
  output-relative paths.
- Accepted analysis SHA-256:
  `32f97d424f929b37a6da624a578fd379261ad030d3965db34d5cd0452219b1c6`.
- Final `npm run test:multiplayer-network`: 24/24 suites passed.

No remaining must-fix defect was found. The review lane made no file changes.

# Independent S8 Red-Team Review

The independent read-only review initially rejected the prototype and supplied
reproductions for four S8 blockers:

1. admission mutation plus retained owner histories exhausted a bounded
   authority after disconnect churn;
2. transit planetoids used unclassified `heading` and `maxAge` path fields;
3. reconstruction accepted unexpected components and a missing
   `runtimeOrder`;
4. the receiver exposed entity rows rather than the full legacy public-state
   shape.

It then reproduced two revision/recovery failures. A public revision tracker
shared across split recipients allowed one recipient's temporal skew to advance
another recipient's revision. Separately, an undelivered value change followed
by a return to the old value caused the recovery keyframe to carry a newer
revision with the same last-observed value, which the client rejected forever.

The final implementation isolates split revision histories per admission,
cleans them on disconnect, and permits an explicitly requested full recovery
keyframe to summarize unseen revision history. Sparse deltas still reject a
revision-only update. Deterministic tests cover both exact reproductions plus
sustained lockstep 4/8 streams. Post-fix review found no remaining S8-specific
P1.

The review also corrected three evidence overclaims before the clean run:

- configured 10 Hz and zero-lag policy are labeled as configuration, not
  observed timing;
- admission uses receiver-accepted cadence, not only socket-send callbacks;
- any spontaneous recovery in a normal window fails correctness.

The product artifact labels the gate's legacy-state check as internal shape
consistency. Source-exact equality is established by the focused test, which
holds both the authoritative pre-split source and reconstructed client state.

## Remaining deferred debt

The default-off S8 capability is clean under the reviewed scope. The older
legacy rollback/coexistence lane still uses a shared public revision tracker.
The same artificial two-recipient temporal-skew reproduction can trigger a
legacy `semantic-fallback:revision-without-change` keyframe and client
`lineage-mismatch`. This behavior predates S8 and is not exercised by the live
same-snapshot broadcast path, so S8 does not silently change the default
rollback implementation. Record it as a bounded follow-up for the next codec
slice: either isolate legacy histories too or prove and enforce one shared
public-core snapshot per authoritative beat.

The clean complete artifact is `final/`; the stopped `313804a` run is retained
only as an interrupted diagnostic. The final focused suite passes 7/7, client
receiver passes 18/18, the full multiplayer-network lane passes 26/26, artifact
validation exits `0`, and product admission correctly exits `2`.

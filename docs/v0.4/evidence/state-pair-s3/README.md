# S3 state-pair product gate evidence

This directory preserves the deterministic, opt-in `state-pair-v1` product-traffic gate runs. It is evidence, not a canonical roadmap or architecture decision.

## Decision

S3 fails. Do not advance to fleet or hosted-network work from this result.

The five-minute canonical normal windows measured worst-recipient downstream application traffic of 450,032 / 155,464 / 88,603 bytes per second at 1 / 4 / 8 recipients. One-second p95 was 502,371 / 193,522 / 109,797 bytes per second. All accepted product-window state pairs were keyframes. Required mean reductions to reach 64 KiB/s are 85.4% / 57.8% / 26.0%.

The dominant cause is `atomic-kind-alignment:public-delta+owner-delta-not-smaller`. At 8 recipients, the scenario-lifetime candidate averages were 16,255-byte public delta versus 37,255-byte public keyframe, while owner delta was 2,242 bytes versus a 1,856-byte owner keyframe. The ranked next slice is therefore mixed public-delta plus owner-keyframe lanes inside one atomically applied `statePair`. Preserve atomic observation; do not begin binary, AOI, compression, WSS, or fleet work yet.

Independent review also treats 8-recipient CPU/overload and instrumented-process memory slope as separate failures requiring diagnosis. Canonical projection/publish p95 was 58.5 / 219.8 / 410.6 ms at 1 / 4 / 8 recipients. Canonical RSS slope was approximately +0.78 / +0.95 / +1.25 MB/s; this includes the opt-in retained accounting ledger and is not product-only memory evidence.

## Artifacts

- `...T062243917Z-805c5d4` is the complete canonical 60-second warmup plus 300-second normal and 20-second warmup plus 90-second churn run at 1 / 4 / 8 recipients. Composite evidence SHA-256: `55ff1666b4c8efdabb58bdc77a024a0df33edee2b5681558f62ac8e9fad7cf90`. Validation passed; product verdict failed.
- `...T070310162Z-564364a` is the clean independent 1 / 8 representative review after methodology corrections. Composite evidence SHA-256: `3ca68e3cd7cc0bc900a6de0f601c8ccefc454fa04ecea7715f3e974364232569`; raw `aggregate.json` SHA-256: `05fb950418826bd6a797bca4269913fd0a39a26bfc6d933d50ae5f70866110f5`. Validation, accounting, cleanup, and product correctness passed; the overall product verdict still failed on traffic and 8-recipient CPU/overload.
- `...T060124247Z-e7e8190` and `...T061400088Z-7559106` preserve stopped canonical partials that exposed evidence-sampling and post-cleanup ACK-base defects.
- `...T064959946Z-1e84af8` preserves the first independent review, which rejected timing-dependent lifecycle evidence.
- `...T065737102Z-b1e05af` and `...T070041106Z-d321be2` preserve failed focused reviews that exposed incorrect authority-barrier field selection. Their failure and cleanup files are intentional negative evidence.

The final independent churn review proved exact membership replacement, authority absence, surviving-client despawn and replacement visibility, target-specific ACK recovery, exact recovery-request serialized bytes, and clean connection/port/process teardown at 1 and 8 recipients.

## Boundary

Traffic is exact UTF-8 JSON application bytes at the raw WebSocket boundary. Manifest bytes are separate. WebSocket framing, TCP/IP, TLS/WSS, WAN behavior, compression, hosted ingress/egress, concurrent-match fleet packing, and 24-96-client claims are excluded. CPU and memory are machine-local Apple M4 observations. Publisher cause/candidate/ACK counters are explicitly scenario-lifetime values including warmup; accepted traffic, fixed traffic windows, client work, and memory samples use the product window.

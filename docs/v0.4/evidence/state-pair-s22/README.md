# S22 runtime public-projection worker screening

Status: candidate rejected; eight-player admission remains closed.

Production integration was reverted after review. The exact implementation is
preserved in commits `92f1988`, `513d283`, and `a0fc1d4`; these artifacts bind
the last of those commits.

All captures bind clean source commit `a0fc1d4`. `screening-inline`,
`screening-workers-2`, and `screening-workers-4` use a 1 s warmup and 3 s
measurement window for the same isolated-process 1/4/8 product path. The
`full-workers-2` repeat uses the normal 5 s warmup and 20 s measurement
window. Profiler instrumentation is off in every capture.

The short matrix was an explicit early-rejection screen, not an admission
matrix. Two and four workers were both materially slower than inline and both
failed eight-player correctness because the 80 ms worker deadline expired.
The normal-window two-worker repeat confirmed the same result, so a second
long counterbalanced round was intentionally not spent on a topology that had
already failed cadence, latency, CPU, and zero-fallback gates by large margins.

The generated short-run `run.command` field does not include the warmup,
window, or output-directory overrides. Reproduce from `run.json.config`:
`LBH_S13_WARMUP_MS=1000`, `LBH_S13_WINDOW_MS=3000`, and the desired output
variable. The long repeat uses the runner defaults of 5000/20000 ms.

See `../../MULTIPLAYER-STATE-PAIR-S22-RUNTIME-PUBLIC-WORKERS.md` for the
decision, exact comparison, authority boundary, and next bounded lane.

"use strict";

const v8 = require("v8");
const { parentPort } = require("worker_threads");
const { performance } = require("perf_hooks");
const { replayPublicProjection } = require("./state-pair-pure-replay.cjs");

parentPort.postMessage({ type: "ready" });

parentPort.on("message", async (message) => {
  if (message.type === "shutdown") {
    parentPort.postMessage({ type: "shutdown-ack" });
    parentPort.close();
    return;
  }
  if (message.type === "crash") process.exit(73);
  if (message.delayMs) await new Promise((resolve) => setTimeout(resolve, message.delayMs));
  const cpuStart = process.threadCpuUsage();
  const started = performance.now();
  try {
    const replay = replayPublicProjection(message.job);
    const computeMs = performance.now() - started;
    const cpu = process.threadCpuUsage(cpuStart);
    const keyframe = replay.publicKeyframeBytes.buffer.slice(replay.publicKeyframeBytes.byteOffset,
      replay.publicKeyframeBytes.byteOffset + replay.publicKeyframeBytes.byteLength);
    const delta = replay.publicDeltaBytes && replay.publicDeltaBytes.buffer.slice(
      replay.publicDeltaBytes.byteOffset, replay.publicDeltaBytes.byteOffset + replay.publicDeltaBytes.byteLength);
    const result = { fence: replay.fence, publicKeyframeBytes: Buffer.from(keyframe),
      publicKeyframeDigest: replay.publicKeyframeDigest,
      publicDeltaBytes: delta ? Buffer.from(delta) : null,
      publicDeltaDigest: replay.publicDeltaDigest,
      transferredPublicBytes: keyframe.byteLength + (delta?.byteLength || 0),
      metadataCloneProxyBytes: Buffer.byteLength(JSON.stringify({ fence: replay.fence,
        publicKeyframeDigest: replay.publicKeyframeDigest,
        publicDeltaDigest: replay.publicDeltaDigest }), "utf8") };
    const transfer = [result.publicKeyframeBytes.buffer];
    if (result.publicDeltaBytes) transfer.push(result.publicDeltaBytes.buffer);
    parentPort.postMessage({ type: "result", requestId: message.requestId, result, computeMs,
      cpuMicros: cpu.user + cpu.system, heapUsed: v8.getHeapStatistics().used_heap_size },
    transfer);
  } catch (error) {
    parentPort.postMessage({ type: "error", requestId: message.requestId,
      error: String(error?.stack || error) });
  }
});

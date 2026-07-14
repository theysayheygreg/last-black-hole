"use strict";

const v8 = require("v8");
const { parentPort } = require("worker_threads");
const { performance } = require("perf_hooks");
const { replayStatePair } = require("./state-pair-pure-replay.cjs");

parentPort.on("message", async (message) => {
  if (message.type === "shutdown") {
    parentPort.postMessage({ type: "shutdown-ack" });
    return;
  }
  if (message.type === "crash") process.exit(73);
  if (message.delayMs) await new Promise((resolve) => setTimeout(resolve, message.delayMs));
  const cpuStart = process.threadCpuUsage();
  const started = performance.now();
  try {
    const result = replayStatePair(message.job);
    const computeMs = performance.now() - started;
    const cpu = process.threadCpuUsage(cpuStart);
    const transferable = result.compressed.buffer.slice(
      result.compressed.byteOffset, result.compressed.byteOffset + result.compressed.byteLength);
    result.compressed = Buffer.from(transferable);
    parentPort.postMessage({ type: "result", requestId: message.requestId, result, computeMs,
      cpuMicros: cpu.user + cpu.system, heapUsed: v8.getHeapStatistics().used_heap_size },
    [result.compressed.buffer]);
  } catch (error) {
    parentPort.postMessage({ type: "error", requestId: message.requestId,
      error: String(error?.stack || error) });
  }
});

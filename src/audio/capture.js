import { traceEventId } from './deterministic.js';

/** Presentation trace seam: deterministic event inventory for browser/offline renderers. */
export class AudioTraceCapture {
  constructor(runSeed = 'local') { this.reset(runSeed, 0); }
  reset(runSeed = this.runSeed, origin = 0) {
    this.runSeed = runSeed;
    this.origin = Number.isFinite(Number(origin)) ? Number(origin) : 0;
    this.events = [];
    this.sequence = 0;
  }
  mark(cue, at = 0, detail = {}) {
    const id = traceEventId(this.runSeed, cue, this.sequence++);
    const relativeAt = Math.max(0, Number(at) - this.origin);
    this.events.push({ id, cue, at: Number(relativeAt.toFixed(4)), ...detail });
    return id;
  }
  manifest() {
    return { schema: 'lbh-audio-trace-v1', timeBasis: 'run-relative', runSeed: this.runSeed, eventCount: this.events.length, events: [...this.events] };
  }
}

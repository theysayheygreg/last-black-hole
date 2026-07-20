import { traceEventId } from './deterministic.js';

/** Presentation trace seam: deterministic event inventory for browser/offline renderers. */
export class AudioTraceCapture {
  constructor(runSeed = 'local') { this.reset(runSeed); }
  reset(runSeed = this.runSeed) { this.runSeed = runSeed; this.events = []; this.sequence = 0; }
  mark(cue, at = 0, detail = {}) {
    const id = traceEventId(this.runSeed, cue, this.sequence++);
    this.events.push({ id, cue, at: Number(Number(at).toFixed(4)), ...detail });
    return id;
  }
  manifest() {
    return { schema: 'lbh-audio-trace-v1', runSeed: this.runSeed, eventCount: this.events.length, events: [...this.events] };
  }
}

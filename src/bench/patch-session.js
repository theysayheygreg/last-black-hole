import { validateBenchValue } from './contract-registry.js';

export const BENCH_PATCH_SCHEMA = 'lbh-bench-patch/v1';

function editKey(adapterId, propertyId) {
  return `${adapterId}\u0000${propertyId}`;
}

function editStatus(contract) {
  return contract.applies === 'restart' ? 'banked-restart' : 'live-applied';
}

function cloneEdit(edit) {
  return Object.freeze({
    adapterId: edit.adapterId,
    propertyId: edit.propertyId,
    value: edit.value,
    applies: edit.applies,
    status: edit.status,
  });
}

function cloneMap(source) {
  return new Map([...source].map(([key, value]) => [key, { ...value }]));
}

function parsePatch(input) {
  let patch = input;
  if (typeof input === 'string') {
    try {
      patch = JSON.parse(input);
    } catch (error) {
      throw new Error(`Invalid Bench patch JSON: ${error.message}`);
    }
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Bench patch must be an object');
  }
  if (patch.schema !== BENCH_PATCH_SCHEMA) {
    throw new Error(`Bench patch schema must be '${BENCH_PATCH_SCHEMA}'`);
  }
  if (!Array.isArray(patch.edits)) throw new Error('Bench patch edits must be an array');
  return patch;
}

export class BenchPatchSession {
  #registry;
  #edits = new Map();
  #baselines = new Map();
  #undo = [];

  constructor(registry) {
    if (!registry || typeof registry.get !== 'function' || typeof registry.contract !== 'function') {
      throw new Error('BenchPatchSession requires a Bench contract registry');
    }
    this.#registry = registry;
  }

  edits() {
    return Object.freeze([...this.#edits.values()].map(cloneEdit));
  }

  liveApplied() {
    return Object.freeze(this.edits().filter((edit) => edit.status === 'live-applied'));
  }

  bankedRestart() {
    return Object.freeze(this.edits().filter((edit) => edit.status === 'banked-restart'));
  }

  canUndo() {
    return this.#undo.length > 0;
  }

  async setProperty(identity, propertyId, value) {
    const adapter = this.#registry.resolve(identity);
    if (!adapter) throw new Error('NO TUNABLE CONTRACT YET');
    const contract = this.#registry.contract(adapter, propertyId);
    if (!contract) throw new Error(`Unknown Bench property '${propertyId}' for adapter '${adapter.id}'`);
    validateBenchValue(contract, value);

    const key = editKey(adapter.id, propertyId);
    await this.#ensureBaseline(adapter, contract, key);
    this.#rememberUndo();
    const edit = {
      adapterId: adapter.id,
      propertyId,
      value,
      applies: contract.applies,
      status: editStatus(contract),
    };
    if (edit.status === 'live-applied') await this.#apply(adapter, edit, 'set-property');
    this.#edits.set(key, edit);
    return cloneEdit(edit);
  }

  async resetProperty(identity, propertyId) {
    const adapter = this.#registry.resolve(identity);
    if (!adapter) throw new Error('NO TUNABLE CONTRACT YET');
    const contract = this.#registry.contract(adapter, propertyId);
    if (!contract) throw new Error(`Unknown Bench property '${propertyId}' for adapter '${adapter.id}'`);
    const key = editKey(adapter.id, propertyId);
    if (!this.#edits.has(key)) return false;
    this.#rememberUndo();
    await this.#restoreKey(key, this.#edits.get(key), 'reset-property');
    this.#edits.delete(key);
    return true;
  }

  async resetType(identity) {
    const adapter = this.#registry.resolve(identity);
    if (!adapter) throw new Error('NO TUNABLE CONTRACT YET');
    const targets = [...this.#edits.entries()].filter(([, edit]) => edit.adapterId === adapter.id);
    if (targets.length === 0) return 0;
    this.#rememberUndo();
    for (const [key, edit] of targets) {
      await this.#restoreKey(key, edit, 'reset-type');
      this.#edits.delete(key);
    }
    return targets.length;
  }

  async revertAll() {
    if (this.#edits.size === 0) return 0;
    const targets = [...this.#edits.entries()];
    this.#rememberUndo();
    for (const [key, edit] of targets) await this.#restoreKey(key, edit, 'revert-all');
    this.#edits.clear();
    return targets.length;
  }

  async undoLastChange() {
    const previous = this.#undo.pop();
    if (!previous) return false;
    await this.#reconcile(previous);
    this.#edits = previous;
    return true;
  }

  exportJSON({ pretty = true } = {}) {
    return JSON.stringify({ schema: BENCH_PATCH_SCHEMA, edits: this.edits() }, null, pretty ? 2 : 0);
  }

  async importJSON(input) {
    const patch = parsePatch(input);
    const next = new Map();
    for (const candidate of patch.edits) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error('Bench patch edit must be an object');
      }
      const adapter = this.#registry.get(candidate.adapterId);
      if (!adapter) throw new Error(`Unknown Bench adapter '${candidate.adapterId}'`);
      const contract = this.#registry.contract(adapter, candidate.propertyId);
      if (!contract) {
        throw new Error(`Unknown Bench property '${candidate.propertyId}' for adapter '${adapter.id}'`);
      }
      validateBenchValue(contract, candidate.value);
      const expectedStatus = editStatus(contract);
      if (candidate.applies !== contract.applies || candidate.status !== expectedStatus) {
        throw new Error(`Bench patch timing mismatch for '${adapter.id}/${contract.id}'`);
      }
      const key = editKey(adapter.id, contract.id);
      if (next.has(key)) throw new Error(`Duplicate Bench patch edit '${adapter.id}/${contract.id}'`);
      await this.#ensureBaseline(adapter, contract, key);
      next.set(key, {
        adapterId: adapter.id,
        propertyId: contract.id,
        value: candidate.value,
        applies: contract.applies,
        status: expectedStatus,
      });
    }

    this.#rememberUndo();
    await this.#reconcile(next, 'import-patch');
    this.#edits = next;
    return this.edits();
  }

  #rememberUndo() {
    this.#undo.push(cloneMap(this.#edits));
  }

  async #ensureBaseline(adapter, contract, key) {
    if (this.#baselines.has(key)) return;
    const value = await adapter.read({ identity: adapter.identity, propertyId: contract.id });
    validateBenchValue(contract, value);
    this.#baselines.set(key, value);
  }

  async #apply(adapter, edit, reason) {
    await adapter.apply({
      identity: adapter.identity,
      propertyId: edit.propertyId,
      value: edit.value,
      applies: edit.applies,
      reason,
    });
  }

  async #restoreKey(key, edit, reason) {
    if (edit.status !== 'live-applied') return;
    const adapter = this.#registry.get(edit.adapterId);
    await this.#apply(adapter, { ...edit, value: this.#baselines.get(key) }, reason);
  }

  async #reconcile(next, reason = 'undo-last-change') {
    const keys = new Set([...this.#edits.keys(), ...next.keys()]);
    for (const key of keys) {
      const current = this.#edits.get(key);
      const target = next.get(key);
      if (current?.value === target?.value && current?.status === target?.status) continue;
      const reference = target || current;
      if (reference.status !== 'live-applied') continue;
      const adapter = this.#registry.get(reference.adapterId);
      const value = target ? target.value : this.#baselines.get(key);
      await this.#apply(adapter, { ...reference, value }, reason);
    }
  }
}

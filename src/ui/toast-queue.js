export const TOAST_SEVERITY = Object.freeze({
  threat: 3,
  system: 2,
  loot: 1,
});

export const TOAST_LIFETIME_MS = Object.freeze({
  threat: 4000,
  system: 2500,
  loot: 1500,
});

const DEDUPE_WINDOW_MS = 2000;
const MAX_THREAT = 3;
const MAX_SYSTEM = 3;
const MAX_LOOT = 3;

export function createToastQueueState() {
  return { entries: [], nextId: 1, lootOverflow: 0 };
}

function liveEntries(state, now) {
  return state.entries.filter((entry) => entry.expiresAt > now);
}

function compareForDisplay(a, b) {
  return TOAST_SEVERITY[b.severity] - TOAST_SEVERITY[a.severity]
    || a.createdAt - b.createdAt
    || a.id - b.id;
}

export function readToastQueue(state, now) {
  return liveEntries(state, now).slice().sort(compareForDisplay);
}

export function expireToastQueue(state, now) {
  const entries = liveEntries(state, now);
  if (entries.length === state.entries.length) return state;
  return { ...state, entries, lootOverflow: entries.some((entry) => entry.aggregate) ? state.lootOverflow : 0 };
}

export function enqueueToast(state, toast, now) {
  const severity = toast?.severity;
  const message = String(toast?.message || '').trim();
  if (!TOAST_SEVERITY[severity]) throw new Error(`Unknown toast severity: ${severity}`);
  if (!message) throw new Error('Toast message is required');

  const current = expireToastQueue(state, now);
  const duplicate = current.entries.find((entry) => (
    entry.message === message && now - entry.createdAt < DEDUPE_WINDOW_MS
  ));
  if (duplicate) return current;

  const entry = {
    id: current.nextId,
    severity,
    message,
    createdAt: now,
    expiresAt: now + (toast.lifetimeMs ?? TOAST_LIFETIME_MS[severity]),
  };
  let entries = current.entries.slice();
  let lootOverflow = current.lootOverflow;

  if (severity === 'threat') {
    const threats = entries.filter((item) => item.severity === 'threat');
    if (threats.length >= MAX_THREAT) {
      const oldestThreat = threats.reduce((oldest, item) => compareForDisplay(oldest, item) <= 0 ? oldest : item);
      entries = entries.filter((item) => item.id !== oldestThreat.id);
    }
    entries.push(entry);
  } else if (severity === 'system') {
    const systems = entries.filter((item) => item.severity === 'system');
    if (systems.length >= MAX_SYSTEM) entries = entries.filter((item) => item.id !== systems[0].id);
    entries.push(entry);
  } else {
    const loot = entries.filter((item) => item.severity === 'loot');
    if (loot.length < MAX_LOOT) {
      entries.push(entry);
    } else {
      lootOverflow += 1;
      const aggregate = loot.find((item) => item.aggregate);
      if (aggregate) {
        entries = entries.map((item) => item.id === aggregate.id ? {
          ...item,
          message: `+${lootOverflow} items`,
          expiresAt: entry.expiresAt,
        } : item);
      } else {
        const replaced = loot[loot.length - 1];
        entries = entries.map((item) => item.id === replaced.id ? {
          ...entry,
          message: `+${lootOverflow} items`,
          aggregate: true,
        } : item);
      }
    }
  }

  return { entries, nextId: current.nextId + 1, lootOverflow };
}

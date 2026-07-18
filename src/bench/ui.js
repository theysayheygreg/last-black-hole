import { createBenchContractRegistry } from './contract-registry.js';
import { createBenchInspectorViewModel } from './inspector.js';
import { projectBenchIdentities, resolveBenchWorldBounds } from './identity-projection.js';
import { pickBenchIdentity, selectBenchIdentityGroup } from './picking.js';

const registry = createBenchContractRegistry();

function style(element, rules) {
  Object.assign(element.style, rules);
  return element;
}

export function formatBenchUiError(error) {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown Bench error');
  const concise = message.replace(/\s+/g, ' ').trim();
  return (concise || 'Unknown Bench error').slice(0, 160);
}

export function reduceBenchUiActionState(current, action) {
  const state = current || { lastGood: null, error: null };
  if (action?.type === 'success') {
    return { lastGood: action.value === undefined ? state.lastGood : action.value, error: null };
  }
  if (action?.type === 'failure') {
    return { lastGood: state.lastGood, error: formatBenchUiError(action.error) };
  }
  throw new Error(`Unknown Bench UI action state transition: ${action?.type || 'missing'}`);
}

export function resolveBenchReplayTruth(benchState, fallbackSnapshot = null) {
  if (benchState?.authorityTruth && typeof benchState.authorityTruth === 'object') {
    return benchState.authorityTruth;
  }
  return fallbackSnapshot && typeof fallbackSnapshot === 'object' ? fallbackSnapshot : {};
}

export async function runBenchUiAction(action, reportOutcome = null) {
  try {
    const value = await action();
    reportOutcome?.({ type: 'success' });
    return value;
  } catch (error) {
    reportOutcome?.({ type: 'failure', error });
    return undefined;
  }
}

function button(label, action, reportOutcome = null) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  style(element, {
    border: '1px solid rgba(0,226,255,.38)', background: 'rgba(3,14,25,.94)',
    color: '#d9f8ff', padding: '7px 9px', font: '11px var(--lbh-font-ui)',
    cursor: 'pointer', textAlign: 'left',
  });
  element.addEventListener('click', async () => {
    element.disabled = true;
    try {
      await runBenchUiAction(() => action(element), reportOutcome);
    } finally {
      element.disabled = false;
    }
  });
  return element;
}

function identityFromExhibit(exhibit) {
  return {
    key: exhibit.identity,
    family: exhibit.family,
    archetype: exhibit.family,
    displayLabel: exhibit.family.replaceAll('-', ' '),
    groupKey: `${exhibit.family}:${exhibit.family}`,
    position: exhibit.placement ? { x: exhibit.placement.x, y: exhibit.placement.y } : null,
    context: Object.freeze({ bayId: exhibit.bayId }),
  };
}

export async function initBenchUi({ simClient, overlayCanvas, getSnapshot, screenToWorldPoint }) {
  if (!simClient?.enabled) throw new Error('Bench requires a configured local sim authority');

  const root = style(document.createElement('section'), {
    position: 'fixed', inset: '0', zIndex: '9000', pointerEvents: 'none',
    color: '#d9f8ff', font: '12px var(--lbh-font-ui)',
  });
  root.id = 'bench-ui';
  root.dataset.mode = 'authority-gallery';

  const toolbar = style(document.createElement('header'), {
    position: 'absolute', top: '10px', left: '10px', right: '374px', minHeight: '44px',
    display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 9px',
    background: 'rgba(0,4,14,.94)', border: '1px solid rgba(0,226,255,.35)',
    pointerEvents: 'auto',
  });
  const title = document.createElement('strong');
  title.textContent = 'THE BENCH · GALLERY';
  title.style.marginRight = '8px';
  toolbar.appendChild(title);

  const inspector = style(document.createElement('aside'), {
    position: 'absolute', top: '10px', right: '10px', bottom: '10px', width: '350px',
    overflow: 'auto', padding: '14px', background: 'rgba(0,4,14,.96)',
    border: '1px solid rgba(0,226,255,.35)', pointerEvents: 'auto',
  });
  const status = document.createElement('div');
  status.style.cssText = 'color:#80b8c4;margin:8px 0 14px;line-height:1.45';
  const exhibitList = style(document.createElement('nav'), {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '14px',
  });
  const selection = document.createElement('div');
  inspector.append(status, exhibitList, selection);
  root.append(toolbar, inspector);
  document.body.appendChild(root);

  let state = null;
  let selected = null;
  let actionState = reduceBenchUiActionState(null, { type: 'success', value: null });

  function renderStatus() {
    if (actionState.error) {
      status.textContent = `BENCH ERROR · ${actionState.error}`;
      status.style.color = '#ff7b72';
      return;
    }
    status.style.color = '#80b8c4';
    const current = actionState.lastGood || state;
    if (!current) {
      status.textContent = 'Bench authority unavailable';
      return;
    }
    status.textContent = `seed ${current.gallery.seed} · ${current.gallery.activeBayId} · `
      + `${current.patch.liveApplied.length} live / ${current.patch.bankedRestart.length} restart-banked`;
  }

  function reportOutcome(action) {
    actionState = reduceBenchUiActionState(actionState, action.type === 'success'
      ? { ...action, value: state }
      : action);
    renderStatus();
  }

  async function showSelection(identity, grouped = []) {
    const view = identity ? await createBenchInspectorViewModel(registry, {
      family: identity.family,
      type: identity.archetype || identity.family,
    }) : null;
    const heading = document.createElement('h2');
    heading.textContent = identity?.displayLabel || identity?.archetype || 'Nothing selected';
    heading.style.cssText = 'font:600 18px var(--lbh-font-display);margin:0 0 4px;text-transform:uppercase';
    selection.replaceChildren();
    selection.appendChild(heading);
    selected = identity;
    if (!identity) return;
    const badge = document.createElement('div');
    badge.textContent = view.status;
    badge.style.cssText = 'color:#ffb938;border:1px solid rgba(255,185,56,.45);padding:7px;margin:8px 0 12px';
    selection.appendChild(badge);
    const facts = document.createElement('pre');
    facts.textContent = JSON.stringify({
      family: identity.family,
      archetype: identity.archetype,
      selectedInstances: grouped.length || 1,
      context: identity.context || {},
    }, null, 2);
    facts.style.cssText = 'white-space:pre-wrap;color:#9cc3ce;font:11px var(--lbh-font-mono);line-height:1.5';
    selection.appendChild(facts);
  }

  function patchFromState() {
    return state?.patch || { schema: 'lbh-bench-patch/v1', edits: [] };
  }

  async function refresh(next = null) {
    const candidate = next || await simClient.getBench();
    if (!candidate?.gallery || !Array.isArray(candidate.gallery.bays)
      || !Array.isArray(candidate?.patch?.liveApplied)
      || !Array.isArray(candidate?.patch?.bankedRestart)) {
      throw new Error('Bench authority returned an invalid Gallery state');
    }
    toolbar.querySelectorAll('[data-bay]').forEach((entry) => entry.remove());
    for (const bay of candidate.gallery.bays) {
      const bayButton = button(bay.label, async () => {
        const response = await simClient.activateBenchBay(bay.id);
        selected = null;
        await refresh(response);
      }, reportOutcome);
      bayButton.dataset.bay = bay.id;
      if (bay.active) bayButton.style.borderColor = '#38f58a';
      toolbar.appendChild(bayButton);
    }
    const active = candidate.gallery.bays.find((bay) => bay.active);
    exhibitList.replaceChildren();
    for (const exhibit of active?.exhibits || []) {
      const identity = identityFromExhibit(exhibit);
      exhibitList.appendChild(button(identity.displayLabel, () => showSelection(identity), reportOutcome));
    }
    if (!selected && active?.exhibits?.[0]) await showSelection(identityFromExhibit(active.exhibits[0]));
    state = candidate;
  }

  toolbar.append(
    button('Replay Same Setup', async () => {
      const truth = resolveBenchReplayTruth(state, getSnapshot?.());
      await simClient.replayBenchSameSetup(truth);
    }, reportOutcome),
    button('Undo Last Change', async () => {
      const response = await simClient.undoBench();
      await refresh({ ...state, patch: response.patch, canUndo: false });
    }, reportOutcome),
    button('Revert All', async () => {
      const response = await simClient.resetBench();
      await refresh({ ...state, patch: response.patch });
    }, reportOutcome),
    button('Export Patch', async (control) => {
      await navigator.clipboard.writeText(JSON.stringify(patchFromState(), null, 2));
      control.textContent = 'Patch Copied';
      setTimeout(() => { control.textContent = 'Export Patch'; }, 900);
    }, reportOutcome),
    button('Import Patch', async () => {
      const source = window.prompt('Paste a Bench tuning patch JSON');
      if (!source) return;
      const response = await simClient.importBenchPatch(JSON.parse(source));
      await refresh({ ...state, patch: response.patch });
    }, reportOutcome),
  );

  overlayCanvas?.addEventListener('pointerdown', (event) => {
    void runBenchUiAction(async () => {
      const snapshot = getSnapshot?.();
      if (!snapshot) return;
      const identities = projectBenchIdentities(snapshot);
      const point = screenToWorldPoint(event.clientX, event.clientY);
      const hit = pickBenchIdentity(identities, point, {
        bounds: resolveBenchWorldBounds(snapshot), padding: 0.025,
      });
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      await showSelection(hit, selectBenchIdentityGroup(identities, hit));
    }, reportOutcome);
  }, true);

  try {
    await refresh();
    reportOutcome({ type: 'success' });
  } catch (error) {
    reportOutcome({ type: 'failure', error });
  }
  return Object.freeze({ root, get state() { return state; }, get selected() { return selected; } });
}

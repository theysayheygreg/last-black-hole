import { createBenchContractRegistry } from './contract-registry.js';
import { createBenchInspectorViewModel } from './inspector.js';
import { projectBenchIdentities, resolveBenchWorldBounds } from './identity-projection.js';
import { pickBenchIdentity, selectBenchIdentityGroup } from './picking.js';

const registry = createBenchContractRegistry();

function style(element, rules) {
  Object.assign(element.style, rules);
  return element;
}

function button(label, action) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  style(element, {
    border: '1px solid rgba(0,226,255,.38)', background: 'rgba(3,14,25,.94)',
    color: '#d9f8ff', padding: '7px 9px', font: '11px var(--lbh-font-ui)',
    cursor: 'pointer', textAlign: 'left',
  });
  element.addEventListener('click', () => void action(element));
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

  async function showSelection(identity, grouped = []) {
    selected = identity;
    selection.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = identity?.displayLabel || identity?.archetype || 'Nothing selected';
    heading.style.cssText = 'font:600 18px var(--lbh-font-display);margin:0 0 4px;text-transform:uppercase';
    selection.appendChild(heading);
    if (!identity) return;
    const view = await createBenchInspectorViewModel(registry, {
      family: identity.family,
      type: identity.archetype || identity.family,
    });
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
    state = next || await simClient.getBench();
    status.textContent = `seed ${state.gallery.seed} · ${state.gallery.activeBayId} · `
      + `${state.patch.liveApplied.length} live / ${state.patch.bankedRestart.length} restart-banked`;
    toolbar.querySelectorAll('[data-bay]').forEach((entry) => entry.remove());
    for (const bay of state.gallery.bays) {
      const bayButton = button(bay.label, async () => {
        const response = await simClient.activateBenchBay(bay.id);
        selected = null;
        await refresh(response);
      });
      bayButton.dataset.bay = bay.id;
      if (bay.active) bayButton.style.borderColor = '#38f58a';
      toolbar.appendChild(bayButton);
    }
    const active = state.gallery.bays.find((bay) => bay.active);
    exhibitList.replaceChildren();
    for (const exhibit of active?.exhibits || []) {
      const identity = identityFromExhibit(exhibit);
      exhibitList.appendChild(button(identity.displayLabel, () => showSelection(identity)));
    }
    if (!selected && active?.exhibits?.[0]) await showSelection(identityFromExhibit(active.exhibits[0]));
  }

  toolbar.append(
    button('Replay Same Setup', async () => {
      const response = await simClient.replayBenchSameSetup(getSnapshot?.() || {});
      status.textContent = `same-setup truth normalized · ${Object.keys(response.truth || {}).length} roots`;
    }),
    button('Undo Last Change', async () => {
      const response = await simClient.undoBench();
      await refresh({ ...state, patch: response.patch, canUndo: false });
    }),
    button('Revert All', async () => {
      const response = await simClient.resetBench();
      await refresh({ ...state, patch: response.patch });
    }),
    button('Export Patch', async (control) => {
      await navigator.clipboard.writeText(JSON.stringify(patchFromState(), null, 2));
      control.textContent = 'Patch Copied';
      setTimeout(() => { control.textContent = 'Export Patch'; }, 900);
    }),
    button('Import Patch', async () => {
      const source = window.prompt('Paste a Bench tuning patch JSON');
      if (!source) return;
      const response = await simClient.importBenchPatch(JSON.parse(source));
      await refresh({ ...state, patch: response.patch });
    }),
  );

  overlayCanvas?.addEventListener('pointerdown', (event) => {
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
    void showSelection(hit, selectBenchIdentityGroup(identities, hit));
  }, true);

  await refresh();
  return Object.freeze({ root, get state() { return state; }, get selected() { return selected; } });
}

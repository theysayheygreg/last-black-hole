function style(element, rules) {
  Object.assign(element.style, rules);
  return element;
}

export function formatBenchUiError(error) {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown Bench error');
  return (message.replace(/\s+/g, ' ').trim() || 'Unknown Bench error').slice(0, 160);
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
    cursor: 'pointer', textAlign: 'left', borderRadius: '2px',
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

function entityPosition(entity) {
  const x = Number(entity?.position?.x ?? entity?.wx);
  const y = Number(entity?.position?.y ?? entity?.wy);
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

function entityArchetype(entity) {
  return String(entity?.archetype || entity?.type || entity?.family || 'unknown');
}

function entityGroupKey(entity) {
  return `${entity?.adapterId || entity?.family || 'unknown'}:${entityArchetype(entity)}`;
}

function humanize(value) {
  return String(value || 'unknown').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function svgNode(name, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function rulerFacts(entity) {
  const facts = entity?.rulerFacts;
  if (!facts) return [];
  if (Array.isArray(facts)) {
    return facts.map((fact, index) => ({
      label: fact.label || fact.id || `ruler ${index + 1}`,
      radius: Number(fact.radius ?? fact.value),
    })).filter((fact) => Number.isFinite(fact.radius) && fact.radius > 0);
  }
  return Object.entries(facts).map(([label, raw]) => ({
    label,
    radius: Number(typeof raw === 'object' ? raw.radius ?? raw.value : raw),
  })).filter((fact) => Number.isFinite(fact.radius) && fact.radius > 0);
}

function scenarioState(entity) {
  return String(entity?.scenarioState || entity?.state || 'idle').trim().toLowerCase() || 'idle';
}

function scenarioStateLabel(entity) {
  return String(entity?.scenarioStateLabel || humanize(scenarioState(entity)));
}

function scenarioActions(adapter, entity) {
  const advertised = entity?.scenarioActions || entity?.actions || adapter?.scenarioActions || adapter?.actions || [];
  return advertised.map((action) => {
    if (typeof action === 'string') return { id: action, label: humanize(action) };
    return {
      id: String(action?.id || action?.actionId || ''),
      label: action?.label || humanize(action?.id || action?.actionId),
      effect: action?.effect || action?.description || '',
    };
  }).filter((action) => action.id);
}

function scenarioTargetPosition(entity) {
  const target = entity?.targetPosition || entity?.scenarioTarget || entity?.target;
  if (!target || typeof target !== 'object') return null;
  const x = Number(target.x ?? target.wx);
  const y = Number(target.y ?? target.wy);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function scavengerColor(state) {
  if (state.includes('chase')) return '#ff5f56';
  if (state.includes('detect') || state.includes('alert')) return '#ffb938';
  if (state.includes('attack')) return '#ff2d78';
  if (state.includes('die') || state.includes('dead')) return '#77637f';
  return '#12a594';
}

function adapterForEntity(state, entity) {
  if (!entity) return null;
  const adapters = Array.isArray(state?.adapters) ? state.adapters : [];
  if (entity.adapterId) return adapters.find((entry) => entry.id === entity.adapterId) || null;
  return adapters.find((entry) => entry.id === entity.family) || null;
}

function currentPropertyValue(state, adapter, property) {
  const edited = state?.patch?.edits?.find((entry) =>
    entry.adapterId === adapter.id && entry.propertyId === property.id);
  if (edited) return edited.value;
  const described = property.currentValue ?? property.value ?? adapter?.currentValues?.[property.id];
  return Number.isFinite(Number(described)) ? Number(described) : property.min;
}

function isBenchState(candidate) {
  return Boolean(candidate?.gallery && candidate?.world && Array.isArray(candidate?.world?.entities)
    && Array.isArray(candidate?.gallery?.bays) && Array.isArray(candidate?.adapters)
    && Array.isArray(candidate?.patch?.edits));
}

export async function initBenchUi({ simClient }) {
  if (!simClient?.enabled) throw new Error('Bench requires a configured local sim authority');

  const root = style(document.createElement('section'), {
    position: 'fixed', inset: '0', zIndex: '9000', pointerEvents: 'none', overflow: 'hidden',
    color: '#d9f8ff', font: '12px var(--lbh-font-ui)', background: 'rgba(0,3,10,.72)',
  });
  root.id = 'bench-ui';
  root.dataset.mode = 'authority-gallery';

  const toolbar = style(document.createElement('header'), {
    position: 'absolute', top: '10px', left: '10px', right: '374px', minHeight: '44px',
    display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 9px', flexWrap: 'wrap',
    background: 'rgba(0,4,14,.96)', border: '1px solid rgba(0,226,255,.35)', pointerEvents: 'auto',
  });
  const title = document.createElement('strong');
  title.textContent = 'THE BENCH · AUTHORITY GALLERY';
  title.style.marginRight = '8px';
  toolbar.appendChild(title);

  const stage = style(document.createElement('main'), {
    position: 'absolute', top: '76px', left: '10px', right: '374px', bottom: '10px',
    background: 'radial-gradient(circle at 50% 48%, rgba(13,49,69,.55), rgba(0,5,14,.96) 62%)',
    border: '1px solid rgba(0,226,255,.28)', pointerEvents: 'auto', overflow: 'hidden',
  });
  const stageCaption = style(document.createElement('div'), {
    position: 'absolute', top: '12px', left: '14px', zIndex: '2', color: '#79dce8',
    letterSpacing: '.12em', font: '11px var(--lbh-font-ui)', pointerEvents: 'none',
  });
  const surface = svgNode('svg', { width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet' });
  surface.style.cssText = 'display:block;width:100%;height:100%';
  stage.append(stageCaption, surface);

  const inspector = style(document.createElement('aside'), {
    position: 'absolute', top: '10px', right: '10px', bottom: '10px', width: '350px',
    overflow: 'auto', padding: '14px', background: 'rgba(0,4,14,.98)',
    border: '1px solid rgba(0,226,255,.35)', pointerEvents: 'auto',
  });
  const status = document.createElement('div');
  status.style.cssText = 'color:#80b8c4;margin:0 0 14px;line-height:1.45';
  const selection = document.createElement('div');
  inspector.append(status, selection);
  root.append(toolbar, stage, inspector);
  document.body.appendChild(root);

  let state = null;
  let selectedId = null;
  let actionState = reduceBenchUiActionState(null, { type: 'success', value: null });

  function renderStatus() {
    if (actionState.error) {
      status.textContent = `BENCH ERROR · ${actionState.error}`;
      status.style.color = '#ff7b72';
      return;
    }
    status.style.color = '#80b8c4';
    if (!state) {
      status.textContent = 'Connecting to Bench authority…';
      return;
    }
    status.textContent = `seed ${state.gallery.seed} · ${state.gallery.activeBayId} · `
      + `${state.patch.liveApplied?.length || 0} live / ${state.patch.bankedRestart?.length || 0} restart-banked`;
  }

  function reportOutcome(action) {
    actionState = reduceBenchUiActionState(actionState, action.type === 'success'
      ? { ...action, value: state }
      : action);
    renderStatus();
  }

  async function refresh(response = null) {
    let candidate = response;
    if (!isBenchState(candidate)) candidate = await simClient.getBench();
    if (!isBenchState(candidate)) throw new Error('Bench authority returned an invalid Gallery state');
    state = candidate;
    const activeEntities = state.world.entities.filter((entity) => entity.bayId === state.gallery.activeBayId);
    if (!activeEntities.some((entity) => entity.id === selectedId)) selectedId = activeEntities[0]?.id || null;
    render();
  }

  async function mutate(request) {
    const response = await request();
    await refresh(response);
  }

  function renderToolbar() {
    toolbar.querySelectorAll('[data-dynamic]').forEach((element) => element.remove());
    for (const bay of state.gallery.bays) {
      const control = button(bay.label, async () => {
        selectedId = null;
        await mutate(() => simClient.activateBenchBay(bay.id));
      }, reportOutcome);
      control.dataset.dynamic = 'bay';
      control.style.borderColor = bay.id === state.gallery.activeBayId ? '#38f58a' : 'rgba(0,226,255,.38)';
      toolbar.appendChild(control);
    }
    const actions = [
      ['Replay Same Setup', () => mutate(() => simClient.replayBenchSameSetup())],
      ['Undo Last Change', () => mutate(() => simClient.undoBench())],
      ['Revert All', () => mutate(() => simClient.resetBench())],
      ['Export Patch', async () => navigator.clipboard.writeText(JSON.stringify(state.patch, null, 2))],
      ['Import Patch', async () => {
        const source = window.prompt('Paste a Bench tuning patch JSON');
        if (!source) return;
        await mutate(() => simClient.importBenchPatch(JSON.parse(source)));
      }],
    ];
    for (const [label, action] of actions) {
      const control = button(label, action, reportOutcome);
      control.dataset.dynamic = 'action';
      toolbar.appendChild(control);
    }
  }

  function renderStage() {
    surface.replaceChildren();
    const entities = state.world.entities.filter((entity) => entity.bayId === state.gallery.activeBayId);
    stageCaption.textContent = `${humanize(state.gallery.activeBayId)} · ${entities.length} authority entities`;
    const positions = entities.map(entityPosition);
    const rulerRadii = entities.flatMap((entity) => rulerFacts(entity).map((fact) => fact.radius));
    const maxRuler = Math.max(0, ...rulerRadii);
    const minX = Math.min(...positions.map((point) => point.x), 0) - Math.max(100, maxRuler);
    const maxX = Math.max(...positions.map((point) => point.x), 600) + Math.max(100, maxRuler);
    const minY = Math.min(...positions.map((point) => point.y), 0) - Math.max(100, maxRuler);
    const maxY = Math.max(...positions.map((point) => point.y), 600) + Math.max(100, maxRuler);
    surface.setAttribute('viewBox', `${minX} ${minY} ${Math.max(1, maxX - minX)} ${Math.max(1, maxY - minY)}`);

    const selected = entities.find((entity) => entity.id === selectedId);
    const selectedGroup = selected ? entityGroupKey(selected) : null;
    for (const entity of entities) {
      const position = entityPosition(entity);
      const entityState = scenarioState(entity);
      const sameType = selectedGroup && entityGroupKey(entity) === selectedGroup;
      const isSelected = entity.id === selectedId;
      const group = svgNode('g', { transform: `translate(${position.x} ${position.y})`, role: 'button', tabindex: '0' });
      group.style.cursor = 'pointer';
      for (const fact of rulerFacts(entity)) {
        group.appendChild(svgNode('circle', {
          cx: 0, cy: 0, r: fact.radius, fill: 'none',
          stroke: sameType ? '#f4d35e' : '#177a8e', 'stroke-width': sameType ? 3 : 2,
          'stroke-dasharray': '12 8', opacity: sameType ? .8 : .45,
        }));
      }
      const target = scenarioTargetPosition(entity);
      if (target) {
        group.appendChild(svgNode('line', {
          x1: 0, y1: 0, x2: target.x - position.x, y2: target.y - position.y,
          stroke: entityState.includes('chase') ? '#ff5f56' : '#ffb938',
          'stroke-width': isSelected ? 5 : 3, 'stroke-dasharray': '10 7', opacity: sameType ? .9 : .5,
        }));
        group.appendChild(svgNode('circle', {
          cx: target.x - position.x, cy: target.y - position.y, r: 10,
          fill: 'none', stroke: '#ffb938', 'stroke-width': 3,
        }));
      }
      const radius = Math.max(16, Math.min(42, Number(entity.radius) || 22));
      group.appendChild(svgNode('circle', {
        cx: 0, cy: 0, r: radius + (isSelected ? 12 : sameType ? 7 : 0), fill: 'none',
        stroke: isSelected ? '#ffffff' : sameType ? '#f4d35e' : '#1d7084',
        'stroke-width': isSelected ? 5 : 3, opacity: sameType ? 1 : .7,
      }));
      group.appendChild(svgNode('circle', {
        cx: 0, cy: 0, r: radius,
        fill: entity.family === 'wells' || entity.family === 'well'
          ? '#8b5cf6'
          : entity.family === 'scavengers' || entity.family === 'scavenger'
            ? scavengerColor(entityState)
            : '#087f95',
        stroke: '#9ff6ff', 'stroke-width': 3,
      }));
      if (entity.family === 'scavengers' || entity.family === 'scavenger') {
        const nose = radius + Math.max(10, Math.min(28, Math.hypot(Number(entity.vx) || 0, Number(entity.vy) || 0) * 14));
        const angle = Number(entity.heading ?? entity.angle) || Math.atan2(Number(entity.vy) || 0, Number(entity.vx) || 1);
        group.appendChild(svgNode('line', {
          x1: 0, y1: 0, x2: Math.cos(angle) * nose, y2: Math.sin(angle) * nose,
          stroke: '#ecfeff', 'stroke-width': 4, 'stroke-linecap': 'round',
        }));
      }
      const label = svgNode('text', {
        x: 0, y: radius + 30, fill: isSelected ? '#ffffff' : '#b7e9ef',
        'font-size': 20, 'text-anchor': 'middle', 'font-family': 'var(--lbh-font-ui)',
      });
      label.textContent = entity.name || humanize(entity.archetype || entity.family);
      group.appendChild(label);
      if (entity.family === 'scavengers' || entity.family === 'scavenger') {
        const stateLabel = svgNode('text', {
          x: 0, y: radius + 51, fill: scavengerColor(entityState),
          'font-size': 15, 'font-weight': 700, 'text-anchor': 'middle',
          'font-family': 'var(--lbh-font-mono)',
        });
        stateLabel.textContent = scenarioStateLabel(entity).toUpperCase();
        group.appendChild(stateLabel);
      }
      group.addEventListener('click', () => {
        selectedId = entity.id;
        renderStage();
        renderInspector();
      });
      surface.appendChild(group);
    }
  }

  function metadataLine(property) {
    return `${property.group} · ${property.unit} · ${property.min}–${property.max} step ${property.step}`
      + ` · ${String(property.scope).toUpperCase()} · ${String(property.applies).replace('-', ' ').toUpperCase()}`;
  }

  function renderInspector() {
    selection.replaceChildren();
    const entities = state.world.entities.filter((entity) => entity.bayId === state.gallery.activeBayId);
    const entity = entities.find((entry) => entry.id === selectedId);
    const heading = document.createElement('h2');
    heading.textContent = entity?.name || humanize(entity?.archetype || entity?.family || 'Nothing selected');
    heading.style.cssText = 'font:600 18px var(--lbh-font-display);margin:0 0 4px;text-transform:uppercase';
    selection.appendChild(heading);
    if (!entity) return;

    const grouped = entities.filter((entry) => entityGroupKey(entry) === entityGroupKey(entity));
    const context = document.createElement('div');
    context.textContent = `${humanize(entity.family)} · ${grouped.length} selected-type instance${grouped.length === 1 ? '' : 's'}`;
    context.style.cssText = 'color:#7bdceb;margin:0 0 12px';
    selection.appendChild(context);

    const adapter = adapterForEntity(state, entity);
    if (!adapter) {
      const unsupported = document.createElement('div');
      unsupported.textContent = 'NO TUNABLE CONTRACT YET';
      unsupported.style.cssText = 'color:#ffb938;border:1px solid rgba(255,185,56,.45);padding:9px;margin-top:8px';
      selection.appendChild(unsupported);
      return;
    }

    const adapterTitle = document.createElement('h3');
    adapterTitle.textContent = adapter.label;
    adapterTitle.style.cssText = 'margin:12px 0 8px;color:#f1fbff';
    selection.appendChild(adapterTitle);

    const actions = scenarioActions(adapter, entity);
    if (actions.length) {
      const scenario = style(document.createElement('section'), {
        padding: '10px', margin: '0 0 12px', background: 'rgba(42,26,12,.72)',
        border: '1px solid rgba(255,185,56,.34)',
      });
      const scenarioTitle = document.createElement('strong');
      scenarioTitle.textContent = `SCENARIO · ${scenarioStateLabel(entity).toUpperCase()}`;
      const scenarioHint = document.createElement('div');
      scenarioHint.textContent = 'Observe this authority-owned type in a named behavior state.';
      scenarioHint.style.cssText = 'color:#d9bd86;line-height:1.4;margin:4px 0 8px';
      const controls = style(document.createElement('div'), { display: 'flex', flexWrap: 'wrap', gap: '6px' });
      for (const action of actions) {
        const control = button(action.label, async () => {
          await mutate(() => simClient.runBenchAction({
            entityId: entity.id,
            adapterId: adapter.id,
            actionId: action.id,
          }));
        }, reportOutcome);
        control.title = action.effect;
        controls.appendChild(control);
      }
      scenario.append(scenarioTitle, scenarioHint, controls);
      selection.appendChild(scenario);
    }

    for (const property of adapter.properties || []) {
      const row = style(document.createElement('section'), {
        padding: '10px', margin: '0 0 9px', background: 'rgba(10,31,44,.72)',
        border: '1px solid rgba(83,183,203,.25)',
      });
      const label = document.createElement('strong');
      label.textContent = property.label;
      const effect = document.createElement('div');
      effect.textContent = property.effect;
      effect.style.cssText = 'color:#b4ced4;line-height:1.4;margin:4px 0 7px';
      const meta = document.createElement('div');
      meta.textContent = metadataLine(property);
      meta.style.cssText = 'color:#65a6b4;font:10px var(--lbh-font-mono);line-height:1.4;margin-bottom:7px';
      const resetNote = document.createElement('div');
      resetNote.textContent = `DRAW ${String(property.drawKind).toUpperCase()} · RESET ${property.reset}`;
      resetNote.style.cssText = 'color:#7c98a0;font:10px var(--lbh-font-mono);margin-bottom:7px';
      const controls = style(document.createElement('div'), { display: 'grid', gridTemplateColumns: '1fr 74px auto', gap: '6px' });
      const value = currentPropertyValue(state, adapter, property);
      const range = document.createElement('input');
      range.type = 'range';
      range.min = property.min;
      range.max = property.max;
      range.step = property.step;
      range.value = value;
      const numeric = document.createElement('input');
      numeric.type = 'number';
      numeric.min = property.min;
      numeric.max = property.max;
      numeric.step = property.step;
      numeric.value = value;
      numeric.style.cssText = 'width:68px;background:#05131c;color:#e8fbff;border:1px solid #23677a;padding:4px';
      range.addEventListener('input', () => { numeric.value = range.value; });
      numeric.addEventListener('input', () => { range.value = numeric.value; });
      const apply = button('Apply', async () => {
        await mutate(() => simClient.editBench({
          adapterId: adapter.id,
          propertyId: property.id,
          value: Number(numeric.value),
        }));
      }, reportOutcome);
      controls.append(range, numeric, apply);
      const reset = button('Reset Property', async () => {
        await mutate(() => simClient.resetBench({ adapterId: adapter.id, propertyId: property.id }));
      }, reportOutcome);
      reset.style.marginTop = '7px';
      row.append(label, effect, meta, resetNote, controls, reset);
      selection.appendChild(row);
    }

    selection.appendChild(button('Reset This Type', async () => {
      await mutate(() => simClient.resetBench({ adapterId: adapter.id }));
    }, reportOutcome));
  }

  function render() {
    renderStatus();
    renderToolbar();
    renderStage();
    renderInspector();
  }

  await runBenchUiAction(() => refresh(), reportOutcome);
  return Object.freeze({
    root,
    get state() { return state; },
    get selected() { return state?.world?.entities?.find((entity) => entity.id === selectedId) || null; },
  });
}

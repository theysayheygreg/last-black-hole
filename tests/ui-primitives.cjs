/**
 * Canvas UI primitive smoke checks.
 *
 * These guard the shared canvas UI vocabulary without judging final art taste.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

class TestRunner {
  constructor(suiteName) {
    this.suite = suiteName;
    this.results = [];
  }
  async run(name, fn) {
    try {
      await fn();
      this.results.push({ name, passed: true });
      console.log(`  PASS: ${name}`);
    } catch (err) {
      this.results.push({ name, passed: false, error: err.message });
      console.log(`  FAIL: ${name}`);
      console.log(`        ${err.message}`);
    }
  }
  summary() {
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    console.log(`\n${this.suite}: ${passed} passed, ${failed} failed`);
    return failed === 0;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function createRecordingContext() {
  const calls = [];
  const ctx = {
    calls,
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    strokeRect: (...args) => calls.push(['strokeRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
    beginPath: () => calls.push(['beginPath']),
    arc: (...args) => calls.push(['arc', ...args]),
    arcTo: (...args) => calls.push(['arcTo', ...args]),
    closePath: () => calls.push(['closePath']),
    rect: (...args) => calls.push(['rect', ...args]),
    moveTo: (...args) => calls.push(['moveTo', ...args]),
    lineTo: (...args) => calls.push(['lineTo', ...args]),
    stroke: () => calls.push(['stroke']),
    fillText: (...args) => calls.push(['fillText', ...args]),
    measureText: (text) => ({ width: String(text).length * 8 }),
    set fillStyle(value) { calls.push(['fillStyle', value]); },
    set strokeStyle(value) { calls.push(['strokeStyle', value]); },
    set lineWidth(value) { calls.push(['lineWidth', value]); },
    set globalAlpha(value) { calls.push(['globalAlpha', value]); },
    set shadowColor(value) { calls.push(['shadowColor', value]); },
    set shadowBlur(value) { calls.push(['shadowBlur', value]); },
    set shadowOffsetX(value) { calls.push(['shadowOffsetX', value]); },
    set shadowOffsetY(value) { calls.push(['shadowOffsetY', value]); },
    set font(value) { calls.push(['font', value]); this._font = value; },
    get font() { return this._font || '12px monospace'; },
    set textAlign(value) { calls.push(['textAlign', value]); },
    set textBaseline(value) { calls.push(['textBaseline', value]); },
  };
  return ctx;
}

async function run() {
  console.log('\n=== UI PRIMITIVE TESTS ===\n');
  const runner = new TestRunner('UIPrimitives');
  const sourcePath = path.join(ROOT, 'src', 'ui', 'canvas-primitives.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const mod = await import(pathToFileURL(sourcePath).href);
  const prompts = await import(pathToFileURL(path.join(ROOT, 'src', 'ui', 'input-prompts.js')).href);

  await runner.run('Primitive module stays UI-only and stateless', async () => {
    assert(source.includes("from './design-tokens.js'"), 'Expected token import');
    assert(source.includes("from './typography.js'"), 'Expected typography import');
    assert(source.includes("from './asset-kit.js'"), 'Expected generated frame asset integration');
    for (const forbidden of ['../main.js', '../config.js', '../ship.js', '../fluid.js', 'window.', 'document.']) {
      assert(!source.includes(forbidden), `Primitive kit should not depend on ${forbidden}`);
    }
  });

  await runner.run('Role colors and alpha handling are centralized', async () => {
    assert(mod.withAlpha('#fff', 0.5) === 'rgba(255, 255, 255, 0.500)', 'Short hex alpha failed');
    assert(mod.withAlpha('#00e2ff', 0.25) === 'rgba(0, 226, 255, 0.250)', 'Hex alpha failed');
    assert(mod.withAlpha('rgba(1, 2, 3, 0.9)', 0.1) === 'rgba(1, 2, 3, 0.100)', 'RGBA alpha failed');
    assert(mod.roleColor('danger', 0.5).includes('255, 51, 54'), 'Danger role should map to shared red');
    assert(mod.roleColor('salvage', 0.5).includes('255, 185, 56'), 'Salvage role should map to shared amber');
  });

  await runner.run('Text fitting truncates instead of overflowing', async () => {
    const ctx = createRecordingContext();
    const fitted = mod.fitUiText(ctx, 'a very long artifact name', 72);
    assert(fitted.endsWith('...'), `Expected ellipsis suffix, got ${fitted}`);
    assert(ctx.measureText(fitted).width <= 72, `Fitted text still too wide: ${fitted}`);
    assert(mod.fitUiText(ctx, 'short', 72) === 'short', 'Short text should remain unchanged');
    assert(mod.fitUiText(ctx, 'narrow', 24) === '...', 'Narrow text should fall back to suffix only');
  });

  await runner.run('Core primitives draw against a minimal canvas context', async () => {
    const ctx = createRecordingContext();
    mod.drawUiPanel(ctx, { x: 10, y: 12, w: 180, h: 90 }, { title: 'status', role: 'flow' });
    mod.drawSelectedRow(ctx, { x: 12, y: 40, w: 120, h: 22 }, { role: 'danger' });
    mod.drawCommandButton(ctx, { x: 20, y: 70, w: 150, h: 34 }, 'continue', {
      action: { actionId: 'confirm', inputFamily: 'keyboard', glyphKind: 'keycap', fallbackLabel: 'Space' },
    });
    mod.drawSegmentedGauge(ctx, { x: 20, y: 120, w: 160, h: 8 }, { value: 6, max: 10, segments: 10 });
    mod.drawWarningStrip(ctx, { x: 20, y: 140, w: 220, h: 46 }, { title: 'collapse', body: 'the exits are closing' });
    mod.drawStatusPill(ctx, { x: 160, y: 210, w: 90, h: 20 }, '10x10');
    mod.drawSectionLabel(ctx, 'summary', 20, 245);
    mod.drawKeyValueRow(ctx, 'earned', '240 EM', 20, 270);

    assert(ctx.calls.some((call) => call[0] === 'fillRect'), 'Expected fillRect calls');
    assert(ctx.calls.some((call) => call[0] === 'strokeRect'), 'Expected strokeRect calls');
    assert(ctx.calls.some((call) => call[0] === 'fillText'), 'Expected fillText calls');
    assert(ctx.calls.some((call) => call[0] === 'shadowOffsetY' && call[1] > 0), 'Expected soft offset text shadow');
    assert(ctx.calls.some((call) => call[0] === 'font' && String(call[1]).includes('Monaspace')),
      'Expected shared canvas font usage');
  });

  await runner.run('Command buttons separate action labels from input prompts', async () => {
    const ctx = createRecordingContext();
    mod.drawCommandButton(ctx, { x: 20, y: 70, w: 150, h: 34 }, 'continue', {
      action: { actionId: 'confirm', inputFamily: 'keyboard', glyphKind: 'keycap', fallbackLabel: 'Space' },
    });
    const labels = ctx.calls.filter((call) => call[0] === 'fillText');
    const action = labels.find((call) => call[1] === 'CONTINUE');
    assert(action, 'Expected clean button action label');
    assert(ctx.calls.some((call) => call[0] === 'arcTo' || (call[0] === 'rect' && call[3] >= 24)), 'Expected a drawn keycap glyph below the button');
    assert(!labels.some((call) => call[1] === 'SPACE CONTINUE'), 'Input prompt must be graphical, not plain fused text');
  });

  await runner.run('Action prompt primitive renders the resolved device glyph', async () => {
    const deckContext = createRecordingContext();
    const deckDescriptor = prompts.actionDescriptor('tabs', { deck: true });
    mod.drawActionPrompt(deckContext, { x: 20, y: 10, w: 150, h: 28 }, deckDescriptor, { verb: 'launch when ready' });
    const deckLabels = deckContext.calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);
    assert(deckLabels.includes('L1/R1'), 'Deck prompt must render the resolved controller glyph label');
    assert(deckLabels.includes('LAUNCH WHEN READY'), 'Deck prompt copy must remain separate from the glyph');
    assert(!deckLabels.includes('Q/E'), 'Deck prompt must not render the keyboard label');

    const keyboardContext = createRecordingContext();
    const keyboardDescriptor = prompts.actionDescriptor('tabs', { mode: 'keyboard' });
    mod.drawActionPrompt(keyboardContext, { x: 20, y: 10, w: 150, h: 28 }, keyboardDescriptor, { verb: 'launch when ready' });
    const keyboardLabels = keyboardContext.calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);
    assert(keyboardLabels.includes('Q/E'), 'Keyboard prompt must keep the shared descriptor label');
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error('UIPrimitives fatal error:', err.message);
  process.exit(1);
});

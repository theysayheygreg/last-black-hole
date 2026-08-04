/**
 * Typography static checks.
 *
 * These guard the self-hosted font contract. They do not decide whether the
 * art direction looks good; they catch missing assets and drift between DOM,
 * canvas, and ASCII-atlas font roles.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const tokenCss = fs.readFileSync(path.join(SRC, 'ui', 'design-tokens.css'), 'utf8');

class TestRunner {
  constructor(suiteName) {
    this.suite = suiteName;
    this.results = [];
  }
  run(name, fn) {
    try {
      fn();
      this.results.push({ name, passed: true });
      console.log(`  PASS: ${name}`);
    } catch (err) {
      this.results.push({ name, passed: false, error: err.message });
      console.log(`  FAIL: ${name}`);
      console.log(`        ${err.message}`);
    }
  }
  async runAsync(name, fn) {
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

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function parseAsciiRamps(src) {
  const match = src.match(/export const RAMPS = \[([\s\S]*?)\];/);
  assert(match, 'Could not find ASCII RAMPS export');
  const ramps = [];
  const re = /'((?:\\.|[^'\\])*)'/g;
  let rampMatch;
  while ((rampMatch = re.exec(match[1])) !== null) {
    ramps.push(new Function(`return '${rampMatch[1]}';`)());
  }
  return ramps;
}

const runner = new TestRunner('Typography');
const indexSrc = read('index-a.html');
const typographySrc = read('src/ui/typography.js');
const mainSrc = read('src/main.js');
const asciiSrc = read('src/render/shaders/ascii.glsl.js');
const asyncChecks = [];

const requiredFonts = [
  ['Oxanium', 'assets/fonts/oxanium/Oxanium-Variable.ttf'],
  ['Monaspace Neon', 'assets/fonts/monaspace/MonaspaceNeonVar.woff2'],
  ['Monaspace Argon', 'assets/fonts/monaspace/MonaspaceArgonVar.woff2'],
  ['Monaspace Krypton', 'assets/fonts/monaspace/MonaspaceKryptonVar.woff2'],
  ['Monaspace Xenon', 'assets/fonts/monaspace/MonaspaceXenonVar.woff2'],
  ['Monaspace Radon', 'assets/fonts/monaspace/MonaspaceRadonVar.woff2'],
  ['Noto Sans Mono', 'assets/fonts/noto/NotoSansMono-Variable.ttf'],
  ['Noto Sans Symbols', 'assets/fonts/noto/NotoSansSymbols-Variable.ttf'],
];

runner.run('Bundled font files exist for offline builds', () => {
  for (const [, rel] of requiredFonts) {
    const file = path.join(ROOT, rel);
    assert(fs.existsSync(file), `Missing bundled font: ${rel}`);
    assert(fs.statSync(file).size > 10_000, `Bundled font looks too small: ${rel}`);
  }
});

runner.run('Entrypoint declares self-hosted font faces and CSS roles', () => {
  for (const [family, rel] of requiredFonts) {
    assert(indexSrc.includes(`font-family: '${family}'`), `Missing @font-face for ${family}`);
    assert(indexSrc.includes(`url('./${rel}')`), `Missing ${family} source path ${rel}`);
  }
  assert(indexSrc.includes('src/ui/design-tokens.css'), 'Entrypoint must consume generated design tokens');
  assert(tokenCss.includes('--lbh-font-display'), 'Missing display font CSS variable');
  assert(tokenCss.includes('--lbh-font-ui'), 'Missing UI font CSS variable');
  assert(tokenCss.includes('--lbh-font-glyph'), 'Missing glyph font CSS variable');
});

runner.run('Typography module keeps display, UI, and glyph roles separate', () => {
  assert(typographySrc.includes('DISPLAY_FONT_STACK'), 'Missing display font stack');
  assert(typographySrc.includes('UI_FONT_STACK'), 'Missing UI font stack');
  assert(typographySrc.includes('GLYPH_FONT_STACK'), 'Missing glyph font stack');
  assert(typographySrc.includes('Oxanium'), 'Display stack must include Oxanium');
  assert(typographySrc.includes('Monaspace Neon'), 'UI/glyph stacks must include Monaspace Neon');
  assert(typographySrc.includes('Noto Sans Symbols'), 'Glyph stack must keep Noto Symbols fallback');
});

runner.run('Boot waits for webfonts before generating canvas font atlases', () => {
  assert(mainSrc.includes('waitForTypographyFonts'), 'main.js must wait for typography fonts before init');
  assert(mainSrc.indexOf('await waitForTypographyFonts') < mainSrc.indexOf('const ok = init()'),
    'font wait must happen before init() creates the ASCII atlas');
});

runner.run('ASCII atlas uses the shared glyph stack, not system monospace', () => {
  assert(asciiSrc.includes("import { canvasFont } from '../../ui/typography.js'"),
    'ASCII shader helper must import shared canvasFont');
  assert(asciiSrc.includes("canvasFont(Math.floor(cellSize * 0.85), { role: 'glyph' })"),
    'Font atlas must use glyph role');
  assert(!asciiSrc.includes('px monospace'), 'Font atlas should not hardcode system monospace');
});

runner.run('Glyph probe covers every non-ASCII glyph in the shader ramps', () => {
  const probeMatch = typographySrc.match(/GLYPH_PROBE_TEXT\s*=\s*'((?:\\.|[^'\\])*)'/);
  assert(probeMatch, 'Missing GLYPH_PROBE_TEXT');
  const probe = new Function(`return '${probeMatch[1]}';`)();
  const missing = new Set();
  for (const ramp of parseAsciiRamps(asciiSrc)) {
    for (const ch of [...ramp]) {
      if (ch.codePointAt(0) > 0x7f && !probe.includes(ch)) missing.add(ch);
    }
  }
  assert(missing.size === 0, `Glyph probe missing shader glyphs: ${[...missing].join(' ')}`);
});

asyncChecks.push(runner.runAsync('Typography module exports usable canvas font strings', async () => {
  const mod = await import(pathToFileURL(path.join(SRC, 'ui', 'typography.js')).href);
  assert(mod.canvasFont(14).includes('14px'), 'canvasFont should include requested size');
  assert(mod.canvasFont(24, { role: 'display', weight: '700' }).includes('Oxanium'),
    'display canvas font should include Oxanium');
  assert(mod.canvasFont(16, { role: 'glyph' }).includes('Noto Sans Symbols'),
    'glyph canvas font should include symbol fallback');
}));

(async () => {
  await Promise.all(asyncChecks);
  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
})();

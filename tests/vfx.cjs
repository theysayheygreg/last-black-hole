const path = require("path");
const { pathToFileURL } = require("url");
const { TestRunner, assert } = require("./helpers.cjs");

const ROOT = path.resolve(__dirname, "..");

async function importModule(rel) {
  return import(pathToFileURL(path.join(ROOT, rel)).href);
}

async function run() {
  const runner = new TestRunner("VFX");
  const THREE = await importModule("node_modules/three/build/three.module.js");
  const { VfxManager } = await importModule("src/render-three/vfx/vfx-manager.js");
  const { titleGlyphFaultEvent } = await importModule("src/render-three/vfx/vfx-events.js");

  await runner.run("Title glyph events validate and preserve renderer-neutral shape", async () => {
    const event = titleGlyphFaultEvent({
      glyph: "Ψ",
      cleanGlyph: "S",
      screenX: 640,
      screenY: 310,
      glyphWidth: 42,
      glyphHeight: 58,
      intensity: 0.8,
      seed: "unit",
    });
    assert(event.type === "titleGlyphFault", "Expected titleGlyphFault event type");
    assert(event.screenX === 640 && event.screenY === 310, "Expected screen-space coordinates");
    assert(!("mesh" in event) && !("material" in event), "VFX events must not contain Three implementation objects");
  });

  await runner.run("VfxManager spawns, expires, and recycles bounded particles", async () => {
    const screenGroup = new THREE.Group();
    const immediateGroup = new THREE.Group();
    const manager = new VfxManager({ screenGroup, immediateGroup, renderQuality: "rich" });
    const event = titleGlyphFaultEvent({
      eventId: "unit-title-fault",
      glyph: "Ψ",
      cleanGlyph: "S",
      screenX: 640,
      screenY: 310,
      glyphWidth: 42,
      glyphHeight: 58,
      intensity: 1,
      seed: "unit-title-fault",
    });

    const first = manager.update({
      dt: 1 / 60,
      totalTime: 1,
      viewportWidth: 1280,
      viewportHeight: 800,
      events: [event],
      config: { enabled: true, quality: "rich", particleBudget: 24, globalIntensity: 1, titleCorruption: true },
    });
    assert(first.emittedEvents === 1, "Expected the manager to consume one title fault event");
    assert(first.activeParticles > 0, "Expected active VFX particles");
    assert(first.activeParticles <= first.particleBudget, "Active particles must respect budget");

    for (let i = 0; i < 90; i++) {
      manager.update({
        dt: 1 / 30,
        totalTime: 1.1 + i / 30,
        viewportWidth: 1280,
        viewportHeight: 800,
        events: [],
        config: { enabled: true, quality: "rich", particleBudget: 24, globalIntensity: 1, titleCorruption: true },
      });
    }
    const idle = manager.getStats();
    assert(idle.activeParticles === 0, `Expected all title VFX particles to expire, got ${idle.activeParticles}`);
    assert(idle.poolCapacity > 0, "Expired particles should recycle into the pool");
  });

  await runner.run("Disabling VFX clears submitted particles", async () => {
    const screenGroup = new THREE.Group();
    const immediateGroup = new THREE.Group();
    const manager = new VfxManager({ screenGroup, immediateGroup, renderQuality: "rich" });
    const event = titleGlyphFaultEvent({
      eventId: "disabled-title-fault",
      glyph: "Ω",
      screenX: 600,
      screenY: 300,
      intensity: 1,
      seed: "disabled-title-fault",
    });
    manager.update({
      dt: 1 / 60,
      totalTime: 1,
      viewportWidth: 1280,
      viewportHeight: 800,
      events: [event],
      config: { enabled: true, quality: "rich", particleBudget: 24, globalIntensity: 1, titleCorruption: true },
    });
    const disabled = manager.update({
      dt: 1 / 60,
      totalTime: 1.1,
      viewportWidth: 1280,
      viewportHeight: 800,
      events: [],
      config: { enabled: false, quality: "rich", particleBudget: 24, globalIntensity: 1, titleCorruption: true },
    });
    assert(disabled.enabled === false, "Expected disabled stat");
    assert(disabled.activeParticles === 0, "Disabled VFX must submit zero particles");
  });

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error("VFX test fatal error:", err);
  process.exit(1);
});

const path = require("path");
const { pathToFileURL } = require("url");
const { TestRunner, assert } = require("./helpers.cjs");

const ROOT = path.join(__dirname, "..");

async function run() {
  const runner = new TestRunner("TextCorruption");
  const mod = await import(pathToFileURL(path.join(ROOT, "src", "text-corruption.js")).href);

  await runner.run("Zero intensity returns clean text", async () => {
    const text = "THE VESSEL";
    assert(mod.corruptText(text, 0, "seed") === text, "Expected zero-intensity text to remain clean");
  });

  await runner.run("Existing combining marks are stripped before corruption", async () => {
    const marked = "vessel\u0301\u0338";
    assert(mod.stripCombiningMarks(marked) === "vessel", "Expected combining marks to be stripped");
    const clean = mod.corruptText(marked, 0, "seed");
    assert(clean === "vessel", `Expected clean vessel text, got ${clean}`);
  });

  await runner.run("Corruption is deterministic for the same seed", async () => {
    const a = mod.corruptText("something is watching", 0.8, "same-seed", { maxMarks: 3 });
    const b = mod.corruptText("something is watching", 0.8, "same-seed", { maxMarks: 3 });
    const c = mod.corruptText("something is watching", 0.8, "other-seed", { maxMarks: 3 });
    assert(a === b, "Expected same seed to produce same corrupted text");
    assert(a !== c, "Expected different seed to change corrupted text");
  });

  await runner.run("Corruption preserves readable base text", async () => {
    const source = "cargo 12 drained";
    const corrupted = mod.corruptText(source, 1, "seed", { maxMarks: 2 });
    assert(mod.stripCombiningMarks(corrupted) === source, "Expected stripped text to match original source");
  });

  await runner.run("Per-character mark cap bounds output length", async () => {
    const source = "abcdef";
    const maxMarks = 2;
    const corrupted = mod.corruptText(source, 1, "seed", { density: 1, maxMarks });
    assert(corrupted.length <= source.length * (maxMarks + 1),
      `Expected bounded length, got ${corrupted.length}`);
  });

  await runner.run("Glyph corruption preserves clean length", async () => {
    const source = "LAST SINGULARITY";
    assert(mod.corruptGlyphText(source, 0, "seed") === source, "Expected zero-intensity glyph text to remain clean");
    const corrupted = mod.corruptGlyphText(source, 1, "seed", { density: 1, time: 0.25 });
    assert(Array.from(corrupted).length === Array.from(source).length,
      `Expected slot-preserving corruption, got ${corrupted}`);
  });

  await runner.run("Glyph corruption is deterministic per animation frame", async () => {
    const source = "LAST SINGULARITY";
    const options = { density: 1, frequencyHz: 12, time: 0.25 };
    const a = mod.corruptGlyphText(source, 0.85, "same-seed", options);
    const b = mod.corruptGlyphText(source, 0.85, "same-seed", options);
    const c = mod.corruptGlyphText(source, 0.85, "same-seed", { ...options, time: 0.35 });
    assert(a === b, "Expected same seed/time to produce the same glyph corruption");
    assert(a !== c, "Expected a later animation frame to flicker different glyphs");
  });

  await runner.run("Glyph corruption intensity increases affected slots over time", async () => {
    const source = "LAST SINGULARITY";
    const changedSlots = (intensity) => {
      let changes = 0;
      for (let i = 0; i < 10; i++) {
        const corrupted = mod.corruptGlyphText(source, intensity, "intensity-seed", {
          density: 1,
          frequencyHz: 18,
          time: i / 10,
        });
        const cleanGlyphs = Array.from(source);
        const faultGlyphs = Array.from(corrupted);
        for (let j = 0; j < cleanGlyphs.length; j++) {
          if (cleanGlyphs[j] !== faultGlyphs[j]) changes++;
        }
      }
      return changes;
    };

    const low = changedSlots(0.16);
    const high = changedSlots(0.9);
    assert(high > low, `Expected stronger corruption to affect more glyph slots over time, got low=${low} high=${high}`);
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("TextCorruption test fatal error:", err.stack || err.message);
  process.exit(1);
});

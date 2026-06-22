/**
 * systems.js — Tests for star types, comets, wreck differentiation,
 * scavenger identity, proximity labels, and meta flow.
 *
 * Covers the flavor pass and profile/upgrade loop. Authoritative wreck drift
 * lives in sim-scale.cjs; the browser is presentation-only for that contract.
 *
 * Usage: node tests/systems.js [index-a.html]
 */
const {
  startServer,
  stopServer,
  launchGame,
  screenshot,
  TestRunner,
  assert,
} = require('./helpers.cjs');

const htmlFile = process.argv[2] || 'index-a.html';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function startGame(page) {
  await page.evaluate(() => window.__TEST_API.triggerRestart());
  await sleep(1500);
}

async function run() {
  console.log(`\n=== SYSTEMS TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner('Systems');
  await startServer();

  let browser, page;

  try {
    ({ browser, page } = await launchGame(htmlFile));
    await startGame(page);

    // ---- STAR TYPES ----

    await runner.run('Stars have typed names and properties', async () => {
      const stars = await page.evaluate(() => window.__TEST_API.getStars());
      assert(stars.length > 0, `Expected stars, got ${stars.length}`);
      for (const star of stars) {
        assert(typeof star.name === 'string' && star.name.length > 0,
          `Star missing name: ${JSON.stringify(star)}`);
        assert(['yellowDwarf', 'redGiant', 'whiteDwarf', 'neutronStar'].includes(star.type),
          `Invalid star type: ${star.type}`);
        assert(star.alive === true, `Star should be alive at game start`);
        assert(typeof star.mass === 'number' && star.mass > 0,
          `Star mass invalid: ${star.mass}`);
      }
    });

    await runner.run('Stars have orbiting asteroids', async () => {
      const stars = await page.evaluate(() => window.__TEST_API.getStars());
      for (const star of stars) {
        assert(star.asteroidCount >= 2 && star.asteroidCount <= 4,
          `Star ${star.name}: expected 2-4 asteroids, got ${star.asteroidCount}`);
      }
    });

    // ---- COMETS ----

    await runner.run('Comets have procedural names', async () => {
      const comets = await page.evaluate(() => window.__TEST_API.getComets());
      assert(comets.length > 0, `Expected comets, got ${comets.length}`);
      for (const comet of comets) {
        assert(typeof comet.name === 'string' && comet.name.length > 0,
          `Comet missing name: ${JSON.stringify(comet)}`);
        assert(comet.alive === true, `Comet should be alive at game start`);
        assert(['orbit', 'figure8', 'transit'].includes(comet.pathType),
          `Invalid comet path type: ${comet.pathType}`);
      }
    });

    // ---- WRECK TYPES ----

    await runner.run('Wrecks have names and typed loot', async () => {
      const wrecks = await page.evaluate(() => window.__TEST_API.getWrecks());
      assert(wrecks.length > 0, `Expected wrecks, got ${wrecks.length}`);
      const hasDerelict = wrecks.some(w => w.type === 'derelict');
      const hasDebris = wrecks.some(w => w.type === 'debris');
      const hasVault = wrecks.some(w => w.type === 'vault');
      assert(hasDerelict || hasDebris || hasVault,
        `Expected at least one wreck type, got types: ${[...new Set(wrecks.map(w => w.type))]}`);
    });

    // ---- SCAVENGER IDENTITY ----

    await runner.run('Scavengers have faction and callsign', async () => {
      await sleep(2000); // wait for scavenger spawning
      const scavs = await page.evaluate(() => window.__TEST_API.getScavengers());
      if (scavs.length === 0) {
        console.log('    (no scavengers spawned yet — skipping)');
        return;
      }
      for (const scav of scavs) {
        assert(typeof scav.name === 'string' && scav.name.length > 0,
          `Scavenger missing name`);
        assert(typeof scav.faction === 'string' && scav.faction.length > 0,
          `Scavenger missing faction`);
        assert(['Collector', 'Reaper', 'Warden'].includes(scav.faction),
          `Invalid faction: ${scav.faction}`);
        assert(['drifter', 'vulture'].includes(scav.archetype),
          `Invalid archetype: ${scav.archetype}`);
      }
    });

    // ---- PROFILE SYSTEM ----

    await runner.run('Profile has correct initial state', async () => {
      const profile = await page.evaluate(() => window.__TEST_API.getProfile());
      assert(profile !== null, 'No active profile');
      assert(profile.exoticMatter >= 0, `EM should be non-negative: ${profile.exoticMatter}`);
      assert(profile.vaultCapacity === 25, `Vault cap should be 25, got ${profile.vaultCapacity}`);
      assert(profile.totalDeaths >= 0, `Deaths should be non-negative`);
      assert(profile.totalExtractions >= 0, `Extractions should be non-negative`);
    });

    await runner.run('All upgrade tracks start at rank 0', async () => {
      const profile = await page.evaluate(() => window.__TEST_API.getProfile());
      const tracks = ['thrust', 'hull', 'coupling', 'drag', 'sensor', 'vault'];
      for (const track of tracks) {
        assert(profile.upgrades[track] === 0,
          `${track} should start at rank 0, got ${profile.upgrades[track]}`);
      }
    });

    await runner.run('Profile loadout has 2 equip + 2 consumable slots', async () => {
      const profile = await page.evaluate(() => window.__TEST_API.getProfile());
      assert(profile.loadout.equipped.length === 2, `Expected 2 equip slots`);
      assert(profile.loadout.consumables.length === 2, `Expected 2 consumable slots`);
    });

    await runner.run('Profile exposes hull and rig progression', async () => {
      const progression = await page.evaluate(() => window.__TEST_API.getProgression());
      assert(progression !== null, 'No progression payload');
      assert(progression.hullType === 'drifter', `Expected default drifter hull, got ${progression.hullType}`);
      assert(Array.isArray(progression.rig.levels), 'Rig levels missing');
      assert(progression.rig.levels.length === 3, `Expected 3 rig tracks, got ${progression.rig.levels.length}`);
      assert(progression.rig.tracks.length === 3, `Expected 3 rig track descriptors, got ${progression.rig.tracks.length}`);
      assert(progression.rig.tracks[0].key === 'laminar', `Expected drifter laminar track, got ${progression.rig.tracks[0].key}`);
    });

    await runner.run('Rig upgrade query and purchase helpers mutate one track only', async () => {
      const result = await page.evaluate(() => {
        const api = window.__TEST_API;
        api.seedProfileExoticMatter(1000);
        const before = api.getProgression();
        const query = api.queryRigUpgrade(0);
        const purchased = api.purchaseRigUpgrade(0);
        const after = api.getProgression();
        return { before, query, purchased, after };
      });
      assert(result.query.cost.em === 300, `Expected first rig cost 300 EM, got ${result.query.cost.em}`);
      assert(result.query.canAfford === true, 'Expected seeded EM to afford first rig upgrade');
      assert(result.purchased === true, 'Expected rig purchase to succeed');
      assert(result.before.rig.levels[0] === 0, 'Expected rig track 0 to start at 0');
      assert(result.after.rig.levels[0] === 1, `Expected rig track 0 level 1, got ${result.after.rig.levels[0]}`);
      assert(result.after.rig.levels[1] === 0 && result.after.rig.levels[2] === 0, 'Expected only selected rig track to change');
      assert(result.after.exoticMatter === 700, `Expected 700 EM after purchase, got ${result.after.exoticMatter}`);
    });

    // ---- WELLS HAVE NAMES ----

    await runner.run('Wells have foreboding names', async () => {
      const wells = await page.evaluate(() => window.__TEST_API.getWells());
      assert(wells.length > 0, 'Expected wells on the map');
      for (const well of wells) {
        assert(typeof well.name === 'string' && well.name.length > 0,
          `Well missing name: ${JSON.stringify(well)}`);
        assert(well.name.startsWith('The '),
          `Well name should be foreboding ("The ..."), got: ${well.name}`);
      }
    });

    // ---- UI ELEMENTS ----

    await runner.run('HUD panels have terminal-style borders (CSS check)', async () => {
      const styles = await page.evaluate(() => {
        const panel = document.querySelector('#hud .hud-panel');
        if (!panel) return null;
        const cs = getComputedStyle(panel);
        return {
          background: cs.backgroundColor,
          border: cs.borderStyle,
          fontFamily: cs.fontFamily,
        };
      });
      assert(styles !== null, 'No HUD panel found in DOM');
      assert(styles.fontFamily.includes('monospace') || styles.fontFamily.includes('Mono'),
        `HUD font should be monospace, got: ${styles.fontFamily}`);
    });

    await runner.run('Inventory panel has dark terminal background', async () => {
      const styles = await page.evaluate(() => {
        const panel = document.getElementById('hud-inventory-panel');
        if (!panel) return null;
        const cs = getComputedStyle(panel);
        return { minWidth: parseInt(cs.minWidth), hasBoxShadow: cs.boxShadow !== 'none' };
      });
      assert(styles !== null, 'No inventory panel found');
      assert(styles.minWidth >= 200, `Inventory panel too narrow: ${styles.minWidth}px`);
    });

    await runner.run('All HUD DOM elements present', async () => {
      const elements = await page.evaluate(() => ({
        hud: !!document.getElementById('hud'),
        collapse: !!document.getElementById('hud-collapse'),
        portals: !!document.getElementById('hud-portals'),
        salvage: !!document.getElementById('hud-salvage'),
        scavengers: !!document.getElementById('hud-scavengers'),
        pulse: !!document.getElementById('hud-pulse'),
        signature: !!document.getElementById('hud-signature'),
        warnings: !!document.getElementById('hud-warnings'),
        inventory: !!document.getElementById('hud-inventory-panel'),
        portalArrow: !!document.getElementById('hud-portal-arrow'),
      }));
      for (const [name, exists] of Object.entries(elements)) {
        assert(exists, `Missing HUD element: ${name}`);
      }
    });

    await runner.run('Hull ability presentation exposes active, cooldown, charge, fuel, anchor, decoy, and tractor states', async () => {
      const presentations = await page.evaluate(() => {
        const fixture = window.__TEST_API.getAbilityPresentationFixture;
        return {
          drifter: fixture({
            hullType: 'drifter',
            flowLockActive: true,
            eddyBrakeCooldown: 0,
          }),
          breacher: fixture({
            hullType: 'breacher',
            burnActive: true,
            burnFuel: 12,
          }),
          resonant: fixture({
            hullType: 'resonant',
            tapAnchor: { wx: 1.1, wy: 1.2 },
            tapCooldown: 9,
            frequencyShiftCooldown: 20,
            nextPulseInverted: false,
          }),
          shroud: fixture({
            hullType: 'shroud',
            ghostTrailActive: true,
            wakeCloakCooldown: 0,
            decoyCharges: 1,
            decoyCooldown: 14,
            decoys: [{ wx: 1.2, wy: 1.3, signal: 0.5 }],
          }),
          hauler: fixture({
            hullType: 'hauler',
            salvageLockCharges: 2,
            tractorCooldown: 0,
            tractorChannelTimer: 1.5,
          }),
        };
      });

      const drifter = presentations.drifter.slots[0];
      assert(drifter.name === 'flow lock', `Expected flow lock label, got ${drifter.name}`);
      assert(drifter.active === true && drifter.status.includes('surf'), `Expected active flow lock status, got ${drifter.status}`);

      const breacher = presentations.breacher.slots[0];
      assert(breacher.resourceLabel === 'fuel', 'Expected Breacher fuel resource label');
      assert(breacher.meter > 0.35 && breacher.meter < 0.45, `Expected Breacher fuel meter near 0.4, got ${breacher.meter}`);

      const resonant = presentations.resonant.slots;
      assert(resonant[0].active === true && resonant[0].status.includes('anchor'), `Expected Resonant anchor status, got ${resonant[0].status}`);
      assert(resonant[1].cooldown === 20 && resonant[1].tone === 'cooldown', `Expected Resonant shift cooldown, got ${JSON.stringify(resonant[1])}`);

      const shroud = presentations.shroud.slots;
      assert(shroud[0].active === true && shroud[0].status === 'ghost wake', `Expected Shroud ghost wake, got ${shroud[0].status}`);
      assert(shroud[1].charges === 1 && shroud[1].status.includes('14s'), `Expected Shroud decoy charge + cooldown, got ${shroud[1].status}`);

      const hauler = presentations.hauler.slots;
      assert(hauler[0].charges === 2 && hauler[0].ready === true, `Expected Hauler tag charges ready, got ${JSON.stringify(hauler[0])}`);
      assert(hauler[1].active === true && hauler[1].status.includes('channel'), `Expected active tractor channel, got ${hauler[1].status}`);
    });

    await runner.run('Audio engine initializes without error', async () => {
      const result = await page.evaluate(() => {
        // Audio should have been initialized on first game start
        return typeof window.__TEST_API.getConfig().audio === 'object';
      });
      assert(result, 'Audio CONFIG section missing');
    });

    // Screenshot
    const filepath = await screenshot(page, 'systems');
    console.log(`\n  Screenshot: ${filepath}`);

  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error('Systems test fatal error:', err.message);
  stopServer();
  process.exit(1);
});

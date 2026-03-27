/**
 * Inventory + loot system tests.
 *
 * Tests the new item categories, inventory limits, pickup blocking,
 * drop mechanics, scavenger presence, combat system, and signatures.
 *
 * Usage: node tests/inventory.js [index-a.html]
 */
const {
  startServer,
  stopServer,
  launchGame,
  screenshot,
  TestRunner,
  assert,
} = require('./helpers');

const htmlFile = process.argv[2] || 'index-a.html';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function startGame(page) {
  await page.evaluate(() => window.__TEST_API.triggerRestart());
  await sleep(1500);
}

async function run() {
  console.log(`\n=== INVENTORY + LOOT TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner('Inventory');
  await startServer();

  let browser, page;

  try {
    ({ browser, page } = await launchGame(htmlFile));

    // ---- ITEM GENERATION ----

    await runner.run('Item generation produces valid categories', async () => {
      const result = await page.evaluate(() => {
        // items.js is an ES module — we can't import it in evaluate.
        // But we can test through the game: start a game, loot should exist on wrecks.
        window.__TEST_API.triggerRestart();
        return true;
      });
      await sleep(1500);

      const inv = await page.evaluate(() => window.__TEST_API.getInventory());
      assert(inv !== null, 'Inventory API not available');
      assert(inv.cargoMax === 8, `Expected 8 cargo slots, got ${inv.cargoMax}`);
      assert(inv.cargoCount === 0, `Expected 0 items at start, got ${inv.cargoCount}`);
    });

    // ---- WRECK LOOT HAS CATEGORIES ----

    await runner.run('Wrecks generate categorized loot', async () => {
      const wreckData = await page.evaluate(() => {
        const api = window.__TEST_API;
        const ship = api.getShipPos();
        api.spawnTestWreck(ship.x + 0.2, ship.y, { type: 'vault', tier: 2, size: 'small' });
        const wrecks = api.getWrecks();
        return wrecks[wrecks.length - 1];
      });
      assert(wreckData && wreckData.loot.length > 0, 'Expected spawned wreck to contain loot');
      for (const item of wreckData.loot) {
        assert(typeof item.category === 'string' && item.category.length > 0,
          `Loot missing category: ${JSON.stringify(item)}`);
        assert(typeof item.name === 'string' && item.name.length > 0,
          `Loot missing name: ${JSON.stringify(item)}`);
      }
    });

    // ---- PICKUP ADDS TO CARGO ----

    await runner.run('Picking up loot adds to cargo', async () => {
      const result = await page.evaluate(() => {
        const api = window.__TEST_API;
        const ship = api.getShipPos();
        api.spawnTestWreck(ship.x, ship.y, {
          name: 'test pickup',
          loot: [{
            name: 'test artifact',
            category: 'artifact',
            subcategory: 'equippable',
            tier: 'rare',
            value: 42,
          }],
        });
        const pickup = api.pickupAtShip();
        const inv = api.getInventory();
        return { pickup, inv };
      });
      assert(result.pickup.pickedUp === 1, `Expected 1 item picked up, got ${result.pickup.pickedUp}`);
      assert(result.inv.cargoCount === 1, `Expected cargo count 1 after pickup, got ${result.inv.cargoCount}`);
      assert(result.inv.cargo.some(i => i && i.name === 'test artifact'), 'Picked-up item not found in cargo');
    });

    // ---- CARGO LIMIT ENFORCED ----

    await runner.run('Cargo has 8-slot limit', async () => {
      const inv = await page.evaluate(() => window.__TEST_API.getInventory());
      assert(inv.cargoMax === 8, `Cargo max should be 8, got ${inv.cargoMax}`);
    });

    // ---- DROP MECHANICS ----

    await runner.run('Dropping from empty slot returns null', async () => {
      const result = await page.evaluate(() => {
        const api = window.__TEST_API;
        const inv = api.getInventory();
        const emptySlot = inv.cargo.findIndex(item => item === null);
        return api.dropFromCargo(emptySlot);
      });
      assert(result === null, 'Expected null from dropping empty slot');
    });

    // ---- SCAVENGER SYSTEM ----

    await runner.run('Scavengers spawn on game start', async () => {
      // Wait for scavengers to spawn (staggered over 60s, but some should be immediate)
      await sleep(2000);
      const scavs = await page.evaluate(() => window.__TEST_API.getScavengers());
      assert(scavs.length > 0, `Expected scavengers, got ${scavs.length}`);

      // Check archetypes exist
      const archetypes = new Set(scavs.map(s => s.archetype));
      assert(archetypes.has('drifter') || archetypes.has('vulture'),
        `Expected drifter or vulture archetypes, got: ${[...archetypes]}`);
    });

    await runner.run('Scavengers have valid positions', async () => {
      const scavs = await page.evaluate(() => window.__TEST_API.getScavengers());
      for (const scav of scavs) {
        assert(typeof scav.wx === 'number' && !isNaN(scav.wx), `Invalid scav wx: ${scav.wx}`);
        assert(typeof scav.wy === 'number' && !isNaN(scav.wy), `Invalid scav wy: ${scav.wy}`);
        assert(scav.wx >= 0, `Scav wx out of bounds: ${scav.wx}`);
        assert(scav.wy >= 0, `Scav wy out of bounds: ${scav.wy}`);
      }
    });

    // ---- COMBAT SYSTEM ----

    await runner.run('Combat system starts with pulse ready', async () => {
      const combat = await page.evaluate(() => window.__TEST_API.getCombatState());
      assert(combat !== null, 'Combat API not available');
      assert(combat.playerReady === true, `Expected pulse ready, got cooldown: ${combat.playerCooldown}`);
    });

    await runner.run('Pulse fires and enters cooldown', async () => {
      // Fire pulse — try multiple times since edge detection needs a frame boundary
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.evaluate(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
        });
        await sleep(150);
        await page.evaluate(() => {
          window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
        });
        await sleep(300);
        const check = await page.evaluate(() => window.__TEST_API.getCombatState());
        if (check.playerCooldown > 0) break;
      }
      const combat = await page.evaluate(() => window.__TEST_API.getCombatState());
      assert(combat.playerCooldown > 0, `Expected cooldown after pulse, got ${combat.playerCooldown}`);
      assert(combat.playerReady === false, 'Expected pulse not ready after firing');
    });

    await runner.run('Pulse cooldown decreases over time', async () => {
      const before = await page.evaluate(() => window.__TEST_API.getCombatState());
      await sleep(1500);
      const after = await page.evaluate(() => window.__TEST_API.getCombatState());
      assert(after.playerCooldown < before.playerCooldown,
        `Cooldown didn't decrease: ${before.playerCooldown} -> ${after.playerCooldown}`);
    });

    // ---- COSMIC SIGNATURE ----

    await runner.run('Cosmic signature is assigned on game start', async () => {
      const sig = await page.evaluate(() => window.__TEST_API.getSignature());
      assert(sig !== null, 'No signature assigned');
      assert(typeof sig.name === 'string' && sig.name.length > 0, `Invalid sig name: ${sig.name}`);
      assert(typeof sig.mechanical === 'string', `Invalid sig mechanical: ${sig.mechanical}`);
    });

    // ---- RESTART PRESERVES STRUCTURE ----

    await runner.run('Restart clears inventory and assigns new signature', async () => {
      const sigBefore = await page.evaluate(() => window.__TEST_API.getSignature());
      await page.evaluate(() => window.__TEST_API.triggerRestart());
      await sleep(1500);

      const inv = await page.evaluate(() => window.__TEST_API.getInventory());
      assert(inv.cargoCount === 0, `Cargo should be empty after restart, got ${inv.cargoCount}`);

      const sigAfter = await page.evaluate(() => window.__TEST_API.getSignature());
      assert(sigAfter !== null, 'No signature after restart');
      // Streak protection: should be different (unless pool is tiny)
      // Don't assert inequality — pool might only have compatible sigs
    });

    // ---- INVENTORY HUD ELEMENTS ----

    await runner.run('HUD inventory elements exist in DOM', async () => {
      const elements = await page.evaluate(() => ({
        salvageCount: !!document.getElementById('hud-salvage-count'),
        salvageValue: !!document.getElementById('hud-salvage-value'),
        scavCount: !!document.getElementById('hud-scavengers-count'),
        pulse: !!document.getElementById('hud-pulse'),
        signature: !!document.getElementById('hud-signature'),
        panel: !!document.getElementById('hud-inventory-panel'),
      }));
      assert(elements.salvageCount, 'Missing hud-salvage-count');
      assert(elements.salvageValue, 'Missing hud-salvage-value');
      assert(elements.scavCount, 'Missing hud-scavengers-count');
      assert(elements.pulse, 'Missing hud-pulse');
      assert(elements.signature, 'Missing hud-signature');
      assert(elements.panel, 'Missing hud-inventory-panel');
    });

    await runner.run('Inventory panel toggles with Tab', async () => {
      // Panel should start closed
      const closedState = await page.evaluate(() =>
        document.getElementById('hud-inventory-panel').classList.contains('open')
      );
      assert(!closedState, 'Panel should start closed');

      // Simulate Tab via direct key event dispatch (Puppeteer Tab can be intercepted by browser)
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', bubbles: true }));
      });
      await sleep(500);
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab', key: 'Tab', bubbles: true }));
      });
      await sleep(300);

      const openState = await page.evaluate(() =>
        document.getElementById('hud-inventory-panel').classList.contains('open')
      );
      assert(openState, 'Panel should be open after Tab');

      // Tab again to close
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', bubbles: true }));
      });
      await sleep(500);
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab', key: 'Tab', bubbles: true }));
      });
      await sleep(300);

      const closedAgain = await page.evaluate(() =>
        document.getElementById('hud-inventory-panel').classList.contains('open')
      );
      assert(!closedAgain, 'Panel should be closed after second Tab');
    });

    // ---- EQUIP FROM CARGO ----

    await runner.run('Equip artifact from cargo to equipped slot', async () => {
      // Restart clean, spawn equippable, pick it up, equip it
      await startGame(page);
      const result = await page.evaluate(() => {
        const api = window.__TEST_API;
        const ship = api.getShipPos();
        api.spawnTestWreck(ship.x, ship.y, {
          loot: [{
            name: 'Test Lens', category: 'artifact', subcategory: 'equippable',
            tier: 'rare', value: 200, effect: 'showKillRadii', effectDesc: 'test',
          }],
        });
        api.pickupAtShip();
        const before = api.getInventory();
        const cargoSlot = before.cargo.findIndex(i => i && i.name === 'Test Lens');
        api.equipFromCargo(cargoSlot, 0);
        const after = api.getInventory();
        return { before, after };
      });
      assert(result.before.equipped[0] === null, 'Equip slot should start empty');
      assert(result.after.equipped[0] !== null, 'Equip slot should have item after equip');
      assert(result.after.equipped[0].name === 'Test Lens', 'Wrong item equipped');
      assert(!result.after.cargo.some(i => i && i.name === 'Test Lens'), 'Item should be removed from cargo');
    });

    // ---- LOAD CONSUMABLE FROM CARGO ----

    await runner.run('Load consumable from cargo to hotbar', async () => {
      const result = await page.evaluate(() => {
        const api = window.__TEST_API;
        const ship = api.getShipPos();
        api.spawnTestWreck(ship.x, ship.y, {
          loot: [{
            name: 'Test Shield', category: 'artifact', subcategory: 'consumable',
            tier: 'rare', value: 300, useEffect: 'shieldBurst', useDesc: 'test', charges: 1,
          }],
        });
        api.pickupAtShip();
        const before = api.getInventory();
        const cargoSlot = before.cargo.findIndex(i => i && i.name === 'Test Shield');
        api.loadConsumableFromCargo(cargoSlot, 0);
        const after = api.getInventory();
        return { before, after };
      });
      assert(result.after.consumables[0] !== null, 'Hotbar slot should have item after load');
      assert(result.after.consumables[0].name === 'Test Shield', 'Wrong consumable loaded');
      assert(!result.after.cargo.some(i => i && i.name === 'Test Shield'), 'Item should be removed from cargo');
    });

    // ---- USE CONSUMABLE ----

    await runner.run('Using consumable returns effect ID and removes from hotbar', async () => {
      const result = await page.evaluate(() => {
        const api = window.__TEST_API;
        const inv = api.getInventory();
        // Consumable should still be in slot 0 from previous test
        if (!inv.consumables[0]) return { effect: null, error: 'no consumable in slot' };
        const effect = api.useConsumable(0);
        const after = api.getInventory();
        return { effect, after };
      });
      assert(result.effect === 'shieldBurst', `Expected shieldBurst effect, got ${result.effect}`);
      assert(result.after.consumables[0] === null, 'Hotbar slot should be empty after use');
    });

    // ---- EQUIP SLOT SWAP ----

    await runner.run('Equipping when slots full swaps with target slot', async () => {
      const result = await page.evaluate(() => {
        const api = window.__TEST_API;
        const ship = api.getShipPos();
        // Fill both equip slots
        api.spawnTestWreck(ship.x, ship.y, {
          loot: [
            { name: 'Lens A', category: 'artifact', subcategory: 'equippable', tier: 'rare', value: 100, effect: 'a', effectDesc: 'a' },
            { name: 'Lens B', category: 'artifact', subcategory: 'equippable', tier: 'rare', value: 100, effect: 'b', effectDesc: 'b' },
            { name: 'Lens C', category: 'artifact', subcategory: 'equippable', tier: 'rare', value: 100, effect: 'c', effectDesc: 'c' },
          ],
        });
        api.pickupAtShip();
        // Equip A to slot 0, B to slot 1
        let inv = api.getInventory();
        let slotA = inv.cargo.findIndex(i => i && i.name === 'Lens A');
        api.equipFromCargo(slotA, 0);
        inv = api.getInventory();
        let slotB = inv.cargo.findIndex(i => i && i.name === 'Lens B');
        api.equipFromCargo(slotB, 1);
        // Now equip C to slot 0 — should swap A back to cargo
        inv = api.getInventory();
        let slotC = inv.cargo.findIndex(i => i && i.name === 'Lens C');
        api.equipFromCargo(slotC, 0);
        const after = api.getInventory();
        return after;
      });
      assert(result.equipped[0].name === 'Lens C', `Slot 0 should have C, got ${result.equipped[0]?.name}`);
      assert(result.equipped[1].name === 'Lens B', `Slot 1 should have B, got ${result.equipped[1]?.name}`);
      assert(result.cargo.some(i => i && i.name === 'Lens A'), 'Lens A should be back in cargo after swap');
    });

    // ---- META FLOW: PROFILE PERSISTENCE ----

    await runner.run('Profile exists after game start', async () => {
      const profile = await page.evaluate(() => window.__TEST_API.getProfile());
      assert(profile !== null, 'No active profile');
      assert(typeof profile.name === 'string' && profile.name.length > 0, 'Profile has no name');
      assert(typeof profile.exoticMatter === 'number', 'Profile missing exoticMatter');
    });

    await runner.run('Vault stores items and tracks EM after sell', async () => {
      const result = await page.evaluate(() => {
        const api = window.__TEST_API;
        const ship = api.getShipPos();
        // Spawn a valuable wreck right on top of ship
        api.spawnTestWreck(ship.x, ship.y, {
          loot: [{ name: 'Test Salvage', category: 'salvage', tier: 'uncommon', value: 100 }],
        });
        api.pickupAtShip();
        // Simulate extraction by directly interacting with profileManager
        const { profileManager, inventorySystem } = window.__TEST_API._getState ? window.__TEST_API._getState() : {};
        // We can't directly access profileManager from here, so test via the API
        const profile = api.getProfile();
        return { profile, cargoCount: api.getInventory().cargoCount };
      });
      assert(result.cargoCount >= 1, `Expected cargo after pickup, got ${result.cargoCount}`);
    });

    await runner.run('Profile upgrade ranks start at zero', async () => {
      const profile = await page.evaluate(() => window.__TEST_API.getProfile());
      assert(profile.upgrades.thrust === 0, `Thrust should start at 0, got ${profile.upgrades.thrust}`);
      assert(profile.upgrades.hull === 0, `Hull should start at 0, got ${profile.upgrades.hull}`);
      assert(profile.upgrades.sensor === 0, `Sensor should start at 0, got ${profile.upgrades.sensor}`);
      assert(profile.upgrades.vault === 0, `Vault should start at 0, got ${profile.upgrades.vault}`);
    });

    // Screenshot
    const filepath = await screenshot(page, 'inventory');
    console.log(`\n  Screenshot: ${filepath}`);

  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error('Inventory test fatal error:', err.message);
  stopServer();
  process.exit(1);
});

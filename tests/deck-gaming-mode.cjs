const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  parseShortcutsVdf,
  writeShortcutsVdf,
  shortcutEntry,
  shortcutAppId,
  upsertShortcut,
} = require("../scripts/deploy/deck-gaming-mode.cjs");

function shortcutCount(root) {
  return Object.keys(root.shortcuts || {}).length;
}

function run() {
  const scriptSource = fs.readFileSync(path.join(__dirname, "..", "scripts", "deploy", "deck-gaming-mode.cjs"), "utf8");
  assert(scriptSource.includes("--all-users"), "Deck Gaming Mode installer must expose an all-users shortcut write");
  assert(scriptSource.includes("LBH_DECK_ALL_STEAM_USERS"), "Deck Gaming Mode installer must support all-users via env var");
  assert(scriptSource.includes("dirs.length > 1"), "Deck Gaming Mode installer must avoid picking an arbitrary Steam user when multiple users exist");

  const remoteDir = "/home/deck/Games/last-singularity";
  const entry = shortcutEntry({ remoteDir });

  assert.strictEqual(entry.AppName, "Last Singularity");
  assert.strictEqual(entry.Exe, `"/home/deck/Games/last-singularity/run-last-singularity.sh"`);
  assert.strictEqual(entry.StartDir, `"/home/deck/Games/last-singularity"`);
  assert.strictEqual(entry.ShortcutPath, "/home/deck/Games/last-singularity/last-singularity.desktop");
  assert.strictEqual(entry.tags[0], "Last Singularity");
  assert.strictEqual(entry.tags[1], "Deck Playtest");
  assert.strictEqual(entry.appid, shortcutAppId(entry.Exe, entry.AppName));

  const root = { shortcuts: {} };
  const firstKey = upsertShortcut(root, entry);
  const secondKey = upsertShortcut(root, entry);

  assert.strictEqual(firstKey, "0");
  assert.strictEqual(secondKey, firstKey);
  assert.strictEqual(shortcutCount(root), 1);

  const encoded = writeShortcutsVdf(root);
  assert.deepStrictEqual(
    Array.from(encoded.slice(-4)),
    [0x08, 0x08, 0x08, 0x08],
    "Steam shortcuts.vdf must include the shortcut, shortcuts object, and root terminators"
  );
  const decoded = parseShortcutsVdf(encoded);

  assert.strictEqual(shortcutCount(decoded), 1);
  assert.strictEqual(decoded.shortcuts[0].AppName, "Last Singularity");
  assert.strictEqual(decoded.shortcuts[0].Exe, entry.Exe);
  assert.strictEqual(decoded.shortcuts[0].appid, entry.appid);
  assert.strictEqual(decoded.shortcuts[0].AllowOverlay, 1);
  assert.strictEqual(decoded.shortcuts[0].tags[0], "Last Singularity");

  const secondEntry = {
    ...shortcutEntry({ remoteDir: "/home/deck/Games/other" }),
    AppName: "Other Game",
  };
  const nextKey = upsertShortcut(decoded, secondEntry);

  assert.strictEqual(nextKey, "1");
  assert.strictEqual(shortcutCount(decoded), 2);

  console.log("Deck Gaming Mode shortcut VDF guard passed.");
}

run();

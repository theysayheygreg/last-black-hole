const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { argValue, hasFlag } = require("../scripts/deploy/cli.cjs");
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
  const argv = (...args) => ["node", "deploy.cjs", ...args];
  assert.strictEqual(argValue("--host", "fallback", argv()), "fallback");
  assert.strictEqual(argValue("--host", "fallback", argv("--host", "deck")), "deck");
  assert.strictEqual(argValue("--host", "fallback", argv("--host")), "fallback");
  assert.strictEqual(argValue("--host", "fallback", argv("--host", "")), "fallback");
  assert.strictEqual(argValue("--host", "fallback", argv("--host", "--dry-run")), "--dry-run");
  assert.strictEqual(argValue("--host", "fallback", argv("--host=inline")), "inline");
  assert.strictEqual(argValue("--host", "fallback", argv("--host=")), "");
  assert.strictEqual(
    argValue("--host", "fallback", argv("--host", "spaced", "--host=inline")),
    "inline",
    "Inline values must retain precedence over spaced values"
  );
  assert.strictEqual(
    argValue("--host", "fallback", argv("--host=first", "--host=second")),
    "first",
    "The first inline value must retain precedence"
  );
  assert.strictEqual(hasFlag("--dry-run", argv("--dry-run")), true);
  assert.strictEqual(hasFlag("--dry-run", argv("--dry-run=true")), false);

  const scriptSource = fs.readFileSync(path.join(__dirname, "..", "scripts", "deploy", "deck-gaming-mode.cjs"), "utf8");
  assert(scriptSource.includes("--all-users"), "Deck Gaming Mode installer must expose an all-users shortcut write");
  assert(scriptSource.includes("LBH_DECK_ALL_STEAM_USERS"), "Deck Gaming Mode installer must support all-users via env var");
  assert(scriptSource.includes("dirs.length > 1"), "Deck Gaming Mode installer must avoid picking an arbitrary Steam user when multiple users exist");

  const remoteDir = "/home/deck/Games/last-singularity";
  const entry = shortcutEntry({ remoteDir });

  assert.strictEqual(entry.AppName, "Last Singularity");
  assert.strictEqual(entry.Exe, `"/home/deck/Games/last-singularity/run-last-singularity.sh"`);
  assert.strictEqual(entry.StartDir, `"/home/deck/Games/last-singularity"`);
  assert.strictEqual(entry.icon, "/home/deck/Games/last-singularity/last-singularity-icon.png");
  assert.strictEqual(entry.ShortcutPath, "/home/deck/Games/last-singularity/last-singularity.desktop");
  assert.strictEqual(entry.tags[0], "Last Singularity");
  assert.strictEqual(entry.tags[1], "Deck Playtest");
  assert.strictEqual(entry.appid, shortcutAppId(entry.Exe, entry.AppName));

  const previewEntry = shortcutEntry({
    remoteDir: "/home/deck/Games/last-singularity-v03",
    name: "Last Singularity v0.3 Preview",
    slug: "last-singularity-v03",
  });
  assert.strictEqual(previewEntry.AppName, "Last Singularity v0.3 Preview");
  assert.strictEqual(previewEntry.ShortcutPath, "/home/deck/Games/last-singularity-v03/last-singularity-v03.desktop");
  assert.notStrictEqual(previewEntry.appid, entry.appid, "Side-by-side installs need distinct Steam app ids");
  assert.notStrictEqual(previewEntry.Exe, entry.Exe, "Side-by-side installs need distinct launchers");

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

  const previewKey = upsertShortcut(decoded, previewEntry);
  assert.strictEqual(previewKey, "2");
  assert.strictEqual(shortcutCount(decoded), 3);

  console.log("Deck Gaming Mode shortcut VDF guard passed.");
}

run();

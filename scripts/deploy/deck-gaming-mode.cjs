#!/usr/bin/env node

const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PRODUCT_NAME = "Last Singularity";
const DESKTOP_ENTRY_NAME = "last-singularity.desktop";
const DEFAULT_REMOTE_DIR = "/home/deck/Games/last-singularity";

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sshTarget(user, host) {
  return host.includes("@") ? host : `${user}@${host}`;
}

function sshOptions() {
  return [
    "-o", "ConnectTimeout=8",
    "-o", "StrictHostKeyChecking=accept-new",
  ];
}

function remoteCommand(command) {
  return `export PATH=/usr/bin:/bin:/usr/sbin:/sbin:$PATH\n${command}`;
}

function sshOutput(ssh, target, command, options = {}) {
  return execFileSync(ssh, [...sshOptions(), target, remoteCommand(command)], {
    cwd: ROOT,
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

function sshInput(ssh, target, command, input) {
  execFileSync(ssh, [...sshOptions(), target, remoteCommand(command)], {
    cwd: ROOT,
    input,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function requireDeckHost(host) {
  if (!host) {
    throw new Error([
      "Missing Steam Deck Tailscale host.",
      "Set LBH_DECK_HOST=steamdeck, use MagicDNS, or pass --host=100.x.y.z.",
    ].join(" "));
  }
}

function readCString(buffer, cursor) {
  let end = cursor.offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  if (end >= buffer.length) throw new Error("Invalid binary VDF: unterminated string");
  const value = buffer.toString("utf8", cursor.offset, end);
  cursor.offset = end + 1;
  return value;
}

function parseObject(buffer, cursor) {
  const object = {};
  while (cursor.offset < buffer.length) {
    const type = buffer[cursor.offset];
    cursor.offset += 1;
    if (type === 0x08) return object;

    const key = readCString(buffer, cursor);
    if (type === 0x00) {
      object[key] = parseObject(buffer, cursor);
    } else if (type === 0x01) {
      object[key] = readCString(buffer, cursor);
    } else if (type === 0x02) {
      if (cursor.offset + 4 > buffer.length) throw new Error("Invalid binary VDF: truncated int32");
      object[key] = buffer.readUInt32LE(cursor.offset);
      cursor.offset += 4;
    } else if (type === 0x07) {
      if (cursor.offset + 8 > buffer.length) throw new Error("Invalid binary VDF: truncated uint64");
      object[key] = buffer.readBigUInt64LE(cursor.offset);
      cursor.offset += 8;
    } else {
      throw new Error(`Unsupported binary VDF field type 0x${type.toString(16)} for ${key}`);
    }
  }
  throw new Error("Invalid binary VDF: missing object terminator");
}

function parseShortcutsVdf(buffer) {
  if (!buffer || buffer.length === 0) return { shortcuts: {} };

  const cursor = { offset: 0 };
  const type = buffer[cursor.offset];
  cursor.offset += 1;
  if (type !== 0x00) throw new Error("Invalid shortcuts.vdf: root must be a shortcuts object");

  const rootName = readCString(buffer, cursor);
  if (rootName !== "shortcuts") {
    throw new Error(`Invalid shortcuts.vdf: expected root "shortcuts", found "${rootName}"`);
  }

  return { shortcuts: parseObject(buffer, cursor) };
}

function encodeCString(value) {
  return Buffer.from(`${String(value)}\0`, "utf8");
}

function encodeValue(key, value) {
  if (value && typeof value === "object" && !Buffer.isBuffer(value) && typeof value !== "bigint") {
    return Buffer.concat([
      Buffer.from([0x00]),
      encodeCString(key),
      encodeObject(value),
    ]);
  }
  if (typeof value === "bigint") {
    const payload = Buffer.alloc(8);
    payload.writeBigUInt64LE(value);
    return Buffer.concat([Buffer.from([0x07]), encodeCString(key), payload]);
  }
  if (typeof value === "number") {
    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(value >>> 0);
    return Buffer.concat([Buffer.from([0x02]), encodeCString(key), payload]);
  }
  return Buffer.concat([
    Buffer.from([0x01]),
    encodeCString(key),
    encodeCString(value ?? ""),
  ]);
}

function sortedKeys(object) {
  const keys = Object.keys(object);
  const numeric = keys.filter((key) => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b));
  const named = keys.filter((key) => !/^\d+$/.test(key));
  return [...numeric, ...named];
}

function encodeObject(object) {
  const chunks = [];
  for (const key of sortedKeys(object)) chunks.push(encodeValue(key, object[key]));
  chunks.push(Buffer.from([0x08]));
  return Buffer.concat(chunks);
}

function writeShortcutsVdf(root) {
  return Buffer.concat([
    Buffer.from([0x00]),
    encodeCString("shortcuts"),
    encodeObject(root.shortcuts || {}),
    Buffer.from([0x08]),
  ]);
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32(value) {
  const buffer = Buffer.from(String(value), "utf8");
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC32_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function shortcutAppId(exe, appName) {
  return (crc32(`${exe}${appName}`) | 0x80000000) >>> 0;
}

function shortcutEntry(options = {}) {
  const name = options.name || PRODUCT_NAME;
  const remoteDir = options.remoteDir || DEFAULT_REMOTE_DIR;
  const launcher = `${remoteDir.replace(/\/$/, "")}/run-last-singularity.sh`;
  const desktopEntry = `${remoteDir.replace(/\/$/, "")}/${DESKTOP_ENTRY_NAME}`;
  const exe = `"${launcher}"`;
  const startDir = `"${remoteDir.replace(/\/$/, "")}"`;

  return {
    appid: shortcutAppId(exe, name),
    AppName: name,
    Exe: exe,
    StartDir: startDir,
    icon: "",
    ShortcutPath: desktopEntry,
    LaunchOptions: "",
    IsHidden: 0,
    AllowDesktopConfig: 1,
    AllowOverlay: 1,
    OpenVR: 0,
    Devkit: 0,
    DevkitGameID: "",
    LastPlayTime: 0,
    FlatpakAppID: "",
    tags: {
      0: "Last Singularity",
      1: "Deck Playtest",
    },
  };
}

function upsertShortcut(root, entry) {
  const shortcuts = root.shortcuts || {};
  root.shortcuts = shortcuts;

  const launcher = String(entry.Exe || "").replace(/^"|"$/g, "");
  let key = Object.keys(shortcuts).find((candidate) => {
    const item = shortcuts[candidate] || {};
    return item.AppName === entry.AppName
      || String(item.Exe || "").replace(/^"|"$/g, "") === launcher
      || item.ShortcutPath === entry.ShortcutPath;
  });

  if (!key) {
    const numericKeys = Object.keys(shortcuts)
      .filter((candidate) => /^\d+$/.test(candidate))
      .map((candidate) => Number(candidate));
    key = String(numericKeys.length ? Math.max(...numericKeys) + 1 : 0);
  }

  shortcuts[key] = { ...(shortcuts[key] || {}), ...entry };
  return key;
}

function remoteSteamProcesses(ssh, target) {
  const command = [
    "set +e",
    "for name in steam steamwebhelper steam-runtime-launcher; do",
    "  pgrep -u \"$USER\" -ax \"$name\" 2>/dev/null",
    "done",
    "true",
  ].join("\n");
  return sshOutput(ssh, target, command).trim();
}

function shutdownSteam(ssh, target) {
  const command = [
    "set +e",
    "if command -v steam >/dev/null 2>&1; then steam -shutdown >/dev/null 2>&1; fi",
    "for i in $(seq 1 30); do",
    "  if ! pgrep -u \"$USER\" -x steam >/dev/null 2>&1 && ! pgrep -u \"$USER\" -x steamwebhelper >/dev/null 2>&1; then exit 0; fi",
    "  sleep 1",
    "done",
    "for name in steam steamwebhelper steam-runtime-launcher; do pgrep -u \"$USER\" -ax \"$name\" 2>/dev/null; done",
    "exit 1",
  ].join("\n");
  sshOutput(ssh, target, command, { stdio: ["ignore", "pipe", "inherit"] });
}

function findSteamUserDirs(ssh, target) {
  const command = [
    "base=\"$HOME/.steam/steam/userdata\"",
    "[ -d \"$base\" ] || exit 4",
    "find \"$base\" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*' -print | sort",
  ].join("; ");
  return sshOutput(ssh, target, command)
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function remotePathExists(ssh, target, remotePath) {
  try {
    sshOutput(ssh, target, `test -e ${shellQuote(remotePath)}`);
    return true;
  } catch {
    return false;
  }
}

function shortcutsTargetForUserDir(userDir) {
  return {
    userDir,
    shortcutsPath: `${userDir}/config/shortcuts.vdf`,
  };
}

function selectShortcutsTargets(ssh, target, { steamUserId = "", allUsers = false } = {}) {
  if (steamUserId) {
    const base = sshOutput(ssh, target, "printf '%s' \"$HOME/.steam/steam/userdata\"").trim();
    const remoteDir = `${base}/${steamUserId}`;
    return [shortcutsTargetForUserDir(remoteDir)];
  }

  const dirs = findSteamUserDirs(ssh, target);
  if (dirs.length === 0) throw new Error("No Steam userdata directories found on the Deck.");
  if (allUsers || dirs.length > 1) return dirs.map(shortcutsTargetForUserDir);
  return [shortcutsTargetForUserDir(dirs[0])];
}

function installShortcutIntoSelection(options, selection) {
  const {
    ssh,
    target,
    remoteDir,
    dryRun,
  } = options;

  const existing = readRemoteFileOrEmpty(ssh, target, selection.shortcutsPath);
  const root = parseShortcutsVdf(existing);
  const key = upsertShortcut(root, shortcutEntry({ remoteDir }));
  const output = writeShortcutsVdf(root);
  const backupPath = `${selection.shortcutsPath}.lbh-backup-${timestamp()}`;

  if (!dryRun) {
    const configDir = path.posix.dirname(selection.shortcutsPath);
    sshOutput(ssh, target, `mkdir -p ${shellQuote(configDir)}`);
    if (existing.length) {
      sshOutput(ssh, target, `cp ${shellQuote(selection.shortcutsPath)} ${shellQuote(backupPath)}`);
    }
    const tempPath = `${selection.shortcutsPath}.codex-tmp-${process.pid}`;
    sshInput(ssh, target, `cat > ${shellQuote(tempPath)}`, output);
    sshOutput(ssh, target, [
      `mv ${shellQuote(tempPath)} ${shellQuote(selection.shortcutsPath)}`,
      `chmod 600 ${shellQuote(selection.shortcutsPath)}`,
    ].join(" && "));
  }

  return {
    key,
    appid: root.shortcuts[key].appid >>> 0,
    userDir: selection.userDir,
    shortcutsPath: selection.shortcutsPath,
    backupPath: existing.length ? backupPath : "",
  };
}

function readRemoteFileOrEmpty(ssh, target, remotePath) {
  if (!remotePathExists(ssh, target, remotePath)) return Buffer.alloc(0);
  return sshOutput(ssh, target, `cat ${shellQuote(remotePath)}`, { encoding: "buffer" });
}

function timestamp() {
  return new Date().toISOString().replace(/[^\d]/g, "").slice(0, 14);
}

function installShortcut(options) {
  const {
    ssh,
    target,
    remoteDir,
    steamUserId,
    allUsers,
    dryRun,
    shutdown,
  } = options;
  const launcher = `${remoteDir.replace(/\/$/, "")}/run-last-singularity.sh`;

  sshOutput(ssh, target, `test -x ${shellQuote(launcher)}`);

  const running = remoteSteamProcesses(ssh, target);
  if (running && !shutdown && !dryRun) {
    throw new Error([
      "Steam is running on the Deck, so shortcuts.vdf is not safe to edit.",
      "Run again with --shutdown-steam from Desktop Mode, or close Steam manually first.",
      "",
      running,
    ].join("\n"));
  }
  if (running && shutdown && !dryRun) shutdownSteam(ssh, target);

  const selections = selectShortcutsTargets(ssh, target, { steamUserId, allUsers });
  const entries = selections.map((selection) => installShortcutIntoSelection(options, selection));

  return {
    entries,
    launcher,
  };
}

function main() {
  const host = argValue("--host", process.env.LBH_DECK_HOST || "");
  const user = argValue("--user", process.env.LBH_DECK_USER || "deck");
  const remoteDir = argValue("--dir", process.env.LBH_DECK_DIR || DEFAULT_REMOTE_DIR);
  const steamUserId = argValue("--steam-user-id", process.env.LBH_DECK_STEAM_USER_ID || "");
  const ssh = process.env.LBH_SSH || "ssh";
  const dryRun = hasFlag("--dry-run");
  const shutdown = hasFlag("--shutdown-steam");
  const allUsers = hasFlag("--all-users")
    || process.env.LBH_DECK_ALL_STEAM_USERS === "1"
    || steamUserId === "all";
  const selectedSteamUserId = steamUserId === "all" ? "" : steamUserId;

  requireDeckHost(host);
  const target = sshTarget(user, host);
  sshOutput(ssh, target, "true");

  const result = installShortcut({
    ssh,
    target,
    remoteDir,
    steamUserId: selectedSteamUserId,
    allUsers,
    dryRun,
    shutdown,
  });

  console.log("");
  console.log(dryRun ? "Steam Deck Gaming Mode shortcut dry-run complete." : "Steam Deck Gaming Mode shortcut installed.");
  console.log(`- target: ${target}`);
  for (const entry of result.entries) {
    console.log(`- shortcuts: ${entry.shortcutsPath}`);
    if (entry.backupPath) console.log(`  ${dryRun ? "backup would be" : "backup"}: ${entry.backupPath}`);
    console.log(`  entry: ${PRODUCT_NAME} (key ${entry.key}, appid ${entry.appid})`);
  }
  console.log(`- launcher: ${result.launcher}`);
  console.log("");
  console.log("Restart Steam or return to Gaming Mode so Steam reloads the non-Steam library entry.");
}

if (require.main === module) main();

module.exports = {
  parseShortcutsVdf,
  writeShortcutsVdf,
  shortcutAppId,
  shortcutEntry,
  upsertShortcut,
};

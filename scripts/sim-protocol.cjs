const PROTOCOL_VERSION = "lbh-local-v2";
const AUTHORITY_HEADER = "x-lbh-command-credential";
const PLAYER_ID_HEADER = "x-lbh-player-id";
const RUN_ID_HEADER = "x-lbh-run-id";
const DEFAULT_SIM_PORT = 8787;
const DEFAULT_TICK_HZ = 15;
const DEFAULT_SNAPSHOT_HZ = 10;
const DEFAULT_WORLD_SCALE = 5;
const DEFAULT_MAX_PLAYERS = 4;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSlingshotEdges(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const edges = [];
  for (const entry of value) {
    const rawId = typeof entry === "object" && entry !== null ? entry.id : entry;
    const id = Math.max(0, Math.floor(asNumber(rawId, 0)));
    if (id <= 0 || seen.has(id)) continue;
    seen.add(id);
    edges.push(id);
    if (edges.length >= 8) break;
  }
  return edges;
}

function normalizeIdentity(value) {
  return String(value || "").trim();
}

function normalizeCommandEnvelope(body = {}) {
  const playerId = normalizeIdentity(body.playerId || body.clientId);
  return {
    runId: normalizeIdentity(body.runId),
    playerId,
    // Keep clientId as a read-only compatibility alias inside the sim while
    // v2 names the authority subject playerId at the wire boundary.
    clientId: playerId,
    commandSeq: Math.max(0, Math.floor(asNumber(body.commandSeq, 0))),
    commandCredential: normalizeIdentity(body.commandCredential),
  };
}

function normalizeInputMessage(body = {}) {
  const envelope = normalizeCommandEnvelope(body);
  const consumeSlotValue = body.consumeSlot;
  const consumeSlot =
    consumeSlotValue === null || consumeSlotValue === undefined || consumeSlotValue === ""
      ? null
      : clamp(Math.floor(asNumber(consumeSlotValue, -1)), 0, 1);
  let moveX = clamp(asNumber(body.moveX, 0), -1, 1);
  let moveY = clamp(asNumber(body.moveY, 0), -1, 1);
  const moveMag = Math.hypot(moveX, moveY);
  if (moveMag > 1) {
    moveX /= moveMag;
    moveY /= moveMag;
  }
  return {
    ...envelope,
    type: "input",
    seq: Math.max(0, Math.floor(asNumber(body.seq, 0))),
    moveX,
    moveY,
    thrust: clamp(asNumber(body.thrust, 0), 0, 1),
    brake: clamp(asNumber(body.brake, 0), 0, 1),
    slingshot: Boolean(body.slingshot),
    slingshotEdges: normalizeSlingshotEdges(body.slingshotEdges),
    pulse: Boolean(body.pulse),
    extractConfirm: Boolean(body.extractConfirm),
    ability1: Boolean(body.ability1),
    ability2: Boolean(body.ability2),
    consumeSlot,
    timestamp: asNumber(body.timestamp, Date.now()),
  };
}

function normalizeInventoryAction(body = {}) {
  const envelope = normalizeCommandEnvelope(body);
  const action = String(body.action || "").trim();
  return {
    ...envelope,
    type: "inventoryAction",
    action,
    cargoSlot: Math.max(-1, Math.floor(asNumber(body.cargoSlot, -1))),
    equipSlot: Math.max(-1, Math.floor(asNumber(body.equipSlot, -1))),
    consumableSlot: Math.max(-1, Math.floor(asNumber(body.consumableSlot, -1))),
  };
}

function playerEventVisibility(playerId) {
  const normalized = normalizeIdentity(playerId);
  if (!normalized) throw new Error("Player-local visibility requires a playerId");
  return `player:${normalized}`;
}

function eventVisibleToPlayer(event, playerId = null) {
  const visibility = normalizeIdentity(event?.visibility || "public");
  if (!visibility || visibility === "public") return true;
  if (!visibility.startsWith("player:")) return false;
  return visibility.slice("player:".length) === normalizeIdentity(playerId);
}

function filterEventsForPlayer(events, playerId = null) {
  return Array.isArray(events)
    ? events.filter((event) => eventVisibleToPlayer(event, playerId))
    : [];
}

function createProtocolDescription() {
  return {
    version: PROTOCOL_VERSION,
    summary: "Authoritative sim owns gameplay truth. Client owns local rendering, audio, UI, and visual fluid reconstruction.",
    clocks: {
      tickHz: DEFAULT_TICK_HZ,
      snapshotHz: DEFAULT_SNAPSHOT_HZ,
    },
    messages: {
      join: {
        direction: "client->server",
        body: {
          type: "join",
          runId: "active run id",
          clientId: "string",
          name: "string",
          joinTicket: "one-time host claim when starting/resetting a run",
          commandCredential: "required only when reconnecting an existing player",
        },
        response: "server-issued per-player command authority",
      },
      input: {
        direction: "client->server",
        body: {
          type: "input",
          runId: "active run id",
          playerId: "authority subject",
          commandSeq: "monotonic per-player command id",
          commandCredential: "server-issued secret (body or authority header)",
          seq: "number",
          moveX: "number[-1..1]",
          moveY: "number[-1..1]",
          thrust: "number[0..1]",
          brake: "number[0..1]",
          slingshot: "boolean",
          slingshotEdges: "number[] queued press edges, max 8",
          pulse: "boolean",
          extractConfirm: "boolean one-shot while inside an extraction aperture",
          consumeSlot: "number[0..1] | null",
          timestamp: "unix-ms",
        },
      },
      inventoryAction: {
        direction: "client->server",
        body: {
          type: "inventoryAction",
          runId: "active run id",
          playerId: "authority subject",
          commandSeq: "monotonic per-player command id",
          commandCredential: "server-issued secret (body or authority header)",
          action: "'dropCargo' | 'equipCargo' | 'loadConsumable' | 'unequip' | 'unloadConsumable'",
          cargoSlot: "number | -1",
          equipSlot: "number | -1",
          consumableSlot: "number | -1",
        },
      },
      snapshot: {
        direction: "server->client",
        body: {
          type: "snapshot",
          protocolVersion: PROTOCOL_VERSION,
          session: "session metadata",
          tick: "number",
          simTime: "seconds",
          lastEventSeq: "latest authoritative event sequence watermark",
          players: "public player state plus only the authenticated owner's private fields",
          recentEvents: "array of authoritative events",
        },
      },
      events: {
        direction: "server->client",
        body: {
          runId: "active run id",
          nextSince: "global authoritative event watermark",
          events: "public events plus authenticated player-local events",
        },
      },
    },
    authority: {
      headers: {
        [AUTHORITY_HEADER]: "server-issued command credential",
        [PLAYER_ID_HEADER]: "authority subject",
        [RUN_ID_HEADER]: "active run identity",
      },
      reconnect: "same run + player id + credential rotates connection authority while preserving membership and monotonic counters",
      snapshotPrivacy: "unauthenticated reads receive public projection; current connection authority adds only its owner-private overlay",
      rejection: "stale run, wrong player, invalid credential, stale command, and stale input are deterministic errors",
    },
  };
}

module.exports = {
  PROTOCOL_VERSION,
  DEFAULT_SIM_PORT,
  DEFAULT_TICK_HZ,
  DEFAULT_SNAPSHOT_HZ,
  DEFAULT_WORLD_SCALE,
  DEFAULT_MAX_PLAYERS,
  AUTHORITY_HEADER,
  PLAYER_ID_HEADER,
  RUN_ID_HEADER,
  normalizeCommandEnvelope,
  normalizeInputMessage,
  normalizeInventoryAction,
  playerEventVisibility,
  eventVisibleToPlayer,
  filterEventsForPlayer,
  createProtocolDescription,
};

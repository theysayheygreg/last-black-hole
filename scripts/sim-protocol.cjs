const PROTOCOL_VERSION = "lbh-local-v1";
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

function normalizeInputMessage(body = {}) {
  const consumeSlotValue = body.consumeSlot;
  const consumeSlot =
    consumeSlotValue === null || consumeSlotValue === undefined || consumeSlotValue === ""
      ? null
      : clamp(Math.floor(asNumber(consumeSlotValue, -1)), 0, 1);
  return {
    type: "input",
    clientId: String(body.clientId || "").trim(),
    seq: Math.max(0, Math.floor(asNumber(body.seq, 0))),
    moveX: clamp(asNumber(body.moveX, 0), -1, 1),
    moveY: clamp(asNumber(body.moveY, 0), -1, 1),
    thrust: clamp(asNumber(body.thrust, 0), 0, 1),
    brake: clamp(asNumber(body.brake, 0), 0, 1),
    pulse: Boolean(body.pulse),
    ability1: Boolean(body.ability1),
    ability2: Boolean(body.ability2),
    consumeSlot,
    timestamp: asNumber(body.timestamp, Date.now()),
  };
}

function normalizeInventoryAction(body = {}) {
  const action = String(body.action || "").trim();
  return {
    type: "inventoryAction",
    clientId: String(body.clientId || "").trim(),
    action,
    cargoSlot: Math.max(-1, Math.floor(asNumber(body.cargoSlot, -1))),
    equipSlot: Math.max(-1, Math.floor(asNumber(body.equipSlot, -1))),
    consumableSlot: Math.max(-1, Math.floor(asNumber(body.consumableSlot, -1))),
  };
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
          clientId: "string",
          name: "string",
        },
      },
      input: {
        direction: "client->server",
        body: {
          type: "input",
          clientId: "string",
          seq: "number",
          moveX: "number[-1..1]",
          moveY: "number[-1..1]",
          thrust: "number[0..1]",
          brake: "number[0..1]",
          pulse: "boolean",
          consumeSlot: "number[0..1] | null",
          timestamp: "unix-ms",
        },
      },
      inventoryAction: {
        direction: "client->server",
        body: {
          type: "inventoryAction",
          clientId: "string",
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
          players: "array of player state",
          recentEvents: "array of authoritative events",
        },
      },
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
  normalizeInputMessage,
  normalizeInventoryAction,
  createProtocolDescription,
};

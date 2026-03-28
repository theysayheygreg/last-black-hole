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
  return {
    type: "input",
    clientId: String(body.clientId || "").trim(),
    seq: Math.max(0, Math.floor(asNumber(body.seq, 0))),
    moveX: clamp(asNumber(body.moveX, 0), -1, 1),
    moveY: clamp(asNumber(body.moveY, 0), -1, 1),
    thrust: clamp(asNumber(body.thrust, 0), 0, 1),
    pulse: Boolean(body.pulse),
    timestamp: asNumber(body.timestamp, Date.now()),
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
          pulse: "boolean",
          timestamp: "unix-ms",
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
  createProtocolDescription,
};

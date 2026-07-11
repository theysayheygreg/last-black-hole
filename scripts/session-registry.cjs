const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function newOpaqueId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function newAuthoritySecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function createMembershipAuthority({ runId, playerId, previous = null }) {
  const normalizedRunId = String(runId || "").trim();
  const normalizedPlayerId = String(playerId || "").trim();
  if (!normalizedRunId) throw new Error("Membership authority requires a runId");
  if (!normalizedPlayerId) throw new Error("Membership authority requires a playerId");

  if (previous && previous.runId !== normalizedRunId) {
    throw new Error("Membership authority cannot cross run boundaries");
  }
  if (previous && previous.playerId !== normalizedPlayerId) {
    throw new Error("Membership authority cannot change player ownership");
  }

  return {
    runId: normalizedRunId,
    membershipId: previous?.membershipId || newOpaqueId("membership"),
    playerId: normalizedPlayerId,
    localProfileId: previous?.localProfileId || newOpaqueId("local-profile"),
    connectionId: newOpaqueId("connection"),
    connectionEpoch: Math.max(0, Number(previous?.connectionEpoch) || 0) + 1,
    commandCredential: newAuthoritySecret(),
    lastCommandSeq: Math.max(0, Number(previous?.lastCommandSeq) || 0),
    lastActionSeq: Math.max(0, Number(previous?.lastActionSeq) || 0),
    lastSlingshotEdgeId: Math.max(0, Number(previous?.lastSlingshotEdgeId) || 0),
  };
}

class SessionRegistry {
  constructor(filepath) {
    this.filepath = path.resolve(filepath);
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.filepath, "utf8"));
    } catch {
      return {
        version: 1,
        sessions: {},
      };
    }
  }

  write(state) {
    fs.mkdirSync(path.dirname(this.filepath), { recursive: true });
    fs.writeFileSync(this.filepath, `${JSON.stringify(state, null, 2)}\n`);
  }
}

module.exports = {
  SessionRegistry,
  createMembershipAuthority,
};

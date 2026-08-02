const { emptyFlowSample, normalizeFlowSample } = require("./flow-sample.cjs");
const { wellGravityMagnitude } = require("./sim/well-gravity.cjs");
const { FABRIC } = require("./content/fabric.cjs");
const { MOVEMENT } = require("./content/movement.cjs");
const {
  wrapPosition: wrapWorld,
  wrappedDelta: worldDisplacement,
} = require("./sim/world-geometry.cjs");
const { sampleSeededSea } = require("./sim/seeded-sea.cjs");
const { assertSerializedJsonBudget } = require("./sim/serialization-budget.cjs");
const FORCE_MIN_DIST = FABRIC.wellGravity.minimumDistance;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function signatureMultiplier(well, name) {
  const value = Number(well?.fabricSignature?.parameters?.[name]);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function effectiveWellMass(well) {
  const baseMass = Math.max(0, Number(well?.mass) || 0);
  const overdrive = Math.max(1, Number(well?.overdriveMultiplier) || 1);
  return baseMass * overdrive;
}

function broadOrbitalCurrentSpeed(
  dist,
  strength,
  mass,
  falloff,
  maxRange,
  fullGravityRadius = FABRIC.wellGravity.fullGravityRadius,
  falloffEndRadius = FABRIC.wellGravity.falloffEndRadius,
) {
  if (dist < 0.001 || dist > maxRange) return 0;
  const referenceRadius = Math.max(FORCE_MIN_DIST, Number(fullGravityRadius) || FORCE_MIN_DIST);
  const baseSpeed = strength * mass / Math.pow(referenceRadius, falloff);
  if (dist <= falloffEndRadius) return baseSpeed;
  const t = Math.max(0, Math.min(1, (dist - falloffEndRadius) / Math.max(0.001, maxRange - falloffEndRadius)));
  const eased = t * t * (3 - 2 * t);
  return baseSpeed * (1 - eased);
}

function buildCoarseFlowField({
  worldScale,
  cellSize,
  wells = [],
  wellCurrentScale = FABRIC.wellCurrent.strength,
  wellCurrentFalloff = FABRIC.wellCurrent.falloff,
  wellCurrentMaxRange = FABRIC.wellGravity.falloffEndRadius * FABRIC.wellCurrent.currentReachMultiplier,
  wellGravityScale = FABRIC.wellGravity.strength,
  wellGravityFalloff = FABRIC.wellGravity.falloff,
  wellGravityMaxRange = FABRIC.wellGravity.falloffEndRadius,
  wellGravityFullRadius = FABRIC.wellGravity.fullGravityRadius,
  wellGravityMinimumFraction = FABRIC.wellGravity.minimumGravityFraction,
  wellGravityFalloffCurve = FABRIC.wellGravity.falloffCurve,
  wellGravityFeatherRadius = FABRIC.wellGravity.featherRadius,
  wellCurrentFalloffEnd = FABRIC.wellGravity.falloffEndRadius,
  seededSea = null,
  collapseParameters = {},
  maxCells = Infinity,
}) {
  const safeCellSize = Math.max(0.05, Number(cellSize) || 0.25);
  const columns = Math.max(1, Math.ceil(worldScale / safeCellSize));
  const rows = Math.max(1, Math.ceil(worldScale / safeCellSize));
  const cellCount = columns * rows;
  const cellLimit = Number(maxCells);
  if (Number.isFinite(cellLimit) && cellCount > cellLimit) {
    throw new RangeError(`Coarse field requires ${cellCount} cells, exceeding the ${cellLimit}-cell budget`);
  }
  const cells = new Array(cellCount);
  const seededSeaAmbientMultiplier = Number.isFinite(Number(collapseParameters.seededSeaAmbientMultiplier))
    ? Number(collapseParameters.seededSeaAmbientMultiplier)
    : 1;
  const seededSeaSourceMultipliers = Object.fromEntries(
    wells
      .filter((well) => well?.id != null || well?.name != null)
      .map((well) => [
        String(well.id ?? well.name),
        signatureMultiplier(well, 'seededSeaAmbientMultiplier'),
      ])
  );

  for (let row = 0; row < rows; row++) {
    const wy = wrapWorld((row + 0.5) * safeCellSize, worldScale);
    for (let col = 0; col < columns; col++) {
      const wx = wrapWorld((col + 0.5) * safeCellSize, worldScale);
      let currentX = 0;
      let currentY = 0;
      let gravityX = 0;
      let gravityY = 0;
      let ambientX = 0;
      let ambientY = 0;
      let hazard = 0;
      let sourceWellId = null;
      let bestCurrent = 0;

      for (const well of wells) {
        const dx = worldDisplacement(wx, well.wx, worldScale);
        const dy = worldDisplacement(wy, well.wy, worldScale);
        const dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          hazard = Math.max(hazard, 1);
          continue;
        }

        const dir = well.orbitalDir || 1;
        const currentAccel = broadOrbitalCurrentSpeed(
          dist,
          wellCurrentScale * signatureMultiplier(well, 'currentStrengthMultiplier'),
          effectiveWellMass(well) || 1,
          wellCurrentFalloff,
          wellCurrentMaxRange * signatureMultiplier(well, 'currentReachMultiplier'),
          wellGravityFullRadius,
          wellCurrentFalloffEnd,
        );
        if (currentAccel > 0) {
          currentX += (-dy / dist) * dir * currentAccel;
          currentY += (dx / dist) * dir * currentAccel;
          if (Math.abs(currentAccel) > bestCurrent) {
            bestCurrent = Math.abs(currentAccel);
            sourceWellId = well.id ?? well.name ?? null;
          }
        }

        const gravityStrength = wellGravityMagnitude("player", dist, effectiveWellMass(well) || 1, {
          strength: wellGravityScale * signatureMultiplier(well, 'gravityStrengthMultiplier'),
          falloff: wellGravityFalloff,
          maxRange: wellGravityMaxRange * signatureMultiplier(well, 'gravityReachMultiplier'),
          fullGravityRadius: wellGravityFullRadius * signatureMultiplier(well, 'gravityReachMultiplier'),
          falloffEndRadius: wellGravityMaxRange * signatureMultiplier(well, 'gravityReachMultiplier'),
          minimumGravityFraction: wellGravityMinimumFraction,
          falloffCurve: wellGravityFalloffCurve,
          featherRadius: wellGravityFeatherRadius * signatureMultiplier(well, 'gravityReachMultiplier'),
          rangeMode: "localized",
        });
        gravityX += (dx / dist) * gravityStrength;
        gravityY += (dy / dist) * gravityStrength;
        const killRadius = well.killRadius || 0.04;
        const ringOuter = well.ringOuter || killRadius * 2.5;
        if (dist <= killRadius) {
          hazard = Math.max(hazard, 1);
        } else if (dist <= ringOuter) {
          const band = 1 - (dist - killRadius) / Math.max(0.001, ringOuter - killRadius);
          hazard = Math.max(hazard, clamp01(band));
        }
      }

      const ambient = sampleSeededSea(seededSea, wx, wy, {
        ambientMultiplier: seededSeaAmbientMultiplier,
        sourceMultipliers: seededSeaSourceMultipliers,
      });
      ambientX = ambient.x;
      ambientY = ambient.y;
      currentX += ambientX;
      currentY += ambientY;
      const ambientMagnitude = Math.hypot(ambientX, ambientY);
      if (ambientMagnitude > bestCurrent) {
        bestCurrent = ambientMagnitude;
        sourceWellId = ambient.sourceWellId;
      }

      cells[row * columns + col] = {
        currentX,
        currentY,
        ambientX,
        ambientY,
        gravityX,
        gravityY,
        hazard,
        sourceWellId,
      };
    }
  }

  return {
    worldScale,
    cellSize: safeCellSize,
    columns,
    rows,
    authorityFloor: MOVEMENT.player.thrustAccel * FABRIC.seededSea.ambientThrustCeiling,
    cells,
  };
}

function serializeCoarseFlowField(field, tick = null, { maxCells = Infinity, maxBytes = Infinity } = {}) {
  if (!field) return null;
  const cellLimit = Number(maxCells);
  if (Number.isFinite(cellLimit) && field.cells.length > cellLimit) {
    throw new RangeError(`Coarse field packet has ${field.cells.length} cells, exceeding the ${cellLimit}-cell budget`);
  }
  const packed = Buffer.allocUnsafe(field.cells.length * 8);
  for (let index = 0; index < field.cells.length; index += 1) {
    const cell = field.cells[index];
    packed.writeFloatLE(Number(cell.currentX) || 0, index * 8);
    packed.writeFloatLE(Number(cell.currentY) || 0, index * 8 + 4);
  }
  const packet = {
    schemaVersion: 1,
    tick: Number.isInteger(tick) ? tick : null,
    encoding: "float32le-current-y-down-row-major-v1",
    worldScale: field.worldScale,
    cellSize: field.cellSize,
    columns: field.columns,
    rows: field.rows,
    authorityFloor: field.authorityFloor,
    cellCount: field.cells.length,
    data: packed.toString("base64"),
  };
  if (Number.isFinite(Number(maxBytes))) {
    assertSerializedJsonBudget(packet, maxBytes, { label: "Coarse field packet" });
  }
  return packet;
}

function sampleCoarseFlowField(field, wx, wy) {
  if (!field || !field.cells?.length) {
    const sample = emptyFlowSample();
    return {
      currentX: 0,
      currentY: 0,
      gravityX: 0,
      gravityY: 0,
      hazard: 0,
      ...sample,
    };
  }

  const x = wrapWorld(wx, field.worldScale) / field.cellSize;
  const y = wrapWorld(wy, field.worldScale) / field.cellSize;

  const x0 = Math.floor(x) % field.columns;
  const y0 = Math.floor(y) % field.rows;
  const x1 = (x0 + 1) % field.columns;
  const y1 = (y0 + 1) % field.rows;
  const tx = x - Math.floor(x);
  const ty = y - Math.floor(y);

  const c00 = field.cells[y0 * field.columns + x0];
  const c10 = field.cells[y0 * field.columns + x1];
  const c01 = field.cells[y1 * field.columns + x0];
  const c11 = field.cells[y1 * field.columns + x1];

  const lerp = (a, b, t) => a + (b - a) * t;
  const bilerp = (key) => lerp(lerp(c00[key], c10[key], tx), lerp(c01[key], c11[key], tx), ty);
  const pickSourceCell = [c00, c10, c01, c11].reduce((best, cell) => {
    const score = cell?.hazard || 0;
    const bestScore = best?.hazard || 0;
    return score > bestScore ? cell : best;
  }, c00);

  const currentX = bilerp("currentX");
  const currentY = bilerp("currentY");
  const ambientX = bilerp("ambientX");
  const ambientY = bilerp("ambientY");
  const gravityX = bilerp("gravityX");
  const gravityY = bilerp("gravityY");
  const hazard = bilerp("hazard");
  const sample = normalizeFlowSample({
    currentX,
    currentY,
    gravityX,
    gravityY,
    hazard,
    sources: {
      wellId: pickSourceCell?.sourceWellId ?? null,
      anchorId: null,
    },
    confidence: 1,
  });

  return {
    currentX: bilerp("currentX"),
    currentY: bilerp("currentY"),
    ambientX,
    ambientY,
    ambientMagnitude: Math.min(
      MOVEMENT.player.thrustAccel * FABRIC.seededSea.ambientThrustCeiling,
      Math.hypot(ambientX, ambientY),
    ),
    gravityX: bilerp("gravityX"),
    gravityY: bilerp("gravityY"),
    hazard,
    ...sample,
  };
}

module.exports = {
  buildCoarseFlowField,
  sampleCoarseFlowField,
  serializeCoarseFlowField,
};

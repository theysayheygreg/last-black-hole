const { emptyFlowSample, normalizeFlowSample } = require("./flow-sample.cjs");
const { wellGravityMagnitude } = require("./sim/well-gravity.cjs");
const { wrapPosition, wrappedDelta } = require("./sim/world-geometry.cjs");
const { AMBIENT_FLOOR, BASE_THRUST_ACCEL, sampleSeededSea } = require("./sim/seeded-sea.cjs");
const FORCE_MIN_DIST = 0.15;

function wrapWorld(value, worldScale) {
  return wrapPosition(value, worldScale);
}

function worldDisplacement(a, b, worldScale) {
  return wrappedDelta(a, b, worldScale);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function signatureMultiplier(well, name) {
  const value = Number(well?.fabricSignature?.parameters?.[name]);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function orbitalCurrentSpeed(dist, strength, mass, falloff, maxRange) {
  if (dist < 0.001 || dist > maxRange) return 0;
  const safeDist = Math.max(dist, FORCE_MIN_DIST);
  const baseSpeed = strength * mass / Math.pow(safeDist, falloff);
  return baseSpeed * (1 - dist / maxRange);
}

function buildCoarseFlowField({
  worldScale,
  cellSize,
  wells = [],
  waveRings = [],
  wellCurrentScale = 0.3,
  wellCurrentFalloff = 1.5,
  wellCurrentMaxRange = 1.35,
  wellGravityScale = 0.6,
  wellGravityFalloff = 1.5,
  wellGravityMaxRange = 1.2,
  seededSea = null,
  waveShipPush = 0.8,
  waveWidth = 0.1,
  collapseParameters = {},
}) {
  const safeCellSize = Math.max(0.05, Number(cellSize) || 0.25);
  const columns = Math.max(1, Math.ceil(worldScale / safeCellSize));
  const rows = Math.max(1, Math.ceil(worldScale / safeCellSize));
  const cells = new Array(columns * rows);
  const seededSeaAmbientMultiplier = Number.isFinite(Number(collapseParameters.seededSeaAmbientMultiplier))
    ? Number(collapseParameters.seededSeaAmbientMultiplier)
    : 1;
  const liveWavePushMultiplier = Number.isFinite(Number(collapseParameters.liveWavePushMultiplier))
    ? Number(collapseParameters.liveWavePushMultiplier)
    : 1;
  const wellById = new Map(wells.map((well) => [String(well?.id ?? well?.name ?? ''), well]));
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
      let waveX = 0;
      let waveY = 0;
      let ambientX = 0;
      let ambientY = 0;
      let hazard = 0;
      let surf = 0;
      let signalShadow = 0;
      let sourceWellId = null;
      let sourceRingId = null;
      let bestCurrent = 0;
      let bestWave = 0;

      for (const well of wells) {
        const dx = worldDisplacement(wx, well.wx, worldScale);
        const dy = worldDisplacement(wy, well.wy, worldScale);
        const dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          hazard = Math.max(hazard, 1);
          continue;
        }

        const dir = well.orbitalDir || 1;
        const currentAccel = orbitalCurrentSpeed(
          dist,
          wellCurrentScale * signatureMultiplier(well, 'currentStrengthMultiplier'),
          well.mass || 1,
          wellCurrentFalloff,
          wellCurrentMaxRange * signatureMultiplier(well, 'currentReachMultiplier')
        );
        if (currentAccel > 0) {
          currentX += (-dy / dist) * dir * currentAccel;
          currentY += (dx / dist) * dir * currentAccel;
          if (Math.abs(currentAccel) > bestCurrent) {
            bestCurrent = Math.abs(currentAccel);
            sourceWellId = well.id ?? well.name ?? null;
          }
        }

        const gravityStrength = wellGravityMagnitude("player", dist, well.mass || 1, {
          strength: wellGravityScale * signatureMultiplier(well, 'gravityStrengthMultiplier'),
          falloff: wellGravityFalloff,
          maxRange: wellGravityMaxRange * signatureMultiplier(well, 'gravityReachMultiplier'),
        });
        gravityX += (dx / dist) * gravityStrength;
        gravityY += (dy / dist) * gravityStrength;
        if (currentAccel > 0) surf = Math.max(surf, clamp01(currentAccel / 2.5));

        const killRadius = well.killRadius || 0.04;
        const ringOuter = well.ringOuter || killRadius * 2.5;
        if (dist <= killRadius) {
          hazard = Math.max(hazard, 1);
        } else if (dist <= ringOuter) {
          const band = 1 - (dist - killRadius) / Math.max(0.001, ringOuter - killRadius);
          hazard = Math.max(hazard, clamp01(band));
          signalShadow = Math.max(signalShadow, clamp01(band * 0.7));
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

      const halfWidth = waveWidth * 0.5;
      for (const ring of waveRings) {
        const dx = worldDisplacement(ring.sourceWX, wx, worldScale);
        const dy = worldDisplacement(ring.sourceWY, wy, worldScale);
        const dist = Math.hypot(dx, dy);
        const distFromFront = Math.abs(dist - ring.radius);
        if (dist < 0.001 || distFromFront > halfWidth) continue;
        const bandPosition = distFromFront / halfWidth;
        const profile = Math.cos(bandPosition * Math.PI * 0.5);
        const sourceWell = ring.sourceWellId == null ? null : wellById.get(String(ring.sourceWellId));
        const ringMultiplier = signatureMultiplier(sourceWell, 'liveWavePushMultiplier');
        const accel = waveShipPush * liveWavePushMultiplier * ringMultiplier * (ring.amplitude || 0) * profile;
        waveX += (dx / dist) * accel;
        waveY += (dy / dist) * accel;
        hazard = Math.max(hazard, clamp01(accel));
        surf = Math.max(surf, clamp01(accel));
        if (Math.abs(accel) > bestWave) {
          bestWave = Math.abs(accel);
          sourceRingId = ring.id ?? ring.sourceId ?? null;
        }
      }

      cells[row * columns + col] = {
        currentX,
        currentY,
        ambientX,
        ambientY,
        gravityX,
        gravityY,
        waveX,
        waveY,
        hazard,
        surf,
        signalShadow,
        sourceWellId,
        sourceRingId,
      };
    }
  }

  return {
    worldScale,
    cellSize: safeCellSize,
    columns,
    rows,
    authorityFloor: BASE_THRUST_ACCEL * AMBIENT_FLOOR,
    cells,
  };
}

function serializeCoarseFlowField(field, tick = null) {
  if (!field) return null;
  const packed = Buffer.allocUnsafe(field.cells.length * 8);
  for (let index = 0; index < field.cells.length; index += 1) {
    const cell = field.cells[index];
    packed.writeFloatLE(Number(cell.currentX) || 0, index * 8);
    packed.writeFloatLE(Number(cell.currentY) || 0, index * 8 + 4);
  }
  return {
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
}

function sampleCoarseFlowField(field, wx, wy) {
  if (!field || !field.cells?.length) {
    const sample = emptyFlowSample();
    return {
      currentX: 0,
      currentY: 0,
      gravityX: 0,
      gravityY: 0,
      waveX: 0,
      waveY: 0,
      hazard: 0,
      surf: 0,
      signalShadow: 0,
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
    const score = (cell?.surf || 0) + (cell?.hazard || 0);
    const bestScore = (best?.surf || 0) + (best?.hazard || 0);
    return score > bestScore ? cell : best;
  }, c00);

  const currentX = bilerp("currentX");
  const currentY = bilerp("currentY");
  const ambientX = bilerp("ambientX");
  const ambientY = bilerp("ambientY");
  const gravityX = bilerp("gravityX");
  const gravityY = bilerp("gravityY");
  const waveX = bilerp("waveX");
  const waveY = bilerp("waveY");
  const hazard = bilerp("hazard");
  const surf = bilerp("surf");
  const signalShadow = bilerp("signalShadow");
  const sample = normalizeFlowSample({
    currentX,
    currentY,
    gravityX,
    gravityY,
    waveX,
    waveY,
    hazard,
    surf,
    signalShadow,
    sources: {
      wellId: pickSourceCell?.sourceWellId ?? null,
      ringId: pickSourceCell?.sourceRingId ?? null,
      anchorId: null,
    },
    confidence: 1,
  });

  return {
    currentX: bilerp("currentX"),
    currentY: bilerp("currentY"),
    ambientX,
    ambientY,
    ambientMagnitude: Math.min(BASE_THRUST_ACCEL * 0.30, Math.hypot(ambientX, ambientY)),
    gravityX: bilerp("gravityX"),
    gravityY: bilerp("gravityY"),
    waveX: bilerp("waveX"),
    waveY: bilerp("waveY"),
    hazard,
    surf,
    signalShadow,
    ...sample,
  };
}

module.exports = {
  buildCoarseFlowField,
  sampleCoarseFlowField,
  serializeCoarseFlowField,
};

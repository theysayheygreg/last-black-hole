function wrapWorld(value, worldScale) {
  let wrapped = value;
  while (wrapped < 0) wrapped += worldScale;
  while (wrapped >= worldScale) wrapped -= worldScale;
  return wrapped;
}

function worldDisplacement(a, b, worldScale) {
  let delta = b - a;
  if (delta > worldScale / 2) delta -= worldScale;
  if (delta < -worldScale / 2) delta += worldScale;
  return delta;
}

function buildCoarseFlowField({
  worldScale,
  cellSize,
  wells = [],
  waveRings = [],
  wellCurrentScale = 0.3,
  wellGravityScale = 0.025,
  wellGravityFalloff = 1.8,
  waveShipPush = 0.8,
  waveWidth = 0.1,
}) {
  const safeCellSize = Math.max(0.05, Number(cellSize) || 0.25);
  const columns = Math.max(1, Math.ceil(worldScale / safeCellSize));
  const rows = Math.max(1, Math.ceil(worldScale / safeCellSize));
  const cells = new Array(columns * rows);

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
      let hazard = 0;

      for (const well of wells) {
        const dx = worldDisplacement(wx, well.wx, worldScale);
        const dy = worldDisplacement(wy, well.wy, worldScale);
        const dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          hazard = Math.max(hazard, 1);
          continue;
        }

        const dir = well.orbitalDir || 1;
        const currentStrength = (well.mass || 1) / Math.pow(dist, 1.5);
        currentX += (-dy / dist) * dir * currentStrength * wellCurrentScale;
        currentY += (dx / dist) * dir * currentStrength * wellCurrentScale;

        const gravityStrength = (wellGravityScale * (well.mass || 1)) / Math.pow(Math.max(dist, 0.02), wellGravityFalloff);
        gravityX += (dx / dist) * gravityStrength;
        gravityY += (dy / dist) * gravityStrength;

        const killRadius = well.killRadius || 0.04;
        const ringOuter = well.ringOuter || killRadius * 2.5;
        if (dist <= killRadius) {
          hazard = Math.max(hazard, 1);
        } else if (dist <= ringOuter) {
          const band = 1 - (dist - killRadius) / Math.max(0.001, ringOuter - killRadius);
          hazard = Math.max(hazard, Math.max(0, Math.min(1, band)));
        }
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
        const accel = waveShipPush * (ring.amplitude || 0) * profile;
        waveX += (dx / dist) * accel;
        waveY += (dy / dist) * accel;
        hazard = Math.max(hazard, Math.max(0, Math.min(1, accel)));
      }

      cells[row * columns + col] = {
        currentX,
        currentY,
        gravityX,
        gravityY,
        waveX,
        waveY,
        hazard,
      };
    }
  }

  return {
    worldScale,
    cellSize: safeCellSize,
    columns,
    rows,
    cells,
  };
}

function sampleCoarseFlowField(field, wx, wy) {
  if (!field || !field.cells?.length) {
    return {
      currentX: 0,
      currentY: 0,
      gravityX: 0,
      gravityY: 0,
      waveX: 0,
      waveY: 0,
      hazard: 0,
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

  return {
    currentX: bilerp("currentX"),
    currentY: bilerp("currentY"),
    gravityX: bilerp("gravityX"),
    gravityY: bilerp("gravityY"),
    waveX: bilerp("waveX"),
    waveY: bilerp("waveY"),
    hazard: bilerp("hazard"),
  };
}

module.exports = {
  buildCoarseFlowField,
  sampleCoarseFlowField,
};

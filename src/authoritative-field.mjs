import { worldVelToFluid, worldYToFluidTextureV } from './coords.js';

const EPSILON = 1e-9;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function wrap(value, size) {
  return ((value % size) + size) % size;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function decodePackedCurrent(field) {
  if (!field || field.encoding !== 'float32le-current-y-down-row-major-v1') return null;
  if (field._packedCurrent) return field._packedCurrent;
  if (typeof field.data !== 'string') return null;
  const binary = typeof atob === 'function'
    ? atob(field.data)
    : (typeof Buffer !== 'undefined' ? Buffer.from(field.data, 'base64').toString('binary') : '');
  if (!binary) return null;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const view = new DataView(bytes.buffer);
  const count = Math.max(0, Math.floor(finite(field.cellCount, 0)));
  const current = new Float32Array(count * 2);
  for (let index = 0; index < current.length && index * 4 + 4 <= view.byteLength; index += 1) {
    current[index] = view.getFloat32(index * 4, true);
  }
  Object.defineProperty(field, '_packedCurrent', { value: current, enumerable: false });
  return current;
}

/** Read a packed server field in stable row-major order. */
export function sampleAuthoritativeCurrent(field, u, v) {
  if (!field || ((!Array.isArray(field.cells) || field.cells.length === 0)
    && typeof field.data !== 'string')) return [0, 0];

  const columns = Math.max(1, Math.floor(finite(field.columns, 1)));
  const rows = Math.max(1, Math.floor(finite(field.rows, 1)));
  const x = wrap(finite(u), 1) * columns;
  const y = wrap(finite(v), 1) * rows;
  const x0 = Math.floor(x) % columns;
  const y0 = Math.floor(y) % rows;
  const x1 = (x0 + 1) % columns;
  const y1 = (y0 + 1) % rows;
  const tx = x - Math.floor(x);
  const ty = y - Math.floor(y);
  const packed = decodePackedCurrent(field);
  if (packed) {
    const currentAt = (row, column) => {
      const offset = (row * columns + column) * 2;
      return [packed[offset] || 0, packed[offset + 1] || 0];
    };
    const c00 = currentAt(y0, x0);
    const c10 = currentAt(y0, x1);
    const c01 = currentAt(y1, x0);
    const c11 = currentAt(y1, x1);
    return [
      lerp(lerp(c00[0], c10[0], tx), lerp(c01[0], c11[0], tx), ty),
      lerp(lerp(c00[1], c10[1], tx), lerp(c01[1], c11[1], tx), ty),
    ];
  }

  const cell = (row, column) => field.cells[row * columns + column] || {};
  const c00 = cell(y0, x0);
  const c10 = cell(y0, x1);
  const c01 = cell(y1, x0);
  const c11 = cell(y1, x1);
  return [
    lerp(lerp(finite(c00.currentX), finite(c10.currentX), tx), lerp(finite(c01.currentX), finite(c11.currentX), tx), ty),
    lerp(lerp(finite(c00.currentY), finite(c10.currentY), tx), lerp(finite(c01.currentY), finite(c11.currentY), tx), ty),
  ];
}

/** Register world-Y rows as GPU Y-up velocity without a second convention. */
export function resampleAuthoritativeField(field, resolution) {
  const size = Math.max(1, Math.floor(finite(resolution, 1)));
  const data = new Float32Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    const worldV = worldYToFluidTextureV((row + 0.5) / size);
    for (let column = 0; column < size; column += 1) {
      const [currentX, currentY] = sampleAuthoritativeCurrent(field, (column + 0.5) / size, worldV);
      const offset = (row * size + column) * 4;
      const [fluidX, fluidY] = worldVelToFluid(currentX, currentY);
      data[offset] = fluidX;
      data[offset + 1] = fluidY;
      data[offset + 2] = 0;
      data[offset + 3] = 1;
    }
  }
  return data;
}

export function authorityFloor(field, fallback = 2.5 * 0.30) {
  return Math.max(0, finite(field?.authorityFloor, fallback));
}

/** Keep presentation detail bounded so it cannot reverse an authoritative flow. */
export function composeBoundedVelocity(authority, detail, floor) {
  const ax = finite(authority?.[0]);
  const ay = finite(authority?.[1]);
  let dx = finite(detail?.[0]);
  let dy = finite(detail?.[1]);
  const limit = Math.max(0, finite(floor));
  const detailMagnitude = Math.hypot(dx, dy);
  if (detailMagnitude > limit && detailMagnitude > EPSILON) {
    const scale = limit / detailMagnitude;
    dx *= scale;
    dy *= scale;
  }
  return [ax + dx, ay + dy];
}

export function directionAgrees(authority, rendered, floor) {
  const ax = finite(authority?.[0]);
  const ay = finite(authority?.[1]);
  const rx = finite(rendered?.[0]);
  const ry = finite(rendered?.[1]);
  if (Math.hypot(ax, ay) <= Math.max(0, finite(floor))) return true;
  return (ax * rx) + (ay * ry) > 0;
}

import * as THREE from '../../../node_modules/three/build/three.module.js';
import { makeCategoryAnnotationPlan } from './category-grammar.js';
import {
  createAnnotationLabelLayoutState,
  placeAnnotationLabels,
  resetAnnotationLabelLayoutState,
} from '../../presentation/annotation-label-layout.js';
import {
  clampViewportRayToRim,
  scenePointToViewport,
  sceneRadiusToViewport,
  viewportPointToScene,
} from '../world-projection.js';

const TURN = Math.PI * 2;
const CATEGORY_COLORS = Object.freeze({
  noise: 0x62dada,
  portal: 0x62e6ee,
  exfil: 0xd9ffff,
  grapple: 0xb8dcff,
  salvage: 0xe2cf88,
  vessel: 0xff8d78,
  inhibitor: 0xff3eb5,
});

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }

function safeText(value) {
  const text = String(value || '').trim();
  return text && text.toLowerCase() !== 'undefined' && text.toLowerCase() !== 'null' ? text : '';
}

function arcSegments(extentPx, startTurn, endTurn, steps = 36) {
  const radius = extentPx / 2;
  const count = Math.max(2, Math.ceil(steps * (endTurn - startTurn)));
  const vertices = [];
  for (let index = 0; index < count; index++) {
    const a = (startTurn + (endTurn - startTurn) * index / count) * TURN;
    const b = (startTurn + (endTurn - startTurn) * (index + 1) / count) * TURN;
    vertices.push([Math.cos(a) * radius, Math.sin(a) * radius], [Math.cos(b) * radius, Math.sin(b) * radius]);
  }
  return vertices;
}

function pieceSegments(piece) {
  if (piece.kind === 'ring' || piece.kind === 'arc' || piece.kind === 'progress-sector') {
    return arcSegments(piece.extentPx, piece.startTurn || 0, piece.endTurn ?? 1);
  }
  if (piece.kind === 'dashed-ring' || piece.kind === 'segmented-ring') {
    return piece.segments.flatMap((segment) => arcSegments(piece.extentPx, segment.startTurn, segment.endTurn, 30));
  }
  if (piece.kind === 'line') return [[-piece.lengthPx / 2, 0], [piece.lengthPx / 2, 0]];
  if (piece.kind === 'tapered-pointer') {
    const half = piece.baseWidthPx / 2;
    return [[-half, piece.lengthPx / 2], [0, -piece.lengthPx / 2], [0, -piece.lengthPx / 2], [half, piece.lengthPx / 2]];
  }
  if (piece.kind === 'corner-bracket') {
    const r = piece.extentPx / 2;
    const n = piece.extentPx * piece.cornerFraction;
    return [
      [-r, -r + n], [-r, -r], [-r, -r], [-r + n, -r],
      [r - n, -r], [r, -r], [r, -r], [r, -r + n],
      [r, r - n], [r, r], [r, r], [r - n, r],
      [-r + n, r], [-r, r], [-r, r], [-r, r - n],
    ];
  }
  if (piece.kind === 'repeated-notches') {
    const outer = piece.extentPx / 2;
    const inner = outer * (piece.inward ? 0.68 : 0.82);
    return piece.turns.flatMap((turn) => {
      const angle = turn * TURN;
      return [[Math.cos(angle) * inner, Math.sin(angle) * inner], [Math.cos(angle) * outer, Math.sin(angle) * outer]];
    });
  }
  if (piece.kind === 'outline') {
    const points = piece.points;
    const vertices = [];
    for (let i = 0; i < points.length - 1; i++) vertices.push([points[i].u, points[i].v], [points[i + 1].u, points[i + 1].v]);
    if (piece.closed) vertices.push([points.at(-1).u, points.at(-1).v], [points[0].u, points[0].v]);
    return vertices;
  }
  return [];
}

export class AnnotationPresentation {
  constructor({ group }) {
    this.group = group;
    this.group.name = 'analytic-world-annotation-layer';
    this.materials = Object.fromEntries(Object.entries(CATEGORY_COLORS).map(([category, color]) => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
      material.name = `annotation:${category}`;
      return [category, material];
    }));
    this.linePool = [];
    this.lineCursor = 0;
    this.labelPool = [];
    this.labelCursor = 0;
    this.labelState = createAnnotationLabelLayoutState();
    this.stats = { submitted: 0, labels: 0, rimContacts: 0 };
  }

  reset() {
    this.lineCursor = 0;
    this.labelCursor = 0;
    for (const line of this.linePool) line.visible = false;
    for (const sprite of this.labelPool) sprite.visible = false;
    resetAnnotationLabelLayoutState(this.labelState);
  }

  beginFrame() {
    this.lineCursor = 0;
    this.labelCursor = 0;
    for (const line of this.linePool) line.visible = false;
    for (const sprite of this.labelPool) sprite.visible = false;
    this.stats = { submitted: 0, labels: 0, rimContacts: 0 };
  }

  _line(category, anchorPx, verticesPx, viewport, rotation = 0, alpha = 1, strokePx = 2) {
    if (!verticesPx.length) return null;
    let line = this.linePool[this.lineCursor];
    if (!line) {
      line = new THREE.Mesh(new THREE.BufferGeometry(), this.materials[category] || this.materials.noise);
      line.frustumCulled = false;
      this.linePool.push(line);
      this.group.add(line);
    }
    this.lineCursor += 1;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const values = [];
    const halfWidth = Math.max(1, Number(strokePx) || 2) / 2;
    for (let index = 0; index < verticesPx.length; index += 2) {
      const [ax, ay] = verticesPx[index];
      const [bx, by] = verticesPx[index + 1];
      const arx = ax * cos - ay * sin;
      const ary = ax * sin + ay * cos;
      const brx = bx * cos - by * sin;
      const bry = bx * sin + by * cos;
      const length = Math.max(1e-6, Math.hypot(brx - arx, bry - ary));
      const nx = -(bry - ary) / length * halfWidth;
      const ny = (brx - arx) / length * halfWidth;
      const corners = [
        [arx + nx, ary + ny], [arx - nx, ary - ny], [brx + nx, bry + ny],
        [brx + nx, bry + ny], [arx - nx, ary - ny], [brx - nx, bry - ny],
      ];
      for (const [x, y] of corners) {
        const scene = viewportPointToScene({ x: anchorPx.x + x, y: anchorPx.y + y }, viewport.width, viewport.height, viewport.aspect);
        values.push(scene.x, scene.y, 0);
      }
    }
    line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
    line.material = this.materials[category] || this.materials.noise;
    line.renderOrder = 8;
    line.visible = true;
    this.stats.submitted += 1;
    return line;
  }

  _plan(category, anchorPx, options, viewport, rotation = 0, alpha = 1) {
    const plan = makeCategoryAnnotationPlan(category, options);
    for (const piece of plan.pieces) this._line(category, anchorPx, pieceSegments(piece), viewport, rotation, alpha, piece.weight.strokePx);
  }

  _label(label, viewport) {
    const text = safeText(label.text);
    if (!text || typeof document === 'undefined') return;
    let sprite = this.labelPool[this.labelCursor];
    if (!sprite) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 64;
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
      sprite = new THREE.Sprite(material);
      sprite.userData.canvas = canvas;
      sprite.userData.texture = texture;
      this.labelPool.push(sprite);
      this.group.add(sprite);
    }
    this.labelCursor += 1;
    if (sprite.userData.text !== text) {
      const canvas = sprite.userData.canvas;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '700 24px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8f5f2';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      sprite.userData.texture.needsUpdate = true;
      sprite.userData.text = text;
    }
    const scene = viewportPointToScene({ x: label.x, y: label.y }, viewport.width, viewport.height, viewport.aspect);
    sprite.position.set(scene.x, scene.y, 0);
    sprite.scale.set(label.bounds.w / viewport.width * 2 * viewport.aspect, label.bounds.h / viewport.height * 2, 1);
    sprite.renderOrder = 9;
    sprite.visible = true;
    this.stats.labels += 1;
  }

  update(frame, { projection, viewportWidth = 1280, viewportHeight = 800, aspect = 1, reservedRegions = [] } = {}) {
    this.beginFrame();
    if (frame.phase !== 'playing' || !projection) return this.getStats();
    const viewportClass = viewportWidth <= 1280 && viewportHeight <= 800 ? 'deck' : 'desktop';
    const viewport = { width: viewportWidth, height: viewportHeight, aspect, viewportClass };
    const toPx = (world) => scenePointToViewport(projection.project(world.x, world.y), viewportWidth, viewportHeight, aspect);
    const isOnScreen = (point, margin = 32) => point.x >= -margin && point.x <= viewportWidth + margin
      && point.y >= -margin && point.y <= viewportHeight + margin;
    const extentFor = (entity, minimum = 52) => {
      const radius = projection.radius(Math.max(0.001, entity.radius || entity.visual?.coreRadius || 0.04), entity.radiusMode || 'world');
      const px = sceneRadiusToViewport(radius, viewportWidth, viewportHeight, aspect);
      return Math.max(minimum, Math.min(150, Math.max(px.x, px.y) * 2.4));
    };
    const labels = [];
    const addLabel = (entity, category, order, placement = 'moving') => {
      const text = safeText(entity.label);
      if (!text) return;
      const anchor = toPx(entity.world);
      if (!isOnScreen(anchor)) return;
      const extentPx = extentFor(entity, 42);
      labels.push({ id: `label:${entity.id}`, order, anchor, interactionRadius: extentPx / 2, width: Math.min(230, Math.max(72, text.length * 9)), height: 24, text, placement });
    };

    const player = frame.localPlayer;
    if (player?.movement?.noise?.audibleRadiusMeters > 0) {
      const anchor = toPx(player.world);
      const extentPx = Math.max(86, Math.min(260, player.movement.noise.audibleRadiusMeters / 18));
      this._plan('noise', anchor, { extentPx, viewportClass }, viewport, 0, player.movement.noise.trend === 'falling' ? 0.55 : 0.82);
    }
    for (const portal of frame.world?.portals || []) {
      const anchor = toPx(portal.world);
      if (!isOnScreen(anchor, 0)) continue;
      this._plan(portal.final ? 'exfil' : 'portal', anchor, {
        extentPx: extentFor(portal, 72), viewportClass,
        collapseProgress: clamp01(portal.collapseProgress), apertureProgress: clamp01(portal.apertureProgress),
      }, viewport, 0, portal.opacity);
      addLabel(portal, 'portal', 20, 'fixed');
    }
    for (const wreck of frame.world?.wrecks || []) {
      if (wreck.looted) continue;
      const anchor = toPx(wreck.world);
      if (!isOnScreen(anchor, 0)) continue;
      this._plan('salvage', anchor, { extentPx: extentFor(wreck, 58), viewportClass }, viewport);
      addLabel(wreck, 'salvage', 40);
    }
    for (const vessel of [...(frame.world?.remotePlayers || []), ...(frame.world?.scavengers || [])]) {
      const anchor = toPx(vessel.world);
      if (!isOnScreen(anchor, 0)) continue;
      this._plan('vessel', anchor, { extentPx: extentFor(vessel, 62), viewportClass, hostile: vessel.hint?.category === 'threat' }, viewport);
      addLabel(vessel, 'vessel', 60);
    }
    for (const inhibitor of frame.world?.inhibitors || []) {
      const anchor = toPx(inhibitor.world);
      if (!isOnScreen(anchor, 0)) continue;
      this._plan(inhibitor.kind === 'vessel' ? 'vessel' : 'inhibitor', anchor, { extentPx: extentFor(inhibitor, 68), viewportClass, hostile: true }, viewport);
      addLabel(inhibitor, 'inhibitor', 70);
    }
    const sling = player?.slingshot;
    const slingAnchor = sling?.anchor || sling?.affordance || sling?.telegraph?.aimCue?.anchor;
    if (slingAnchor?.world) {
      const anchor = toPx(slingAnchor.world);
      if (isOnScreen(anchor, 0)) {
        this._plan('grapple', anchor, { extentPx: Math.max(92, Math.min(180, extentFor({ ...slingAnchor, radius: slingAnchor.range }, 92))), viewportClass, attached: Boolean(sling.engaged) }, viewport);
        if (sling.engaged) {
          const shipPx = toPx(player.world);
          const dx = shipPx.x - anchor.x;
          const dy = shipPx.y - anchor.y;
          this._line('grapple', anchor, [[0, 0], [Math.hypot(dx, dy), 0]], viewport, Math.atan2(dy, dx), 1, viewportClass === 'deck' ? 3 : 2);
        }
      }
    }
    for (const contact of frame.annotations?.audibleContacts || []) {
      const sourcePx = toPx(contact.world);
      const rim = clampViewportRayToRim(sourcePx, viewportWidth, viewportHeight, viewportClass === 'deck' ? 34 : 26);
      if (!rim) continue;
      const category = contact.identified
        ? (contact.identity === 'EXFIL' ? 'exfil' : ['VESSEL', 'VESSEL THRUST'].includes(contact.identity) ? 'vessel' : 'inhibitor')
        : 'noise';
      if (category === 'noise') this._plan('noise', rim, { extentPx: 34 + Math.min(28, contact.magnitude * 18), magnitude: contact.magnitude, viewportClass }, viewport, rim.angle);
      else this._plan(category, rim, { extentPx: 48, viewportClass, hostile: category !== 'exfil' }, viewport, rim.angle);
      labels.push({ id: `rim:${contact.id}`, order: 5, anchor: rim, interactionRadius: 22, width: 132, height: 24, text: contact.identified ? contact.identity : `NOISE ${Math.round(contact.rangeMeters)}m`, placement: 'moving' });
      this.stats.rimContacts += 1;
    }
    for (const landmark of [...(frame.world?.wells || []), ...(frame.world?.stars || []), ...(frame.world?.planetoids || [])]) addLabel(landmark, 'landmark', 100, 'fixed');
    const layout = placeAnnotationLabels(labels, {
      width: viewportWidth, height: viewportHeight, viewportClass,
      reservedRegions,
    }, this.labelState);
    for (const label of layout.placed) this._label(label, viewport);
    return this.getStats();
  }

  getStats() { return Object.freeze({ ...this.stats, pooledLines: this.linePool.length, pooledLabels: this.labelPool.length }); }

  dispose() {
    for (const line of this.linePool) line.geometry.dispose();
    for (const sprite of this.labelPool) {
      sprite.userData.texture?.dispose();
      sprite.material?.dispose();
    }
    for (const material of Object.values(this.materials)) material.dispose();
    this.linePool.length = 0;
    this.labelPool.length = 0;
  }
}

// src/render-three/vfx/vfx-manager.js
//
// Small bounded VFX manager for the first Three effects. It consumes plain
// events, owns particle lifetime/pools, and reports stats back to the harness.

import * as THREE from '../../../node_modules/three/build/three.module.js';
import { isTitleGlyphFaultEvent } from './vfx-events.js';
import { resolveVfxBudget } from './vfx-quality.js';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hashUnit(seed) {
  const raw = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return raw - Math.floor(raw);
}

function seedNumber(seed = '') {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeDiamondGeometry() {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.5, 0,
    0.5, 0, 0,
    0, -0.5, 0,
    -0.5, 0, 0,
  ], 3));
  geom.setIndex([0, 1, 2, 0, 2, 3]);
  return geom;
}

function makeMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export class VfxManager {
  constructor({ screenGroup, immediateGroup, renderQuality = 'rich' }) {
    this.screenGroup = screenGroup;
    this.immediateGroup = immediateGroup;
    this.renderQuality = renderQuality;
    this.particles = [];
    this.meshPool = [];
    this.recentEvents = new Map();
    this.droppedTotal = 0;
    this.expiredTotal = 0;
    this.emittedTotal = 0;
    this.resetCount = 0;
    this.disposeCount = 0;
    this.disposed = false;
    this.geometries = {
      ember: makeDiamondGeometry(),
      splinter: new THREE.PlaneGeometry(1, 1),
    };
    this.lastStats = this._emptyStats();
  }

  _emptyStats() {
    return {
      enabled: true,
      quality: this.renderQuality,
      activeParticles: 0,
      screenParticles: 0,
      immediateParticles: 0,
      poolCapacity: this.meshPool.length,
      particleBudget: 0,
      emittedEvents: 0,
      emittedParticles: 0,
      expiredParticles: 0,
      droppedParticles: 0,
      droppedTotal: this.droppedTotal,
      expiredTotal: this.expiredTotal,
      emittedTotal: this.emittedTotal,
      resetCount: this.resetCount,
      disposeCount: this.disposeCount,
      disposed: this.disposed,
    };
  }

  reset() {
    if (this.disposed) return;
    this.resetCount += 1;
    for (const particle of this.particles) {
      particle.mesh.visible = false;
      this.meshPool.push(particle.mesh);
    }
    this.particles = [];
    this.recentEvents.clear();
    this.lastStats = this._emptyStats();
  }

  dispose() {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
    this.disposeCount += 1;
    this.lastStats = this._emptyStats();
  }

  _getMesh(kind, group, color) {
    const mesh = this.meshPool.pop() || new THREE.Mesh(
      this.geometries[kind] || this.geometries.ember,
      makeMaterial(color)
    );
    mesh.geometry = this.geometries[kind] || this.geometries.ember;
    if (mesh.parent !== group) group.add(mesh);
    mesh.material.color.setHex(color);
    mesh.material.opacity = 1;
    mesh.material.blending = THREE.AdditiveBlending;
    mesh.frustumCulled = false;
    mesh.renderOrder = kind === 'splinter' ? 86 : 84;
    mesh.visible = true;
    return mesh;
  }

  _spawnParticle(particle, budget, frameStats) {
    if (this.particles.length >= budget) {
      this.droppedTotal += 1;
      frameStats.droppedParticles += 1;
      return;
    }
    particle.mesh = this._getMesh(particle.kind, particle.group, particle.color);
    this.particles.push(particle);
    frameStats.emittedParticles += 1;
  }

  _consumeEventOnce(event, totalTime) {
    const id = event.eventId;
    if (!id) return true;
    const last = this.recentEvents.get(id);
    if (Number.isFinite(last) && totalTime - last < 0.45) return false;
    this.recentEvents.set(id, totalTime);
    return true;
  }

  _emitTitleGlyphFault(event, budget, frameStats, config, resolvedBudget) {
    if (!config.titleCorruption) return;
    const intensity = clamp(event.intensity * (Number(config.globalIntensity) || 1), 0, 1.5);
    const seed = seedNumber(event.seed || event.eventId || 'title');
    const heavyScale = event.heavy ? 1.55 : 1.0;
    const burstScale = resolvedBudget.titleBurstScale * heavyScale;
    const emberCount = Math.max(1, Math.round((2 + intensity * 5) * burstScale));
    const baseX = event.screenX;
    const baseY = event.screenY;
    const width = Math.max(6, event.glyphWidth);
    const height = Math.max(12, event.glyphHeight);

    frameStats.emittedEvents += 1;
    this.emittedTotal += 1;

    for (let i = 0; i < emberCount; i++) {
      const r0 = hashUnit(seed + i * 17 + 1);
      const r1 = hashUnit(seed + i * 17 + 2);
      const r2 = hashUnit(seed + i * 17 + 3);
      const r3 = hashUnit(seed + i * 17 + 4);
      const magenta = i % 3 !== 1;
      this._spawnParticle({
        kind: 'ember',
        group: this.screenGroup,
        x: baseX + (r0 - 0.5) * width * 0.95,
        y: baseY - height * (0.40 + r1 * 0.32),
        vx: (r2 - 0.5) * 54 * (0.7 + intensity),
        vy: (-42 - r3 * 62) * (0.65 + intensity * 0.45),
        age: 0,
        life: 0.34 + r1 * 0.46,
        sizeX: (2.5 + r0 * 5.5) * (0.8 + intensity * 0.45),
        sizeY: (2.5 + r0 * 5.5) * (0.8 + intensity * 0.45),
        rotation: r2 * Math.PI,
        spin: (r3 - 0.5) * 8,
        color: magenta ? 0xff36c8 : 0xdaf9ff,
        alpha: magenta ? 0.72 : 0.48,
      }, budget, frameStats);
    }

    if (intensity > 0.36) {
      const splinterCount = event.heavy ? 3 : 1 + Math.round(intensity);
      for (let i = 0; i < splinterCount; i++) {
        const r0 = hashUnit(seed + i * 31 + 8);
        const r1 = hashUnit(seed + i * 31 + 9);
        this._spawnParticle({
          kind: 'splinter',
          group: this.screenGroup,
          x: baseX + (r0 - 0.5) * width * 0.8,
          y: baseY - height * (0.18 + r1 * 0.42),
          vx: (r0 - 0.5) * 92,
          vy: (r1 - 0.5) * 10,
          age: 0,
          life: 0.12 + hashUnit(seed + i * 31 + 10) * 0.18,
          sizeX: width * (0.72 + r0 * 1.25),
          sizeY: 1.4 + r1 * 2.8,
          rotation: (r1 - 0.5) * 0.035,
          spin: 0,
          color: i % 2 ? 0xff36c8 : 0x73f6ff,
          alpha: 0.42 + intensity * 0.22,
        }, budget, frameStats);
      }
    }
  }

  update({ dt = 1 / 60, totalTime = 0, viewportWidth = 1280, viewportHeight = 800, events = [], config = {} } = {}) {
    const enabled = config.enabled !== false;
    const resolvedBudget = resolveVfxBudget(config, this.renderQuality);
    const budget = enabled ? Math.max(0, Math.floor(resolvedBudget.particleBudget)) : 0;
    const frameStats = this._emptyStats();
    frameStats.enabled = enabled;
    frameStats.quality = resolvedBudget.quality;
    frameStats.particleBudget = budget;

    for (const [id, seenAt] of Array.from(this.recentEvents.entries())) {
      if (totalTime - seenAt > 1.2) this.recentEvents.delete(id);
    }

    if (!enabled || budget <= 0) {
      this.reset();
      this.lastStats = { ...frameStats, enabled, quality: resolvedBudget.quality, particleBudget: budget };
      return this.lastStats;
    }

    for (const event of events || []) {
      if (!isTitleGlyphFaultEvent(event)) continue;
      if (!this._consumeEventOnce(event, totalTime)) continue;
      this._emitTitleGlyphFault(event, budget, frameStats, config, resolvedBudget);
    }

    const live = [];
    const aspect = Math.max(0.001, viewportWidth / Math.max(1, viewportHeight));
    const toSceneX = (x) => ((x / Math.max(1, viewportWidth)) * 2 - 1) * aspect;
    const toSceneY = (y) => -((y / Math.max(1, viewportHeight)) * 2 - 1);
    const pxToSceneX = (px) => (px / Math.max(1, viewportWidth)) * 2 * aspect;
    const pxToSceneY = (px) => (px / Math.max(1, viewportHeight)) * 2;

    for (const particle of this.particles) {
      particle.age += Math.max(0, Math.min(0.05, dt));
      if (particle.age >= particle.life) {
        particle.mesh.visible = false;
        this.meshPool.push(particle.mesh);
        frameStats.expiredParticles += 1;
        this.expiredTotal += 1;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rotation += particle.spin * dt;
      const t = particle.age / Math.max(0.001, particle.life);
      const fade = Math.sin((1 - t) * Math.PI * 0.5);
      particle.mesh.position.set(toSceneX(particle.x), toSceneY(particle.y), 0.34);
      particle.mesh.scale.set(pxToSceneX(particle.sizeX), pxToSceneY(particle.sizeY), 1);
      particle.mesh.rotation.z = particle.rotation;
      particle.mesh.material.opacity = particle.alpha * fade;
      particle.mesh.visible = true;
      live.push(particle);
    }

    this.particles = live;
    frameStats.activeParticles = live.length;
    frameStats.screenParticles = live.filter((p) => p.group === this.screenGroup).length;
    frameStats.immediateParticles = live.length - frameStats.screenParticles;
    frameStats.poolCapacity = this.meshPool.length + live.length;
    frameStats.droppedTotal = this.droppedTotal;
    this.lastStats = frameStats;
    return this.lastStats;
  }

  getStats() {
    return this.lastStats || this._emptyStats();
  }
}

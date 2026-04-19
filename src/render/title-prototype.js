// src/render/title-prototype.js
//
// Standalone title-screen prototype. Loaded by title-prototype.html, not by
// the main game. The main game's render path is untouched — this is the
// "throwaway prototype" described in docs/reference/GRADIENT-BANG-ANALYSIS.md
// and confirmed in docs/project/2026-04-19-title-screen-render-pipeline-brief.md.
//
// Purpose: prove the hybrid render pipeline works in LBH's tree at 60fps
// before integrating with the main render path. First pass deliberately
// minimal — nebula background + exposure + tint post-passes + DOM title.
// Does NOT include the fluid sim yet. That integration is the next step
// once this proves out.
//
// Key bindings (read tuning-panel.hint in the HTML for the live legend):
//   [1/2] adjust nebula intensity
//   [3/4] adjust domain scale
//   [5/6] adjust exposure
//   [7/8] adjust tint strength
//   [r]   reset all
//   [space] trigger exposure fade cycle (0 → 1 → 1)

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import {
  nebulaVertexShader,
  nebulaFragmentShader,
  NEBULA_DEFAULTS,
} from './shaders/nebula.glsl.js';

// --- DOM references ---
const canvas = document.getElementById('render-canvas');
const elIntensity = document.getElementById('nebula-intensity');
const elDomain = document.getElementById('nebula-domain');
const elExposure = document.getElementById('exposure-val');
const elTint = document.getElementById('tint-val');
const elFps = document.getElementById('fps-text');

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);

// --- Scene + camera ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 0, 0);
camera.lookAt(0, 0, -1);

// --- Nebula layer (inside-out sphere) ---
// BackSide so the camera inside the sphere sees the inner surface. The
// nebula shader uses vWorldPosition to derive a spherical direction,
// which matches naturally. Radius is large relative to near-plane but
// small enough to keep the fractal sampling stable.
const nebulaUniforms = {
  uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  uIntensity: { value: NEBULA_DEFAULTS.uIntensity },
  uTint: { value: new THREE.Vector3(...NEBULA_DEFAULTS.uTint) },
  uNebulaColorPrimary: {
    value: new THREE.Vector3(...NEBULA_DEFAULTS.uNebulaColorPrimary),
  },
  uNebulaColorSecondary: {
    value: new THREE.Vector3(...NEBULA_DEFAULTS.uNebulaColorSecondary),
  },
  uIterPrimary: { value: NEBULA_DEFAULTS.uIterPrimary },
  uIterSecondary: { value: NEBULA_DEFAULTS.uIterSecondary },
  uDomainScale: { value: NEBULA_DEFAULTS.uDomainScale },
  uWarpOffset: { value: new THREE.Vector3(...NEBULA_DEFAULTS.uWarpOffset) },
  uWarpDecay: { value: NEBULA_DEFAULTS.uWarpDecay },
};

const nebulaMaterial = new THREE.ShaderMaterial({
  vertexShader: nebulaVertexShader,
  fragmentShader: nebulaFragmentShader,
  uniforms: nebulaUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  transparent: false,
});

const nebulaMesh = new THREE.Mesh(
  new THREE.SphereGeometry(500, 64, 32),
  nebulaMaterial
);
scene.add(nebulaMesh);


// --- Post-processing chain ---
const composer = new EffectComposer(renderer);
composer.setSize(window.innerWidth, window.innerHeight);

// URL params for selectively disabling passes — diagnostic knobs
const params = new URLSearchParams(window.location.search);
const skipExposure = params.has('noExposure');
const skipTint = params.has('noTint');

composer.addPass(new RenderPass(scene, camera));

// Exposure pass — global luminance multiply. Drives the title entry
// fade-in, will drive the gameplay death-screen linger, etc.
const exposureUniforms = {
  tDiffuse: { value: null },
  uExposure: { value: 0.0 }, // start at 0 and fade in on load
};
const exposurePass = new ShaderPass({
  uniforms: exposureUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(c.rgb * uExposure, c.a);
    }
  `,
});
if (!skipExposure) composer.addPass(exposurePass);

// IMPORTANT: Three.js ShaderPass deep-clones the uniforms object passed to
// its constructor. Mutating our local `exposureUniforms` (above) does NOT
// update the shader — we must mutate `exposurePass.uniforms` directly.
// Re-alias so the rest of the module is pointing at the live uniforms.
const liveExposureUniforms = exposurePass.uniforms;

// Tint pass — multiplicative color grade. Drives cosmic-signature
// palettes, inhibitor approach magenta, extraction gold flash.
const tintUniforms = {
  tDiffuse: { value: null },
  uTintColor: { value: new THREE.Vector3(1, 1, 1) },
  uTintStrength: { value: 0.0 },
};
const tintPass = new ShaderPass({
  uniforms: tintUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 uTintColor;
    uniform float uTintStrength;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 tinted = mix(c.rgb, c.rgb * uTintColor, uTintStrength);
      gl_FragColor = vec4(tinted, c.a);
    }
  `,
});
if (!skipTint) composer.addPass(tintPass);

// Same story as exposurePass — re-alias the cloned uniforms.
const liveTintUniforms = tintPass.uniforms;

// --- Resize ---
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  nebulaUniforms.uResolution.value.set(w, h);
}
window.addEventListener('resize', onResize);

// --- Entry exposure fade-in ---
// gradient-bang's title is continuously alive. But an entry fade gives
// the player a beat of "reveal" on first load — matches the feeling of
// the cycle beginning. Fade 0 → 1 over 1.8s, ease-out.
let exposureTarget = 1.0;
let exposureStart = performance.now();
let exposureFromValue = 0.0;
const EXPOSURE_FADE_MS = 1800;

function triggerExposureFade(from, to, duration = EXPOSURE_FADE_MS) {
  exposureFromValue = from;
  exposureTarget = to;
  exposureStart = performance.now();
  return duration;
}

function updateExposure(now) {
  const elapsed = now - exposureStart;
  const t = Math.min(1, elapsed / EXPOSURE_FADE_MS);
  const eased = 1 - Math.pow(1 - t, 2.2); // ease-out
  liveExposureUniforms.uExposure.value = exposureFromValue + (exposureTarget - exposureFromValue) * eased;
}

triggerExposureFade(0, 1);

// --- Slow camera drift so the nebula is continuously alive ---
// Gradient-bang's title rotates slowly. Same idea — the idle state IS
// the motion. Rotation rate chosen to produce a visible shift over 15s.
const DRIFT_RATE_RAD_PER_SEC = 0.018;
const DRIFT_AXIS = new THREE.Vector3(0.3, 1.0, 0.1).normalize();
let lastDriftUpdate = performance.now();

function updateDrift(now) {
  const dt = (now - lastDriftUpdate) / 1000;
  lastDriftUpdate = now;
  nebulaMesh.rotateOnAxis(DRIFT_AXIS, DRIFT_RATE_RAD_PER_SEC * dt);
}

// --- Key handlers for live tuning ---
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

const STEPS = {
  intensity: 0.05,
  domain: 0.1,
  exposure: 0.1,
  tint: 0.05,
};

window.addEventListener('keydown', (ev) => {
  if (ev.key === '1') nebulaUniforms.uIntensity.value = clamp(nebulaUniforms.uIntensity.value - STEPS.intensity, 0, 2);
  if (ev.key === '2') nebulaUniforms.uIntensity.value = clamp(nebulaUniforms.uIntensity.value + STEPS.intensity, 0, 2);
  if (ev.key === '3') nebulaUniforms.uDomainScale.value = clamp(nebulaUniforms.uDomainScale.value - STEPS.domain, 0.1, 4);
  if (ev.key === '4') nebulaUniforms.uDomainScale.value = clamp(nebulaUniforms.uDomainScale.value + STEPS.domain, 0.1, 4);
  if (ev.key === '5') exposureTarget = clamp(liveExposureUniforms.uExposure.value - STEPS.exposure, 0, 2);
  if (ev.key === '6') exposureTarget = clamp(liveExposureUniforms.uExposure.value + STEPS.exposure, 0, 2);
  if (ev.key === '7') liveTintUniforms.uTintStrength.value = clamp(liveTintUniforms.uTintStrength.value - STEPS.tint, 0, 1);
  if (ev.key === '8') liveTintUniforms.uTintStrength.value = clamp(liveTintUniforms.uTintStrength.value + STEPS.tint, 0, 1);

  if (ev.key === '5' || ev.key === '6') {
    // Exposure edits trigger a short animated ramp toward target
    triggerExposureFade(liveExposureUniforms.uExposure.value, exposureTarget, 250);
  }

  if (ev.key === 'r' || ev.key === 'R') {
    nebulaUniforms.uIntensity.value = NEBULA_DEFAULTS.uIntensity;
    nebulaUniforms.uDomainScale.value = NEBULA_DEFAULTS.uDomainScale;
    triggerExposureFade(liveExposureUniforms.uExposure.value, 1.0);
    liveTintUniforms.uTintStrength.value = 0;
    liveTintUniforms.uTintColor.value.set(1, 1, 1);
  }

  if (ev.key === ' ') {
    // Cycle: fade to 0 then back to 1
    triggerExposureFade(liveExposureUniforms.uExposure.value, 0, 600);
    setTimeout(() => triggerExposureFade(0, 1, 900), 650);
    ev.preventDefault();
  }

  // Tint color cycle on T — tour a few signature palettes
  if (ev.key === 't' || ev.key === 'T') {
    const palettes = [
      [1.0, 1.0, 1.0], // neutral
      [0.0, 0.5, 0.5], // cosmic teal
      [0.80, 0.10, 0.50], // inhibitor magenta
      [1.0, 0.85, 0.4], // accretion gold
      [0.45, 0.35, 0.75], // nebula violet
    ];
    const idx = Math.floor(Math.random() * palettes.length);
    liveTintUniforms.uTintColor.value.set(...palettes[idx]);
    liveTintUniforms.uTintStrength.value = 0.35;
  }
});

// --- HUD tuning readout ---
function updateTuningPanel() {
  if (elIntensity) elIntensity.textContent = nebulaUniforms.uIntensity.value.toFixed(2);
  if (elDomain) elDomain.textContent = nebulaUniforms.uDomainScale.value.toFixed(2);
  if (elExposure) elExposure.textContent = liveExposureUniforms.uExposure.value.toFixed(2);
  if (elTint) elTint.textContent = liveTintUniforms.uTintStrength.value.toFixed(2);
}

// --- FPS sampling ---
let fpsAccum = 0;
let fpsFrames = 0;
let fpsLast = performance.now();

function updateFps(now) {
  fpsFrames += 1;
  fpsAccum += now - fpsLast;
  fpsLast = now;
  if (fpsAccum >= 500) {
    const fps = 1000 / (fpsAccum / fpsFrames);
    if (elFps) elFps.textContent = fps.toFixed(0);
    fpsAccum = 0;
    fpsFrames = 0;
  }
}

// --- Main loop ---
// DEBUG: URL param ?bypass=1 skips the composer and renders the scene
// directly to the canvas. Lets us isolate whether the issue is in the
// scene or in the post-processing chain.
const bypassComposer = new URLSearchParams(window.location.search).has('bypass');
console.log('[title-prototype] bypassComposer =', bypassComposer);

function animate() {
  const now = performance.now();
  updateFps(now);
  updateExposure(now);
  updateDrift(now);
  updateTuningPanel();
  if (bypassComposer) {
    renderer.render(scene, camera);
  } else {
    composer.render();
  }
  requestAnimationFrame(animate);
}

animate();

// Expose for console debugging
window.__TITLE_PROTOTYPE__ = {
  nebulaUniforms,
  exposureUniforms: liveExposureUniforms,
  tintUniforms: liveTintUniforms,
  renderer,
  scene,
  camera,
  composer,
};

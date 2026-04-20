// src/render/passes/ascii-pass.js
//
// ASCIIPass — quantizes the incoming scene color into character cells,
// looks up each cell's glyph from a font atlas, and tints with the scene
// color. This IS the product identity (Pillar 1: Art Is Product), so it
// lives close to the end of the pass chain — after any color/bloom passes
// but before a final grade if you want the grade applied to glyphs too.
//
// Reads:
//   - prevOutputTex (bound as u_scene) — the composite scene from prior
//     passes (typically FluidDisplayPass output).
//   - frameContext.ascii.velocityTex — fluid velocity texture, used to
//     pick directional glyph ramps (horizontal / vertical / diagonal).
//
// Frame context (pulled from frameContext.ascii):
//   - velocityTex:   fluid velocity texture handle
//   - cellSize:      character cell width in px (CONFIG.ascii.cellSize)
//   - cellAspect:    cell height / width (e.g. 1.5)
//   - contrast:      luminance-to-glyph curve power
//   - shimmer:       quantum-fluctuation probability scalar (0 = off)
//   - dirThreshold:  speed above which directional ramps kick in
//   - glitchIntensity: 0-1, for scene transitions (0 on title)
//   - camFU, camFV:  camera center in fluid UV (world-anchored shimmer)
//   - worldScale:    WORLD_SCALE
//   - totalTime:     elapsed seconds

import { Pass } from '../composer.js';
import { FRAG_ASCII, CHARS_PER_RAMP, createFontAtlasTexture } from '../shaders/ascii.glsl.js';

// Passthrough shader — used when viewMode === 'scene' to show raw fluid
// output, bypassing the ASCII quantization. Exposed via setViewMode() so
// the __TEST_API dev hook can toggle between 'ascii' and 'scene' views.
const FRAG_SCENE_PASSTHROUGH = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
in vec2 v_uv;
out vec4 fragColor;
void main() { fragColor = texture(u_scene, v_uv); }`;

export class ASCIIPass extends Pass {
  constructor(gl, { rendersToScreen = true } = {}) {
    super({ name: 'ascii', rendersToScreen });
    this.gl = gl;
    this.fontAtlasTex = createFontAtlasTexture(gl);
    this.numChars = CHARS_PER_RAMP;
    this.program = null;
    this.uniforms = null;
    this.sceneProgram = null;
    this.sceneUniforms = null;
    this.viewMode = 'ascii';
  }

  setViewMode(mode = 'ascii') {
    this.viewMode = mode === 'scene' ? 'scene' : 'ascii';
  }

  getViewMode() { return this.viewMode; }

  _ensureProgram(composer) {
    if (this.program) return;
    const ascii = composer.compileProgram(FRAG_ASCII, 'ascii-pass');
    this.program = ascii.program;
    this.uniforms = ascii.uniforms;
    const scene = composer.compileProgram(FRAG_SCENE_PASSTHROUGH, 'ascii-pass-scene');
    this.sceneProgram = scene.program;
    this.sceneUniforms = scene.uniforms;
  }

  render({ gl, prevOutputTex, frameContext, composer }) {
    this._ensureProgram(composer);

    if (!prevOutputTex) throw new Error('ASCIIPass: prevOutputTex missing (needs a scene input)');

    if (this.viewMode === 'scene') {
      gl.useProgram(this.sceneProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
      gl.uniform1i(this.sceneUniforms.u_scene, 0);
      composer.drawQuad();
      return;
    }

    const ctx = frameContext.ascii;
    if (!ctx) throw new Error('ASCIIPass: frameContext.ascii missing');
    if (!ctx.velocityTex) throw new Error('ASCIIPass: frameContext.ascii.velocityTex missing');

    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
    gl.uniform1i(this.uniforms.u_scene, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fontAtlasTex);
    gl.uniform1i(this.uniforms.u_fontAtlas, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, ctx.velocityTex);
    gl.uniform1i(this.uniforms.u_velocity, 2);

    gl.uniform2f(this.uniforms.u_resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.uniforms.u_cellSize, ctx.cellSize);
    gl.uniform1f(this.uniforms.u_contrast, ctx.contrast);
    gl.uniform1f(this.uniforms.u_numChars, this.numChars);
    gl.uniform1f(this.uniforms.u_cellAspect, ctx.cellAspect);
    gl.uniform1f(this.uniforms.u_time, ctx.totalTime);
    gl.uniform1f(this.uniforms.u_shimmer, ctx.shimmer);
    gl.uniform2f(this.uniforms.u_camOffset, ctx.camFU, ctx.camFV);
    gl.uniform1f(this.uniforms.u_worldScale, ctx.worldScale);
    gl.uniform1f(this.uniforms.u_dirThreshold, ctx.dirThreshold ?? 0.01);
    gl.uniform1f(this.uniforms.u_glitchIntensity, ctx.glitchIntensity ?? 0);

    composer.drawQuad();
  }
}

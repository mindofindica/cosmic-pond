import { audioState, analyzeAudio } from './audio.js';
import { initBlackHoleState, updateBlackHoleSystem, drawBlackHoles, drawWormholes, drawDrawPath } from './blackholes.js';
import { initParticles, syncParticleCount, drawConnections, drawParticleTrails, updateAndDrawParticles } from './particles.js';
import { updateRipples, drawRipples } from './ripples.js';
import { attachInput } from './input.js';

const canvas = document.getElementById('pond');
const ctx = canvas.getContext('2d');

const state = {
  canvas,
  ctx,
  width: 0,
  height: 0,
  particles: [],
  particleCount: 0,
  ripples: [],
  mouse: { x: 0, y: 0 },
  blackHoles: [],
  wormholes: [],
  drawPath: [],
  isDrawing: false,
};

function resize() {
  state.width = canvas.width = window.innerWidth;
  state.height = canvas.height = window.innerHeight;

  // Keep mouse roughly in-bounds
  if (!state.mouse.x && !state.mouse.y) {
    state.mouse.x = state.width / 2;
    state.mouse.y = state.height / 2;
  } else {
    state.mouse.x = Math.min(state.width, Math.max(0, state.mouse.x));
    state.mouse.y = Math.min(state.height, Math.max(0, state.mouse.y));
  }

  // Adapt particle count to screen area for consistent density/perf.
  syncParticleCount(state);
}

function init() {
  resize();
  initBlackHoleState(state);

  // First particle init
  syncParticleCount(state);
  if (state.particles.length === 0) {
    initParticles(state, state.particleCount || 500);
  }

  attachInput(state, { onResize: resize });
}

function frame() {
  // Fade trail
  ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
  ctx.fillRect(0, 0, state.width, state.height);

  // Audio analysis
  if (audioState.audioActive) analyzeAudio();

  // Update systems
  updateBlackHoleSystem(state);

  // Draw
  drawConnections(state, audioState);
  drawParticleTrails(state);
  updateAndDrawParticles(state, audioState);

  updateRipples(state);
  drawRipples(state);

  // Black holes / wormholes on top
  drawBlackHoles(state);
  drawWormholes(state);
  drawDrawPath(state);

  requestAnimationFrame(frame);
}

init();
frame();

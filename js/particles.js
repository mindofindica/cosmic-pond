import { clamp, hslToRgb, rgbToHsl } from './utils.js';

export const COLORS = [
  { r: 100, g: 200, b: 255 },
  { r: 180, g: 100, b: 255 },
  { r: 255, g: 150, b: 200 },
  { r: 100, g: 255, b: 200 },
  { r: 255, g: 200, b: 100 },
];

const BASE_AREA = 1920 * 1080;
const BASE_COUNT = 800;
const MIN_COUNT = 250;
const MAX_COUNT = 1100;

export function calculateParticleCount(width, height) {
  const area = Math.max(1, width * height);
  const scaled = Math.round((area / BASE_AREA) * BASE_COUNT);
  return clamp(scaled, MIN_COUNT, MAX_COUNT);
}

export function createParticle(state, x, y) {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const px = x ?? Math.random() * state.width;
  const py = y ?? Math.random() * state.height;
  return {
    x: px,
    y: py,
    baseX: px,
    baseY: py,
    vx: 0,
    vy: 0,
    radius: Math.random() * 2 + 1,
    color,
    alpha: Math.random() * 0.5 + 0.3,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: Math.random() * 0.02 + 0.01,
    driftX: (Math.random() - 0.5) * 0.3,
    driftY: (Math.random() - 0.5) * 0.3,
    captured: false,
    capturedBy: null,
    captureTime: 0,
    captureAngle: 0,
    captureRadius: 0,
    destroyed: false,
    respawnAt: 0,
    respawnWormhole: null,
    trail: [],
  };
}

export function initParticles(state, count) {
  state.particles = [];
  for (let i = 0; i < count; i += 1) {
    state.particles.push(createParticle(state));
  }
  state.particleCount = count;
}

export function syncParticleCount(state) {
  const target = calculateParticleCount(state.width, state.height);
  const current = state.particles.length;
  if (current < target) {
    for (let i = current; i < target; i += 1) {
      state.particles.push(createParticle(state));
    }
  } else if (current > target) {
    state.particles.length = target;
  }
  state.particleCount = target;
  return target;
}

function updateParticle(p, state, audioState) {
  if (p.destroyed) return;
  if (p.captured) {
    // Captured particles are updated by the black hole module.
    return;
  }

  p.baseX += p.driftX;
  p.baseY += p.driftY;

  if (p.baseX < -50) p.baseX = state.width + 50;
  if (p.baseX > state.width + 50) p.baseX = -50;
  if (p.baseY < -50) p.baseY = state.height + 50;
  if (p.baseY > state.height + 50) p.baseY = -50;

  const dx = state.mouse.x - p.baseX;
  const dy = state.mouse.y - p.baseY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxDist = 150;
  if (dist < maxDist) {
    const force = (1 - dist / maxDist) * 30;
    const angle = Math.atan2(dy, dx);
    p.vx -= Math.cos(angle) * force * 0.1;
    p.vy -= Math.sin(angle) * force * 0.1;
  }

  for (const ripple of state.ripples) {
    const rdx = p.baseX - ripple.x;
    const rdy = p.baseY - ripple.y;
    const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
    if (Math.abs(rdist - ripple.radius) < 50) {
      const angle = Math.atan2(rdy, rdx);
      const wave = Math.sin((rdist - ripple.radius) * 0.1) * ripple.strength * ripple.life;
      p.vx += Math.cos(angle) * wave * 0.5;
      p.vy += Math.sin(angle) * wave * 0.5;
    }
  }

  if (audioState.audioActive && !audioState.isCalibrating) {
    const cx = state.width / 2;
    const cy = state.height / 2;
    const bx = p.baseX - cx;
    const by = p.baseY - cy;
    const bDist = Math.sqrt(bx * bx + by * by) || 1;

    const breathForce = audioState.trippy.breath * 0.15;
    p.vx += (bx / bDist) * breathForce;
    p.vy += (by / bDist) * breathForce;

    const swirlForce = audioState.trippy.swirl * 0.02;
    p.vx += (-by / bDist) * swirlForce;
    p.vy += (bx / bDist) * swirlForce;
  }

  p.x = p.baseX + p.vx;
  p.y = p.baseY + p.vy;
  p.vx *= 0.92;
  p.vy *= 0.92;
  p.pulse += p.pulseSpeed;
}

function drawParticle(ctx, p, audioState) {
  if (p.destroyed) return;
  const pulseAlpha = p.alpha * (0.7 + 0.3 * Math.sin(p.pulse));
  let pulseRadius = p.radius * (0.8 + 0.2 * Math.sin(p.pulse));

  let r = p.color.r;
  let g = p.color.g;
  let b = p.color.b;
  let glowMultiplier = 4;

  if (audioState.audioActive && !audioState.isCalibrating) {
    const hsl = rgbToHsl(r, g, b);
    hsl.h += audioState.trippy.hueRotation;
    const shifted = hslToRgb(hsl.h, hsl.s, hsl.l);
    r = shifted.r;
    g = shifted.g;
    b = shifted.b;

    glowMultiplier = 4 + audioState.trippy.sparkle * 3;
    pulseRadius *= (1 + audioState.trippy.sparkle * 0.5);
  }

  const gradient = ctx.createRadialGradient(
    p.x,
    p.y,
    0,
    p.x,
    p.y,
    pulseRadius * glowMultiplier
  );
  const glowAlpha = pulseAlpha * (1 + (audioState.audioActive ? audioState.trippy.sparkle * 0.5 : 0));
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${Math.min(1, glowAlpha)})`);
  gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${glowAlpha * 0.3})`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.beginPath();
  ctx.arc(p.x, p.y, pulseRadius * glowMultiplier, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  const coreAlpha = Math.min(1, pulseAlpha * (0.8 + (audioState.audioActive ? audioState.trippy.sparkle * 0.4 : 0)));
  ctx.beginPath();
  ctx.arc(p.x, p.y, pulseRadius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${coreAlpha})`;
  ctx.fill();
}

export function drawConnections(state, audioState) {
  const ctx = state.ctx;
  const baseConnectionDist = 80;
  const connectionDist = baseConnectionDist + (audioState.audioActive ? audioState.trippy.connectionBoost : 0);

  for (let i = 0; i < state.particles.length; i += 1) {
    const p1 = state.particles[i];
    if (p1.destroyed || p1.captured) continue;
    for (let j = i + 1; j < state.particles.length; j += 1) {
      const p2 = state.particles[j];
      if (p2.destroyed || p2.captured) continue;
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < connectionDist) {
        const alpha = (1 - dist / connectionDist) * 0.15;
        let r = (p1.color.r + p2.color.r) / 2;
        let g = (p1.color.g + p2.color.g) / 2;
        let b = (p1.color.b + p2.color.b) / 2;

        if (audioState.audioActive && !audioState.isCalibrating) {
          const hsl = rgbToHsl(r, g, b);
          hsl.h += audioState.trippy.hueRotation;
          const shifted = hslToRgb(hsl.h, hsl.s, hsl.l);
          r = shifted.r;
          g = shifted.g;
          b = shifted.b;
        }

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}

export function drawParticleTrails(state) {
  const ctx = state.ctx;
  for (const p of state.particles) {
    if (!p.captured || !p.trail || p.trail.length < 2) continue;
    for (let i = 1; i < p.trail.length; i += 1) {
      const t = p.trail[i];
      const prev = p.trail[i - 1];
      if (t.alpha < 0.01) continue;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = `rgba(${t.r}, ${t.g}, ${t.b}, ${t.alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

export function updateAndDrawParticles(state, audioState) {
  const ctx = state.ctx;
  for (const p of state.particles) {
    updateParticle(p, state, audioState);
    // Captured particles are positioned/animated by the black hole module,
    // but we still draw them here for consistency.
    drawParticle(ctx, p, audioState);
  }
}

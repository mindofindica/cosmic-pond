import { COLORS } from './particles.js';
import { showToast } from './ui.js';

const ANIMATION_TYPES = ['spaghettify', 'accretion', 'colorCascade', 'implosion'];
const DESTROY_DURATION = 4000; // ms
const PERSIST_DURATION = 10000; // ms
const RESPAWN_DELAY = 3000; // ms

export function initBlackHoleState(state) {
  state.blackHoles = [];
  state.wormholes = [];
  state.drawPath = [];
  state.isDrawing = false;
}

export function detectLoop(path) {
  if (!path || path.length < 20) return null;
  const start = path[0];
  const end = path[path.length - 1];
  const closeDist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);

  // Forgiving: end within 100px of start, or within 30% of path bbox
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const bboxSize = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys)
  );
  if (closeDist > Math.max(100, bboxSize * 0.3)) return null;

  const cx = path.reduce((s, p) => s + p.x, 0) / path.length;
  const cy = path.reduce((s, p) => s + p.y, 0) / path.length;
  const avgR = path.reduce((s, p) => s + Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2), 0) / path.length;
  if (avgR < 30) return null;

  return { x: cx, y: cy, radius: avgR };
}

function captureParticle(p, bh, now) {
  p.captured = true;
  p.capturedBy = bh;
  p.captureTime = now;
  const dx = p.x - bh.x;
  const dy = p.y - bh.y;
  p.captureAngle = Math.atan2(dy, dx);
  p.captureRadius = Math.sqrt(dx * dx + dy * dy);
  p.trail = [];
  bh.capturedCount += 1;
}

function scheduleRespawn(state, p) {
  p.destroyed = true;
  p.captured = false;
  p.capturedBy = null;
  const now = Date.now();
  p.respawnAt = now + RESPAWN_DELAY;

  const wh = {
    x: Math.random() * state.width,
    y: Math.random() * state.height,
    createdAt: now,
    expiresAt: now + RESPAWN_DELAY + 2000,
    opacity: 0,
    spawnedParticle: false,
  };

  p.respawnWormhole = wh;
  state.wormholes.push(wh);
}

function updateCapturedParticle(state, p) {
  const bh = p.capturedBy;
  if (!bh) return;

  const now = Date.now();
  const elapsed = now - p.captureTime;
  const progress = Math.min(1, elapsed / DESTROY_DURATION);
  const ease = progress * progress * progress;

  switch (bh.animationType) {
    case 'spaghettify': {
      const r = p.captureRadius * (1 - ease);
      const spin = p.captureAngle + progress * Math.PI * 6;
      p.x = bh.x + Math.cos(spin) * r;
      p.y = bh.y + Math.sin(spin) * r;
      p.radius = p.radius * (1 + ease * 2);
      p.alpha = (1 - ease) * 0.8;
      break;
    }
    case 'accretion': {
      const r = p.captureRadius * (1 - ease);
      const spin = p.captureAngle + progress * Math.PI * 8;
      p.x = bh.x + Math.cos(spin) * r;
      p.y = bh.y + Math.sin(spin) * r;

      if (p.trail.length === 0 || elapsed % 2 === 0) {
        p.trail.push({ x: p.x, y: p.y, alpha: 0.6, r: p.color.r, g: p.color.g, b: p.color.b });
        if (p.trail.length > 30) p.trail.shift();
      }
      for (const t of p.trail) t.alpha *= 0.97;
      p.alpha = (1 - ease * ease) * 0.9;
      break;
    }
    case 'colorCascade': {
      const r = p.captureRadius * (1 - ease * 0.95);
      const spin = p.captureAngle + progress * Math.PI * 2;
      p.x = bh.x + Math.cos(spin) * r;
      p.y = bh.y + Math.sin(spin) * r;

      if (progress < 0.33) {
        const t = progress / 0.33;
        p.color = { r: Math.round(180 + 75 * t), g: Math.round(100 * (1 - t)), b: 255 };
      } else if (progress < 0.66) {
        const t = (progress - 0.33) / 0.33;
        p.color = { r: 255, g: Math.round(50 * t), b: Math.round(255 * (1 - t)) };
      } else {
        const t = (progress - 0.66) / 0.34;
        p.color = { r: 255, g: Math.round(50 + 205 * t), b: Math.round(200 * t) };
      }

      p.alpha = progress > 0.9 ? (1 - progress) * 10 * 0.8 : 0.8;
      break;
    }
    case 'implosion': {
      const r = p.captureRadius * (1 - ease);
      const angle = p.captureAngle;
      p.x = bh.x + Math.cos(angle) * r;
      p.y = bh.y + Math.sin(angle) * r;
      p.radius = p.radius * (1 - ease * 0.8);
      p.alpha = 0.3 + ease * 0.7;
      p.color = {
        r: Math.min(255, p.color.r + Math.round(ease * 100)),
        g: Math.min(255, p.color.g + Math.round(ease * 100)),
        b: Math.min(255, p.color.b + Math.round(ease * 100)),
      };
      break;
    }
  }

  if (progress >= 1) {
    scheduleRespawn(state, p);
  }
}

export function createBlackHole(state, cx, cy, radius) {
  const animType = ANIMATION_TYPES[Math.floor(Math.random() * ANIMATION_TYPES.length)];
  const now = Date.now();
  const bh = {
    x: cx,
    y: cy,
    radius,
    animationType: animType,
    createdAt: now,
    animDoneAt: now + DESTROY_DURATION,
    expiresAt: now + DESTROY_DURATION + PERSIST_DURATION,
    opacity: 1,
    capturedCount: 0,
  };

  state.blackHoles.push(bh);

  for (const p of state.particles) {
    if (p.captured || p.destroyed) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (Math.sqrt(dx * dx + dy * dy) <= radius * 1.1) {
      captureParticle(p, bh, now);
    }
  }

  showToast(
    animType === 'spaghettify'
      ? '🌀 spaghettification'
      : animType === 'accretion'
        ? '💫 accretion disk'
        : animType === 'colorCascade'
          ? '🌈 color cascade'
          : '💥 implosion'
  );
}

export function updateBlackHoles(state) {
  const now = Date.now();
  for (let i = state.blackHoles.length - 1; i >= 0; i -= 1) {
    const bh = state.blackHoles[i];

    if (now > bh.animDoneAt && now < bh.expiresAt) {
      for (const p of state.particles) {
        if (p.captured || p.destroyed) continue;
        const dx = p.x - bh.x;
        const dy = p.y - bh.y;
        if (Math.sqrt(dx * dx + dy * dy) <= bh.radius * 0.8) {
          captureParticle(p, bh, now);
        }
      }
    }

    const timeLeft = bh.expiresAt - now;
    if (timeLeft < 2000) bh.opacity = Math.max(0, timeLeft / 2000);
    if (now > bh.expiresAt) state.blackHoles.splice(i, 1);
  }
}

export function updateWormholes(state) {
  const now = Date.now();
  for (let i = state.wormholes.length - 1; i >= 0; i -= 1) {
    const wh = state.wormholes[i];
    const age = now - wh.createdAt;

    if (age < 1000) {
      wh.opacity = age / 1000;
    } else if (now > wh.expiresAt - 1000) {
      wh.opacity = Math.max(0, (wh.expiresAt - now) / 1000);
    } else {
      wh.opacity = 1;
    }

    if (now > wh.expiresAt) state.wormholes.splice(i, 1);
  }
}

export function respawnParticles(state) {
  const now = Date.now();
  for (const p of state.particles) {
    if (p.destroyed && now >= p.respawnAt) {
      const wh = p.respawnWormhole;
      const spawnX = wh ? wh.x + (Math.random() - 0.5) * 20 : Math.random() * state.width;
      const spawnY = wh ? wh.y + (Math.random() - 0.5) * 20 : Math.random() * state.height;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];

      p.x = spawnX;
      p.y = spawnY;
      p.baseX = spawnX;
      p.baseY = spawnY;
      p.vx = (Math.random() - 0.5) * 2;
      p.vy = (Math.random() - 0.5) * 2;
      p.color = color;
      p.alpha = 0;
      p.radius = Math.random() * 2 + 1;
      p.captured = false;
      p.capturedBy = null;
      p.destroyed = false;
      p.respawnAt = 0;
      p.respawnWormhole = null;
      p.trail = [];
      p.pulse = Math.random() * Math.PI * 2;
      p.driftX = (Math.random() - 0.5) * 0.3;
      p.driftY = (Math.random() - 0.5) * 0.3;
    }

    if (!p.destroyed && !p.captured && p.alpha < 0.3) {
      p.alpha += 0.005;
    }
  }
}

export function updateCapturedParticles(state) {
  for (const p of state.particles) {
    if (p.captured && !p.destroyed) updateCapturedParticle(state, p);
  }
}

export function drawBlackHoles(state) {
  const ctx = state.ctx;
  const now = Date.now();

  for (const bh of state.blackHoles) {
    const age = now - bh.createdAt;
    const op = bh.opacity;

    const darkGrad = ctx.createRadialGradient(bh.x, bh.y, 0, bh.x, bh.y, bh.radius * 0.6);
    darkGrad.addColorStop(0, `rgba(0, 0, 0, ${0.8 * op})`);
    darkGrad.addColorStop(0.7, `rgba(0, 0, 0, ${0.3 * op})`);
    darkGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.beginPath();
    ctx.arc(bh.x, bh.y, bh.radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = darkGrad;
    ctx.fill();

    const pulse = 1 + Math.sin(age * 0.003) * 0.1;
    const ringGrad = ctx.createRadialGradient(
      bh.x,
      bh.y,
      bh.radius * 0.8 * pulse,
      bh.x,
      bh.y,
      bh.radius * 1.1 * pulse
    );
    ringGrad.addColorStop(0, 'rgba(100, 50, 200, 0)');
    ringGrad.addColorStop(0.4, `rgba(150, 80, 255, ${0.4 * op})`);
    ringGrad.addColorStop(0.6, `rgba(200, 100, 255, ${0.3 * op})`);
    ringGrad.addColorStop(1, 'rgba(100, 50, 200, 0)');
    ctx.beginPath();
    ctx.arc(bh.x, bh.y, bh.radius * 1.1 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = ringGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(bh.x, bh.y, bh.radius * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180, 120, 255, ${0.2 * op})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

export function drawWormholes(state) {
  const ctx = state.ctx;
  const now = Date.now();

  for (const wh of state.wormholes) {
    const age = now - wh.createdAt;
    const op = wh.opacity;
    if (op <= 0) continue;

    const pulse = 1 + Math.sin(age * 0.005) * 0.2;
    const radius = 25 * pulse;

    const grad = ctx.createRadialGradient(wh.x, wh.y, 0, wh.x, wh.y, radius);
    grad.addColorStop(0, `rgba(150, 255, 200, ${0.6 * op})`);
    grad.addColorStop(0.3, `rgba(100, 200, 255, ${0.3 * op})`);
    grad.addColorStop(0.6, `rgba(180, 100, 255, ${0.15 * op})`);
    grad.addColorStop(1, 'rgba(100, 50, 200, 0)');
    ctx.beginPath();
    ctx.arc(wh.x, wh.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(wh.x, wh.y, radius * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(150, 255, 220, ${0.4 * op})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function drawDrawPath(state) {
  if (!state.isDrawing || state.drawPath.length < 2) return;

  const ctx = state.ctx;
  ctx.beginPath();
  ctx.moveTo(state.drawPath[0].x, state.drawPath[0].y);
  for (let i = 1; i < state.drawPath.length; i += 1) {
    ctx.lineTo(state.drawPath[i].x, state.drawPath[i].y);
  }
  ctx.strokeStyle = 'rgba(180, 120, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function updateBlackHoleSystem(state) {
  updateBlackHoles(state);
  updateWormholes(state);
  updateCapturedParticles(state);
  respawnParticles(state);
}

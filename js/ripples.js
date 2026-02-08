export function addRipple(state, x, y) {
  state.ripples.push({
    x,
    y,
    radius: 0,
    maxRadius: 200 + Math.random() * 100,
    strength: 8,
    life: 1,
  });
}

export function updateRipples(state) {
  for (let i = state.ripples.length - 1; i >= 0; i -= 1) {
    const ripple = state.ripples[i];
    ripple.radius += 4;
    ripple.life -= 0.015;
    if (ripple.life <= 0) {
      state.ripples.splice(i, 1);
    }
  }
}

export function drawRipples(state) {
  const ctx = state.ctx;
  for (const ripple of state.ripples) {
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${ripple.life * 0.2})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

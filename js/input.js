import { addRipple } from './ripples.js';
import { createBlackHole, detectLoop } from './blackholes.js';
import { canAdjustThreshold, adjustThreshold, toggleAudio, audioState } from './audio.js';
import { updateThresholdIndicator } from './ui.js';

export function attachInput(state, { onResize }) {
  const { canvas } = state;

  // Resize
  window.addEventListener('resize', () => {
    onResize?.();
  });

  // Pointer / mouse
  let mouseDownPos = null;
  let hasDragged = false;

  canvas.addEventListener('mousedown', (e) => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
    hasDragged = false;
    state.isDrawing = false;
    state.drawPath = [];
  });

  canvas.addEventListener('mousemove', (e) => {
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;

    if (mouseDownPos) {
      const dx = e.clientX - mouseDownPos.x;
      const dy = e.clientY - mouseDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > 15) {
        hasDragged = true;
        state.isDrawing = true;
      }
      if (state.isDrawing) {
        state.drawPath.push({ x: e.clientX, y: e.clientY });
      }
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (state.isDrawing) {
      const loop = detectLoop(state.drawPath);
      if (loop) createBlackHole(state, loop.x, loop.y, loop.radius);
    } else if (!hasDragged) {
      addRipple(state, e.clientX, e.clientY);
    }

    mouseDownPos = null;
    state.isDrawing = false;
    state.drawPath = [];
  });

  // Touch
  let touchStartPos = null;
  let touchHasDragged = false;

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStartPos = { x: t.clientX, y: t.clientY };
      touchHasDragged = false;
      state.isDrawing = false;
      state.drawPath = [];
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && touchStartPos) {
      e.preventDefault();
      const t = e.touches[0];
      state.mouse.x = t.clientX;
      state.mouse.y = t.clientY;

      const dx = t.clientX - touchStartPos.x;
      const dy = t.clientY - touchStartPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > 15) {
        touchHasDragged = true;
        state.isDrawing = true;
      }
      if (state.isDrawing) {
        state.drawPath.push({ x: t.clientX, y: t.clientY });
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    if (state.isDrawing) {
      const loop = detectLoop(state.drawPath);
      if (loop) createBlackHole(state, loop.x, loop.y, loop.radius);
    } else if (!touchHasDragged && touchStartPos) {
      addRipple(state, touchStartPos.x, touchStartPos.y);
    }

    touchStartPos = null;
    state.isDrawing = false;
    state.drawPath = [];
  }, { passive: true });

  // Mic button
  document.getElementById('micButton').addEventListener('click', toggleAudio);

  // Threshold adjustment: wheel
  window.addEventListener('wheel', (e) => {
    if (!canAdjustThreshold()) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? -2 : 2;
    updateThresholdIndicator(adjustThreshold(delta));
  }, { passive: false });

  // Threshold adjustment: two-finger touch drag
  let lastTouchY = null;
  let touchCount = 0;

  window.addEventListener('touchstart', (e) => {
    touchCount = e.touches.length;
    if (touchCount === 2 && audioState.audioActive && !audioState.isCalibrating) {
      lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (touchCount === 2 && audioState.audioActive && !audioState.isCalibrating && lastTouchY !== null) {
      e.preventDefault();
      const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const delta = (lastTouchY - currentY) * 0.2;
      updateThresholdIndicator(adjustThreshold(delta));
      lastTouchY = currentY;
    }
  }, { passive: false });

  window.addEventListener('touchend', () => {
    lastTouchY = null;
    touchCount = 0;
  }, { passive: true });

  // Hide info after a few seconds
  setTimeout(() => {
    document.querySelector('.info')?.classList.add('hidden');
  }, 5000);
}

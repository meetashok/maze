/**
 * Celebration: confetti particles + shared win banner + Web Audio chirp.
 */

import { playWinSound } from "./sound.js";

const WIN_PHRASES = ["You did it!", "Amazing!", "Great job!", "Wow!", "Super!", "Awesome!"];

export { playWinSound };

/**
 * @param {HTMLElement} host
 * @param {number} durationMs
 */
export function celebrate(host, durationMs = 3200) {
  playWinSound();

  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const resize = () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
  };
  resize();

  const ctx = canvas.getContext("2d");
  const colors = ["#ff6b6b", "#ffd93d", "#6bcB77", "#4ecdc4", "#ff8e53", "#ffe66d"];
  const particles = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height * 0.3,
    vx: (Math.random() - 0.5) * 6 * devicePixelRatio,
    vy: (2 + Math.random() * 5) * devicePixelRatio,
    w: (4 + Math.random() * 6) * devicePixelRatio,
    h: (6 + Math.random() * 10) * devicePixelRatio,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.25,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  const start = performance.now();
  let raf = 0;

  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fade = Math.max(0, 1 - t / durationMs);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08 * devicePixelRatio;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (t < durationMs) {
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
      canvas.remove();
      window.removeEventListener("resize", resize);
    }
  };

  window.addEventListener("resize", resize);
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    canvas.remove();
    window.removeEventListener("resize", resize);
  };
}

/**
 * Fill a shared celebration overlay with emoji, phrase, and action buttons.
 * @param {HTMLElement | null} overlay
 * @param {{ emoji?: string, message?: string, detail?: string, onAgain?: () => void, onNew?: () => void, againLabel?: string, newLabel?: string }} opts
 */
export function showCelebrationOverlay(overlay, opts = {}) {
  if (!overlay) return;
  const phrase = opts.message || WIN_PHRASES[Math.floor(Math.random() * WIN_PHRASES.length)];
  const emojiEl = overlay.querySelector(".celebrate-emoji");
  const titleEl = overlay.querySelector(".celebrate-title");
  const detailEl = overlay.querySelector(".celebrate-detail");
  const againBtn = overlay.querySelector("[data-celebrate-again]");
  const newBtn = overlay.querySelector("[data-celebrate-new]");

  if (emojiEl) emojiEl.textContent = opts.emoji || "🎉";
  if (titleEl) titleEl.textContent = phrase;
  if (detailEl) {
    detailEl.textContent = opts.detail || "";
    detailEl.hidden = !opts.detail;
  }
  if (againBtn) {
    againBtn.textContent = opts.againLabel || "Play Again";
    againBtn.onclick = () => {
      hideCelebrationOverlay(overlay);
      opts.onAgain?.();
    };
  }
  if (newBtn) {
    newBtn.textContent = opts.newLabel || "New Puzzle";
    newBtn.onclick = () => {
      hideCelebrationOverlay(overlay);
      opts.onNew?.();
    };
  }

  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
}

export function hideCelebrationOverlay(overlay) {
  if (!overlay) return;
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
}

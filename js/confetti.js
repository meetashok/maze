/**
 * Short celebration: confetti particles + Web Audio chirp.
 */

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  return audioCtx;
}

export function playWinSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  } catch {
    // ignore audio errors
  }
}

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

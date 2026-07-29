/**
 * Lightweight Web Audio SFX — no asset files.
 * Respects a localStorage mute preference.
 */

const SOUND_KEY = "puzzle-play-sound";
let audioCtx = null;
let muted = false;

try {
  muted = localStorage.getItem(SOUND_KEY) === "0";
} catch {
  muted = false;
}

function getCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  return audioCtx;
}

function tone(freq, { type = "sine", dur = 0.12, gain = 0.14, delay = 0 } = {}) {
  if (muted) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* ignore */
  }
}

export function isSoundOn() {
  return !muted;
}

export function setSoundOn(on) {
  muted = !on;
  try {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function playPop() {
  tone(660, { type: "triangle", dur: 0.08, gain: 0.12 });
  tone(880, { type: "sine", dur: 0.1, gain: 0.08, delay: 0.04 });
}

export function playBonk() {
  tone(180, { type: "square", dur: 0.09, gain: 0.06 });
}

export function playWinSound() {
  if (muted) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    tone(freq, { type: "sine", dur: 0.28, gain: 0.16, delay: i * 0.09 });
  });
}

export function bindSoundToggle(btn) {
  if (!btn) return;
  // Resume audio on first gesture so default-ON sounds actually play.
  const unlock = () => {
    try {
      const ctx = getCtx();
      if (ctx?.state === "suspended") ctx.resume();
    } catch {
      /* ignore */
    }
    document.removeEventListener("pointerdown", unlock);
  };
  document.addEventListener("pointerdown", unlock, { once: true });

  const sync = () => {
    const on = isSoundOn();
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.textContent = on ? "🔊" : "🔇";
    btn.title = on ? "Sound on — tap to mute" : "Sound muted — tap to unmute";
    btn.setAttribute("aria-label", on ? "Mute sound" : "Unmute sound");
  };
  sync();
  btn.addEventListener("click", () => {
    setSoundOn(!isSoundOn());
    sync();
    if (isSoundOn()) playPop();
  });
}

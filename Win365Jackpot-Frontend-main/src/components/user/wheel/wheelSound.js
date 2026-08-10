// Synthesized sound effects (Web Audio API — no binary assets needed).
// Carried over from the retired SpinWheelModal.jsx, unchanged — shared by
// both Signup Wheel and Bonus Wheel.
let _audioCtx = null;
function getAudioCtx() {
  if (typeof window === "undefined") return null;
  if (!_audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
  }
  return _audioCtx;
}

function playTone(freq, duration, delay = 0, type = "sine", peakGain = 0.08) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const startAt = ctx.currentTime + delay;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

export function playSpinTick() { playTone(320, 0.06, 0, "square", 0.03); }

export function playWinChime(isBig) {
  const notes = isBig ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
  notes.forEach((f, i) => playTone(f, 0.35, i * 0.11, "triangle", isBig ? 0.1 : 0.07));
}

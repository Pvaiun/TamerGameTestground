let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  return audioCtx;
}

export function sfx(type) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const tone = (freq, dur, kind = 'sine', vol = 0.15) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = kind; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur);
  };
  const slide = (f1, f2, dur, kind = 'sine', vol = 0.15) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = kind;
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur);
  };
  switch (type) {
    case 'hit':     tone(220, 0.12, 'square', 0.2); break;
    case 'crit':    slide(440, 110, 0.22, 'sawtooth', 0.25); break;
    case 'heal':    slide(440, 880, 0.32, 'sine', 0.18); break;
    case 'select':  tone(660, 0.06, 'sine', 0.08); break;
    case 'faint':   slide(220, 60, 0.5, 'triangle', 0.18); break;
    case 'victory': slide(440, 880, 0.18, 'sine', 0.18); setTimeout(() => slide(660, 1100, 0.22, 'sine', 0.15), 180); break;
    case 'capture': slide(330, 770, 0.22, 'triangle', 0.16); break;
    case 'levelup': slide(660, 990, 0.18, 'sine', 0.12); setTimeout(() => slide(880, 1320, 0.18, 'sine', 0.12), 160); break;
  }
}

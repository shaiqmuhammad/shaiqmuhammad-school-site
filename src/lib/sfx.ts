"use client";
/** t420: tiny WebAudio sound effects (no files). Mute is remembered in localStorage. */
const KEY = "sm_sfx_muted_v1";
let ctx: AudioContext | null = null;
export function sfxMuted(): boolean { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }
export function setSfxMuted(m: boolean) { try { localStorage.setItem(KEY, m ? "1" : "0"); window.dispatchEvent(new Event("sm-sfx")); } catch { /* */ } }
function ac(): AudioContext | null {
  if (sfxMuted() || typeof window === "undefined") return null;
  try { if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); if (ctx.state === "suspended") void ctx.resume(); return ctx; } catch { return null; }
}
function tone(c: AudioContext, f: number, t: number, dur: number, vol = 0.15, type: OscillatorType = "sine", f2?: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
export function sfxTick() { const c = ac(); if (c) tone(c, 1100, c.currentTime, 0.05, 0.1, "triangle"); }
/** Short snare-like drum hit (noise burst). */
export function sfxDrum() {
  const c = ac(); if (!c) return;
  const len = Math.floor(c.sampleRate * 0.06), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
  f.type = "bandpass"; f.frequency.value = 1800; g.gain.value = 0.25;
  s.buffer = b; s.connect(f).connect(g).connect(c.destination); s.start();
}
export function sfxChime() { const c = ac(); if (!c) return; [523, 659, 784, 1047].forEach((f, i) => tone(c, f, c.currentTime + i * 0.11, 0.38, 0.14)); }
export function sfxPositive() { const c = ac(); if (!c) return; const t = c.currentTime; tone(c, 784, t, 0.12, 0.16, "triangle"); tone(c, 1047, t + 0.1, 0.12, 0.16, "triangle"); tone(c, 1568, t + 0.2, 0.3, 0.13, "sine"); }
export function sfxNegative() { const c = ac(); if (!c) return; const t = c.currentTime; tone(c, 440, t, 0.22, 0.13, "sine", 392); tone(c, 349, t + 0.24, 0.4, 0.13, "sine", 262); }
export function sfxPoints(pts: number) { if (pts > 0) sfxPositive(); else if (pts < 0) sfxNegative(); }

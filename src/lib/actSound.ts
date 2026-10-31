"use client";
/** t370: royalty-free activity music + sound effects, synthesised live with the Web Audio API (no audio files). */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let loop: ReturnType<typeof setInterval> | null = null;
let siteOn = true;
const KEY = "sm-act-sound";
type Prefs = { muted: boolean; vol: number };
export function soundPrefs(): Prefs {
  try { return { muted: false, vol: 0.5, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { muted: false, vol: 0.5 }; }
}
export function setSiteSound(on: boolean) { siteOn = on; try { localStorage.setItem("sm-act-site-sound", on ? "on" : "off"); } catch { /* */ } if (!on) stopMusic(); }
/** Last known admin switch (cached on the device, no server read). */
export function cachedSiteSound() { try { siteOn = localStorage.getItem("sm-act-site-sound") !== "off"; } catch { /* */ } return siteOn; }
function ac(): AudioContext | null {
  if (typeof window === "undefined" || !siteOn) return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C(); master = ctx.createGain(); master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.connect(master);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  applyPrefs();
  return ctx;
}
function applyPrefs() { const p = soundPrefs(); if (master) master.gain.value = p.muted ? 0 : p.vol; if (musicGain) musicGain.gain.value = 0.35; }
export function savePrefs(p: Prefs) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* */ } applyPrefs(); }

function tone(freq: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.25, dest?: AudioNode) {
  const c = ctx!; const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(dest || master!); o.start(at); o.stop(at + dur + 0.05);
}
// A gentle, cheerful pentatonic loop (C major pentatonic): chords + a soft melody, 8 bars, repeats.
const CHORDS = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
const MEL = [523.3, 587.3, 659.3, 784, 659.3, 587.3, 523.3, 440, 392, 440, 523.3, 587.3, 659.3, 587.3, 523.3, 392];
export function startMusic() {
  const c = ac(); if (!c || loop) return;
  let bar = 0; const beat = 0.42;
  const play = () => {
    if (!ctx) return; const t = ctx.currentTime + 0.05;
    const ch = CHORDS[bar % CHORDS.length];
    ch.forEach((f) => tone(f / 2, t, beat * 4, "triangle", 0.12, musicGain!));
    for (let i = 0; i < 4; i++) tone(MEL[(bar * 4 + i) % MEL.length], t + i * beat, beat * 0.9, "sine", 0.1, musicGain!);
    tone(ch[0] / 4, t, beat * 1.5, "sine", 0.15, musicGain!);
    bar++;
  };
  play(); loop = setInterval(play, beat * 4 * 1000);
}
export function stopMusic() { if (loop) clearInterval(loop); loop = null; }
export function musicPlaying() { return !!loop; }
export function sfx(kind: "join" | "submit" | "end" | "start" | "tick" | "chime") {
  const c = ac(); if (!c) return; const t = c.currentTime + 0.02;
  if (kind === "join") { tone(659.3, t, 0.15, "sine", 0.3); tone(987.8, t + 0.1, 0.25, "sine", 0.3); }
  else if (kind === "submit") { tone(880, t, 0.08, "square", 0.08); tone(1318.5, t + 0.06, 0.2, "triangle", 0.2); }
  else if (kind === "tick") { tone(1046.5, t, 0.09, "square", 0.12); }
  else if (kind === "chime") { [523.3, 659.3, 784, 1046.5, 784, 1046.5].forEach((f, i) => tone(f, t + i * 0.18, 0.6, "triangle", 0.28)); }
  else if (kind === "start") { [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, t + i * 0.09, 0.3, "triangle", 0.22)); }
  else { [784, 659.3, 523.3].forEach((f, i) => tone(f, t + i * 0.16, 0.35, "triangle", 0.25)); tone(261.6, t + 0.5, 0.9, "sine", 0.25); tone(392, t + 0.5, 0.9, "sine", 0.2); }
}

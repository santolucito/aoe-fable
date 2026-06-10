'use strict';
/* ====== tiny procedural sound effects (WebAudio, no assets) ====== */

let AC = null;
let sfxMuted = false;
const sfxLast = {};

function initAudio() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
}
function toggleMute() { sfxMuted = !sfxMuted; return sfxMuted; }

function tone(freq, dur, type, vol, when, slide) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'triangle';
  const t0 = AC.currentTime + (when || 0);
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol || 0.12, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(AC.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(dur, vol, when, freq) {
  const n = Math.floor(AC.sampleRate * dur);
  const buf = AC.createBuffer(1, n, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900; f.Q.value = 0.8;
  const g = AC.createGain(); g.gain.value = vol || 0.1;
  const t0 = AC.currentTime + (when || 0);
  src.connect(f).connect(g).connect(AC.destination);
  src.start(t0);
}

function sfx(name) {
  if (sfxMuted || !AC || AC.state !== 'running') return;
  const now = performance.now();
  const minGap = { fight: 120, arrow: 110, chop: 200, die: 150 }[name] || 60;
  if (sfxLast[name] && now - sfxLast[name] < minGap) return;
  sfxLast[name] = now;
  switch (name) {
    case 'click': tone(640, 0.06, 'square', 0.05, 0, 420); break;
    case 'select': tone(520, 0.05, 'triangle', 0.06, 0, 600); break;
    case 'place': tone(110, 0.22, 'sine', 0.2, 0, 55); noise(0.12, 0.08, 0, 300); break;
    case 'built': tone(392, 0.12, 'triangle', 0.1); tone(523, 0.18, 'triangle', 0.1, 0.1); break;
    case 'train': tone(523, 0.09, 'triangle', 0.09); tone(659, 0.14, 'triangle', 0.09, 0.08); break;
    case 'fight': noise(0.09, 0.1, 0, 1800); tone(190, 0.08, 'sawtooth', 0.04, 0, 120); break;
    case 'arrow': noise(0.14, 0.07, 0, 2600); break;
    case 'die': tone(220, 0.25, 'sawtooth', 0.06, 0, 70); break;
    case 'error': tone(140, 0.16, 'square', 0.07, 0, 110); break;
    case 'age': [392, 494, 587, 784].forEach((f, i) => tone(f, 0.35, 'triangle', 0.11, i * 0.13)); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'triangle', 0.12, i * 0.16)); break;
    case 'lose': [392, 311, 233, 175].forEach((f, i) => tone(f, 0.55, 'sawtooth', 0.07, i * 0.2, f * 0.9)); break;
    case 'alert': tone(880, 0.12, 'square', 0.06); tone(880, 0.12, 'square', 0.06, 0.18); break;
  }
}

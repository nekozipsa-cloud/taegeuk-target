/* 효과음: 파일 없이 WebAudio로 합성한다. 소리 끄기 설정을 따른다. */
import { settings } from './config.js';

let ac = null;
function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

/* 사용자 조작 직후 한 번 불러 브라우저 자동재생 제한을 푼다 */
export function unlockAudio() { if (settings.sound) ctx(); }

function tone(freq, dur, { type = 'sine', vol = 0.14, when = 0, slide = 0 } = {}) {
  const a = ctx(); if (!a) return;
  const t0 = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, vol = 0.12) {
  const a = ctx(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 1400;
  g.gain.value = vol;
  s.buffer = buf; s.connect(f).connect(g).connect(a.destination); s.start();
}

const last = {};
export function sfx(name) {
  if (!settings.sound) return;
  // 같은 소리가 한 프레임에 여러 번 겹치지 않게
  const now = performance.now();
  if (last[name] && now - last[name] < 45) return;
  last[name] = now;
  switch (name) {
    case 'hit': noise(0.12, 0.16); tone(220, 0.14, { type: 'triangle', slide: -120 }); break;
    case 'pop': tone(880, 0.09, { type: 'square', vol: 0.07, slide: 600 }); noise(0.06, 0.08); break;
    case 'kick': noise(0.16, 0.2); tone(140, 0.18, { type: 'sine', vol: 0.2, slide: -60 }); break;
    case 'good': tone(660, 0.1, { type: 'triangle' }); tone(990, 0.14, { type: 'triangle', when: 0.07 }); break;
    case 'perfect': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', when: i * 0.06 })); break;
    case 'soft': tone(300, 0.16, { type: 'sine', vol: 0.06, slide: -80 }); break;
    case 'count': tone(520, 0.12, { type: 'square', vol: 0.06 }); break;
    case 'go': tone(780, 0.28, { type: 'square', vol: 0.08 }); tone(1170, 0.28, { type: 'triangle', vol: 0.06 }); break;
    case 'win': [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'triangle', when: i * 0.11 })); break;
    case 'end': [784, 659, 523].forEach((f, i) => tone(f, 0.22, { type: 'triangle', when: i * 0.12 })); break;
    case 'click': tone(1200, 0.04, { type: 'square', vol: 0.04 }); break;
    case 'whoosh': noise(0.22, 0.07); break;
    case 'combo': tone(700 + Math.random() * 200, 0.08, { type: 'square', vol: 0.05 }); break;
    default: tone(600, 0.08);
  }
}

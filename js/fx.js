/* 효과(파티클·떠오르는 글자·화면 흔들림)와 공통 그리기 도우미 */
import { settings } from './config.js';

export const FONT = '"Jua", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';

export class Fx {
  constructor() { this.parts = []; this.texts = []; this.rings = []; this.shakeAmt = 0; }
  clear() { this.parts.length = 0; this.texts.length = 0; this.rings.length = 0; this.shakeAmt = 0; }

  burst(x, y, color = '#ffd400', n = 18) {
    if (settings.reduceMotion) n = Math.min(n, 5);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 380;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0.7 + Math.random() * 0.4, age: 0, color, r: 4 + Math.random() * 7, star: Math.random() < 0.35 });
    }
  }
  text(x, y, str, color = '#fff', size = 46) { this.texts.push({ x, y, str, color, size, age: 0, life: 1.0 }); }
  ring(x, y, color = '#fff', r = 60) { this.rings.push({ x, y, color, r, age: 0, life: 0.45 }); }
  shake(a = 10) { if (!settings.reduceMotion) this.shakeAmt = Math.max(this.shakeAmt, a); }

  update(dt) {
    for (const p of this.parts) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.vx *= 0.98; }
    this.parts = this.parts.filter((p) => p.age < p.life);
    for (const t of this.texts) t.age += dt;
    this.texts = this.texts.filter((t) => t.age < t.life);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
    this.shakeAmt *= Math.pow(0.002, dt);
  }

  offset() {
    if (this.shakeAmt < 0.5) return [0, 0];
    return [(Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt];
  }

  draw(g) {
    for (const r of this.rings) {
      const k = r.age / r.life;
      g.globalAlpha = 1 - k; g.strokeStyle = r.color; g.lineWidth = 10 * (1 - k) + 2;
      g.beginPath(); g.arc(r.x, r.y, r.r * (0.6 + k * 1.2), 0, Math.PI * 2); g.stroke();
    }
    for (const p of this.parts) {
      g.globalAlpha = Math.max(0, 1 - p.age / p.life); g.fillStyle = p.color;
      if (p.star) star(g, p.x, p.y, p.r * 1.6, p.age * 6);
      else { g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
    for (const t of this.texts) {
      const k = t.age / t.life;
      const s = t.size * (k < 0.15 ? 0.6 + k * 2.7 : 1);
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      outlined(g, t.str, t.x, t.y - k * 70, s, t.color);
    }
    g.globalAlpha = 1;
  }
}

export function star(g, x, y, r, rot = 0) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = rot + k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

/* 테두리 있는 큰 글자 (카메라 영상 위에서도 잘 보이게) */
export function outlined(g, str, x, y, size, color = '#fff', stroke = '#1d1b3a', align = 'center') {
  g.font = `${Math.round(size)}px ${FONT}`;
  g.textAlign = align; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = Math.max(4, size * 0.16); g.strokeStyle = stroke;
  g.strokeText(str, x, y);
  g.fillStyle = color; g.fillText(str, x, y);
}

export function emoji(g, ch, x, y, size) {
  g.font = `${Math.round(size)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, x, y);
}

export function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
}

export function pill(g, x, y, w, h, fill, strokeCol) {
  rrect(g, x - w / 2, y - h / 2, w, h, h / 2);
  g.fillStyle = fill; g.fill();
  if (strokeCol) { g.lineWidth = 4; g.strokeStyle = strokeCol; g.stroke(); }
}

export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

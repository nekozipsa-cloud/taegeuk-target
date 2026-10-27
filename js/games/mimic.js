/* 4. 동작 따라 하기 — 가운데 카드의 자세를 세 명이 함께 따라 하고 버티면 점수 */
import { MOVE_INFO } from '../config.js';

const POSES = [
  { key: 'armsUp', test: (f) => f.armsUp },
  { key: 'tpose', test: (f) => f.tpose },
  { key: 'balance', test: (f) => f.balance },
  { key: 'duck', test: (f) => f.duck },
  { key: 'block', test: (f) => f.block && !f.armsUp },
  { key: 'left', test: (f) => f.lean === -1 },
  { key: 'right', test: (f) => f.lean === 1 },
  { key: 'punch', test: () => false, event: 'punch' },
];
const HOLD = 0.5;   // 이만큼 버티면 성공

export default {
  id: 'mimic', title: '동작 따라 하기', icon: '🪞', color: '#9b6bff',
  tagline: '카드에 나온 자세를 세 명이 똑같이 따라 해요',
  howto: ['가운데 카드에 자세가 나와요', '카드가 바뀌기 전에 따라 하고 잠깐 버텨요', '내 머리 위 동그라미가 다 차면 성공!', '세 명이 모두 성공하면 완벽 호흡 보너스'],
  moves: ['armsUp', 'tpose', 'balance', 'duck', 'block', 'left', 'right', 'punch'], goal: 35, goalUnit: '성공',
  create: (ctx) => new Mimic(ctx),
};

class Mimic {
  constructor(ctx) {
    this.ctx = ctx;
    this.round = 0;
    this.newPose();
  }

  newPose() {
    const { ctx } = this;
    let p;
    do p = ctx.pick(POSES); while (this.pose && p.key === this.pose.key);
    this.pose = p;
    this.window = Math.max(2.8, 4.2 - this.round * 0.08);
    this.left = this.window;
    this.hold = [0, 0, 0];
    this.done = [false, false, false];
    this.cardPop = 0;
    this.round++;
    this.allBonus = false;
  }

  update(dt) {
    const { ctx } = this;
    this.left -= dt; this.cardPop += dt;
    for (const p of ctx.players) {
      if (!p.present || this.done[p.i]) continue;
      if (this.pose.test(p.flags)) {
        this.hold[p.i] += dt;
        if (this.hold[p.i] >= HOLD) this.success(p.i);
      } else this.hold[p.i] = Math.max(0, this.hold[p.i] - dt * 0.5);
    }
    const here = ctx.present();
    const allDone = here.length > 0 && here.every((p) => this.done[p.i]);
    if (allDone && !this.allBonus) {
      this.allBonus = true;
      if (here.length >= 2) { ctx.team(20, ctx.W / 2, ctx.H * 0.42, '완벽 호흡! +20'); ctx.sfx('perfect'); ctx.fx.burst(ctx.W / 2, ctx.H * 0.25, '#ffd400', 30); }
      this.left = Math.min(this.left, 0.7);
    }
    if (this.left <= 0) {
      if (!allDone) ctx.sfx('whoosh');
      this.newPose();
    }
  }

  success(i) {
    const { ctx } = this;
    const p = ctx.players[i];
    this.done[i] = true;
    ctx.sfx('good');
    ctx.fx.burst(p.x, p.y - p.T * 1.6, p.color, 14);
    ctx.score(i, 10, p.x, p.y - p.T * 2, '똑같아! +10');
    ctx.goal(1);
  }

  onAction(i, ev) {
    if (this.pose.event && ev.type === this.pose.event && !this.done[i]) this.success(i);
  }

  bot(i) {
    if (this.done[i] || this.window - this.left < 0.5) return null;
    const right = Math.random() < 0.8;
    const k = right ? this.pose.key : this.ctx.pick(POSES).key;
    if (k === 'punch') return { type: 'punch' };
    if (k === 'block') return { type: 'block' };
    if (k === 'left' || k === 'right') return { hold: 'lean', ms: 1200, value: k === 'left' ? -1 : 1 };
    return { hold: k, ms: 1300 };
  }

  drawBg(g) {
    const { W, H } = this.ctx;
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#d9c8ff'); grd.addColorStop(1, '#ffd9ec');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = '#c9a77c'; g.fillRect(0, H * 0.88, W, H * 0.12);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let x = 0; x < W; x += W / 10) g.fillRect(x, H * 0.88, 3, H * 0.12);
  }

  draw(g) {
    const { ctx } = this;
    const { W, H } = ctx;
    const info = MOVE_INFO[this.pose.key];
    const pop = Math.min(1, this.cardPop / 0.25);
    const cw = Math.min(W * 0.36, H * 0.6), ch = H * 0.3;
    const cx = W / 2, cy = H * 0.28;
    g.save(); g.translate(cx, cy); g.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.strokeStyle = '#9b6bff'; g.lineWidth = 8;
    g.beginPath(); g.roundRect(-cw / 2, -ch / 2, cw, ch, 28); g.fill(); g.stroke();
    ctx.emoji(g, info.icon, -cw * 0.25, 0, ch * 0.55);
    ctx.outlined(g, info.label, cw * 0.15, -ch * 0.1, ch * 0.24, '#5b3dc4', '#fff');
    g.font = `${Math.round(ch * 0.1)}px ${ctx.FONT}`; g.fillStyle = '#5b627f'; g.textAlign = 'center';
    g.fillText(info.how, cw * 0.15, ch * 0.18);
    // 남은 시간 막대
    const k = Math.max(0, this.left / this.window);
    g.fillStyle = '#eee6ff'; g.beginPath(); g.roundRect(-cw / 2 + 20, ch / 2 - 26, cw - 40, 12, 6); g.fill();
    g.fillStyle = k < 0.3 ? '#ff4f8b' : '#9b6bff'; g.beginPath(); g.roundRect(-cw / 2 + 20, ch / 2 - 26, (cw - 40) * k, 12, 6); g.fill();
    g.restore();

    // 각 플레이어 머리 위 성공 동그라미
    for (const p of ctx.players) {
      if (!p.present) continue;
      const x = p.head ? p.head.x : p.x, y = (p.head ? p.head.y : p.y) - p.T * 1.15;
      const r = Math.max(22, p.T * 0.32);
      g.lineWidth = r * 0.28;
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      const f = this.done[p.i] ? 1 : Math.min(1, this.hold[p.i] / HOLD);
      g.strokeStyle = p.color; g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); g.stroke();
      if (this.done[p.i]) ctx.outlined(g, '✓', x, y + 2, r * 1.3, '#fff', p.color);
    }
  }
}

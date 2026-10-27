/* 1. 좀비 격퇴 — 자기 칸으로 다가오는 귀여운 좀비를 지르기(키 큰 좀비)·앞차기(꼬마 좀비)로 물리친다 */

const HIT_FROM = 0.4;   // 이만큼 다가와야 맞힐 수 있음 (0=멀리, 1=코앞)

export default {
  id: 'zombie', title: '좀비 격퇴', icon: '🧟', color: '#4cc46a',
  tagline: '아장아장 다가오는 귀여운 좀비를 지르기·앞차기로 물리쳐요',
  howto: ['내 칸으로 오는 좀비를 내가 맡아요', '키 큰 좀비(가슴에 과녁) → 지르기', '꼬마 좀비(발밑에 과녁) → 앞차기', '세 명이 동시에 맞히면 합동 공격 보너스!'],
  moves: ['punch', 'kick'], goal: 40, goalUnit: '좀비',
  create: (ctx) => new Zombie(ctx),
};

class Zombie {
  constructor(ctx) {
    this.ctx = ctx;
    this.zs = [];
    this.next = [0.4, 0.9, 1.4];
    this.lastHit = [-9, -9, -9];
  }

  lanes() {
    const here = this.ctx.present().map((p) => p.i);
    return here.length ? here : [0, 1, 2];
  }

  update(dt) {
    const { ctx } = this;
    const speedUp = 1 + ctx.t / 90;
    for (const i of this.lanes()) {
      this.next[i] -= dt;
      const mine = this.zs.filter((z) => z.lane === i && !z.done);
      if (this.next[i] <= 0 && mine.length < 3) {
        this.zs.push({ lane: i, q: 0, kind: Math.random() < 0.5 ? 'tall' : 'tiny', wob: Math.random() * 6, done: null, age: 0, speed: ctx.rnd(0.16, 0.22) * speedUp });
        this.next[i] = ctx.rnd(1.6, 2.6) / speedUp;
      }
    }
    for (const z of this.zs) {
      z.age += dt;
      if (z.done) { z.doneAge += dt; continue; }
      z.q += z.speed * dt;
      // 카메라: 손·발로 직접 맞혀도 된다
      if (ctx.camera && z.q > HIT_FROM) {
        const b = this.box(z);
        const limb = ctx.touch(z.lane, b.tx, b.ty, b.tr, { hands: z.kind === 'tall', feet: z.kind === 'tiny', minSpeed: 1.6 });
        if (limb) this.hit(z, z.lane);
      }
      if (z.q >= 1) { z.done = 'sleep'; z.doneAge = 0; this.ctx.fx.text(this.box(z).x, this.box(z).y - 60, '쿨쿨… 괜찮아!', '#cfd6ff', 34); this.ctx.sfx('soft'); }
    }
    this.zs = this.zs.filter((z) => !z.done || z.doneAge < 0.7);
  }

  box(z) {
    const { W, H } = this.ctx;
    const zone = this.ctx.zone(z.lane);
    const s = (0.35 + 0.65 * z.q) * H * (z.kind === 'tall' ? 0.36 : 0.22);
    const x = zone.cx + Math.sin(z.age * 2 + z.wob) * zone.w * 0.08;
    const foot = H * (0.4 + 0.46 * z.q);
    const y = foot - s / 2;
    // 과녁: 키 큰 좀비는 가슴, 꼬마 좀비는 발밑
    const ty = z.kind === 'tall' ? foot - s * 0.62 : foot - s * 0.18;
    return { x, y, s, foot, tx: x, ty, tr: s * (z.kind === 'tall' ? 0.28 : 0.4), W };
  }

  front(lane, kind) {
    return this.zs.filter((z) => z.lane === lane && !z.done && z.q > HIT_FROM && (!kind || z.kind === kind)).sort((a, b) => b.q - a.q)[0];
  }

  onAction(i, ev) {
    if (ev.type !== 'punch' && ev.type !== 'kick') return;
    const want = ev.type === 'punch' ? 'tall' : 'tiny';
    const z = this.front(i, want);
    if (z) return this.hit(z, i);
    const other = this.front(i);
    if (other) this.ctx.fx.text(this.box(other).x, this.box(other).y - this.box(other).s * 0.7, other.kind === 'tall' ? '지르기로!' : '앞차기로!', '#fff', 34);
  }

  hit(z, i) {
    const { ctx } = this;
    const b = this.box(z);
    z.done = 'hit'; z.doneAge = 0;
    ctx.sfx(z.kind === 'tall' ? 'hit' : 'kick');
    ctx.fx.burst(b.tx, b.ty, '#a6f28b', 16); ctx.fx.ring(b.tx, b.ty, ctx.players[i].color, b.tr);
    ctx.score(i, 10, b.x, b.y - b.s * 0.7, z.kind === 'tall' ? '펑! +10' : '뻥! +10');
    ctx.goal(1);
    this.lastHit[i] = ctx.t;
    const here = ctx.present();
    if (here.length >= 2 && here.every((p) => ctx.t - this.lastHit[p.i] < 1.5)) {
      ctx.team(15, ctx.W / 2, ctx.H * 0.32, '합동 공격! +15');
      ctx.sfx('perfect'); ctx.fx.shake(10);
      here.forEach((p) => { this.lastHit[p.i] = -9; });
    }
  }

  bot(i) {
    const z = this.front(i);
    if (!z || Math.random() < 0.2) return null;
    const right = Math.random() < 0.88;
    return { type: (z.kind === 'tall') === right ? 'punch' : 'kick' };
  }

  drawBg(g) {
    const { W, H } = this.ctx;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#5b4b9e'); sky.addColorStop(0.55, '#c98bd6'); sky.addColorStop(1, '#ffd6b0');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff6c9'; g.beginPath(); g.arc(W * 0.82, H * 0.16, H * 0.08, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7bc47f'; g.beginPath(); g.moveTo(0, H * 0.4);
    for (let x = 0; x <= W; x += W / 12) g.lineTo(x, H * 0.38 + Math.sin(x * 0.01) * H * 0.02);
    g.lineTo(W, H); g.lineTo(0, H); g.fill();
    for (let i = 0; i < 3; i++) {
      const z = this.ctx.zone(i);
      g.fillStyle = 'rgba(255,240,210,0.55)';
      g.beginPath(); g.moveTo(z.cx - z.w * 0.06, H * 0.4); g.lineTo(z.cx + z.w * 0.06, H * 0.4); g.lineTo(z.cx + z.w * 0.4, H); g.lineTo(z.cx - z.w * 0.4, H); g.fill();
    }
    for (const [x, y] of [[0.08, 0.5], [0.3, 0.45], [0.64, 0.47], [0.93, 0.55]]) this.ctx.emoji(g, '🪦', W * x, H * y, H * 0.06);
  }

  draw(g) {
    const sorted = [...this.zs].sort((a, b) => a.q - b.q);
    for (const z of sorted) {
      const b = this.box(z);
      const fade = z.done ? Math.max(0, 1 - z.doneAge / 0.7) : 1;
      g.save(); g.globalAlpha = fade;
      if (z.done === 'hit') { g.translate(b.x, b.foot); g.rotate(z.doneAge * 4); g.translate(-b.x, -b.foot); }
      drawZombie(g, b, z);
      g.restore();
      if (!z.done && z.q > HIT_FROM) {
        // 과녁
        const pulse = 1 + Math.sin(z.age * 8) * 0.08;
        g.lineWidth = 6; g.strokeStyle = '#fff';
        g.fillStyle = z.kind === 'tall' ? 'rgba(255,79,139,0.55)' : 'rgba(31,168,255,0.55)';
        g.beginPath(); g.arc(b.tx, b.ty, b.tr * 0.55 * pulse, 0, Math.PI * 2); g.fill(); g.stroke();
        this.ctx.emoji(g, z.kind === 'tall' ? '👊' : '🦵', b.tx, b.ty, b.tr * 0.6);
      }
    }
  }
}

function drawZombie(g, b, z) {
  const { x, foot, s } = b;
  const tall = z.kind === 'tall';
  const w = s * (tall ? 0.5 : 0.75), h = s;
  const top = foot - h;
  const sleepy = z.done === 'sleep';
  g.lineWidth = Math.max(3, s * 0.03); g.strokeStyle = '#2d4a2f';
  // 다리
  g.fillStyle = '#6b5ca5';
  const step = Math.sin(z.age * 7) * w * 0.08;
  g.fillRect(x - w * 0.3 + step, foot - h * 0.22, w * 0.22, h * 0.22);
  g.fillRect(x + w * 0.08 - step, foot - h * 0.22, w * 0.22, h * 0.22);
  // 몸
  g.fillStyle = '#9be38f';
  g.beginPath(); g.roundRect(x - w / 2, top + h * 0.38, w, h * 0.45, w * 0.25); g.fill(); g.stroke();
  // 팔 (앞으로 쭉)
  g.fillStyle = '#8fd884';
  g.beginPath(); g.roundRect(x - w * 0.62, top + h * 0.45, w * 0.22, h * 0.12, 8); g.fill(); g.stroke();
  g.beginPath(); g.roundRect(x + w * 0.4, top + h * 0.42, w * 0.22, h * 0.12, 8); g.fill(); g.stroke();
  // 머리
  const hr = w * (tall ? 0.5 : 0.42);
  const hy = top + hr * 0.9;
  g.fillStyle = '#b3f0a3'; g.beginPath(); g.arc(x, hy, hr, 0, Math.PI * 2); g.fill(); g.stroke();
  // 반창고
  g.fillStyle = '#ffe2a8'; g.save(); g.translate(x + hr * 0.45, hy - hr * 0.55); g.rotate(0.6); g.fillRect(-hr * 0.3, -hr * 0.1, hr * 0.6, hr * 0.2); g.restore();
  // 눈
  g.fillStyle = '#fff';
  for (const dx of [-0.38, 0.38]) { g.beginPath(); g.arc(x + dx * hr, hy - hr * 0.05, hr * 0.26, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#2b2a4a';
  if (sleepy) { g.lineWidth = hr * 0.08; for (const dx of [-0.38, 0.38]) { g.beginPath(); g.moveTo(x + (dx - 0.15) * hr, hy); g.lineTo(x + (dx + 0.15) * hr, hy); g.stroke(); } }
  else for (const dx of [-0.38, 0.38]) { g.beginPath(); g.arc(x + dx * hr + hr * 0.05, hy - hr * 0.02, hr * 0.12, 0, Math.PI * 2); g.fill(); }
  // 입
  g.strokeStyle = '#2d4a2f'; g.lineWidth = hr * 0.07;
  g.beginPath(); g.arc(x, hy + hr * 0.38, hr * 0.2, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
}

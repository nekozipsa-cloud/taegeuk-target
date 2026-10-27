/* 2. 장애물 달리기 — 내 트랙으로 달려오는 장애물을 숙이기·옆걸음·발차기로 넘는다 */

const KINDS = {
  branch: { need: 'duck', tip: '숙여요!', badge: '🙇' },
  rockL: { need: 'right', tip: '오른쪽으로!', badge: '➡️' },   // 왼쪽 바위 → 오른쪽으로 비켜요
  rockR: { need: 'left', tip: '왼쪽으로!', badge: '⬅️' },
  box: { need: 'kick', tip: '발차기!', badge: '🦵' },
};
const KICK_FROM = 0.45;   // 상자는 이만큼 다가오면 찰 수 있음
const MEMORY = 0.6;       // 방금 한 숙이기·좌우 동작을 이만큼(초) 기억
const HORIZON = 0.36;     // 지평선 높이 (화면 비율)
const GROUND = 0.88;

export default {
  id: 'runner', title: '태권 히어로 장애물 달리기', icon: '🏃', color: '#ff8a3d',
  tagline: '내 트랙으로 달려오는 장애물을 숙이고, 피하고, 격파해요',
  howto: ['내 칸 트랙은 내가 맡아요', '낮은 나뭇가지 → 숙이기', '바위가 왼쪽이면 오른쪽으로, 오른쪽이면 왼쪽으로 한 걸음', '나무 상자 → 발차기로 뻥!'],
  moves: ['duck', 'left', 'right', 'kick'], goal: 36, goalUnit: '장애물',
  botEvery: [450, 900],
  create: (ctx) => new Run(ctx),
};

class Run {
  constructor(ctx) {
    this.ctx = ctx;
    this.obs = [];
    this.lane = [0, 1, 2].map((i) => ({ dist: 0, slow: 0, oops: 0, next: 0.8 + i * 0.4 }));
    this.last = [{}, {}, {}];        // 플레이어별 마지막 동작 시각
    this.lastOk = [-9, -9, -9];
    this.meters = 0;
  }

  lanes() {
    const here = this.ctx.present().map((p) => p.i);
    return here.length ? here : [0, 1, 2];
  }

  speed(i) {
    const base = 0.36 * (1 + this.ctx.t / 110);
    return this.lane[i].slow > 0 ? base * 0.5 : base;
  }

  update(dt) {
    const { ctx } = this;
    const active = this.lanes();
    for (const i of active) {
      const L = this.lane[i];
      L.slow = Math.max(0, L.slow - dt); L.oops = Math.max(0, L.oops - dt);
      L.dist += this.speed(i) * dt;
      this.meters += this.speed(i) * dt * 12;
      L.next -= dt;
      const mine = this.obs.filter((o) => o.lane === i && !o.done);
      const gapOk = mine.every((o) => o.q > 0.38);
      if (L.next <= 0 && gapOk) {
        const kind = ctx.pick(['branch', 'rockL', 'rockR', 'box']);
        this.obs.push({ lane: i, kind, q: 0, age: 0, done: null, doneAge: 0 });
        L.next = ctx.rnd(2.8, 3.8) / (1 + ctx.t / 110);
      }
    }
    for (const o of this.obs) {
      o.age += dt;
      if (o.done) { o.doneAge += dt; continue; }
      // 자리를 비운 사람의 트랙은 조용히 치운다
      if (!ctx.players[o.lane].present && ctx.present().length) { o.done = 'gone'; continue; }
      o.q += this.speed(o.lane) * dt;
      // 카메라: 발로 직접 상자를 차도 된다
      if (ctx.camera && o.kind === 'box' && o.q > KICK_FROM) {
        const b = this.box(o);
        if (ctx.touch(o.lane, b.x, b.y - b.s * 0.4, b.s * 0.6, { hands: false, feet: true, minSpeed: 1.6 })) this.clear(o, o.lane);
      }
      if (o.q >= 1) this.judge(o);
    }
    this.obs = this.obs.filter((o) => !o.done || o.doneAge < 0.8);
  }

  /* 장애물이 내 앞에 도착: 맞는 자세였는지 본다 */
  judge(o) {
    const { ctx } = this;
    const i = o.lane, f = ctx.players[i].flags, last = this.last[i], t = ctx.t;
    const recent = (k) => t - (last[k] ?? -9) < MEMORY;
    let ok = false;
    if (o.kind === 'branch') ok = f.duck || recent('duck');
    else if (o.kind === 'rockL') ok = f.lean === 1 || (recent('right') && f.lean !== -1);
    else if (o.kind === 'rockR') ok = f.lean === -1 || (recent('left') && f.lean !== 1);
    if (ok) this.clear(o, i);
    else this.stumble(o, i);
  }

  clear(o, i) {
    const { ctx } = this;
    const b = this.box(o);
    o.done = o.kind === 'box' ? 'broke' : 'pass'; o.doneAge = 0;
    ctx.sfx(o.kind === 'box' ? 'kick' : 'good');
    ctx.fx.burst(b.x, b.y - b.s * 0.4, o.kind === 'box' ? '#d9a066' : ctx.players[i].color, 14);
    const label = { branch: '쏙! +10', rockL: '휙! +10', rockR: '휙! +10', box: '뻥! +10' }[o.kind];
    ctx.score(i, 10, b.x, b.y - b.s - 20, label);
    ctx.goal(1);
    this.lastOk[i] = ctx.t;
    const here = ctx.present();
    if (here.length >= 2 && here.every((p) => ctx.t - this.lastOk[p.i] < 1.5)) {
      ctx.team(15, ctx.W / 2, ctx.H * 0.3, '척척 팀워크! +15');
      ctx.sfx('perfect'); ctx.fx.shake(8);
      here.forEach((p) => { this.lastOk[p.i] = -9; });
    }
  }

  stumble(o, i) {
    const { ctx } = this;
    const z = ctx.zone(i);
    o.done = 'miss'; o.doneAge = 0;
    this.lane[i].slow = 1.2; this.lane[i].oops = 1.2;
    ctx.sfx('soft');
    ctx.fx.text(z.cx, ctx.H * 0.5, '꽈당! 괜찮아!', '#ffe9a8', 38);
  }

  /* 장애물 화면 위치: q(0=지평선, 1=내 발 앞) → 원근 */
  box(o) {
    const { H } = this.ctx;
    const z = this.ctx.zone(o.lane);
    const k = Math.pow(Math.min(o.q, 1.05), 1.5);
    const y = H * (HORIZON + (GROUND - HORIZON) * k);
    const hw = z.w * (0.06 + 0.36 * k);
    const sc = 0.2 + 0.8 * k;
    const x = o.kind === 'rockL' ? z.cx - hw * 0.5 : o.kind === 'rockR' ? z.cx + hw * 0.5 : z.cx;
    return { x, y, hw, s: H * 0.16 * sc, sc };
  }

  front(i) {
    return this.obs.filter((o) => o.lane === i && !o.done).sort((a, b) => b.q - a.q)[0];
  }

  onAction(i, ev) {
    this.last[i][ev.type] = this.ctx.t;
    if (ev.type !== 'kick') return;
    const o = this.front(i);
    if (o && o.kind === 'box' && o.q >= KICK_FROM) this.clear(o, i);
  }

  bot(i) {
    const o = this.front(i);
    if (!o || o.q < 0.3 || Math.random() < 0.1) return null;
    const right = Math.random() < 0.86;
    const ms = ((1 - o.q) / this.speed(i)) * 1000 + 500;
    if (o.kind === 'box') return o.q >= KICK_FROM && right ? { type: 'kick' } : null;
    if (o.kind === 'branch') return right ? { hold: 'duck', ms } : { hold: 'lean', ms, value: this.ctx.pick([-1, 1]) };
    const v = o.kind === 'rockL' ? 1 : -1;
    return { hold: 'lean', ms, value: right ? v : -v };
  }

  drawBg(g) {
    const { W, H } = this.ctx;
    const sky = g.createLinearGradient(0, 0, 0, H * HORIZON);
    sky.addColorStop(0, '#5ec8ff'); sky.addColorStop(1, '#c9f0ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H * HORIZON + 2);
    // 먼 산·구름
    g.fillStyle = '#9fd6a8';
    g.beginPath(); g.moveTo(0, H * HORIZON);
    for (let x = 0; x <= W; x += W / 10) g.lineTo(x, H * (HORIZON - 0.05) - Math.abs(Math.sin(x * 0.006)) * H * 0.07);
    g.lineTo(W, H * HORIZON); g.fill();
    for (const [x, y] of [[0.15, 0.1], [0.55, 0.07], [0.85, 0.14]]) this.ctx.emoji(g, '☁️', W * x, H * y, H * 0.07);
    const grass = g.createLinearGradient(0, H * HORIZON, 0, H);
    grass.addColorStop(0, '#8fd16a'); grass.addColorStop(1, '#4fa83d');
    g.fillStyle = grass; g.fillRect(0, H * HORIZON, W, H * (1 - HORIZON));
    for (let i = 0; i < 3; i++) this.drawTrack(g, i, false);
  }

  /* 트랙: 배경 모드에서는 꽉 찬 흙길, 카메라 모드에서는 반투명 테두리만 */
  drawTrack(g, i, thin) {
    const { H } = this.ctx;
    const z = this.ctx.zone(i);
    const yT = H * HORIZON, yB = H;
    const kB = Math.pow((1 - HORIZON) / (GROUND - HORIZON), 1.5);
    const hwT = z.w * 0.06, hwB = z.w * (0.06 + 0.36 * kB);
    g.beginPath(); g.moveTo(z.cx - hwT, yT); g.lineTo(z.cx + hwT, yT); g.lineTo(z.cx + hwB, yB); g.lineTo(z.cx - hwB, yB); g.closePath();
    if (thin) { g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.45)'; g.stroke(); return; }
    g.fillStyle = '#e7c48c'; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#fff6dd'; g.stroke();
    // 앞으로 흘러가는 줄무늬 (달리는 느낌)
    const L = this.lane[i];
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let n = 0; n < 5; n++) {
      const q = (n / 5 + (L.dist % 1) * 1) % 1;
      const k = Math.pow(q, 1.5);
      const y = H * (HORIZON + (GROUND - HORIZON) * k);
      const w = z.w * 0.025 * (0.2 + 0.8 * k), h = H * 0.03 * (0.2 + 0.8 * k);
      g.fillRect(z.cx - w / 2, y - h / 2, w, h);
    }
  }

  draw(g) {
    const { ctx } = this;
    const { H } = ctx;
    if (ctx.camera) for (const i of this.lanes()) this.drawTrack(g, i, true);
    const sorted = [...this.obs].sort((a, b) => a.q - b.q);
    for (const o of sorted) {
      const b = this.box(o);
      const fade = o.done ? Math.max(0, 1 - o.doneAge / 0.8) : 1;
      g.save(); g.globalAlpha = fade;
      if (o.done === 'broke') drawBroken(g, b, o.doneAge);
      else if (o.done === 'pass' || o.done === 'gone') { g.globalAlpha = fade * 0.5; drawObstacle(g, ctx, o, b); }
      else drawObstacle(g, ctx, o, b);
      g.restore();
      // 동작 힌트 배지
      if (!o.done && o.q > 0.3) {
        const r = Math.max(18, b.s * 0.32), by = o.kind === 'branch' ? b.y - b.s * 2.1 : b.y - b.s * 1.35;
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.strokeStyle = '#1d1b3a'; g.lineWidth = 4;
        g.beginPath(); g.arc(b.x, by, r, 0, Math.PI * 2); g.fill(); g.stroke();
        ctx.emoji(g, KINDS[o.kind].badge, b.x, by, r * 1.15);
      }
    }
    // 넘어졌을 때 별이 빙글
    for (const i of this.lanes()) {
      const L = this.lane[i];
      if (L.oops <= 0) continue;
      const z = ctx.zone(i);
      const a = ctx.t * (ctx.reduce ? 2 : 6);
      for (let k = 0; k < 3; k++) ctx.emoji(g, '💫', z.cx + Math.cos(a + k * 2.1) * z.w * 0.1, H * 0.42 + Math.sin(a + k * 2.1) * H * 0.02, H * 0.05);
    }
  }

  drawFront(g) {
    const { ctx } = this;
    const { W, H } = ctx;
    const s = Math.min(W, H) * 0.045;
    const txt = `🏃 함께 달린 거리 ${Math.floor(this.meters)}m`;
    g.font = `${s}px ${ctx.FONT}`;
    const w = g.measureText(txt).width + s * 1.4;
    g.fillStyle = 'rgba(29,27,58,0.6)';
    g.beginPath(); g.roundRect(W / 2 - w / 2, H * 0.13 - s * 0.8, w, s * 1.6, s * 0.8); g.fill();
    ctx.outlined(g, txt, W / 2, H * 0.13, s, '#fff');
  }
}

function drawObstacle(g, ctx, o, b) {
  const { x, y, s, hw } = b;
  g.lineWidth = Math.max(2, s * 0.04); g.strokeStyle = '#3b2a1a';
  // 그림자
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x, y, (o.kind === 'branch' ? hw : s * 0.55), s * 0.1, 0, 0, Math.PI * 2); g.fill();
  if (o.kind === 'branch') {
    // 기둥 두 개 + 낮게 걸린 나뭇가지 현수막
    const top = y - s * 1.6, bar = y - s * 1.25;
    g.fillStyle = '#8a5a2b';
    for (const dx of [-hw * 0.95, hw * 0.95]) { g.beginPath(); g.roundRect(x + dx - s * 0.06, top, s * 0.12, y - top, s * 0.04); g.fill(); g.stroke(); }
    g.fillStyle = '#a86b33';
    g.beginPath(); g.roundRect(x - hw, bar - s * 0.12, hw * 2, s * 0.24, s * 0.1); g.fill(); g.stroke();
    for (const dx of [-0.7, 0, 0.7]) ctx.emoji(g, '🌿', x + hw * dx, bar + s * 0.12, s * 0.35);
  } else if (o.kind === 'box') {
    const w = s * 0.8;
    g.fillStyle = '#d9a066';
    g.beginPath(); g.roundRect(x - w / 2, y - w, w, w, s * 0.06); g.fill(); g.stroke();
    g.strokeStyle = '#8a5a2b'; g.lineWidth = Math.max(2, s * 0.06);
    g.beginPath(); g.moveTo(x - w / 2, y - w); g.lineTo(x + w / 2, y); g.moveTo(x + w / 2, y - w); g.lineTo(x - w / 2, y); g.stroke();
  } else {
    // 동글동글 바위 (눈이 있는 귀여운 바위)
    g.fillStyle = '#a3a8b8';
    g.beginPath(); g.ellipse(x, y - s * 0.38, s * 0.55, s * 0.42, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#c9cdd8'; g.beginPath(); g.ellipse(x - s * 0.18, y - s * 0.55, s * 0.16, s * 0.1, -0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b2a4a';
    for (const dx of [-0.15, 0.15]) { g.beginPath(); g.arc(x + dx * s, y - s * 0.38, s * 0.05, 0, Math.PI * 2); g.fill(); }
  }
}

function drawBroken(g, b, age) {
  const { x, y, s } = b;
  const w = s * 0.4, spread = age * s * 2.2;
  g.fillStyle = '#d9a066'; g.strokeStyle = '#3b2a1a'; g.lineWidth = Math.max(2, s * 0.04);
  for (const [dx, dy, r] of [[-1, -1, -0.8], [1, -1, 0.8], [-1, 0.3, -0.5], [1, 0.3, 0.5]]) {
    g.save(); g.translate(x + dx * spread, y - s * 0.5 + dy * spread * 0.6); g.rotate(r * age * 6);
    g.beginPath(); g.rect(-w / 2, -w / 2, w, w); g.fill(); g.stroke(); g.restore();
  }
}

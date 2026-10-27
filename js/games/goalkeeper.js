/* 3. 발차기 문지기 — 내 칸 왼쪽·오른쪽에서 공이 날아오면 그쪽으로 발차기해서 막는다 */

export default {
  id: 'goalkeeper', title: '발차기 문지기', icon: '🥅', color: '#1fa8ff',
  tagline: '왼쪽·오른쪽에서 날아오는 공을 그 방향 발차기로 막아요',
  howto: ['내 칸 양옆에 화살표와 공이 나타나요', '공이 오는 쪽으로 발을 차요 (화면 기준)', '왼쪽 공 → 왼쪽 발차기, 오른쪽 공 → 오른쪽 발차기', '세 명이 다 막으면 철벽 수비 보너스!'],
  moves: ['kick', 'left', 'right'], goal: 45, goalUnit: '막기',
  create: (ctx) => new Keeper(ctx),
};

const TRAVEL = 2.4;   // 공이 도착하기까지 초

class Keeper {
  constructor(ctx) {
    this.ctx = ctx;
    this.balls = [];
    this.next = [0.6, 1.2, 1.8];
    this.saves = [0, 0, 0];
    this.wall = [-9, -9, -9];
  }

  update(dt) {
    const { ctx } = this;
    const lanes = ctx.present().map((p) => p.i);
    for (const i of (lanes.length ? lanes : [0, 1, 2])) {
      this.next[i] -= dt;
      if (this.next[i] <= 0 && !this.balls.some((b) => b.lane === i && !b.done)) {
        this.balls.push({ lane: i, side: Math.random() < 0.5 ? -1 : 1, t: 0, travel: TRAVEL / (1 + ctx.t / 100), done: null, doneT: 0, spin: 0 });
        this.next[i] = ctx.rnd(0.5, 1.2);
      }
    }
    for (const b of this.balls) {
      if (b.done) { b.doneT += dt; continue; }
      b.t += dt; b.spin += dt * 8;
      if (b.t >= b.travel) {
        b.done = 'miss'; b.doneT = 0;
        const p = this.pos(b);
        ctx.fx.text(p.x, p.y - 50, '아깝다! 괜찮아', '#fff', 32); ctx.sfx('soft');
      }
    }
    this.balls = this.balls.filter((b) => !b.done || b.doneT < 0.8);
  }

  pos(b) {
    const { ctx } = this;
    const z = ctx.zone(b.lane), H = ctx.H;
    const k = Math.min(1, b.t / b.travel);
    const sx = z.cx + b.side * z.w * 0.48, ex = z.cx + b.side * z.w * 0.2;
    if (b.done === 'save') {
      return { x: ex + b.side * b.doneT * z.w * 1.4, y: H * 0.55 - b.doneT * H * 0.8, r: H * 0.05, k };
    }
    return { x: sx + (ex - sx) * k, y: H * 0.24 + Math.sin(k * Math.PI) * -H * 0.06 + k * H * 0.35, r: H * (0.03 + 0.03 * k), k };
  }

  onAction(i, ev) {
    let dir = 0;
    if (ev.type === 'kick') dir = ev.dir || 0;
    else if ((ev.type === 'left' || ev.type === 'right') && ev.src !== 'camera') dir = ev.type === 'left' ? -1 : 1;
    else return;
    const b = this.balls.find((x) => x.lane === i && !x.done);
    if (!b) return;
    const p = this.ctx.players[i];
    // 카메라 앞차기라 방향이 애매하면 찬 발이 몸 중심 어느 쪽인지로 본다
    if (ev.type === 'kick' && dir === 0 && ev.src === 'camera') dir = ev.x < p.x ? -1 : 1;
    if (dir === 0) return;
    if (b.t / b.travel < 0.25) return;   // 너무 이르면 기다리기
    if (dir !== b.side) { this.ctx.fx.text(this.pos(b).x, this.pos(b).y - 40, b.side < 0 ? '왼쪽이야!' : '오른쪽이야!', '#fff', 34); return; }
    this.save(b, i);
  }

  save(b, i) {
    const { ctx } = this;
    const p = this.pos(b);
    b.done = 'save'; b.doneT = 0;
    ctx.sfx('kick'); ctx.fx.burst(p.x, p.y, '#ffffff', 14); ctx.fx.ring(p.x, p.y, ctx.players[i].color, 60);
    ctx.score(i, 10, p.x, p.y - 50, '막았다! +10');
    ctx.goal(1);
    this.saves[i]++;
    this.wall[i] = ctx.t;
    const here = ctx.present();
    if (here.length >= 2 && here.every((q) => ctx.t - this.wall[q.i] < 1.8)) {
      ctx.team(15, ctx.W / 2, ctx.H * 0.3, '철벽 수비! +15'); ctx.sfx('perfect');
      here.forEach((q) => { this.wall[q.i] = -9; });
    }
  }

  bot(i) {
    const b = this.balls.find((x) => x.lane === i && !x.done);
    if (!b || b.t / b.travel < 0.3) return null;
    const ok = Math.random() < 0.85;
    return { type: 'kick', dir: ok ? b.side : -b.side };
  }

  drawBg(g) {
    const { W, H } = this.ctx;
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#8fd8ff'); grd.addColorStop(0.45, '#c9efff'); grd.addColorStop(0.46, '#62c46b'); grd.addColorStop(1, '#3fa955');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 6;
    for (let i = 0; i < 3; i++) {
      const z = this.ctx.zone(i);
      g.strokeRect(z.cx - z.w * 0.32, H * 0.48, z.w * 0.64, H * 0.4);
    }
  }

  draw(g) {
    const { ctx } = this;
    const H = ctx.H;
    for (let i = 0; i < 3; i++) {
      const z = ctx.zone(i);
      // 양옆 골대 표시
      for (const s of [-1, 1]) {
        const active = this.balls.some((b) => b.lane === i && !b.done && b.side === s);
        const x = z.cx + s * z.w * 0.4;
        g.fillStyle = active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.35)';
        g.beginPath(); g.roundRect(x - z.w * 0.07, H * 0.15, z.w * 0.14, H * 0.12, 14); g.fill();
        ctx.outlined(g, s < 0 ? '◀' : '▶', x, H * 0.21, H * 0.07, active ? ctx.players[i].color : '#b9c2d6');
      }
    }
    for (const b of this.balls) {
      const p = this.pos(b);
      g.save();
      if (b.done === 'miss') g.globalAlpha = Math.max(0, 1 - b.doneT / 0.8);
      g.translate(p.x, p.y); g.rotate(b.spin);
      ctx.emoji(g, '⚽', 0, 0, p.r * 2.2);
      g.restore();
      if (!b.done) {
        // 남은 시간 링
        g.strokeStyle = ctx.players[b.lane].color; g.lineWidth = 6;
        g.beginPath(); g.arc(p.x, p.y, p.r * 1.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p.k)); g.stroke();
        ctx.outlined(g, b.side < 0 ? '← 왼쪽 차기' : '오른쪽 차기 →', ctx.zone(b.lane).cx, H * 0.36, H * 0.045, '#fff', ctx.players[b.lane].color);
      }
    }
  }
}

/* 2. 풍선 격파 — 화면 곳곳에서 떠오르는 풍선을 세 명이 손·발로 터뜨린다.
 * 카메라: 손·발이 풍선에 닿으면 펑. 키보드·데모: 지르기는 내 칸의 높은 풍선, 발차기는 낮은 풍선. */

const COLORS = ['#ff5d8f', '#ffb000', '#4cc46a', '#1fa8ff', '#9b6bff', '#ff7a3d'];

export default {
  id: 'balloon', title: '풍선 격파', icon: '🎈', color: '#ff7a3d',
  tagline: '둥실둥실 떠오르는 풍선을 손과 발로 펑펑 터뜨려요',
  howto: ['풍선이 아래에서 위로 떠올라요', '손이나 발을 풍선에 대면 펑!', '키 높은 풍선은 지르기, 낮은 풍선은 발차기', '금색 팀 풍선은 세 명이 한 번씩 쳐야 터져요'],
  moves: ['punch', 'kick'], goal: 60, goalUnit: '풍선',
  create: (ctx) => new Balloon(ctx),
};

class Balloon {
  constructor(ctx) {
    this.ctx = ctx;
    this.bs = [];
    this.spawnT = 0;
    this.goldT = 12;
  }

  spawn(gold = false) {
    const { ctx } = this;
    const lanes = ctx.present().map((p) => p.i);
    const lane = gold ? 1 : ctx.pick(lanes.length ? lanes : [0, 1, 2]);
    const z = ctx.zone(lane);
    const r = Math.min(ctx.W, ctx.H) * (gold ? 0.11 : ctx.rnd(0.055, 0.075));
    this.bs.push({
      x: gold ? ctx.W / 2 : ctx.rnd(z.x0 + r * 1.2, z.x1 - r * 1.2), y: ctx.H + r * 2, r, lane,
      vy: ctx.H * (gold ? 0.07 : ctx.rnd(0.11, 0.17)), sway: Math.random() * 6,
      color: gold ? '#ffd400' : ctx.pick(COLORS), gold, hitBy: new Set(), pop: 0, age: 0,
    });
  }

  update(dt) {
    const { ctx } = this;
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawn(); this.spawnT = ctx.rnd(0.45, 0.85) / (1 + ctx.t / 120); }
    this.goldT -= dt;
    if (this.goldT <= 0 && !this.bs.some((b) => b.gold && !b.pop)) { this.spawn(true); this.goldT = 18; ctx.banner('금색 팀 풍선! 세 명이 한 번씩!', 1800); }
    for (const b of this.bs) {
      b.age += dt;
      if (b.pop) { b.pop += dt; continue; }
      b.y -= b.vy * dt;
      b.x += Math.sin(b.age * 1.6 + b.sway) * 18 * dt;
      if (ctx.camera) for (const p of ctx.players) {
        if (ctx.touch(p.i, b.x, b.y, b.r, { minSpeed: 0.8 })) this.hit(b, p.i);
      }
    }
    this.bs = this.bs.filter((b) => (b.pop ? b.pop < 0.35 : b.y > -b.r * 3));
  }

  hit(b, i) {
    const { ctx } = this;
    if (b.pop) return;
    if (b.gold) {
      if (b.hitBy.has(i)) return;
      b.hitBy.add(i);
      ctx.sfx('good'); ctx.fx.ring(b.x, b.y, ctx.players[i].color, b.r);
      ctx.score(i, 5, b.x, b.y - b.r, '+5');
      const need = Math.max(1, ctx.present().length);
      if (b.hitBy.size < need) return;
      b.pop = 0.001;
      ctx.team(30, b.x, b.y, '팀 풍선 펑! +30');
      ctx.sfx('perfect'); ctx.fx.burst(b.x, b.y, '#ffd400', 40); ctx.fx.shake(12);
      ctx.goal(3);
      return;
    }
    b.pop = 0.001;
    ctx.sfx('pop');
    ctx.fx.burst(b.x, b.y, b.color, 14);
    ctx.score(i, 5, b.x, b.y - b.r, '펑! +5');
    ctx.goal(1);
  }

  /* 키보드·데모: 내 칸에서 높이에 맞는 가장 가까운 풍선 */
  target(i, kind) {
    const { ctx } = this;
    const z = ctx.zone(i);
    const mid = ctx.H * 0.55;
    const inZone = this.bs.filter((b) => !b.pop && b.y < ctx.H - b.r && b.y > b.r && (b.gold ? !b.hitBy.has(i) : b.x > z.x0 - b.r && b.x < z.x1 + b.r));
    const fit = inZone.filter((b) => (kind === 'kick' ? b.y >= mid : b.y < mid));
    const list = fit.length ? fit : inZone;
    return list.sort((a, b) => (b.gold - a.gold) || (b.y - a.y))[0];
  }

  onAction(i, ev) {
    if (ev.type !== 'punch' && ev.type !== 'kick') return;
    // 카메라에서는 실제로 닿아야 터진다 (update에서 처리). 다른 입력은 가장 가까운 풍선.
    if (ev.src === 'camera') return;
    const b = this.target(i, ev.type);
    if (b) this.hit(b, i);
  }

  bot(i) {
    const b = this.target(i);
    if (!b || Math.random() < 0.15) return null;
    return { type: b.y >= this.ctx.H * 0.55 ? 'kick' : 'punch' };
  }

  drawBg(g) {
    const { W, H } = this.ctx;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#6fc8ff'); sky.addColorStop(1, '#dff4ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y, s] of [[0.15, 0.18, 1], [0.55, 0.1, 1.3], [0.85, 0.25, 0.9]]) {
      const r = H * 0.05 * s;
      g.beginPath(); g.arc(W * x, H * y, r, 0, Math.PI * 2); g.arc(W * x + r, H * y + r * 0.2, r * 0.8, 0, Math.PI * 2); g.arc(W * x - r, H * y + r * 0.25, r * 0.7, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#8fdc7a'; g.fillRect(0, H * 0.9, W, H * 0.1);
  }

  draw(g) {
    for (const b of this.bs) {
      const k = b.pop ? 1 + b.pop * 3 : 1;
      g.save(); g.globalAlpha = b.pop ? Math.max(0, 1 - b.pop / 0.35) : 1;
      // 끈
      g.strokeStyle = 'rgba(60,60,90,0.6)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(b.x, b.y + b.r * 1.1); g.quadraticCurveTo(b.x + Math.sin(b.age * 3) * 12, b.y + b.r * 1.7, b.x, b.y + b.r * 2.3); g.stroke();
      // 풍선
      g.fillStyle = b.color; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(b.x, b.y, b.r * k, b.r * 1.15 * k, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.ellipse(b.x - b.r * 0.35, b.y - b.r * 0.45, b.r * 0.18, b.r * 0.3, -0.5, 0, Math.PI * 2); g.fill();
      if (b.gold && !b.pop) {
        const need = Math.max(1, this.ctx.present().length);
        this.ctx.outlined(g, `${b.hitBy.size}/${need}`, b.x, b.y, b.r * 0.6, '#fff');
        this.ctx.players.forEach((p, n) => {
          g.fillStyle = b.hitBy.has(n) ? p.color : 'rgba(255,255,255,0.6)';
          g.beginPath(); g.arc(b.x + (n - 1) * b.r * 0.5, b.y + b.r * 0.62, b.r * 0.13, 0, Math.PI * 2); g.fill();
        });
      }
      g.restore();
    }
  }
}

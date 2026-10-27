/* 5. 연속 콤보 챌린지 — 줄을 타고 오는 신호가 판정선에 닿을 때 다 함께 같은 동작! */

const SIGNS = {
  punch: { icon: '👊', label: '지르기', color: '#ff5d73' },
  block: { icon: '🙆', label: '막기', color: '#3fa9ff' },
  kick: { icon: '🦵', label: '발차기', color: '#ffb020' },
};
const TYPES = Object.keys(SIGNS);
const WINDOW = 0.35;     // 판정선 앞뒤로 이만큼(초) 안에 하면 성공
const LEAD = 2.6;        // 신호가 나타나서 판정선까지 걸리는 시간

export default {
  id: 'combo', title: '연속 콤보 챌린지', icon: '⚡', color: '#ffcf1f',
  tagline: '신호가 줄에 닿는 순간 다 함께 지르기·막기·발차기!',
  howto: ['오른쪽에서 신호가 와요', '판정선 동그라미에 닿을 때 그 동작!', '한 명이라도 맞히면 콤보가 이어져요', '세 명이 모두 맞히면 3인 콤보 보너스!'],
  moves: ['punch', 'block', 'kick'], goal: 35, goalUnit: '콤보',
  botEvery: [220, 420],
  create: (ctx) => new Combo(ctx),
};

class Combo {
  constructor(ctx) {
    this.ctx = ctx;
    this.notes = [];
    this.nextAt = 1.2 + LEAD;    // 다음 신호가 판정선에 닿을 시각
    this.combo = 0; this.best = 0;
    this.pop = 0;
    this.botPlan = [null, null, null];
  }

  hitX() { return this.ctx.W * 0.16; }
  trackY() { return this.ctx.H * 0.3; }
  speed() { return (this.ctx.W * 0.95 - this.hitX()) / LEAD; }
  noteX(n) { return this.hitX() + (n.at - this.ctx.t) * this.speed(); }

  update(dt) {
    const { ctx } = this;
    this.pop = Math.max(0, this.pop - dt);
    // 신호 만들기 (점점 빨라지는 박자)
    while (this.nextAt - ctx.t < LEAD + 0.2) {
      let type; do type = ctx.pick(TYPES); while (this.notes.length && type === this.notes[this.notes.length - 1].type && Math.random() < 0.5);
      this.notes.push({ at: this.nextAt, type, hits: [false, false, false], cleared: false, done: null, doneAge: 0 });
      this.nextAt += ctx.clamp(1.7 - ctx.t * 0.012, 0.95, 1.7) * ctx.pick([1, 1, 1, 1.5]);
    }
    for (const n of this.notes) {
      if (n.done) { n.doneAge += dt; continue; }
      if (ctx.t > n.at + WINDOW) this.close(n);
    }
    this.notes = this.notes.filter((n) => !n.done || n.doneAge < 0.6);
  }

  /* 판정 시간이 끝난 신호 정리 */
  close(n) {
    const { ctx } = this;
    n.done = n.cleared ? 'ok' : 'miss';
    if (n.cleared) {
      const here = ctx.present();
      if (here.length >= 2 && here.every((p) => n.hits[p.i])) {
        ctx.team(20, ctx.W / 2, ctx.H * 0.42, here.length === 3 ? '3인 콤보! +20' : '모두 콤보! +20');
        ctx.sfx('perfect'); ctx.fx.shake(8);
        ctx.fx.burst(this.hitX(), this.trackY(), '#ffe14d', 26);
      }
    } else {
      if (this.combo >= 3) ctx.fx.text(ctx.W / 2, ctx.H * 0.42, '괜찮아, 다시!', '#cfd6ff', 44);
      this.combo = 0;
      ctx.sfx('soft');
    }
  }

  live(type) {
    const t = this.ctx.t;
    return this.notes.find((n) => !n.done && (!type || n.type === type) && Math.abs(n.at - t) <= WINDOW);
  }

  onAction(i, ev) {
    const { ctx } = this;
    if (!SIGNS[ev.type]) return;
    const n = this.live(ev.type);
    if (!n || n.hits[i]) return;
    n.hits[i] = true;
    const z = ctx.zone(i);
    ctx.sfx('combo');
    ctx.fx.ring(this.hitX(), this.trackY(), ctx.players[i].color, Math.min(ctx.W, ctx.H) * 0.07);
    const perfect = Math.abs(n.at - ctx.t) < 0.12;
    ctx.score(i, perfect ? 12 : 8, z.cx, ctx.H * 0.52, perfect ? '딱 맞아! +12' : '좋아! +8');
    if (!n.cleared) {
      n.cleared = true;
      this.combo++; this.best = Math.max(this.best, this.combo); this.pop = 0.25;
      ctx.goal(1);
      if (this.combo % 10 === 0) { ctx.team(30, ctx.W / 2, ctx.H * 0.42, `${this.combo} 콤보! +30`); ctx.sfx('perfect'); }
    }
  }

  bot(i) {
    const { ctx } = this;
    // 판정선에 가까운 신호를 노린다 (가끔 놓치거나 다른 동작)
    const n = this.notes.find((m) => !m.done && !m.hits[i] && Math.abs(m.at - ctx.t) <= WINDOW * 0.85);
    if (!n) return null;
    if (this.botPlan[i] === n) return null;
    this.botPlan[i] = n;
    const r = Math.random();
    if (r < 0.15) return null;
    return { type: r < 0.92 ? n.type : ctx.pick(TYPES.filter((x) => x !== n.type)) };
  }

  drawBg(g) {
    const { W, H } = this.ctx;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#20194a'); bg.addColorStop(0.5, '#3a2a86'); bg.addColorStop(1, '#ff6fa8');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 무대 조명
    const beat = this.pop > 0 ? 0.25 : 0.12;
    for (const x of [0.2, 0.5, 0.8]) {
      g.fillStyle = `rgba(255,255,255,${beat})`;
      g.beginPath(); g.moveTo(W * x - W * 0.02, 0); g.lineTo(W * x + W * 0.02, 0); g.lineTo(W * x + W * 0.12, H); g.lineTo(W * x - W * 0.12, H); g.fill();
    }
    g.fillStyle = '#2b1f5c'; g.fillRect(0, H * 0.86, W, H * 0.14);
  }

  draw(g) {
    const { ctx } = this;
    const { W, H } = ctx;
    const s = Math.min(W, H);
    const y = this.trackY(), hx = this.hitX(), th = s * 0.16;
    // 신호 줄
    g.fillStyle = 'rgba(29,27,58,0.55)';
    g.beginPath(); g.roundRect(W * 0.04, y - th / 2, W * 0.92, th, th / 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3; g.stroke();
    // 판정선 동그라미
    const live = this.live();
    g.lineWidth = 8; g.strokeStyle = live ? '#ffe14d' : '#fff';
    g.beginPath(); g.arc(hx, y, th * 0.48, 0, Math.PI * 2); g.stroke();
    ctx.outlined(g, '여기서!', hx, y - th * 0.75, s * 0.035, '#fff');
    // 신호들
    for (const n of this.notes) {
      const x = this.noteX(n);
      if (x > W * 0.97) continue;
      const S = SIGNS[n.type];
      const fade = n.done ? Math.max(0, 1 - n.doneAge / 0.6) : 1;
      g.save(); g.globalAlpha = fade;
      const r = th * 0.4 * (n.done === 'ok' && !ctx.reduce ? 1 + n.doneAge : 1);
      g.fillStyle = n.done === 'miss' ? '#8a8aa8' : S.color;
      g.lineWidth = 5; g.strokeStyle = '#fff';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      ctx.emoji(g, S.icon, x, y, r * 1.1);
      // 플레이어별 체크 표시
      ctx.players.forEach((p, k) => {
        if (!p.present) return;
        const cx = x + (k - 1) * r * 0.75, cy = y + th * 0.72;
        g.fillStyle = n.hits[k] ? p.color : 'rgba(255,255,255,0.35)';
        g.beginPath(); g.arc(cx, cy, r * 0.26, 0, Math.PI * 2); g.fill();
        if (n.hits[k]) ctx.outlined(g, '✓', cx, cy + 1, r * 0.4, '#fff', p.color);
      });
      g.restore();
    }
    // 판정선에 닿은 신호 이름
    if (live) ctx.outlined(g, SIGNS[live.type].label + '!', hx, y + th * 1.2, s * 0.05, SIGNS[live.type].color);
    // 큰 콤보 숫자
    const k = 1 + this.pop * (ctx.reduce ? 0.4 : 1.6);
    if (this.combo > 0) ctx.outlined(g, `${this.combo} 콤보`, W * 0.58, H * 0.47, s * 0.1 * k, '#ffe14d');
    else ctx.outlined(g, '박자에 맞춰 함께!', W * 0.58, H * 0.47, s * 0.055, '#fff');
  }
}

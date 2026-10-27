/* 5. 균형 잡기 섬 — 세 명이 한 발 균형을 잡으면 섬이 떠오르고, 아무도 안 하면 천천히 가라앉는다.
 * 가끔 바람이 불면 반대쪽으로 몸을 기울여 섬을 바로 세운다. */

export default {
  id: 'island', title: '균형 잡기 섬', icon: '🏝️', color: '#00b4a6',
  tagline: '한 발로 버티며 가라앉는 섬을 셋이서 지켜요',
  howto: ['한 발을 들고 버티면 섬이 떠올라요', '여럿이 함께 버틸수록 더 빨리 떠올라요', '바람이 불면 화살표 쪽으로 몸을 기울여요', '섬이 안전선 위에 있는 시간이 팀 점수!'],
  moves: ['balance', 'left', 'right'], goal: 45, goalUnit: '안전 초',
  create: (ctx) => new Island(ctx),
};

class Island {
  constructor(ctx) {
    this.ctx = ctx;
    this.h = 0.6;          // 섬 높이 0(물속)~1
    this.tilt = 0;         // 바람 기울기 -1~1
    this.wind = null;      // { need: -1|1, t }
    this.windIn = 7;
    this.safeAcc = 0;
    this.scoreAcc = [0, 0, 0];
    this.wave = 0;
  }

  update(dt) {
    const { ctx } = this;
    this.wave += dt;
    const here = ctx.present();
    const n = Math.max(1, here.length);
    const bal = here.filter((p) => p.flags.balance);
    this.h += (bal.length / n * 0.28 - 0.13 - Math.abs(this.tilt) * 0.08) * dt;
    this.h = ctx.clamp(this.h, 0, 1);
    for (const p of bal) {
      this.scoreAcc[p.i] += dt;
      if (this.scoreAcc[p.i] >= 1) { this.scoreAcc[p.i] -= 1; ctx.score(p.i, 3, p.x, p.y - p.T * 1.6, '+3'); }
    }
    if (this.h > 0.4) {
      this.safeAcc += dt;
      if (this.safeAcc >= 1) { this.safeAcc -= 1; ctx.goal(1); }
    }
    if (this.h <= 0.02 && !this.warned) { this.warned = true; ctx.banner('섬이 잠겼어요! 다 같이 한 발 들기!', 1800); ctx.sfx('soft'); }
    if (this.h > 0.3) this.warned = false;

    // 바람
    if (!this.wind) {
      this.windIn -= dt;
      this.tilt *= Math.pow(0.3, dt);
      if (this.windIn <= 0) {
        const from = Math.random() < 0.5 ? -1 : 1;
        this.wind = { need: -from, t: 0, fixed: new Set() };
        ctx.banner(from < 0 ? '바람이 왼쪽에서! 오른쪽으로 기울여요 →' : '← 바람이 오른쪽에서! 왼쪽으로 기울여요', 2000);
        ctx.sfx('whoosh');
      }
    } else {
      const w = this.wind;
      w.t += dt;
      this.tilt = ctx.clamp(this.tilt - w.need * dt * 0.5, -1, 1);
      for (const p of here) if (p.flags.lean === w.need && !w.fixed.has(p.i)) {
        w.fixed.add(p.i); ctx.score(p.i, 8, p.x, p.y - p.T * 2, '버텼다! +8'); ctx.sfx('good');
      }
      const enough = w.fixed.size >= Math.max(1, Math.ceil(here.length / 2));
      if (enough || w.t > 5) {
        if (enough) { ctx.team(10, ctx.W / 2, ctx.H * 0.35, '바람을 이겼다! +10'); ctx.sfx('perfect'); }
        this.wind = null; this.windIn = ctx.rnd(6, 9);
      }
    }
  }

  onAction() { /* 지속 자세만 쓴다 */ }

  bot(i) {
    if (this.wind && !this.wind.fixed.has(i) && Math.random() < 0.85) return { hold: 'lean', ms: 900, value: this.wind.need };
    return Math.random() < 0.85 ? { hold: 'balance', ms: this.ctx.rnd(1400, 2600) } : null;
  }

  waterY() { return this.ctx.H * 0.62; }

  drawBg(g) {
    const { W, H } = this.ctx;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#ffe7a8'); sky.addColorStop(0.6, '#ffc7a3'); sky.addColorStop(1, '#ff9fae');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(W * 0.15, H * 0.18, H * 0.09, 0, Math.PI * 2); g.fill();
    this.drawWater(g, 0.85);
  }

  drawWater(g, alpha) {
    const { W, H } = this.ctx;
    const wy = this.waterY();
    g.fillStyle = `rgba(40,170,220,${alpha})`;
    g.beginPath(); g.moveTo(0, wy);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, wy + Math.sin(x * 0.02 + this.wave * 2.5) * 8);
    g.lineTo(W, H); g.lineTo(0, H); g.fill();
  }

  draw(g) {
    const { ctx } = this;
    const { W, H } = ctx;
    const wy = this.waterY();
    const iy = wy - (this.h - 0.3) * H * 0.35;   // 섬 윗면 높이
    const iw = W * 0.5;
    g.save();
    g.translate(W / 2, iy); g.rotate(this.tilt * 0.18);
    // 섬
    g.fillStyle = '#e8c27a'; g.strokeStyle = '#a77b3a'; g.lineWidth = 6;
    g.beginPath(); g.ellipse(0, 0, iw / 2, H * 0.07, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#6cc46a'; g.beginPath(); g.ellipse(0, -H * 0.02, iw * 0.46, H * 0.045, 0, Math.PI, 0); g.fill();
    ctx.emoji(g, '🌴', -iw * 0.36, -H * 0.1, H * 0.14);
    // 친구 동물 (플레이어마다 한 마리, 균형 잡으면 한 발로 섬)
    ctx.players.forEach((p, n) => {
      const x = (n - 1) * iw * 0.26;
      ctx.emoji(g, p.flags.balance ? '🦩' : '🐧', x, -H * 0.075, H * 0.1);
      g.fillStyle = p.color; g.beginPath(); g.arc(x, -H * 0.15, H * 0.017, 0, Math.PI * 2); g.fill();
    });
    g.restore();
    // 물 앞면 (섬이 잠기는 느낌)
    if (!ctx.camera) this.drawWater(g, 0.45); else this.drawWater(g, 0.35);
    // 안전선
    const sy = wy - (0.4 - 0.3) * H * 0.35;
    g.setLineDash([16, 12]); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(W * 0.2, sy); g.lineTo(W * 0.8, sy); g.stroke(); g.setLineDash([]);
    ctx.outlined(g, '안전선', W * 0.83, sy, H * 0.032, '#fff', '#1a7fb0');
    // 높이 게이지
    const gx = W * 0.94, gy0 = H * 0.15, gh = H * 0.45;
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.roundRect(gx - 16, gy0, 32, gh, 16); g.fill();
    g.fillStyle = this.h > 0.4 ? '#00b4a6' : '#ff4f8b';
    g.beginPath(); g.roundRect(gx - 16, gy0 + gh * (1 - this.h), 32, gh * this.h, 16); g.fill();
    ctx.emoji(g, '🏝️', gx, gy0 - 26, 34);
    // 바람 화살표
    if (this.wind) {
      const dir = this.wind.need;
      for (let k = 0; k < 3; k++) {
        const x = W / 2 - dir * W * 0.3 + dir * ((this.wind.t * 300 + k * 140) % (W * 0.6));
        ctx.emoji(g, '💨', x, H * 0.12 + k * 30, 46);
      }
      ctx.outlined(g, dir > 0 ? '기울이기 →' : '← 기울이기', W / 2, H * 0.08, H * 0.055, '#fff', '#1a7fb0');
    }
  }
}

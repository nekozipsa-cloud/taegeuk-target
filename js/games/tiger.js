/* 4. 호랑이 발자국 추적 — 호랑이가 보여 준 발자국 순서를 팀이 함께 기억해서 따라 한다 */

const SPOTS = [
  { move: 'left', fx: 0.1, fy: 0.6, label: '왼쪽', icon: '⬅️' },
  { move: 'block', fx: 0.3, fy: 0.34, label: '막기', icon: '🙆' },
  { move: 'punch', fx: 0.5, fy: 0.48, label: '지르기', icon: '👊' },
  { move: 'kick', fx: 0.7, fy: 0.68, label: '발차기', icon: '🦵' },
  { move: 'right', fx: 0.9, fy: 0.6, label: '오른쪽', icon: '➡️' },
];
const MOVES = SPOTS.map((s) => s.move);
const STEP = 0.75;      // 발자국 하나 보여 주는 시간
const LEAD = 0.9;       // 보여 주기 전 "잘 봐요!" 시간
const IDLE = 8;         // 아무도 안 하면 다시 보여 줌

export default {
  id: 'tiger', title: '호랑이 발자국 추적', icon: '🐯', color: '#ff9f1c',
  tagline: '호랑이 발자국 순서를 다 함께 기억해서 따라가요',
  howto: ['호랑이가 발자국을 순서대로 보여 줘요', '보여 주는 동안은 잘 보기만 해요', '끝나면 순서대로 동작! 누가 해도 돼요', '틀리면 호랑이가 다시 보여 줘요'],
  moves: ['left', 'block', 'punch', 'kick', 'right'], goal: 30, goalUnit: '발자국',
  botEvery: [500, 1000],
  create: (ctx) => new Tiger(ctx),
};

class Tiger {
  constructor(ctx) {
    this.ctx = ctx;
    this.len = 3;
    this.seq = this.makeSeq(3);
    this.pos = 0;
    this.phase = 'show'; this.age = 0;
    this.lastStep = { k: -1, at: -9 };
    this.touchCool = 0;
    this.flash = null;       // 방금 밟은 발자국 반짝
    this.tiger = { x: ctx.W / 2, y: ctx.H * 0.2 };
  }

  makeSeq(n) {
    const s = [];
    while (s.length < n) { const k = Math.floor(Math.random() * SPOTS.length); if (k !== s[s.length - 1]) s.push(k); }
    return s;
  }

  spot(k) {
    const { W, H } = this.ctx, sp = SPOTS[k];
    return { x: W * sp.fx, y: H * sp.fy, r: Math.min(W, H) * 0.085 };
  }

  setPhase(p) { this.phase = p; this.age = 0; }

  /* 보여 주는 중 지금 반짝이는 발자국 (없으면 -1) */
  showing() {
    if (this.phase !== 'show') return -1;
    const k = Math.floor((this.age - LEAD) / STEP);
    if (this.age < LEAD || k >= this.seq.length) return -1;
    return (this.age - LEAD) % STEP < STEP * 0.72 ? this.seq[k] : -1;
  }

  update(dt) {
    const { ctx } = this;
    this.age += dt;
    this.touchCool = Math.max(0, this.touchCool - dt);
    if (this.flash) { this.flash.age += dt; if (this.flash.age > 0.45) this.flash = null; }
    const glow = this.showing();
    if (this.phase === 'show') {
      if (glow >= 0 && glow !== this._lastGlow) ctx.sfx('pop');
      this._lastGlow = glow;
      if (this.age >= LEAD + this.seq.length * STEP + 0.2) { this.setPhase('input'); this.pos = 0; ctx.sfx('go'); }
    } else if (this.phase === 'input') {
      // 카메라: 다음 발자국 자리에 손·발을 뻗어도 된다
      if (ctx.camera && this.touchCool <= 0) {
        const want = this.spot(this.seq[this.pos]);
        for (const p of ctx.present()) if (ctx.touch(p.i, want.x, want.y, want.r)) { this.step(p.i, this.seq[this.pos]); break; }
      }
      if (this.phase === 'input' && this.age > IDLE) { ctx.banner('한 번 더 보여 줄게!', 1400); this.setPhase('show'); }
    } else if (this.phase === 'good') {
      if (this.age > 1.4) { this.seq = this.makeSeq(this.len); this.setPhase('show'); }
    } else if (this.phase === 'oops') {
      if (this.age > 1.4) this.setPhase('show');
    }
    // 호랑이는 반짝이는 발자국 위로 깡총
    const target = glow >= 0 ? this.spot(glow) : { x: ctx.W / 2, y: ctx.H * 0.22 + this.spot(0).r };
    const k = Math.min(1, dt * 9);
    this.tiger.x += (target.x - this.tiger.x) * k;
    this.tiger.y += (target.y - this.spot(0).r * 1.3 - this.tiger.y) * k;
  }

  onAction(i, ev) {
    const { ctx } = this;
    const k = MOVES.indexOf(ev.type);
    if (k < 0) return;
    if (this.phase === 'show') {
      if (ctx.t - (this._waitTip || -9) > 1.5) { this._waitTip = ctx.t; ctx.fx.text(ctx.zone(i).cx, ctx.H * 0.3, '잘 봐요! 👀', '#fff', 32); }
      return;
    }
    if (this.phase !== 'input') return;
    const want = this.seq[this.pos];
    if (k === want) return this.step(i, k);
    // 친구랑 같은 발자국을 거의 동시에 했으면 같이 한 걸로 쳐요
    if (k === this.lastStep.k && ctx.t - this.lastStep.at < 0.8) return;
    this.oops();
  }

  step(i, k) {
    const { ctx } = this;
    const sp = this.spot(k);
    this.pos++; this.age = 0; this.touchCool = 0.45;
    this.lastStep = { k, at: ctx.t };
    this.flash = { k, age: 0, i };
    ctx.sfx('hit');
    ctx.fx.ring(sp.x, sp.y, ctx.players[i].color, sp.r);
    ctx.score(i, 5, sp.x, sp.y - sp.r * 1.2, '🐾 +5');
    ctx.goal(1);
    if (this.pos >= this.seq.length) {
      const bonus = this.seq.length * 5;
      ctx.team(bonus, ctx.W / 2, ctx.H * 0.3, `발자국 완성! +${bonus}`);
      ctx.sfx('perfect'); ctx.fx.burst(ctx.W / 2, ctx.H * 0.3, '#ffb627', 30);
      this.len = Math.min(7, this.len + 1);
      this.setPhase('good');
    }
  }

  oops() {
    const { ctx } = this;
    ctx.sfx('soft');
    ctx.banner('다시 보여 줄게! 🐯', 1400);
    this.pos = 0;
    this.lastStep = { k: -1, at: -9 };
    this.setPhase('oops');
  }

  bot() {
    if (this.phase !== 'input' || Math.random() < 0.35) return null;
    const want = MOVES[this.seq[this.pos]];
    return { type: Math.random() < 0.95 ? want : this.ctx.pick(MOVES.filter((m) => m !== want)) };
  }

  drawBg(g) {
    const { W, H } = this.ctx;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2f8a5b'); bg.addColorStop(0.5, '#6cc36e'); bg.addColorStop(1, '#b8e08a');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 흙길
    g.fillStyle = 'rgba(214,170,110,0.55)';
    g.beginPath(); g.moveTo(0, H * 0.62);
    for (let x = 0; x <= W; x += W / 16) g.lineTo(x, H * 0.55 + Math.sin(x * 0.008) * H * 0.08);
    g.lineTo(W, H * 0.8);
    for (let x = W; x >= 0; x -= W / 16) g.lineTo(x, H * 0.72 + Math.sin(x * 0.008) * H * 0.08);
    g.fill();
    const s = Math.min(W, H);
    for (const [x, y, e] of [[0.04, 0.2, '🌳'], [0.2, 0.12, '🌲'], [0.8, 0.12, '🌲'], [0.96, 0.22, '🌳'], [0.4, 0.9, '🌿'], [0.62, 0.92, '🌿']]) this.ctx.emoji(g, e, W * x, H * y, s * 0.12);
  }

  draw(g) {
    const { ctx } = this;
    const { W, H } = ctx;
    const s = Math.min(W, H);
    const glow = this.showing();
    SPOTS.forEach((sp, k) => {
      const p = this.spot(k);
      const lit = glow === k;
      const fl = this.flash && this.flash.k === k ? 1 - this.flash.age / 0.45 : 0;
      const want = this.phase === 'input' && ctx.camera;
      const pulse = lit && !ctx.reduce ? 1 + Math.sin(this.age * 14) * 0.05 : 1;
      g.lineWidth = 6; g.strokeStyle = '#fff';
      g.fillStyle = lit ? 'rgba(255,200,40,0.9)' : fl > 0 ? `rgba(255,255,255,${0.35 + fl * 0.5})` : want ? 'rgba(255,255,255,0.28)' : 'rgba(29,27,58,0.35)';
      g.beginPath(); g.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2); g.fill(); g.stroke();
      ctx.emoji(g, lit ? '🐾' : sp.icon, p.x, p.y, p.r * (lit ? 1.1 : 0.8));
      ctx.outlined(g, sp.label, p.x, p.y + p.r + s * 0.035, s * 0.04, lit ? '#ffd23f' : '#fff');
    });
    // 호랑이
    const hop = glow >= 0 && !ctx.reduce ? Math.abs(Math.sin(this.age * Math.PI / STEP)) * s * 0.03 : 0;
    ctx.emoji(g, '🐯', this.tiger.x, this.tiger.y - hop, s * 0.12);
    // 진행 점 + 안내
    const n = this.seq.length, gap = s * 0.06, y = H * 0.16;
    for (let k = 0; k < n; k++) {
      const x = W / 2 + (k - (n - 1) / 2) * gap;
      const done = this.phase === 'good' || (this.phase === 'input' && k < this.pos);
      const shownK = this.phase === 'show' && this.age > LEAD + k * STEP;
      g.lineWidth = 4; g.strokeStyle = '#1d1b3a';
      g.fillStyle = done ? '#ffd23f' : shownK ? 'rgba(255,200,40,0.6)' : 'rgba(255,255,255,0.7)';
      g.beginPath(); g.arc(x, y, s * 0.022, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    const msg = this.phase === 'show' ? '잘 봐요! 👀' : this.phase === 'input' ? `이제 우리 차례! ${this.pos + 1}번째 발자국` : this.phase === 'good' ? '어흥! 최고야!' : '';
    if (msg) ctx.outlined(g, msg, W / 2, H * 0.23, s * 0.05, '#fff');
  }
}

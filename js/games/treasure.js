/* 3. 띠 색깔 보물 찾기 — 가운데 나온 띠 색깔에 맞는 동작을 하면 보석을 찾는다 */

const BELTS = [
  { name: '노란띠', color: '#ffd21f', move: 'left', icon: '⬅️', word: '왼쪽' },
  { name: '파란띠', color: '#2f7bff', move: 'right', icon: '➡️', word: '오른쪽' },
  { name: '빨간띠', color: '#ff3b3b', move: 'block', icon: '🙆', word: '막기' },
  { name: '초록띠', color: '#2fbf55', move: 'punch', icon: '👊', word: '지르기' },
  { name: '검은띠', color: '#26263a', move: 'duck', icon: '🙇', word: '숙이기' },
];
const MOVES = BELTS.map((b) => b.move);

export default {
  id: 'treasure', title: '띠 색깔 보물 찾기', icon: '🎨', color: '#a45cff',
  tagline: '띠 색깔을 보고 맞는 동작을 하면 보석이 쏙!',
  howto: ['가운데 나온 띠 색깔을 잘 봐요', '노랑=왼쪽, 파랑=오른쪽, 빨강=막기, 초록=지르기, 검정=숙이기', '세 명 모두 각자 해서 보석을 찾아요', '모두 성공하면 팀 보너스!'],
  moves: ['left', 'right', 'block', 'punch', 'duck'], goal: 40, goalUnit: '보석',
  create: (ctx) => new Treasure(ctx),
};

class Treasure {
  constructor(ctx) {
    this.ctx = ctx;
    this.cur = -1;
    this.phase = 'rest'; this.age = 0; this.restFor = 0.8;
    this.got = [false, false, false];
    this.gotAt = [0, 0, 0];
    this.hintAt = [-9, -9, -9];
    this.limit = 3.5;
  }

  ask() {
    const { ctx } = this;
    let k; do k = Math.floor(Math.random() * BELTS.length); while (k === this.cur);
    this.cur = k; this.phase = 'ask'; this.age = 0;
    this.got = [false, false, false];
    this.limit = ctx.clamp(3.6 - ctx.t * 0.02, 2.4, 3.6);   // 점점 빨라져요
    ctx.sfx('whoosh');
  }

  rest(sec) { this.phase = 'rest'; this.age = 0; this.restFor = sec; }

  update(dt) {
    const { ctx } = this;
    this.age += dt;
    if (this.phase === 'rest') { if (this.age >= this.restFor) this.ask(); return; }
    const here = ctx.present();
    if (here.length && here.every((p) => this.got[p.i])) {
      if (here.length >= 2) { ctx.team(15, ctx.W / 2, ctx.H * 0.48, '모두 성공! +15'); ctx.sfx('perfect'); ctx.fx.burst(ctx.W / 2, ctx.H * 0.33, BELTS[this.cur].color, 24); }
      this.rest(1.2);
    } else if (this.age >= this.limit) {
      for (const p of here) if (!this.got[p.i]) ctx.fx.text(ctx.zone(p.i).cx, ctx.H * 0.55, '괜찮아! 다음엔 쏙!', '#cfd6ff', 32);
      ctx.sfx('soft');
      this.rest(1.0);
    }
  }

  onAction(i, ev) {
    const { ctx } = this;
    if (this.phase !== 'ask' || this.got[i] || !MOVES.includes(ev.type)) return;
    const belt = BELTS[this.cur];
    const z = ctx.zone(i);
    if (ev.type === belt.move) {
      this.got[i] = true; this.gotAt[i] = ctx.t;
      ctx.sfx('good');
      ctx.fx.burst(z.cx, ctx.H * 0.55, belt.color, 16); ctx.fx.ring(z.cx, ctx.H * 0.55, ctx.players[i].color, 50);
      ctx.score(i, 10, z.cx, ctx.H * 0.48, '💎 +10');
      ctx.goal(1);
    } else if (ctx.t - this.hintAt[i] > 0.8) {
      this.hintAt[i] = ctx.t;
      ctx.fx.text(z.cx, ctx.H * 0.6, `${belt.name}는 ${belt.word}!`, '#fff', 30);
    }
  }

  bot(i) {
    if (this.phase !== 'ask' || this.got[i] || Math.random() < 0.15) return null;
    const want = BELTS[this.cur].move;
    return { type: Math.random() < 0.85 ? want : this.ctx.pick(MOVES.filter((m) => m !== want)) };
  }

  drawBg(g) {
    const { W, H } = this.ctx;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#3b2f7a'); bg.addColorStop(0.6, '#7a4fc2'); bg.addColorStop(1, '#f2b6e0');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 반짝이는 별
    for (let k = 0; k < 24; k++) {
      const x = (k * 157.3) % W, y = ((k * 91.7) % (H * 0.6));
      g.globalAlpha = 0.35 + 0.35 * Math.sin(this.ctx.t * 2 + k);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 2 + (k % 3), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#5a3d8f'; g.fillRect(0, H * 0.86, W, H * 0.14);
  }

  draw(g) {
    const { ctx } = this;
    const { W, H } = ctx;
    const s = Math.min(W, H);
    this.drawLegend(g, s);
    // 가운데 띠
    if (this.cur >= 0) {
      const belt = BELTS[this.cur];
      const fade = this.phase === 'rest' ? Math.max(0, 1 - this.age / 0.4) : Math.min(1, this.age / 0.15);
      g.save(); g.globalAlpha = fade;
      const pop = this.phase === 'ask' && !ctx.reduce ? 1 + Math.max(0, 0.15 - this.age) * 1.5 : 1;
      drawBelt(g, W / 2, H * 0.33, s * 0.5 * pop, s * 0.075 * pop, belt.color);
      ctx.outlined(g, belt.name + '!', W / 2, H * 0.33 + s * 0.13, s * 0.08, belt.color === '#26263a' ? '#fff' : belt.color);
      // 남은 시간 막대
      if (this.phase === 'ask') {
        const k = Math.max(0, 1 - this.age / this.limit), bw = s * 0.42, bh = s * 0.022, by = H * 0.33 + s * 0.2;
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.roundRect(W / 2 - bw / 2, by, bw, bh, bh / 2); g.fill();
        g.fillStyle = k < 0.3 ? '#ff7a7a' : '#fff'; g.beginPath(); g.roundRect(W / 2 - bw / 2, by, bw * k, bh, bh / 2); g.fill();
      }
      g.restore();
    }
    // 플레이어별 보물상자 (내 칸 발밑 옆)
    for (const p of ctx.players) {
      if (!p.present) continue;
      const z = ctx.zone(p.i), y = H * 0.93;
      const got = this.got[p.i] && this.cur >= 0;
      const bob = got && !ctx.reduce ? Math.sin((ctx.t - this.gotAt[p.i]) * 8) * s * 0.01 : 0;
      drawChest(g, z.cx + z.w * 0.28, y, s * 0.055, got ? BELTS[this.cur].color : '#c08a4a', got);
      if (got) ctx.emoji(g, '💎', z.cx + z.w * 0.28, y - s * 0.07 + bob, s * 0.065);
    }
  }

  /* 위쪽 색깔표: 상자 + 동작 (시간이 반쯤 지나면 정답 상자가 반짝 — 힌트) */
  drawLegend(g, s) {
    const { ctx } = this;
    const { W, H } = ctx;
    const gap = Math.min(W * 0.17, s * 0.32), y = H * 0.17;
    const hint = this.phase === 'ask' && this.age > this.limit * 0.45;
    BELTS.forEach((b, k) => {
      const x = W / 2 + (k - 2) * gap;
      const on = hint && k === this.cur;
      g.fillStyle = on ? 'rgba(255,255,255,0.85)' : 'rgba(29,27,58,0.55)';
      g.beginPath(); g.roundRect(x - gap * 0.45, y - s * 0.07, gap * 0.9, s * 0.15, s * 0.03); g.fill();
      if (on) { g.lineWidth = 5; g.strokeStyle = b.color; g.stroke(); }
      drawChest(g, x - gap * 0.2, y + s * 0.01, s * 0.045, b.color, false);
      ctx.emoji(g, b.icon, x + gap * 0.18, y - s * 0.015, s * 0.05);
      ctx.outlined(g, b.word, x + gap * 0.18, y + s * 0.045, s * 0.03, '#fff');
    });
  }
}

/* 태권도 띠: 가운데 매듭 + 늘어진 끝자락 */
function drawBelt(g, x, y, w, h, color) {
  g.lineWidth = Math.max(3, h * 0.12); g.strokeStyle = '#1d1b3a'; g.fillStyle = color;
  g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, h * 0.3); g.fill(); g.stroke();
  for (const d of [-1, 1]) {
    g.beginPath();
    g.moveTo(x + d * h * 0.3, y); g.lineTo(x + d * h * 1.3, y + h * 1.9); g.lineTo(x + d * h * 0.6, y + h * 2.1); g.lineTo(x, y + h * 0.3);
    g.closePath(); g.fill(); g.stroke();
  }
  g.beginPath(); g.roundRect(x - h * 0.55, y - h * 0.7, h * 1.1, h * 1.4, h * 0.3); g.fill(); g.stroke();
}

function drawChest(g, x, y, r, band, open) {
  g.lineWidth = Math.max(2, r * 0.08); g.strokeStyle = '#3b2a1a';
  g.fillStyle = '#b97a3c';
  g.beginPath(); g.roundRect(x - r, y - r * 0.2, r * 2, r * 0.9, r * 0.12); g.fill(); g.stroke();
  // 뚜껑
  g.save();
  if (open) { g.translate(x - r, y - r * 0.2); g.rotate(-0.5); g.translate(-(x - r), -(y - r * 0.2)); }
  g.fillStyle = '#d39554';
  g.beginPath(); g.roundRect(x - r, y - r * 0.75, r * 2, r * 0.55, [r * 0.4, r * 0.4, r * 0.05, r * 0.05]); g.fill(); g.stroke();
  g.fillStyle = band; g.fillRect(x - r * 0.18, y - r * 0.75, r * 0.36, r * 0.55);
  g.restore();
  g.fillStyle = band; g.fillRect(x - r * 0.18, y - r * 0.2, r * 0.36, r * 0.9);
  g.strokeRect(x - r * 0.18, y - r * 0.2, r * 0.36, r * 0.9);
}

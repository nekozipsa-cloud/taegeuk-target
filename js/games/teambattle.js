/* 6. 도장 팀 대결 — 세 명이 한 팀! 미션 동작으로 힘을 모아 격파왕 로봇을 쓰러뜨린다 */

const MISSIONS = [
  { id: 'punch', text: '지르기로 송판 격파!', icon: '👊', moves: ['punch'], tip: '지르기!' },
  { id: 'kick', text: '발차기로 샌드백!', icon: '🦵', moves: ['kick'], tip: '발차기!' },
  { id: 'armsUp', text: '만세 에너지 모으기!', icon: '🙌', moves: [], tip: '두 팔 만세!' },
  { id: 'step', text: '좌우 스텝으로 피하기!', icon: '↔️', moves: ['left', 'right'], tip: '좌우로 콩콩!' },
];
const MISSION_SEC = 10;
const CHARGE_EVERY = 0.55;   // 만세를 이만큼 버티면 1칸
const TOGETHER = 1.2;

export default {
  id: 'teambattle', title: '도장 팀 대결', icon: '🏆', color: '#ff5a36',
  tagline: '세 명이 한 팀! 힘을 모아 격파왕 로봇을 쓰러뜨려요',
  howto: ['화면 위 미션 동작을 해요', '한 번 할 때마다 팀 게이지가 쑥!', '게이지가 꽉 차면 로봇에게 큰 한 방!', '모두 함께 하면 보너스 힘이 더해져요'],
  moves: ['punch', 'kick', 'armsUp', 'left', 'right'], goal: 6, goalUnit: '격파',
  create: (ctx) => new TeamBattle(ctx),
};

class TeamBattle {
  constructor(ctx) {
    this.ctx = ctx;
    this.mi = 0; this.mAge = 0;
    this.need = 12;
    this.parts = [0, 0, 0];      // 이번 게이지에 각자 넣은 힘
    this.charge = [0, 0, 0];     // 만세 버틴 시간
    this.lastAt = [-9, -9, -9];
    this.tipAt = [-9, -9, -9];
    this.boom = 0;               // 격파 연출 시간
    this.hurt = 0;
    this.breaks = 0;
  }

  get mission() { return MISSIONS[this.mi]; }
  filled() { return this.parts.reduce((a, b) => a + b, 0); }

  update(dt) {
    const { ctx } = this;
    this.mAge += dt;
    this.boom = Math.max(0, this.boom - dt); this.hurt = Math.max(0, this.hurt - dt);
    if (this.mAge >= MISSION_SEC) {
      this.mi = (this.mi + 1) % MISSIONS.length; this.mAge = 0;
      ctx.banner(`${this.mission.icon} ${this.mission.text}`, 1500); ctx.sfx('whoosh');
    }
    // 만세 미션: 팔을 들고 버티면 에너지가 모인다
    for (const p of ctx.players) {
      if (this.mission.id === 'armsUp' && p.present && p.flags.armsUp && this.boom <= 0) {
        this.charge[p.i] += dt;
        if (this.charge[p.i] >= CHARGE_EVERY) { this.charge[p.i] -= CHARGE_EVERY; this.add(p.i, p.x, p.y - p.T * 1.6); }
      } else this.charge[p.i] = 0;
    }
  }

  onAction(i, ev) {
    const { ctx } = this;
    if (this.boom > 0) return;
    if (this.mission.moves.includes(ev.type)) return this.add(i, ev.x, ev.y);
    if (['punch', 'kick', 'left', 'right'].includes(ev.type) && ctx.t - this.tipAt[i] > 1.2) {
      this.tipAt[i] = ctx.t;
      ctx.fx.text(ctx.zone(i).cx, ctx.H * 0.55, `지금은 ${this.mission.tip}`, '#fff', 30);
    }
  }

  /* i번이 게이지에 힘 1칸 */
  add(i, x, y) {
    const { ctx } = this;
    this.parts[i]++; this.hurt = 0.15;
    ctx.sfx(this.mission.id === 'kick' ? 'kick' : this.mission.id === 'punch' ? 'hit' : 'pop');
    ctx.score(i, 5, x ?? ctx.zone(i).cx, (y ?? ctx.H * 0.6) - 30, '+5');
    this.lastAt[i] = ctx.t;
    const here = ctx.present();
    if (here.length >= 2 && here.every((p) => ctx.t - this.lastAt[p.i] < TOGETHER)) {
      ctx.team(15, ctx.W / 2, ctx.H * 0.5, '모두 함께! +15');
      ctx.sfx('perfect');
      // 보너스 힘: 함께한 사람 모두에게 한 칸씩
      for (const p of here) { this.parts[p.i]++; this.lastAt[p.i] = -9; }
    }
    if (this.filled() >= this.need) this.smash();
  }

  smash() {
    const { ctx } = this;
    const r = this.robot();
    this.breaks++;
    this.boom = 1.6;
    ctx.goal(1);
    ctx.team(50, r.x, r.y - r.s * 0.2, '격파! +50');
    ctx.sfx('perfect'); ctx.fx.shake(16);
    ctx.fx.burst(r.x, r.y, '#ffd400', 40); ctx.fx.burst(r.x, r.y, '#ff4f8b', 24);
    this.parts = [0, 0, 0];
    this.need += 4;
  }

  robot() {
    const { W, H } = this.ctx;
    const s = Math.min(W, H) * 0.27;
    return { x: W / 2, y: H * 0.31, s };
  }

  bot(i) {
    if (this.boom > 0 || Math.random() < 0.1) return null;
    const m = this.mission;
    const right = Math.random() < 0.88;
    if (m.id === 'armsUp') return right ? { hold: 'armsUp', ms: 1500 } : { type: 'punch' };
    if (m.id === 'step') return { type: right ? this.ctx.pick(['left', 'right']) : 'punch' };
    return { type: right ? m.id : (m.id === 'punch' ? 'kick' : 'punch') };
  }

  drawBg(g) {
    const { W, H } = this.ctx;
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#ffe7c2'); wall.addColorStop(0.7, '#ffd08a');
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    // 도장 매트
    g.fillStyle = '#3b6fd8'; g.fillRect(0, H * 0.72, W, H * 0.28);
    g.fillStyle = '#e94b4b'; g.fillRect(W * 0.2, H * 0.72, W * 0.6, H * 0.28);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3;
    for (let x = 0; x <= W; x += W / 8) { g.beginPath(); g.moveTo(x, H * 0.72); g.lineTo(x, H); g.stroke(); }
    // 벽 장식
    const s = Math.min(W, H);
    this.ctx.emoji(g, '🥋', W * 0.08, H * 0.18, s * 0.1);
    this.ctx.emoji(g, '🏅', W * 0.92, H * 0.18, s * 0.1);
  }

  draw(g) {
    const { ctx } = this;
    const { W, H } = ctx;
    const s = Math.min(W, H);
    const r = this.robot();
    // 미션 안내
    const m = this.mission;
    const left = Math.max(0, MISSION_SEC - this.mAge);
    g.fillStyle = 'rgba(29,27,58,0.7)';
    g.beginPath(); g.roundRect(W / 2 - s * 0.5, H * 0.11, s, s * 0.11, s * 0.055); g.fill();
    ctx.outlined(g, `${m.icon} ${m.text}`, W / 2 - s * 0.04, H * 0.11 + s * 0.055, s * 0.05, '#fff');
    // 미션 남은 시간 (작은 원)
    const px = W / 2 + s * 0.43, py = H * 0.11 + s * 0.055;
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.arc(px, py, s * 0.035, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe14d'; g.beginPath(); g.moveTo(px, py); g.arc(px, py, s * 0.035, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left / MISSION_SEC); g.fill();
    // 로봇
    drawRobot(g, ctx, r, this.filled() / this.need, this.hurt, this.boom, this.mission.id);
    // 팀 게이지: 각자 색깔 칸으로 쌓인다
    const gw = s * 0.9, gh = s * 0.06, gx = W / 2 - gw / 2, gy = r.y + r.s * 0.72;
    g.fillStyle = 'rgba(29,27,58,0.6)'; g.beginPath(); g.roundRect(gx - 6, gy - 6, gw + 12, gh + 12, (gh + 12) / 2); g.fill();
    g.save(); g.beginPath(); g.roundRect(gx, gy, gw, gh, gh / 2); g.clip();
    let x = gx;
    const shown = this.boom > 0 ? [0, 0, 0] : this.parts;
    shown.forEach((n, k) => {
      const w = gw * Math.min(n, this.need) / this.need;
      g.fillStyle = ctx.players[k].color; g.fillRect(x, gy, w, gh);
      x += w;
    });
    g.restore();
    ctx.outlined(g, this.boom > 0 ? '격파!!' : `팀 힘 ${this.filled()} / ${this.need}`, W / 2, gy + gh / 2, gh * 0.75, '#fff');
    // 각자 넣은 힘 (내 칸 발밑)
    for (const p of ctx.players) {
      if (!p.present) continue;
      const z = ctx.zone(p.i), y = H * 0.94;
      const n = shown[p.i];
      g.fillStyle = p.color; g.beginPath(); g.roundRect(z.cx - s * 0.11, y - s * 0.03, s * 0.22, s * 0.06, s * 0.03); g.fill();
      ctx.outlined(g, `${p.name} 힘 ${n}`, z.cx, y, s * 0.035, '#fff', '#1d1b3a');
      if (m.id === 'armsUp' && this.charge[p.i] > 0) {
        const k = this.charge[p.i] / CHARGE_EVERY;
        g.strokeStyle = '#ffe14d'; g.lineWidth = 6;
        g.beginPath(); g.arc(z.cx + s * 0.15, y, s * 0.03, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
      }
    }
  }
}

/* 격파왕 로봇: 송판을 들고 있다. 힘이 모일수록 금이 가고, 격파 때 송판이 쪼개진다 */
function drawRobot(g, ctx, r, fill, hurt, boom, mid) {
  const { x, y, s } = r;
  const shake = hurt > 0 && !ctx.reduce ? Math.sin(hurt * 80) * s * 0.02 : 0;
  const tilt = boom > 0 && !ctx.reduce ? Math.sin(boom * 10) * 0.12 : 0;
  g.save(); g.translate(x + shake, y); g.rotate(tilt);
  g.lineWidth = Math.max(3, s * 0.025); g.strokeStyle = '#1d1b3a';
  // 몸
  g.fillStyle = '#9fb3d9';
  g.beginPath(); g.roundRect(-s * 0.32, -s * 0.12, s * 0.64, s * 0.5, s * 0.08); g.fill(); g.stroke();
  // 머리 + 안테나
  g.fillStyle = '#c3d3f0';
  g.beginPath(); g.roundRect(-s * 0.25, -s * 0.5, s * 0.5, s * 0.36, s * 0.08); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(0, -s * 0.6); g.stroke();
  g.fillStyle = boom > 0 ? '#ffd400' : '#ff5a5a'; g.beginPath(); g.arc(0, -s * 0.62, s * 0.035, 0, Math.PI * 2); g.fill(); g.stroke();
  // 눈 (격파 때는 빙글빙글 X)
  g.fillStyle = '#1d1b3a';
  if (boom > 0) ctx.outlined(g, '@ @', 0, -s * 0.33, s * 0.12, '#fff');
  else for (const dx of [-0.1, 0.1]) { g.beginPath(); g.arc(dx * s, -s * 0.33, s * 0.035, 0, Math.PI * 2); g.fill(); }
  g.lineWidth = s * 0.015;
  g.beginPath(); g.arc(0, -s * 0.24, s * 0.06, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  // 들고 있는 미션 표적
  const icon = { punch: '🪵', kick: '🥊', armsUp: '⚡', step: '🎯' }[mid];
  if (boom > 0) {
    const sp = (1.6 - boom) * s * 0.6;
    for (const d of [-1, 1]) { g.save(); g.translate(d * sp, s * 0.1 + sp * 0.3); g.rotate(d * (1.6 - boom) * 3); ctx.emoji(g, '🪵', 0, 0, s * 0.18); g.restore(); }
  } else {
    g.fillStyle = '#e8b878'; g.lineWidth = Math.max(3, s * 0.02);
    g.beginPath(); g.roundRect(-s * 0.2, -s * 0.02, s * 0.4, s * 0.3, s * 0.03); g.fill(); g.stroke();
    // 금 가기
    if (fill > 0.3) { g.beginPath(); g.moveTo(-s * 0.05, -s * 0.02); g.lineTo(s * 0.02, s * 0.1); g.lineTo(-s * 0.03, s * 0.18); if (fill > 0.65) { g.lineTo(s * 0.06, s * 0.28); } g.stroke(); }
    ctx.emoji(g, icon, 0, s * 0.13, s * 0.14);
  }
  g.restore();
}

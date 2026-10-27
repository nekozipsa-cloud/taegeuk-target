/* 게임 실행기: 시작 안내 → 준비 카운트다운 → 플레이(타이머·일시정지) → 결과 → 다시하기.
 * 열 개 게임이 모두 같은 흐름·같은 입력·같은 HUD를 쓴다.
 *
 * 게임 정의(js/games/*.js)의 모양:
 *   { id, title, icon, color, tagline, howto: [..], moves: ['punch',..], goal, goalUnit,
 *     create(ctx) → { update(dt), draw(g), drawBg?(g), onAction?(i, ev), bot?(i) } }
 *   bot(i)는 데모 모드에서 i번 도우미가 할 동작: { type, dir } 또는 { hold, ms, value } 또는 null
 */
import { settings, MOVE_INFO, PLAYER_COUNT } from './config.js';
import { sfx } from './audio.js';
import { Fx, outlined, emoji, rnd, pick, clamp, FONT } from './fx.js';
import { input, players, botAct, botHold, resetPlayers, KEY_HELP } from './input.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Runner {
  constructor({ canvas, onExit, onNext }) {
    this.canvas = canvas; this.g = canvas.getContext('2d');
    this.onExit = onExit; this.onNext = onNext;
    this.fx = new Fx();
    this.def = null; this.inst = null;
    this.phase = 'idle'; this.paused = false;
    this.W = 1280; this.H = 720;
    this.overlay = $('gOverlay');
    this.buildPlayerCards();
    $('gPause').addEventListener('click', () => this.togglePause());
    $('gRestart').addEventListener('click', () => this.restart());
    $('gBack').addEventListener('click', () => this.onExit());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.phase === 'play') this.pause(); });
  }

  /* ── 흐름 ── */
  open(def) {
    this.def = def;
    $('gIcon').textContent = def.icon;
    $('gTitle').textContent = def.title;
    document.documentElement.style.setProperty('--game', def.color);
    this.intro();
  }

  newRound() {
    this.fx.clear();
    resetPlayers();
    this.duration = this.def.duration || settings.roundSec;
    this.timeLeft = this.duration;
    this.elapsed = 0;
    this.teamScore = 0; this.progress = 0; this.goalHit = false;
    this.contrib = players.map(() => 0);
    this.hits = players.map(() => 0);
    this.bannerText = ''; this.bannerUntil = 0;
    this.nextBot = players.map(() => performance.now() + rnd(600, 1400));
    this.inst = this.def.create(this.makeCtx());
    this.updateHud(true);
  }

  intro() {
    this.newRound();
    this.phase = 'intro'; this.paused = false;
    this.introAt = performance.now(); this.armsUpSince = 0;
    const d = this.def;
    const moves = d.moves.map((m) => `<li><span class="mv-ic">${MOVE_INFO[m].icon}</span><b>${MOVE_INFO[m].label}</b><small>${MOVE_INFO[m].how}</small></li>`).join('');
    const camHint = input.mode === 'camera'
      ? '세 명 모두 카메라 앞 자기 칸에 서요. <b>두 팔 만세🙌</b>를 하면 바로 시작!'
      : input.mode === 'demo' ? '데모 모드: 자동 도우미 셋이 함께 해요. 키보드로 끼어들 수도 있어요.'
        : '키보드로 세 명이 동시에! ' + KEY_HELP.map((k, i) => `<span class="kh p${i + 1}">${i + 1}번 ${esc(k)}</span>`).join('');
    this.showOverlay(`
      <div class="panel intro" role="dialog" aria-labelledby="introTitle">
        <div class="intro-head"><span class="big-ic">${d.icon}</span><div><h2 id="introTitle">${esc(d.title)}</h2><p class="tagline">${esc(d.tagline)}</p></div></div>
        <ol class="howto">${d.howto.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>
        <ul class="moves">${moves}</ul>
        <p class="goal-line">🎯 팀 목표: <b>${esc(d.goalUnit)} ${d.goal}</b> · ⏱ ${this.duration}초 · 세 명이 함께 모아요</p>
        <p class="cam-hint">${camHint}</p>
        <div class="actions"><button class="btn primary" data-act="start">시작! <kbd>Enter</kbd></button><button class="btn" data-act="exit">메인으로</button></div>
      </div>`);
  }

  startCountdown() {
    if (this.phase !== 'intro' && this.phase !== 'result') return;
    if (this.phase === 'result') this.newRound();
    this.phase = 'count'; this.countAt = performance.now(); this.lastCount = 4;
    this.showOverlay('<div class="countdown" aria-live="assertive"><span id="cdNum">3</span></div>');
  }

  restart() {
    if (!this.def) return;
    this.newRound();
    this.phase = 'intro';
    this.startCountdown();
  }

  togglePause() { if (this.paused) this.resume(); else this.pause(); }
  pause() {
    if (this.phase !== 'play' && this.phase !== 'count') return;
    this.paused = true; sfx('click');
    $('gPause').setAttribute('aria-pressed', 'true');
    this.showOverlay(`<div class="panel pause" role="dialog" aria-label="일시정지">
      <h2>⏸ 잠깐 멈췄어요</h2><p>숨 한 번 쉬고 다시 해요!</p>
      <div class="actions"><button class="btn primary" data-act="resume">계속하기 <kbd>Esc</kbd></button><button class="btn" data-act="restart">처음부터</button><button class="btn" data-act="exit">메인으로</button></div></div>`);
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    $('gPause').setAttribute('aria-pressed', 'false');
    if (this.phase === 'count') { this.countAt = performance.now(); this.lastCount = 4; this.showOverlay('<div class="countdown"><span id="cdNum">3</span></div>'); }
    else this.hideOverlay();
  }

  finish() {
    this.phase = 'result';
    const d = this.def;
    const ratio = this.progress / d.goal;
    const stars = ratio >= 1 ? 3 : ratio >= 0.5 ? 2 : 1;
    sfx(stars === 3 ? 'win' : 'end');
    const max = Math.max(1, ...this.contrib);
    const rows = players.map((p, i) => {
      const part = p.present || this.contrib[i] > 0;
      return `<div class="crow p${i + 1}${part ? '' : ' off'}"><span class="cname">${p.name}</span><span class="cbar"><i style="width:${Math.round(this.contrib[i] / max * 100)}%"></i></span><b>${this.contrib[i]}</b></div>`;
    }).join('');
    const msg = stars === 3 ? '목표 달성! 최고의 팀이에요!' : stars === 2 ? '거의 다 왔어요! 한 번 더 해 볼까요?' : '좋은 출발! 같이 하면 더 잘할 수 있어요!';
    this.showOverlay(`<div class="panel result" role="dialog" aria-labelledby="resTitle">
      <div class="stars" aria-label="별 ${stars}개">${'<span class="on">★</span>'.repeat(stars)}${'<span>★</span>'.repeat(3 - stars)}</div>
      <h2 id="resTitle">${esc(d.title)} 끝!</h2>
      <p class="res-msg">${msg}</p>
      <div class="res-nums"><div><small>팀 점수</small><b>${this.teamScore}</b></div><div><small>${esc(d.goalUnit)}</small><b>${Math.min(this.progress, 999)} / ${d.goal}</b></div></div>
      <div class="contrib"><p>모두의 힘 (함께 모은 점수)</p>${rows}</div>
      <div class="actions"><button class="btn primary" data-act="again">다시하기 <kbd>Enter</kbd></button><button class="btn" data-act="next">다음 게임 ▶</button><button class="btn" data-act="exit">메인으로</button></div></div>`);
  }

  /* ── 오버레이 ── */
  showOverlay(html) {
    const o = this.overlay;
    o.innerHTML = html; o.hidden = false;
    o.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act)));
    const first = o.querySelector('.btn.primary');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
  }
  hideOverlay() { this.overlay.hidden = true; this.overlay.innerHTML = ''; }
  act(a) {
    sfx('click');
    if (a === 'start' || a === 'again') this.startCountdown();
    else if (a === 'resume') this.resume();
    else if (a === 'restart') { this.paused = false; this.restart(); }
    else if (a === 'next') this.onNext(this.def);
    else if (a === 'exit') this.onExit();
  }

  /* Enter·Esc 등 공통 키 (플레이어 키는 input.js가 처리) */
  key(e) {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.phase === 'play' || this.phase === 'count') { this.togglePause(); return true; }
      if (e.code === 'Escape' && (this.phase === 'intro' || this.phase === 'result')) { this.onExit(); return true; }
    }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !this.paused && (this.phase === 'intro' || this.phase === 'result')) {
      if (document.activeElement?.dataset?.act && document.activeElement.dataset.act !== 'start' && document.activeElement.dataset.act !== 'again') return false;
      this.startCountdown(); return true;
    }
    return false;
  }

  /* ── 게임에 넘기는 도구 상자 ── */
  makeCtx() {
    const R = this;
    return {
      get W() { return R.W; }, get H() { return R.H; },
      get t() { return R.elapsed; }, get timeLeft() { return R.timeLeft; },
      get camera() { return input.mode === 'camera'; },
      get reduce() { return settings.reduceMotion; },
      get progress() { return R.progress; },
      players, fx: R.fx, sfx, rnd, pick, clamp, outlined, emoji, FONT,
      zone(i) { const w = R.W / PLAYER_COUNT; return { x0: w * i, x1: w * (i + 1), cx: w * (i + 0.5), w }; },
      present() { return players.filter((p) => p.present); },
      score(i, pts, x, y, label) {
        R.contrib[i] += pts; R.teamScore += pts; R.hits[i]++;
        if (x != null) R.fx.text(x, y, label || `+${pts}`, players[i].color, 44);
      },
      team(pts, x, y, label) { R.teamScore += pts; if (x != null) R.fx.text(x, y, label || `+${pts}`, '#ffe14d', 56); },
      goal(n = 1) {
        R.progress += n;
        if (!R.goalHit && R.progress >= R.def.goal) {
          R.goalHit = true; sfx('win');
          R.banner('🎉 팀 목표 달성! 남은 시간은 보너스!', 2600);
          R.fx.burst(R.W / 2, R.H / 2, '#ffd400', 50); R.fx.burst(R.W / 2, R.H / 2, '#ff4f8b', 30);
        }
      },
      banner(text, ms = 1600) { R.banner(text, ms); },
      /* 손·발이 (x,y) 반경 r 안에서 움직였는지 (카메라: 빠르게 움직인 손발만 인정) */
      touch(i, x, y, r, { hands = true, feet = true, minSpeed = 1.2 } = {}) {
        const p = players[i];
        if (!p.present) return null;
        const list = [...(hands ? p.hands : []), ...(feet ? p.feet : [])];
        for (const l of list) if (l.v >= minSpeed && Math.hypot(l.x - x, l.y - y) < r + p.T * 0.2) return l;
        return null;
      },
    };
  }

  banner(text, ms) { this.bannerText = text; this.bannerUntil = performance.now() + ms; }

  /* ── 매 프레임 ── */
  resize(W, H) { this.W = W; this.H = H; }

  frame(now, dt) {
    const g = this.g, W = this.W, H = this.H;
    const live = this.phase === 'play' && !this.paused;

    // 플레이어 동작 → 게임
    if (live) {
      if (input.mode === 'demo') this.runBots(now);
      for (const p of players) for (const ev of p.events) this.inst.onAction?.(p.i, ev);
      this.elapsed += dt; this.timeLeft = Math.max(0, this.duration - this.elapsed);
      this.inst.update(dt);
      if (this.timeLeft <= 0) this.finish();
      else if (this.timeLeft <= 5 && Math.ceil(this.timeLeft) !== this.lastTick) { this.lastTick = Math.ceil(this.timeLeft); sfx('count'); }
    }
    if (!this.paused) this.fx.update(dt);

    if (this.phase === 'intro') this.introTick(now);
    if (this.phase === 'count' && !this.paused) this.countTick(now);

    // 그리기
    g.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = this.canvas.width / W;
    const [sx, sy] = this.fx.offset();
    g.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
    g.clearRect(-50, -50, W + 100, H + 100);
    if (input.mode === 'camera') { g.fillStyle = 'rgba(16,18,60,0.18)'; g.fillRect(-50, -50, W + 100, H + 100); }
    else if (this.inst.drawBg) this.inst.drawBg(g);
    else this.defaultBg(g);
    if (this.phase === 'intro' && input.mode === 'camera') this.drawZones(g);
    this.inst.draw(g);
    this.drawPlayers(g, now);
    this.inst.drawFront?.(g);
    this.fx.draw(g);
    if (this.bannerUntil > now) this.drawBanner(g, now);
    this.updateHud(false);
  }

  runBots(now) {
    for (const p of players) {
      if (now < this.nextBot[p.i]) continue;
      const a = this.inst.bot?.(p.i);
      const range = this.def.botEvery || [650, 1500];
      this.nextBot[p.i] = now + rnd(range[0], range[1]);
      if (!a) continue;
      if (a.hold) botHold(p.i, a.hold, a.ms || 1200, a.value ?? true);
      else botAct(p.i, a.type, a);
    }
  }

  introTick(now) {
    // 카메라: 참여한 사람 모두가 만세를 1초 하면 시작
    if (input.mode === 'camera') {
      const here = players.filter((p) => p.present && p.status !== 'keys');
      const allUp = here.length > 0 && here.every((p) => p.flags.armsUp);
      if (allUp) { if (!this.armsUpSince) this.armsUpSince = now; if (now - this.armsUpSince > 900) this.startCountdown(); }
      else this.armsUpSince = 0;
    }
    if (input.mode === 'demo' && now - this.introAt > 5000) this.startCountdown();
  }

  countTick(now) {
    const left = 3 - Math.floor((now - this.countAt) / 800);
    if (left !== this.lastCount) {
      this.lastCount = left;
      const el = $('cdNum');
      if (left >= 1) { sfx('count'); if (el) { el.textContent = left; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } }
      else if (left === 0) { sfx('go'); if (el) { el.textContent = '시작!'; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } }
      else { this.phase = 'play'; this.lastTick = 99; this.hideOverlay(); }
    }
  }

  defaultBg(g) {
    const grd = g.createLinearGradient(0, 0, 0, this.H);
    grd.addColorStop(0, '#7fd3ff'); grd.addColorStop(1, '#e9f8ff');
    g.fillStyle = grd; g.fillRect(0, 0, this.W, this.H);
  }

  drawZones(g) {
    const W = this.W, H = this.H;
    for (const p of players) {
      const w = W / 3, x = w * p.i;
      g.save();
      g.setLineDash([18, 14]); g.lineWidth = 5;
      g.strokeStyle = p.status === 'ok' ? p.color : 'rgba(255,255,255,0.75)';
      g.beginPath(); g.roundRect(x + 18, H * 0.12, w - 36, H * 0.72, 30); g.stroke();
      g.restore();
      if (p.status !== 'ok') outlined(g, `${p.name} 자리`, x + w / 2, H * 0.2, Math.min(W, H) * 0.05, p.color);
    }
  }

  drawPlayers(g, now) {
    const camOn = input.mode === 'camera';
    for (const p of players) {
      if (camOn && p.body && now - p.lastSeen < 400) drawSkeleton(g, p);
      else if (p.joints && p.present) drawAvatar(g, p, now);
    }
  }

  drawBanner(g, now) {
    const W = this.W, H = this.H, s = Math.min(W, H) * 0.06;
    g.font = `${s}px ${FONT}`;
    const w = g.measureText(this.bannerText).width + s * 1.6;
    const y = H * 0.2;
    g.fillStyle = 'rgba(29,27,58,0.82)';
    g.beginPath(); g.roundRect(W / 2 - w / 2, y - s * 0.9, w, s * 1.8, s * 0.9); g.fill();
    outlined(g, this.bannerText, W / 2, y + 2, s, '#fff');
  }

  /* ── HUD (DOM) ── */
  buildPlayerCards() {
    const box = $('gPlayers');
    box.innerHTML = players.map((p, i) => `
      <div class="pcard p${i + 1}" id="pc${i}">
        <div class="pc-top"><span class="pc-badge">${p.name}</span><span class="pc-dot" aria-hidden="true"></span><span class="pc-score" aria-label="${p.name} 점수">0</span></div>
        <div class="pc-hint" aria-live="polite">준비 중</div>
        <div class="pc-pad" role="group" aria-label="${p.name} 터치 조작">
          ${[['punch', '👊'], ['block', '🙆'], ['kick', '🦵'], ['left', '⬅️'], ['duck', '🙇'], ['right', '➡️'], ['balance', '🦩'], ['armsUp', '🙌'], ['tpose', '🤸']]
            .map(([a, ic]) => `<button type="button" data-p="${i}" data-a="${a}" aria-label="${MOVE_INFO[a].label}">${ic}</button>`).join('')}
        </div>
      </div>`).join('');
  }

  updateHud(force) {
    const d = this.def; if (!d) return;
    const tl = Math.ceil(this.timeLeft);
    if (force || tl !== this._tl) { this._tl = tl; $('gTimer').textContent = tl; $('gTimerWrap').classList.toggle('low', tl <= 10 && this.phase === 'play'); }
    if (force || this.teamScore !== this._ts) { this._ts = this.teamScore; $('gScore').textContent = this.teamScore; }
    if (force || this.progress !== this._pg) {
      this._pg = this.progress;
      $('gGoalText').textContent = `${d.goalUnit} ${Math.min(this.progress, 999)}/${d.goal}`;
      $('gGoalFill').style.width = `${clamp(this.progress / d.goal, 0, 1) * 100}%`;
    }
    players.forEach((p, i) => {
      const key = `${p.status}|${p.hint}|${this.contrib[i]}`;
      if (!force && this['_pc' + i] === key) return;
      this['_pc' + i] = key;
      const el = $('pc' + i);
      el.dataset.status = p.status;
      el.querySelector('.pc-hint').textContent = p.hint;
      el.querySelector('.pc-score').textContent = this.contrib[i];
    });
  }
}

/* ── 사람 그리기 ── */
const BONES = [['ls', 'rs'], ['ls', 'le'], ['le', 'lw'], ['rs', 're'], ['re', 'rw'], ['ls', 'lh'], ['rs', 'rh'], ['lh', 'rh'], ['lh', 'lk'], ['lk', 'la'], ['rh', 'rk'], ['rk', 'ra']];
function drawSkeleton(g, p) {
  const b = p.body, lw = Math.max(5, b.T * 0.09);
  g.lineCap = 'round';
  for (const pass of [0, 1]) {
    g.strokeStyle = pass ? p.color : 'rgba(255,255,255,0.9)';
    g.lineWidth = pass ? lw : lw + 6;
    g.beginPath();
    for (const [a, c] of BONES) { g.moveTo(b[a].x, b[a].y); g.lineTo(b[c].x, b[c].y); }
    g.stroke();
  }
  for (const w of [b.lw, b.rw, b.la, b.ra]) { g.fillStyle = p.color; g.beginPath(); g.arc(w.x, w.y, lw * 1.4, 0, Math.PI * 2); g.fill(); }
  const r = Math.max(18, b.T * 0.28);
  const hx = b.nose.x, hy = b.nose.y - b.T * 0.75;
  g.fillStyle = p.color; g.beginPath(); g.arc(hx, hy, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
  outlined(g, String(p.i + 1), hx, hy + 2, r * 1.3, '#fff', p.color);
}

function drawAvatar(g, p, now) {
  const j = p.joints, T = j.T;
  g.lineCap = 'round'; g.lineJoin = 'round';
  // 그림자
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(j.hip.x, j.ground + 4, T * 0.7, T * 0.14, 0, 0, Math.PI * 2); g.fill();
  const limb = (a, b, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };
  const hipL = { x: j.hip.x - 0.22 * T, y: j.hip.y }, hipR = { x: j.hip.x + 0.22 * T, y: j.hip.y };
  const shL = { x: j.sh.x - 0.3 * T, y: j.sh.y + 0.05 * T }, shR = { x: j.sh.x + 0.3 * T, y: j.sh.y + 0.05 * T };
  // 다리·팔 (흰 도복 + 테두리)
  for (const [a, b] of [[hipL, j.feet[0]], [hipR, j.feet[1]], [shL, j.hands[0]], [shR, j.hands[1]]]) { limb(a, b, T * 0.3, '#2b2a4a'); limb(a, b, T * 0.22, '#ffffff'); }
  for (const h of j.hands) { g.fillStyle = '#ffd7b8'; g.beginPath(); g.arc(h.x, h.y, T * 0.13, 0, Math.PI * 2); g.fill(); }
  // 몸통
  g.fillStyle = '#fff'; g.strokeStyle = '#2b2a4a'; g.lineWidth = T * 0.05;
  g.beginPath();
  g.moveTo(shL.x, shL.y - 0.05 * T); g.lineTo(shR.x, shR.y - 0.05 * T); g.lineTo(hipR.x + 0.06 * T, j.hip.y + 0.08 * T); g.lineTo(hipL.x - 0.06 * T, j.hip.y + 0.08 * T); g.closePath();
  g.fill(); g.stroke();
  // 띠 (플레이어 색)
  limb({ x: hipL.x - 0.04 * T, y: j.hip.y - 0.12 * T }, { x: hipR.x + 0.04 * T, y: j.hip.y - 0.12 * T }, T * 0.13, p.color);
  // 얼굴
  const h = j.head;
  g.fillStyle = '#ffd7b8'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#2b2a4a';
  g.beginPath(); g.arc(h.x, h.y - h.r * 0.35, h.r, Math.PI * 1.05, Math.PI * 1.95); g.fill();   // 머리카락
  g.beginPath(); g.arc(h.x - h.r * 0.35, h.y + h.r * 0.05, h.r * 0.11, 0, Math.PI * 2); g.arc(h.x + h.r * 0.35, h.y + h.r * 0.05, h.r * 0.11, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2b2a4a'; g.lineWidth = h.r * 0.1; g.beginPath(); g.arc(h.x, h.y + h.r * 0.3, h.r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  // 머리띠 번호
  outlined(g, String(p.i + 1), h.x, h.y - h.r * 1.75, h.r * 1.05, '#fff', p.color);
}

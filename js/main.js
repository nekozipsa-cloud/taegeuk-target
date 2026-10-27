/* 플랫폼 셸: 메인 화면, 카메라 동의·연결, 설정, 키보드·터치, 화면 전환, 메인 루프 */
import { settings, saveSettings, MOVE_INFO, PLAYER_COUNT } from './config.js';
import { sfx, unlockAudio } from './audio.js';
import { cam, startCamera, stopCamera, onCamChange } from './pose.js';
import { input, players, setMode, updateInput, clearEvents, keyAction, isPlayerKey, press, KEY_HELP, resetPlayers } from './input.js';
import { Runner } from './engine.js';
import { GAMES } from './games/index.js';

const $ = (id) => document.getElementById(id);
const video = $('cam');
const stage = $('stage');
const preview = $('preview');
const PW = 960, PH = 540;   // 미리보기 논리 크기

let screen = 'home';
let pending = null;          // 동의 후 열 게임
let lastGame = GAMES[0];

/* ── 토스트 ── */
let toastTimer = 0;
function toast(msg, ms = 3500) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

/* ── 게임 카드 ── */
function renderGrid() {
  $('gameGrid').innerHTML = GAMES.map((d, n) => `
    <button class="gcard" type="button" data-id="${d.id}" style="--c:${d.color}" aria-label="${n + 1}번 ${d.title}: ${d.tagline}">
      <span class="gc-art"><span class="gc-no">${n + 1}</span><span aria-hidden="true">${d.icon}</span></span>
      <h3>${d.title}</h3>
      <p>${d.tagline}</p>
      <span class="chips">${d.moves.slice(0, 4).map((m) => `<span class="chip">${MOVE_INFO[m].icon} ${MOVE_INFO[m].label}</span>`).join('')}</span>
    </button>`).join('');
  $('gameGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.gcard'); if (!b) return;
    begin(GAMES.find((g) => g.id === b.dataset.id));
  });
}

/* ── 시작 흐름: 조작 방식을 아직 안 골랐으면 안내·동의부터 ── */
function begin(def) {
  unlockAudio(); sfx('click');
  lastGame = def || lastGame;
  if (input.mode === 'none') { pending = lastGame; openConsent(); return; }
  if (input.mode === 'camera' && cam.status !== 'on' && cam.status !== 'loading' && cam.status !== 'asking') { pending = lastGame; openConsent(); return; }
  openGame(lastGame);
}

function openConsent(errMsg) {
  const err = $('consentErr');
  err.hidden = !errMsg; err.textContent = errMsg || '';
  $('consentCam').textContent = errMsg ? '다시 시도하기' : '동의하고 카메라 켜기';
  if (!$('consent').open) $('consent').showModal();
}

$('consent').addEventListener('close', async () => {
  const v = $('consent').returnValue;
  $('consent').returnValue = '';
  const target = pending; pending = null;
  if (v === 'camera') {
    setMode('camera'); refreshMode();
    if (target) openGame(target);
    const ok = await startCamera(video);
    if (!ok) {
      setMode('none'); refreshMode();
      if (screen === 'game') goHome();
      pending = target;
      openConsent(cam.error?.message || '카메라를 켜지 못했어요.');
    }
  } else if (v === 'keys' || v === 'demo') {
    setMode(v);
    if (v === 'keys' && matchMedia('(pointer: coarse)').matches) { settings.touchPads = true; saveSettings(); }
    refreshMode();
    if (target) openGame(target);
  }
});

/* ── 카메라 상태 표시 ── */
onCamChange(() => refreshMode());
let camOnToasted = false;
function refreshMode() {
  const pill = $('camPill'), txt = $('camText');
  const s = cam.status;
  let status = s, label;
  if (s === 'on') {
    const n = players.filter((p) => p.status === 'ok' || p.status === 'unstable').length;
    label = `카메라 켜짐 · ${n}/3명 보여요`;
  } else if (s === 'asking') label = '카메라 허용을 기다려요…';
  else if (s === 'loading') label = '동작 인식 준비 중… (처음엔 10초쯤)';
  else if (s === 'error') label = '카메라 사용 불가 · 눌러서 다시';
  else if (input.mode === 'demo') { status = 'demo'; label = '데모 모드 · 카메라 꺼짐'; }
  else if (input.mode === 'keys') { status = 'keys'; label = '키보드·터치 모드'; }
  else label = '카메라 꺼짐 · 눌러서 켜기';
  pill.dataset.status = status;
  if (txt.textContent !== label) txt.textContent = label;
  document.body.classList.toggle('cam-on', s === 'on' && input.mode === 'camera');
  document.body.classList.toggle('mirror', !!settings.mirror);
  document.body.classList.toggle('reduce', !!settings.reduceMotion);
  document.body.classList.toggle('pads', !!settings.touchPads || input.mode === 'keys' && matchMedia('(pointer: coarse)').matches);
  $('previewEmpty').hidden = s === 'on' && input.mode === 'camera';
  const ml = $('modeLine');
  const line = input.mode === 'camera' ? (s === 'on' ? '📷 카메라 모드: 세 명이 동시에 인식돼요' : '📷 카메라를 준비하고 있어요')
    : input.mode === 'demo' ? '🤖 데모 모드: 자동 도우미가 대신 움직여요 (키보드로 끼어들 수 있어요)'
      : input.mode === 'keys' ? '⌨️ 키보드·터치 모드: 세 명이 한 키보드로 동시에!' : '';
  if (ml.textContent !== line) ml.textContent = line;
  if (s === 'on' && !camOnToasted) { camOnToasted = true; toast('카메라 연결! 세 명이 왼쪽·가운데·오른쪽 칸에 서 주세요'); }
  if (s !== 'on') camOnToasted = false;
  $('sCamOff').hidden = s !== 'on';
}

$('camPill').addEventListener('click', () => {
  unlockAudio();
  if (cam.status === 'on' || cam.status === 'loading' || cam.status === 'asking') openSettings();
  else openConsent(cam.status === 'error' ? cam.error?.message : null);
});

/* ── 화면 전환 ── */
const runner = new Runner({
  canvas: stage,
  onExit: () => goHome(),
  onNext: (def) => openGame(GAMES[(GAMES.indexOf(def) + 1) % GAMES.length]),
});

function openGame(def) {
  lastGame = def;
  screen = 'game';
  $('home').classList.remove('on'); $('game').classList.add('on');
  document.body.classList.add('in-game');
  resize();
  runner.open(def);
  refreshMode();
}

function goHome() {
  runner.phase = 'idle'; runner.paused = false; runner.hideOverlay();
  screen = 'home';
  $('game').classList.remove('on'); $('home').classList.add('on');
  document.body.classList.remove('in-game');
  resetPlayers();
  const card = document.querySelector(`.gcard[data-id="${lastGame.id}"]`);
  card?.focus({ preventScroll: false });
  refreshMode();
}

/* ── 설정 ── */
function openSettings() {
  $('sMode').value = input.mode === 'none' ? 'camera' : input.mode;
  $('sSens').value = settings.sensitivity;
  $('sTime').value = String(settings.roundSec);
  $('sMirror').checked = !!settings.mirror;
  $('sSound').checked = !!settings.sound;
  $('sReduce').checked = !!settings.reduceMotion;
  $('sPads').checked = !!settings.touchPads;
  if (screen === 'game') runner.pause();
  $('settings').showModal();
}
$('keyHelp').innerHTML = KEY_HELP.map((k, i) => `<li><b>${i + 1}번</b> ${k}</li>`).join('');
$('hSettings').addEventListener('click', openSettings);
$('settings').addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'sSens') settings.sensitivity = e.target.value;
  if (id === 'sTime') settings.roundSec = Number(e.target.value);
  if (id === 'sMirror') settings.mirror = e.target.checked;
  if (id === 'sSound') { settings.sound = e.target.checked; syncSound(); }
  if (id === 'sReduce') settings.reduceMotion = e.target.checked;
  if (id === 'sPads') settings.touchPads = e.target.checked;
  if (id === 'sMode') {
    const m = e.target.value;
    if (m === 'camera' && cam.status !== 'on') { $('settings').close(); pending = screen === 'home' ? null : lastGame; if (screen === 'game') goHome(); openConsent(); return; }
    setMode(m);
  }
  saveSettings(); refreshMode();
});
$('settings').addEventListener('close', () => {
  if ($('settings').returnValue === 'camoff') { stopCamera(); setMode('none'); if (screen === 'game') goHome(); toast('카메라를 껐어요'); }
  $('settings').returnValue = '';
  refreshMode();
});

/* ── 소리·전체 화면 ── */
function syncSound() {
  for (const id of ['hSound', 'gSound']) { $(id).textContent = settings.sound ? '🔊' : '🔇'; $(id).setAttribute('aria-pressed', String(!!settings.sound)); }
}
function toggleSound() { settings.sound = !settings.sound; saveSettings(); syncSound(); if (settings.sound) { unlockAudio(); sfx('good'); } }
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => toast('이 브라우저에서는 전체 화면을 쓸 수 없어요'));
}
$('hSound').addEventListener('click', toggleSound); $('gSound').addEventListener('click', toggleSound);
$('hFull').addEventListener('click', toggleFull); $('gFull').addEventListener('click', toggleFull);
$('startBtn').addEventListener('click', () => begin(lastGame));
$('demoBtn').addEventListener('click', () => { unlockAudio(); setMode('demo'); refreshMode(); openGame(lastGame); });

/* ── 키보드 ── */
const anyDialogOpen = () => $('consent').open || $('settings').open;
addEventListener('keydown', (e) => {
  if (anyDialogOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('select, input, textarea')) return;
  unlockAudio();
  if (e.code === 'KeyF') { toggleFull(); return; }
  if (screen !== 'game') return;
  if (runner.key(e)) { e.preventDefault(); return; }
  if (e.repeat) { if (isPlayerKey(e.code)) e.preventDefault(); return; }
  if (keyAction(e.code, true)) {
    e.preventDefault();
    // 키보드로 처음 누르면 카메라 모드가 아니어도 바로 참여
    if (input.mode === 'none') { setMode('keys'); refreshMode(); }
  }
});
addEventListener('keyup', (e) => { if (screen === 'game') keyAction(e.code, false); });
addEventListener('blur', () => players.forEach((p) => { p.keyHold = {}; }));

/* ── 터치 버튼 ── */
$('gPlayers').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.pc-pad button'); if (!b) return;
  e.preventDefault(); unlockAudio();
  b.setPointerCapture?.(e.pointerId); b.classList.add('down');
  press(Number(b.dataset.p), b.dataset.a, true, 'touch');
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('gPlayers').addEventListener(ev, (e) => {
    const b = e.target.closest('.pc-pad button'); if (!b || !b.classList.contains('down')) return;
    b.classList.remove('down');
    press(Number(b.dataset.p), b.dataset.a, false, 'touch');
  });
}

/* ── 크기 ── */
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  stage.width = Math.round(innerWidth * dpr); stage.height = Math.round(innerHeight * dpr);
  runner.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);

/* ── 메인 미리보기: 카메라 화면 + 세 자리 + 인식된 사람 ── */
const pg = preview.getContext('2d');
preview.width = PW; preview.height = PH;
function drawPreview() {
  pg.clearRect(0, 0, PW, PH);
  if (video.readyState >= 2) {
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(PW / vw, PH / vh);
    pg.save();
    if (settings.mirror) { pg.translate(PW, 0); pg.scale(-1, 1); }
    pg.drawImage(video, (PW - vw * s) / 2, (PH - vh * s) / 2, vw * s, vh * s);
    pg.restore();
  }
  pg.fillStyle = 'rgba(20,18,60,0.25)'; pg.fillRect(0, 0, PW, PH);
  for (const p of players) {
    const w = PW / PLAYER_COUNT, x = w * p.i;
    const seen = p.status === 'ok' || p.status === 'unstable';
    pg.setLineDash([14, 10]); pg.lineWidth = 4; pg.strokeStyle = seen ? p.color : 'rgba(255,255,255,0.7)';
    pg.beginPath(); pg.roundRect(x + 10, 30, w - 20, PH - 80, 18); pg.stroke(); pg.setLineDash([]);
    pg.font = '34px Jua, sans-serif'; pg.textAlign = 'center'; pg.textBaseline = 'middle';
    pg.lineWidth = 6; pg.strokeStyle = '#23214a';
    const t = seen ? `${p.name} 보여요` : `${p.name} 자리`;
    pg.strokeText(t, x + w / 2, 62); pg.fillStyle = seen ? p.color : '#fff'; pg.fillText(t, x + w / 2, 62);
    if (seen && p.body) {
      const b = p.body;
      pg.fillStyle = p.color;
      for (const q of [b.nose, b.lw, b.rw, b.ls, b.rs, b.lh, b.rh, b.la, b.ra]) { pg.beginPath(); pg.arc(q.x, q.y, 7, 0, Math.PI * 2); pg.fill(); }
      pg.strokeStyle = p.color; pg.lineWidth = 5;
      pg.beginPath(); pg.moveTo(b.lw.x, b.lw.y); pg.lineTo(b.ls.x, b.ls.y); pg.lineTo(b.rs.x, b.rs.y); pg.lineTo(b.rw.x, b.rw.y);
      pg.moveTo(b.la.x, b.la.y); pg.lineTo(b.lh.x, b.lh.y); pg.lineTo(b.rh.x, b.rh.y); pg.lineTo(b.ra.x, b.ra.y); pg.stroke();
    }
  }
}

/* ── 메인 루프 ── */
let last = performance.now(), slowSince = 0, slowWarned = false, hudT = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (screen === 'game' && runner.phase !== 'idle') {
    updateInput(now, innerWidth, innerHeight);
    runner.frame(now, dt);
  } else if (input.mode === 'camera' && cam.status === 'on') {
    updateInput(now, PW, PH);
    drawPreview();
  }
  clearEvents();
  // 인식이 너무 느리면 한 번 알려 준다
  if (input.mode === 'camera' && cam.status === 'on' && cam.fps > 0 && cam.fps < 8) {
    if (!slowSince) slowSince = now;
    if (!slowWarned && now - slowSince > 6000) { slowWarned = true; toast('인식이 조금 느려요. 방을 밝게 하고 다른 창을 닫아 주세요. 키보드로도 함께 할 수 있어요.', 6000); }
  } else slowSince = 0;
  if (now - hudT > 500) { hudT = now; refreshMode(); }
  requestAnimationFrame(loop);
}

renderGrid();
syncSound();
refreshMode();
resize();
requestAnimationFrame(loop);

// 점검용 (브라우저 콘솔에서 상태 확인)
window.__tkpz = { input, players, cam, runner, GAMES, setMode, openGame, goHome };

/* 입력 통합: 카메라(3인 동시 인식) + 키보드 + 터치 + 데모 도우미.
 * 게임은 어디서 온 입력인지 몰라도 된다. 모두 같은 players[i] 모양으로 들어온다.
 *   players[i].present   지금 참여 중인지
 *   players[i].flags     지속 자세 { armsUp, block, tpose, balance, duck, lean(-1|0|1) }
 *   players[i].events    이번 프레임의 동작 [{ type, dir, x, y, src }]
 *   players[i].hands/feet  손·발 화면 위치와 속도(몸통 길이/초) — 표적 맞히기 판정용
 */
import { PLAYER_COLORS, PLAYER_SOFT, PLAYER_NAMES, PLAYER_COUNT, settings, sensFactor } from './config.js';
import { cam, detect, makeToScreen } from './pose.js';
import { bodyFrom, MotionDetector, assignSlots } from './detect.js';

export const input = {
  mode: 'none',   // camera | keys | demo | none
  W: 1280, H: 720,
};

const FLAG_KEYS = ['armsUp', 'block', 'tpose', 'balance', 'duck'];
const blankFlags = () => ({ armsUp: false, block: false, tpose: false, balance: false, duck: false, lean: 0 });

export const players = Array.from({ length: PLAYER_COUNT }, (_, i) => ({
  i, name: PLAYER_NAMES[i], color: PLAYER_COLORS[i], soft: PLAYER_SOFT[i],
  present: false, status: 'away', hint: '',
  body: null, lastSeen: -1e9, firstSeen: -1e9, keySeen: -1e9,
  det: new MotionDetector(),
  camFlags: blankFlags(), keyHold: {}, botHold: {},
  flags: blankFlags(), events: [],
  x: 0, y: 0, T: 80, hands: [], feet: [], head: null,
  anim: { punch: -1e9, punchDir: 0, punchSide: 1, kick: -1e9, kickDir: 0, block: -1e9 },
  joints: null,
}));

const slots = players.map(() => ({ cx: null, seenAt: -1e9 }));

export function setMode(mode) {
  input.mode = mode;
  for (const p of players) { p.keyHold = {}; p.botHold = {}; }
}

export function resetPlayers() {
  for (const p of players) {
    p.det.reset(); p.camFlags = blankFlags(); p.events = []; p.keyHold = {}; p.botHold = {};
  }
  // 라운드마다 자리를 화면 칸(왼쪽·가운데·오른쪽) 기준으로 다시 잡는다
  for (const s of slots) { s.cx = null; s.seenAt = -1e9; }
}

/* ── 키보드 ── 세 명이 한 키보드로 동시에 할 수 있게 자리를 나눴다 */
export const KEYMAP = [
  { punch: ['KeyQ'], block: ['KeyW'], kick: ['KeyE'], left: ['KeyA'], duck: ['KeyS'], right: ['KeyD'], balance: ['KeyZ'], armsUp: ['KeyX'], tpose: ['KeyC'] },
  { punch: ['KeyU'], block: ['KeyI'], kick: ['KeyO'], left: ['KeyJ'], duck: ['KeyK'], right: ['KeyL'], balance: ['KeyM'], armsUp: ['Comma'], tpose: ['Period'] },
  { punch: ['Digit7', 'Numpad7'], block: ['Digit8', 'Numpad8'], kick: ['Digit9', 'Numpad9'], left: ['ArrowLeft', 'Numpad4'], duck: ['ArrowDown', 'Numpad5'], right: ['ArrowRight', 'Numpad6'], balance: ['Digit0', 'Numpad0'], armsUp: ['ArrowUp', 'Numpad2'], tpose: ['Minus', 'Numpad3'] },
];
export const KEY_HELP = [
  'Q 지르기 · W 막기 · E 발차기 · A/D 좌우 · S 숙이기 · Z 균형 · X 만세 · C 팔 벌리기',
  'U 지르기 · I 막기 · O 발차기 · J/L 좌우 · K 숙이기 · M 균형 · , 만세 · . 팔 벌리기',
  '7 지르기 · 8 막기 · 9 발차기 · ←/→ 좌우 · ↓ 숙이기 · 0 균형 · ↑ 만세 · - 팔 벌리기',
];
const codeLookup = new Map();
KEYMAP.forEach((m, i) => Object.entries(m).forEach(([act, codes]) => codes.forEach((c) => codeLookup.set(c, { i, act }))));

export const isPlayerKey = (code) => codeLookup.has(code);

export function keyAction(code, down) {
  const hit = codeLookup.get(code);
  if (!hit) return false;
  press(hit.i, hit.act, down, 'key');
  return true;
}

/* 키·터치 버튼 공통: 누르기/떼기 */
export function press(i, act, down, src = 'touch') {
  const p = players[i], now = performance.now();
  p.keySeen = now;
  const holdable = act === 'left' || act === 'right' || act === 'duck' || act === 'balance' || act === 'armsUp' || act === 'tpose';
  if (holdable) p.keyHold[act] = down;
  if (!down) return;
  if (act === 'punch' || act === 'kick' || act === 'block' || act === 'left' || act === 'right' || act === 'duck') {
    const lean = (p.keyHold.right ? 1 : 0) - (p.keyHold.left ? 1 : 0);
    emit(i, act, { dir: act === 'left' ? -1 : act === 'right' ? 1 : lean, src });
  }
}

/* 데모 도우미: 게임이 알려준 동작을 대신 한다 */
export function botAct(i, type, opts = {}) { emit(i, type, { dir: opts.dir || 0, src: 'demo' }); }
export function botHold(i, flag, ms, value = true) { players[i].botHold[flag] = { until: performance.now() + ms, value }; }

/* 키·터치·데모 동작을 아바타 손발 위치와 함께 이벤트로 만든다 */
function emit(i, type, { dir = 0, src }) {
  const p = players[i], now = performance.now();
  if (type === 'punch') { p.anim.punch = now; p.anim.punchSide = -p.anim.punchSide; p.anim.punchDir = dir || p.anim.punchSide; }
  if (type === 'kick') { p.anim.kick = now; p.anim.kickDir = dir; }
  if (type === 'block') p.anim.block = now;
  if (type === 'left' || type === 'right') botHold(i, 'lean', 450, type === 'left' ? -1 : 1);
  if (type === 'duck') botHold(i, 'duck', 500);
  const j = avatarJoints(p, now);
  const pt = type === 'punch' ? j.hands[p.anim.punchDir > 0 ? 1 : 0]
    : type === 'kick' ? j.feet[1]
      : type === 'block' ? j.hands[1] : { x: j.hip.x, y: j.sh.y };
  p.events.push({ type, dir, x: pt.x, y: pt.y, src });
}

/* ── 매 프레임 ── */
export function updateInput(now, W, H) {
  input.W = W; input.H = H;
  const sens = sensFactor();

  if (input.mode === 'camera') {
    const lms = detect(now);
    if (lms) {
      const toScreen = makeToScreen(W, H, settings.mirror);
      const bodies = lms.map((lm) => bodyFrom(lm, toScreen)).filter((b) => b && b.T > H * 0.04);
      const assigned = assignSlots(bodies, slots, W, now);
      assigned.forEach((b, i) => {
        const p = players[i];
        if (!b) return;
        if (now - p.lastSeen > 1500) { p.det.reset(); p.firstSeen = now; }
        slots[i].cx = b.cx; slots[i].seenAt = now;
        p.body = b; p.lastSeen = now;
        for (const ev of p.det.update(b, now, sens)) p.events.push({ ...ev, src: 'camera' });
        p.camFlags = { ...p.det.flags };
      });
    }
  }

  for (const p of players) {
    const seen = now - p.lastSeen;
    if (seen > 600) p.camFlags = blankFlags();
    const camOn = input.mode === 'camera';
    p.present = input.mode === 'demo' || input.mode === 'keys' || seen < 1500 || now - p.keySeen < 10000;

    // 자세 합치기: 카메라 OR 키 누름 OR 데모 도우미
    const f = blankFlags();
    for (const k of FLAG_KEYS) {
      const bh = p.botHold[k];
      f[k] = p.camFlags[k] || !!p.keyHold[k] || (bh && bh.until > now && !!bh.value);
    }
    const kl = (p.keyHold.right ? 1 : 0) - (p.keyHold.left ? 1 : 0);
    const bl = p.botHold.lean && p.botHold.lean.until > now ? p.botHold.lean.value : 0;
    f.lean = p.camFlags.lean || kl || bl;
    if (now - p.anim.block < 400) f.block = true;
    p.flags = f;

    // 상태 안내 (어린이용 문구)
    if (!camOn) { p.status = input.mode === 'demo' ? 'demo' : 'keys'; p.hint = input.mode === 'demo' ? '자동 도우미가 하고 있어요' : '키보드·터치로 해요'; }
    else if (seen < 400) {
      const b = p.body;
      if (b.quality < 0.55 || !b.feetVisible) { p.status = 'unstable'; p.hint = b.feetVisible ? '조금 뒤로 가서 온몸을 보여 줘요' : '발이 안 보여요! 한 걸음 뒤로'; }
      else { p.status = 'ok'; p.hint = '잘 보여요!'; }
    } else if (p.lastSeen > 0 && seen < 8000) { p.status = 'lost'; p.hint = '어디 갔어요? 화면 안으로 들어와요'; }
    else if (now - p.keySeen < 10000) { p.status = 'keys'; p.hint = '키보드로 참여 중'; }
    else { p.status = 'away'; p.hint = '카메라 앞 ' + ['왼쪽', '가운데', '오른쪽'][p.i] + '에 서요'; }

    // 손·발·몸 위치
    if (camOn && seen < 300 && p.body) {
      const b = p.body;
      p.x = b.cx; p.y = b.cy; p.T = p.det.baseT || b.T;
      p.hands = b.wrists.map((w, k) => ({ x: w.x, y: w.y, v: p.det.speed.hands[k] || 0 }));
      p.feet = b.ankles.map((a, k) => ({ x: a.x, y: a.y, v: p.det.speed.feet[k] || 0 }));
      p.head = { x: b.nose.x, y: b.nose.y };
      p.joints = null;
    } else {
      const j = avatarJoints(p, now);
      p.joints = j;
      p.x = j.hip.x; p.y = (j.hip.y + j.sh.y) / 2; p.T = j.T;
      const punching = now - p.anim.punch < 260, kicking = now - p.anim.kick < 340;
      p.hands = j.hands.map((h) => ({ ...h, v: punching || now - p.anim.block < 300 ? 5 : 0 }));
      p.feet = j.feet.map((h, k) => ({ ...h, v: kicking && k === 1 ? 5 : 0 }));
      p.head = j.head;
    }
  }
}

/* 프레임 끝: 이벤트 비우기 */
export function clearEvents() { for (const p of players) p.events.length = 0; }

/* 카메라 없이 할 때 화면에 그리는 아이 캐릭터의 관절 위치 */
export function avatarJoints(p, now) {
  const W = input.W, H = input.H;
  const f = p.flags;
  const T = Math.min(H * 0.11, W * 0.06);
  const x = W * (p.i + 0.5) / PLAYER_COUNT + (f.lean || 0) * T * 1.1;
  const ground = H * 0.86;
  const duck = f.duck;
  const hip = { x, y: ground - (duck ? 0.75 : 1.2) * T };
  const tilt = (f.lean || 0) * 0.35 * T;
  const sh = { x: x + tilt, y: hip.y - (duck ? 0.75 : 1.0) * T };
  const head = { x: sh.x + tilt * 0.4, y: sh.y - 0.5 * T, r: 0.36 * T };
  let hands = [{ x: sh.x - 0.45 * T, y: sh.y + 0.7 * T }, { x: sh.x + 0.45 * T, y: sh.y + 0.7 * T }];
  if (f.armsUp) hands = [{ x: sh.x - 0.4 * T, y: head.y - 0.7 * T }, { x: sh.x + 0.4 * T, y: head.y - 0.7 * T }];
  else if (f.tpose) hands = [{ x: sh.x - 1.25 * T, y: sh.y }, { x: sh.x + 1.25 * T, y: sh.y }];
  if (now - p.anim.block < 400 || (f.block && !f.armsUp)) hands[1] = { x: sh.x + 0.25 * T, y: head.y - 0.55 * T };
  const pk = (now - p.anim.punch) / 260;
  if (pk >= 0 && pk < 1) {
    const s = Math.sin(pk * Math.PI);
    const k = p.anim.punchDir > 0 ? 1 : 0;
    hands[k] = { x: sh.x + (k ? 1 : -1) * (0.45 + 0.9 * s) * T, y: sh.y + (0.7 - 0.55 * s) * T };
  }
  let feet = [{ x: x - 0.3 * T, y: ground }, { x: x + 0.3 * T, y: ground }];
  if (f.balance) feet[1] = { x: x + 0.15 * T, y: ground - 0.65 * T };
  const kk = (now - p.anim.kick) / 340;
  if (kk >= 0 && kk < 1) {
    const s = Math.sin(kk * Math.PI);
    const side = p.anim.kickDir < 0 ? -1 : 1;
    const reach = p.anim.kickDir ? 1.2 : 0.55;
    feet[1] = { x: x + side * (0.3 + (reach - 0.3) * s) * T, y: ground - s * 1.25 * T };
  }
  return { T, hip, sh, head, hands, feet, ground };
}

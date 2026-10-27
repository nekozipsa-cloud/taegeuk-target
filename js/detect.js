/* 동작 판정 (순수 함수 · DOM 없음).
 *
 * 좌표는 모두 "화면 좌표"(거울 반전까지 적용된 뒤)다. 그래서 왼쪽·오른쪽 판정은
 * 아이가 화면에서 보는 방향과 항상 같고, 카메라 반전 설정을 바꿔도 뒤집히지 않는다.
 * MediaPipe의 왼쪽/오른쪽 관절 이름은 쓰지 않고 화면 위치만 본다.
 *
 * 길이 기준 T = 어깨 중심~엉덩이 중심 거리(몸통 길이). 거리가 멀든 가깝든,
 * 아이 키가 크든 작든 같은 비율로 판정한다.
 */

const IDX = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };

const vis = (p) => (p && p.visibility != null ? p.visibility : 1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/* MediaPipe 랜드마크 33개 → 화면 좌표 몸 정보. 어깨·엉덩이가 안 보이면 null */
export function bodyFrom(lm, toScreen) {
  if (!lm || lm.length < 29) return null;
  const upperVis = Math.min(vis(lm[11]), vis(lm[12]));
  const hipVis = Math.min(vis(lm[23]), vis(lm[24]));
  if (upperVis < 0.5 || hipVis < 0.35) return null;
  const P = {};
  for (const [k, i] of Object.entries(IDX)) P[k] = { ...toScreen(lm[i].x, lm[i].y), v: vis(lm[i]) };
  const sh = mid(P.ls, P.rs), hip = mid(P.lh, P.rh);
  const T = Math.max(dist(sh, hip), 1);
  return {
    ...P, sh, hip, T,
    SW: dist(P.ls, P.rs),
    cx: (sh.x + hip.x) / 2,
    cy: (sh.y + hip.y) / 2,
    wrists: [P.lw, P.rw],
    ankles: [P.la, P.ra],
    knees: [P.lk, P.rk],
    quality: (upperVis + hipVis + Math.min(vis(lm[15]), vis(lm[16])) + Math.min(vis(lm[27]), vis(lm[28]))) / 4,
    feetVisible: Math.min(vis(lm[27]), vis(lm[28])) > 0.45,
  };
}

/* 시간상수 tau(ms)로 지수 평균 */
const ease = (cur, target, dt, tau) => (cur == null ? target : cur + (target - cur) * Math.min(1, dt / tau));

export const EVENT_COOLDOWN = { punch: 320, kick: 520, block: 500, left: 450, right: 450, duck: 600 };
const EVENT_FRAMES = { punch: 2, kick: 2, block: 2, left: 2, right: 2, duck: 2 };

/* 한 사람 몫의 판정기. 프레임마다 update(body, t, sens)를 부른다 */
export class MotionDetector {
  constructor() { this.reset(); }

  reset() {
    this.prev = null; this.prevT = 0;
    this.baseT = null; this.baseX = null; this.baseShY = null;
    this.count = {}; this.cool = {}; this.was = {};
    this.flagCount = {};
    this.leanCand = 0; this.leanCount = 0;
    this.flags = { armsUp: false, block: false, tpose: false, balance: false, duck: false, lean: 0 };
    this.speed = { hands: [0, 0], feet: [0, 0] };
  }

  /* 조건이 frames 프레임 연속이면 true (흔들림 방지) */
  _held(name, cond, frames) {
    this.count[name] = cond ? (this.count[name] || 0) + 1 : 0;
    return this.count[name] >= frames;
  }

  /* 플래그는 켤 때 2프레임, 끌 때 3프레임 (깜박임 방지) */
  _flag(name, cond) {
    const c = this.flagCount[name] || 0;
    if (cond) this.flagCount[name] = Math.max(1, c + 1);
    else this.flagCount[name] = Math.min(-1, c - 1);
    const n = this.flagCount[name];
    if (n >= 2) return true;
    if (n <= -3) return false;
    return !!this.flags[name];
  }

  _fire(events, type, t, extra) {
    if (t - (this.cool[type] || -1e9) < EVENT_COOLDOWN[type]) return;
    this.cool[type] = t;
    events.push({ type, ...extra });
  }

  /* body: bodyFrom() 결과, t: ms, sens: 임계값 배율 (1=보통) */
  update(b, t, sens = 1) {
    const events = [];
    const dt = this.prev ? Math.max(1, Math.min(200, t - this.prevT)) : 33;
    const F = this.flags;

    // 기준값: 몸통 길이는 커질 땐 빨리, 줄 땐 천천히 (숙이면 몸통이 짧아 보이므로)
    this.baseT = this.baseT == null ? b.T : ease(this.baseT, b.T, dt, b.T > this.baseT ? 300 : 3000);
    const T = this.baseT;
    // 어깨 높이 기준: 일어설 땐 빨리, 내려갈 땐 아주 천천히 따라감
    this.baseShY = this.baseShY == null ? b.sh.y : ease(this.baseShY, b.sh.y, dt, b.sh.y < this.baseShY ? 250 : 4000);
    this.baseX = this.baseX == null ? b.cx : ease(this.baseX, b.cx, dt, 1800);

    // 손·발 속도 (몸통 길이/초)
    if (this.prev) {
      const sp = (a, c) => dist(a, c) / T / (dt / 1000);
      this.speed.hands = [sp(b.lw, this.prev.lw), sp(b.rw, this.prev.rw)];
      this.speed.feet = [sp(b.la, this.prev.la), sp(b.ra, this.prev.ra)];
    }

    /* ── 자세(지속 상태) ── */
    const headY = b.nose.y;
    const wristsUp = b.wrists.map((w) => w.y < headY - 0.05 * T);
    F.armsUp = this._flag('armsUp', wristsUp[0] && wristsUp[1]);
    F.block = this._flag('block', Math.min(b.lw.y, b.rw.y) < headY - 0.1 * T);
    F.tpose = this._flag('tpose',
      Math.abs(b.lw.x - b.rw.x) > 1.9 * T * sens &&
      b.wrists.every((w) => Math.abs(w.y - b.sh.y) < 0.55 * T));
    const drop = (b.sh.y - this.baseShY) / T;
    F.duck = this._flag('duck', drop > 0.38 * sens);

    // 한 발 들기: 두 발목 높이 차이 또는 무릎이 엉덩이 쪽으로 올라옴
    const ground = Math.max(b.la.y, b.ra.y);
    const lift = (ground - Math.min(b.la.y, b.ra.y)) / T;
    const kneeUp = Math.min(b.lk.y, b.rk.y) < b.hip.y + 0.5 * T;
    const footLifted = b.feetVisible ? lift > 0.3 * sens : false;
    F.balance = this._flag('balance', !F.duck && (footLifted || (kneeUp && b.feetVisible)));

    // 좌우: 몸 전체가 옆으로 이동했거나 상체가 기울었을 때 (화면 기준 방향)
    const off = (b.cx - this.baseX) / T;
    const tilt = (b.sh.x - b.hip.x) / T;
    const leanNow = off > 0.5 * sens || tilt > 0.3 * sens ? 1 : off < -0.5 * sens || tilt < -0.3 * sens ? -1 : 0;
    if (leanNow === this.leanCand) this.leanCount++;
    else { this.leanCand = leanNow; this.leanCount = 1; }
    if (this.leanCount >= 2 && leanNow !== F.lean) {
      if (leanNow !== 0) this._fire(events, leanNow > 0 ? 'right' : 'left', t, { dir: leanNow, x: b.cx, y: b.sh.y });
      F.lean = leanNow;
    }

    /* ── 순간 동작(이벤트) ── */
    // 발차기: 한 발이 크게 올라감 (뛰어차기·옆차기 포함)
    const kickCond = b.feetVisible && (lift > 0.55 * sens || Math.min(b.lk.y, b.rk.y) < b.hip.y + 0.3 * T);
    if (this._held('kick', kickCond, EVENT_FRAMES.kick) && !this.was.kick) {
      const foot = b.la.y < b.ra.y ? b.la : b.ra;
      const dx = (foot.x - b.hip.x) / T;
      this._fire(events, 'kick', t, { dir: dx > 0.45 ? 1 : dx < -0.45 ? -1 : 0, x: foot.x, y: foot.y });
    }
    this.was.kick = this.count.kick >= EVENT_FRAMES.kick;

    // 지르기: 손목이 가슴 높이에서 빠르게 뻗음 (카메라 쪽으로 뻗어도 속도로 잡힘)
    for (let k = 0; k < 2; k++) {
      const w = b.wrists[k];
      const zone = w.y > b.sh.y - 0.45 * T && w.y < b.hip.y + 0.25 * T;
      const fast = this.speed.hands[k] > 3.0 * sens;
      const reach = Math.abs(w.x - b.sh.x) > 0.95 * T * sens;
      const cond = zone && !F.armsUp && (fast || reach);
      const key = 'punch' + k;
      if (this._held(key, cond, EVENT_FRAMES.punch) && !this.was[key]) {
        const dx = (w.x - b.cx) / T;
        this._fire(events, 'punch', t, { dir: dx > 0.6 ? 1 : dx < -0.6 ? -1 : 0, x: w.x, y: w.y });
      }
      this.was[key] = this.count[key] >= EVENT_FRAMES.punch;
    }

    // 막기: 한 팔을 머리 위로
    if (this._held('blockE', F.block, EVENT_FRAMES.block) && !this.was.block) {
      const w = b.lw.y < b.rw.y ? b.lw : b.rw;
      this._fire(events, 'block', t, { dir: 0, x: w.x, y: w.y });
    }
    this.was.block = this.count.blockE >= EVENT_FRAMES.block;

    // 숙이기
    if (F.duck && !this.was.duck) this._fire(events, 'duck', t, { dir: 0, x: b.cx, y: b.sh.y });
    this.was.duck = F.duck;

    this.prev = b; this.prevT = t;
    return events;
  }
}

/* ── 세 사람을 1·2·3번 자리에 고정 배정 ──
 * 한 사람씩 번갈아 잡지 않는다. 매 프레임 화면 속 사람 전원(최대 3명)을
 * 직전 프레임 위치와 가장 가깝게 이어 붙인다(전체 비용 최소 배정).
 * 처음 들어온 사람은 비어 있는 자리 중 화면 위치(왼쪽·가운데·오른쪽 칸)가 가까운 곳으로 간다.
 * slots: [{cx, seenAt}] × 3 (호출한 쪽이 갱신), 반환: 길이 3 배열(body 또는 null) */
export function assignSlots(bodies, slots, W, now, keepMs = 1500) {
  const cand = bodies.filter(Boolean).sort((a, b) => b.T - a.T).slice(0, slots.length);
  const out = slots.map(() => null);
  if (!cand.length) return out;
  const ref = slots.map((s, i) => (s.cx != null && now - s.seenAt < keepMs)
    ? { x: s.cx, fresh: true }
    : { x: W * (i + 0.5) / slots.length, fresh: false });
  let best = null, bestCost = Infinity;
  for (const p of selections(slots.length, cand.length)) {
    let c = 0;
    for (let k = 0; k < cand.length; k++) {
      const r = ref[p[k]], d = Math.abs(cand[k].cx - r.x);
      c += r.fresh ? (d > W * 0.4 ? d * 2 : d) : d * 0.8 + W * 0.12;
    }
    if (c < bestCost) { bestCost = c; best = p; }
  }
  cand.forEach((b, k) => { out[best[k]] = b; });
  return out;
}

/* n칸 중 k칸을 순서 있게 고르는 모든 경우 (n=3이라 최대 6가지) */
function selections(n, k, pre = [], acc = []) {
  if (pre.length === k) { acc.push(pre); return acc; }
  for (let i = 0; i < n; i++) if (!pre.includes(i)) selections(n, k, [...pre, i], acc);
  return acc;
}

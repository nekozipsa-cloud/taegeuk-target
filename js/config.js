/* 공통 설정·상수. 설정은 이 브라우저(localStorage)에만 저장된다. */

export const PLAYER_COUNT = 3;
export const PLAYER_COLORS = ['#ff4f8b', '#1fa8ff', '#ffaa00'];
export const PLAYER_SOFT = ['#ffe1ec', '#dcf1ff', '#fff0cc'];
export const PLAYER_NAMES = ['1번', '2번', '3번'];

export const MOVE_INFO = {
  punch: { label: '지르기', icon: '👊', how: '주먹을 앞으로 힘차게 쭉!' },
  kick: { label: '발차기', icon: '🦵', how: '한쪽 다리를 높이 차올려요' },
  block: { label: '막기', icon: '🙆', how: '한 팔을 머리 위로 번쩍' },
  left: { label: '왼쪽', icon: '⬅️', how: '화면 왼쪽으로 한 걸음' },
  right: { label: '오른쪽', icon: '➡️', how: '화면 오른쪽으로 한 걸음' },
  duck: { label: '숙이기', icon: '🙇', how: '무릎을 굽혀 몸을 낮춰요' },
  balance: { label: '균형', icon: '🦩', how: '한 발을 들고 버텨요' },
  armsUp: { label: '만세', icon: '🙌', how: '두 팔을 머리 위로' },
  tpose: { label: '팔 벌리기', icon: '🤸', how: '두 팔을 옆으로 쭉' },
};

const KEY = 'tkpz.settings.v1';
const defaults = {
  sound: true,
  mirror: true,
  sensitivity: 'normal',   // low | normal | high
  roundSec: 60,
  reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  touchPads: false,
};

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export const settings = Object.assign({}, defaults, load());

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* 사생활 모드 등 */ }
}

/* 민감도: 판정 임계값에 곱한다 (작을수록 쉽게 잡힘) */
export function sensFactor() {
  return { low: 1.25, normal: 1, high: 0.8 }[settings.sensitivity] || 1;
}

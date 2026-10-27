/* 카메라 + MediaPipe Pose Landmarker (여러 명 동시 인식).
 * 영상 프레임은 이 브라우저 안에서만 처리한다. 서버로 보내거나 저장하지 않는다.
 * 네트워크로 받는 것은 인식 프로그램(wasm)과 모델 파일뿐이다. */

const MP_VER = '1.0.1';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const cam = {
  status: 'off',     // off | asking | loading | on | error
  error: null,       // { kind, message }
  video: null,
  stream: null,
  landmarker: null,
  fps: 0,
  lastResult: null,
};

let listeners = [];
export function onCamChange(fn) { listeners.push(fn); }
function set(status, error = null) {
  cam.status = status; cam.error = error;
  listeners.forEach((fn) => fn(cam));
}

function withTimeout(p, ms, kind) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { kind })), ms))]);
}

export async function startCamera(video) {
  if (cam.status === 'asking' || cam.status === 'loading' || cam.status === 'on') return cam.status === 'on';
  cam.video = video;
  if (!navigator.mediaDevices?.getUserMedia) {
    set('error', { kind: 'unsupported', message: '이 브라우저에서는 카메라를 쓸 수 없어요. 크롬이나 엣지 최신 버전에서 열어 주세요.' });
    return false;
  }
  set('asking');
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false,
    });
  } catch (e) {
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    const missing = e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError');
    set('error', {
      kind: denied ? 'denied' : missing ? 'missing' : 'camera',
      message: denied ? '카메라 허용이 꺼져 있어요. 주소창 옆 카메라(자물쇠) 아이콘에서 허용으로 바꾼 뒤 다시 눌러 주세요.'
        : missing ? '연결된 웹캠을 찾지 못했어요. 웹캠을 꽂고 다시 시도해 주세요.'
          : '카메라를 열지 못했어요. 다른 프로그램이 웹캠을 쓰고 있지 않은지 확인해 주세요.',
    });
    return false;
  }
  video.srcObject = cam.stream;
  video.muted = true;
  await video.play().catch(() => {});
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));

  set('loading');
  try {
    if (!cam.landmarker) cam.landmarker = await withTimeout(loadModel(), 45000, 'model');
  } catch (e) {
    console.warn('model load failed', e);
    stopCamera(false);
    set('error', { kind: 'model', message: '동작 인식 프로그램을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도하거나, 키보드·데모로 즐겨 주세요.' });
    return false;
  }
  set('on');
  return true;
}

async function loadModel() {
  const mp = await import(MP_URL);
  const fileset = await mp.FilesetResolver.forVisionTasks(WASM_URL);
  let lastErr;
  for (const delegate of ['GPU', 'CPU']) {
    try {
      return await mp.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 4,   // 세 명 + 여유 한 명 (가장 크게 보이는 세 명만 플레이어로 쓴다)
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

export function stopCamera(notify = true) {
  cam.stream?.getTracks().forEach((t) => t.stop());
  cam.stream = null;
  if (cam.video) cam.video.srcObject = null;
  if (notify) set('off');
}

let lastVideoTime = -1, frames = 0, fpsT = 0;
/* 새 영상 프레임이 있을 때만 인식. 없으면 null */
export function detect(now) {
  const v = cam.video;
  if (cam.status !== 'on' || !cam.landmarker || !v || v.readyState < 2) return null;
  if (v.currentTime === lastVideoTime) return null;
  lastVideoTime = v.currentTime;
  let res;
  try { res = cam.landmarker.detectForVideo(v, now); } catch (e) { return null; }
  frames++;
  if (now - fpsT > 1000) { cam.fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
  cam.lastResult = res;
  return res.landmarks || [];
}

/* 영상은 화면을 꽉 채우게(cover) 그리므로 랜드마크도 같은 변환을 쓴다 */
export function makeToScreen(W, H, mirror) {
  const v = cam.video;
  const vw = v?.videoWidth || 1280, vh = v?.videoHeight || 720;
  const s = Math.max(W / vw, H / vh);
  const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
  return (nx, ny) => ({ x: ox + (mirror ? 1 - nx : nx) * vw * s, y: oy + ny * vh * s });
}

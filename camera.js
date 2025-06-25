/* ---------- セッション ID（ブラウザごとに固定） ---------- */
const SESSION_ID =
  localStorage.getItem('session-id') ||
  (() => {
    const id = crypto?.randomUUID
      ? crypto.randomUUID()
      : 'ss-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 10);
    localStorage.setItem('session-id', id);
    return id;
  })();

/* ---------- 定数 & 要素取得 ---------- */
const API_URL_VISION = '/api/vision';
const API_URL_CHAT = '/api/chat';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const respEl = document.getElementById('response');

/* ---------- SpeechSynthesis 初期化 ---------- */
let voiceReady = false;
let jpVoice = null;

speechSynthesis.onvoiceschanged = () => {
  jpVoice = speechSynthesis.getVoices().find(v => v.lang.startsWith('ja'));
};

function warmUpSpeech() {
  if (voiceReady) return;
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  voiceReady = true;
}

/* ---------- カメラ制御 ---------- */
let useBack = true;

async function startCamera(back = true) {
  warmUpSpeech();

  const preferred = back
    ? { video: { facingMode: { exact: 'environment' } } }
    : { video: true };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(preferred);
    video.srcObject = stream;
  } catch (err) {
    if (back) return startCamera(false);  // 背面失敗→インカメ
    alert('カメラにアクセスできません: ' + err.message);
  }
}

function flipCamera() {
  if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
  useBack = !useBack;
  startCamera(useBack);
}

/* ---------- 画像キャプチャ＆送信 ---------- */
let lastImageB64 = null;          // 直近の画像（Base64）
let lastVisionTime = 0;             // Vision を呼んだ時刻（ms）

/* 直近10秒以内に Vision を呼んだか判定 */
function justUsedVision() {
  return Date.now() - lastVisionTime < 10_000;
}

async function captureAndSendToAI(extraText = '') {
  if (!video.videoWidth) {
    alert('まず「カメラ開始」を押してください');
    return;
  }
  const SCALE = 0.4;
  canvas.width = video.videoWidth * SCALE;
  canvas.height = video.videoHeight * SCALE;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
  if (!blob) {
    alert('画像の取得に失敗しました');
    return;
  }
  const base64Image = await blobToBase64(blob);
  lastImageB64 = base64Image;

  const res = await fetch(API_URL_VISION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      image: base64Image,
      text: extraText
    })
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Vision 500 →', text);
    alert('サーバーエラー:\n' + text.slice(0, 120));
    return;
  }
  const { answer } = JSON.parse(text);
  lastVisionTime = Date.now();
  appendChat(extraText || '[画像質問]', answer);
  speak(answer);
}

const judgeCache = new Map();   // text → { ans, ts }

async function askNeedsVision(text) {
  // キャッシュ 30 秒
  const c = judgeCache.get(text);
  if (c && Date.now() - c.ts < 30_000) return c.ans;

  try {
    const r = await fetch('/api/judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const yn = (await r.text()).trim() === 'yes';
    judgeCache.set(text, { ans: yn, ts: Date.now() });
    return yn;
  } catch (e) {
    console.warn('judge fallback', e);
    // ネットワーク障害時は簡易正規表現で代用
    return /写|映|何色|服|男|女|あれ|これ|それ/.test(text);
  }
}

/* ---------- テキスト送信 ---------- */
async function sendText() {
  const input = document.getElementById('userText');
  const text = input.value.trim();
  if (!text) return;

  // 画像を再送するか？（キーワード or 直近10秒以内）
  const needsVision =
    (await askNeedsVision(text))       // 意味ベース判定
    || justUsedVision();               // 直近10秒以内

  if (needsVision) {
    // 同じフレームを再利用して Vision へ
    // 1) キャッシュがあればそれを再送
    if (lastImageB64) {
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          image: lastImageB64,
          text
        })
      });
      const { answer } = await res.json();

      lastVisionTime = Date.now();

      appendChat(text, answer);
      speak(answer);
      return;
    }
    // 2) キャッシュが無い→新しく撮影
    await captureAndSendToAI(text);
    return;
  } else {
    const res = await fetch(API_URL_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, text })
    });
    const { answer } = await res.json();
    appendChat(text, answer);
    speak(answer);
  }
  input.value = '';
}

/* ---------- 補助関数 ---------- */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return reject(new Error('blob is null'));
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function speak(text) {
  speechSynthesis.cancel();
  const uttr = new SpeechSynthesisUtterance(text);
  if (jpVoice) uttr.voice = jpVoice;
  speechSynthesis.speak(uttr);
}

/* ---------- チャット表示 ---------- */
function appendChat(q, a) {
  respEl.innerHTML += `<div class="bubble user">${q}</div>`;
  respEl.innerHTML += `<div class="bubble ai">${a}</div>`;
}

/* ---------- グローバル公開 ---------- */
window.startCamera = startCamera;
window.captureAndSendToAI = captureAndSendToAI;
window.flipCamera = flipCamera;
window.sendText = sendText;

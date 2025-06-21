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
const API_URL_CHAT   = '/api/chat';

const video  = document.getElementById('video');
const canvas = document.getElementById('canvas');
const respEl = document.getElementById('response');

/* ---------- SpeechSynthesis 初期化 ---------- */
let voiceReady = false;
let jpVoice    = null;

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
let lastImageB64 = null;   // キャッシュ用（任意）

async function captureAndSendToAI(extraText = '') {
  if (!video.videoWidth) {
    alert('まず「カメラ開始」を押してください');
    return;
  }
  const SCALE = 0.4;
  canvas.width  = video.videoWidth  * SCALE;
  canvas.height = video.videoHeight * SCALE;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
  if (!blob) {
    alert('画像の取得に失敗しました');
    return;
  }
  const base64Image = await blobToBase64(blob);
  lastImageB64 = base64Image;

  const res  = await fetch(API_URL_VISION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      imageBase64: base64Image,
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
  appendChat(extraText || '[画像質問]', answer);
  speak(answer);
}

/* ---------- テキスト送信 ---------- */
async function sendText() {
  const input = document.getElementById('userText');
  const text  = input.value.trim();
  if (!text) return;

  // 画像付き質問か簡易判定
  const needsVision = /あれ|これ|それ|写|何色/.test(text);

  if (needsVision) {
    // 同じフレームを再利用して Vision へ
    if (lastImageB64) {
      await fetch(API_URL_VISION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          imageBase64: lastImageB64,
          text
        })
      }).then(r => r.json())
        .then(({ answer }) => {
          appendChat(text, answer);
          speak(answer);
        });
    } else {
      await captureAndSendToAI(text);
    }
  } else {
    const res  = await fetch(API_URL_CHAT, {
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
window.startCamera        = startCamera;
window.captureAndSendToAI = captureAndSendToAI;
window.flipCamera         = flipCamera;
window.sendText           = sendText;

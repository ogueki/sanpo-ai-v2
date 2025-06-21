/* camera.js ── ブラウザで動くコード */
const API_URL = '/api/vision';          // Vercel に合わせて相対パス

/* ---------- 要素取得 ---------- */
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const respEl = document.getElementById('response');

/* ---------- SpeechSynthesis 初期化 ---------- */
let voiceReady = false;
let jpVoice = null;

/* ボイス一覧が届いたら日本語ボイスを確定 */
speechSynthesis.onvoiceschanged = () => {
  jpVoice = speechSynthesis.getVoices().find(v => v.lang.startsWith('ja'));
};

/* 空発声でウォームアップ（ユーザー操作直後に呼ぶ） */
function warmUpSpeech() {
  if (voiceReady) return;
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  voiceReady = true;
}

/* ---------- カメラ制御 ---------- */
let useBack = true;

async function startCamera(back = true) {
  warmUpSpeech();                                  // ① TTS ウォームアップ

  /* ② 背面カメラ優先で取得 */
  const preferred = back
    ? { video: { facingMode: { exact: 'environment' } } }
    : { video: true };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(preferred);
    video.srcObject = stream;
  } catch (err) {
    if (back) return startCamera(false);           // 背面取得失敗→インカメfallback
    alert('カメラにアクセスできません: ' + err.message);
  }
}

/* カメラ切替ボタン用 */
function flipCamera() {
  if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
  useBack = !useBack;
  startCamera(useBack);
}

/* ---------- 画像キャプチャ＆AI呼び出し ---------- */
async function captureAndSendToAI(extraText = '') {
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob        = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
  const base64Image = await blobToBase64(blob);        // ← ここで作る
  lastImageB64      = base64Image;                     // キャッシュ用（任意）

  const res = await fetch('/api/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      imageBase64: base64Image,                        // ← 同じ名で送る
      text: extraText
    })
  });
  const { answer } = await res.json();

  appendChat(extraText || '[画像質問]', answer);
  speak(answer);
}

const SESSION_ID = crypto.randomUUID();  // タブごとに固定

async function sendText() {
  const text = document.getElementById('userText').value.trim();
  if (!text) return;

  // 画像付きにする？キーワードで簡易判定
  const needsVision = /あれ|これ|それ|写/.test(text);

  let answer;
  if (needsVision) {
    await captureAndSendToAI(text);   // 既存関数を拡張（下で修正）
    return;
  } else {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, text })
    });
    answer = (await res.json()).answer;
  }

  appendChat(text, answer);
  speak(answer);
}

function appendChat(q, a) {
  respEl.innerHTML += `<div class="bubble user">${q}</div>`;
  respEl.innerHTML += `<div class="bubble ai">${a}</div>`;
}

/* ---------- 補助関数 ---------- */
function blobToBase64(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function speak(text) {
  speechSynthesis.cancel();
  const uttr = new SpeechSynthesisUtterance(text);
  if (jpVoice) uttr.voice = jpVoice;               // 日本語ボイス優先
  speechSynthesis.speak(uttr);
}

/* ---------- グローバルへ公開（HTML から呼び出し） ---------- */
window.startCamera = startCamera;
window.captureAndSendToAI = captureAndSendToAI;
window.flipCamera = flipCamera;

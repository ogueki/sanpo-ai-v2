/* camera.js  ── ブラウザで動くコード */
const API_URL = '/api/vision';        // ← 後で Vercel に載せるので相対パスに変更
const video   = document.getElementById('video');
const canvas  = document.getElementById('canvas');
const respEl  = document.getElementById('response');

async function startCamera(back = true) {
  // ① 背面をリクエスト
  const preferredConstraints = back
    ? { video: { facingMode: { exact: 'environment' } } }
    : { video: true };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
    video.srcObject = stream;
  } catch (err) {
    // ② 背面が取れないブラウザは fallback でインカメ
    if (back) return startCamera(false);
    alert('カメラにアクセスできませんでした: ' + err.message);
  }
}

async function captureAndSendToAI() {
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob        = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
  const base64Image = await blobToBase64(blob);

  const data = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64Image })
  }).then(r => r.json());

  respEl.textContent = data.answer ?? '応答がありません';
  speak(data.answer ?? '応答がありません');
}

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
  speechSynthesis.speak(uttr);
}

let useBack = true;
function flipCamera() {
  // 既存ストリームを止めてから再起動
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
  }
  useBack = !useBack;
  startCamera(useBack);
}
/* camera.js  ── ブラウザで動くコード */
const API_URL = '/api/vision';        // ← 後で Vercel に載せるので相対パスに変更
const video   = document.getElementById('video');
const canvas  = document.getElementById('canvas');
const respEl  = document.getElementById('response');

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
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
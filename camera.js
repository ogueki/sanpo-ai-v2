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
const API_URL_UNIFIED = '/api/unified';  // 新しい統合API

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
    if (back) return startCamera(false);
    alert('カメラにアクセスできません: ' + err.message);
  }
}

function flipCamera() {
  if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
  useBack = !useBack;
  startCamera(useBack);
}

/* ---------- 音声認識機能 ---------- */
let recognition = null;
let isListening = false;

// 音声認識の初期化
function initSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('⚠️ 音声認識がサポートされていません');
    return false;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  
  // 音声認識の設定
  recognition.lang = 'ja-JP';              // 日本語
  recognition.continuous = false;          // 一度に一つの発話
  recognition.interimResults = false;      // 最終結果のみ
  recognition.maxAlternatives = 1;         // 候補は1つ
  
  // 音声認識イベント
  recognition.onstart = () => {
    console.log('🎤 音声認識開始');
    isListening = true;
    updateMicButton(true);
    showListeningIndicator();
  };
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log(`🎤 音声認識結果: "${transcript}"`);
    
    // 入力欄に結果を設定
    const input = document.getElementById('userText');
    input.value = transcript;
    
    // 自動送信
    sendText();
  };
  
  recognition.onerror = (event) => {
    console.error('❌ 音声認識エラー:', event.error);
    isListening = false;
    updateMicButton(false);
    hideListeningIndicator();
    
    // エラーメッセージを表示
    if (event.error === 'no-speech') {
      alert('音声が検出されませんでした。もう一度お試しください。');
    } else if (event.error === 'not-allowed') {
      alert('マイクへのアクセスが許可されていません。ブラウザの設定を確認してください。');
    } else {
      alert(`音声認識エラー: ${event.error}`);
    }
  };
  
  recognition.onend = () => {
    console.log('🎤 音声認識終了');
    isListening = false;
    updateMicButton(false);
    hideListeningIndicator();
  };
  
  return true;
}

// 音声入力開始/停止
function toggleSpeechInput() {
  if (!recognition) {
    if (!initSpeechRecognition()) {
      alert('音声認識がサポートされていません');
      return;
    }
  }
  
  if (isListening) {
    recognition.stop();
  } else {
    try {
      recognition.start();
    } catch (error) {
      console.error('❌ 音声認識開始エラー:', error);
      alert('音声認識を開始できませんでした');
    }
  }
}

// マイクボタンの表示更新
function updateMicButton(listening) {
  const micButton = document.getElementById('micButton');
  if (micButton) {
    micButton.textContent = listening ? '🔴 停止' : '🎤 音声入力';
    micButton.className = listening ? 'mic-btn listening' : 'mic-btn';
  }
}

// 音声認識中の表示
function showListeningIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'listening-indicator';
  indicator.innerHTML = '<div class="bubble ai listening">🎤 音声を聞いています...</div>';
  respEl.appendChild(indicator);
  respEl.scrollTop = respEl.scrollHeight;
}

function hideListeningIndicator() {
  const indicator = document.getElementById('listening-indicator');
  if (indicator) {
    indicator.remove();
  }
}
let lastImageB64 = null;  // 最新画像のキャッシュ（デバッグ用に保持）
let processingRequest = false;  // 重複リクエスト防止

/**
 * 統合AIにリクエストを送信する共通関数
 */
async function sendToUnifiedAI(text, newImage = null) {
  // 重複リクエスト防止
  if (processingRequest) {
    console.log('⚠️ Already processing request, skipping...');
    return;
  }

  try {
    processingRequest = true;
    
    // ローディング表示（オプション）
    showLoadingIndicator();

    console.log(`🚀 Sending to Unified AI - Text: "${text}", HasNewImage: ${!!newImage}`);

    const requestBody = {
      sessionId: SESSION_ID,
      text: text.trim()
    };

    // 新しい画像がある場合のみ含める
    if (newImage) {
      requestBody.image = newImage;
      lastImageB64 = newImage;  // キャッシュ更新
    }

    const response = await fetch(API_URL_UNIFIED, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const answer = data.answer;

    console.log(`✅ Unified AI Response received`);

    // チャットに表示
    appendChat(text, answer);
    
    // 音声で読み上げ
    speak(answer);

  } catch (error) {
    console.error('❌ Unified AI Error:', error);
    
    // エラーメッセージを表示
    const errorMessage = '申し訳ありません。処理中にエラーが発生しました。もう一度お試しください。';
    appendChat(text, errorMessage);
    speak(errorMessage);
    
  } finally {
    processingRequest = false;
    hideLoadingIndicator();
  }
}

/**
 * 画像をキャプチャして統合AIに送信
 */
async function captureAndSendToAI(extraText = '') {
  if (!video.videoWidth) {
    alert('まず「カメラ開始」を押してください');
    return;
  }

  try {
    // 画像キャプチャ処理（人物認識のため解像度向上）
    const SCALE = 0.6;  // 40% → 60%に向上
    canvas.width = video.videoWidth * SCALE;
    canvas.height = video.videoHeight * SCALE;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
    if (!blob) {
      alert('画像の取得に失敗しました');
      return;
    }

    const base64Image = await blobToBase64(blob);
    
    // 質問テキストを決定
    const questionText = extraText || '景色を見せてもらいました！これについて教えてください。';
    
    // 統合AIに送信（新しい画像付き）
    await sendToUnifiedAI(questionText, base64Image);

  } catch (error) {
    console.error('❌ Capture Error:', error);
    alert('画像の処理中にエラーが発生しました');
  }
}

/**
 * テキスト入力を統合AIに送信
 */
async function sendText() {
  const input = document.getElementById('userText');
  const text = input.value.trim();
  
  if (!text) return;

  // 入力欄をクリア
  input.value = '';

  // 統合AIに送信（画像判定は統合API側で自動実行）
  await sendToUnifiedAI(text);
}

/* ---------- UI表示関数 ---------- */
function showLoadingIndicator() {
  // 簡単なローディング表示
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-indicator';
  loadingDiv.innerHTML = '<div class="bubble ai">🤔 考え中...</div>';
  respEl.appendChild(loadingDiv);
  respEl.scrollTop = respEl.scrollHeight;
}

function hideLoadingIndicator() {
  const loadingEl = document.getElementById('loading-indicator');
  if (loadingEl) {
    loadingEl.remove();
  }
}

function appendChat(q, a) {
  respEl.innerHTML += `<div class="bubble user">${q}</div>`;
  respEl.innerHTML += `<div class="bubble ai">${a}</div>`;
  respEl.scrollTop = respEl.scrollHeight;  // 自動スクロール
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

/* ---------- キーボードショートカット ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const userTextInput = document.getElementById('userText');
  
  // Enterキーで送信
  userTextInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  });
});

/* ---------- グローバル公開 ---------- */
window.startCamera = startCamera;
window.captureAndSendToAI = captureAndSendToAI;
window.flipCamera = flipCamera;
window.sendText = sendText;
window.toggleSpeechInput = toggleSpeechInput;
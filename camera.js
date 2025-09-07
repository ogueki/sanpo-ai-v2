/* ---------- 修正版 camera.js ---------- */

/* ---------- ズーム機能 ---------- */
let currentZoom = 1;
const maxZoom = 3;
const minZoom = 1;
const zoomStep = 0.2;

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
const API_URL_UNIFIED = '/api/unified';

// 要素の安全な取得
const getElement = (id) => {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Element not found: ${id}`);
  }
  return element;
};

const video = getElement('preview') || getElement('video'); // index.htmlとの互換性
const canvas = getElement('canvas');

/* ---------- SpeechSynthesis 初期化 ---------- */
let voiceReady = false;
let jpVoice = null;

speechSynthesis.onvoiceschanged = () => {
  jpVoice = speechSynthesis.getVoices().find(v => v.lang.startsWith('ja'));
  console.log('🔊 日本語音声:', jpVoice ? jpVoice.name : '未対応');
};

function warmUpSpeech() {
  if (voiceReady) return;
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  voiceReady = true;
}

/* ---------- カメラ制御（改善版） ---------- */
let currentStream = null;
let useBack = true;

async function startCamera(back = true) {
  console.log('📱 カメラ起動開始:', back ? '背面' : '前面');
  
  if (!video) {
    console.error('❌ video要素が見つかりません');
    alert('video要素が見つかりません。HTMLを確認してください。');
    return false;
  }

  warmUpSpeech();
  
  // 既存ストリームを停止
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  // HTTPS チェック
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    console.error('❌ HTTPSが必要です');
    alert('カメラアクセスにはHTTPSが必要です。');
    return false;
  }

  // MediaDevices API チェック
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('❌ MediaDevices API がサポートされていません');
    alert('このブラウザはカメラをサポートしていません。');
    return false;
  }

  try {
    // ステータス更新
    updateStatus('カメラ起動中...', false);
    
    // カメラ制約
    const constraints = back 
      ? { 
          video: { 
            facingMode: { exact: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        }
      : { 
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        };

    console.log('📱 カメラ制約:', constraints);
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    video.srcObject = stream;
    
    // 動画読み込み完了まで待機
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
      setTimeout(reject, 5000); // 5秒タイムアウト
    });
    
    console.log(`✅ カメラ起動成功: ${video.videoWidth}x${video.videoHeight}`);
    updateStatus('カメラ起動完了', true);
    
    return true;
    
  } catch (err) {
    console.error('❌ カメラエラー:', err);
    
    if (back && err.name === 'OverconstrainedError') {
      console.log('💡 背面カメラが見つからないため、前面カメラで再試行');
      return startCamera(false);
    }
    
    // フォールバック: 基本設定
    if (back || err.name === 'OverconstrainedError') {
      try {
        console.log('🔄 基本設定で再試行');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        currentStream = stream;
        video.srcObject = stream;
        
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = reject;
          setTimeout(reject, 5000);
        });
        
        console.log('✅ フォールバックカメラ起動成功');
        updateStatus('カメラ起動完了（基本モード）', true);
        return true;
        
      } catch (fallbackErr) {
        console.error('❌ フォールバックも失敗:', fallbackErr);
      }
    }
    
    updateStatus('カメラ起動失敗', false);
    alert(`カメラにアクセスできません: ${err.message}`);
    return false;
  }
}

function flipCamera() {
  console.log('🔄 カメラ切り替え');
  useBack = !useBack;
  startCamera(useBack);
}

/* ---------- ステータス表示 ---------- */
function updateStatus(text, live = false) {
  // index.html との互換性
  const statusText = getElement('status-text');
  const statusLed = getElement('status-led');
  
  if (statusText) statusText.textContent = text;
  if (statusLed) {
    statusLed.className = `inline-block w-2.5 h-2.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-zinc-500'}`;
  }
  
  // setStatus 関数との互換性
  if (window.setStatus) {
    window.setStatus(text, live);
  }
  
  console.log(`📊 Status: ${text} (live: ${live})`);
}

/* ---------- 統合AI処理 ---------- */
let lastImageB64 = null;
let processingRequest = false;

async function sendToUnifiedAI(text, newImage = null) {
  if (processingRequest) {
    console.log('⚠️ Already processing request, skipping...');
    showToast('処理中です。しばらくお待ちください。');
    return;
  }

  try {
    processingRequest = true;
    showLoadingIndicator();

    console.log(`🚀 Sending to Unified AI - Text: "${text}", HasNewImage: ${!!newImage}`);

    const requestBody = {
      sessionId: SESSION_ID,
      text: text.trim()
    };

    if (newImage) {
      requestBody.image = newImage;
      lastImageB64 = newImage;
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

    appendChat(text, answer);
    speak(answer);

  } catch (error) {
    console.error('❌ Unified AI Error:', error);
    
    const errorMessage = '申し訳ありません。処理中にエラーが発生しました。もう一度お試しください。';
    appendChat(text, errorMessage);
    speak(errorMessage);
    
  } finally {
    processingRequest = false;
    hideLoadingIndicator();
  }
}

async function captureAndSendToAI(extraText = '') {
  if (!video) {
    alert('video要素が見つかりません');
    return;
  }
  
  if (!video.srcObject || !video.videoWidth) {
    alert('まず「カメラ開始」を押してください');
    
    // 自動でカメラを起動
    const success = await startCamera(useBack);
    if (!success) return;
    
    // 少し待ってから再試行
    setTimeout(() => captureAndSendToAI(extraText), 1000);
    return;
  }

  try {
    if (!canvas) {
      throw new Error('canvas要素が見つかりません');
    }
    
    const SCALE = currentZoom > 1.5 ? 0.8 : 0.6;
    canvas.width = video.videoWidth * SCALE;
    canvas.height = video.videoHeight * SCALE;
    
    const ctx = canvas.getContext('2d');
    
    ctx.save();
    ctx.scale(currentZoom, currentZoom);
    
    const offsetX = -(video.videoWidth * (currentZoom - 1)) / (2 * currentZoom);
    const offsetY = -(video.videoHeight * (currentZoom - 1)) / (2 * currentZoom);
    
    ctx.drawImage(video, offsetX, offsetY, video.videoWidth, video.videoHeight);
    ctx.restore();

    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
    if (!blob) {
      throw new Error('画像の生成に失敗しました');
    }

    const base64Image = await blobToBase64(blob);
    
    let questionText;
    if (extraText) {
      questionText = extraText;
    } else if (currentZoom > 1.3) {
      questionText = `写真を送信しました。`;
    } else {
      questionText = '写真を送信しました。';
    }
    
    await sendToUnifiedAI(questionText, base64Image);
    
    // フラッシュ効果
    showFlash();

  } catch (error) {
    console.error('❌ Capture Error:', error);
    alert(`画像の処理中にエラーが発生しました: ${error.message}`);
  }
}

/* ---------- UI表示関数 ---------- */
function showLoadingIndicator(message = '🤔 考え中...') {
  hideLoadingIndicator();
  
  const chatContainer = getElement('chat') || createChatContainer();
  
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-indicator';
  loadingDiv.className = 'max-w-[80vw] sm:max-w-[60vw] px-3 py-2 rounded-2xl ring-1 ring-white/10 backdrop-blur bg-zinc-900/75';
  loadingDiv.textContent = message;
  
  chatContainer.appendChild(loadingDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideLoadingIndicator() {
  const loadingEl = getElement('loading-indicator');
  if (loadingEl) {
    loadingEl.remove();
  }
}

function createChatContainer() {
  const existing = getElement('chat');
  if (existing) return existing;
  
  // チャットコンテナが存在しない場合は作成
  const container = document.createElement('div');
  container.id = 'chat';
  container.className = 'flex flex-col gap-1';
  container.style.cssText = `
    position: fixed;
    right: 12px;
    top: 60px;
    max-width: 80vw;
    max-height: 50vh;
    overflow-y: auto;
    z-index: 25;
  `;
  
  document.body.appendChild(container);
  return container;
}

function appendChat(userText, aiResponse) {
  const chatContainer = getElement('chat') || createChatContainer();
  
  // ユーザーメッセージ
  const userDiv = document.createElement('div');
  userDiv.className = 'max-w-[80vw] sm:max-w-[60vw] px-3 py-2 rounded-2xl ring-1 ring-white/10 backdrop-blur bg-emerald-700 ml-auto';
  userDiv.textContent = userText;
  chatContainer.appendChild(userDiv);
  
  // AIレスポンス
  const aiDiv = document.createElement('div');
  aiDiv.className = 'max-w-[80vw] sm:max-w-[60vw] px-3 py-2 rounded-2xl ring-1 ring-white/10 backdrop-blur bg-zinc-900/75';
  aiDiv.textContent = aiResponse;
  chatContainer.appendChild(aiDiv);
  
  // 古いメッセージをフェードアウト
  const messages = Array.from(chatContainer.children);
  if (messages.length > 4) {
    messages.slice(0, messages.length - 4).forEach(msg => {
      msg.style.animation = 'fadeAway 3.6s ease forwards';
      setTimeout(() => msg.remove(), 3600);
    });
  }
  
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showFlash() {
  const flash = getElement('flash');
  if (flash) {
    flash.classList.remove('hidden');
    setTimeout(() => flash.classList.add('hidden'), 120);
  }
}

function showToast(message) {
  // 既存のtoast関数を使用するか、自作
  if (window.toast) {
    window.toast(message);
  } else {
    console.log('📢 Toast:', message);
    // 簡易トースト表示
    alert(message);
  }
}

/* ---------- その他の機能 ---------- */
async function sendText() {
  const input = getElement('userText');
  if (!input) {
    console.error('userText input not found');
    return;
  }
  
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  await sendToUnifiedAI(text);
}

function quickQuestion(questionText) {
  const input = getElement('userText');
  if (input) {
    input.value = questionText;
    setTimeout(() => sendText(), 200);
  } else {
    // 直接送信
    sendToUnifiedAI(questionText);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return reject(new Error('blob is null'));
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function speak(text) {
  speechSynthesis.cancel();
  const uttr = new SpeechSynthesisUtterance(text);
  if (jpVoice) uttr.voice = jpVoice;
  uttr.rate = 1.1;
  uttr.pitch = 1.0;
  speechSynthesis.speak(uttr);
}

/* ---------- イベントリスナー ---------- */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔧 camera.js loaded');
  
  const userTextInput = getElement('userText');
  if (userTextInput) {
    userTextInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendText();
      }
    });
  }
  
  // ボタンイベントの設定
  const btnStart = getElement('btn-start');
  const btnCapture = getElement('btn-capture');
  const btnShutter = getElement('btn-shutter');
  const btnSwitch = getElement('btn-switch');
  
  if (btnStart) btnStart.addEventListener('click', () => startCamera(useBack));
  if (btnCapture) btnCapture.addEventListener('click', () => captureAndSendToAI());
  if (btnShutter) btnShutter.addEventListener('click', () => captureAndSendToAI());
  if (btnSwitch) btnSwitch.addEventListener('click', flipCamera);
});

/* ---------- グローバル公開 ---------- */
window.startCamera = startCamera;
window.captureAndSendToAI = captureAndSendToAI;
window.flipCamera = flipCamera;
window.sendText = sendText;
window.quickQuestion = quickQuestion;
window.updateStatus = updateStatus;
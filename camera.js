/* ---------- ズーム機能 ---------- */
let currentZoom = 1;
const maxZoom = 3;
const minZoom = 1;
const zoomStep = 0.2;

/* ---------- セッション ID（ブラウザごとに固定） ---------- */
const SESSION_ID = (() => {
  try {
    return localStorage.getItem('session-id') || (() => {
      const id = 'ss-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('session-id', id);
      return id;
    })();
  } catch {
    // localStorage が使えない場合のフォールバック
    return 'ss-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
})();

console.log('📱 Session ID:', SESSION_ID);

/* ---------- 定数 & 要素取得 ---------- */
const API_URL_UNIFIED = '/api/unified';
const API_URL_RESET = '/api/reset-session';
const API_URL_STT = '/api/speech-to-text';

// 要素の安全な取得
const getElement = (id) => {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Element not found: ${id}`);
  }
  return element;
};

const video = getElement('preview') || getElement('video');
const canvas = getElement('canvas');

/* ---------- SpeechSynthesis 初期化 ---------- */
let voiceReady = false;
let jpVoice = null;

function initSpeech() {
  if ('speechSynthesis' in window) {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      jpVoice = voices.find(v => v.lang.startsWith('ja')) || voices[0];
      console.log('🔊 音声:', jpVoice ? jpVoice.name : '利用不可');
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function warmUpSpeech() {
  if (voiceReady || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    voiceReady = true;
  } catch (e) {
    console.warn('音声の初期化失敗:', e);
  }
}

/* ---------- カメラ制御 ---------- */
let currentStream = null;
let useBack = true;

async function startCamera(back = true) {
  console.log('📱 カメラ起動開始:', back ? '背面' : '前面');

  if (!video) {
    console.error('❌ video要素が見つかりません');
    showToast('video要素が見つかりません');
    return false;
  }

  warmUpSpeech();

  // 既存ストリームを停止
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  // MediaDevices API チェック
  if (!navigator.mediaDevices?.getUserMedia) {
    console.error('❌ カメラAPIがサポートされていません');
    showToast('このブラウザはカメラをサポートしていません');
    return false;
  }

  try {
    updateStatus('カメラ起動中...', false);

    // カメラ制約の設定
    const constraints = {
      video: back ?
        { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } :
        { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    };

    console.log('📱 カメラ制約:', constraints);

    try {
      // まず指定された制約で試行
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      currentStream = stream;
      video.srcObject = stream;
    } catch (err) {
      console.log('⚠️ 指定カメラ失敗、基本設定で再試行:', err.message);
      // フォールバック: 基本設定
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      currentStream = stream;
      video.srcObject = stream;
    }

    // 動画読み込み完了まで待機
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play().then(resolve).catch(console.error);
      };
    });

    console.log(`✅ カメラ起動成功: ${video.videoWidth}x${video.videoHeight}`);
    updateStatus('カメラ起動完了', true);
    showToast('カメラ起動しました');

    return true;

  } catch (err) {
    console.error('❌ カメラエラー:', err);
    updateStatus('カメラ起動失敗', false);

    if (err.name === 'NotAllowedError') {
      showToast('カメラへのアクセスが拒否されました。設定を確認してください。');
    } else if (err.name === 'NotFoundError') {
      showToast('カメラが見つかりません');
    } else {
      showToast(`カメラエラー: ${err.message}`);
    }

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
  const statusText = getElement('status-text');
  const statusLed = getElement('status-led');

  if (statusText) statusText.textContent = text;
  if (statusLed) {
    statusLed.className = `inline-block w-2.5 h-2.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-zinc-500'}`;
  }

  if (window.setStatus) {
    window.setStatus(text, live);
  }

  console.log(`📊 Status: ${text} (live: ${live})`);
}

/* ---------- 音声録音 ---------- */
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const base64Audio = await blobToBase64(audioBlob);

      // Base64文字列からプレフィックスを削除
      const base64Data = base64Audio.split(',')[1];

      // Whisper APIに送信
      try {
        const response = await fetch(API_URL_STT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64: base64Data })
        });

        const data = await response.json();
        if (data.success && data.text) {
          // 認識したテキストをAIに送信
          await sendToUnifiedAI(data.text);
        } else {
          showToast('音声認識に失敗しました');
        }
      } catch (error) {
        console.error('❌ 音声認識エラー:', error);
        showToast('音声認識エラー');
      }

      // ストリームを停止
      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start();
    isRecording = true;
    updateStatus('録音中...', true);
    showToast('録音開始');

    // RECバッジ表示
    const recBadge = getElement('badge-rec');
    if (recBadge) recBadge.classList.remove('hidden');

  } catch (error) {
    console.error('❌ 録音開始エラー:', error);
    showToast('マイクにアクセスできません');
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    updateStatus('処理中...', false);
    showToast('録音停止→送信中');

    // RECバッジ非表示
    const recBadge = getElement('badge-rec');
    if (recBadge) recBadge.classList.add('hidden');
  }
}

/* ---------- 統合AI処理 ---------- */
let processingRequest = false;

async function sendToUnifiedAI(text, newImage = null) {
  if (processingRequest) {
    console.log('⚠️ 処理中です');
    showToast('処理中です。しばらくお待ちください。');
    return;
  }

  try {
    processingRequest = true;
    showLoadingIndicator();

    console.log(`🚀 AI送信 - Text: "${text}", 画像: ${!!newImage}`);

    const requestBody = {
      sessionId: SESSION_ID,
      text: text.trim()
    };

    if (newImage) {
      requestBody.image = newImage;
    }

    const response = await fetch(API_URL_UNIFIED, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const answer = data.answer;

    console.log(`✅ AI応答受信`);

    appendChat(text, answer);
    speak(answer);

  } catch (error) {
    console.error('❌ AI処理エラー:', error);

    const errorMessage = 'エラーが発生しました。もう一度お試しください。';
    appendChat(text, errorMessage);
    showToast('エラーが発生しました');

  } finally {
    processingRequest = false;
    hideLoadingIndicator();
    updateStatus('待機中', false);
  }
}

async function captureAndSendToAI(extraText = '') {
  if (!video) {
    showToast('video要素が見つかりません');
    return;
  }

  if (!video.srcObject || !video.videoWidth) {
    showToast('カメラを起動しています...');
    const success = await startCamera(useBack);
    if (!success) return;

    // カメラ起動後、少し待ってから撮影
    setTimeout(() => captureAndSendToAI(extraText), 1000);
    return;
  }

  try {
    if (!canvas) {
      throw new Error('canvas要素が見つかりません');
    }

    // 画像をキャプチャ
    const SCALE = 0.7; // 画像サイズの調整
    canvas.width = video.videoWidth * SCALE;
    canvas.height = video.videoHeight * SCALE;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) {
      throw new Error('画像の生成に失敗しました');
    }

    const base64Image = await blobToBase64(blob);

    const questionText = extraText || '写真を送信しました。何が見えますか？';

    await sendToUnifiedAI(questionText, base64Image);

    // フラッシュ効果
    showFlash();
    showToast('画像を送信しました');

  } catch (error) {
    console.error('❌ 撮影エラー:', error);
    showToast('画像の処理に失敗しました');
  }
}

/* ---------- UI表示関数 ---------- */
function showLoadingIndicator(message = '🤔 考え中...') {
  hideLoadingIndicator();

  const chatContainer = getElement('chat');
  if (!chatContainer) return;

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

function appendChat(userText, aiResponse) {
  const chatContainer = getElement('chat');
  if (!chatContainer) return;

  // 既存のローディング削除
  hideLoadingIndicator();

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

  // 古いメッセージをフェードアウト（最新4件のみ表示）
  const messages = Array.from(chatContainer.children).filter(el => el.id !== 'loading-indicator');
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
  if (window.toast) {
    window.toast(message);
  } else {
    console.log('📢 Toast:', message);
    // 簡易トースト実装
    const toastEl = document.createElement('div');
    toastEl.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 min-w-[220px] max-w-[90vw] px-4 py-2 rounded-xl bg-white/10 backdrop-blur text-sm shadow-2xl z-50';
    toastEl.textContent = message;
    document.body.appendChild(toastEl);
    setTimeout(() => toastEl.remove(), 5000); // 5秒に延長
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
    // 少し遅延を入れてから送信
    setTimeout(() => sendText(), 100);
  } else {
    // 直接送信
    sendToUnifiedAI(questionText);
  }
}

async function resetSession() {
  try {
    const response = await fetch(API_URL_RESET, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID })
    });

    if (response.ok) {
      // チャットをクリア
      const chatContainer = getElement('chat');
      if (chatContainer) {
        chatContainer.innerHTML = '';
      }
      updateStatus('リセット完了', false);
      showToast('会話をリセットしました');
    }
  } catch (error) {
    console.error('❌ リセットエラー:', error);
    showToast('リセットに失敗しました');
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

const API_URL_TTS = '/api/tts';

// AudioContext（モバイル対応用）
let audioContext = null;
// モバイル用：事前にプリウォームしたAudio
let pendingAudio = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

// ユーザー操作時にAudioContextを解禁
function unlockAudioContext() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  } catch (e) {
    console.warn('AudioContext解禁失敗:', e);
  }
}

// ユーザータップ時にAudioをプリウォーム（モバイル対策）
function prewarmAudio() {
  unlockAudioContext();
  // 空のAudioを作成し、play()を試みることで権限を確保
  pendingAudio = new Audio();
  pendingAudio.volume = 0.01; // ほぼ無音
  // 極小の無音データ（48kHz, 16bit, モノラル, 0.01秒）
  const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';
  pendingAudio.src = silentWav;
  pendingAudio.play().then(() => {
    console.log('🔊 Audio prewarm成功');
    pendingAudio.pause();
    pendingAudio.volume = 1.0;
  }).catch(e => {
    console.warn('🔊 Audio prewarm失敗:', e.message);
  });
}

// 初回タップでAudioContextを解禁
['click', 'touchstart'].forEach(event => {
  document.addEventListener(event, unlockAudioContext, { once: true });
});

async function speak(text) {
  if (!text || text.trim().length === 0) return;

  // AudioContextを念のため解禁
  unlockAudioContext();

  try {
    // Gemini TTS APIを呼び出し
    const response = await fetch(API_URL_TTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.audio) {
      // Base64音声データをAudioで再生
      const audioSrc = `data:${data.mimeType || 'audio/mpeg'};base64,${data.audio}`;

      // プリウォームしたAudioがあれば再利用、なければ新規作成
      const audio = pendingAudio || new Audio();
      pendingAudio = null; // 使用済み
      audio.src = audioSrc;
      audio.load(); // モバイル対応
      try {
        await audio.play();
        console.log('🔊 Gemini TTS再生成功');
        showToast('🔊 Gemini TTS'); // デバッグ用
      } catch (err) {
        console.warn('🔊 音声再生失敗、フォールバック:', err.message);
        showToast('⚠️ フォールバック: ' + err.message); // デバッグ用
        speakFallback(text);
      }
      return;
    }

    throw new Error('音声データなし');

  } catch (error) {
    console.warn('🔊 Gemini TTS失敗、Web Speech APIへフォールバック:', error.message);
    showToast('❌ TTS失敗: ' + error.message); // デバッグ用
    speakFallback(text);
  }
}

// フォールバック: Web Speech API
function speakFallback(text) {
  if (!('speechSynthesis' in window)) return;

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

  // 音声初期化
  initSpeech();

  // テキスト入力
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
  const btnSendText = getElement('btn-send-text');
  const btnReset = getElement('btn-reset');
  const btnRec = getElement('btn-rec');

  if (btnStart) btnStart.addEventListener('click', () => startCamera(useBack));
  if (btnCapture) btnCapture.addEventListener('click', () => captureAndSendToAI());
  if (btnShutter) {
    // モバイル対策: touchstart時にAudioをプリウォーム
    btnShutter.addEventListener('touchstart', prewarmAudio, { passive: true });
    btnShutter.addEventListener('click', () => captureAndSendToAI());
  }
  if (btnSwitch) btnSwitch.addEventListener('click', flipCamera);
  if (btnSendText) btnSendText.addEventListener('click', sendText);
  if (btnReset) btnReset.addEventListener('click', resetSession);

  // 録音ボタン（押している間録音）
  if (btnRec) {
    let recordingTimeout;

    const startRec = () => {
      if (!isRecording) {
        startRecording();
        // 最大10秒で自動停止
        recordingTimeout = setTimeout(() => {
          if (isRecording) stopRecording();
        }, 10000);
      }
    };

    const stopRec = () => {
      if (recordingTimeout) clearTimeout(recordingTimeout);
      if (isRecording) stopRecording();
    };

    // デスクトップ
    btnRec.addEventListener('mousedown', startRec);
    btnRec.addEventListener('mouseup', stopRec);
    btnRec.addEventListener('mouseleave', stopRec);

    // モバイル
    btnRec.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startRec();
    });
    btnRec.addEventListener('touchend', (e) => {
      e.preventDefault();
      stopRec();
    });
  }

  // 初期カメラ起動（0.5秒後）
  setTimeout(() => startCamera(true), 500);
});

/* ---------- グローバル公開 ---------- */
window.startCamera = startCamera;
window.captureAndSendToAI = captureAndSendToAI;
window.flipCamera = flipCamera;
window.sendText = sendText;
window.quickQuestion = quickQuestion;
window.updateStatus = updateStatus;
window.resetSession = resetSession;


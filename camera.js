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
const API_URL_UNIFIED = '/api/unified';  // 統合API

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

/* ---------- 統合AI処理 ---------- */
let lastImageB64 = null;  // 最新画像のキャッシュ
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
    
    // ローディング表示
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
    const SCALE = 0.6;  // 60%スケール（人物認識改善）
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

/* ---------- 定型質問機能 ---------- */
// 定型質問を送信する関数
function quickQuestion(questionText) {
  const input = document.getElementById('userText');
  input.value = questionText;
  
  // 少し遅延して送信（ユーザーが確認できるように）
  setTimeout(() => {
    sendText();
  }, 200);
}

/* ---------- Whisper API 音声認識機能 ---------- */
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// 音声録音の初期化
async function initAudioRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    });
    
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      console.log('🎤 録音停止、音声認識開始...');
      
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      audioChunks = [];
      
      await sendAudioToWhisper(audioBlob);
    };
    
    console.log('✅ 音声録音準備完了');
    return true;
    
  } catch (error) {
    console.error('❌ 音声録音初期化失敗:', error);
    return false;
  }
}

// Whisper API に音声を送信
async function sendAudioToWhisper(audioBlob) {
  try {
    showLoadingIndicator('🎤 音声を認識中...');
    
    // Blob を Base64 に変換
    const audioBase64 = await blobToBase64(audioBlob);
    const base64Data = audioBase64.split(',')[1]; // "data:audio/webm;base64," を除去
    
    console.log(`🎤 Whisper APIに送信中... (${audioBlob.size} bytes)`);
    
    const response = await fetch('/api/speech-to-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: base64Data }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.text) {
      console.log(`✅ 音声認識成功: "${result.text}"`);
      
      const input = document.getElementById('userText');
      input.value = result.text;
      
      hideLoadingIndicator();
      await sendToUnifiedAI(result.text);
      
    } else {
      throw new Error(result.error || '音声認識に失敗しました');
    }
    
  } catch (error) {
    console.error('❌ Whisper API エラー:', error);
    hideLoadingIndicator();
    alert(`音声認識エラー: ${error.message}`);
  }
}

// 音声録音開始/停止
async function toggleAudioRecording() {
  if (!mediaRecorder) {
    const initialized = await initAudioRecording();
    if (!initialized) {
      alert('マイクにアクセスできません。ブラウザの設定を確認してください。');
      return;
    }
  }
  
  if (isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    updateRecordButton(false);
  } else {
    audioChunks = [];
    mediaRecorder.start();
    isRecording = true;
    updateRecordButton(true);
    console.log('🎤 録音開始...');
  }
}

// 録音ボタンの表示更新
function updateRecordButton(recording) {
  const recordButton = document.getElementById('recordButton');
  if (recordButton) {
    if (recording) {
      recordButton.textContent = '🔴 停止';
      recordButton.className = 'record-btn recording';
    } else {
      recordButton.textContent = '🎤 音声録音';
      recordButton.className = 'record-btn';
    }
  }
}

/* ---------- UI表示関数 ---------- */
function showLoadingIndicator(message = '🤔 考え中...') {
  // 既存のローディングを削除
  hideLoadingIndicator();
  
  // 新しいローディング表示
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-indicator';
  loadingDiv.innerHTML = `<div class="bubble ai">${message}</div>`;
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

/* ---------- セッションリセット機能 ---------- */
// セッションをリセットする関数
async function resetSession() {
  // 確認ダイアログ
  const confirmed = confirm('🗑️ 記憶をリセットしますか？\n\n• 撮影した画像の情報\n• 会話履歴\n• AI の記憶\n\nすべてクリアされます。');
  
  if (!confirmed) {
    return;
  }

  try {
    showLoadingIndicator('🗑️ リセット中...');

    console.log('🗑️ セッションリセット開始');

    // Reset APIに送信
    const response = await fetch('/api/reset-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      console.log('✅ セッションリセット成功');
      
      // フロントエンド側のキャッシュもクリア
      lastImageB64 = null;
      
      // チャット履歴をクリア
      respEl.innerHTML = `
        <div class="bubble ai">
          🗑️ リセット完了！新しい会話を始めましょう。<br>
          カメラを開始して、景色を撮影するか、何でも質問してくださいね！
        </div>
      `;
      
      // 入力欄もクリア
      const input = document.getElementById('userText');
      if (input) input.value = '';
      
      hideLoadingIndicator();
      
      // 音声で通知
      speak('リセット完了しました。新しい会話を始めましょう。');
      
    } else {
      throw new Error(result.error || 'リセットに失敗しました');
    }

  } catch (error) {
    console.error('❌ セッションリセットエラー:', error);
    hideLoadingIndicator();
    alert(`リセットエラー: ${error.message}`);
  }
}

/* ---------- グローバル公開 ---------- */
window.startCamera = startCamera;
window.captureAndSendToAI = captureAndSendToAI;
window.flipCamera = flipCamera;
window.sendText = sendText;
window.quickQuestion = quickQuestion;
window.toggleAudioRecording = toggleAudioRecording;
window.resetSession = resetSession; 
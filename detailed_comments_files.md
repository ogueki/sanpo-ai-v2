# AI旅のおとも - 詳細コメント付きファイル解説

## 1. index.html - メインのHTMLファイル

```html
<!DOCTYPE html>
<!-- HTML5のドキュメント宣言 -->
<html lang="ja">
<!-- HTMLタグ開始、言語を日本語に設定 -->
<head>
  <!-- ヘッダー部分開始：ページのメタ情報を定義 -->
  <meta charset="UTF-8" />
  <!-- 文字エンコーディングをUTF-8に設定（日本語対応） -->
  
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- レスポンシブデザイン用：画面幅に合わせて表示調整 -->
  
  <title>AI旅のおともプロトタイプ</title>
  <!-- ブラウザのタブに表示されるタイトル -->
  
  <style>
    /* CSS スタイル定義開始 */
    video {
      width: 100%;          /* ビデオ要素を画面幅いっぱいに */
      border-radius: 12px;  /* 角を丸くして見た目を良く */
    }
    button {
      padding: 10px 20px;     /* ボタン内の余白設定 */
      margin-right: 10px;     /* ボタン間の右側余白 */
      border: none;           /* ボタンの枠線を削除 */
      border-radius: 8px;     /* ボタンの角を丸く */
      color: white;           /* 文字色を白に */
      font-weight: bold;      /* 文字を太字に */
      cursor: pointer;        /* マウスオーバー時にポインターカーソル */
    }
    .start-btn { background-color: #3b82f6; }  /* カメラ開始ボタンは青色 */
    .send-btn { background-color: #10b981; }   /* 送信ボタンは緑色 */
  </style>
</head>
<body>
  <!-- ボディ部分開始：実際に表示される内容 -->
  
  <h1>AI旅のおともプロトタイプ（Vanilla JS版）</h1>
  <!-- ページのメインタイトル -->
  
  <video id="video" autoplay playsinline></video>
  <!-- カメラ映像を表示するビデオ要素 -->
  <!-- autoplay: 自動再生 -->
  <!-- playsinline: iOS Safariでインライン再生（全画面にならない） -->
  
  <canvas id="canvas" style="display: none;"></canvas>
  <!-- 画像キャプチャ用のキャンバス要素（非表示） -->
  <!-- JavaScriptでビデオフレームをここに描画してから画像として取得 -->
  
  <div>
    <!-- ボタンコンテナ開始 -->
    <button class="start-btn" onclick="startCamera()">カメラ開始</button>
    <!-- カメラを起動するボタン：camera.jsのstartCamera関数を呼び出し -->
    
    <button class="send-btn" onclick="captureAndSendToAI()">景色を送る</button>
    <!-- 現在の映像をキャプチャしてAIに送信：captureAndSendToAI関数を呼び出し -->
    
    <button class="flip-btn" onclick="flipCamera()">カメラ切替</button>
    <!-- 前面/背面カメラを切り替え：flipCamera関数を呼び出し -->
    
    <button onclick="speak('こんにちは。聞こえますか？')">音声テスト</button>
    <!-- 音声合成のテスト用ボタン：speak関数で日本語テスト音声を再生 -->
  </div>
  
  <div id="chat-box">
    <!-- チャット入力エリア -->
    <input id="userText" type="text" placeholder="質問を入力…" />
    <!-- ユーザーがテキストを入力するための入力欄 -->
    
    <button onclick="sendText()">送信</button>
    <!-- テキストメッセージを送信：sendText関数を呼び出し -->
  </div>
  
  <p id="response"></p>
  <!-- AIからの応答を表示するための段落要素 -->

<script src="camera.js" defer></script>
<!-- JavaScriptファイルを読み込み -->
<!-- defer: HTMLの解析が完了してから実行（DOM要素が確実に存在） -->
</body>
</html>
```

## 2. camera.js - フロントエンドメイン処理

```javascript
/* ---------- セッション ID（ブラウザごとに固定） ---------- */
// ブラウザのローカルストレージからセッションIDを取得、なければ新規作成
const SESSION_ID =
  localStorage.getItem('session-id') ||  // まずローカルストレージから取得を試行
  (() => {
    // セッションIDが存在しない場合の新規作成処理
    const id = crypto?.randomUUID      // 最新ブラウザのUUID生成機能を使用
      ? crypto.randomUUID()            // 利用可能ならcrypto.randomUUID()を使用
      : 'ss-' + Date.now().toString(36) + '-' +     // フォールバック：現在時刻をベース36で変換
      Math.random().toString(36).slice(2, 10);      // ランダム文字列を追加
    localStorage.setItem('session-id', id);          // 生成したIDをローカルストレージに保存
    return id;                                       // 生成したIDを返す
  })();

/* ---------- 定数 & 要素取得 ---------- */
// APIエンドポイントのURL定義
const API_URL_VISION = '/api/vision';    // 画像解析API
const API_URL_CHAT = '/api/chat';        // テキストの必須チェック
  if (!text) return res.status(400).json({ error: 'no text' });

  // OpenAI クライアントを初期化
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 最新の画像を取得（画像参照が必要な質問の場合に使用）
  const latestImage = getLatestImage(sessionId);
  // 過去に解析した画像の説明文を全て取得
  const descriptions = getDescriptions(sessionId);
  
  // システムプロンプトに画像の説明を含める
  let systemContent = 'あなたは旅ガイドでフレンドリーに会話します。';
  if (descriptions.length > 0) {
    // 過去の画像説明がある場合はシステムプロンプトに追加
    systemContent += `\n\n過去に見た画像の説明:\n${descriptions.join('\n\n')}`;
  }

  // メッセージ配列を構築
  const messages = [
    { role: 'system', content: systemContent },    // システムプロンプト
    ...getHistory(sessionId)                       // 過去の会話履歴を展開
  ];

  // ユーザーのメッセージを構築（マルチモーダル対応）
  const userMessage = { role: 'user', content: [] };
  
  // テキスト部分を追加
  userMessage.content.push({ type: 'text', text: text });
  
  // 「その写真」「この画像」などの参照があり、最新の画像がある場合は画像も含める
  if (latestImage && (text.includes('写真') || text.includes('画像') || text.includes('これ') || text.includes('それ'))) {
    userMessage.content.push({
      type: 'image_url',
      image_url: { url: latestImage.data }    // Base64画像データを設定
    });
  }

  // 構築したユーザーメッセージを配列に追加
  messages.push(userMessage);

  // gpt-4o-miniは画像とテキストの両方に対応
  const chat = await openai.chat.completions.create({
    model: 'gpt-4o-mini',    // マルチモーダル対応モデル
    messages: messages,      // 構築したメッセージ配列
    temperature: 0.7,        // 創造性のバランス調整
    max_tokens: 500          // 応答の最大長制限
  });

  // AIの応答を取得
  const answer = chat.choices[0].message.content;

  // 履歴に保存（画像は含めない、テキストのみ）
  pushHistory(sessionId, { role: 'user', content: text });
  pushHistory(sessionId, { role: 'assistant', content: answer });

  // 成功レスポンスを返す
  res.json({ answer });
};
```

## 7. package.json - プロジェクト設定ファイル

```json
{
  "name": "ai-sanpo",              // プロジェクト名
  "type": "module",                // ES Modules を使用（import/export構文）
  "version": "1.0.0",              // バージョン番号
  "main": "index.js",              // メインエントリーポイント
  "scripts": {                     // npm スクリプト定義
    "test": "echo \"Error: no test specified\" && exit 1"    // テスト未実装
  },
  "keywords": [],                  // npm 検索用キーワード（空）
  "author": "",                    // 作者情報（空）
  "license": "ISC",                // ライセンス（ISC）
  "description": "",               // プロジェクト説明（空）
  "dependencies": {                // 実行時依存関係
    "cors": "^2.8.5",             // CORS（Cross-Origin Resource Sharing）対応
    "dotenv": "^16.5.0",          // 環境変数ファイル（.env）読み込み
    "express": "^5.1.0",          // Web サーバーフレームワーク
    "openai": "^5.3.0"            // OpenAI API クライアントライブラリ
  }
}
```

## 8. .gitignore - Git除外設定

```
".env"     // 引用符付きの.envファイル（誤記？）
".env"     // 重複行（誤記？）
.env       // 正しい.envファイル除外設定
```

**注意**: このファイルには記述の重複と引用符の誤使用があります。正しくは以下のようにするべきです：

```
# 環境変数ファイル（APIキー等の機密情報）
.env
.env.local
.env.production

# Node.js 関連
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS 関連
.DS_Store
Thumbs.db
```

## 主要な技術的ポイント

### 1. **非同期処理の活用**
- `async/await` を使用してAPI呼び出しやカメラアクセスを処理
- Promise ベースのファイル読み込み（blobToBase64関数）

### 2. **エラーハンドリング**
- try-catch ブロックでAPIエラーを適切に処理
- フォールバック機能（背面カメラ失敗時の前面カメラ切替）

### 3. **メモリ管理**
- 古いデータの自動削除（MAX_TURNS制限）
- 画像キャッシュの容量制限（最大5枚）

### 4. **パフォーマンス最適化**
- 画像の縮小処理（40%スケール）
- 判定結果のキャッシュ（30秒間）
- 音声エンジンのウォームアップ

### 5. **ユーザビリティ**
- CORS対応によるクロスオリジンアクセス
- レスポンシブデザイン対応
- 日本語音声合成の自動選択

この詳細コメント解説により、各ファイルが何をしているか、どのような技術的判断がなされているかが明確になります。チャットAPI

// HTML要素の取得（DOM操作用）
const video = document.getElementById('video');      // ビデオ要素
const canvas = document.getElementById('canvas');    // キャンバス要素
const respEl = document.getElementById('response');  // 応答表示エリア

/* ---------- SpeechSynthesis 初期化 ---------- */
// 音声合成機能の初期化変数
let voiceReady = false;    // 音声合成の準備完了フラグ
let jpVoice = null;        // 日本語音声オブジェクト

// 音声リストが読み込まれた時の処理
speechSynthesis.onvoiceschanged = () => {
  // 利用可能な音声から日本語音声を検索
  jpVoice = speechSynthesis.getVoices().find(v => v.lang.startsWith('ja'));
};

// 音声合成機能のウォームアップ（初回起動時の遅延対策）
function warmUpSpeech() {
  if (voiceReady) return;                                    // 既に準備済みなら何もしない
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));   // 空文字で音声エンジンを起動
  voiceReady = true;                                         // 準備完了フラグを立てる
}

/* ---------- カメラ制御 ---------- */
let useBack = true;    // 背面カメラ使用フラグ（true: 背面, false: 前面）

// カメラを開始する非同期関数
async function startCamera(back = true) {
  warmUpSpeech();    // 音声合成の準備も同時に実行

  // カメラの設定オブジェクト作成
  const preferred = back
    ? { video: { facingMode: { exact: 'environment' } } }    // 背面カメラを明示的に要求
    : { video: true };                                       // デフォルト（通常は前面）カメラ

  try {
    // ユーザーメディア（カメラ）へのアクセス要求
    const stream = await navigator.mediaDevices.getUserMedia(preferred);
    video.srcObject = stream;    // 取得したストリームをビデオ要素に設定
  } catch (err) {
    // エラーハンドリング
    if (back) return startCamera(false);    // 背面カメラ失敗時は前面カメラで再試行
    alert('カメラにアクセスできません: ' + err.message);    // 完全に失敗した場合はエラー表示
  }
}

// カメラを前面/背面で切り替える関数
function flipCamera() {
  if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());    // 現在のストリームを停止
  useBack = !useBack;        // フラグを反転
  startCamera(useBack);      // 新しいカメラで再開始
}

/* ---------- 画像キャプチャ＆送信 ---------- */
let lastImageB64 = null;    // 直近にキャプチャした画像のBase64データ
let lastVisionTime = 0;     // Vision APIを最後に呼び出した時刻（ミリ秒）

/* 直近10秒以内にVision APIを使用したかの判定 */
function justUsedVision() {
  return Date.now() - lastVisionTime < 10_000;    // 現在時刻との差が10秒未満かチェック
}

// 画像をキャプチャしてAIに送信する非同期関数
async function captureAndSendToAI(extraText = '') {
  // ビデオが準備できているかチェック
  if (!video.videoWidth) {
    alert('まず「カメラ開始」を押してください');
    return;
  }
  
  // 画像サイズを縮小してファイルサイズを削減
  const SCALE = 0.4;    // 40%に縮小（通信量とAPI料金の節約）
  canvas.width = video.videoWidth * SCALE;      // キャンバス幅を設定
  canvas.height = video.videoHeight * SCALE;    // キャンバス高さを設定
  
  // ビデオの現在フレームをキャンバスに描画
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  // キャンバスをBlobオブジェクトに変換（JPEG形式、品質80%）
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
  if (!blob) {
    alert('画像の取得に失敗しました');
    return;
  }
  
  // BlobをBase64形式に変換（API送信用）
  const base64Image = await blobToBase64(blob);
  lastImageB64 = base64Image;    // 後で再利用するためにキャッシュ

  // Vision APIにPOST送信
  const res = await fetch(API_URL_VISION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },    // JSON形式で送信
    body: JSON.stringify({
      sessionId: SESSION_ID,    // セッション識別用
      image: base64Image,       // Base64エンコードされた画像データ
      text: extraText           // 追加の質問テキスト（あれば）
    })
  });
  
  // レスポンスのエラーハンドリング
  const text = await res.text();    // まずテキストとして取得
  if (!res.ok) {
    console.error('Vision 500 →', text);
    alert('サーバーエラー:\n' + text.slice(0, 120));    // エラー内容の先頭120文字を表示
    return;
  }
  
  // 正常レスポンスの処理
  const { description } = JSON.parse(text);    // JSONパース
  lastVisionTime = Date.now();                  // Vision使用時刻を記録
  
  // 結果をチャットエリアに表示
  appendChat(extraText || '[画像質問]', description);
  speak(description);    // 音声で読み上げ
}

// 質問がVision APIを必要とするかの判定結果をキャッシュ
const judgeCache = new Map();   // text → { ans: boolean, ts: timestamp }

// テキストが画像解析を必要とするかAIに判定してもらう非同期関数
async function askNeedsVision(text) {
  // 30秒間のキャッシュをチェック（同じ質問の重複判定を避ける）
  const c = judgeCache.get(text);
  if (c && Date.now() - c.ts < 30_000) return c.ans;

  try {
    // Judge APIに判定を依頼
    const r = await fetch('/api/judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    
    const yn = (await r.text()).trim() === 'yes';    // "yes"/"no"の文字列比較
    judgeCache.set(text, { ans: yn, ts: Date.now() });    // 結果をキャッシュ
    return yn;
  } catch (e) {
    console.warn('judge fallback', e);
    // ネットワーク障害時のフォールバック：簡易正規表現で判定
    return /写|映|何色|服|男|女|あれ|これ|それ|^これ|^それ|^何[？?]?$/.test(text);
  }
}

/* ---------- テキスト送信 ---------- */
// テキスト入力欄からメッセージを送信する非同期関数
async function sendText() {
  const input = document.getElementById('userText');    // 入力欄の要素を取得
  const text = input.value.trim();                      // 入力テキストを取得（前後の空白除去）
  if (!text) return;                                    // 空文字なら何もしない

  // 画像を再送するかの判定
  const judgeResult = await askNeedsVision(text);       // AIによる判定
  const recentVision = justUsedVision();                // 直近10秒以内の使用履歴
  const needsVision = judgeResult || recentVision;      // どちらかがtrueなら画像が必要
  
  // デバッグログ出力
  console.log(`判定結果: "${text}" → judge: ${judgeResult}, recent: ${recentVision}, needs: ${needsVision}`);

  if (needsVision) {
    // 画像解析が必要な場合の処理
    if (lastImageB64) {
      // キャッシュされた画像を再利用
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          image: lastImageB64,    // キャッシュされた画像を使用
          text
        })
      });
      const { description } = await res.json();

      lastVisionTime = Date.now();    // 使用時刻を更新

      appendChat(text, description);    // チャットに表示
      speak(description);               // 音声読み上げ
      return;
    }
    // キャッシュが無い場合は新しく撮影
    await captureAndSendToAI(text);
    return;
  } else {
    // テキストのみの処理（画像不要）
    const res = await fetch(API_URL_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, text })
    });
    const { answer } = await res.json();
    appendChat(text, answer);    // チャットに表示
    speak(answer);               // 音声読み上げ
  }
  input.value = '';    // 入力欄をクリア
}

/* ---------- 補助関数 ---------- */
// Blobオブジェクトをbase64文字列に変換する関数
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return reject(new Error('blob is null'));    // nullチェック
    const reader = new FileReader();                         // ファイル読み込み用
    reader.onloadend = () => resolve(reader.result);         // 読み込み完了時にresolve
    reader.readAsDataURL(blob);                             // Data URL形式で読み込み開始
  });
}

// テキストを音声で読み上げる関数
function speak(text) {
  speechSynthesis.cancel();                        // 現在再生中の音声を停止
  const uttr = new SpeechSynthesisUtterance(text); // 新しい読み上げオブジェクト作成
  if (jpVoice) uttr.voice = jpVoice;               // 日本語音声が利用可能なら設定
  speechSynthesis.speak(uttr);                     // 読み上げ開始
}

/* ---------- チャット表示 ---------- */
// チャットエリアに質問と回答を追加表示する関数
function appendChat(q, a) {
  // HTMLに直接追加（ユーザーの発言は青、AIの発言は別色で表示）
  respEl.innerHTML += `<div class="bubble user">${q}</div>`;
  respEl.innerHTML += `<div class="bubble ai">${a}</div>`;
}

/* ---------- グローバル公開 ---------- */
// HTMLのonclickから呼び出せるように関数をwindowオブジェクトに登録
window.startCamera = startCamera;
window.captureAndSendToAI = captureAndSendToAI;
window.flipCamera = flipCamera;
window.sendText = sendText;
```

## 3. sessions/store.js - セッション管理

```javascript
// ── 超シンプルなメモリストア ──
//  later: Redis 等に差し替えても API はそのまま

// 保持する会話ターン数の上限（ユーザー発言+AI応答で1ターン）
const MAX_TURNS = 5;          // ← ここを変えれば保持長を調整

// セッションデータを格納するメモリ内オブジェクト
// 構造: { sessionId: { history: [], images: [], descriptions: [] } }
export const sessions = {};   

/* 取得 */
// 指定セッションIDの会話履歴を取得（存在しなければ空配列）
export const getHistory = (id) =>
  sessions[id]?.history ?? [];    // オプショナルチェーニング + null合体演算子

/* 画像取得 */
// 指定セッションIDの最新画像を取得
export const getLatestImage = (id) => {
  const images = sessions[id]?.images ?? [];              // 画像配列を取得
  return images.length > 0 ? images[images.length - 1] : null;    // 最後の要素または null
};

/* 説明取得 */
// 指定セッションIDの全画像説明を取得
export const getDescriptions = (id) =>
  sessions[id]?.descriptions ?? [];

/* 履歴追加＆古いメッセージ自動削除 */
export const pushHistory = (id, msg) => {
  // セッションオブジェクトを取得または初期化
  const s = sessions[id] ||= { history: [], images: [], descriptions: [] };
  
  s.history.push(msg);    // 新しいメッセージを追加
  
  // user + assistant で 1 ターンと数えて制限
  // MAX_TURNS=5なら最大10メッセージ（5往復）まで保持
  while (s.history.length > MAX_TURNS * 2) s.history.shift();    // 古いものから削除
};

/* 画像と説明を追加 */
export const addImageAndDescription = (id, image, description) => {
  // セッションオブジェクトを取得または初期化
  const s = sessions[id] ||= { history: [], images: [], descriptions: [] };
  
  // 画像データをタイムスタンプ付きで保存
  s.images.push({
    data: image,                              // Base64画像データ
    timestamp: new Date().toISOString()       // ISO形式のタイムスタンプ
  });
  
  s.descriptions.push(description);    // 画像の説明テキストを追加
  
  // 古い画像を削除（メモリ節約のため最新5枚まで保持）
  while (s.images.length > 5) s.images.shift();           // 古い画像から削除
  while (s.descriptions.length > 5) s.descriptions.shift(); // 古い説明から削除
};
```

## 4. api/vision.js - 画像解析API

```javascript
// Express フレームワークをインポート
import express from 'express';
// OpenAI API クライアントをインポート
import OpenAI from 'openai';
// セッション管理モジュールをインポート（名前空間付き）
import * as sessionsStore from '../sessions/store.js';

// Express アプリケーションインスタンスを作成
const app = express();
// JSON パースミドルウェアを設定（最大10MBまで受信可能）
app.use(express.json({ limit: '10mb' }));

// OpenAI クライアントを初期化
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,    // 環境変数からAPIキーを取得
});

// POST /api/vision エンドポイントの定義
app.post('/api/vision', async (req, res) => {
    // CORS ヘッダーの設定（クロスオリジン リクエスト対応）
    res.header('Access-Control-Allow-Origin', '*');         // 全オリジンを許可
    res.header('Access-Control-Allow-Methods', 'POST');     // POST メソッドを許可
    res.header('Access-Control-Allow-Headers', 'Content-Type'); // Content-Type ヘッダーを許可

    try {
        // リクエストボディから必要なデータを分割代入で取得
        const { image, sessionId, text } = req.body;

        // 必須パラメータの検証
        if (!image || !sessionId) {
            return res.status(400).json({ error: '画像とセッションIDが必要です' });
        }

        // ユーザーの質問があればそれを使用、なければデフォルトの質問
        const userQuestion = text || "この画像に何が写っているか、簡潔に説明してください。";

        // OpenAI Vision API にリクエスト送信
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",    // Vision 対応モデルを指定
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: userQuestion },              // テキスト部分
                        { type: "image_url", image_url: { url: image } }   // 画像部分（Base64）
                    ]
                }
            ],
            max_tokens: 300    // 応答の最大トークン数制限
        });

        // AI の応答テキストを取得
        const description = response.choices[0].message.content;
        
        // 画像と説明をセッションストアに保存
        sessionsStore.addImageAndDescription(sessionId, image, description);

        // 成功レスポンスを返す
        res.json({ description });
    } catch (error) {
        // エラーログ出力
        console.error('Vision API Error:', error);
        // クライアントにエラーレスポンスを返す
        res.status(500).json({ error: '画像の解析に失敗しました' });
    }
});

// OPTIONS /api/vision プリフライトリクエスト対応
app.options('/api/vision', (req, res) => {
    // CORS ヘッダーを設定してプリフライトに応答
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(200);    // OK ステータスで応答
});

// サーバーのポート設定（環境変数または3001をデフォルト）
const PORT = process.env.PORT || 3001;
// サーバー起動
app.listen(PORT, () => {
    console.log(`Vision API server running on port ${PORT}`);
});
```

## 5. api/judge.js - 画像必要性判定API

```javascript
// OpenAI API クライアントをインポート
import OpenAI from 'openai';

// デフォルトエクスポート関数（Next.js API Routes形式）
export default async function handler(req, res) {
  // HTTP メソッドチェック（POST のみ受け付け）
  if (req.method !== 'POST') {
    return res.status(405).end();    // 405 Method Not Allowed で終了             
  }

  // リクエストボディからテキストを取得（デフォルトで空オブジェクト）
  const { text } = req.body || {};

  // OpenAI クライアントを初期化
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // OpenAI API に判定リクエスト送信
  const chat = await openai.chat.completions.create({
    model: 'gpt-4o-mini',    // 軽量で高速なモデルを使用
    messages: [
      {
        role: 'system',
        content: `
ユーザーの質問が以下のいずれかに該当する場合は "yes" と答えてください：

1. 「これ」「それ」「あれ」「この」「その」「あの」などの指示語を含む
2. 「何？」「何が見える？」「何が写ってる？」など、見ているものについて尋ねている
3. 視覚的な情報（色、形、見た目、大きさ）について尋ねている
4. 「見える」「写っている」「映っている」などの視覚関連の動詞を含む
5. 人物、物体、風景の特定や説明を求めている

以下の場合は "no" と答えてください：
- 一般的な知識や情報を尋ねている
- 計算、翻訳、説明などの非視覚的タスク
- 挨拶や雑談
- 前の会話の続きで、新しい視覚情報が不要な場合

回答は "yes" または "no" のみ。
`
      },
      { role: 'user', content: text }    // ユーザーの質問テキスト
    ],
    max_tokens: 1,     // 応答は "yes" または "no" のみなので1トークンで十分
    temperature: 0     // 決定論的な応答のため温度を0に設定
  });

  // 応答テキストの前後空白を除去してレスポンス
  res.end(chat.choices[0].message.content.trim());
}
```

## 6. api/chat.js - テキストチャットAPI

```javascript
// OpenAI API クライアントをインポート
import OpenAI from 'openai';
// セッション管理関数群をインポート
import { getHistory, pushHistory, getLatestImage, getDescriptions } from '../sessions/store.js'; 

// デフォルトエクスポート関数（Next.js API Routes形式）
export default async (req, res) => {
  // HTTP メソッドチェック（POST のみ受け付け）
  if (req.method !== 'POST') return res.status(405).end();

  // リクエストボディから必要なデータを取得
  const { sessionId, text } = req.body;

  // デバッグログ出力
  console.log('Session ID:', sessionId);
  console.log('Sessions object:', sessions);                    // sessions は未定義変数？
  console.log('Latest image exists:', !!getLatestImage(sessionId));  // 最新画像の有無
  console.log('Descriptions:', getDescriptions(sessionId));          // 過去の説明一覧

  // テキスト
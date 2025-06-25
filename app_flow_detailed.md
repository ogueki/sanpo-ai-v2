# AI旅のおとも - 詳細な処理フロー

## 🚀 アプリケーション起動フロー

### 1. ページ読み込み時の初期化
```
1. HTML読み込み
   ├── DOCTYPE、meta設定
   ├── CSS スタイル読み込み
   ├── DOM要素作成（video, canvas, input等）
   └── camera.js を defer で読み込み

2. JavaScript初期化 (camera.js)
   ├── セッションID生成/取得
   │   ├── localStorage.getItem('session-id') 確認
   │   ├── 存在しない場合: crypto.randomUUID() または fallback
   │   └── localStorage.setItem() で保存
   ├── DOM要素取得 (video, canvas, response)
   ├── 音声合成初期化
   │   ├── voiceReady = false 設定
   │   ├── speechSynthesis.onvoiceschanged イベント登録
   │   └── 日本語音声検索・設定
   └── グローバル関数をwindowオブジェクトに登録
```

## 📷 カメラ機能の処理フロー

### 2. カメラ開始 (`startCamera()`)
```
ユーザー: 「カメラ開始」ボタンクリック
   ↓
1. warmUpSpeech() 実行
   ├── voiceReady チェック
   ├── 空文字でSpeechSynthesisUtterance作成
   └── voiceReady = true 設定

2. カメラ設定作成
   ├── useBack = true の場合
   │   └── { video: { facingMode: { exact: 'environment' } } }
   └── useBack = false の場合
       └── { video: true }

3. navigator.mediaDevices.getUserMedia() 呼び出し
   ├── 成功時: video.srcObject = stream 設定
   └── 失敗時: 
       ├── 背面カメラ失敗 → 前面カメラで再試行
       └── 完全失敗 → エラーアラート表示

結果: カメラ映像がvideoエレメントに表示開始
```

### 3. 画像キャプチャ・送信 (`captureAndSendToAI()`)
```
ユーザー: 「景色を送る」ボタンクリック
   ↓
1. 前提条件チェック
   ├── video.videoWidth 存在確認
   └── 未準備なら「カメラ開始」を促すアラート

2. 画像キャプチャ処理
   ├── SCALE = 0.4 (40%縮小)
   ├── canvas.width = video.videoWidth * SCALE
   ├── canvas.height = video.videoHeight * SCALE
   └── canvas.getContext('2d').drawImage() でフレーム描画

3. 画像データ変換
   ├── canvas.toBlob() でJPEG変換 (品質80%)
   ├── blobToBase64() でBase64エンコード
   └── lastImageB64 = base64Image でキャッシュ保存

4. API送信準備
   ├── fetch('/api/vision', { method: 'POST' })
   ├── リクエストボディ作成:
   │   ├── sessionId: SESSION_ID
   │   ├── image: base64Image
   │   └── text: extraText (追加質問)
   └── JSON形式で送信

5. Vision API処理 (サーバーサイド)
   ├── リクエスト受信・バリデーション
   ├── OpenAI Vision API呼び出し
   │   ├── model: "gpt-4o-mini"
   │   ├── messages: [{ role: "user", content: [text, image] }]
   │   └── max_tokens: 300
   ├── レスポンス取得: description
   └── sessionsStore.addImageAndDescription() で保存

6. クライアント側レスポンス処理
   ├── lastVisionTime = Date.now() 更新
   ├── appendChat(extraText || '[画像質問]', description)
   └── speak(description) 音声読み上げ

結果: 画像説明がチャットエリアに表示＋音声再生
```

## 💬 テキストチャット機能の処理フロー

### 4. テキスト送信 (`sendText()`)
```
ユーザー: テキスト入力 → 「送信」ボタンクリック
   ↓
1. 入力値取得・検証
   ├── document.getElementById('userText').value.trim()
   └── 空文字チェック → 早期リターン

2. 画像必要性判定フェーズ
   ├── askNeedsVision(text) 呼び出し
   │   ├── judgeCache.get(text) でキャッシュ確認 (30秒)
   │   ├── キャッシュヒット → 結果返却
   │   └── キャッシュミス → Judge API呼び出し
   │
   ├── Judge API処理 (/api/judge)
   │   ├── OpenAI API呼び出し
   │   │   ├── model: 'gpt-4o-mini'
   │   │   ├── system prompt: 画像必要性判定ルール
   │   │   ├── max_tokens: 1
   │   │   └── temperature: 0
   │   ├── レスポンス: "yes" or "no"
   │   └── judgeCache.set() でキャッシュ保存
   │
   ├── justUsedVision() 直近使用チェック
   │   └── Date.now() - lastVisionTime < 10_000
   │
   └── needsVision = judgeResult || recentVision

3. 分岐処理
```

### 4-A. 画像が必要な場合 (needsVision = true)
```
1. 画像キャッシュ確認
   ├── lastImageB64 存在チェック
   └── 存在する場合: キャッシュ再利用フロー

2. キャッシュ再利用フロー
   ├── fetch('/api/vision') 再呼び出し
   ├── リクエストボディ:
   │   ├── sessionId: SESSION_ID
   │   ├── image: lastImageB64 (キャッシュ)
   │   └── text: ユーザー入力テキスト
   ├── Vision API処理 (前述と同じ)
   ├── lastVisionTime 更新
   ├── appendChat(text, description)
   └── speak(description)

3. キャッシュなしの場合
   └── captureAndSendToAI(text) 新規撮影実行

結果: 画像を考慮したAI応答
```

### 4-B. テキストのみの場合 (needsVision = false)
```
1. Chat API呼び出し
   ├── fetch('/api/chat', { method: 'POST' })
   └── リクエストボディ: { sessionId, text }

2. Chat API処理 (/api/chat)
   ├── セッション情報取得
   │   ├── getLatestImage(sessionId)
   │   ├── getDescriptions(sessionId)
   │   └── getHistory(sessionId)
   │
   ├── システムプロンプト構築
   │   ├── 基本: '旅ガイドでフレンドリーに会話'
   │   └── descriptions.length > 0 なら過去画像説明追加
   │
   ├── メッセージ配列構築
   │   ├── system message
   │   ├── 過去履歴 (...getHistory())
   │   └── 新規ユーザーメッセージ
   │
   ├── 画像参照キーワード検出
   │   ├── text.includes('写真'||'画像'||'これ'||'それ')
   │   ├── 条件満たす + latestImage存在
   │   └── → userMessage.content に image_url 追加
   │
   ├── OpenAI API呼び出し
   │   ├── model: 'gpt-4o-mini'
   │   ├── messages: 構築配列
   │   ├── temperature: 0.7
   │   └── max_tokens: 500
   │
   └── 履歴保存
       ├── pushHistory(sessionId, user message)
       └── pushHistory(sessionId, assistant message)

3. クライアント側処理
   ├── appendChat(text, answer)
   ├── speak(answer)
   └── input.value = '' (入力欄クリア)

結果: 文脈を考慮したテキスト応答
```

## 🗂️ セッション管理の詳細フロー

### 5. データ保存・取得の流れ
```
データ構造:
sessions = {
  "session-uuid": {
    history: [
      { role: 'user', content: '質問1' },
      { role: 'assistant', content: '回答1' },
      ...
    ],
    images: [
      { data: 'data:image/jpeg;base64,...', timestamp: '2025-06-25T...' },
      ...
    ],
    descriptions: [
      '美しい桜並木が...',
      '古い寺院建築が...',
      ...
    ]
  }
}

保存時の自動削除ロジック:
├── pushHistory(): MAX_TURNS * 2 (10メッセージ) 超過で古いものを削除
└── addImageAndDescription(): 5画像・5説明 超過で古いものを削除
```

## 🎵 音声機能の処理フロー

### 6. 音声読み上げ (`speak()`)
```
AIレスポンス取得後に自動実行
   ↓
1. 現在の音声停止
   └── speechSynthesis.cancel()

2. 新規読み上げオブジェクト作成
   ├── new SpeechSynthesisUtterance(text)
   ├── jpVoice 存在確認
   └── jpVoice設定 (日本語音声優先)

3. 読み上げ開始
   └── speechSynthesis.speak(utterance)

結果: テキストが日本語音声で読み上げられる
```

## 🔄 エラーハンドリングとフォールバック

### 7. 各段階でのエラー処理
```
カメラアクセス失敗:
├── 背面カメラ失敗 → 前面カメラで再試行
└── 完全失敗 → ユーザーにアラート表示

API通信エラー:
├── Vision API エラー → サーバーエラーメッセージ表示
├── Judge API エラー → 正規表現による簡易判定にフォールバック
└── Chat API エラー → (実装なし、要改善点)

画像処理エラー:
├── blob生成失敗 → '画像の取得に失敗' アラート
└── Base64変換失敗 → Promise reject

メモリ管理:
├── 履歴制限: 古いメッセージ自動削除
├── 画像制限: 古い画像自動削除
└── キャッシュ制限: 30秒でexpire
```

## 🎯 実際の使用例での完全フロー

### 例1: 風景を撮影して質問
```
1. ユーザー: 「カメラ開始」クリック
   → カメラ起動、映像表示

2. ユーザー: 富士山にカメラ向けて「景色を送る」クリック
   → 画像キャプチャ → Vision API → 「美しい富士山が...」

3. ユーザー: 「この山の高さは？」入力・送信
   → Judge API: "yes" → キャッシュ画像使用 → Vision API
   → 「富士山は標高3,776mで...」

4. ユーザー: 「富士山の歴史を教えて」入力・送信
   → Judge API: "no" → Chat API → 過去の説明を考慮した歴史解説
```

### 例2: 連続的な会話の場合
```
セッションデータの変化:

初期状態:
sessions["uuid"] = { history: [], images: [], descriptions: [] }

画像送信後:
sessions["uuid"] = {
  history: [
    { role: 'user', content: '[画像質問]' },
    { role: 'assistant', content: '美しい富士山が...' }
  ],
  images: [{ data: 'base64...', timestamp: '...' }],
  descriptions: ['美しい富士山が...']
}

テキスト質問後:
sessions["uuid"] = {
  history: [
    { role: 'user', content: '[画像質問]' },
    { role: 'assistant', content: '美しい富士山が...' },
    { role: 'user', content: 'この山の高さは？' },
    { role: 'assistant', content: '富士山は標高3,776mで...' }
  ],
  images: [{ data: 'base64...', timestamp: '...' }],
  descriptions: ['美しい富士山が...', '富士山は標高3,776mで...']
}
```

## ⚡ パフォーマンス最適化ポイント

### 8. 効率化の仕組み
```
画像処理最適化:
├── 40%縮小で通信量削減
├── JPEG 80%品質で容量圧縮
└── Base64キャッシュで再利用

API呼び出し最適化:
├── Judge結果の30秒キャッシュ
├── 直近10秒以内は画像再利用
└── 軽量モデル(gpt-4o-mini)使用

メモリ使用量制御:
├── 履歴上限: 10メッセージ
├── 画像上限: 5枚
└── 説明上限: 5件
```

この詳細フローにより、アプリケーションのすべての処理が どのように連携して動作するかが明確になります。各ステップでのデータの流れ、エラーハンドリング、最適化手法まで含めた完全な処理フローです。
// api/unified.js - Claude型統合APIシステム（デバッグ版）
import OpenAI from 'openai';
import { getHistory, pushHistory, getLatestImage, getDescriptions, addImageAndDescription } from '../sessions/store.js';

// OpenAI クライアントを初期化
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async (req, res) => {
  console.log('🎯 [Unified] API呼び出し開始!');
  
  if (req.method !== 'POST') return res.status(405).end();

  try {
    console.log('🎯 [Unified] POST処理開始!');
    
    const { sessionId, text, image } = req.body;
    console.log(`🎯 [Unified Debug] image exists: ${!!image}, sessionId: ${sessionId}`);

    // 必須パラメータチェック
    if (!sessionId || !text) {
      return res.status(400).json({ error: 'sessionIdとtextが必要です' });
    }

    console.log(`[Unified API] Session: ${sessionId}, Text: "${text}", HasImage: ${!!image}`);

    // セッション情報を取得
    const history = getHistory(sessionId);
    const descriptions = getDescriptions(sessionId);
    const latestImage = getLatestImage(sessionId);

    // 使用する画像を決定（新規画像 > キャッシュ画像 > なし）
    const imageToUse = image || (shouldUseLatestImage(text) ? latestImage?.data : null);

    // 統合プロンプトを構築
    const messages = buildIntelligentMessages({
      text,
      image: imageToUse,
      history,
      descriptions
    });

    console.log(`[Unified API] Messages count: ${messages.length}, Using image: ${!!imageToUse}`);

    // OpenAI APIに統合リクエスト送信
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 300  // 800 → 300に短縮（雑談のテンポ向上）
    });

    const answer = response.choices[0].message.content;

    // 新しい画像がある場合は保存
    if (image) {
      console.log(`📸 [Unified] 画像保存開始 session: ${sessionId}`);
      addImageAndDescription(sessionId, image, answer);
      console.log(`✅ [Unified] 画像保存完了`);
    }

    // 会話履歴に保存
    pushHistory(sessionId, { role: 'user', content: text });
    pushHistory(sessionId, { role: 'assistant', content: answer });

    console.log(`[Unified API] Response generated successfully`);

    // 成功レスポンス
    res.json({ answer });

  } catch (error) {
    console.error('[Unified API] Error:', error);
    res.status(500).json({ 
      error: '統合AI処理に失敗しました', 
      details: error.message 
    });
  }
};

/**
 * 最新画像を使用すべきかを判定
 */
function shouldUseLatestImage(text) {
  // 画像参照キーワードのチェック
  const imageReferenceKeywords = [
    'これ', 'それ', 'あれ', 'この', 'その', 'あの',
    '写真', '画像', '映って', '写って', '見える',
    '色', '形', '大きさ', '何が', '誰が', 'どこに'
  ];

  return imageReferenceKeywords.some(keyword => text.includes(keyword));
}

/**
 * 統合メッセージ配列を構築
 */
function buildIntelligentMessages({ text, image, history, descriptions }) {
  const messages = [];

  // 動的システムプロンプトの構築
let systemPrompt = `あなたは旅の友達として一緒に観光を楽しんでいます。友達のように親しみやすく、発見を共有するような話し方をしてください。

話し方のルール:
- 「見てください！○○がありますよ！」のような発見を共有するスタイル
- 友達同士の会話のように自然で親しみやすく
- 「すごいですね！」「素敵！」「面白い！」など感嘆を交える
- 「あ、これは○○ですね！」のような発見の驚きを表現
- 回答は1-3文程度で簡潔に
- まるで一緒にその場にいるような臨場感を大切に
- ユーザーから質問された場合は、詳しく解説を行う

画像への反応:
- 「おお！○○が見えますね！」
- 「素晴らしい景色！これは○○ですよ」
- 「わあ、きれいな○○！」
- 人物写真なら「素敵な写真ですね！」「いい感じに撮れてます！」
- 感嘆符はワンパターンにならないように

応答スタイル:
- 観光ガイドというより、一緒に旅を楽しむ友達として
- 発見の喜びや驚きを共有する
- 専門的すぎず、親しみやすく
- 詳しい応答を求められた場合、「調べてみます！」「調べた結果、～」などの言葉を付ける

`;
//   let systemPrompt = `あなたは親しみやすいAIアシスタントです。ユーザーと自然で簡潔な会話をしてください。

// 会話のルール:
// - フレンドリーで親しみやすい口調で話してください
// - 回答は簡潔に、1-3文程度にまとめてください
// - 詳しい説明は求められた時だけ提供してください
// - 「これ」「それ」などはユーザーが見ている/見せた画像の内容を指します
// - 画像がある場合は、まず何が写っているかを手短に説明してください
// - 人物が写っている場合は、人物について言及してください
// - 風景や建物が写っている場合は、要点だけを伝えてください
// - 会話の流れを自然に継続してください

// 応答スタイル:
// - 長い説明より、親しみやすい短いコメントを優先
// - 雑談のテンポを大切にしてください
// - 必要以上に詳しい情報は避けてください`;

  // 過去の画像説明がある場合は文脈として追加
  if (descriptions.length > 0) {
    const recentDescriptions = descriptions.slice(-3); // 最新3件
    systemPrompt += `\n\n【過去に見た画像の内容】\n${recentDescriptions.map((desc, index) => `${index + 1}. ${desc}`).join('\n')}`;
  }

  // 現在画像がある場合の説明
  if (image) {
    systemPrompt += `\n\n【現在の状況】\nユーザーが新しい画像を共有しました。この画像について質問や会話をしたがっています。`;
    
    // 人物認識を強化する追加指示
    systemPrompt += `\n\n【重要】画像を見る際の注意点：
- 最初に「人が写っているかどうか」を確認してください
- 人物（顔、体、手など）が写っている場合は、必ず最初にその点に触れてください
- 自撮りの場合は「自撮り写真ですね」「素敵な写真ですね」などで始めてください
- 人物がメインの場合は、背景よりも人物について話してください`;
  }

  messages.push({ role: 'system', content: systemPrompt });

  // 会話履歴を追加（最新8メッセージ = 4往復分）
  const recentHistory = history.slice(-8);
  messages.push(...recentHistory);

  // 現在のユーザー入力を構築
  const userMessage = { role: 'user', content: [] };
  
  // テキスト部分を追加
  userMessage.content.push({ type: 'text', text });
  
  // 画像がある場合は追加
  if (image) {
    userMessage.content.push({
      type: 'image_url',
      image_url: { url: image }
    });
  }

  messages.push(userMessage);

  return messages;
}
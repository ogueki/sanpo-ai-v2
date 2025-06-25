// api/unified.js - Claude型統合APIシステム
import OpenAI from 'openai';
import { getHistory, pushHistory, getLatestImage, getDescriptions, addImageAndDescription } from '../sessions/store.js';

// OpenAI クライアントを初期化
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { sessionId, text, image } = req.body;

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
      max_tokens: 800  // より詳細な回答のため増量
    });

    const answer = response.choices[0].message.content;

    // 新しい画像がある場合は保存
    if (image) {
      addImageAndDescription(sessionId, image, answer);
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
  let systemPrompt = `あなたは親しみやすい旅のガイドです。ユーザーと自然な会話をしてください。

会話のルール:
- フレンドリーで親しみやすい口調で話してください
- 「これ」「それ」などはユーザーが見ている/見せた画像の内容を指します
- 画像がある場合は、具体的で詳しい説明をしてください
- 会話の流れを自然に継続し、関連する情報を積極的に提供してください
- 旅行者の視点で、実用的で興味深い情報を心がけてください`;

  // 過去の画像説明がある場合は文脈として追加
  if (descriptions.length > 0) {
    const recentDescriptions = descriptions.slice(-3); // 最新3件
    systemPrompt += `\n\n【過去に見た画像の内容】\n${recentDescriptions.map((desc, index) => `${index + 1}. ${desc}`).join('\n')}`;
  }

  // 現在画像がある場合の説明
  if (image) {
    systemPrompt += `\n\n【現在の状況】\nユーザーが新しい画像を共有しました。この画像について質問や会話をしたがっています。`;
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
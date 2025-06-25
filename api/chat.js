import OpenAI from 'openai';
import { getHistory, pushHistory, getLatestImage, getDescriptions } from '../sessions/store.js'; 

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { sessionId, text } = req.body;
  if (!text) return res.status(400).json({ error: 'no text' });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 最新の画像を取得
  const latestImage = getLatestImage(sessionId);
  const descriptions = getDescriptions(sessionId);
  
  // システムプロンプトに画像の説明を含める
  let systemContent = 'あなたは旅ガイドでフレンドリーに会話します。';
  if (descriptions.length > 0) {
    systemContent += `\n\n過去に見た画像の説明:\n${descriptions.join('\n\n')}`;
  }

  const messages = [
    { role: 'system', content: systemContent },
    ...getHistory(sessionId)
  ];

  // ユーザーのメッセージを構築
  const userMessage = { role: 'user', content: [] };
  
  // テキストを追加
  userMessage.content.push({ type: 'text', text: text });
  
  // 「その写真」「この画像」などの参照があり、最新の画像がある場合は画像も含める
  if (latestImage && (text.includes('写真') || text.includes('画像') || text.includes('これ') || text.includes('それ'))) {
    userMessage.content.push({
      type: 'image_url',
      image_url: { url: latestImage.data }
    });
  }

  messages.push(userMessage);

  // モデルを選択（画像がある場合はGPT-4V、ない場合はGPT-4o-mini）
  const model = userMessage.content.length > 1 ? 'gpt-4-vision-preview' : 'gpt-4o-mini';

  const chat = await openai.chat.completions.create({
    model: model,
    messages: messages,
    temperature: 0.7,
    max_tokens: 500
  });

  const answer = chat.choices[0].message.content;

  // 履歴に保存（画像は含めない）
  pushHistory(sessionId, { role: 'user', content: text });
  pushHistory(sessionId, { role: 'assistant', content: answer });

  res.json({ answer });
};

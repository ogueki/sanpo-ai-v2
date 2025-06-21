import OpenAI from 'openai';
import { getHistory, pushHistory } from '../sessions/store.js'; 

export default async function handler(req, res) {
  /* 1) POST 以外は拒否 */
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    /* 2) リクエストからデータ取得 */
    const { sessionId, imageBase64, text } = req.body || {};

    if (!sessionId || !imageBase64) {
      return res.status(400).json({ error: 'sessionId と imageBase64 が必要です' });
    }

    /* 3) 過去履歴 + 今回の画像を GPT-4o-mini に投げる */
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const messages = [
      { role: 'system', content: 'あなたは旅先ガイドでフレンドリーに会話します。' },
      ...getHistory(sessionId),           // 直近 N ターン
      {
        role: 'user',
        content: [
          { type: 'text', text: text || 'この画像を説明して' },
          { type: 'image_url', image_url: { url: imageBase64, detail: 'low' } }
        ]
      }
    ];

    const chat = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7
    });

    const answer = chat.choices[0].message.content;

    /* 4) 履歴に追加（N ターンを超えたら store.js で自動間引き） */
    pushHistory(sessionId, { role: 'user',      content: text || '[画像]' });
    pushHistory(sessionId, { role: 'assistant', content: answer });

    /* 5) クライアントへ返す */
    return res.json({ answer });

  } catch (err) {
    console.error('Vision API error', err);
    return res.status(500).json({ error: 'OpenAI error' });
  }
}
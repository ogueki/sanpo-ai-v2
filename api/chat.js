import OpenAI from 'openai';
import { getHistory, pushHistory } from '../sessions/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { sessionId, text } = req.body;
  if (!text) return res.status(400).json({ error: 'no text' });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const messages = [
    { role:'system', content:'あなたは旅先ガイドでフレンドリーに会話します。' },
    ...getHistory(sessionId),
    { role:'user', content:text }
  ];

  const chat = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7
  });

  const answer = chat.choices[0].message.content;

  pushHistory(sessionId, { role:'user',      content:text   });
  pushHistory(sessionId, { role:'assistant', content:answer });

  res.json({ answer });
}
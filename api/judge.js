import OpenAI from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();             
  }

  const { text } = req.body || {};            // ← Node Runtime は req.body

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const chat = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          '次の発話が【カメラ画像を参照して答えるべき質問】なら "yes"、' +
          'そうでなければ "no" だけ返答してください。'
      },
      { role: 'user', content: text }
    ],
    max_tokens: 1,
    temperature: 0
  });

  res.end(chat.choices[0].message.content.trim());
}
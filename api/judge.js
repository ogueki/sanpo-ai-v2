import OpenAI from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();             
  }

  const { text } = req.body || {};

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const chat = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
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
      { role: 'user', content: text }
    ],
    max_tokens: 1,
    temperature: 0
  });

  res.end(chat.choices[0].message.content.trim());
}

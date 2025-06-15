import express from 'express';
import OpenAI from 'openai';
import bodyParser from 'body-parser';
import 'dotenv/config.js';
import cors from 'cors';


const app  = express();
const port = 3000;
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));  // 画像を受け取る

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/vision', async (req, res) => {
  try {
    const { imageBase64 } = req.body;        // 'data:image/jpeg;base64,...'

    const chat = await openai.chat.completions.create({
      model: 'gpt-4o-mini',                  // Vision 対応モデル
      messages: [{
        role: 'user',
        content: [
          { type: 'text',      text: 'この写真を簡単に説明して。' },
          { type: 'image_url', image_url: { url: imageBase64, detail: 'low' } }
        ]
      }]
    });

    res.json({ answer: chat.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'OpenAI error' });
  }
});

app.listen(port, () => console.log(`API on http://localhost:${port}`));
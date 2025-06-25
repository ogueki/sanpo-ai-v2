import express from 'express';
import OpenAI from 'openai';
import * as sessionsStore from '../sessions/store.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.post('/api/vision', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    try {
        const { image, sessionId, text } = req.body;

        if (!image || !sessionId) {
            return res.status(400).json({ error: '画像とセッションIDが必要です' });
        }

        // ユーザーの質問があればそれを使用、なければデフォルトの質問
        const userQuestion = text || "この画像に何が写っているか、簡潔に説明してください。";

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: userQuestion },
                        { type: "image_url", image_url: { url: image } }
                    ]
                }
            ],
            max_tokens: 300
        });

        const description = response.choices[0].message.content;
        
        // 画像と説明をセッションに保存
        sessionsStore.addImageAndDescription(sessionId, image, description);

        res.json({ description });
    } catch (error) {
        console.error('Vision API Error:', error);
        res.status(500).json({ error: '画像の解析に失敗しました' });
    }
});

app.options('/api/vision', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Vision API server running on port ${PORT}`);
});

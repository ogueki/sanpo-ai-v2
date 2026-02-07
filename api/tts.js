// api/tts.js - Gemini 2.5 TTS API エンドポイント
import { GoogleGenAI } from '@google/genai';

// Gemini クライアント（遅延初期化）
let ai = null;

function getAI() {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

export default async (req, res) => {
  console.log('🎤 [TTS] API呼び出し開始');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'textが必要です' });
    }

    console.log(`🎤 [TTS] テキスト: "${text.substring(0, 50)}..."`);

    // Gemini 2.5 Flash TTS で音声生成
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Kore' // 日本語対応ボイス
            }
          }
        }
      }
    });

    // レスポンスから音声データを取得
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioData) {
      console.error('❌ [TTS] 音声データが取得できませんでした');
      return res.status(500).json({ error: '音声生成に失敗しました' });
    }

    console.log(`✅ [TTS] 音声生成成功 (${audioData.length} bytes)`);

    // Base64エンコードされた音声データを返す
    res.json({
      success: true,
      audio: audioData,
      mimeType: 'audio/wav'
    });

  } catch (error) {
    console.error('❌ [TTS] エラー:', error);
    res.status(500).json({
      error: 'TTS処理に失敗しました',
      details: error.message
    });
  }
};

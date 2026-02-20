// api/tts.js - OpenAI TTS API エンドポイント
import OpenAI from 'openai';

// OpenAI クライアント（遅延初期化）
let openai = null;

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export default async (req, res) => {
  const startTime = Date.now();
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

    // OpenAI TTS で音声生成（opusで直接返す）
    const response = await getOpenAI().audio.speech.create({
      model: 'tts-1',
      voice: 'coral',
      input: text,
      response_format: 'opus',
      speed: 1.0
    });

    // ArrayBuffer として取得
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');

    const elapsed = Date.now() - startTime;
    console.log(`✅ [TTS] 音声生成成功 (${elapsed}ms, ${buffer.length} bytes)`);

    // Base64エンコードされたOpus音声データを返す
    res.json({
      success: true,
      audio: base64Audio,
      mimeType: 'audio/ogg'
    });

  } catch (error) {
    console.error('❌ [TTS] エラー:', error.message);
    console.error('❌ [TTS] スタック:', error.stack);
    res.status(500).json({
      error: 'TTS処理に失敗しました',
      details: error.message
    });
  }
};

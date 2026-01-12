// api/speech-to-text.js - Whisper API音声認識（Base64方式）
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🎤 [Speech-to-Text] Request received');

    const { audioBase64 } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: '音声データ(Base64)が必要です' });
    }

    // Base64からBufferに変換
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    console.log(`🎤 [Speech-to-Text] Processing audio: ${audioBuffer.length} bytes`);

    // iOSはm4a、Androidはwebm形式で録音される
    // Whisper APIは複数のフォーマットを受け付けるので、m4aで送信
    const audioFile = new File([audioBuffer], 'audio.m4a', {
      type: 'audio/mp4'
    });

    // OpenAI Whisper APIに送信
    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'ja',
      response_format: 'json',
      temperature: 0.0,
    });

    const transcription = response.text.trim();
    console.log(`🎤 [Speech-to-Text] Result: "${transcription}"`);

    res.json({
      success: true,
      text: transcription,
    });

  } catch (error) {
    console.error('❌ [Speech-to-Text] Error:', error);

    let errorMessage = '音声認識に失敗しました';
    if (error.message.includes('Invalid file format')) {
      errorMessage = '音声ファイルの形式が無効です';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message,
    });
  }
}
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

/**
 * PCMデータにWAVヘッダーを追加
 * Gemini TTSは24kHz, 16bit, モノラルのPCMを返す
 */
function addWavHeader(pcmBase64, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const pcmBuffer = Buffer.from(pcmBase64, 'base64');
  const dataSize = pcmBuffer.length;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  // WAVヘッダー (44 bytes)
  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);                          // ChunkID
  header.writeUInt32LE(36 + dataSize, 4);           // ChunkSize
  header.write('WAVE', 8);                          // Format

  // fmt sub-chunk
  header.write('fmt ', 12);                         // Subchunk1ID
  header.writeUInt32LE(16, 16);                     // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20);                      // AudioFormat (PCM = 1)
  header.writeUInt16LE(channels, 22);               // NumChannels
  header.writeUInt32LE(sampleRate, 24);             // SampleRate
  header.writeUInt32LE(byteRate, 28);               // ByteRate
  header.writeUInt16LE(blockAlign, 32);             // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34);          // BitsPerSample

  // data sub-chunk
  header.write('data', 36);                         // Subchunk2ID
  header.writeUInt32LE(dataSize, 40);               // Subchunk2Size

  // ヘッダーとPCMデータを結合
  const wavBuffer = Buffer.concat([header, pcmBuffer]);
  return wavBuffer.toString('base64');
}

export default async (req, res) => {
  console.log('🎤 [TTS] API呼び出し開始');
  console.log('🔑 [TTS] GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
  console.log('🔑 [TTS] GEMINI_API_KEY prefix:', process.env.GEMINI_API_KEY?.substring(0, 10) + '...');

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

    // PCMデータにWAVヘッダーを追加
    const wavBase64 = addWavHeader(audioData);

    console.log(`✅ [TTS] 音声生成成功 (WAV: ${wavBase64.length} bytes)`);

    // Base64エンコードされたWAV音声データを返す
    res.json({
      success: true,
      audio: wavBase64,
      mimeType: 'audio/wav'
    });

  } catch (error) {
    console.error('❌ [TTS] エラー:', error.message);
    console.error('❌ [TTS] スタック:', error.stack);
    console.error('❌ [TTS] 詳細:', JSON.stringify(error, null, 2));
    res.status(500).json({
      error: 'TTS処理に失敗しました',
      details: error.message
    });
  }
};

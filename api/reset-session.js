// api/reset-session.js - セッションリセットAPI
import { sessions } from '../sessions/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionIdが必要です' });
    }

    console.log(`🗑️ [Reset] セッションをリセット: ${sessionId}`);

    // セッションデータを完全削除
    if (sessions[sessionId]) {
      delete sessions[sessionId];
      console.log(`✅ [Reset] セッション ${sessionId} を削除しました`);
    } else {
      console.log(`⚠️ [Reset] セッション ${sessionId} は存在しませんでした`);
    }

    res.json({
      success: true,
      message: 'セッションをリセットしました'
    });

  } catch (error) {
    console.error('❌ [Reset] Error:', error);
    
    res.status(500).json({
      success: false,
      error: 'セッションリセットに失敗しました',
      details: error.message
    });
  }
}
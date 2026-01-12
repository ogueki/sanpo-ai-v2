import express from 'express';
import cors from 'cors';
import unifiedHandler from './api/unified.js';
import sttHandler from './api/speech-to-text.js';
import resetHandler from './api/reset-session.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // 画像や音声データ用に制限を緩和

// APIルート
app.post('/api/unified', unifiedHandler);
app.post('/api/speech-to-text', sttHandler);
app.post('/api/reset-session', resetHandler);

// ヘルスチェック
app.get('/', (req, res) => {
  res.send('Sanpo AI Server is running 🚀');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running at http://0.0.0.0:${PORT}`);
  console.log(`📱 Expoアプリからは http://<PCのIPアドレス>:3000 に接続してください`);
});

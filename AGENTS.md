# Repository Guidelines

## Project Structure & Module Organization
- Root UI: `index.html`（モバイル優先UI）, `camera.js`（カメラ/音声/チャット連携）。
- API (serverless 形式): `api/unified.js`（画像+テキスト統合応答）, `api/speech-to-text.js`（Whisper 文字起こし）, `api/reset-session.js`（セッション初期化）。
- Session store: `sessions/store.js`（メモリ保持: 履歴/画像/説明）。
- Node ESM: `package.json`（`type: module`）。依存は `express`, `cors`, `dotenv`, `openai`。

## Build, Test, and Development Commands
- 初期化: `npm install`
- 静的プレビュー: `npx http-server .` または `npx live-server`（`index.html` を開く）。
- API 実行（推奨: Vercel 互換）: `npx vercel dev`（Vercel CLI 必須）。`/api/*` がサーバーレスとして動作。
- 環境変数: `OPENAI_API_KEY` を設定（`.env` も可）。例: `OPENAI_API_KEY=sk-...`。

## Coding Style & Naming Conventions
- JavaScript (ESM): 2スペースインデント、セミコロンあり、シングルクォート推奨。
- 命名: 変数/関数は `camelCase`、定数は `UPPER_SNAKE_CASE`、API ファイルは `kebab-case.js`。
- 依存最小・素の DOM/API を優先。新規 API は `api/xxx.js` に追加。

## Testing Guidelines
- 現状、自動テストは未整備（`npm test` はプレースホルダ）。手動確認を徹底。
- 最低限の動作確認:
  - ブラウザでカメラ起動、撮影→`/api/unified` への送信応答を確認。
  - 音声入力→`/api/speech-to-text` が JSON `{ text }` を返すこと。
- 追加時は `__tests__/` を作成し、ユニット/統合層を分離する方針。

## Commit & Pull Request Guidelines
- コミット: 日本語の簡潔な命令形。範囲を先頭に付与を推奨。
  - 例: `UI: シャッターボタンの押下状態を改善`
- PR には以下を含める: 概要、変更点、動作確認手順、スクリーンショット/ログ、関連 Issue。
- 大きな変更は小さく分割し、API/クライアントを別 PR に。

## Security & Configuration Tips
- 秘密情報（`OPENAI_API_KEY`）は `.env`/環境変数で管理し、コミット禁止。
- ログに個人情報やキーを出力しない。CORS を必要最小限に。
- `sessions/store.js` はメモリ保持のため再起動で消える（永続化が必要なら外部ストアに差し替え）。

## エージェントへの追加指示
- **このプロジェクトに関する応答は原則として日本語で行ってください。**
- 英語の用語（API名やコマンドなど）はそのまま残して構いません。


// ── 超シンプルなメモリストア ──
//  later: Redis 等に差し替えても API はそのまま

const MAX_TURNS = 5;          // ← ここを変えれば保持長を調整
export const sessions = {};   // { id: { history: [], images: [], descriptions: [] } }

/* 取得 */
export const getHistory = (id) =>
  sessions[id]?.history ?? [];

/* 画像取得 */
export const getLatestImage = (id) => {
  const images = sessions[id]?.images ?? [];
  return images.length > 0 ? images[images.length - 1] : null;
};

/* 説明取得 */
export const getDescriptions = (id) =>
  sessions[id]?.descriptions ?? [];

/* 履歴追加＆古いメッセージ自動削除 */
export const pushHistory = (id, msg) => {
  const s = sessions[id] ||= { history: [], images: [], descriptions: [] };
  s.history.push(msg);
  // user + assistant で 1 ターンと数えて制限
  while (s.history.length > MAX_TURNS * 2) s.history.shift();
};

/* 画像と説明を追加 */
export const addImageAndDescription = (id, image, description) => {
  const s = sessions[id] ||= { history: [], images: [], descriptions: [] };
  s.images.push({
    data: image,
    timestamp: new Date().toISOString()
  });
  s.descriptions.push(description);
  
  // 古い画像を削除（メモリ節約のため最新5枚まで保持）
  while (s.images.length > 5) s.images.shift();
  while (s.descriptions.length > 5) s.descriptions.shift();
};

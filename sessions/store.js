// ── 超シンプルなメモリストア ──
//  later: Redis 等に差し替えても API はそのまま

const MAX_TURNS = 5;          // ← ここを変えれば保持長を調整
export const sessions = {};   // { id: { history: [] } }

/* 取得 */
export const getHistory = (id) =>
  sessions[id]?.history ?? [];

/* 追加＆古いメッセージ自動削除 */
export const pushHistory = (id, msg) => {
  const s = sessions[id] ||= { history: [] };
  s.history.push(msg);
  // user + assistant で 1 ターンと数えて制限
  while (s.history.length > MAX_TURNS * 2) s.history.shift();
};
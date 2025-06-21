/* メモリ簡易ストア。後で Redis に置き換えても呼び出しは同じ */
export const sessions = {};  // { id: { history: [] } }

export function getHistory(id)   { return sessions[id]?.history ?? []; }
export function pushHistory(id, msg) {
  (sessions[id] ||= { history: [] }).history.push(msg);
}
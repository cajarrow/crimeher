// Small settings store in D1 (table kv): feed-list version, archive progress, live_since, top story.
export async function getKV(env, k) {
  const r = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first();
  return r ? r.v : null;
}
export async function setKV(env, k, v) {
  await env.DB.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run();
}
export async function delKV(env, k) {
  await env.DB.prepare('DELETE FROM kv WHERE k = ?').bind(k).run();
}
export async function getJSON(env, k) {
  try { return JSON.parse(await getKV(env, k) || 'null'); } catch { return null; }
}

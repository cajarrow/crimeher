// The front page's Top story.
// 1. Pinned: Craig picks a headline on the desk and how long it stays (2, 6 or 12 hours).
// 2. Automatic, when nothing is pinned: the strongest story of the last 2 hours (the AI's interest
//    score, newest first on ties), held for at least an hour so the slot doesn't churn. A story
//    rated 2+ points higher takes over early. Near-copies of the outlet's headline (copied >= 0.6) never
//    get the slot. Chosen by the cron job, so page views only read it.
import { setKV, delKV, getJSON } from './kv.js';

export const PIN_HOURS = [2, 6, 12];
const MAX_PIN_HOURS = 24;
const HOLD_MIN = 60;
const WINDOW_HOURS = 2;
const BIGGER_BY = 2;

// { id, mode: 'pinned' | 'auto', until?, red? } for the story in the top slot now, or null.
// red: Craig marked the pin as dramatic news, so the site sets the headline in red.
export async function currentTop(env, now) {
  const r = (await env.DB.prepare("SELECT k, v FROM kv WHERE k IN ('top_pin', 'top_auto')").all()).results;
  const get = k => { try { return JSON.parse((r.find(x => x.k === k) || {}).v || 'null'); } catch { return null; } };
  const pin = get('top_pin');
  const auto = get('top_auto');
  const ids = [pin && pin.id, auto && auto.id].filter(Boolean);
  if (!ids.length) return null;
  const live = new Set((await env.DB.prepare(`SELECT id FROM items WHERE status = 'published' AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results.map(x => x.id));
  if (pin && Date.parse(pin.until) > now && live.has(pin.id)) return { id: pin.id, mode: 'pinned', until: pin.until, red: !!pin.red };
  if (auto && live.has(auto.id)) return { id: auto.id, mode: 'auto', since: auto.since };
  return null;
}

// Cron: keep the automatic pick current. Cheap: two small queries, a write only when it changes.
export async function chooseAutoTop(env, now) {
  const pin = await getJSON(env, 'top_pin');
  if (pin && Date.parse(pin.until) <= now) await delKV(env, 'top_pin');
  const cur = await getJSON(env, 'top_auto');
  const since = new Date(now - WINDOW_HOURS * 3600000).toISOString();
  const [curRow, best] = await env.DB.batch([
    env.DB.prepare(`SELECT id, status, COALESCE(json_extract(flags, '$.interest'), 0) AS interest FROM items WHERE id = ?`).bind(cur ? cur.id : -1),
    env.DB.prepare(`SELECT id, COALESCE(json_extract(flags, '$.interest'), 0) AS interest FROM items
      WHERE status = 'published' AND wp_id IS NULL AND category <> 'watch' AND published_at > ?
        AND COALESCE(json_extract(flags, '$.copied'), 0) < 0.6
      ORDER BY interest DESC, published_at DESC LIMIT 1`).bind(since)
  ]);
  const c = curRow.results[0];
  const b = best.results[0];
  const curOk = c && c.status === 'published';
  const held = curOk && now - Date.parse(cur.since) < HOLD_MIN * 60000;
  if (held && !(b && b.interest >= c.interest + BIGGER_BY)) return;
  let next = b;
  if (!next) next = await env.DB.prepare(`SELECT id FROM items WHERE status = 'published' AND category = 'breaking' ORDER BY published_at DESC LIMIT 1`).first();
  if (!next || (curOk && next.id === c.id)) return;
  await setKV(env, 'top_auto', JSON.stringify({ id: next.id, since: new Date(now).toISOString() }));
}

export async function pinTop(env, id, hours, now, red = false) {
  const prev = await getJSON(env, 'top_pin');
  const until = new Date(now + Math.min(hours, MAX_PIN_HOURS) * 3600000).toISOString();
  await setKV(env, 'top_pin', JSON.stringify({ id, until, red: !!red, at: new Date(now).toISOString() }));
  return prev;
}
// Turn the red headline on or off for the current pin.
export async function setRed(env, on, now) {
  const pin = await getJSON(env, 'top_pin');
  if (!pin || Date.parse(pin.until) <= now) return null;
  pin.red = !!on;
  await setKV(env, 'top_pin', JSON.stringify(pin));
  return pin;
}
export async function extendTop(env, hours, now) {
  const pin = await getJSON(env, 'top_pin');
  if (!pin || Date.parse(pin.until) <= now) return null;
  pin.until = new Date(Math.min(Date.parse(pin.until) + hours * 3600000, now + MAX_PIN_HOURS * 3600000)).toISOString();
  await setKV(env, 'top_pin', JSON.stringify(pin));
  return pin;
}
export async function unpinTop(env, onlyId) {
  const pin = await getJSON(env, 'top_pin');
  if (!pin || (onlyId && pin.id !== onlyId)) return pin;
  await delKV(env, 'top_pin');
  return pin;
}
export async function restorePin(env, prev) {
  if (prev && Number.isInteger(prev.id) && prev.until) await setKV(env, 'top_pin', JSON.stringify({ id: prev.id, until: String(prev.until), red: !!prev.red, at: prev.at || null }));
  else await delKV(env, 'top_pin');
}
// "4h 12m left"
export function timeLeft(until, now) {
  const m = Math.max(0, Math.round((Date.parse(until) - now) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''} left` : `${m}m left`;
}

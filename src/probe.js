// Developer probe: lets Claude test how outside sites answer requests made from Cloudflare's
// network (the container it works in can't reach most sites). It runs only when a request is
// written to the D1 kv table by hand (key 'probe_request', {"urls": [...]}), fetches up to 10
// URLs with the same user agent as the feed checker, and writes the answers to 'probe_result'.
import { setKV, delKV, getJSON } from './kv.js';

const UA = 'Mozilla/5.0 (compatible; CrimeHer/1.0; +https://crimeher.com)';

export async function runProbe(env) {
  const req = await getJSON(env, 'probe_request');
  if (!req || !Array.isArray(req.urls)) return;
  await delKV(env, 'probe_request');
  const out = await Promise.all(req.urls.slice(0, 10).map(async u => {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: req.accept || '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
      const t = await r.text();
      return { u, status: r.status, final: r.url, type: r.headers.get('content-type'), len: t.length, items: (t.match(/<(item|entry)[\s>]/g) || []).length, head: t.slice(0, Number(req.chars) || 800) };
    } catch (err) { return { u, err: String(err).slice(0, 160) }; }
  }));
  await setKV(env, 'probe_result', JSON.stringify({ at: new Date().toISOString(), out }));
}

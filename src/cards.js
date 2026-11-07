// Headline cards: the images social posts and link previews show for a story.
// Drawn from HTML by Cloudflare Browser Rendering (the BROWSER binding), then kept in D1 (table cards)
// so each card is drawn once. Formats: og = 1200x630 PNG for link previews (Facebook, Threads, iMessage),
// post = 1080x1350 JPEG for Instagram (Instagram only accepts JPEG).
import { KCOLORS } from './theme.js';

export const CARD_FORMATS = {
  og: { w: 1200, h: 630, type: 'png', mime: 'image/png' },
  post: { w: 1080, h: 1350, type: 'jpeg', mime: 'image/jpeg' }
};
const RENDER_DAYS = 7; // Cards are drawn only for stories published in the last week, to cap browser use.
const INK = '#141414', MUTED = '#5F6368', DOT = '#E0403A', LINE = '#E8E6E1';

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const outletName = u => String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

// A short, stable hash of the headline, so an edited headline gets a fresh card.
export function headlineHash(s) {
  let h = 2166136261;
  for (const ch of String(s || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
export const cardKey = (item, f) => `${item.id}-${f}-${headlineHash(item.headline)}`;

export function cardHtml(item, catName, f) {
  const { w, h } = CARD_FORMATS[f];
  const [base, tint, ink] = KCOLORS[item.category] || [INK, '#F1F0ED', INK];
  const len = String(item.headline || '').length;
  const size = f === 'og' ? (len > 80 ? 60 : len > 60 ? 66 : 74) : (len > 80 ? 80 : 92);
  const pad = f === 'og' ? 64 : 88;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Newsreader:opsz,wght@6..72,700;6..72,800&display=block">
<style>*{box-sizing:border-box;margin:0}html,body{width:${w}px;height:${h}px;overflow:hidden;background:#fff}
body{font-family:Inter,sans-serif;color:${INK};-webkit-font-smoothing:antialiased}
.p{position:absolute;inset:0;padding:${pad}px;display:flex;flex-direction:column;justify-content:space-between;border-top:${f === 'og' ? 14 : 18}px solid ${base}}
.top{display:flex;align-items:center;justify-content:space-between}
.pill{background:${tint};color:${ink};font-weight:700;font-size:${f === 'og' ? 24 : 30}px;padding:${f === 'og' ? '9px 20px' : '12px 26px'};border-radius:40px}
.wm{font-family:Newsreader,serif;font-weight:800;letter-spacing:-.02em;font-size:${f === 'og' ? 38 : 44}px;line-height:1}.wm i{font-style:normal;color:${DOT}}
h1{font-family:Newsreader,serif;font-weight:700;font-size:${size}px;line-height:1.08;letter-spacing:-.015em;display:-webkit-box;-webkit-line-clamp:${f === 'og' ? 4 : 7};-webkit-box-orient:vertical;overflow:hidden}
.bot{display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid ${LINE};padding-top:${f === 'og' ? 22 : 30}px;font-size:${f === 'og' ? 24 : 30}px}
.via{color:${MUTED}}.url{font-weight:700}</style></head><body>
<div class="p"><div class="top"><span class="pill">${esc(catName)}</span><div class="wm">crimeher<i>.</i></div></div>
<h1>${esc(item.headline)}</h1>
<div class="bot"><div class="via">via ${esc(outletName(item.outlet || item.url))}</div><div class="url">crimeher.com</div></div></div>
</body></html>`;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromBase64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

// Draw (or fetch the stored) card for a published story. Returns { mime, bytes } or null.
export async function cardImage(env, item, catName, f, now = Date.now()) {
  const fmt = CARD_FORMATS[f];
  if (!fmt || !item || item.status !== 'published' || !item.headline) return null;
  const key = cardKey(item, f);
  const hit = await env.DB.prepare('SELECT mime, data FROM cards WHERE k = ?').bind(key).first();
  if (hit) return { mime: hit.mime, bytes: fromBase64(hit.data) };
  if (!env.BROWSER) return null;
  if (now - Date.parse(item.published_at) > RENDER_DAYS * 86400000) return null;
  const { default: puppeteer } = await import('@cloudflare/puppeteer');
  const browser = await puppeteer.launch(env.BROWSER);
  let shot;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: fmt.w, height: fmt.h, deviceScaleFactor: 1 });
    await page.setContent(cardHtml(item, catName, f), { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Wait for the web fonts, but never more than 6 seconds (the card still draws with fallback fonts).
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 6000))]));
    shot = await page.screenshot(fmt.type === 'jpeg' ? { type: 'jpeg', quality: 90 } : { type: 'png' });
  } finally {
    await browser.close();
  }
  await env.DB.prepare('INSERT OR REPLACE INTO cards (k, item_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(key, item.id, fmt.mime, toBase64(shot), new Date(now).toISOString()).run();
  return { mime: fmt.mime, bytes: new Uint8Array(shot) };
}

// Cron housekeeping: drop cards older than two weeks.
export async function pruneCards(env, now = Date.now()) {
  await env.DB.prepare('DELETE FROM cards WHERE created_at < ?').bind(new Date(now - 14 * 86400000).toISOString()).run();
}

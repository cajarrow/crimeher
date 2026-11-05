// The review desk: Craig approves, edits or rejects held headlines, and can pull a live one.
// Phone first (iPhone Duo). Locked behind Cloudflare Access: the Worker checks the Access
// JWT itself, against Craig's team domain, and only lets in emails on DESK_EMAILS.

const CERTS = { team: '', at: 0, keys: [] };

function b64urlBytes(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
function b64urlJson(s) { return JSON.parse(new TextDecoder().decode(b64urlBytes(s))); }

function tokenFrom(req) {
  const h = req.headers.get('cf-access-jwt-assertion');
  if (h) return h;
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : null;
}

// Returns the signed-in reviewer's email, or null.
export async function deskUser(req, env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || '').trim().replace(/\/+$/, '');
  const token = tokenFrom(req);
  if (!team || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); } catch { return null; }
  if (payload.iss !== team) return null;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  if (env.ACCESS_AUD) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
  }
  if (CERTS.team !== team || Date.now() - CERTS.at > 3600000) {
    const r = await fetch(`${team}/cdn-cgi/access/certs`);
    if (!r.ok) return null;
    CERTS.keys = (await r.json()).keys || [];
    CERTS.team = team;
    CERTS.at = Date.now();
  }
  const jwk = CERTS.keys.find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) return null;
  const email = String(payload.email || '').toLowerCase();
  const allowed = String(env.DESK_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(email) ? email : null;
}

// Records which Access team signed requests come from (not a secret), so setup can be confirmed.
export async function noteAccessTeam(req, env, setKV) {
  const t = req.headers.get('cf-access-jwt-assertion');
  if (!t) return;
  try {
    const iss = b64urlJson(t.split('.')[1]).iss;
    if (/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(iss)) await setKV(env, 'access_team_seen', iss);
  } catch { /* ignore */ }
}

const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function ago(iso, now) {
  const m = Math.floor((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm';
  if (m < 1440) return Math.floor(m / 60) + 'h';
  return Math.floor(m / 1440) + 'd';
}

const DESK_CSS = `:root{--ink:#141414;--muted:#5F6368;--line:#E8E6E1;--soft:#F4F3F0;--red:#B3261E;--green:#1E6B3A}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--soft);color:var(--ink);font:16px/1.4 Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:env(safe-area-inset-bottom)}
a{color:inherit}
.top{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:calc(10px + env(safe-area-inset-top)) 16px 0}
.row1{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.mark{font-family:Newsreader,Georgia,serif;font-weight:800;font-size:24px;letter-spacing:-.3px;text-decoration:none}
.mark small{font-family:Inter,system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);margin-left:6px}
.stats{font-size:12px;color:var(--muted);text-align:right}
.tabs{display:flex;gap:4px;margin-top:8px}
.tab{display:flex;align-items:center;gap:6px;height:44px;padding:0 14px;font-size:15px;font-weight:700;color:var(--muted);text-decoration:none;border-bottom:3px solid transparent}
.tab.on{color:var(--ink);border-bottom-color:var(--ink)}
.tab .n{min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--red);color:#fff;font-size:12px;display:inline-flex;align-items:center;justify-content:center}
main{max-width:1200px;margin:0 auto;padding:12px 12px 32px;display:grid;gap:12px;grid-template-columns:1fr}
@media (min-width:760px){main{grid-template-columns:repeat(auto-fill,minmax(340px,1fr));padding:16px}}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 14px 12px;transition:opacity .25s,transform .25s}
.card.gone{opacity:0;transform:translateX(24px)}
.meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--muted)}
select{font:inherit;font-size:13px;font-weight:700;height:32px;padding:0 28px 0 10px;border:0;border-radius:16px;background:var(--soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23141414' fill='none' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 10px center;-webkit-appearance:none;appearance:none;color:var(--ink)}
textarea{display:block;width:100%;margin:10px 0 4px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;font:inherit;font-size:17px;font-weight:600;line-height:1.32;resize:none;field-sizing:content;min-height:3.2em;background:#fff;color:var(--ink)}
textarea:focus,select:focus{outline:2px solid var(--ink);outline-offset:1px}
.count{font-size:11px;color:var(--muted);text-align:right}.count.over{color:var(--red);font-weight:700}
.why{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 8px}
.why span{font-size:12px;font-weight:700;color:var(--red);background:#FBEBEB;border-radius:10px;padding:3px 8px}
.src{font-size:13px;color:var(--muted);line-height:1.4}
.src b{color:var(--ink);font-weight:600}
.src p{margin:4px 0 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.src a{display:inline-flex;align-items:center;min-height:36px;font-weight:700;color:var(--ink)}
.acts{display:grid;grid-template-columns:1fr 1.4fr;gap:8px;margin-top:6px}
.acts.three{grid-template-columns:1fr 1fr}
button{font:inherit;font-size:16px;font-weight:700;height:48px;border-radius:12px;cursor:pointer}
.no{background:#fff;color:var(--ink);border:1.5px solid var(--line)}
.yes{background:var(--ink);color:#fff;border:0}
button:disabled{opacity:.5}
.empty{grid-column:1/-1;text-align:center;padding:64px 20px;color:var(--muted)}
.empty b{display:block;font-family:Newsreader,Georgia,serif;font-size:26px;color:var(--ink);margin:12px 0 4px}
.lock{max-width:520px;margin:40px auto;padding:24px;background:#fff;border:1px solid var(--line);border-radius:16px;line-height:1.5}
.toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(120px);background:var(--ink);color:#fff;border-radius:14px;padding:12px 14px 12px 16px;display:flex;gap:14px;align-items:center;font-weight:600;transition:transform .25s;z-index:10;max-width:calc(100% - 32px)}
.toast.on{transform:translateX(-50%) translateY(0)}
.toast button{height:36px;padding:0 12px;background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.4);font-size:14px}
@media (prefers-reduced-motion:reduce){.card,.toast{transition:none}}
.stats-main{max-width:720px;margin:0 auto;padding:12px 12px 40px}
.chips{display:flex;gap:6px;overflow-x:auto;margin:4px 0 10px;scrollbar-width:none}
.chip{flex:none;display:inline-flex;align-items:center;height:36px;padding:0 14px;border-radius:18px;background:#fff;border:1px solid var(--line);font-size:14px;font-weight:700;text-decoration:none;color:var(--ink)}
.chip.on{background:var(--ink);border-color:var(--ink);color:#fff}
.note{margin:0 0 10px;padding:10px 12px;border-radius:12px;background:#FFF8E6;font-size:13px;line-height:1.45;color:#5C4813}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.tile{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.tv{font-size:28px;font-weight:800;letter-spacing:-.5px;line-height:1.1;font-variant-numeric:tabular-nums}
.tl{margin-top:2px;font-size:12px;font-weight:600;color:var(--muted)}
.panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:12px}
.panel h2{margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted)}
.rank{margin:0;padding:0;list-style:none;counter-reset:r}
.rank li{counter-increment:r;position:relative;padding:10px 0 10px 30px;border-top:1px solid var(--soft)}
.rank li:first-child{border-top:0}
.rank li::before{content:counter(r);position:absolute;left:0;top:10px;width:22px;font-size:14px;font-weight:800;color:var(--muted);text-align:right}
.rank .h{display:block;font-size:15px;font-weight:600;line-height:1.32}
.rank .m{display:block;margin-top:3px;font-size:12px;color:var(--muted)}
.rank .m b{color:var(--ink)}
.bars{margin:0;padding:0;list-style:none}
.bars li{display:grid;grid-template-columns:7.5em 1fr 3em;align-items:center;gap:10px;min-height:32px}
.bl{font-size:13px;font-weight:600}
.bt{height:10px;border-radius:0 4px 4px 0;background:var(--soft);overflow:hidden}
.bf{display:block;height:100%;background:var(--ink);border-radius:0 4px 4px 0}
.bv{font-size:13px;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}
.plain{margin:0;padding:0;list-style:none}
.plain li{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--soft);font-size:14px}
.plain li:first-child{border-top:0}
.plain b{font-variant-numeric:tabular-nums}
.none{margin:4px 0;color:var(--muted);font-size:14px}
@media (min-width:760px){.tiles{grid-template-columns:repeat(4,1fr)}}`;

function page(title, body, script) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex, nofollow"><title>${e(title)}</title><meta name="theme-color" content="#ffffff"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="CH Desk"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Newsreader:opsz,wght@6..72,800&display=swap"><style>${DESK_CSS}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;
}
function respond(html, status = 200) {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
}

export function lockedPage(env) {
  const why = env.ACCESS_TEAM_DOMAIN ? 'Sign in through Cloudflare Access with an approved email to use the desk.' : 'The desk opens once Cloudflare Access is turned on for this site.';
  return respond(page('Desk locked', `<div class="lock"><div class="mark">crimeher<small>Desk</small></div><p>${why}</p></div>`), 403);
}

const REASON_LABEL = {
  'low confidence': 'Unsure of headline', 'fit unclear': 'Fit unclear', 'category unclear': 'Category unclear',
  'possible duplicate': 'Possible repeat', 'legal status unclear': 'Charged? Unclear', 'minor accused': 'Minor accused',
  'child sexual abuse': 'Child abuse', 'political figure or justice policy': 'Political', 'headline may name a minor': 'May name a minor',
  'identity detail (first two weeks)': 'Identity detail', 'only source is a last-resort outlet': 'Last-resort outlet'
};

export async function renderDesk(env, url, user, CATS) {
  const now = Date.now();
  const v = url.searchParams.get('view');
  const view = v === 'live' ? 'live' : v === 'stats' ? 'stats' : 'held';
  const dayAgo = new Date(now - 86400000).toISOString();
  if (view === 'stats') {
    const c = (await env.DB.prepare(`SELECT SUM(status = 'held') AS held, SUM(status = 'published' AND published_at > ?) AS live24, SUM(status = 'rejected' AND decided_at > ? AND COALESCE(ai_reason, '') NOT LIKE 'desk:%') AS rej24 FROM items WHERE wp_id IS NULL`).bind(dayAgo, dayAgo).first()) || {};
    const main = await renderStats(env, url, CATS, now);
    return respond(page('CrimeHer Desk: Stats', deskHeader('stats', c) + `<main class="stats-main">${main}</main>`));
  }
  const [rows, counts] = await env.DB.batch([
    view === 'held'
      ? env.DB.prepare(`SELECT id, url, headline, category, outlet, title_raw, summary_raw, hold_reason, source_published_at, decided_at FROM items WHERE status = 'held' ORDER BY decided_at DESC LIMIT 150`)
      : env.DB.prepare(`SELECT id, url, headline, category, outlet, title_raw, summary_raw, NULL AS hold_reason, source_published_at, published_at AS decided_at FROM items WHERE status = 'published' AND wp_id IS NULL ORDER BY published_at DESC LIMIT 80`),
    env.DB.prepare(`SELECT SUM(status = 'held') AS held, SUM(status = 'published' AND published_at > ?) AS live24, SUM(status = 'rejected' AND decided_at > ? AND COALESCE(ai_reason, '') NOT LIKE 'desk:%') AS rej24 FROM items WHERE wp_id IS NULL`).bind(dayAgo, dayAgo)
  ]);
  const c = counts.results[0] || {};
  const opts = sel => CATS.map(k => `<option value="${k.key}"${k.key === sel ? ' selected' : ''}>${e(k.short)}</option>`).join('');
  const cards = rows.results.map(r => {
    const why = (r.hold_reason || '').split(';').map(s => s.trim()).filter(Boolean).map(s => `<span>${e(REASON_LABEL[s] || s)}</span>`).join('');
    const len = (r.headline || '').length;
    const acts = view === 'held'
      ? `<div class="acts"><button type="button" class="no" data-act="reject">Reject</button><button type="button" class="yes" data-act="publish">Publish</button></div>`
      : `<div class="acts three"><button type="button" class="no" data-act="pull">Pull</button><button type="button" class="yes" data-act="save">Save</button></div>`;
    return `<article class="card" data-id="${r.id}"><div class="meta"><select aria-label="Category">${opts(r.category)}</select><span>${e(r.outlet || '')}</span><span aria-hidden="true">&middot;</span><span>${ago(r.source_published_at, now)}</span></div>
<textarea rows="2" aria-label="Headline">${e(r.headline || r.title_raw)}</textarea><div class="count${len > 90 ? ' over' : ''}">${len}/90</div>
${why ? `<div class="why">${why}</div>` : ''}<div class="src"><b>${e(r.title_raw)}</b>${r.summary_raw ? `<p>${e(r.summary_raw)}</p>` : ''}<a href="${e(r.url)}" target="_blank" rel="noopener">Open article &#8599;</a></div>${acts}</article>`;
  }).join('');
  const empty = view === 'held'
    ? `<div class="empty"><svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#E5F4E4"/><path d="M15 25l6 6 12-14" stroke="#1E6B3A" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><b>All clear</b>Nothing is waiting for you.</div>`
    : `<div class="empty"><b>Nothing live yet</b>New headlines show up here as they publish.</div>`;
  const body = deskHeader(view, c) + `
<main id="list">${cards || empty}</main><div class="toast" id="toast" role="status"><span id="tmsg"></span><button type="button" id="undo">Undo</button></div>`;
  return respond(page('CrimeHer Desk', body, DESK_JS(view)));
}

function deskHeader(view, c) {
  const tab = (key, href, label) => `<a class="tab${view === key ? ' on' : ''}" href="${href}"${view === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="top"><div class="row1"><a class="mark" href="/desk">crimeher<small>Desk</small></a><div class="stats">${c.live24 || 0} live today &middot; ${c.rej24 || 0} rejected by AI</div></div>
<nav class="tabs">${tab('held', '/desk', `Waiting <span class="n" id="n">${c.held || 0}</span>`)}${tab('live', '/desk?view=live', 'Live')}${tab('stats', '/desk?view=stats', 'Stats')}</nav></header>`;
}

const PERIODS = { '24h': { label: 'Last 24 hours', ms: 86400000 }, '7d': { label: '7 days', ms: 7 * 86400000 }, '30d': { label: '30 days', ms: 30 * 86400000 } };
const n0 = x => Number(x || 0).toLocaleString('en-US');

async function renderStats(env, url, CATS, now) {
  const key = PERIODS[url.searchParams.get('p')] ? url.searchParams.get('p') : '24h';
  const since = new Date(now - PERIODS[key].ms).toISOString();
  const [tot, top, byCat, outlets, pipe] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS clicks, SUM(preview) AS preview FROM clicks WHERE at > ?`).bind(since),
    env.DB.prepare(`SELECT i.id, i.headline, i.category, COALESCE(i.outlet, 'archive') AS outlet, COUNT(*) AS n FROM clicks c JOIN items i ON i.id = c.item_id WHERE c.at > ? GROUP BY i.id ORDER BY n DESC, MAX(c.at) DESC LIMIT 10`).bind(since),
    env.DB.prepare(`SELECT i.category AS cat, COUNT(*) AS n FROM clicks c JOIN items i ON i.id = c.item_id WHERE c.at > ? GROUP BY i.category`).bind(since),
    env.DB.prepare(`SELECT COALESCE(i.outlet, 'archive') AS outlet, COUNT(*) AS n FROM clicks c JOIN items i ON i.id = c.item_id WHERE c.at > ? GROUP BY 1 ORDER BY n DESC LIMIT 8`).bind(since),
    env.DB.prepare(`SELECT
        SUM(status = 'published' AND published_at > ? AND COALESCE(ai_reason, '') NOT LIKE 'desk:%') AS ai_pub,
        SUM(status = 'published' AND published_at > ? AND ai_reason LIKE 'desk:%') AS desk_pub,
        SUM(status = 'rejected' AND decided_at > ? AND ai_reason LIKE 'desk:%' AND ai_reason NOT LIKE '%pulled') AS desk_rej,
        SUM(status = 'rejected' AND ai_reason LIKE 'desk:%pulled') AS pulled,
        SUM(status = 'held') AS waiting,
        SUM(status = 'expired' AND decided_at > ?) AS expired,
        SUM(status = 'rejected' AND decided_at > ? AND COALESCE(ai_reason, '') NOT LIKE 'desk:%') AS ai_rej
      FROM items WHERE wp_id IS NULL`).bind(since, since, since, since, since)
  ]);
  const t = tot.results[0] || {};
  const p = pipe.results[0] || {};
  const live = (p.ai_pub || 0) + (p.desk_pub || 0);
  const per = live ? (t.clicks / live) : 0;
  const chips = Object.entries(PERIODS).map(([k, v]) => `<a class="chip${k === key ? ' on' : ''}" href="/desk?view=stats&amp;p=${k}"${k === key ? ' aria-current="page"' : ''}>${v.label}</a>`).join('');
  const note = t.clicks && t.preview === t.clicks
    ? `<p class="note">All ${n0(t.clicks)} clicks so far came from the private preview, so they're you testing. Real reader counts start at launch.</p>`
    : t.preview ? `<p class="note">${n0(t.preview)} of these clicks came from the private preview.</p>` : '';
  const tiles = [
    ['Clicks', n0(t.clicks)],
    ['Headlines live', n0(live)],
    ['Clicks per headline', per ? per.toFixed(1) : '0'],
    ['Waiting for you', n0(p.waiting)]
  ].map(([l, v]) => `<div class="tile"><div class="tv">${v}</div><div class="tl">${l}</div></div>`).join('');
  const short = Object.fromEntries(CATS.map(c => [c.key, c.short]));
  const topHtml = top.results.length
    ? `<ol class="rank">${top.results.map(r => `<li><span class="h">${e(r.headline)}</span><span class="m"><b>${n0(r.n)}</b> ${r.n === 1 ? 'click' : 'clicks'} &middot; ${e(short[r.category] || r.category)} &middot; ${e(r.outlet)}</span></li>`).join('')}</ol>`
    : `<p class="none">No clicks in this period yet.</p>`;
  const catMap = Object.fromEntries(byCat.results.map(r => [r.cat, r.n]));
  const cats = CATS.map(c => ({ label: c.short, n: catMap[c.key] || 0 })).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...cats.map(c => c.n));
  const bars = `<ul class="bars" aria-label="Clicks by category">${cats.map(c => `<li title="${e(c.label)}: ${n0(c.n)} clicks"><span class="bl">${e(c.label)}</span><span class="bt"><span class="bf" style="width:${c.n ? Math.max(2, Math.round(c.n / max * 100)) : 0}%"></span></span><span class="bv">${n0(c.n)}</span></li>`).join('')}</ul>`;
  const outl = outlets.results.length
    ? `<ul class="plain">${outlets.results.map(r => `<li><span>${e(r.outlet)}</span><b>${n0(r.n)}</b></li>`).join('')}</ul>`
    : `<p class="none">No clicks in this period yet.</p>`;
  const flow = `<ul class="plain">
<li><span>Published by Claude</span><b>${n0(p.ai_pub)}</b></li>
<li><span>Rejected by Claude</span><b>${n0(p.ai_rej)}</b></li>
<li><span>Published by you</span><b>${n0(p.desk_pub)}</b></li>
<li><span>Rejected by you</span><b>${n0(p.desk_rej)}</b></li>
<li><span>Pulled by you</span><b>${n0(p.pulled)}</b></li>
<li><span>Expired unreviewed</span><b>${n0(p.expired)}</b></li></ul>`;
  return `<nav class="chips" aria-label="Period">${chips}</nav>${note}<section class="tiles">${tiles}</section>
<section class="panel"><h2>Most clicked</h2>${topHtml}</section>
<section class="panel"><h2>Clicks by category</h2>${bars}</section>
<section class="panel"><h2>Top outlets clicked</h2>${outl}</section>
<section class="panel"><h2>Headlines, ${e(PERIODS[key].label.toLowerCase())}</h2>${flow}</section>`;
}

const DESK_JS = view => `(()=>{const L=document.getElementById('list'),N=document.getElementById('n'),T=document.getElementById('toast'),M=document.getElementById('tmsg'),U=document.getElementById('undo');let timer,last;
const label={publish:'Published',reject:'Rejected',save:'Saved',pull:'Pulled from the site',restore:'Restored'};
async function post(b){const r=await fetch('/desk/act',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});if(!r.ok)throw new Error(await r.text());return r.json()}
function toast(msg,undo){M.textContent=msg;U.style.display=undo?'':'none';T.classList.add('on');clearTimeout(timer);timer=setTimeout(()=>T.classList.remove('on'),undo?6000:2500)}
L.addEventListener('input',ev=>{if(ev.target.tagName!=='TEXTAREA')return;const n=ev.target.value.length,c=ev.target.nextElementSibling;c.textContent=n+'/90';c.classList.toggle('over',n>90)});
L.addEventListener('click',async ev=>{const b=ev.target.closest('button[data-act]');if(!b)return;const card=b.closest('.card'),act=b.dataset.act;
const body={id:+card.dataset.id,action:act,headline:card.querySelector('textarea').value.trim(),category:card.querySelector('select').value};
card.querySelectorAll('button').forEach(x=>x.disabled=true);
try{await post(body);if(act==='save'){toast(label.save);card.querySelectorAll('button').forEach(x=>x.disabled=false);return}
last={card,id:body.id,from:'${view}'};card.classList.add('gone');setTimeout(()=>{card.hidden=true},260);
if(N&&'${view}'==='held')N.textContent=Math.max(0,(+N.textContent||0)-1);toast(label[act],true)}
catch(err){card.querySelectorAll('button').forEach(x=>x.disabled=false);toast('Didn\\'t save. Try again.')}});
U.addEventListener('click',async()=>{if(!last)return;try{await post({id:last.id,action:'restore',to:last.from});last.card.hidden=false;requestAnimationFrame(()=>last.card.classList.remove('gone'));last.card.querySelectorAll('button').forEach(x=>x.disabled=false);if(N&&last.from==='held')N.textContent=(+N.textContent||0)+1;T.classList.remove('on');last=null}catch(e){toast('Couldn\\'t undo.')}});})();`;

// POST /desk/act {id, action, headline?, category?, to?}
export async function deskAction(req, env, user, CATS) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return new Response('Bad origin', { status: 403 });
  let b;
  try { b = await req.json(); } catch { return new Response('Bad request', { status: 400 }); }
  const id = Number(b.id);
  const cat = CATS.some(c => c.key === b.category) ? b.category : null;
  const headline = String(b.headline || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const now = new Date().toISOString();
  const who = 'desk: ' + user;
  let stmt;
  if (b.action === 'publish') {
    if (!headline) return new Response('Headline required', { status: 400 });
    stmt = env.DB.prepare(`UPDATE items SET status = 'published', headline = ?, category = COALESCE(?, category), published_at = ?, ai_reason = ? WHERE id = ? AND status = 'held'`).bind(headline, cat, now, who + ' published', id);
  } else if (b.action === 'reject') {
    stmt = env.DB.prepare(`UPDATE items SET status = 'rejected', ai_reason = ? WHERE id = ? AND status = 'held'`).bind(who + ' rejected', id);
  } else if (b.action === 'save') {
    if (!headline) return new Response('Headline required', { status: 400 });
    stmt = env.DB.prepare(`UPDATE items SET headline = ?, category = COALESCE(?, category), ai_reason = ? WHERE id = ? AND status = 'published' AND wp_id IS NULL`).bind(headline, cat, who + ' edited', id);
  } else if (b.action === 'pull') {
    stmt = env.DB.prepare(`UPDATE items SET status = 'rejected', ai_reason = ? WHERE id = ? AND status = 'published' AND wp_id IS NULL`).bind(who + ' pulled', id);
  } else if (b.action === 'restore') {
    stmt = b.to === 'live'
      ? env.DB.prepare(`UPDATE items SET status = 'published', ai_reason = ? WHERE id = ? AND status = 'rejected' AND wp_id IS NULL`).bind(who + ' restored', id)
      : env.DB.prepare(`UPDATE items SET status = 'held', ai_reason = ? WHERE id = ? AND status IN ('published', 'rejected') AND wp_id IS NULL`).bind(who + ' undid', id);
  } else return new Response('Unknown action', { status: 400 });
  const r = await stmt.run();
  if (!r.meta.changes) return new Response('Already changed', { status: 409 });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

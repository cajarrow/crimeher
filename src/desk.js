// The review desk: Craig approves, edits or rejects held headlines, and can pull a live one.
// Phone first (iPhone Duo). Locked behind Cloudflare Access: the Worker checks the Access
// JWT itself, against Craig's team domain, and only lets in emails on DESK_EMAILS.

import { KCSS } from './theme.js';
import { addByUrl } from './ai.js';
import { FAVICON_SVG } from './icons.js';
import { PIN_HOURS, currentTop, chooseAutoTop, pinTop, extendTop, unpinTop, restorePin, setRed, timeLeft } from './top.js';

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

const DESK_CSS = `:root{--ink:#141414;--muted:#5F6368;--line:#E8E6E1;--soft:#F4F3F0;--fill:#F7F6F3;--red:#B3261E;--redt:#FBEBEB}
*{box-sizing:border-box}[hidden]{display:none!important}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--soft);color:var(--ink);font:16px/1.4 Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:env(safe-area-inset-bottom)}
a{color:inherit}
.top{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.97);border-bottom:1px solid var(--line);padding-top:env(safe-area-inset-top)}
.bar{max-width:1200px;margin:0 auto;padding:0 16px;display:flex;flex-wrap:wrap;align-items:center;column-gap:20px}
.mark{flex:1;display:flex;align-items:center;height:54px;font-family:Newsreader,Georgia,serif;font-weight:800;font-size:24px;letter-spacing:-.3px;text-decoration:none}
.mark small{font-family:Inter,system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);margin-left:7px;padding-top:4px}
.site{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:19px;border:1px solid var(--line);background:#fff;font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap}
.site:hover{border-color:var(--ink)}
.tabs{order:3;flex-basis:100%;display:flex;gap:2px;margin-left:-12px}
.tab{display:flex;align-items:center;gap:7px;height:46px;padding:0 12px;font-size:15px;font-weight:700;color:var(--muted);text-decoration:none;border-bottom:3px solid transparent}
.tab:hover{color:var(--ink)}
.tab.on{color:var(--ink);border-bottom-color:var(--ink)}
.tab .n{min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--red);color:#fff;font-size:12px;display:inline-flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
.tab .n.zero{background:var(--line);color:var(--muted)}
@media (min-width:760px){.mark{flex:0 0 auto}.tabs{order:0;flex-basis:auto;margin:0}.tab{height:58px}.site{margin-left:auto}}
main{max-width:1200px;margin:0 auto;padding:12px 12px 40px}
#list{display:grid;gap:12px;grid-template-columns:1fr;align-items:start}
@media (min-width:760px){main{padding:20px 16px 48px}#list{grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;transition:opacity .25s,transform .25s;scroll-margin-top:124px}
.card.gone{opacity:0;transform:translateX(24px)}
.why{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--red)}
.why span{background:var(--redt);border-radius:8px;padding:4px 9px}
.why .mine{background:#E6EEF9;color:#1B4FA0}
.card.new{animation:glow 1.8s ease-out}
@keyframes glow{from{box-shadow:0 0 0 3px #F2C94C}to{box-shadow:0 0 0 3px transparent}}
.add{position:relative;display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;padding:10px;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}
.add input{flex:1;min-width:0;height:48px;padding:0 14px;border:1.5px solid transparent;border-radius:12px;background:var(--fill);font:inherit;font-size:16px;color:var(--ink)}
.add input:focus{outline:none;border-color:var(--ink);background:#fff}
.add .btn{flex:0 0 auto;height:48px;padding:0 24px}
.add-msg{flex-basis:100%;margin:0 4px 2px;font-size:13px;font-weight:600;color:var(--muted)}
.add-msg.err{color:var(--red)}
.add.busy::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,transparent,var(--ink),transparent) no-repeat;background-size:40% 100%;animation:slide 1.1s linear infinite}
@keyframes slide{from{background-position:-60% 0}to{background-position:160% 0}}
@media (min-width:760px){.add{max-width:760px}}
.meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.meta b{color:var(--ink)}
.cat{font:inherit;font-size:13px;font-weight:700;height:32px;padding:0 28px 0 12px;border:0;border-radius:16px;background:var(--kt,var(--soft)) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23141414' stroke-opacity='.55' fill='none' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 11px center;color:var(--ki,var(--ink));-webkit-appearance:none;appearance:none;cursor:pointer}
.hl{display:block;width:100%;margin:0;padding:10px 12px;border:1.5px solid transparent;border-radius:12px;background:var(--fill);font:inherit;font-size:18px;font-weight:700;line-height:1.3;letter-spacing:-.1px;resize:none;field-sizing:content;min-height:3.4em;color:var(--ink)}
.hl:hover{border-color:var(--line)}
.hl:focus{outline:none;border-color:var(--ink);background:#fff}
.cat:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.over{margin-top:-6px;font-size:12px;font-weight:700;color:var(--red)}
.alts{margin-top:-4px}
.lbl{display:block;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
.lbl i{font-style:normal;font-weight:600;letter-spacing:0;text-transform:none}
details.alts summary{display:flex;align-items:center;min-height:36px;cursor:pointer;list-style:none}
details.alts summary::-webkit-details-marker{display:none}
details.alts summary .lbl{margin:0}
details.alts summary::after{content:'';width:7px;height:7px;margin-left:8px;border:solid var(--muted);border-width:0 1.5px 1.5px 0;transform:rotate(45deg) translateY(-2px);transition:transform .2s}
details.alts[open] summary::after{transform:rotate(-135deg) translateY(-1px)}
.alt{display:block;width:100%;min-height:44px;margin:0;padding:9px 12px;text-align:left;font:inherit;font-size:15px;font-weight:600;line-height:1.3;color:#3C4043;background:transparent;border:0;border-left:3px solid var(--line);border-radius:0 10px 10px 0;cursor:pointer}
.alt:hover{background:var(--fill);border-left-color:var(--ink);color:var(--ink)}
.alt.swapped{animation:pop .35s}
@keyframes pop{from{background:#FFF4D6}to{background:transparent}}
.src{padding-top:10px;border-top:1px solid var(--soft);font-size:13px;line-height:1.4;color:#3C4043}
.src a{display:inline-flex;align-items:center;min-height:32px;font-weight:700;color:var(--ink);white-space:nowrap}
.acts{display:grid;grid-template-columns:1fr 1.6fr;gap:8px}
button{font:inherit;cursor:pointer}
.btn{height:50px;border-radius:12px;font-size:16px;font-weight:700}
.no{background:#fff;color:var(--ink);border:1.5px solid var(--line)}
.no:hover{border-color:var(--ink)}
.yes{background:var(--ink);color:#fff;border:0}
.is-live .acts{display:flex;gap:8px}
.is-live .no{padding:0 18px}
.is-live .tops{margin-right:auto}
.is-live .pull{color:var(--red)}
.is-live .yes{display:none;flex:1;max-width:220px}
.is-live.dirty .yes{display:block}
.is-top .tops{display:none}
.is-top .pull{margin-left:auto}
.card.is-top{border-color:var(--ink);border-width:1.5px}
.topbar{display:flex;align-items:center;gap:6px;margin:-14px -14px 0;padding:8px 8px 8px 14px;border-radius:14px 14px 0 0;background:var(--fill);font-size:13px;font-weight:700;color:var(--muted)}
.topbar.on{background:var(--ink);color:#fff}
.tb-l{flex:1}
.tb{height:34px;padding:0 12px;border-radius:9px;border:1.5px solid var(--line);background:#fff;color:var(--ink);font-size:13px;font-weight:700}
.topbar.on .tb{background:transparent;color:#fff;border-color:rgba(255,255,255,.4)}
.topbar.on.red{background:var(--red)}
.topbar.on .tb-red[aria-pressed=true]{background:#fff;color:var(--red);border-color:#fff}
.card.is-red{border-color:var(--red)}
.is-red .hl{color:var(--red)}
.redsw{flex-basis:100%;display:flex;align-items:center;gap:10px;min-height:44px;margin:2px 0 4px;font-size:14px;font-weight:700;color:var(--ink);cursor:pointer}
.redsw input{appearance:none;-webkit-appearance:none;position:relative;flex:none;width:44px;height:26px;margin:0;border-radius:13px;background:#D9D6D0;transition:background .2s;cursor:pointer}
.redsw input::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .2s}
.redsw input:checked{background:var(--red)}
.redsw input:checked::after{transform:translateX(18px)}
.redsw small{font-weight:600;color:var(--muted)}
.more{display:flex;justify-content:center;margin-top:-4px}
.ghost{min-height:40px;padding:0 10px;background:none;border:0;font-size:14px;font-weight:700;color:var(--muted);text-decoration:underline;text-underline-offset:3px}
.ghost:hover{color:var(--ink)}
.pinrow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:10px;border-radius:12px;background:var(--fill)}
.pinrow span{flex-basis:100%;font-size:13px;font-weight:700;color:var(--muted)}
.pinrow button{height:42px;min-width:58px;padding:0 14px;border-radius:10px;border:1.5px solid var(--line);background:#fff;font-size:15px;font-weight:700;color:var(--ink)}
.pinrow .def{background:var(--ink);border-color:var(--ink);color:#fff}
.pinrow .x{margin-left:auto;min-width:0;border:0;background:none;color:var(--muted)}
button:disabled{opacity:.5;cursor:default}
.empty{grid-column:1/-1;text-align:center;padding:64px 20px;color:var(--muted)}
.empty b{display:block;font-family:Newsreader,Georgia,serif;font-size:26px;color:var(--ink);margin:12px 0 4px}
.lock{max-width:520px;margin:40px auto;padding:24px;background:#fff;border:1px solid var(--line);border-radius:16px;line-height:1.5}
.toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(120px);background:var(--ink);color:#fff;border-radius:14px;padding:10px 10px 10px 16px;display:flex;gap:14px;align-items:center;font-weight:600;transition:transform .25s;z-index:10;max-width:calc(100% - 32px)}
.toast.on{transform:translateX(-50%) translateY(0)}
.toast button{height:38px;padding:0 14px;border-radius:10px;background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.4);font-size:14px;font-weight:700}
@media (prefers-reduced-motion:reduce){.card,.toast{transition:none}.alt.swapped,.card.new,.add.busy::after{animation:none}}
.chips{display:flex;gap:6px;overflow-x:auto;margin:0 0 12px;scrollbar-width:none}
.chip{flex:none;display:inline-flex;align-items:center;height:38px;padding:0 16px;border-radius:19px;background:#fff;border:1px solid var(--line);font-size:14px;font-weight:700;text-decoration:none;color:var(--ink)}
.chip.on{background:var(--ink);border-color:var(--ink);color:#fff}
.note{margin:0 0 12px;padding:10px 14px;border-radius:12px;background:#FFF8E6;font-size:13px;line-height:1.45;color:#5C4813}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.tile{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.tv{font-size:30px;font-weight:800;letter-spacing:-.6px;line-height:1.1;font-variant-numeric:tabular-nums}
.tl{margin-top:3px;font-size:13px;font-weight:600;color:var(--muted)}
.cols{display:grid;gap:12px;align-items:start}
.stack{display:grid;gap:12px}
@media (min-width:760px){.tiles{grid-template-columns:repeat(4,1fr);gap:12px}}
@media (min-width:1024px){.cols{grid-template-columns:3fr 2fr}}
.panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px}
.panel h2{margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted)}
.rank{margin:0;padding:0;list-style:none;counter-reset:r}
.rank li{counter-increment:r;position:relative;padding:11px 0 11px 32px;border-top:1px solid var(--soft)}
.rank li:first-child{border-top:0;padding-top:4px}
.rank li::before{content:counter(r);position:absolute;left:0;top:11px;width:22px;font-size:15px;font-weight:800;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.rank li:first-child::before{top:4px}
.rank .h{display:block;font-size:16px;font-weight:700;line-height:1.3}
.rank .m{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;font-size:12px;color:var(--muted)}
.rank .m b{color:var(--ink)}
.rank .m i{width:8px;height:8px;border-radius:50%;background:var(--k,var(--muted))}
.bars{margin:0;padding:0;list-style:none}
.bars li{display:grid;grid-template-columns:8.5em 1fr 2.5em;align-items:center;gap:10px;min-height:34px}
.bl{font-size:13px;font-weight:600}
.bt{height:10px;border-radius:0 5px 5px 0;background:var(--soft);overflow:hidden}
.bf{display:block;height:100%;background:var(--k,var(--ink));border-radius:0 5px 5px 0}
.bv{font-size:13px;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}
.plain{margin:0;padding:0;list-style:none}
.plain li{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--soft);font-size:14px}
.plain li:first-child{border-top:0;padding-top:2px}
.plain b{font-variant-numeric:tabular-nums}
.none{margin:4px 0;color:var(--muted);font-size:14px}`;

function page(title, body, script) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex, nofollow"><title>${e(title)}</title><meta name="theme-color" content="#ffffff"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="CH Desk"><link rel="icon" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}"><link rel="apple-touch-icon" href="/desk-icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Newsreader:opsz,wght@6..72,800&display=swap"><style>${DESK_CSS}${KCSS}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;
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
  'identity detail (first two weeks)': 'Identity detail', 'only source is a last-resort outlet': 'Last-resort outlet',
  'page unreadable': 'Couldn\'t open article: check facts'
};
const MINE = 'added by you';
const LIMIT = 90;
const ADD_FORM = `<form class="add" id="add" autocomplete="off" novalidate><input id="addurl" type="url" name="url" placeholder="Paste a link to add a story" aria-label="Story link" inputmode="url" enterkeyhint="go"><button type="submit" class="btn yes">Add</button><p class="add-msg" id="addmsg" role="status" hidden></p></form>`;

export async function renderDesk(env, url, user, CATS) {
  const now = Date.now();
  const v = url.searchParams.get('view');
  const view = v === 'live' ? 'live' : v === 'stats' ? 'stats' : 'held';
  const heldQ = env.DB.prepare(`SELECT COUNT(*) AS held FROM items WHERE status = 'held'`);
  if (view === 'stats') {
    const [held, main] = await Promise.all([heldQ.first(), renderStats(env, url, CATS, now)]);
    return respond(page('CrimeHer Desk: Stats', deskHeader('stats', held) + `<main class="stats-main">${main}</main>`));
  }
  const [rows, counts] = await env.DB.batch([
    view === 'held'
      ? env.DB.prepare(`SELECT ${HELD_COLS} FROM items WHERE status = 'held' ORDER BY decided_at DESC LIMIT 150`)
      : env.DB.prepare(`SELECT ${LIVE_COLS} FROM items WHERE status = 'published' AND wp_id IS NULL ORDER BY published_at DESC LIMIT 80`),
    heldQ
  ]);
  // Live: the story in the site's top slot comes first, marked, pinned or automatic.
  const top = view === 'live' ? await currentTop(env, now) : null;
  let list = rows.results;
  if (top) {
    const t = list.find(r => r.id === top.id) || await env.DB.prepare(`SELECT ${LIVE_COLS} FROM items WHERE id = ?`).bind(top.id).first();
    if (t) list = [t, ...list.filter(r => r.id !== top.id)];
  }
  const cards = list.map(r => cardHtml(r, view, CATS, now, top)).join('');
  const empty = view === 'held'
    ? `<div class="empty"><svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#E5F4E4"/><path d="M15 25l6 6 12-14" stroke="#1E6B3A" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><b>All clear</b>Nothing is waiting for you.</div>`
    : `<div class="empty"><b>Nothing live yet</b>New headlines show up here as they publish.</div>`;
  const body = deskHeader(view, counts.results[0]) + `
<main>${view === 'held' ? ADD_FORM : ''}<div id="list">${cards || empty}</div></main><div class="toast" id="toast" role="status"><span id="tmsg"></span><button type="button" id="undo">Undo</button></div>`;
  return respond(page('CrimeHer Desk', body, DESK_JS(view)));
}

const HELD_COLS = 'id, url, headline, category, outlet, title_raw, hold_reason, flags, source_published_at, 0 AS clicks';
const LIVE_COLS = `id, url, headline, category, outlet, title_raw, NULL AS hold_reason, flags, source_published_at,
  (SELECT COUNT(*) FROM clicks c WHERE c.item_id = items.id) AS clicks`;
function topbarHtml(top, now) {
  return top.mode === 'pinned'
    ? `<div class="topbar on${top.red ? ' red' : ''}"><span class="tb-l">&#9733; Top story &middot; ${timeLeft(top.until, now)}</span><button type="button" class="tb tb-red" data-act="red" aria-pressed="${top.red ? 'true' : 'false'}" title="Red headline on the site">Red</button><button type="button" class="tb" data-act="extend">+2h</button><button type="button" class="tb" data-act="unpin">Unpin</button></div>`
    : `<div class="topbar"><span class="tb-l">Top story now &middot; automatic</span><button type="button" class="tb" data-act="pinmenu">Pin it</button></div>`;
}
function cardHtml(r, view, CATS, now, top) {
  const isTop = !!(top && top.id === r.id);
  const opts = CATS.map(k => `<option value="${k.key}"${k.key === r.category ? ' selected' : ''}>${e(k.short)}</option>`).join('');
  const reasons = (r.hold_reason || '').split(';').map(s => s.trim()).filter(Boolean);
  const warn = reasons.filter(s => s !== MINE).map(s => `<span>${e(REASON_LABEL[s] || s)}</span>`).join('');
  const why = reasons.includes(MINE) ? `<div class="why"><span class="mine">Added by you</span>${warn}</div>` : warn ? `<div class="why">Held:${warn}</div>` : '';
  const head = r.headline || r.title_raw;
  let alts = [];
  try { alts = (JSON.parse(r.flags || '{}').options || []).filter(o => o && o !== head).slice(0, 2); } catch { /* no options */ }
  const altBtns = alts.map(a => `<button type="button" class="alt" data-alt="${e(a)}">${e(a)}</button>`).join('');
  // Waiting: versions shown open, they're part of the decision. Live: tucked away until needed.
  const altHtml = !alts.length ? '' : view === 'held'
    ? `<div class="alts"><span class="lbl">Other versions <i>&middot; tap to swap</i></span>${altBtns}</div>`
    : `<details class="alts"><summary><span class="lbl">Other versions (${alts.length})</span></summary>${altBtns}</details>`;
  const facts = [e(r.outlet || ''), ago(r.source_published_at, now)];
  if (view === 'live') facts.push(`<b>${n0(r.clicks)}</b>&nbsp;${r.clicks === 1 ? 'click' : 'clicks'}`);
  const acts = view === 'held'
    ? `<div class="acts"><button type="button" class="btn no" data-act="reject">Reject</button><button type="button" class="btn yes" data-act="publish">Publish</button></div><div class="more"><button type="button" class="ghost" data-act="pinmenu">Publish as top story</button></div>`
    : `<div class="acts"><button type="button" class="btn no tops" data-act="pinmenu">&#9733; Top story</button><button type="button" class="btn no pull" data-act="pull">Pull</button><button type="button" class="btn yes" data-act="save">Save</button></div>`;
  return `<article class="card${view === 'live' ? ' is-live' : ''}${isTop ? ' is-top' : ''}${isTop && top.red ? ' is-red' : ''}" data-id="${r.id}">${isTop ? topbarHtml(top, now) : ''}${why}
<div class="meta"><select class="cat k-${e(r.category)}" aria-label="Category">${opts}</select><span>${facts.filter(Boolean).join(' &middot; ')}</span></div>
<textarea class="hl" rows="2" aria-label="Headline">${e(head)}</textarea><div class="over"${head.length > LIMIT ? '' : ' hidden'}>${head.length}/${LIMIT} &middot; too long</div>${altHtml}
<div class="src"><span class="lbl">Original</span>${e(r.title_raw)} <a href="${e(r.url)}" target="_blank" rel="noopener">Read&nbsp;article&nbsp;&#8599;</a></div>${acts}</article>`;
}

function deskHeader(view, c) {
  const held = (c && c.held) || 0;
  const tab = (key, href, label) => `<a class="tab${view === key ? ' on' : ''}" href="${href}"${view === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="top"><div class="bar"><a class="mark" href="/desk">crimeher<small>Desk</small></a>
<nav class="tabs" aria-label="Desk">${tab('held', '/desk', `Waiting <span class="n${held ? '' : ' zero'}" id="n">${held}</span>`)}${tab('live', '/desk?view=live', 'Live')}${tab('stats', '/desk?view=stats', 'Stats')}</nav>
<a class="site" href="/" target="_blank" rel="noopener">View site <span aria-hidden="true">&#8599;</span></a></div></header>`;
}

const PERIODS = { '24h': { label: 'Last 24 hours', ms: 86400000 }, '7d': { label: '7 days', ms: 7 * 86400000 }, '30d': { label: '30 days', ms: 30 * 86400000 } };
const n0 = x => Number(x || 0).toLocaleString('en-US');

async function renderStats(env, url, CATS, now) {
  const key = PERIODS[url.searchParams.get('p')] ? url.searchParams.get('p') : '24h';
  const since = new Date(now - PERIODS[key].ms).toISOString();
  const [tot, top, byCat, outlets, pipe, subs] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS clicks, SUM(preview) AS preview FROM clicks WHERE at > ?`).bind(since),
    env.DB.prepare(`SELECT i.id, COALESCE(i.headline, i.title_raw) AS headline, i.category, COALESCE(i.outlet, 'archive') AS outlet, COUNT(*) AS n FROM clicks c JOIN items i ON i.id = c.item_id WHERE c.at > ? GROUP BY i.id ORDER BY n DESC, MAX(c.at) DESC LIMIT 10`).bind(since),
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
      FROM items WHERE wp_id IS NULL`).bind(since, since, since, since, since),
    env.DB.prepare(`SELECT COUNT(*) AS total, SUM(created_at > ?) AS fresh FROM signups`).bind(since)
  ]);
  const sg = subs.results[0] || {};
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
    ['Email signups', n0(sg.total), sg.fresh ? `+${n0(sg.fresh)} in this period` : '']
  ].map(([l, v, sub]) => `<div class="tile"><div class="tv">${v}</div><div class="tl">${l}${sub ? ` &middot; ${sub}` : ''}</div></div>`).join('');
  const short = Object.fromEntries(CATS.map(c => [c.key, c.short]));
  const topHtml = top.results.length
    ? `<ol class="rank">${top.results.map(r => `<li class="k-${e(r.category)}"><span class="h">${e(r.headline)}</span><span class="m"><i aria-hidden="true"></i><b>${n0(r.n)}</b> ${r.n === 1 ? 'click' : 'clicks'} &middot; ${e(short[r.category] || r.category)} &middot; ${e(r.outlet)}</span></li>`).join('')}</ol>`
    : `<p class="none">No clicks in this period yet.</p>`;
  const catMap = Object.fromEntries(byCat.results.map(r => [r.cat, r.n]));
  const cats = CATS.map(c => ({ key: c.key, label: c.short, n: catMap[c.key] || 0 })).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...cats.map(c => c.n));
  const bars = `<ul class="bars" aria-label="Clicks by category">${cats.map(c => `<li class="k-${c.key}" title="${e(c.label)}: ${n0(c.n)} clicks"><span class="bl">${e(c.label)}</span><span class="bt"><span class="bf" style="width:${c.n ? Math.max(2, Math.round(c.n / max * 100)) : 0}%"></span></span><span class="bv">${n0(c.n)}</span></li>`).join('')}</ul>`;
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
<div class="cols"><section class="panel"><h2>Most clicked</h2>${topHtml}</section>
<div class="stack"><section class="panel"><h2>Clicks by category</h2>${bars}</section>
<section class="panel"><h2>Headlines, ${e(PERIODS[key].label.toLowerCase())}</h2>${flow}</section>
<section class="panel"><h2>Top outlets clicked</h2>${outl}</section></div></div>`;
}

// Client script, kept as plain text (String.raw: no template escapes). __VIEW__ and __MAX__ are filled per page.
const CLIENT_JS = String.raw`(()=>{const L=document.getElementById('list'),N=document.getElementById('n'),T=document.getElementById('toast'),M=document.getElementById('tmsg'),U=document.getElementById('undo'),V='__VIEW__',MAX=__MAX__;let timer,undoFn=null;
const label={publish:'Published',reject:'Rejected',save:'Saved',pull:'Pulled from the site'};
async function post(b){const r=await fetch('/desk/act',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});if(!r.ok)throw new Error(await r.text());return r.json()}
function toast(msg,fn){M.textContent=msg;undoFn=fn||null;U.style.display=fn?'':'none';T.classList.add('on');clearTimeout(timer);timer=setTimeout(()=>{T.classList.remove('on');undoFn=null},fn?6000:2500)}
function count(d){if(!N)return;const n=Math.max(0,(+N.textContent||0)+d);N.textContent=n;N.classList.toggle('zero',!n)}
function measure(ta){const card=ta.closest('.card'),o=card.querySelector('.over'),n=ta.value.trim().length;o.hidden=n<=MAX;o.textContent=n+'/'+MAX+' · too long'}
function hrs(h){return h+' hours'}
function placeTop(top){L.querySelectorAll('.topbar').forEach(x=>x.remove());L.querySelectorAll('.card.is-top').forEach(c=>c.classList.remove('is-top','is-red'));if(!top)return;const c=L.querySelector('.card[data-id="'+top.id+'"]');if(!c){location.reload();return}const t=document.createElement('div');t.innerHTML=top.html;c.prepend(t.firstElementChild);c.classList.add('is-top');c.classList.toggle('is-red',!!top.red);L.prepend(c);c.scrollIntoView({behavior:'smooth',block:'nearest'})}
function menu(card,btn){const open=card.querySelector('.pinrow');L.querySelectorAll('.pinrow').forEach(r=>r.remove());if(open)return;const r=document.createElement('div');r.className='pinrow';r.innerHTML='<span>'+(V==='held'?'Publish as top story for':'Keep it on top for')+'</span><label class="redsw"><input type="checkbox" class="redin"> Red headline <small>for dramatic news</small></label><button type="button" data-pin="2">2h</button><button type="button" data-pin="6" class="def">6h</button><button type="button" data-pin="12">12h</button><button type="button" data-pin="0" class="x">Cancel</button>';btn.closest('.acts,.topbar,.more').after(r)}
function removeCard(card,msg){card.classList.add('gone');setTimeout(()=>{card.hidden=true},260);if(V==='held')count(-1);
toast(msg,async()=>{await post({id:+card.dataset.id,action:'restore',to:V});card.hidden=false;requestAnimationFrame(()=>card.classList.remove('gone'));card.querySelectorAll('button').forEach(b=>b.disabled=false);if(V==='held')count(1)})}
function fields(card){return{headline:card.querySelector('.hl').value.trim(),category:card.querySelector('.cat').value}}
L.addEventListener('input',ev=>{const t=ev.target;if(!t.classList.contains('hl'))return;measure(t);t.closest('.card').classList.add('dirty')});
L.addEventListener('change',ev=>{const t=ev.target;if(!t.classList.contains('cat'))return;t.className='cat k-'+t.value;t.closest('.card').classList.add('dirty')});
L.addEventListener('click',async ev=>{const alt=ev.target.closest('.alt');if(alt){const card=alt.closest('.card'),ta=card.querySelector('.hl'),cur=ta.value;ta.value=alt.dataset.alt;alt.dataset.alt=cur;alt.textContent=cur;alt.classList.remove('swapped');void alt.offsetWidth;alt.classList.add('swapped');measure(ta);card.classList.add('dirty');return}
const pb=ev.target.closest('button[data-pin]');
if(pb){const card=pb.closest('.card'),row=pb.closest('.pinrow'),h=+pb.dataset.pin;if(!h){row.remove();return}const red=!!row.querySelector('.redin:checked'),what=(red?'red top story':'top story')+' for '+hrs(h);const btns=card.querySelectorAll('button');btns.forEach(x=>x.disabled=true);
try{if(V==='held'){await post(Object.assign({id:+card.dataset.id,action:'publish',pin:h,red},fields(card)));row.remove();removeCard(card,'Published as '+what)}
else{const j=await post({id:+card.dataset.id,action:'pin',hours:h,red});row.remove();btns.forEach(x=>x.disabled=false);placeTop(j.top);toast('Now the '+what,async()=>{const k=await post({action:'pin_restore',prev:j.prev});placeTop(k.top)})}}
catch(err){btns.forEach(x=>x.disabled=false);toast('Didn\'t save. Try again.')}return}
const b=ev.target.closest('button[data-act]');if(!b)return;const card=b.closest('.card'),act=b.dataset.act;
if(act==='pinmenu'){menu(card,b);return}
const btns=card.querySelectorAll('button');btns.forEach(x=>x.disabled=true);
try{if(act==='red'){const on=b.getAttribute('aria-pressed')!=='true',j=await post({action:'red',on});btns.forEach(x=>x.disabled=false);placeTop(j.top);toast(on?'Headline is red on the site':'Headline is back to black');return}
if(act==='extend'||act==='unpin'){const j=await post({action:act});btns.forEach(x=>x.disabled=false);placeTop(j.top);toast(act==='extend'?'Extended 2 hours':'Top story is back to automatic');return}
await post(Object.assign({id:+card.dataset.id,action:act},fields(card)));
if(act==='save'){toast(label.save);card.classList.remove('dirty');btns.forEach(x=>x.disabled=false);return}
removeCard(card,label[act])}
catch(err){btns.forEach(x=>x.disabled=false);toast('Didn\'t save. Try again.')}});
U.addEventListener('click',async()=>{const fn=undoFn;if(!fn)return;undoFn=null;T.classList.remove('on');try{await fn()}catch(e){toast('Couldn\'t undo.')}});
const F=document.getElementById('add');
if(F){const I=document.getElementById('addurl'),AM=document.getElementById('addmsg'),AB=F.querySelector('button');let busy=false;
function say(m,err){AM.textContent=m;AM.hidden=!m;AM.classList.toggle('err',!!err)}
function flash(c){c.classList.remove('new');void c.offsetWidth;c.classList.add('new')}
async function add(){const u=I.value.trim();if(busy)return;if(!u){I.focus();return}if(!/^https?:\/\/[^\s.]+\.\S+$/i.test(u)){say('Paste a full link, starting with https://',true);return}
busy=true;F.classList.add('busy');AB.disabled=true;I.readOnly=true;AB.textContent='Writing…';say('Reading the article and writing headlines…');
try{const r=await fetch('/desk/add',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:u})});const j=await r.json().catch(()=>({error:'Something went wrong. Try again.'}));
if(j.html){const t=document.createElement('div');t.innerHTML=j.html;const c=t.firstElementChild,em=L.querySelector('.empty');if(em)em.remove();L.prepend(c);flash(c);count(1);I.value='';say('');c.scrollIntoView({behavior:'smooth',block:'nearest'});toast('Added. Check it, then publish.')}
else{say(j.error||'Something went wrong. Try again.',true);const c=j.id&&L.querySelector('.card[data-id="'+j.id+'"]');if(c){flash(c);c.scrollIntoView({behavior:'smooth',block:'center'})}}}
catch(e){say('Couldn\'t reach the desk. Check your connection and try again.',true)}
finally{busy=false;F.classList.remove('busy');AB.disabled=false;I.readOnly=false;AB.textContent='Add'}}
F.addEventListener('submit',ev=>{ev.preventDefault();add()});
I.addEventListener('paste',()=>setTimeout(()=>{if(/^https?:\/\/\S+$/i.test(I.value.trim()))add()},0));
I.addEventListener('input',()=>{if(AM.classList.contains('err'))say('')});
const q=new URLSearchParams(location.search).get('add');if(q){I.value=q;history.replaceState(null,'','/desk');add()}}
})();`;
const DESK_JS = view => CLIENT_JS.replace('__VIEW__', view).replace('__MAX__', String(LIMIT));

// POST /desk/add {url}: the AI reads the page and writes the headlines; the card comes back ready to show.
export async function deskAdd(req, env, user, CATS, kv) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return new Response('Bad origin', { status: 403 });
  const out = o => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  let b;
  try { b = await req.json(); } catch { return out({ error: 'Paste a link first.' }); }
  let r;
  try { r = await addByUrl(env, b.url, Date.now(), kv); } catch (err) { console.error('desk add', String(err)); return out({ error: 'Something went wrong. Try again.' }); }
  if (r.error) return out(r);
  const row = await env.DB.prepare(`SELECT ${HELD_COLS} FROM items WHERE id = ?`).bind(r.id).first();
  return out({ id: r.id, html: cardHtml(row, 'held', CATS, Date.now()) });
}

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
  const ms = Date.now();
  const out = o => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  // Top story controls.
  if (['pin', 'red', 'extend', 'unpin', 'pin_restore'].includes(b.action)) {
    let prev = null;
    if (b.action === 'pin') {
      const hours = Number(b.hours);
      if (!PIN_HOURS.includes(hours)) return new Response('Pick 2, 6 or 12 hours', { status: 400 });
      if (!await env.DB.prepare(`SELECT 1 FROM items WHERE id = ? AND status = 'published'`).bind(id).first()) return new Response('Not live', { status: 409 });
      prev = await pinTop(env, id, hours, ms, !!b.red);
    } else if (b.action === 'red') {
      if (!await setRed(env, !!b.on, ms)) return new Response('Nothing is pinned', { status: 409 });
    } else if (b.action === 'extend') {
      if (!await extendTop(env, 2, ms)) return new Response('Nothing is pinned', { status: 409 });
    } else if (b.action === 'unpin') {
      await unpinTop(env);
      await chooseAutoTop(env, ms);
    } else {
      const p = b.prev && typeof b.prev === 'object' && Number.isInteger(Number(b.prev.id)) && Number.isFinite(Date.parse(b.prev.until)) ? { id: Number(b.prev.id), until: b.prev.until, red: !!b.prev.red, at: b.prev.at } : null;
      await restorePin(env, p);
    }
    const top = await currentTop(env, ms);
    return out({ ok: true, prev, top: top ? { id: top.id, red: !!top.red, html: topbarHtml(top, ms) } : null });
  }
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
  if (b.action === 'publish' && PIN_HOURS.includes(Number(b.pin))) await pinTop(env, id, Number(b.pin), ms, !!b.red);
  if (b.action === 'pull' || (b.action === 'restore' && b.to !== 'live')) await unpinTop(env, id);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

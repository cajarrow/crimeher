import { syncSources } from './sources.js';
import { checkFeeds } from './feeds.js';
import { decideNew, estimateCost, MODEL } from './ai.js';
import { deskUser, noteAccessTeam, lockedPage, renderDesk, deskAction, deskAdd } from './desk.js';
import { KCSS } from './theme.js';
import { FAVICON_SVG, PNG, MANIFEST } from './icons.js';
import { getKV, setKV } from './kv.js';
import { currentTop, chooseAutoTop } from './top.js';
import { runProbe } from './probe.js';

const FEEDS_PER_RUN = 30;   // feeds checked per run; each feed is due every ~15 minutes
const AI_PER_RUN = 40;      // new items the AI decides per run

const CATS = [
  { key: 'breaking', short: 'Breaking', full: 'Breaking Crime News', slug: 'breaking-crime-news', wp: [3], desc: 'The latest arrests, shootings and major crime stories, updated through the day.' },
  { key: 'missing', short: 'Missing', full: 'Missing Persons', slug: 'missing-persons', wp: [4], desc: 'Missing persons cases, active searches and people found safe.' },
  { key: 'alerts', short: 'Alerts', full: 'Crime Alerts', slug: 'crime-alerts', wp: [5], desc: 'Public-safety warnings, scams and crime alerts worth knowing about.' },
  { key: 'safety', short: 'Abuse & Safety', full: 'Domestic Violence, Abuse & Safety', slug: 'domestic-violence-abuse-safety', wp: [6, 11], desc: 'Domestic violence, abuse and personal-safety news.' },
  { key: 'courtroom', short: 'Courtroom', full: 'Trials & Verdicts', slug: 'trials-verdicts', wp: [7], desc: 'Trials, verdicts, sentencings and court hearings.' },
  { key: 'cold', short: 'Cold Cases', full: 'Cold Cases', slug: 'cold-cases', wp: [8], desc: 'Cold-case arrests, DNA breakthroughs and decades-old mysteries.' },
  { key: 'truecrime', short: 'True Crime', full: 'True Crime Stories', slug: 'true-crime-stories', wp: [9], desc: 'In-depth true-crime stories and features.' },
  { key: 'watch', short: 'Watch & Listen', full: 'Crime Documentaries & Podcasts', slug: 'crime-media', wp: [10], desc: 'True-crime documentaries, series, podcasts and books.' }
];
const BY_KEY = {};
const BY_SLUG = {};
const WP_TO_KEY = {};
for (const c of CATS) { BY_KEY[c.key] = c; BY_SLUG[c.slug] = c; for (const id of c.wp) WP_TO_KEY[id] = c.key; }
const SITE = 'https://crimeher.com';
const OLD_SITE = 'https://crimeher.com';
const GA_ID = 'G-WVXQ9P5GT6';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const UA = { 'User-Agent': 'CrimeHer-archive/1.0 (+https://crimeher.com)' };
const HOME_DESC = "The day's true-crime headlines in one place: breaking news, missing persons, alerts, trials, cold cases and more. Every headline links to the original reporting.";
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(FAVICON_SVG);
const FOOTER = '<footer><p>Every headline links to the original reporting.</p><p>&copy; 2026 CrimeHer</p></footer>';
const SIGNUP = '<section class="signup" aria-labelledby="su-h"><div class="txt"><h2 id="su-h">Get the Daily Briefing</h2><p>The day&#39;s top true-crime headlines, in your inbox daily.</p></div><form class="frm"><label for="su-e">Email address</label><div class="row"><input id="su-e" name="email" type="email" placeholder="you@example.com" disabled><button type="submit" disabled>Sign up</button></div><p class="soon">Signups open at launch.</p></form></section>';
const CSS = `:root{--ink:#141414;--muted:#5F6368;--line:#E8E6E1;--soft:#EFEDE9;--chip:#F1F0ED;--card:#F4F3F0;--red:#B3261E}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:var(--ink);font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.skip{position:absolute;left:-999px;top:0;background:var(--ink);color:#fff;padding:10px 14px;z-index:20}
.skip:focus{left:8px;top:8px}
.pv{background:var(--ink);color:#fff;font-size:12px;line-height:1.45;padding:8px 16px;text-align:center}
.mast{text-align:center;padding:18px 20px 0}
.wordmark{display:inline-block;font-family:Newsreader,Georgia,serif;font-weight:800;font-size:38px;line-height:1;letter-spacing:-.5px}
.tag{margin-top:6px;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:var(--muted)}
.chips{position:sticky;top:0;z-index:10;background:#fff;display:flex;gap:6px;overflow-x:auto;padding:6px 16px;border-bottom:1px solid var(--line);scrollbar-width:none;-webkit-overflow-scrolling:touch}
.chips::-webkit-scrollbar{display:none}
.chip{flex:none;display:flex;align-items:center;height:44px}
.chip span{display:inline-flex;align-items:center;height:34px;padding:0 14px;border-radius:17px;background:var(--chip);font-size:14px;font-weight:600;white-space:nowrap}
.chip:hover span{background:#E6E4E0}
.chip.on span,.chip.on:hover span{background:var(--ink);color:#fff}
.wrap{max-width:1280px;margin:0 auto}
.top{padding:20px 20px 22px;border-bottom:1px solid var(--line)}
.kick{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--red)}
.dot{display:inline-block;width:8px;height:8px;border-radius:4px;background:var(--red);flex:none}
.top h2{margin:10px 0 0;font-family:Newsreader,Georgia,serif;font-weight:700;font-size:29px;line-height:1.14;letter-spacing:-.3px}
.top h2 a:hover,.list a:hover .h,.cat li a:hover{color:var(--red)}.top.red h2 a{color:var(--red)}.top.red h2 a:hover{color:#8C1D17}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px;font-size:12px;color:var(--muted)}
.top .meta{margin-top:10px}
.meta .c{font-weight:700;letter-spacing:.8px;text-transform:uppercase}
.meta .c[class*=k-]{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:6px;background:var(--kt);color:var(--ki);font-size:11px}
.chip[class*=k-] span::before{content:"";width:8px;height:8px;border-radius:4px;background:var(--k);margin-right:7px;flex:none}
.chip.on[class*=k-] span,.chip.on[class*=k-]:hover span{background:var(--kt);color:var(--ki);box-shadow:inset 0 0 0 1.5px var(--k)}
.cat-head[class*=k-] h1::before{content:"";display:block;width:40px;height:4px;border-radius:2px;background:var(--k);margin-bottom:12px}
.meta .n{font-weight:800;letter-spacing:.8px;color:var(--red)}
.feed-h{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 6px}
.feed-h b{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase}
.upd{font-size:12px;color:var(--muted)}
.live{animation:pulse 2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(179,38,30,.45)}70%{box-shadow:0 0 0 7px rgba(179,38,30,0)}100%{box-shadow:0 0 0 0 rgba(179,38,30,0)}}
@media (prefers-reduced-motion:reduce){.live{animation:none}}
.list{list-style:none;margin:0;padding:0}
.list a{display:block;padding:14px 20px;border-bottom:1px solid var(--soft)}
.list .h{display:block;font-size:17px;font-weight:600;line-height:1.32}
.empty{padding:24px 20px;color:var(--muted);font-size:15px}
.signup{margin:20px 16px;padding:20px;border-radius:16px;background:var(--card)}
.signup h2{margin:0;font-family:Newsreader,Georgia,serif;font-weight:700;font-size:24px;line-height:1.2}
.signup .txt p{margin:8px 0 14px;font-size:14px;line-height:1.45;color:#4A4D52}
.signup label{display:block;margin-bottom:6px;font-size:12px;font-weight:700}
.signup .row{display:flex;gap:8px}
.signup input{flex:1;min-width:0;height:44px;padding:0 12px;border:1px solid #CFCCC6;border-radius:10px;background:#fff;font:inherit;font-size:16px}
.signup button{flex:none;height:44px;padding:0 16px;border:0;border-radius:10px;background:var(--ink);color:#fff;font:inherit;font-size:15px;font-weight:700}
.signup input:disabled,.signup button:disabled{opacity:.6}
.signup .soon{margin:8px 0 0;font-size:12px;color:var(--muted)}
.cat-head{padding:20px 20px 0}
.cat-head h1{margin:0;font-family:Newsreader,Georgia,serif;font-weight:800;font-size:30px;line-height:1.1}
.cat-head p{margin:6px 0 0;font-size:14px;line-height:1.45;color:var(--muted)}
.more-link{display:inline-flex;align-items:center;min-height:44px;padding:0 20px;font-size:14px;font-weight:700;color:var(--red)}
.cats{display:none}
footer{margin-top:24px;padding:24px 20px 40px;border-top:1px solid var(--line);text-align:center;font-size:12px;line-height:1.6;color:var(--muted)}
footer p{margin:0}
@media (min-width:1024px){
.mast{padding:36px 20px 18px}
.wordmark{font-size:64px;letter-spacing:-1px}
.tag{margin-top:10px;font-size:12px;letter-spacing:2.4px}
.chips{position:static;justify-content:center;flex-wrap:wrap;overflow:visible;max-width:1280px;margin:0 auto;padding:6px 4%;border-top:3px double var(--ink)}
.wrap{padding:0 4%}
.top{text-align:center;padding:44px 0 40px}
.top .kick,.top .meta{justify-content:center}
.top h2{max-width:920px;margin:14px auto 0;font-size:52px;line-height:1.08;letter-spacing:-.8px}
.top .meta{margin-top:14px;font-size:13px}
.cols{display:flex;gap:48px;align-items:flex-start;padding:32px 0 56px}
.feed{flex:1 1 0;min-width:0}
.is-cat .feed{max-width:760px}
.feed-h{padding:0 0 10px;border-bottom:3px solid var(--ink)}
.list a{padding:14px 0}
.list .h{font-size:19px;line-height:1.3}
.empty{padding:24px 0}
.signup{display:flex;flex-wrap:wrap;align-items:flex-end;gap:16px 24px;margin:24px 0;padding:24px}
.signup .txt{flex:1 1 240px}
.signup .txt p{margin:6px 0 0}
.signup .frm{flex:1 1 300px}
.cat-head{padding:32px 0 0}
.cat-head h1{font-size:40px}
.more-link{padding:0}
.cats{display:grid;flex:0 0 560px;grid-template-columns:repeat(2,minmax(0,1fr));gap:36px 32px}
.cat h2{margin:0;padding-top:10px;border-top:3px solid var(--k, var(--ink));color:var(--ki, var(--ink));font-size:13px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase}
.cat ul{list-style:none;margin:0;padding:0}
.cat li a{display:block;padding:11px 0;border-bottom:1px solid var(--soft);font-size:15px;font-weight:600;line-height:1.35}
.cat .more{display:inline-flex;align-items:center;min-height:44px;font-size:13px;font-weight:700;color:var(--ki, var(--red))}
footer{padding:24px 0 40px}
}`;

function e(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function decode(s) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
  return String(s || '').replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (named[n.toLowerCase()] !== undefined ? named[n.toLowerCase()] : m))
    .trim();
}
function mapCat(ids) {
  for (const id of ids || []) if (WP_TO_KEY[id]) return WP_TO_KEY[id];
  return 'breaking';
}
function ago(iso, now) {
  const t = Date.parse(iso);
  if (!t) return '';
  const m = Math.floor((now - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' hr ago';
  const d = new Date(t);
  const label = MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
  return d.getUTCFullYear() === new Date(now).getUTCFullYear() ? label : label + ', ' + d.getUTCFullYear();
}
const ICON_BYTES = {};
function icon(p) {
  const bytes = ICON_BYTES[p] || (ICON_BYTES[p] = Uint8Array.from(atob(PNG[p]), c => c.charCodeAt(0)));
  return new Response(bytes, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' } });
}
function html(body, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
}
function text(body, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
function xml(body) {
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function redirect(loc, status) {
  return new Response(null, { status, headers: { location: loc } });
}

function layout({ title, desc, path, preview, body, ld }) {
  const ga = preview ? '' : `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');</script>`;
  const bar = preview ? '<div class="pv" role="note">Private preview &middot; Live headlines in testing, above the archive from Nov 2025 to Feb 2026</div>' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${e(title)}</title><meta name="description" content="${e(desc)}"><link rel="canonical" href="${SITE}${path}"><meta name="theme-color" content="#ffffff"><meta property="og:site_name" content="CrimeHer"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(desc)}"><meta property="og:url" content="${SITE}${path}"><meta name="twitter:card" content="summary"><link rel="icon" href="${FAVICON}"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest"><meta name="apple-mobile-web-app-title" content="CrimeHer"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Newsreader:opsz,wght@6..72,700;6..72,800&display=swap"><style>${CSS}${KCSS}</style>${ld ? `<script type="application/ld+json">${ld}</script>` : ''}${ga}</head><body>${bar}<a class="skip" href="#main">Skip to headlines</a>${body}</body></html>`;
}
function header(cat) {
  const chip = (href, label, on, key) => `<a class="chip${key ? ' k-' + key : ''}${on ? ' on' : ''}" href="${href}"${on ? ' aria-current="page"' : ''}><span>${e(label)}</span></a>`;
  return `<header class="mast"><a class="wordmark" href="/">crimeher</a><div class="tag">Your Daily True Crime Briefing</div></header><nav class="chips" aria-label="Categories">${chip('/', 'All', !cat)}${CATS.map(c => chip('/' + c.slug, c.short, !!cat && cat.key === c.key, c.key)).join('')}</nav>`;
}
function itemHtml(r, now, showCat) {
  const fresh = now - Date.parse(r.published_at) < 3600000;
  const c = BY_KEY[r.category];
  return `<li><a href="/go/${r.id}" target="_blank" rel="noopener"><span class="h">${e(r.headline)}</span><span class="meta">${fresh ? '<span class="n">NEW</span><span aria-hidden="true">&middot;</span>' : ''}${showCat && c ? `<span class="c k-${c.key}">${e(c.short)}</span><span aria-hidden="true">&middot;</span>` : ''}<span>${ago(r.published_at, now)}</span></span></a></li>`;
}

async function renderPage(env, cat, preview) {
  const now = Date.now();
  const cols = 'id, headline, category, published_at';
  let top = null;
  let pick = null;
  let feed = [];
  let sections = [];
  if (cat) {
    feed = (await env.DB.prepare(`SELECT ${cols} FROM items WHERE status = 'published' AND category = ? ORDER BY published_at DESC LIMIT 50`).bind(cat.key).all()).results;
  } else {
    // Top story: Craig's pin, else the automatic pick (src/top.js), else the newest Breaking headline.
    pick = await currentTop(env, now);
    const res = await env.DB.batch([
      pick ? env.DB.prepare(`SELECT ${cols} FROM items WHERE id = ? AND status = 'published'`).bind(pick.id)
        : env.DB.prepare(`SELECT ${cols} FROM items WHERE status = 'published' AND category = 'breaking' ORDER BY published_at DESC LIMIT 1`),
      env.DB.prepare(`SELECT ${cols} FROM items WHERE status = 'published' ORDER BY published_at DESC LIMIT 41`),
      env.DB.prepare(`SELECT ${cols} FROM (SELECT ${cols}, ROW_NUMBER() OVER (PARTITION BY category ORDER BY published_at DESC) AS rn FROM items WHERE status = 'published') WHERE rn <= 4 ORDER BY published_at DESC`)
    ]);
    top = res[0].results[0] || null;
    feed = res[1].results.filter(r => !top || r.id !== top.id).slice(0, 40);
    sections = CATS.map(c => ({ c, rows: res[2].results.filter(r => r.category === c.key) }));
  }
  const first = feed.slice(0, 6).map(r => itemHtml(r, now, !cat)).join('');
  const rest = feed.slice(6).map(r => itemHtml(r, now, !cat)).join('');
  const empty = feed.length ? '' : '<p class="empty">Headlines are loading. Check back in a few minutes.</p>';
  const topCat = top && BY_KEY[top.category] ? BY_KEY[top.category].short : '';
  const topHtml = top ? `<section class="top${pick && pick.red && pick.id === top.id ? ' red' : ''}" aria-label="Top story"><div class="kick"><span class="dot"></span><span>Top story</span></div><h2><a href="/go/${top.id}" target="_blank" rel="noopener">${e(top.headline)}</a></h2><div class="meta"><span class="c${top && BY_KEY[top.category] ? ' k-' + top.category : ''}">${e(topCat)}</span><span aria-hidden="true">&middot;</span><span>${ago(top.published_at, now)}</span></div></section>` : '';
  const catHead = cat ? `<section class="cat-head k-${cat.key}"><h1>${e(cat.full)}</h1><p>${e(cat.desc)}</p></section>` : '<h1 class="sr">CrimeHer: Your Daily True Crime Briefing</h1>';
  const aside = cat ? '' : `<aside class="cats" aria-label="Categories">${sections.map(s => `<section class="cat k-${s.c.key}"><h2><a href="/${s.c.slug}">${e(s.c.short)}</a></h2><ul>${s.rows.map(r => `<li><a href="/go/${r.id}" target="_blank" rel="noopener">${e(r.headline)}</a></li>`).join('')}</ul><a class="more" href="/${s.c.slug}">More ${e(s.c.short)} &rarr;</a></section>`).join('')}</aside>`;
  const label = cat ? cat.short : 'Latest';
  const body = `${header(cat)}<main id="main" class="wrap${cat ? ' is-cat' : ''}">${catHead}${topHtml}<div class="cols"><section class="feed" aria-label="${e(label)} headlines"><div class="feed-h"><b><span class="dot live"></span>${e(label)}</b><span class="upd">Updates every 15 min</span></div>${empty}<ol class="list">${first}</ol>${cat ? '' : SIGNUP}<ol class="list">${rest}</ol>${cat ? '<a class="more-link" href="/">All headlines &rarr;</a>' : ''}</section>${aside}</div></main>${FOOTER}`;
  const title = cat ? `${cat.full}: Latest Headlines | CrimeHer` : 'CrimeHer: Your Daily True Crime Briefing';
  const desc = cat ? `${cat.desc} Every headline links to the original reporting.` : HOME_DESC;
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': cat ? 'CollectionPage' : 'WebSite', name: cat ? cat.full : 'CrimeHer', url: SITE + (cat ? '/' + cat.slug : '/'), description: desc }).replace(/</g, '\\u003c');
  return layout({ title, desc, path: cat ? '/' + cat.slug : '/', preview, body, ld });
}
function notFound(preview) {
  const body = `${header(null)}<main id="main" class="wrap"><section class="cat-head"><h1>Page not found</h1><p>That page isn&#39;t here. <a class="more-link" style="padding:0" href="/">See today&#39;s headlines &rarr;</a></p></section></main>${FOOTER}`;
  return layout({ title: 'Page not found | CrimeHer', desc: HOME_DESC, path: '/', preview, body, ld: '' });
}
function sitemap() {
  const urls = ['/'].concat(CATS.map(c => '/' + c.slug));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${SITE}${u}</loc><changefreq>hourly</changefreq></url>`).join('')}</urlset>\n`;
}
function llms() {
  return `# CrimeHer\n\n> Your daily true-crime briefing: one page of the latest true-crime headlines, each linking to the original reporting.\n\nCrimeHer gathers true-crime headlines from news outlets and official sources and sorts them into eight categories.\n\n## Pages\n\n- [Front page](${SITE}/): the latest headlines across every category\n${CATS.map(c => `- [${c.full}](${SITE}/${c.slug}): ${c.desc}`).join('\n')}\n`;
}

function dest(row, url) {
  if (!row.wp_id) return row.url;
  if (row.target_url && row.target_url !== 'none') return row.target_url;
  if (!url.hostname.endsWith('crimeher.com')) return row.url;
  const c = BY_KEY[row.category];
  return c ? '/' + c.slug : '/';
}
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|headless/i;
async function goTo(env, ctx, req, id, url) {
  const row = await env.DB.prepare("SELECT id, url, target_url, category, wp_id FROM items WHERE id = ? AND status = 'published'").bind(id).first();
  if (!row) return redirect('/', 302);
  if (req.method === 'GET' && !BOTS.test(req.headers.get('user-agent') || '')) {
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare('UPDATE items SET clicks = clicks + 1 WHERE id = ?').bind(id),
      env.DB.prepare('INSERT INTO clicks (item_id, at, preview) VALUES (?, ?, ?)').bind(id, new Date().toISOString(), url.hostname.endsWith('.workers.dev') ? 1 : 0)
    ]));
  }
  return redirect(dest(row, url), 302);
}
async function legacy(env, slug, url) {
  const row = await env.DB.prepare('SELECT id, url, target_url, category, wp_id FROM items WHERE legacy_path = ?').bind('/' + slug + '/').first();
  return row ? redirect(dest(row, url), 301) : null;
}
async function status(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN target_url IS NOT NULL AND target_url <> 'none' THEN 1 ELSE 0 END) AS resolved, SUM(CASE WHEN target_url = 'none' THEN 1 ELSE 0 END) AS no_target FROM items WHERE wp_id IS NOT NULL").first();
  const [items, feeds, last] = await env.DB.batch([
    env.DB.prepare("SELECT status, COUNT(*) AS n FROM items WHERE wp_id IS NULL GROUP BY status"),
    env.DB.prepare("SELECT SUM(enabled = 1 AND last_ok_at IS NOT NULL) AS working, SUM(enabled = 1 AND last_ok_at IS NULL AND last_checked_at IS NOT NULL) AS failing, SUM(enabled = 1 AND last_checked_at IS NULL) AS unchecked, SUM(enabled = 0) AS turned_off FROM sources"),
    env.DB.prepare("SELECT started_at, feeds_checked, items_new, published, held, rejected, errors FROM runs ORDER BY id DESC LIMIT 1")
  ]);
  const byStatus = {};
  for (const row of items.results) byStatus[row.status] = row.n;
  return {
    archive: { imported: r.total, links_resolved: r.resolved || 0, links_without_target: r.no_target || 0, links_pending: r.total - (r.resolved || 0) - (r.no_target || 0) },
    live: { ai_on: !!env.ANTHROPIC_API_KEY, model: MODEL, items: byStatus, feeds: feeds.results[0] || {}, last_run: last.results[0] || null,
      est_ai_cost_today_usd: Math.round(((await env.DB.prepare(`SELECT COALESCE(SUM(json_extract(notes, '$.est_cost_usd')), 0) AS usd FROM runs WHERE started_at >= ?`).bind(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').first()).usd || 0) * 100) / 100 }
  };
}

// Every minute: on even minutes, resolve archive links until they're all done;
// otherwise check due feeds and let the AI decide new items.
async function runScheduled(event, env) {
  const now = event.scheduledTime || Date.now();
  const archivePending = await env.DB.prepare('SELECT 1 FROM items WHERE wp_id IS NOT NULL AND target_url IS NULL LIMIT 1').first();
  if (archivePending && Math.floor(now / 60000) % 2 === 0) return backfill(env);
  const kv = { get: getKV, set: setKV };
  // Held headlines are news: after 24 hours unreviewed they expire instead of piling up on the desk.
  await env.DB.prepare("UPDATE items SET status = 'expired' WHERE status = 'held' AND decided_at < ?").bind(new Date(now - 86400000).toISOString()).run();
  await syncSources(env, getKV, setKV);
  const feeds = await checkFeeds(env, now, FEEDS_PER_RUN);
  const ai = await decideNew(env, now, AI_PER_RUN, kv);
  try { await chooseAutoTop(env, now); } catch (err) { console.error('top story', String(err)); }
  try { await runProbe(env); } catch (err) { console.error('probe', String(err)); }
  const added = feeds.reduce((n, f) => n + (f.added || 0), 0);
  if (!feeds.length && !ai.decided && !ai.errors) return;
  const failed = feeds.filter(f => !f.ok).map(f => `${f.id}: ${f.error}`);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO runs (started_at, finished_at, feeds_checked, items_new, published, held, rejected, errors, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(new Date(now).toISOString(), new Date().toISOString(), feeds.length, added, ai.published, ai.held, ai.rejected, failed.length + ai.errors,
        JSON.stringify({ usage: ai.usage, est_cost_usd: estimateCost(ai.usage), writer: ai.writer, failed })),
    env.DB.prepare("DELETE FROM runs WHERE started_at < ?").bind(new Date(now - 14 * 86400000).toISOString())
  ]);
}

async function backfill(env) {
  let budget = 44;
  let next = Number((await getKV(env, 'wp_next_page')) || 1);
  let total = Number((await getKV(env, 'wp_total_pages')) || 0);
  for (let i = 0; i < 2 && (total === 0 || next <= total); i++) {
    const r = await fetch(`${OLD_SITE}/wp-json/wp/v2/posts?per_page=100&page=${next}&orderby=id&order=asc&_fields=id,date_gmt,slug,link,title,categories`, { headers: Object.assign({ Accept: 'application/json' }, UA) });
    budget--;
    if (!r.ok) { console.log('archive page failed', next, r.status); break; }
    total = Number(r.headers.get('X-WP-TotalPages')) || total;
    const posts = await r.json();
    if (!Array.isArray(posts) || !posts.length) { total = next - 1; await setKV(env, 'wp_total_pages', total); break; }
    const stmt = env.DB.prepare("INSERT OR IGNORE INTO items (wp_id, url, legacy_path, title_raw, headline, category, status, source_published_at, published_at) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)");
    await env.DB.batch(posts.map(p => {
      const t = decode(p.title && p.title.rendered);
      const when = p.date_gmt ? String(p.date_gmt).replace(/Z?$/, 'Z') : new Date().toISOString();
      return stmt.bind(p.id, p.link, '/' + p.slug + '/', t, t, mapCat(p.categories), when, when);
    }));
    next++;
    await setKV(env, 'wp_next_page', next);
    await setKV(env, 'wp_total_pages', total);
  }
  const rows = (await env.DB.prepare('SELECT id, url FROM items WHERE wp_id IS NOT NULL AND target_url IS NULL ORDER BY published_at DESC LIMIT ?').bind(Math.max(budget, 0)).all()).results;
  for (let i = 0; i < rows.length; i += 6) {
    await Promise.all(rows.slice(i, i + 6).map(async row => {
      try {
        const r = await fetch(row.url, { redirect: 'manual', headers: UA });
        const loc = r.headers.get('location');
        let target = 'none';
        if (r.status >= 300 && r.status < 400 && loc) {
          const abs = new URL(loc, row.url);
          if (!abs.hostname.endsWith('crimeher.com')) target = abs.toString();
        }
        await env.DB.prepare('UPDATE items SET target_url = ? WHERE id = ?').bind(target, row.id).run();
      } catch (err) {
        console.log('resolve failed', row.id, String(err));
      }
    }));
  }
}

async function route(req, url, env, ctx, preview) {
  const p = url.pathname;
  if (p === '/desk' || p.startsWith('/desk/')) {
    ctx.waitUntil(noteAccessTeam(req, env, setKV));
    const user = await deskUser(req, env);
    if (!user) return lockedPage(env);
    if (p === '/desk/act' && req.method === 'POST') return deskAction(req, env, user, CATS);
    if (p === '/desk/add' && req.method === 'POST') return deskAdd(req, env, user, CATS, { get: getKV, set: setKV });
    if (p === '/desk' && req.method === 'GET') return renderDesk(env, url, user, CATS);
    return text('Not found', 404);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return text('Method not allowed', 405);
  if (p === '/') return html(await renderPage(env, null, preview));
  if (p === '/robots.txt') return text(preview ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /desk\nDisallow: /go/\n\nSitemap: ${SITE}/sitemap.xml\n`);
  if (p === '/sitemap.xml') return xml(sitemap());
  if (p === '/llms.txt') return text(llms());
  if (PNG[p]) return icon(p);
  if (p === '/site.webmanifest') return new Response(MANIFEST, { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=86400' } });
  if (p === '/status') return json(await status(env));
  const go = p.match(/^\/go\/(\d+)$/);
  if (go) return goTo(env, ctx, req, Number(go[1]), url);
  const oldCat = p.match(/^\/category\/([a-z0-9-]+)\/?$/);
  if (oldCat && BY_SLUG[oldCat[1]]) return redirect('/' + oldCat[1], 301);
  const slug = decodeURIComponent(p.replace(/^\/+|\/+$/g, ''));
  if (BY_SLUG[slug]) {
    if (p !== '/' + slug) return redirect('/' + slug, 301);
    return html(await renderPage(env, BY_SLUG[slug], preview));
  }
  if (slug && !slug.includes('/')) {
    const hit = await legacy(env, slug, url);
    if (hit) return hit;
  }
  return html(notFound(preview), 404);
}

const handler = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const preview = url.hostname.endsWith('.workers.dev');
    let res;
    try {
      res = await route(req, url, env, ctx, preview);
    } catch (err) {
      console.error(err);
      res = text('Something went wrong. Please try again shortly.', 500);
    }
    if (preview) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(event, env));
  }
};

export default handler;

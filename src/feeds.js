// Feed checking: fetch due feeds, parse RSS or Atom, store new items.
// Nothing here is published. New items wait for the AI step (status 'new').

import { LAST_RESORT_HOSTS } from './sources.js';

const UA = 'Mozilla/5.0 (compatible; CrimeHer/1.0; +https://crimeher.com)';
const CHECK_EVERY_MIN = 14;      // a feed is due again ~15 minutes after its last check
const MAX_FAILS = 6;             // consecutive failures before a feed turns itself off
const FRESH_HOURS = 24;          // older items are stored as 'stale' and never published
const MAX_ITEMS_PER_FEED = 40;

// Crime words a general-news item must contain before it reaches the AI.
const CRIME_WORDS = /\b(kill|killed|killing|killer|murder|homicide|manslaughter|shot|shoots|shooting|gunman|stab|stabbed|stabbing|arrest|arrested|charged|charges|suspect|police|sheriff|deputies|deputy|missing|abduct|abducted|kidnap|amber alert|found dead|body|bodies|remains|trial|jury|verdict|guilty|sentenc\w*|convict\w*|prison|jail|court|judge|indict\w*|plea|cold case|dna|assault|rape|sexual|abuse|abused|domestic|violence|scam|scammers|fraud|fbi|crime|criminal|manhunt|fugitive|wanted|investigat\w*|carjack\w*|robbery|robbed|burglar\w*|theft|stolen|trafficking|fentanyl|serial|strangl\w*|smuggl\w*|predator|grooming|felony|misdemeanor|bail|prosecutor\w*|detectives?|autopsy|coroner|medical examiner)\b/i;

// --- small text helpers -------------------------------------------------------

const NAMED = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', eacute: 'é' };
export function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (NAMED[n.toLowerCase()] !== undefined ? NAMED[n.toLowerCase()] : m));
}
function safeChar(n) { try { return String.fromCodePoint(n); } catch { return ''; } }
function cdata(s) { return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'); }
export function plain(s, max) {
  // Twice: some feeds escape their HTML (&lt;p&gt;), so tags appear only after one decode.
  let t = decodeEntities(cdata(s).replace(/<[^>]*>/g, ' '));
  t = decodeEntities(t.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}
function attr(el, name) {
  const m = el.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decodeEntities(m[2] !== undefined ? m[2] : m[3]) : '';
}

// --- URLs ---------------------------------------------------------------------

const TRACKING = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|cmpid|ocid|taid|smid|cid|icid|ito|ref|rss|feedType|traffic_source|dicbo|partner|source)$/i;
export function cleanUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  // Bing News wraps the article link: …/apiclick.aspx?…&url=<original>
  if (/(^|\.)bing\.com$/i.test(u.hostname) && u.searchParams.get('url')) return cleanUrl(u.searchParams.get('url'));
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  return u.toString();
}
export function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
export function isLastResort(host) {
  return LAST_RESORT_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

// --- parsing ------------------------------------------------------------------

function toIso(s) {
  const t = Date.parse(plain(s));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// Returns [{ url, guid, title, summary, published }] from RSS 2.0, RSS 1.0 or Atom.
export function parseFeed(xml) {
  const out = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const b of blocks.slice(0, MAX_ITEMS_PER_FEED)) {
    let link = '';
    if (isAtom) {
      const links = b.match(/<link\b[^>]*>/gi) || [];
      const alt = links.find(l => !/\srel\s*=/i.test(l) || /rel\s*=\s*["']alternate["']/i.test(l)) || links[0] || '';
      link = attr(alt, 'href');
    } else {
      link = plain(tag(b, 'feedburner:origLink')) || plain(tag(b, 'link'));
      if (!link) { const g = tag(b, 'guid'); if (/^https?:/i.test(plain(g))) link = plain(g); }
    }
    const url = cleanUrl(link);
    const title = plain(tag(b, 'title'), 300);
    if (!url || !title) continue;
    const summary = plain(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content'), 500);
    const published = toIso(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    out.push({ url, guid: plain(tag(b, 'guid') || tag(b, 'id')).slice(0, 500) || null, title, summary, published });
  }
  // Some feeds (NBC stations) repeat one story's blurb on every item. A summary shared by
  // 3+ items in one feed belongs to none of them, so drop it rather than mislead the AI.
  const seen = {};
  for (const it of out) if (it.summary) seen[it.summary] = (seen[it.summary] || 0) + 1;
  for (const it of out) if (it.summary && seen[it.summary] >= 3) it.summary = '';
  return out;
}

// --- MSN copies ---------------------------------------------------------------
// Bing News often links to MSN's copy of a story instead of the outlet's own page. MSN's content
// API names the original (sourceHref), so the headline can link to the outlet, and its text can
// feed the headline writer when the outlet itself blocks us.
export function msnId(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)msn\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/ar-([A-Za-z0-9]+)/);
    return m ? m[1] : null;
  } catch { return null; }
}
export async function msnDetail(id) {
  try {
    const r = await fetch(`https://assets.msn.com/content/view/v2/Detail/en-us/${id}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d = await r.json();
    const source = cleanUrl(d.sourceHref || '');
    return {
      url: source && !msnId(source) && !/(^|\.)msn\.com$/i.test(hostOf(source)) ? source : null,
      abstract: plain(d.abstract || '', 500),
      text: plain(typeof d.body === 'string' ? d.body : '', 4000)
    };
  } catch { return null; }
}
const MSN_PER_FEED = 15;
async function resolveMsn(env, items) {
  const found = items.map(it => [it, msnId(it.url)]).filter(([, id]) => id);
  if (!found.length) return;
  // Skip copies already stored (by their MSN id), so each is looked up once.
  const ids = found.map(([, id]) => 'msn:' + id);
  const seen = new Set((await env.DB.prepare(`SELECT guid FROM items WHERE guid IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results.map(r => r.guid));
  const todo = found.filter(([, id]) => !seen.has('msn:' + id));
  for (const [it, id] of found) if (seen.has('msn:' + id)) it.skip = true;
  await Promise.all(todo.slice(0, MSN_PER_FEED).map(async ([it, id]) => {
    it.guid = 'msn:' + id;
    const d = await msnDetail(id);
    if (!d) return;
    if (d.url) it.url = d.url;
    if (!it.summary && d.abstract) it.summary = d.abstract;
  }));
  for (const [it] of todo.slice(MSN_PER_FEED)) it.skip = true; // picked up on the next check
}

// --- checking feeds -----------------------------------------------------------

async function checkOne(env, src, now) {
  const headers = { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5' };
  if (src.etag) headers['If-None-Match'] = src.etag;
  if (src.last_modified) headers['If-Modified-Since'] = src.last_modified;
  const nowIso = new Date(now).toISOString();
  let res;
  try {
    res = await fetch(src.feed_url, { headers, redirect: 'follow', signal: AbortSignal.timeout(12000) });
  } catch (err) {
    return fail(env, src, nowIso, 'fetch: ' + String(err && err.message || err).slice(0, 120));
  }
  if (res.status === 304) {
    await env.DB.prepare('UPDATE sources SET last_checked_at = ?, last_ok_at = ?, last_status = ?, fail_count = 0, last_error = NULL WHERE id = ?')
      .bind(nowIso, nowIso, '304', src.id).run();
    return { id: src.id, ok: true, found: 0, added: 0 };
  }
  if (!res.ok) return fail(env, src, nowIso, 'HTTP ' + res.status);
  const body = await res.text();
  const items = parseFeed(body);
  if (!items.length && !/<(rss|feed|rdf:RDF)[\s>]/i.test(body)) return fail(env, src, nowIso, 'not a feed');

  await resolveMsn(env, items);
  const firstFetch = !src.last_ok_at;
  const freshCut = now - FRESH_HOURS * 3600000;
  const ins = env.DB.prepare(`INSERT OR IGNORE INTO items (source_id, url, guid, title_raw, summary_raw, category, status, outlet, source_published_at, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const stmts = items.filter(it => !it.skip).map(it => {
    const when = it.published ? Date.parse(it.published) : null;
    let status = 'new';
    if (when ? when < freshCut : firstFetch) status = 'stale';
    else if (src.broad && !CRIME_WORDS.test(it.title + ' ' + it.summary)) status = 'skipped';
    return ins.bind(src.id, it.url, it.guid, it.title, it.summary, src.category, status, hostOf(it.url), it.published || nowIso, nowIso);
  });
  stmts.push(env.DB.prepare(`UPDATE sources SET last_checked_at = ?, last_ok_at = ?, last_status = ?, fail_count = 0, last_error = NULL,
      etag = ?, last_modified = ?, items_seen = items_seen + ? WHERE id = ?`)
    .bind(nowIso, nowIso, String(res.status), res.headers.get('etag'), res.headers.get('last-modified'), items.length, src.id));
  const results = await env.DB.batch(stmts);
  const added = results.slice(0, -1).reduce((n, r) => n + (r.meta && r.meta.changes ? r.meta.changes : 0), 0);
  return { id: src.id, ok: true, found: items.length, added };
}

async function fail(env, src, nowIso, why) {
  const fails = (src.fail_count || 0) + 1;
  await env.DB.prepare('UPDATE sources SET last_checked_at = ?, last_status = ?, last_error = ?, fail_count = ?, enabled = ? WHERE id = ?')
    .bind(nowIso, 'error', why, fails, fails >= MAX_FAILS ? 0 : 1, src.id).run();
  return { id: src.id, ok: false, error: why };
}

// Check up to `limit` due feeds, least recently checked first.
export async function checkFeeds(env, now, limit) {
  const due = new Date(now - CHECK_EVERY_MIN * 60000).toISOString();
  const rows = (await env.DB.prepare(`SELECT * FROM sources WHERE enabled = 1 AND (last_checked_at IS NULL OR last_checked_at < ?)
    ORDER BY last_checked_at IS NOT NULL, last_checked_at LIMIT ?`).bind(due, limit).all()).results;
  const out = [];
  for (let i = 0; i < rows.length; i += 8) {
    out.push(...await Promise.all(rows.slice(i, i + 8).map(s => checkOne(env, s, now).catch(err => ({ id: s.id, ok: false, error: String(err).slice(0, 120) })))));
  }
  return out;
}

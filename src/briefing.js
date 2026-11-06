// The Daily Briefing: a morning email with the top story and the best headlines of the last
// 24 hours, sent through Resend to everyone who signed up on the site.
// - Signups (D1 `signups`) are copied to the Resend segment by the cron job.
// - The send happens once a day at 7 AM Eastern, only when BRIEFING_SEND is "on", the
//   RESEND_API_KEY secret is set, and MAIL_ADDRESS (the postal address the law requires in
//   marketing email) is set. Until then Craig can preview it and send himself tests from the desk.
import { KCOLORS } from './theme.js';
import { currentTop } from './top.js';
import { getKV, setKV } from './kv.js';

export const BRIEFING = {
  from: 'CrimeHer <briefing@news.crimeher.com>',
  replyTo: 'support@crimeher.com',
  segment: '44d226e7-79f7-4ae5-bfdc-ea946ca89668', // Resend segment "Daily Briefing"
  hourET: 7
};
const RESEND = 'https://api.resend.com';
const PER_CAT = 3;
const MAX_ITEMS = 12;
const INK = '#141414', MUTED = '#5F6368', RED = '#B3261E', LINE = '#E8E6E1', SOFT = '#F4F3F0';
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const siteUrl = env => String(env.SITE_URL || 'https://crimeher.com').replace(/\/$/, '');
function etParts(now) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(now)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const longDate = now => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(now));

// Build today's email. Returns null when there is nothing published in the last 24 hours.
export async function buildBriefing(env, now, CATS) {
  const since = new Date(now - 24 * 3600000).toISOString();
  const rows = (await env.DB.prepare(`SELECT id, headline, category, outlet, COALESCE(json_extract(flags, '$.interest'), 0) AS interest,
      (SELECT COUNT(*) FROM clicks c WHERE c.item_id = items.id) AS clicks
    FROM items WHERE status = 'published' AND wp_id IS NULL AND published_at > ? AND headline IS NOT NULL
    ORDER BY interest DESC, clicks DESC, published_at DESC LIMIT 300`).bind(since).all()).results;
  if (!rows.length) return null;
  const top = await currentTop(env, now);
  const lead = (top && rows.find(r => r.id === top.id)) || rows.find(r => r.category !== 'watch') || rows[0];
  const per = {};
  const picks = [];
  for (const r of rows) {
    if (r.id === lead.id || (per[r.category] || 0) >= PER_CAT) continue;
    per[r.category] = (per[r.category] || 0) + 1;
    picks.push(r);
    if (picks.length >= MAX_ITEMS) break;
  }
  const sections = CATS.map(c => ({ c, items: picks.filter(p => p.category === c.key) })).filter(s => s.items.length);
  const site = siteUrl(env);
  const go = id => `${site}/go/${id}`;
  const date = longDate(now);
  const subject = lead.headline;
  const preheader = picks[0] ? `Plus: ${picks[0].headline}` : 'Today’s true-crime headlines';
  const address = env.MAIL_ADDRESS ? esc(env.MAIL_ADDRESS) : '';

  const leadHtml = `<tr><td style="padding-top:20px;padding-bottom:22px;border-bottom:1px solid ${LINE}">
<p style="margin:0 0 8px 0;font-family:${SANS};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.2px;color:${RED}">TOP STORY</p>
<a href="${go(lead.id)}" style="font-family:${SANS};font-size:24px;line-height:30px;font-weight:800;color:${top && top.red && top.id === lead.id ? RED : INK};text-decoration:none">${esc(lead.headline)}</a>
<p style="margin:8px 0 0 0;font-family:${SANS};font-size:13px;line-height:18px;color:${MUTED}">${esc(lead.outlet || '')}</p></td></tr>`;
  const secHtml = sections.map(({ c, items }) => {
    const ink = (KCOLORS[c.key] || [INK, SOFT, INK])[2];
    const list = items.map(r => `<tr><td style="padding-top:10px;padding-bottom:10px;border-top:1px solid ${SOFT}">
<a href="${go(r.id)}" style="font-family:${SANS};font-size:17px;line-height:23px;font-weight:700;color:${INK};text-decoration:none">${esc(r.headline)}</a>
<p style="margin:3px 0 0 0;font-family:${SANS};font-size:12px;line-height:16px;color:${MUTED}">${esc(r.outlet || '')}</p></td></tr>`).join('');
    return `<tr><td style="padding-top:22px"><p style="margin:0 0 4px 0;font-family:${SANS};font-size:12px;line-height:16px;font-weight:800;letter-spacing:1.2px;color:${ink}">${esc(c.short.toUpperCase())}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${list}</table></td></tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:${SOFT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SOFT}" style="background-color:${SOFT}"><tr><td align="center" style="padding-top:20px;padding-bottom:28px;padding-left:12px;padding-right:12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px" bgcolor="#FFFFFF"><tr><td style="background-color:#FFFFFF;padding-top:24px;padding-bottom:28px;padding-left:24px;padding-right:24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding-bottom:14px;border-bottom:2px solid ${INK}"><a href="${site}/" style="font-family:${SERIF};font-size:30px;line-height:34px;font-weight:800;color:${INK};text-decoration:none">crimeher<span style="color:${RED}">.</span></a>
<p style="margin:4px 0 0 0;font-family:${SANS};font-size:13px;line-height:18px;color:${MUTED}">The Daily Briefing &middot; ${esc(date)}</p></td></tr>
${leadHtml}${secHtml}
<tr><td align="center" style="padding-top:28px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${INK}" style="background-color:${INK};padding-top:13px;padding-bottom:13px;padding-left:22px;padding-right:22px">
<a href="${site}/" style="font-family:${SANS};font-size:15px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none">See every headline at crimeher.com</a></td></tr></table></td></tr>
</table></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px"><tr><td style="padding-top:18px;padding-left:24px;padding-right:24px;font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED}" align="center">
You’re getting this because you signed up for the CrimeHer Daily Briefing. Every headline links to the outlet that reported it.<br>
<a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:${MUTED};text-decoration:underline">Unsubscribe</a> &middot; <a href="${site}/privacy" style="color:${MUTED};text-decoration:underline">Privacy</a>${address ? `<br>${address}` : ''}</td></tr></table>
</td></tr></table></body></html>`;
  const text = [`CRIMEHER · THE DAILY BRIEFING · ${date}`, '', 'TOP STORY', lead.headline, go(lead.id), '',
    ...sections.flatMap(({ c, items }) => [c.short.toUpperCase(), ...items.flatMap(r => [r.headline, go(r.id)]), '']),
    `See every headline: ${site}/`, '', 'Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}', env.MAIL_ADDRESS || ''].join('\n');
  return { subject, preheader, html, text, count: picks.length + 1, leadId: lead.id };
}

async function resend(env, method, path, body) {
  const r = await fetch(RESEND + path, {
    method, headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000)
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j };
}

// A one-off copy to one address (the desk's "Send me a test"). The unsubscribe link only works
// in real broadcasts, so tests point it at the site.
export async function sendTest(env, to, b) {
  if (!env.RESEND_API_KEY) return { ok: false, error: 'Add the RESEND_API_KEY secret in Cloudflare first.' };
  const fix = s => s.replaceAll('{{{RESEND_UNSUBSCRIBE_URL}}}', siteUrl(env) + '/');
  const r = await resend(env, 'POST', '/emails', { from: BRIEFING.from, to: [to], reply_to: BRIEFING.replyTo, subject: '[Test] ' + b.subject, html: fix(b.html), text: fix(b.text) });
  return r.ok ? { ok: true } : { ok: false, error: (r.data && r.data.message) || 'Resend answered ' + r.status };
}

// Cron: copy new signups to the Resend segment (a few each minute).
export async function syncContacts(env) {
  if (!env.RESEND_API_KEY) return 0;
  const rows = (await env.DB.prepare('SELECT id, email FROM signups WHERE synced_at IS NULL ORDER BY id LIMIT 10').all()).results;
  let n = 0;
  for (const s of rows) {
    const r = await resend(env, 'POST', '/contacts', { email: s.email, unsubscribed: false, segments: [{ id: BRIEFING.segment }] });
    if (!r.ok && r.status !== 409) { console.error('resend contact', r.status, JSON.stringify(r.data).slice(0, 200)); break; }
    await env.DB.prepare('UPDATE signups SET synced_at = ? WHERE id = ?').bind(new Date().toISOString(), s.id).run();
    n++;
  }
  return n;
}

// Cron: send today's briefing once, at 7 AM Eastern or later, when everything is in place.
export async function maybeSendBriefing(env, now, CATS) {
  if (env.BRIEFING_SEND !== 'on' || !env.RESEND_API_KEY || !env.MAIL_ADDRESS) return null;
  const { date, hour } = etParts(now);
  if (hour < BRIEFING.hourET || (await getKV(env, 'briefing_sent')) === date) return null;
  await setKV(env, 'briefing_sent', date); // claim the day first, so a slow send never goes out twice
  const b = await buildBriefing(env, now, CATS);
  if (!b) return { date, skipped: 'nothing published' };
  const r = await resend(env, 'POST', '/broadcasts', {
    segment_id: BRIEFING.segment, from: BRIEFING.from, reply_to: BRIEFING.replyTo, subject: b.subject,
    html: b.html, text: b.text, name: `Daily Briefing ${date}`, send: true
  });
  if (!r.ok) console.error('briefing send', r.status, JSON.stringify(r.data).slice(0, 300));
  return { date, sent: r.ok, items: b.count };
}

export function briefingStatus(env) {
  if (!env.RESEND_API_KEY) return 'Not sending yet: add the Resend key (RESEND_API_KEY secret) in Cloudflare.';
  if (!env.MAIL_ADDRESS) return 'Not sending yet: a mailing address (MAIL_ADDRESS) is needed in the footer before it goes to subscribers.';
  if (env.BRIEFING_SEND !== 'on') return 'Ready, but switched off until launch. Tests go only to you.';
  return `Sends daily at ${BRIEFING.hourET}:00 AM Eastern.`;
}

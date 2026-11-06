// The AI step, in two passes:
// 1. Triage (fast, low-cost model): does the story belong, which category, how gripping it is,
//    whether it repeats a recent story, and which review flags apply.
// 2. Headline writer (stronger model), only for stories that clear the bar: three hook-first
//    versions, then the one a reader would click first that is still fully accurate.
// The rules mirror the "CrimeHer Editorial Rules" doc (approved Nov 5, 2026). Change both together.

import { hostOf, isLastResort } from './feeds.js';

export const TRIAGE_MODEL = 'claude-haiku-5-5';
export const WRITER_MODEL = 'claude-sonnet-5-5';
export const MODEL = `${TRIAGE_MODEL} (triage) + ${WRITER_MODEL} (headlines)`;
const TRIAGE_BATCH = 25;
const WRITER_BATCH = 15;
const INTEREST_MIN = 7;          // 0-10. Tuned toward about 150 headlines a day on the board (Craig, Nov 5)
const CONFIDENCE_FLOOR = 0.7;    // writer's confidence below this holds the headline for review
const OUTLET_DAILY_CAP = 5;      // "No flooding": 5 headlines per outlet in 24 hours
const IDENTITY_HOLD_DAYS = 14;   // identity-detail headlines are held for the first two weeks of the live feed
const SAME_STORY = 0.6;          // title-word overlap that marks a repeat before any AI call
// Safety valve under Craig's $25/month Claude limit: past this estimated spend in a UTC day, the
// cheaper model writes the headlines for the rest of the day, so the board never stops.
const DAILY_BUDGET_USD = 0.75;

// Approximate list prices per million tokens, for the run log's cost estimate only.
const PRICE = { [TRIAGE_MODEL]: [0.10, 0.50], [WRITER_MODEL]: [2.00, 10.00] };

const CATEGORY_GUIDE = `
- breaking: Breaking Crime News. New arrests, shootings, killings, manhunts and major crime stories.
- missing: Missing Persons. Active searches, AMBER and Silver Alerts, people found safe or found dead after going missing.
- alerts: Crime Alerts. Public-safety warnings, scams and fraud warnings, wanted fugitives, warnings from police, the FBI or the FTC.
- safety: Abuse & Safety. Domestic violence, stalking, sexual abuse, child abuse, trafficking and personal-safety news.
- courtroom: Trials & Verdicts. Trials, hearings, pleas, verdicts and sentencings.
- cold: Cold Cases. Arrests, IDs and new leads in cases that went unsolved for years, often through DNA or genetic genealogy.
- truecrime: True Crime Stories. Longer features, retrospectives and deep dives on crimes.
- watch: Crime Documentaries & Podcasts. News about true-crime documentaries, series, podcasts and books.`;

const ABOUT = `CrimeHer (crimeher.com) is "Your Daily True Crime Briefing": one page of true-crime headlines, each linking to the original reporting, in the spirit of Drudge Report and Citizen Free Press. Most readers are women who love true crime, and most read on a phone.
CrimeHer is not woke. Its rules center on truth, justice and the American way. It follows the facts, not mainstream framing.
You only ever see each outlet's title and summary. Treat them as the full extent of what you know. If the summary is about a different story than the title, ignore the summary.`;

export const TRIAGE_PROMPT = `You are the story editor for CrimeHer. ${ABOUT}

Another editor writes the headlines. Your job is to decide which stories make the board and to flag the ones Craig must review.

WHAT BELONGS (fit)
CrimeHer covers real crimes and the justice system: crimes, arrests, missing persons, public-safety and scam alerts, abuse and safety, trials and verdicts, cold cases, true-crime features, and true-crime media.
Celebrities are in scope only when there's a crime, an arrest, a police call or a trial. Gossip is off-topic.
Politicians and officials: their criminal cases, and justice-policy moves by politicians (pardons, commutations, crime laws, executive orders on crime), are in scope, but always set political.
Reject (fit "no"): politics or policy with no crime or justice angle, opinion and editorial pieces, sports, business, weather, accidents with no crime, obituaries, product reviews, listicles and roundups, and anything that isn't a news report or feature.
Categories:${CATEGORY_GUIDE}

INTEREST (0 to 10): how badly a CrimeHer reader would want to click. The board runs only the best stories, about 150 a day, so be demanding.
- 9-10: people will talk about it. A famous case or name, a shocking twist, a bizarre detail, a predator or killer caught, a woman or child in danger, justice finally served in a big case.
- 7-8: a strong hook. An unusual detail, a betrayal, a gripping victim or survivor story, a notable verdict, a cold case cracked.
- 5-6: solid but routine. An ordinary arrest, shooting or sentencing with nothing unusual.
- 0-4: no hook. Procedural updates, minor incidents, crime statistics, a story readers have already seen.
A strange, ironic or deeply personal detail lifts a routine crime to 7 or 8. Calibration: "man fatally shot nephew's wife amid argument over missing cow" = 8. "Ex-deputy accused of tracking estranged wife using plate cameras: 'Started on Valentine's Day'" = 8. "Armed man peeks through 911 caller's tent" = 7. "Foster mother charged after missing girl found dead in car trunk" = 9. "Man sentenced to 25 years for killing brother" with nothing more = 5. "SWAT standoff ends with arrest" = 4.
public_service: true for an active missing-person search, an AMBER or Silver Alert, a wanted fugitive, or a scam or safety warning readers can act on. These run whatever their interest.

REPEATS (one story, one headline)
- duplicate_of: the id of a recent CrimeHer headline that covers the same case and the same development. A genuinely new development (charged, verdict, found) is not a repeat.
- same_as_item: if two new items in this batch cover the same story, set it on the later ones to the first item's number.
- possible_duplicate: it might repeat a recent headline but you can't tell.

FLAGS (be honest; these send the story to Craig for review)
- category_unsure: you aren't confident about the category. fit "unsure": you aren't sure the story belongs.
- unclear_legal_status: the source is unclear on whether a named person is suspected, charged or convicted.
- involves_minor: a minor is involved in any role (information only).
- minor_accused: a minor is the suspect, the accused or the convicted person.
- child_sexual_abuse: the story involves sexual abuse or exploitation of a minor.
- political: a politician or elected official is the accused or on trial, or the story is a justice-policy move by a politician (pardons, commutations, crime laws, executive orders). Police, prosecutors and courts doing their normal jobs don't count.

Return one decision per item through the record_triage tool. For fit "no", give a short reject_reason.`;

export const WRITER_PROMPT = `You write the headlines for CrimeHer. ${ABOUT}

VOICE
Every headline is a hook that makes the reader need to click, and it still tells her what happened. Urgent, vivid, factual. No gore, no melodrama.
Lean into what grips true-crime readers: the twist, the betrayal, the danger hiding in plain sight, the detail nobody saw coming, justice finally served.
Don't soften, hedge or leave out facts the source reports because they're uncomfortable. Don't add framing the source doesn't support.

HEADLINE CRAFT
1. Find the hook first: the one true detail that makes a reader say "wait, what?" (the missing cow, the car trunk, "started on Valentine's Day"). Lead with it or build the headline around it. Never bury it under names, ages and towns.
2. Then make sure the headline still says what happened: the crime and the status (charged, caught, convicted, missing, found). A hook with no news is a teaser, and teasers are out.
3. Rewrite. Don't paraphrase the outlet's headline. If the outlet's headline already has the hook, keep the hook and make it tighter and punchier.
4. Leave out names and ages of people readers won't recognize. They don't hook anyone; the article has them. Use a name when the person is famous or the name is the story (Lindsay Clancy, Diddy, Ted Bundy), or when a missing person is still being searched for.
5. Aim for 50 to 75 characters. Never more than 90.
6. Tools you can use: a short quote taken word for word from the title or summary, in quotes; "Cops:" or "Police Say" when the claim comes from police; a colon or a dash to set up the twist.
7. One strong verb beats stacked adjectives. Skip brutal, haunting, chilling, shocking, horror, horrifying and heartbreaking. The fact carries the punch, not the adjective.
8. No question headlines and no "you won't believe" teasers.
9. Use Title Case. Proofread: every word spelled correctly, and any name matches the source exactly.
10. Write three genuinely different versions, each built on a different hook or angle. Then pick the one a reader would click first that is still fully accurate. Don't default to the safest, most literal version.

EXAMPLES (outlet headline -> CrimeHer headline)
Good:
- "Alabama man fatally shot nephew's wife amid argument over missing cow" -> "Killed Over a Missing Cow: Alabama Man Guilty of Murdering Nephew's Wife"
- "Ex-Pinellas deputy accused of tracking estranged wife using FLOCK, sheriff says: 'Started on Valentine's Day'" -> "'Started on Valentine's Day': Ex-Deputy Accused of Tracking Wife With Plate Cameras"
- "Foster Mother Charged With Murder After Missing Philly Girl Found Dead in Truck of Car in NJ" -> "Missing Philly Girl Found Dead in a Car Trunk — Her Foster Mom Is Charged"
- "Florida mom arrested after leaving 4 kids home alone during dayslong trip to Vegas" -> "Vegas Getaway: Florida Mom Arrested for Leaving 4 Kids Home Alone for Days"
- "Utah authorities connecting serial killer Ted Bundy to another 1970s homicide" -> "Ted Bundy Linked to Another 1970s Murder in Utah"
Bad, and why:
- "Escaped Tennessee Murderer Jacob Morley Caught in Missouri After Week on the Run" (from "Cops: While Hiding in Shed, Escapee Drank Beer, Made Garlic Bread"): names a stranger and throws away the hook. Better: "Escaped Inmate Caught Hiding in a Shed With Beer and Garlic Bread, Cops Say"
- "Fugitive Made Garlic Bread in a Shed": all hook, no news. It never says what happened.
- "Fresno Police Arrest Miguel Aguilar Yepez, 25, After Armed Man Looks Into 911 Caller's Tent": a paraphrase stuffed with a name and an age.

ACCURACY (this floor always applies)
1. Every fact in the headline traces to the source's title or summary. Nothing is added, guessed or inferred.
2. Never be more certain than the source. "Suspect," "charged" and "accused" stay until a verdict. Nobody is called a killer, rapist or abuser before a conviction.

PEOPLE AND IDENTITY
- Accused adults may be named once charged, always with "charged" or "accused" until a verdict. Convicted people may be named, with the verdict. Adult victims may be named when the source names them. These are permissions, not requirements: follow HEADLINE CRAFT rule 4.
- Minors (victims, suspects or witnesses): never named, even if the source names them. Describe them by age instead, e.g. "17-Year-Old Girl". Two exceptions: a missing child in an active police or AMBER Alert may be named, because naming helps find them (once found, stop naming them); and a minor whose name is the public identity of a widely known, decades-old case (e.g. JonBenét Ramsey) may be named.
- Sexual-assault victims: never named, even if the source names them.
- Identity details: a suspect's immigration status, nationality, race or sexuality goes in the headline when a crime has been committed, the detail is important to the story, and the source reports it. Never guess it from a name, a photo or a neighborhood.
- A suspect in the country illegally is an "illegal immigrant."
- When gender identity comes up, describe people by biological sex where it matters to the story.

FLAGS
- names_minor: your chosen headline contains the name of anyone under 18, outside the two exceptions. Should always be false; if it's true, fix the headline.
- identity_detail: your chosen headline carries immigration status, nationality, race, sexuality or sex.
- confidence: 0 to 1, your confidence the chosen headline is accurate, fair to the source and follows these rules. It measures the headline, not how disturbing the story is.

Always answer by calling the record_headlines tool once, with one entry per story and no other text.`;

const CATS_ENUM = ['breaking', 'missing', 'alerts', 'safety', 'courtroom', 'cold', 'truecrime', 'watch'];
const TRIAGE_TOOL = {
  name: 'record_triage',
  description: 'Record the triage decision for every item in the batch.',
  input_schema: {
    type: 'object',
    properties: {
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            i: { type: 'integer', description: 'The item number from the input.' },
            fit: { type: 'string', enum: ['yes', 'no', 'unsure'] },
            reject_reason: { type: 'string' },
            category: { type: 'string', enum: CATS_ENUM },
            category_unsure: { type: 'boolean' },
            interest: { type: 'integer', minimum: 0, maximum: 10 },
            public_service: { type: 'boolean' },
            duplicate_of: { type: ['integer', 'null'] },
            same_as_item: { type: ['integer', 'null'] },
            possible_duplicate: { type: 'boolean' },
            unclear_legal_status: { type: 'boolean' },
            involves_minor: { type: 'boolean' },
            minor_accused: { type: 'boolean' },
            child_sexual_abuse: { type: 'boolean' },
            political: { type: 'boolean' }
          },
          required: ['i', 'fit', 'category', 'interest']
        }
      }
    },
    required: ['decisions']
  }
};
const WRITER_TOOL = {
  name: 'record_headlines',
  description: 'Record the headline for every item in the batch.',
  input_schema: {
    type: 'object',
    properties: {
      headlines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            i: { type: 'integer', description: 'The item number from the input.' },
            options: { type: 'array', items: { type: 'string' }, description: 'Three genuinely different versions, each with a different hook or angle.' },
            headline: { type: 'string', description: 'The chosen version.' },
            names_minor: { type: 'boolean' },
            identity_detail: { type: 'boolean' },
            confidence: { type: 'number' }
          },
          required: ['i', 'options', 'headline', 'confidence']
        }
      }
    },
    required: ['headlines']
  }
};

async function callClaude(env, model, system, tool, userText, usage, forceTool = true) {
  const res = await fetch((env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: [tool],
      tool_choice: forceTool ? { type: 'tool', name: tool.name } : { type: 'auto' },
      messages: [{ role: 'user', content: userText }]
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!res.ok) throw new Error(`Claude API ${res.status} (${model}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const u = data.usage || {};
  const t = usage[model] || (usage[model] = { in: 0, out: 0, cache_read: 0, cache_write: 0 });
  t.in += u.input_tokens || 0;
  t.out += u.output_tokens || 0;
  t.cache_read += u.cache_read_input_tokens || 0;
  t.cache_write += u.cache_creation_input_tokens || 0;
  const block = (data.content || []).find(b => b.type === 'tool_use');
  if (block && block.input) return block.input;
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  throw new Error(`${model} returned no tool output`);
}

export function estimateCost(usage) {
  let usd = 0;
  for (const [model, t] of Object.entries(usage)) {
    const [pin, pout] = PRICE[model] || [0, 0];
    usd += (t.in * pin + t.cache_read * pin * 0.1 + t.cache_write * pin * 1.25 + t.out * pout) / 1e6;
  }
  return Math.round(usd * 10000) / 10000;
}

// Strip quotes that wrap the whole headline, but keep a leading quote ('Started on Valentine's Day': ...).
export function cleanHeadline(h) {
  let s = String(h || '').replace(/\s+/g, ' ').trim();
  if (/^".*"$/.test(s) && !s.slice(1, -1).includes('"')) s = s.slice(1, -1).trim();
  return s.slice(0, 140);
}

// Words too common in crime headlines to tell two stories apart.
const STOP = new Set(('the and for with from after over into that this was were are has have had his her their its out off who what when where why how ' +
  'man woman men women police cops say says said new news update updated video watch live year years old teen girl boy mother father mom dad wife husband ' +
  'child children kids charged charges charge murder murdered killed killing kills shooting shot arrested arrest sentenced sentence prison jail life death dead ' +
  'found missing accused suspect case cases cold trial guilty court judge jury county city state deputies officers officials investigation').split(' '));
export function sigWords(s) {
  return new Set(String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
}
// Share of the shorter title's distinctive words found in the other. Needs at least 3 shared words.
export function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n >= 3 ? n / Math.min(a.size, b.size) : 0;
}

// Decide up to `maxItems` new items. Returns counts and token use for the run log.
export async function decideNew(env, now, maxItems, kv) {
  const stats = { decided: 0, published: 0, held: 0, rejected: 0, errors: 0, usage: {}, writer: WRITER_MODEL };
  if (!env.ANTHROPIC_API_KEY) return stats;
  const nowIso = new Date(now).toISOString();
  const dayStart = nowIso.slice(0, 10) + 'T00:00:00.000Z';
  const spent = (await env.DB.prepare(`SELECT COALESCE(SUM(json_extract(notes, '$.est_cost_usd')), 0) AS usd FROM runs WHERE started_at >= ?`).bind(dayStart).first()).usd || 0;
  if (spent >= DAILY_BUDGET_USD) stats.writer = TRIAGE_MODEL;

  let liveSince = await kv.get(env, 'live_since');
  if (!liveSince) { liveSince = nowIso; await kv.set(env, 'live_since', liveSince); }
  const identityHold = now < Date.parse(liveSince) + IDENTITY_HOLD_DAYS * 86400000;

  const pending = (await env.DB.prepare(`SELECT i.id, i.url, i.title_raw, i.summary_raw, i.category, i.outlet, i.source_published_at, s.name AS source_name, s.priority
    FROM items i LEFT JOIN sources s ON s.id = i.source_id WHERE i.status = 'new' ORDER BY i.source_published_at DESC LIMIT ?`).bind(maxItems).all()).results;
  if (!pending.length) return stats;

  const since = new Date(now - 48 * 3600000).toISOString();
  const recent = (await env.DB.prepare(`SELECT id, headline, title_raw FROM items WHERE status IN ('published','held') AND wp_id IS NULL
    AND COALESCE(published_at, decided_at, fetched_at) > ? ORDER BY COALESCE(published_at, decided_at, fetched_at) DESC LIMIT 600`).bind(since).all()).results
    .map(r => ({ ...r, w: sigWords(r.title_raw + ' ' + r.headline) }));
  const counts = {};
  for (const r of (await env.DB.prepare(`SELECT outlet, COUNT(*) AS n FROM items WHERE status = 'published' AND wp_id IS NULL AND published_at > ? GROUP BY outlet`).bind(new Date(now - 86400000).toISOString()).all()).results) counts[r.outlet] = r.n;

  const save = [];
  const finish = (it, status, fields) => {
    save.push(env.DB.prepare(`UPDATE items SET status = ?, headline = ?, category = ?, confidence = ?, ai_reason = ?, hold_reason = ?, flags = ?, decided_at = ?,
        published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END WHERE id = ? AND status = 'new'`)
      .bind(status, fields.headline || null, fields.category || it.category, fields.confidence ?? null, fields.note || null, fields.reasons || null,
        JSON.stringify(fields.flags || {}), nowIso, status, nowIso, it.id));
    stats.decided++;
    stats[status === 'published' ? 'published' : status === 'held' ? 'held' : 'rejected']++;
  };

  // 0. Repeats caught without AI: the same story, often word for word, from another outlet or a syndicated copy.
  const fresh = [];
  for (const it of pending) {
    const w = sigWords(it.title_raw);
    const hit = recent.find(r => overlap(w, r.w) >= SAME_STORY) || fresh.find(f => overlap(w, f.w) >= SAME_STORY);
    if (hit) finish(it, 'rejected', { note: 'same story as ' + hit.id, flags: { pre_dedupe: true } });
    else fresh.push({ ...it, w });
  }

  for (let b = 0; b < fresh.length; b += TRIAGE_BATCH) {
    const batch = fresh.slice(b, b + TRIAGE_BATCH);

    // 1. Triage. Only recent headlines that share words with this batch are sent for the repeat check.
    const related = recent.filter(r => batch.some(it => { let n = 0; for (const x of it.w) if (r.w.has(x) && ++n >= 2) return true; return false; })).slice(0, 80);
    const triageText = `RECENT CRIMEHER HEADLINES that may cover the same stories (id | headline):\n${related.length ? related.map(r => `${r.id} | ${r.headline}`).join('\n') : '(none)'}\n\nNEW ITEMS:\n\n` +
      batch.map((it, n) => `[${n}] Outlet: ${it.outlet || it.source_name}\nTitle: ${it.title_raw}\nSummary: ${it.summary_raw || '(none)'}\nFeed's usual category: ${it.category}`).join('\n\n');
    let triage;
    try { triage = (await callClaude(env, TRIAGE_MODEL, TRIAGE_PROMPT, TRIAGE_TOOL, triageText, stats.usage)).decisions || []; }
    catch (err) { console.error('triage failed', String(err)); stats.errors++; break; }
    const tByIdx = new Map(triage.map(d => [d.i, d]));

    const toWrite = [];
    for (let n = 0; n < batch.length; n++) {
      const it = batch[n];
      const d = tByIdx.get(n);
      if (!d) continue; // left as 'new'; picked up next run
      const tflags = { fit: d.fit, interest: d.interest, public_service: !!d.public_service, category_unsure: !!d.category_unsure, possible_duplicate: !!d.possible_duplicate,
        unclear_legal_status: !!d.unclear_legal_status, involves_minor: !!d.involves_minor, minor_accused: !!d.minor_accused, child_sexual_abuse: !!d.child_sexual_abuse,
        political: !!d.political, duplicate_of: d.duplicate_of ?? null };
      const category = CATS_ENUM.includes(d.category) ? d.category : it.category;
      if (d.fit === 'no') finish(it, 'rejected', { category, note: d.reject_reason || 'not a fit', flags: tflags });
      else if (Number.isInteger(d.duplicate_of) && related.some(r => r.id === d.duplicate_of)) finish(it, 'rejected', { category, note: 'duplicate of ' + d.duplicate_of, flags: tflags });
      else if (Number.isInteger(d.same_as_item) && d.same_as_item !== n && d.same_as_item >= 0 && d.same_as_item < batch.length) finish(it, 'rejected', { category, note: 'same story as ' + batch[d.same_as_item].id, flags: tflags });
      else if (!(Number(d.interest) >= INTEREST_MIN || d.public_service)) finish(it, 'rejected', { category, note: `below the bar (interest ${d.interest})`, flags: tflags });
      else toWrite.push({ it, d, tflags, category });
    }

    // 2. Headlines, only for stories that made the cut.
    for (let w = 0; w < toWrite.length; w += WRITER_BATCH) {
      const group = toWrite.slice(w, w + WRITER_BATCH);
      const writeText = 'STORIES:\n\n' + group.map((g, n) => `[${n}] Outlet: ${g.it.outlet || g.it.source_name}\nTitle: ${g.it.title_raw}\nSummary: ${g.it.summary_raw || '(none)'}\nCategory: ${g.category}${g.d.involves_minor ? '\nInvolves a minor: yes' : ''}`).join('\n\n');
      let written;
      try { written = (await callClaude(env, stats.writer, WRITER_PROMPT, WRITER_TOOL, writeText, stats.usage, stats.writer !== WRITER_MODEL)).headlines || []; }
      catch (err) { console.error('writer failed', String(err)); stats.errors++; break; }
      const wByIdx = new Map(written.map(h => [h.i, h]));
      for (let n = 0; n < group.length; n++) {
        const { it, d, tflags, category } = group[n];
        const h = wByIdx.get(n);
        if (!h) continue;
        const headline = cleanHeadline(h.headline);
        if (!headline) continue;
        const host = it.outlet || hostOf(it.url);
        const reasons = [];
        if (d.fit === 'unsure') reasons.push('fit unclear');
        if (d.category_unsure) reasons.push('category unclear');
        if (d.possible_duplicate) reasons.push('possible duplicate');
        if (d.unclear_legal_status) reasons.push('legal status unclear');
        if (h.names_minor) reasons.push('headline may name a minor');
        if (d.minor_accused) reasons.push('minor accused');
        if (d.child_sexual_abuse) reasons.push('child sexual abuse');
        if (d.political) reasons.push('political figure or justice policy');
        if (identityHold && h.identity_detail) reasons.push('identity detail (first two weeks)');
        if (it.priority === 'last_resort' || isLastResort(host)) reasons.push('only source is a last-resort outlet');
        if (!(Number(h.confidence) >= CONFIDENCE_FLOOR)) reasons.push('low confidence');
        const flags = { ...tflags, names_minor: !!h.names_minor, identity_detail: !!h.identity_detail,
          options: (Array.isArray(h.options) ? h.options : []).map(cleanHeadline).filter(o => o && o !== headline).slice(0, 3) };
        let status = 'published';
        let note = null;
        if (reasons.length) status = 'held';
        else if ((counts[host] || 0) >= OUTLET_DAILY_CAP) { status = 'rejected'; note = 'outlet cap reached'; }
        finish(it, status, { headline, category, confidence: Number(h.confidence) || 0, note, reasons: reasons.join('; ') || null, flags });
        if (status === 'published') counts[host] = (counts[host] || 0) + 1;
        if (status !== 'rejected') recent.unshift({ id: it.id, headline, w: sigWords(it.title_raw + ' ' + headline) });
      }
    }
  }
  for (let i = 0; i < save.length; i += 50) await env.DB.batch(save.slice(i, i + 50));
  return stats;
}

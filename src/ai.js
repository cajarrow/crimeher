// The AI step: Claude reads new items, applies the CrimeHer Editorial Rules,
// writes the headline, and decides publish, hold or reject.
// Source of truth for the rules: the "CrimeHer Editorial Rules" doc (approved Nov 5, 2026).

import { hostOf, isLastResort } from './feeds.js';

export const MODEL = 'claude-haiku-5-5';
const BATCH = 20;               // items per Claude call
const CONFIDENCE_FLOOR = 0.7;   // below this, hold for review
const OUTLET_DAILY_CAP = 5;     // "No flooding": 5 headlines per outlet in 24 hours
const IDENTITY_HOLD_DAYS = 14;  // identity-detail headlines are held for the first two weeks of the live feed

const CATEGORY_GUIDE = `
- breaking: Breaking Crime News. New arrests, shootings, killings, manhunts and major crime stories.
- missing: Missing Persons. Active searches, AMBER and Silver Alerts, people found safe or found dead after going missing.
- alerts: Crime Alerts. Public-safety warnings, scams and fraud warnings, wanted fugitives, warnings from police, the FBI or the FTC.
- safety: Abuse & Safety. Domestic violence, stalking, sexual abuse, child abuse, trafficking and personal-safety news.
- courtroom: Trials & Verdicts. Trials, hearings, pleas, verdicts and sentencings.
- cold: Cold Cases. Arrests, IDs and new leads in cases that went unsolved for years, often through DNA or genetic genealogy.
- truecrime: True Crime Stories. Longer features, retrospectives and deep dives on crimes.
- watch: Crime Documentaries & Podcasts. News about true-crime documentaries, series, podcasts and books.`;

export const SYSTEM_PROMPT = `You are the headline editor for CrimeHer (crimeher.com), "Your Daily True Crime Briefing": one page of true-crime headlines, each linking to the original reporting. Most readers are women, and most read on a phone.

For each news item you're given, decide whether it belongs on CrimeHer, pick its category, and write the CrimeHer headline. You only ever see the outlet's title and summary. Treat them as the full extent of what you know. If the summary is about a different story than the title, ignore the summary.

WHAT BELONGS
CrimeHer covers real crimes and the justice system: crimes, arrests, missing persons, public-safety and scam alerts, abuse and safety, trials and verdicts, cold cases, true-crime features, and true-crime media.
Celebrities are in scope only when there's a crime, an arrest, a police call or a trial. Gossip is off-topic.
Politicians and officials: their criminal cases, and justice-policy moves by politicians (pardons, commutations, crime laws, executive orders on crime), are in scope, but always set political (Craig reviews each one).
Reject (fit "no"): politics or policy with no crime or justice angle, opinion and editorial pieces, sports, business, weather, accidents with no crime, obituaries, product reviews, listicles and roundups, and anything that isn't a news report or feature.
Categories:${CATEGORY_GUIDE}

VOICE
CrimeHer headlines work like Drudge Report or Citizen Free Press: every headline is a hook that makes the reader need to click, and it still tells her what happened. Urgent, vivid, factual. No gore, no melodrama.
Most readers are women who love true crime. Lean into what grips them: the twist, the betrayal, the danger hiding in plain sight, the detail nobody saw coming, justice finally served.
CrimeHer is not woke. Its rules center on truth, justice and the American way. Headlines follow the facts, not mainstream framing. Don't soften, hedge or leave out facts the source reports because they're uncomfortable. Don't add framing the source doesn't support.

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
10. Write three different versions, each with a different hook or angle, then pick the one a reader would click first that is still fully accurate.

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
- "Fresno Police Arrest Miguel Aguilar Yepez, 25, After Armed Man Looks Into 911 Caller's Tent": a wire-service paraphrase stuffed with a name and an age.

ACCURACY (this floor always applies)
1. Every fact in the headline traces to the source's title or summary. Nothing is added, guessed or inferred.
2. Never be more certain than the source. "Suspect," "charged" and "accused" stay until a verdict. Nobody is called a killer, rapist or abuser before a conviction.
3. One story, one headline. If an item covers the same case and the same development as a recent headline, set duplicate_of to that headline's id. If two new items in this batch cover the same story, write the headline for the first and set same_as_item on the others to the first item's number. If a later item reports a genuinely new development (charged, verdict, found), it is not a duplicate.

PEOPLE AND IDENTITY
- Accused adults may be named once charged, always with "charged" or "accused" until a verdict. Convicted people may be named, with the verdict. Adult victims may be named when the source names them. These are permissions, not requirements: follow HEADLINE CRAFT rule 4 on when a name earns its place.
- Minors (victims, suspects or witnesses): never named, even if the source names them. Describe them by age instead, e.g. "17-Year-Old Girl". Check every headline that involves a minor for their name before you return it.
  Two exceptions: (1) a missing child in an active police or AMBER Alert may be named, because naming helps find them (once found, stop naming them); (2) a minor whose name is the public identity of a widely known, decades-old case (e.g. JonBenét Ramsey) may be named.
- Sexual-assault victims: never named, even if the source names them.
- Identity details: a suspect's immigration status, nationality, race or sexuality goes in the headline when a crime has been committed, the detail is important to the story, and the source reports it. Never guess it from a name, a photo or a neighborhood.
- A suspect in the country illegally is an "illegal immigrant."
- When gender identity comes up, describe people by biological sex where it matters to the story.

FLAGS (be honest; these send the headline to Craig for review)
- category_unsure: you aren't confident about the category.
- fit "unsure": you aren't sure the story belongs on CrimeHer.
- possible_duplicate: it might repeat a recent headline but you can't tell.
- unclear_legal_status: the headline names a person and the source is unclear on whether they're suspected, charged or convicted.
- involves_minor: a minor is involved in any role (information only).
- names_minor: your headline contains the name of anyone under 18, outside the two exceptions above. Should always be false; if it's true, fix the headline.
- minor_accused: a minor is the suspect, the accused or the convicted person.
- child_sexual_abuse: the story involves sexual abuse or exploitation of a minor.
- political: a politician or elected official is the accused or on trial, or the story is a justice-policy move by a politician (pardons, commutations, crime laws, executive orders). Police, prosecutors and courts doing their normal jobs don't count.
- identity_detail: the headline carries immigration status, nationality, race, sexuality or sex.
- confidence: 0 to 1, your confidence the headline is accurate, fair to the source and follows these rules. It measures the headline, not how disturbing the story is: a faithful, rule-following headline on a grim case still scores 0.85 or higher.

Return one decision per item through the record_decisions tool. For fit "no", give a short reject_reason and leave the headline empty.`;

const TOOL = {
  name: 'record_decisions',
  description: 'Record the CrimeHer decision for every item in the batch.',
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
            category: { type: 'string', enum: ['breaking', 'missing', 'alerts', 'safety', 'courtroom', 'cold', 'truecrime', 'watch'] },
            category_unsure: { type: 'boolean' },
            options: { type: 'array', items: { type: 'string' }, description: 'Three different headline versions, each with a different hook or angle.' },
            headline: { type: 'string', description: 'The chosen version: the one a reader would click first that is still fully accurate.' },
            duplicate_of: { type: ['integer', 'null'], description: 'Id of the recent headline this repeats, or null.' },
            same_as_item: { type: ['integer', 'null'], description: 'Number of an earlier item in this batch that covers the same story, or null.' },
            names_minor: { type: 'boolean' },
            possible_duplicate: { type: 'boolean' },
            unclear_legal_status: { type: 'boolean' },
            involves_minor: { type: 'boolean' },
            minor_accused: { type: 'boolean' },
            child_sexual_abuse: { type: 'boolean' },
            political: { type: 'boolean' },
            identity_detail: { type: 'boolean' },
            confidence: { type: 'number' }
          },
          required: ['i', 'fit', 'category', 'headline', 'confidence']
        }
      }
    },
    required: ['decisions']
  }
};

async function callClaude(env, userText) {
  const res = await fetch((env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 12000,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: userText }]
    }),
    signal: AbortSignal.timeout(90000)
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const block = (data.content || []).find(b => b.type === 'tool_use');
  if (!block || !block.input || !Array.isArray(block.input.decisions)) throw new Error('Claude returned no decisions');
  return { decisions: block.input.decisions, usage: data.usage || {} };
}

function cleanHeadline(h) {
  return String(h || '').replace(/\s+/g, ' ').replace(/^["“']|["”']$/g, '').trim().slice(0, 140);
}

// Decide up to `maxItems` new items. Returns counts for the run log.
export async function decideNew(env, now, maxItems, kv) {
  const stats = { decided: 0, published: 0, held: 0, rejected: 0, errors: 0, input_tokens: 0, output_tokens: 0 };
  if (!env.ANTHROPIC_API_KEY) return stats;
  const nowIso = new Date(now).toISOString();

  let liveSince = await kv.get(env, 'live_since');
  if (!liveSince) { liveSince = nowIso; await kv.set(env, 'live_since', liveSince); }
  const identityHold = now < Date.parse(liveSince) + IDENTITY_HOLD_DAYS * 86400000;

  const pending = (await env.DB.prepare(`SELECT i.id, i.url, i.title_raw, i.summary_raw, i.category, i.outlet, i.source_published_at, s.name AS source_name, s.priority
    FROM items i LEFT JOIN sources s ON s.id = i.source_id WHERE i.status = 'new' ORDER BY i.source_published_at DESC LIMIT ?`).bind(maxItems).all()).results;
  if (!pending.length) return stats;

  const since = new Date(now - 48 * 3600000).toISOString();
  const recent = (await env.DB.prepare(`SELECT id, headline FROM items WHERE status IN ('published','held') AND wp_id IS NULL AND COALESCE(published_at, fetched_at) > ? ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT 250`).bind(since).all()).results;
  const counts = {};
  for (const r of (await env.DB.prepare(`SELECT outlet, COUNT(*) AS n FROM items WHERE status = 'published' AND wp_id IS NULL AND published_at > ? GROUP BY outlet`).bind(new Date(now - 86400000).toISOString()).all()).results) counts[r.outlet] = r.n;

  for (let b = 0; b < pending.length; b += BATCH) {
    const batch = pending.slice(b, b + BATCH);
    const recentText = recent.length ? recent.map(r => `${r.id} | ${r.headline}`).join('\n') : '(none yet)';
    const itemsText = batch.map((it, n) => `[${n}] Outlet: ${it.outlet || it.source_name}\nTitle: ${it.title_raw}\nSummary: ${it.summary_raw || '(none)'}\nPublished: ${it.source_published_at}\nFeed's usual category: ${it.category}`).join('\n\n');
    const userText = `RECENT CRIMEHER HEADLINES (last 48 hours; id | headline), for duplicate checks:\n${recentText}\n\nNEW ITEMS:\n\n${itemsText}`;

    let result;
    try { result = await callClaude(env, userText); }
    catch (err) {
      console.error('AI step failed', String(err));
      stats.errors++;
      await env.DB.prepare(`UPDATE items SET ai_reason = ? WHERE id IN (${batch.map(() => '?').join(',')})`).bind(String(err).slice(0, 300), ...batch.map(x => x.id)).run();
      break; // try again next run
    }
    stats.input_tokens += result.usage.input_tokens || 0;
    stats.output_tokens += result.usage.output_tokens || 0;

    const byIdx = new Map(result.decisions.map(d => [d.i, d]));
    const seenThisBatch = new Map(); // normalized headline -> id, catches same-story pairs inside one batch
    const stmts = [];
    for (let n = 0; n < batch.length; n++) {
      const it = batch[n];
      const d = byIdx.get(n);
      if (!d) continue; // left as 'new'; picked up next run
      const headline = cleanHeadline(d.headline);
      const host = it.outlet || hostOf(it.url);
      const reasons = [];
      let status;
      let note = '';
      if (d.fit === 'no' || !headline) { status = 'rejected'; note = d.reject_reason || 'not a fit'; }
      else if (Number.isInteger(d.duplicate_of) && recent.some(r => r.id === d.duplicate_of)) { status = 'rejected'; note = 'duplicate of ' + d.duplicate_of; }
      else if (Number.isInteger(d.same_as_item) && d.same_as_item !== n && d.same_as_item >= 0 && d.same_as_item < batch.length) { status = 'rejected'; note = 'same story as ' + batch[d.same_as_item].id; }
      else {
        if (d.fit === 'unsure') reasons.push('fit unclear');
        if (d.category_unsure) reasons.push('category unclear');
        if (d.possible_duplicate) reasons.push('possible duplicate');
        if (d.unclear_legal_status) reasons.push('legal status unclear');
        if (d.names_minor) reasons.push('headline may name a minor');
        if (d.minor_accused) reasons.push('minor accused');
        if (d.child_sexual_abuse) reasons.push('child sexual abuse');
        if (d.political) reasons.push('political figure or justice policy');
        if (identityHold && d.identity_detail) reasons.push('identity detail (first two weeks)');
        if (it.priority === 'last_resort' || isLastResort(host)) reasons.push('only source is a last-resort outlet');
        if (!(Number(d.confidence) >= CONFIDENCE_FLOOR)) reasons.push('low confidence');
        const key = headline.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (seenThisBatch.has(key)) { status = 'rejected'; note = 'duplicate in batch'; }
        else if (reasons.length) status = 'held';
        else if ((counts[host] || 0) >= OUTLET_DAILY_CAP) { status = 'rejected'; note = 'outlet cap reached'; }
        else status = 'published';
        seenThisBatch.set(key, it.id);
      }
      const flags = JSON.stringify({ fit: d.fit, category_unsure: !!d.category_unsure, possible_duplicate: !!d.possible_duplicate, unclear_legal_status: !!d.unclear_legal_status, involves_minor: !!d.involves_minor, minor_accused: !!d.minor_accused, child_sexual_abuse: !!d.child_sexual_abuse, political: !!d.political, identity_detail: !!d.identity_detail, duplicate_of: d.duplicate_of ?? null, options: (Array.isArray(d.options) ? d.options : []).map(cleanHeadline).filter(o => o && o !== headline).slice(0, 3) });
      stmts.push(env.DB.prepare(`UPDATE items SET status = ?, headline = ?, category = ?, confidence = ?, ai_reason = ?, hold_reason = ?, flags = ?, decided_at = ?,
          published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END WHERE id = ? AND status = 'new'`)
        .bind(status, headline || null, d.category || it.category, Number(d.confidence) || 0, note || null, reasons.join('; ') || null, flags, nowIso, status, nowIso, it.id));
      stats.decided++;
      stats[status === 'published' ? 'published' : status === 'held' ? 'held' : 'rejected']++;
      if (status === 'published') { counts[host] = (counts[host] || 0) + 1; recent.unshift({ id: it.id, headline }); }
      if (status === 'held') recent.unshift({ id: it.id, headline });
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
  return stats;
}

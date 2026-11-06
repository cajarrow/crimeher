// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanHeadline, sigWords, overlap, estimateCost, TRIAGE_MODEL, WRITER_MODEL, articleExcerpt, copiedShare } from '../src/ai.js';
import { pageMeta, slugTitle } from '../src/ai.js';

test('a leading quote survives; wrapping quotes go', () => {
  assert.equal(cleanHeadline("'Started on Valentine's Day': Ex-Deputy Accused"), "'Started on Valentine's Day': Ex-Deputy Accused");
  assert.equal(cleanHeadline('"Mom Charged in Vegas Trip Case"'), 'Mom Charged in Vegas Trip Case');
  assert.equal(cleanHeadline('"Fake CEOs, Real Money": Feds Charge "Trio"'), '"Fake CEOs, Real Money": Feds Charge "Trio"');
});

test('syndicated copies of one story match; different stories with crime words do not', () => {
  const a = sigWords('Florida executes Jesse Guardado for 2004 killing of Jackie Malone');
  const b = sigWords('Jesse Guardado executed in Florida for murder of Jackie Malone');
  assert.ok(overlap(a, b) >= 0.6);
  const c = sigWords('Man charged in Ohio murder after shooting');
  const d = sigWords('Woman charged in Ohio murder after shooting');
  assert.equal(overlap(c, d), 0);
  const e = sigWords('Teen missing from Tulsa found safe');
  const f = sigWords('Teen missing from Augusta found dead');
  assert.equal(overlap(e, f), 0);
});

test('cost estimate uses both models', () => {
  const usd = estimateCost({ [TRIAGE_MODEL]: { in: 1e6, out: 0, cache_read: 0, cache_write: 0 }, [WRITER_MODEL]: { in: 0, out: 1e5, cache_read: 0, cache_write: 0 } });
  assert.equal(usd, 1.1);
});

test('article excerpt keeps the story and drops page clutter', () => {
  const html = `<html><head><meta property="og:description" content="Police say the couple hid the body for a year."><script>var x = '<p>not this</p>';</script></head>
    <body><nav><p>Home | News | Sports and weather and more links here for the menu</p></nav>
    <p>The man's body was found under an air mattress in the couple's apartment, investigators said Thursday.</p>
    <p>Subscribe to our newsletter for the latest headlines delivered every morning to your inbox.</p>
    <p>Short.</p><footer><p>Copyright 2026 Example News, all rights reserved, every single one of them.</p></footer></body></html>`;
  const ex = articleExcerpt(html);
  assert.ok(ex.startsWith('Police say the couple hid the body for a year.'));
  assert.ok(ex.includes('under an air mattress'));
  assert.ok(!/Subscribe|Copyright|not this|Home \|/.test(ex));
});

test('copied share flags near-copies of the outlet headline', () => {
  const t = 'Vince Neil’s Girlfriend Arrested on Domestic Assault Charge';
  assert.ok(copiedShare(t, "Vince Neil's Girlfriend Arrested in Tennessee After Alleged Domestic Fight") >= 0.5);
  assert.ok(copiedShare(t, "Vince Neil's Girlfriend Arrested on Domestic Assault Charge in Tennessee") >= 0.75);
  assert.ok(copiedShare(t, "Mötley Crüe Singer's Girlfriend Arrested After Alleged Argument, Property Damage") <= 0.55);
});

test('page meta: og tags in either order, apostrophes kept, site name dropped', () => {
  const html = `<title>Teen held | WRAL.com</title><meta content="She's gone, cops say" property="og:description">
    <meta property="og:title" content="Teen Held in School Plot | WRAL.com"><meta property="article:published_time" content="2026-11-06T08:00:00Z">`;
  const m = pageMeta(html);
  assert.equal(m.title, 'Teen Held in School Plot');
  assert.equal(m.description, "She's gone, cops say");
  assert.equal(m.published, '2026-11-06T08:00:00.000Z');
});

test('a blocked page still gives the AI words from its link', () => {
  assert.equal(slugTitle('https://www.wral.com/story/teen-accused-of-plotting-school-attack/21712345/'), 'teen accused of plotting school attack');
  assert.equal(slugTitle('https://x.com/a/12345'), '');
});

test('hour-long cache writes are priced at 2x', () => {
  const u = { [WRITER_MODEL]: { in: 0, out: 0, cache_read: 0, cache_write: 1000000, cache_write_1h: 1000000 } };
  assert.equal(estimateCost(u), 4);
});

test('top story time left reads naturally', async () => {
  const { timeLeft } = await import('../src/top.js');
  const now = Date.parse('2026-11-06T10:00:00Z');
  assert.equal(timeLeft('2026-11-06T16:00:00Z', now), '6h left');
  assert.equal(timeLeft('2026-11-06T11:47:00Z', now), '1h 47m left');
  assert.equal(timeLeft('2026-11-06T10:20:00Z', now), '20m left');
});

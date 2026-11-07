import test from 'node:test';
import assert from 'node:assert/strict';
import { headlineHash, cardKey, outletName, cardHtml } from '../src/cards.js';

test('card key changes when the headline is edited', () => {
  const a = { id: 7, headline: 'Judge Rejects Plea Deal' };
  assert.equal(cardKey(a, 'og'), cardKey({ ...a }, 'og'));
  assert.notEqual(cardKey(a, 'og'), cardKey({ ...a, headline: 'Judge Sides With Family' }, 'og'));
  assert.notEqual(cardKey(a, 'og'), cardKey(a, 'post'));
  assert.match(headlineHash('x'), /^[0-9a-z]+$/);
});

test('outlet names are bare domains', () => {
  assert.equal(outletName('https://www.courttv.com/news/x'), 'courttv.com');
  assert.equal(outletName('people.com'), 'people.com');
});

test('card HTML escapes the headline and shows the outlet', () => {
  const h = cardHtml({ id: 1, headline: 'A <b>bold</b> "claim"', category: 'courtroom', outlet: 'www.courttv.com' }, 'Courtroom', 'og');
  assert.ok(h.includes('A &lt;b&gt;bold&lt;/b&gt; &quot;claim&quot;'));
  assert.ok(h.includes('via courttv.com'));
  assert.ok(h.includes('width:1200px'));
});

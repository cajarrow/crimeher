// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanHeadline, sigWords, overlap, estimateCost, TRIAGE_MODEL, WRITER_MODEL } from '../src/ai.js';

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

// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, cleanUrl, hostOf, isLastResort, plain } from '../src/feeds.js';

test('RSS 2.0 with CDATA, escaped HTML and tracking params', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>
    <item><title><![CDATA[Suspect Charged in Ohio Killing &amp; Robbery]]></title>
      <link>https://www.example.com/news/story-1/?utm_source=rss&amp;utm_medium=feed&amp;id=7#top</link>
      <description>&lt;p&gt;Police say the &lt;b&gt;suspect&lt;/b&gt; was arrested.&lt;/p&gt;</description>
      <pubDate>Thu, 05 Nov 2026 18:30:00 GMT</pubDate><guid isPermaLink="false">abc-1</guid></item>
    <item><title>No link item</title></item>
  </channel></rss>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Suspect Charged in Ohio Killing & Robbery');
  assert.equal(items[0].url, 'https://www.example.com/news/story-1/?id=7');
  assert.equal(items[0].summary, 'Police say the suspect was arrested.');
  assert.equal(items[0].published, '2026-11-05T18:30:00.000Z');
  assert.equal(items[0].guid, 'abc-1');
});

test('Atom with alternate link', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Y</title>
    <entry><title type="html">Missing Woman Found Safe</title>
      <link rel="self" href="https://example.org/self"/><link rel="alternate" type="text/html" href="https://example.org/a/2"/>
      <id>tag:example.org,2026:2</id><updated>2026-11-05T12:00:00Z</updated><summary>She was found.</summary></entry></feed>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://example.org/a/2');
  assert.equal(items[0].published, '2026-11-05T12:00:00.000Z');
});

test('Bing News links decode to the original article', () => {
  const xml = `<rss><channel><item><title>Amber Alert Issued</title>
    <link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;tid=1&amp;url=https%3a%2f%2fwww.wsvn.com%2fnews%2falert-1%2f&amp;c=123&amp;mkt=en-us</link>
    <pubDate>Thu, 05 Nov 2026 20:00:00 GMT</pubDate></item></channel></rss>`;
  const items = parseFeed(xml);
  assert.equal(items[0].url, 'https://www.wsvn.com/news/alert-1/');
  assert.equal(hostOf(items[0].url), 'wsvn.com');
});

test('feedburner origLink wins over the feedburner link', () => {
  const xml = `<rss><channel><item><title>T</title><link>https://feeds.feedburner.com/x/abc</link>
    <feedburner:origLink>https://real.example.com/story</feedburner:origLink></item></channel></rss>`;
  assert.equal(parseFeed(xml)[0].url, 'https://real.example.com/story');
});

test('last-resort outlets match by host', () => {
  assert.equal(isLastResort('cnn.com'), true);
  assert.equal(isLastResort('edition.cnn.com'), true);
  assert.equal(isLastResort('huffpost.com'), true);
  assert.equal(isLastResort('ms.now'), true);
  assert.equal(isLastResort('foxnews.com'), false);
  assert.equal(isLastResort('notcnn.com'), false);
});

test('bad URLs are dropped and text is cleaned', () => {
  assert.equal(cleanUrl('javascript:alert(1)'), null);
  assert.equal(cleanUrl('not a url'), null);
  assert.equal(plain('A&nbsp;&amp;&nbsp;B', 0), 'A & B');
  assert.equal(plain('x'.repeat(20), 10).length, 10);
});

// CrimeHer feed list.
//
// Every candidate is checked automatically. A feed that fails 6 checks in a row
// turns itself off, and /status shows which feeds work and how much each yields.
//
// category: the usual home for this feed's stories. The AI makes the final call.
// broad: a general-news feed. Its items must pass the crime keyword filter before
//        they reach the AI.
// lastResort: an outlet on the Editorial Rules last-resort list (HuffPost, CNN, MS NOW).
//
// Bump SOURCES_VERSION after editing this list, so the next run syncs it to the database.

export const SOURCES_VERSION = '2026-11-06.2';

// Hostnames on the last-resort list. Matched against the article's own host.
export const LAST_RESORT_HOSTS = ['huffpost.com', 'huffingtonpost.com', 'cnn.com', 'ms.now', 'msnbc.com'];

const B = 'breaking', M = 'missing', A = 'alerts', S = 'safety', C = 'courtroom', K = 'cold', T = 'truecrime', W = 'watch';

// Bing News search lanes: targeted queries, newest first. Links are decoded to the original article.
const bing = q => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&qft=sortbydate%3d%221%22&format=rss&mkt=en-US`;
// Some publishers block requests from cloud servers (their feeds answer 403) or keep empty crime feeds.
// For those, a Bing News search limited to their own site (`site:`) returns their headlines and links instead.

// [id, name, feed URL, category, options]
const LIST = [
  // National crime desks
  ['nypost-crime', 'New York Post: Crime', 'https://nypost.com/tag/crime/feed/', B],
  ['nypost-us', 'New York Post: US News', 'https://nypost.com/us-news/feed/', B, { broad: true }],
  ['fox-us', 'Fox News: US', 'https://moxie.foxnews.com/google-publisher/us.xml', B, { broad: true }],
  ['cbs-crime', 'CBS News: Crime', 'https://www.cbsnews.com/latest/rss/crime', B],
  ['cbs-us', 'CBS News: US', 'https://www.cbsnews.com/latest/rss/us', B, { broad: true }],
  ['nbc-us', 'NBC News: US', 'https://feeds.nbcnews.com/feeds/usnews', B, { broad: true }],
  ['abc-us', 'ABC News: US', 'https://abcnews.go.com/abcnews/usheadlines', B, { broad: true }],
  ['dailymail-us', 'Daily Mail: US', 'https://www.dailymail.co.uk/ushome/index.rss', B, { broad: true }],
  ['crimeonline', 'CrimeOnline', 'https://www.crimeonline.com/feed/', B],
  ['newser-crime', 'Newser: Crime', 'http://rss.newser.com/rss/section/13.rss', B],
  ['truecrimenews', 'TrueCrimeNews', 'https://feeds.truecrimenews.com/rss/', B],
  ['nydailynews-crime', 'New York Daily News: Crime', bing('site:nydailynews.com police'), B],
  ['independent-crime', 'The Independent: US Crime', 'https://www.independent.co.uk/news/world/americas/crime/rss', B],
  ['people-crime', 'People: Crime', 'https://feeds-api.dotdashmeredith.com/v1/rss/google/064f3cfe-b926-4016-913d-281e51754562', T],
  ['usmagazine-crime', 'Us Weekly: Crime', 'https://www.usmagazine.com/category/celebrity-news/crime/feed/', B],
  ['radar-truecrime', 'Radar Online: True Crime', 'https://radaronline.com/true-crime/rss/', B],
  ['guardian-ukcrime', 'The Guardian: UK Crime', 'https://www.theguardian.com/uk/ukcrime/rss', B],
  ['huffpost-crime', 'HuffPost: Crime', 'https://www.huffpost.com/section/crime/feed', B, { lastResort: true }],
  ['cnn-us', 'CNN: US', 'http://rss.cnn.com/rss/cnn_us.rss', B, { broad: true, lastResort: true }],

  // Local TV and newspaper crime desks
  ['fox5ny-crime', 'FOX 5 New York: Crime', 'https://www.fox5ny.com/rss.xml?tag=crime-publicsafety', B],
  ['fox5atl-crime', 'FOX 5 Atlanta: Crime', 'https://www.fox5atlanta.com/rss.xml?tag=crime-publicsafety', B],
  ['fox32-crime', 'FOX 32 Chicago: Crime', 'https://www.fox32chicago.com/rss.xml?tag=crime-publicsafety', B],
  ['foxla-crime', 'FOX 11 Los Angeles: Crime', 'https://www.foxla.com/rss.xml?tag=crime-publicsafety', B],
  ['fox13-crime', 'FOX 13 Tampa Bay: Crime', 'https://www.fox13news.com/rss.xml?tag=crime-publicsafety', B],
  ['fox26-crime', 'FOX 26 Houston: Crime', 'https://www.fox26houston.com/rss.xml?tag=crime-publicsafety', B],
  ['fox4-crime', 'FOX 4 Dallas: Crime', 'https://www.fox4news.com/rss.xml?tag=crime-publicsafety', B],
  ['fox35-crime', 'FOX 35 Orlando: Crime', 'https://www.fox35orlando.com/rss.xml?tag=crime-publicsafety', B],
  ['fox10-crime', 'FOX 10 Phoenix: Crime', 'https://www.fox10phoenix.com/rss.xml?tag=crime-publicsafety', B],
  ['cbsny-crime', 'CBS New York: Crime', 'https://www.cbsnews.com/newyork/latest/rss/crime', B],
  ['nbcct-crime', 'NBC Connecticut: Crime & Courts', bing('site:nbcconnecticut.com police'), B],
  ['nbcphilly-crime', 'NBC10 Philadelphia: Crime & Courts', bing('site:nbcphiladelphia.com police'), B],
  ['kfor-crime', 'KFOR Oklahoma City: Crime', bing('site:kfor.com police'), B],
  ['ktla-crime', 'KTLA Los Angeles: Crime', bing('site:ktla.com police'), B],
  ['pix11-crime', 'PIX11 New York: Crime', 'https://pix11.com/news/crime/feed/', B],
  ['wgn-crime', 'WGN Chicago: Crime', 'https://wgntv.com/news/chicagocrime/feed/', B],
  ['kseecrime', 'Your Central Valley: Crime', 'https://www.yourcentralvalley.com/news/crime/feed/', B],
  ['baltsun-crime', 'Baltimore Sun: Crime', bing('site:baltimoresun.com police'), B],
  ['pilot-crime', 'The Virginian-Pilot: Crime', bing('site:pilotonline.com police'), B],
  ['orlsent-crime', 'Orlando Sentinel: Crime', bing('site:orlandosentinel.com police'), B],
  ['sunsent-crime', 'South Florida Sun Sentinel: Crime', bing('site:sun-sentinel.com police'), B],
  ['denverpost-crime', 'Denver Post: Crime & Courts', bing('site:denverpost.com police'), B],
  ['sbsun-crime', 'San Bernardino Sun: Crime', bing('site:sbsun.com police'), B],
  ['mynewsla', 'MyNewsLA: Crime', 'https://mynewsla.com/category/crime/feed/', B],

  // Courtroom
  ['courttv', 'Court TV', 'https://www.courttv.com/feed/', C],
  ['lawandcrime', 'Law&Crime', 'https://lawandcrime.com/feed/', C],
  ['courttv', 'Court TV', 'https://www.courttv.com/feed/', C],
  ['courthousenews', 'Courthouse News', 'https://www.courthousenews.com/feed/', C, { broad: true }],
  ['doj-press', 'U.S. Justice Department: Press Releases', 'https://www.justice.gov/news/rss?type=press_release&m=1', C],
  ['bing-verdict', 'News search: murder verdicts', bing('jury verdict murder trial'), C],
  ['bing-sentenced', 'News search: sentencings', bing('sentenced murder'), C],

  // Missing persons
  ['charley-project', 'The Charley Project: Missing Person of the Week', 'https://charleyross.wordpress.com/feed/', M],
  ['fox5atl-missing', 'FOX 5 Atlanta: Missing', 'https://www.fox5atlanta.com/rss.xml?tag=missing-persons', M],
  ['fox5ny-missing', 'FOX 5 New York: Missing', 'https://www.fox5ny.com/rss.xml?tag=missing-persons', M],
  ['nbcny-missing', 'NBC New York: Missing', 'https://www.nbcnewyork.com/tag/missing-person/feed/', M],
  ['nbcbay-missing', 'NBC Bay Area: Missing', 'https://www.nbcbayarea.com/tag/missing-persons/feed/', M],
  ['nbcdfw-missing', 'NBC DFW: Missing', 'https://www.nbcdfw.com/tag/missing-persons/feed/', M],
  ['nbcmiami-missing', 'NBC 6 Miami: Missing', 'https://www.nbcmiami.com/tag/missing-persons/feed/', M],
  ['nbcboston-missing', 'NBC Boston: Missing', 'https://www.nbcboston.com/tag/missing-persons/feed/', M],
  ['nbcsd-missing', 'NBC 7 San Diego: Missing', 'https://www.nbcsandiego.com/tag/missing-persons/feed/', M],
  ['fbi-wanted', 'FBI: Wanted and Missing', 'https://www.fbi.gov/feeds/all-wanted/RSS', M],
  ['bing-missing-woman', 'News search: missing women', bing('missing woman police search'), M],
  ['bing-amber', 'News search: AMBER Alerts', bing('Amber Alert issued'), M],
  ['bing-found-safe', 'News search: found safe', bing('missing person found safe'), M],

  // Alerts
  ['fbi-national', 'FBI: National Press Releases', 'https://www.fbi.gov/feeds/national-press-releases/RSS', A],
  ['ic3-psa', 'FBI IC3: Public Service Announcements', 'https://www.ic3.gov/PSA/RSS', A],
  ['ftc-consumer', 'FTC: Consumer Alerts', 'https://consumer.ftc.gov/blog/gd-rss.xml', A],
  ['nbcmiami-scams', 'NBC 6 Miami: Scams', 'https://www.nbcmiami.com/tag/scams/feed/', A],
  ['ca-oag', 'California Attorney General: News', 'https://oag.ca.gov/news/feed', A, { broad: true }],
  ['bing-police-warn', 'News search: police warnings', bing('police warn residents scam'), A],

  // Abuse & Safety
  ['nbcwash-dv', 'NBC Washington: Domestic Violence', 'https://www.nbcwashington.com/news/local/domestic-violence-awareness/feed/', S],
  ['bing-dv', 'News search: domestic violence arrests', bing('domestic violence arrested charged'), S],
  ['bing-stalking', 'News search: stalking charges', bing('stalking charged woman'), S],

  // Cold Cases
  ['defrosting', 'Defrosting Cold Cases', bing('site:defrostingcoldcases.com'), K],
  ['projectcoldcase', 'Project Cold Case', 'https://projectcoldcase.org/feed/', K],
  ['kosu-coldcase', 'KOSU: Cold Cases', bing('site:kosu.org cold case'), K],
  ['bing-coldcase', 'News search: cold-case arrests', bing('cold case arrest'), K],
  ['bing-genealogy', 'News search: DNA genealogy IDs', bing('genetic genealogy identified decades'), K],

  // True Crime
  ['oxygen', 'Oxygen: Crime News', 'https://www.oxygen.com/feeds/crime-news', T],
  ['crimeonline', 'CrimeOnline', 'https://www.crimeonline.com/feed/', T],
  ['oxygen', 'Oxygen: Crime News', 'https://www.oxygen.com/feeds/crime-news', T],
  ['crimereads', 'CrimeReads', 'https://crimereads.com/feed/', T],
  ['unilad-truecrime', 'UNILAD: True Crime', 'https://www.unilad.com/true-crime.rss', T],
  ['morbidology', 'Morbidology', 'https://morbidology.com/feed/', T],
  ['cbs-48hours', 'CBS News: 48 Hours', 'https://www.cbsnews.com/latest/rss/48-hours', T],

  // Watch & Listen
  ['dateline-pod', 'Dateline NBC (podcast)', 'https://podcastfeeds.nbcnews.com/HL4TzgYC', W],
  ['crimejunkie', 'Crime Junkie (podcast)', 'https://feeds.simplecast.com/qm_9xx0g', W],
  ['decider-truecrime', 'Decider: True Crime', 'https://decider.com/tag/true-crime/feed/', W],
  ['bing-doc', 'News search: true-crime documentaries', bing('true crime documentary'), W],
  ['bing-podcast', 'News search: true-crime podcasts', bing('true crime podcast'), W]
];

export const SOURCES = LIST.map(([id, name, feed_url, category, o = {}]) => ({
  id, name, feed_url, category,
  broad: o.broad ? 1 : 0,
  priority: o.lastResort ? 'last_resort' : 'normal'
}));

// Push the list into the database when SOURCES_VERSION changes. Keeps each feed's
// health history; feeds removed from the list are turned off, not deleted.
export async function syncSources(env, getKV, setKV) {
  if ((await getKV(env, 'sources_version')) === SOURCES_VERSION) return false;
  const up = env.DB.prepare(`INSERT INTO sources (id, name, feed_url, category, broad, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, feed_url = excluded.feed_url, category = excluded.category,
      broad = excluded.broad, priority = excluded.priority,
      enabled = CASE WHEN sources.feed_url = excluded.feed_url THEN sources.enabled ELSE 1 END,
      fail_count = CASE WHEN sources.feed_url = excluded.feed_url THEN sources.fail_count ELSE 0 END`);
  const stmts = SOURCES.map(s => up.bind(s.id, s.name, s.feed_url, s.category, s.broad, s.priority));
  const ids = SOURCES.map(s => s.id);
  stmts.push(env.DB.prepare(`UPDATE sources SET enabled = 0 WHERE id NOT IN (${ids.map(() => '?').join(',')})`).bind(...ids));
  await env.DB.batch(stmts);
  await setKV(env, 'sources_version', SOURCES_VERSION);
  return true;
}

# crimeher

CrimeHer. Your True Crime Daily Briefing.

CrimeHer is a single page of true-crime headlines for a mostly female, mostly mobile audience, in the style of Drudge Report and Citizen Free Press. Each headline links to the original reporting, and readers come back through the day for new ones.

- **Preview:** https://crimeher.craig-d0d.workers.dev (hidden from search engines)
- **Production:** https://crimeher.com (still the old WordPress site until cutover)

## How it works

One Cloudflare Worker and one D1 database. There's no build step and no framework.

| Part | What it does |
|---|---|
| `src/worker.js` | Serves the front page, eight category pages, the `/go/<id>` click-out, old-URL redirects, `robots.txt`, `sitemap.xml`, `llms.txt` and `/status`. Runs the cron job. |
| `src/sources.js` | The feed list. Bump `SOURCES_VERSION` after editing it, so the next run syncs it to the database. |
| `src/feeds.js` | Checks due feeds (each about every 15 minutes), parses RSS and Atom, and stores new items. Items older than 24 hours are stored as `stale`. General-news feeds must pass a crime keyword filter. A feed that fails 6 checks in a row turns itself off. |
| `src/ai.js` | The AI step, in two passes: `claude-haiku-5-5` triages (fit, category, interest 0–10, repeats, review flags), then `claude-sonnet-5-5` writes three hook-first headlines from the feed item and the article's opening. The code enforces the hold rules, the 5-per-outlet daily cap, the last-resort list and a daily cost guard. `addByUrl` handles stories Craig adds from the desk. |
| `src/desk.js` | The review desk at `/desk` (Cloudflare Access): Waiting, Live and Stats, plus `/desk/act` (publish, reject, save, pull, undo) and `/desk/add` (paste a link; the AI writes the headlines and the card waits for Craig). `/desk?add=<link>` does the same from a shortcut or bookmarklet. |
| `src/theme.js` | Category colors, shared by the site and the desk. |
| `src/top.js` | The front page's Top story: Craig's pin (2, 6 or 12 hours, set on the desk), else an automatic pick chosen each minute by the cron job (the highest-interest story of the last 2 hours, held at least an hour; a story 2+ points stronger takes over early), else the newest Breaking headline. |
| `src/kv.js` | Small settings store in D1 (`kv` table). |
| `src/icons.js` | Favicon, home-screen icons and the web manifest. Generated from `design/`. |
| `migrations/` | D1 schema. Migrations 0001–0004 were applied through the Cloudflare API on Nov 5, 2026, so Wrangler's migration table doesn't list them. Don't re-run them. |
| `test/` | Parser tests: `npm test`. |
| `wrangler.jsonc` | Worker name, D1 binding `DB`, cron schedule. |
| `data/` | Reference data: the Feedly export from Nov 5, 2026. |

### The cron job (every minute)

- Even minutes, until the archive is done: resolve old WordPress posts to their original articles.
- Otherwise: sync the feed list, check up to 30 due feeds, and send up to 40 new items to Claude.
- Without the `ANTHROPIC_API_KEY` secret, feeds are still checked and items collected, but nothing is decided.

Item statuses: `new` (waiting for the AI) · `published` · `held` (waiting for Craig) · `rejected` · `stale` (too old) · `skipped` (failed the keyword filter) · `expired` (held more than 24 hours without review).

## Categories

The on-screen names are short. The URLs, titles and H1s use the full words for SEO, and the old WordPress slugs are kept.

| On screen | Full name | URL |
|---|---|---|
| Breaking | Breaking Crime News | `/breaking-crime-news` |
| Missing | Missing Persons | `/missing-persons` |
| Alerts | Crime Alerts | `/crime-alerts` |
| Abuse & Safety | Domestic Violence, Abuse & Safety | `/domestic-violence-abuse-safety` |
| Courtroom | Trials & Verdicts | `/trials-verdicts` |
| Cold Cases | Cold Cases | `/cold-cases` |
| True Crime | True Crime Stories | `/true-crime-stories` |
| Watch & Listen | Crime Documentaries & Podcasts | `/crime-media` |

## Deploy

```sh
npm install
npx wrangler deploy
```

Workers Builds is connected (Nov 5, 2026): every push to `main` deploys automatically. Secrets live in Cloudflare only (`ANTHROPIC_API_KEY`).

## Still to build

1. Review desk behind Cloudflare Access, plus a daily alert email.
2. Kit email signup.
3. About, Contact, Privacy and Terms pages.
4. Custom domain cutover and Search Console.

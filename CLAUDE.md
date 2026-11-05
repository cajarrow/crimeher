# CrimeHer: notes for Claude

- Owner: Craig Jarrow. The plan, editorial rules and designs live in the claude.ai Project "CrimeHer". Read them before changing behavior.
  - Plan: https://claude.ai/artifact/VSDDUTE1QX5sRTNM6zHzsJ
  - Editorial Rules: https://claude.ai/artifact/RZ2RJqTqTeqeMxL6dBLiHg
  - Designs: https://claude.ai/artifact/LPxWYC1MpCYTGRu5WEaLWH
- Design principles: Magic, Delight, Simple. Light mode, mobile first (phone is the main audience), with a 1024px breakpoint for the laptop layout.
- Nothing goes live from feeds until Craig approves the Editorial Rules. Headline rewrites must follow that doc. Anything doubtful is held for review, not published.
- No cached copies of articles. Store only the headline, a short summary and the link. Every headline links out to the source.
- Preview hosts (`*.workers.dev`) send `X-Robots-Tag: noindex` and show the preview banner. GA4 (`G-WVXQ9P5GT6`) loads only on crimeher.com.
- Workers Free limits: 50 outbound requests per run. Batch D1 writes and keep cron work small.
- `src/worker.js` is a single file. Keep it dependency-free unless there's a clear reason.

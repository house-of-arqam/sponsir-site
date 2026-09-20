# Bowncr — site, free Pitch Checker and waitlist

Week-1 validation package for **Bowncr**, a Gmail extension for creators that
verifies sponsorship emails, warns about fake briefs / malware contracts and
extracts deal terms. See [SPEC.md](SPEC.md) for positioning, MVP scope, pricing,
the go/no-go gate and the name/domain shortlist.

```
docs/                 GitHub Pages site (static, strict meta CSP, no third-party JS)
  index.html          landing page + waitlist
  check.html          free browser-side "is this sponsorship email legit?" checker
  privacy.html
  assets/checker.js   rules engine — runs in the browser; the same file ships in the extension
  assets/checker-ui.js, site.js, site-config.js, theme.js, base.css, site.css
scripts/              test-checker.js (fixtures), check-links.js, check-csp.js
worker/               Cloudflare Worker: POST /waitlist, POST /event, GET /stats
```

## Commands

```bash
npm ci && npm run check          # eslint + html-validate + checker fixtures + link + CSP checks
npm run serve                    # http://localhost:8897
cd worker && npm ci && npm run check   # node --test + wrangler dry-run
```

## Deploy

1. Register `bowncr.app` (see SPEC.md §Name; re-check RDAP + trademark first) and
   put the zone on Cloudflare.
2. `cd worker && npx wrangler kv namespace create WAITLIST`, paste the id into
   `wrangler.toml`, uncomment the `routes` block, `npx wrangler secret put ADMIN_TOKEN`
   (and `RESEND_API_KEY` for confirmation emails), `npm run deploy`.
3. GitHub → Settings → Pages → Source = GitHub Actions. `docs/CNAME` is already
   `bowncr.app`. Pushing to `main` deploys via `.github/workflows/pages.yml`.
4. Read the gate numbers with `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://api.bowncr.app/stats`.

`waitlistEndpoint` and `eventEndpoint` in `docs/assets/site-config.js` ship empty
(the form falls back to a `mailto:` link). Once the Worker is live, set them to
`https://api.bowncr.app/waitlist` and `https://api.bowncr.app/event`.

# LegitPitch — MVP spec

Working brand: **LegitPitch** (legitpitch.com and legitpitch.app were unregistered
per registry RDAP on 2026-09-20; run a USPTO/EUIPO search before buying). See
"Name shortlist" at the end for alternatives.

One line: *a Gmail extension that tells creators which sponsorship emails are
real — and what the contract actually says — before they open the attachment.*

## 1. Why this, why now

- Fake "sponsorship" emails are the dominant channel-takeover vector: the
  pitch carries a password-protected ZIP / "campaign brief" that is an
  infostealer, or a link to a "sign in with Google to view the contract" page.
  Google-attributed reporting on one 2025 campaign cited ~1,000 domains and
  ~1.6M blocked messages (third-party report; qualify when quoting).
- Every existing creator-deal tool (URep, Crovette, Repped, creatordealdesk.com,
  Marlo, Caelo, Fluencity) is a cloud OAuth inbox or a manual web CRM. None run
  inside Gmail, none are local-first, none lead with security.
- House of Arqam already owns the hard parts: Gmail DOM injection, sender/brand
  normalisation, local-first storage, MV3 chassis, ES256 licensing Worker,
  Paddle/Polar checkout, Resend mail, GitHub Pages sites, store release tooling
  (Manila Mail Manager + PaidExtension). Estimated reuse: 60–70 %.

## 2. Target user

Monetising creators (roughly 5k–500k followers) who receive inbound brand
pitches in a Gmail or Google Workspace inbox they read on desktop Chrome/Edge.
Not agencies, not managers (Marlo's segment), not hobbyists with no inbound.

Primary job: "Is this real, and is it worth my time?" — answered in the inbox,
in under five seconds, without forwarding the email to anyone.

## 3. Validation gate (week 1, this repo)

Ship before writing extension code:

1. Landing page (`docs/index.html`) with a waitlist form.
2. Free browser-side **Pitch Checker** (`docs/check.html`, `assets/checker.js`):
   paste an email, get a risk verdict + extracted terms. Zero network calls.
   This is the SEO wedge ("is this sponsorship email legit", "fake sponsorship
   email", "<brand> sponsorship scam") and the demo of the extension's engine.
3. Waitlist Worker (`worker/`): stores emails in KV, optional Resend
   confirmation, rate-limited, CORS-locked to the site.

Go/no-go after ~7 days live + posting in 3–5 creator communities (r/NewTubers,
r/PartneredYoutube, r/Twitch, Creator Economy Discords, a couple of
"sponsorship scam" YouTube comment threads):

| Signal | Go | Weak |
| --- | --- | --- |
| Waitlist signups | ≥ 150 | < 50 |
| Checker runs (Worker `/event` counter, no PII) | ≥ 500 | < 100 |
| Pre-order / founding-price clicks | ≥ 20 | < 5 |

Weak → shelve, fold the checker engine into Manila as a free feature, build
Footprint instead.

## 4. MVP scope (weeks 2–7)

### 4.1 In-Gmail sponsor verification badge (core)

For every open thread, render a badge next to the sender (Manila's DOM
injection point) with one of: **Verified brand domain**, **Unverified**,
**Suspicious**, **Dangerous**. Computed locally from:

- From / Reply-To domain vs. brand mentioned in the body (lookalike detection:
  `nordvpn-partners.co`, `xn--` punycode, brand token + extra words).
- Free-mail sender claiming to be a brand (gmail/outlook/yahoo/proton).
- Reply-To domain ≠ From domain.
- Gmail's own authentication UI (`spf`/`dkim`/`dmarc` from the "show original"
  data when available in the DOM) — never a server round-trip.
- Curated list of frequently impersonated sponsor brands with official domains
  (shipped in the extension, updated with releases; see `checker.js` for v0).

### 4.2 Attachment / link lure warning (core)

Inline banner when a thread contains: executable/archive attachments (`.zip`,
`.rar`, `.7z`, `.iso`, `.scr`, `.exe`, `.js`, `.lnk`), "password for the
archive is …", file-host links (mediafire, mega.nz, anonfiles, dropbox
transfer, gofile), URL shorteners, or "sign in to view the contract/brief"
phrasing. Copy explains *why* in one sentence and what a real brand does
instead (PDF or DocuSign, from the brand's domain).

### 4.3 Deal-term extraction (core)

Side panel (Manila's panel) showing terms pulled from the thread: rate and
currency, deliverables (count × format), deadline dates, exclusivity
duration/category, usage-rights language (`in perpetuity`, `all media`,
`worldwide`, `whitelisting`, `paid amplification`), payment terms (net 30/60),
and "what's missing". Flags perpetual / all-media rights and pay-to-play
("small shipping fee", "deposit", "buy the product first, refund later").

### 4.4 Deal tracker (Pro)

Local pipeline: New → Replied → Negotiating → Contract → Deliverables →
Invoiced → Paid. Set from the panel; reminders (extension alarms) for
deliverable dates and unpaid invoices past net terms. Export CSV. No cloud sync
in MVP (device seats via licensing Worker as in Manila).

### 4.5 Explicit non-goals for MVP

AI reply drafting, rate benchmarking, contract redlining, Instagram/TikTok DM
ingestion, agency multi-inbox, mobile. All are table stakes in competitors and
none are the wedge.

## 5. Architecture

- **Extension**: fork PaidExtension chassis; port Manila's Gmail content-script
  layer (thread observer, DOM anchors, side panel, sender normaliser). Rules
  engine = `checker.js` from this repo, compiled into the content script.
  All analysis runs in the content script on the rendered DOM; nothing is sent
  anywhere. No Gmail API, no OAuth, therefore no restricted-scope CASA
  assessment (Chrome Web Store single-purpose + limited-use disclosures still
  apply).
- **Licensing**: PaidExtension Worker as-is (ES256 keys, seats, trial).
- **Checkout**: Paddle (or Polar, whichever PaidExtension is configured for at
  build time) on `checkout.html`.
- **Site**: this repo, GitHub Pages, strict meta CSP, no third-party JS.
- **Waitlist/telemetry Worker**: `worker/` — KV + Resend, 2 routes, rate
  limited, no cookies.

## 6. Pricing (planned, shown as "founding" on the site)

| Tier | Price | Includes |
| --- | --- | --- |
| Free | $0 | Badge + lure warnings on every thread; 10 term extractions/month; web checker |
| Pro | $7/mo · $59/yr | Unlimited extraction, deal tracker, reminders, CSV, 3 devices |
| Founding (first 200) | $39/yr for life | Same as Pro |

Rationale: creators already pay $10–30/mo for vidIQ/TubeBuddy; Repped is
$16–28/mo; Crovette plans $62/mo. We price under all of them because the
security layer should be free (adoption + goodwill) and the tracker is what
gets paid for.

## 7. Distribution

- SEO via the free checker (long-tail "is <brand> sponsorship email real").
- Cross-sell banner inside Manila for users whose inbox shows creator signals
  (YouTube Studio / TikTok / Streamlabs senders) — opt-in, local detection.
- Creator-community posts with a "paste your pitch" hook; scam-of-the-week
  posts on X/Threads/Reddit using anonymised checker patterns.
- Chrome Web Store listing under "Productivity", keywords around sponsorship
  scam / brand deal.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Gmail DOM changes | Same exposure as Manila; shared selectors module, fast-release pipeline |
| Desktop-only | Position as "check before you open"; email digest of flagged threads later |
| Competitors add scam detection | Ours is local + in-inbox; theirs needs inbox OAuth — different trust posture |
| False positives on real brands | Verified list + "mark as legit" feedback stored locally; conservative copy ("Unverified", not "Scam") |
| Brand list maintenance | Data file with release cadence; community submissions via site |

## 9. Success metrics (first 90 days post-launch)

500 installs/week organic by day 60; 4 % free→Pro; churn < 6 %/mo; ≥ 1 public
"it caught a fake brief" story per week.

## Name shortlist (registry RDAP, 2026-09-20; re-check before buying)

| Name | .com | .app | Notes |
| --- | --- | --- | --- |
| **LegitPitch** | free | free | Recommended. Says the job; matches the free checker ("is this pitch legit?"); no product found using it |
| InboxVet | free | free | Broader (not sponsorship-specific), pairs with Manila; "vet" reads slightly veterinary |
| PitchSentry | free | free | Security connotation; slightly enterprise |
| VettedInbox / VetMyInbox | free | free | Descriptive, long |
| SponsorVerify | free | free | Very literal; weak brand |
| SponsorVet | taken | free | Strong, but .com is registered |
| BriefGuard / PitchGuard / CollabGuard | taken | free | "Guard" is crowded in security naming |
| SponsorShield / DealShield | taken | free | Same |

Avoid anything containing "deal desk" (URep, Repped, Marlo, Fluencity,
creatordealdesk.com all use it).

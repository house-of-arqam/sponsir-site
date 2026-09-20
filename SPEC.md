# Sponsir — MVP spec

Brand: **Sponsir** (sponsor + sir) — "at your service: your brand deals,
inspected before you reply". Mascot: **Sir**, a flat, geometric gentleman-valet — round
parchment face, top hat with a gold band, thin gold monocle ring, mustache and
bow tie; ink (#1B1F3B) + gold (#E2B04A) on cream; flat fills, no outlines, no
blush or shading. The monocle ring is the verdict device (green / amber / red /
popped off) and the four verdict badges are his four expressions. Favicon =
monocle + mustache + bow tie, no face. Voice: dry butler ("Looks legit" / "Hmm. One sec." / "I think not." / "Don't open that!").
He is the creator's concierge, not a security guard — no bouncer/nightclub or
enterprise-security cues. Domain: sponsir.app (sponsir.com is held by SponSir
Ltd, HK). See "Name decision" at the end for the trademark risk that was
knowingly accepted.

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

## Name decision (registry RDAP + SERP checks, 2026-09-20; re-check before buying)

Chosen: **Sponsir**, shipping on sponsir.app (free per RDAP 2026-09-20).
Known, accepted risks (decision by the founder on 2026-09-20 after a USPTO
knockout search):

- **SPONSR®**, US Reg. 6841133 (Sponsr LLC, live, Class 35: matching social
  media influencers with advertisers) is phonetically identical and in the same
  category. A US application for SPONSIR would likely be refused over it, and a
  demand letter is plausible once we rank. Mitigation: have a trademark attorney
  run a full clearance before any paid launch; keep the rename path cheap (name
  appears only in copy/config, mascot art is name-independent).
- **SponSir Ltd** (Hong Kong, sponsir.com, "Pitch, Sell and Close
  Sponsorships") trades under the exact name; no US filing found. Mistyped
  visits go to them.
- Spoken, "Sponsir" ≈ "sponsor"; the mascot and always-on wordmark carry
  recall. Register defensively if the .app is bought: getsponsir.com/.app.

Clean alternatives kept on file: **Sponsimo** (sponsimo.com/.app free, 0 USPTO
hits) and **Brandeal** (brandeal.app free, .com hobby-owned).

SEO finding that drove the choice: Google Autocomplete shows creators type
"youtube sponsorship scams", "how to know if a sponsorship is legit", "fake
sponsorship youtube", "brand deals for small creators", "youtube sponsorship
rate calculator" — never a product-style word. Search traffic therefore comes
from the checker page's title/H1 carrying those phrases, not from the brand, so
the brand can be chosen for memorability. ("youtube sponsorship rate
calculator" is a candidate second free tool.)

Rejected, with reason:

| Name | .com | .app | Why not |
| --- | --- | --- | --- |
| LegitPitch (original working name) | free | free | SERP crowded by "Legitize Pitch Checker", getlegit.dev, Legitly — the "Legit-" prefix is contested |
| SponsorBouncer / Sponsor* | free | free | SERP dominated by SponsorBlock (10M-user extension creators dislike) and SponsorBook/Radar/Flo/Trace |
| Bowncr (second working name) | free | free | Bouncer pun dropped with the nightclub cues; spelling leaks to bouncr/bouncer |
| PitchBouncer / DealBouncer | free | free | Clean and viable, less distinctive |
| DealFlag / PitchFlag | parked / free | free | "Pitch" is creator-outbound; .com parked for sale |
| Sponsly, Sponsi, SponsorLock/Loc | taken | mixed | Sponsorly, Sponsy/Sponso and SponsorBlock collisions |
| DealDoctor, DeelDoc, Monitizr | taken | mixed | DealDoctor® registered; Deel/DealDoc live; Monetizr live |
| PitchPatrol | taken | free | Autocomplete owned by the Fortnite "Pitch Patroller" skin |
| Vettly | taken | taken | Live product (vettly.dev, moderation + teen-safety app) |
| HardPass, Fishy, Sussed, Whiff, NoCap, CapCheck | taken | mostly taken | Negative-only framing; half the value is "this one is real" |
| Velvet Rope, Deadbolt, Moat, Drawbridge, Airlock, Taster | taken | taken | Existing security/ad-tech brands |
| BrandVet | taken | free | brandvet.net is a veterinary-products company |
| SponsorVerify, SponsorLegit, SponsorDetect | free | free | Literal, weak brand, "Sponsor-" collision above |
| InboxVet, PitchSentry, VettedInbox | free | free | Broad or enterprise-sounding |

Avoid anything containing "deal desk" (URep, Repped, Marlo, Fluencity,
creatordealdesk.com all use it) and "Gmail"/"Google" (Chrome Web Store policy).

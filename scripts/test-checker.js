#!/usr/bin/env node

// Fixture-driven checks for the browser-side rules engine so a copy tweak or a
// regex edit cannot silently flip a scam sample to "low risk" (or a real pitch
// to "critical").

const assert = require('node:assert/strict');
const path = require('path');
const { analyze } = require(path.resolve(__dirname, '..', 'docs', 'assets', 'checker.js'));

const cases = [
  {
    name: 'infostealer brief: lookalike domain + password zip + mega link',
    text: `From: Partnerships <collab@nordvpn-partners.co>
Subject: NordVPN sponsorship - $4,500 per video

Dear Creator,
We at NordVPN would love to sponsor your channel. Please download the campaign brief:
https://mega.nz/file/abc123
The archive Brief_NordVPN.zip is password protected, password is 2024.
Reply within 24 hours to lock your slot.`,
    level: ['critical'],
    ids: ['brand_lookalike', 'archive_attachment', 'file_host', 'generic_greeting', 'urgency']
  },
  {
    name: 'credential phishing: sign in to view contract',
    text: `From: Brand Team <brandteam.official@gmail.com>
Reply-To: deals-partner@outlook.com
Hi there,
Congratulations! You have been selected for a $8,000 partnership. Please sign in with your Google account to view the contract: https://bit.ly/3xyz`,
    level: ['critical'],
    ids: ['login_lure', 'free_mail_sender', 'reply_to_mismatch', 'shortener', 'too_good']
  },
  {
    name: 'advance fee: pay shipping first',
    text: `From: ambassador@shein-collabs.net
Hello dear influencer, we want to send you free products worth $500. You only pay a small shipping fee of $12 which will be refunded after your first post. Contact us on WhatsApp: +1 555 0100.`,
    level: ['critical'],
    ids: ['pay_to_play', 'off_platform', 'brand_lookalike']
  },
  {
    name: 'legit agency pitch with terms',
    text: `From: Maya Chen <maya.chen@wavelengthagency.com>
Subject: Squarespace integration - your video on studio lighting

Hi Omar, loved your video on budget studio lighting. I'm working with Squarespace on their Q4 creator program.
Deliverables: 1 x 60-second integration in a long-form video and 2 Shorts, live by Nov 15.
Budget: $3,200 USD, Net 30 after publication. 3 months category exclusivity, 12 months organic usage rights.
Contract via DocuSign. Happy to jump on a call: https://calendly.com/maya-wavelength
LinkedIn: https://www.linkedin.com/in/mayachen`,
    level: ['low', 'medium'],
    ids: ['brand_agency', 'specific_reference', 'booking_or_linkedin', 'esign'],
    notIds: ['brand_lookalike', 'free_mail_sender', 'pay_to_play', 'login_lure'],
    terms: { rate: '$3,200', paymentTerms: 'Net 30', exclusivity: '3 months' }
  },
  {
    name: 'official brand domain with perpetual rights',
    text: `From: creators@nordvpn.com
Hi Omar, we would like to sponsor one dedicated video. Fee $2,000. NordVPN would receive rights to use the content in perpetuity across all media worldwide.`,
    level: ['medium', 'high'],
    ids: ['brand_official', 'rights_perpetual_usage_rights', 'rights_all_media_usage_rights'],
    notIds: ['brand_lookalike', 'free_mail_sender']
  },
  {
    name: 'platform names alone do not trigger brand findings',
    text: `From: hello@smallbrand.co
Hi Omar, we run a small coffee brand and saw your YouTube channel and Instagram. Would you be open to a paid post? Budget $400.`,
    level: ['low'],
    notIds: ['brand_agency', 'brand_lookalike']
  }
];

let failures = 0;
for (const c of cases) {
  const result = analyze(c.text);
  const ids = result.findings.map(f => f.id);
  try {
    assert.ok(c.level.includes(result.level), `level ${result.level} not in ${c.level} (score ${result.score}; findings ${ids.join(',')})`);
    for (const id of c.ids || []) assert.ok(ids.includes(id), `missing finding ${id} (have ${ids.join(',')})`);
    for (const id of c.notIds || []) assert.ok(!ids.includes(id), `unexpected finding ${id}`);
    for (const [key, value] of Object.entries(c.terms || {})) assert.equal(result.terms[key], value, `terms.${key}`);
    console.log(`ok   ${c.name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL ${c.name}: ${err.message}`);
  }
}

if (failures) {
  console.error(`${failures} checker case(s) failed`);
  process.exit(1);
}
console.log(`Checker tests passed (${cases.length} cases).`);

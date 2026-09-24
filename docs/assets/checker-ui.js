(function () {
  const site = window.SITE_CONFIG || {};
  // Waitlist + anonymous counters live on the licensing Worker (same origin
  // as checkout); the form falls back to mailto: when no Worker is configured.
  const config = {
    waitlistEndpoint: site.licenseApi ? site.licenseApi + '/waitlist' : '',
    eventEndpoint: site.licenseApi ? site.licenseApi + '/event' : '',
    fallbackEmail: site.supportEmail || ''
  };
  const engine = window.SponsirChecker;
  const input = document.getElementById('checker-input');
  const output = document.getElementById('checker-result');
  const runButton = document.getElementById('checker-run');
  const clearButton = document.getElementById('checker-clear');
  if (!engine || !input || !output || !runButton) return;

  const SAMPLES = {
    scam: `From: NordVPN Partnerships <collab@nordvpn-partners.co>
Reply-To: nordvpn.partnerships@gmail.com
Subject: Sponsorship offer - $4,500 per video

Dear Creator,

We at NordVPN loved your channel and want to sponsor 3 videos at $4,500 each.
Please download the campaign brief and contract here: https://mega.nz/file/x9Q2k
The archive Brief_NordVPN_2026.zip is password protected. Password: nord2026

Only a few slots left — reply within 24 hours to lock your rate.

Best,
Anna, Influencer Manager`,
    phish: `From: YouTube Creator Program <support@youtube-partner-team.com>
Subject: Action required: verify your channel to receive your sponsorship payment

Hello dear YouTuber,

Congratulations! You have been selected for a $8,000 brand partnership.
To receive payment, verify your channel ownership and sign in with your Google account to view the contract:
https://bit.ly/3kVerify

This offer expires in 48 hours.`,
    legit: `From: Maya Chen <maya.chen@wavelengthagency.com>
Subject: Squarespace integration - your video on budget studio lighting

Hi Omar,

Loved your video on budget studio lighting — the section on softbox placement is exactly the audience Squarespace wants to reach for their Q4 creator program.

Proposed deliverables: 1 x 60-second integration in a long-form video plus 2 Shorts, live by Nov 15.
Budget: $3,200 USD, paid Net 30 after publication. 3 months category exclusivity (website builders). 12 months organic usage rights on Squarespace's channels.

Contract goes out via DocuSign once we agree on terms. Happy to jump on a call: https://calendly.com/maya-wavelength
LinkedIn: https://www.linkedin.com/in/mayachen

Maya`
  };

  document.querySelectorAll('[data-sample]').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = SAMPLES[chip.dataset.sample] || '';
      run();
    });
  });

  const EMPTY = '<div class="result-empty"><img src="assets/img/sir-unverified.svg" alt="" width="120" height="140"><p>Paste a pitch and click <strong>Check this pitch</strong>.</p></div>';

  runButton.addEventListener('click', run);
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      input.value = '';
      output.innerHTML = EMPTY;
      input.focus();
    });
  }
  input.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') run();
  });

  function run() {
    const text = input.value.trim();
    if (!text) {
      output.innerHTML = '<p class="result-empty">Paste the email first — headers, body, links, everything.</p>';
      return;
    }
    const result = engine.analyze(text);
    render(result);
    // "Not enough to judge" isn't a check; don't count it as a low-risk one.
    if (!result.insufficient) ping(result.level);
  }

  // Anonymous counter for the validation gate: level only, never content.
  function ping(level) {
    if (!config.eventEndpoint || !window.fetch) return;
    try {
      fetch(config.eventEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'check', level }),
        keepalive: true
      }).catch(() => {});
    } catch (_err) {
      // Telemetry is best-effort.
    }
  }

  const VERDICTS = {
    low: {
      title: 'No red flags',
      text: 'I couldn\u2019t confirm the sender, so check them on LinkedIn or the brand\u2019s site before sharing rates or opening files.',
      sir: 'unverified'
    },
    medium: {
      title: 'Hmm. One moment.',
      text: 'Some signals need checking before you reply with rates or open anything attached.',
      sir: 'unverified'
    },
    high: {
      title: 'I think not — likely a scam',
      text: 'Multiple strong red flags. Do not open attachments or sign in anywhere. Verify through the brand\u2019s official website.',
      sir: 'scam'
    },
    critical: {
      title: 'Dangerous \u2014 do not open that',
      text: 'This matches the templates used to steal creator accounts. Delete it, or report it as phishing in Gmail.',
      sir: 'dangerous'
    }
  };

  // "Looks legit" and the verified Sir only when the sender was confirmed.
  const VERIFIED = {
    title: 'Looks legit',
    text: 'The sender checks out and nothing looks off. Still confirm the person on LinkedIn before sharing rates or opening files.',
    sir: 'verified'
  };

  const INSUFFICIENT = {
    title: 'Not enough to judge',
    text: 'Paste the whole email, including the From: line, so I can check who sent it.',
    sir: 'unverified'
  };

  function verdictFor(result) {
    if (result.insufficient) return INSUFFICIENT;
    return result.verified ? VERIFIED : VERDICTS[result.level];
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function term(label, value) {
    const empty = value == null || (Array.isArray(value) && value.length === 0);
    const shown = Array.isArray(value) ? value.join(', ') : value;
    return `<dt>${esc(label)}</dt><dd class="${empty ? 'none' : ''}">${empty ? 'not stated' : esc(shown)}</dd>`;
  }

  function nextSteps(result) {
    const steps = [];
    const ids = result.findings.map(f => f.id);
    if (ids.includes('brand_lookalike') || ids.includes('free_mail_sender') || ids.includes('reply_to_mismatch')) {
      steps.push('Find the brand\u2019s real website yourself (not from this email) and email their partnerships address to confirm the campaign exists.');
    }
    if (ids.includes('archive_attachment') || ids.includes('dangerous_attachment') || ids.includes('file_host') || ids.includes('archive_password')) {
      steps.push('Do not download or open the file. Ask for a PDF sent from the brand\u2019s domain, or a Google Docs / DocuSign link.');
    }
    if (ids.includes('login_lure')) {
      steps.push('Never sign in with Google from a link in a pitch. Report the email as phishing in Gmail.');
    }
    if (ids.includes('pay_to_play') || ids.includes('off_platform')) {
      steps.push('Sponsors pay you, never the reverse. Decline anything involving fees, gift cards, crypto or moving to Telegram/WhatsApp.');
    }
    if (result.terms.missing.length) {
      steps.push(`Before quoting, ask for: ${result.terms.missing.join(', ')}.`);
    }
    if (result.terms.usageRights.some(r => /perpetual|irrevocable|IP assignment|all-media/i.test(r))) {
      steps.push('Price extended usage rights separately or strike them; 6\u201312 months organic usage is standard.');
    }
    if (!steps.length) {
      steps.push('Look up the sender on LinkedIn and check they list this company. Then reply with your rate card.');
    }
    return steps;
  }

  function render(result) {
    const verdict = verdictFor(result);
    const findings = result.findings.map(f => `
      <li class="finding ${esc(f.severity)}">
        <span class="sev">${esc(f.severity)}</span>
        <div><strong>${esc(f.title)}</strong><span>${esc(f.detail)}</span></div>
      </li>`).join('');

    const sender = result.sender.from
      ? `<p class="checker-hint">Sender: <code>${esc(result.sender.from)}</code>${result.sender.replyTo && result.sender.replyTo !== result.sender.from ? ` \u00b7 Reply-To: <code>${esc(result.sender.replyTo)}</code>` : ''}</p>`
      : '<p class="checker-hint">Tip: include the <code>From:</code> line (and <code>Reply-To:</code>) for sender checks.</p>';

    output.innerHTML = `
      <div class="level-${esc(result.level)}">
        <div class="verdict">
          <div class="verdict-badge"><img src="assets/img/sir-${verdict.sir}.svg" alt=""></div>
          <div><h3>${esc(verdict.title)}</h3><p>${esc(verdict.text)}</p></div>
        </div>
        ${sender}
        <h4>Findings (${result.findings.length})</h4>
        <ul class="findings">${findings || '<li class="finding info"><span class="sev">info</span><div><strong>Nothing flagged</strong><span>No rule matched. That is not proof of legitimacy \u2014 verify the sender independently.</span></div></li>'}</ul>
        <h4>Deal terms found</h4>
        <dl class="terms">
          ${term('Rate', result.terms.rate)}
          ${term('Deliverables', result.terms.deliverables)}
          ${term('Timeline', result.terms.deadlines)}
          ${term('Exclusivity', result.terms.exclusivity)}
          ${term('Usage rights', result.terms.usageRights)}
          ${term('Payment terms', result.terms.paymentTerms)}
        </dl>
        <h4>What to do next</h4>
        <div class="next-steps"><ul>${nextSteps(result).map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
        <p class="result-cta">Want this on every email, automatically, inside Gmail? <a href="index.html#waitlist">Join the Sponsir waitlist</a>.</p>
      </div>`;
    output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const params = new URLSearchParams(location.search);
  if (params.get('sample') && SAMPLES[params.get('sample')]) {
    input.value = SAMPLES[params.get('sample')];
    run();
  }
})();

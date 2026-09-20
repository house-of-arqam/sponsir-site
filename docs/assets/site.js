(function () {
  const config = window.LP_CONFIG || {};

  // Mobile nav
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }

  // Scroll reveal
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        entry.target.classList.add('visible');
      });
    }, { threshold: 0.12 });
    reveals.forEach(el => observer.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('visible'));
  }

  // Waitlist form(s)
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function sourceFor(form) {
    const params = new URLSearchParams(location.search);
    return [
      form.dataset.source || 'site',
      params.get('utm_source'), params.get('utm_campaign'), params.get('ref')
    ].filter(Boolean).join('/').slice(0, 120);
  }

  async function submit(form) {
    const input = form.querySelector('input[type="email"]');
    const button = form.querySelector('button');
    const status = form.parentElement.querySelector('.form-status');
    const email = input.value.trim();
    status.className = 'form-status';

    if (!EMAIL_RE.test(email)) {
      status.textContent = 'Please enter a valid email address.';
      status.classList.add('err');
      input.focus();
      return;
    }

    if (!config.waitlistEndpoint) {
      location.href = 'mailto:' + (config.fallbackEmail || '') +
        '?subject=' + encodeURIComponent('LegitPitch waitlist') +
        '&body=' + encodeURIComponent('Please add ' + email + ' to the waitlist.');
      return;
    }

    button.disabled = true;
    status.textContent = 'Adding you\u2026';
    try {
      const res = await fetch(config.waitlistEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: sourceFor(form) })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        status.textContent = data.already
          ? 'You\u2019re already on the list \u2014 we\u2019ll be in touch.'
          : 'You\u2019re in. We\u2019ll email you when the extension is ready.';
        status.classList.add('ok');
        form.reset();
      } else if (res.status === 429) {
        status.textContent = 'Too many attempts from this network. Please try again in an hour.';
        status.classList.add('err');
      } else {
        status.textContent = 'That didn\u2019t go through. Email ' + (config.fallbackEmail || 'us') + ' and we\u2019ll add you by hand.';
        status.classList.add('err');
      }
    } catch (_err) {
      status.textContent = 'Network error. Email ' + (config.fallbackEmail || 'us') + ' and we\u2019ll add you by hand.';
      status.classList.add('err');
    } finally {
      button.disabled = false;
    }
  }

  document.querySelectorAll('form.waitlist-form').forEach(form => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit(form);
    });
  });
})();

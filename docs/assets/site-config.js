// Public, non-secret site configuration. The Worker origin below must also be
// listed in connect-src of every page's CSP meta tag (index.html, check.html).
window.LP_CONFIG = {
  // Set to '' until the waitlist Worker is deployed; the form then falls back
  // to a mailto: link so no signup is silently lost.
  waitlistEndpoint: 'https://api.legitpitch.app/waitlist',
  eventEndpoint: 'https://api.legitpitch.app/event',
  fallbackEmail: 'hello@legitpitch.app'
};

// Public, non-secret site configuration. The Worker origin below must also be
// listed in connect-src of every page's CSP meta tag (index.html, check.html).
window.BOWNCR_CONFIG = {
  // Empty until the waitlist Worker is deployed at https://api.bowncr.app; the
  // form falls back to a mailto: link so no signup is silently lost.
  waitlistEndpoint: '',
  eventEndpoint: '',
  fallbackEmail: 'hello@bowncr.app'
};

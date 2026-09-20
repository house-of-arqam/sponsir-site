---
name: sponsir-static-ui-testing
description: Run local browser checks of the Sponsir marketing site, offline pitch checker, and mailto fallback.
---

# Local setup
- From the repository root, run `npm run serve` (Python http.server, port 8897, docs root).
- No build, dependency installation, backend, or login is needed for the static flow.
- Hard-refresh after shared-checkout changes; DevTools Disable cache helps.

# Devin Secrets Needed
None for static UI checks.

# Browser checks
- Test `/`, `/check.html`, `/check.html?sample=scam`, and `/privacy.html`.
- Checker example chips auto-run; also test the explicit run button, Ctrl+Enter, and Clear.
- Query sample autoload should produce a result without a click.
- Inspect mascot SVGs, verdict text, findings, and the reset empty state.
- Test responsive widths around 1440, 1045, and 400; compare document scrollWidth with clientWidth and inspect mascot/inbox bounds.
- Use the visible theme toggle. Measure text contrast on actual computed backgrounds, including badges and ribbons.
- Auto-scroll to results may put headings behind sticky navigation: check before manually scrolling to inspect the complete result.

# Privacy and fallback evidence
- Open DevTools Network before navigation, enable Preserve log and Disable cache.
- Run a synthetic pitch with a unique marker and an external example.org link. Expect only same-origin static GETs.
- Verify `method:POST` and `-domain:localhost` filters return zero rows; reset filters between checks.
- Inspect Console for exceptions and CSP violations.
- With waitlist/event endpoints empty, submitting a test address should launch a mailto handler to the configured fallback email. Verify recipient, subject, and body in the console; do not claim email delivery.
- Prefer clicking the browser address bar or page links when DevTools has focus; Ctrl+L can target a DevTools field instead.

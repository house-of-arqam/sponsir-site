// Bowncr waitlist Worker (Cloudflare).
//
// Routes:
//   GET  /health    — { ok, kv, resend } configuration self-check.
//   POST /waitlist  — body { email, source? }. Stores the address in KV,
//                     optionally sends a confirmation via Resend.
//                     -> 200 { ok: true, already?: true } | 400 | 429
//   POST /event     — body { event: 'check', level }. Increments a daily
//                     counter; carries no content and no identifiers.
//   GET  /stats     — Authorization: Bearer <ADMIN_TOKEN>. Signup + check
//                     counts for the validation gate.
//
// KV binding: WAITLIST
//   wl:<email>            { email, source, ts }
//   count:signups         total signups
//   count:check:<level>:<yyyy-mm-dd>   checker runs by level and day
//   rl:<route>:<ip>       rate-limit window counter (TTL)
// Vars: ALLOWED_ORIGINS (comma-separated), RESEND_FROM
// Secrets: RESEND_API_KEY (optional), ADMIN_TOKEN (required for /stats)

/**
 * @typedef {object} Env
 * @property {KVNamespace} WAITLIST
 * @property {string} [ALLOWED_ORIGINS]
 * @property {string} [RESEND_API_KEY]
 * @property {string} [RESEND_FROM]
 * @property {string} [ADMIN_TOKEN]
 */

export const RATE_LIMITS = {
  '/waitlist': { max: 5, windowSeconds: 3600 },
  '/event': { max: 120, windowSeconds: 3600 }
};

const DEFAULT_ORIGINS = ['https://bowncr.app', 'https://www.bowncr.app', 'http://localhost:8897', 'http://127.0.0.1:8897'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LEVELS = ['low', 'medium', 'high', 'critical'];

function allowedOrigins(env) {
  const extra = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (allowedOrigins(env).has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
  });
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

async function rateLimited(env, route, ip) {
  const limit = RATE_LIMITS[route];
  if (!limit) return false;
  const key = `rl:${route}:${ip}`;
  const count = Number((await env.WAITLIST.get(key)) || 0) + 1;
  await env.WAITLIST.put(key, String(count), { expirationTtl: limit.windowSeconds });
  return count > limit.max;
}

async function increment(env, key) {
  const value = Number((await env.WAITLIST.get(key)) || 0) + 1;
  await env.WAITLIST.put(key, String(value));
  return value;
}

export function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  return EMAIL_RE.test(email) && email.length <= 254 ? email : null;
}

async function sendConfirmation(env, email) {
  if (!env.RESEND_API_KEY) return;
  const from = env.RESEND_FROM || 'Bowncr <hello@bowncr.app>';
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'You\u2019re on the Bowncr waitlist',
        text: [
          'Thanks for joining the Bowncr waitlist.',
          '',
          'Bowncr is a Gmail extension that verifies sponsorship emails, warns about fake briefs and malware contracts, and pulls out the deal terms \u2014 all in your browser.',
          '',
          'We will email you once when the extension is ready and once with your founding-member link ($39/year for life, first 200 members).',
          '',
          'Until then, the free Pitch Checker is live: https://bowncr.app/check.html',
          '',
          'Reply to this email to unsubscribe or ask anything.',
          '\u2014 House of Arqam Ventures LLC'
        ].join('\n')
      })
    });
  } catch (err) {
    console.error('resend failed', err && err.message);
  }
}

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

async function handleWaitlist(request, env, ctx) {
  const body = await readJson(request);
  const email = normalizeEmail(body && body.email);
  if (!email) return json({ error: 'invalid_email' }, 400);
  const source = String((body && body.source) || 'site').replace(/[^\w/.-]/g, '').slice(0, 120) || 'site';

  const key = `wl:${email}`;
  if (await env.WAITLIST.get(key)) return json({ ok: true, already: true }, 200);

  await env.WAITLIST.put(key, JSON.stringify({ email, source, ts: new Date().toISOString() }));
  ctx.waitUntil(Promise.all([increment(env, 'count:signups'), sendConfirmation(env, email)]));
  return json({ ok: true }, 200);
}

async function handleEvent(request, env, ctx) {
  const body = await readJson(request);
  if (!body || body.event !== 'check') return json({ error: 'unknown_event' }, 400);
  const level = LEVELS.includes(body.level) ? body.level : 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  ctx.waitUntil(Promise.all([increment(env, `count:check:${level}:${day}`), increment(env, 'count:checks')]));
  return json({ ok: true }, 200);
}

async function handleStats(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'unauthorized' }, 401);
  const [signups, checks, byLevel] = await Promise.all([
    env.WAITLIST.get('count:signups'),
    env.WAITLIST.get('count:checks'),
    env.WAITLIST.list({ prefix: 'count:check:' })
  ]);
  const days = {};
  for (const { name } of byLevel.keys) {
    const [, , level, day] = name.split(':');
    days[day] = days[day] || {};
    days[day][level] = Number(await env.WAITLIST.get(name));
  }
  return json({ signups: Number(signups || 0), checks: Number(checks || 0), checksByDay: days }, 200);
}

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const withCors = (res) => {
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    };

    if (request.method === 'GET' && url.pathname === '/health') {
      return withCors(json({ ok: true, kv: Boolean(env.WAITLIST), resend: Boolean(env.RESEND_API_KEY) }, 200));
    }
    if (request.method === 'GET' && url.pathname === '/stats') {
      return withCors(await handleStats(request, env));
    }
    if (request.method === 'POST' && (url.pathname === '/waitlist' || url.pathname === '/event')) {
      if (await rateLimited(env, url.pathname, clientIp(request))) {
        return withCors(json({ error: 'rate_limited' }, 429, { 'Retry-After': String(RATE_LIMITS[url.pathname].windowSeconds) }));
      }
      const handler = url.pathname === '/waitlist' ? handleWaitlist : handleEvent;
      return withCors(await handler(request, env, ctx));
    }
    return withCors(json({ error: 'not_found' }, 404));
  }
};

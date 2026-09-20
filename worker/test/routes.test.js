import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { RATE_LIMITS, normalizeEmail } from '../src/index.js';

function fakeKV() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
    async list({ prefix }) {
      return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) };
    }
  };
}

const ctx = () => {
  const tasks = [];
  return { tasks, waitUntil: (p) => tasks.push(p), async flush() { await Promise.all(tasks); } };
};

const ORIGIN = 'https://bowncr.app';

function req(path, { method = 'POST', body, ip = '1.2.3.4', origin = ORIGIN, headers = {} } = {}) {
  return new Request(`https://api.bowncr.app${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test('normalizeEmail lowercases, trims and rejects junk', () => {
  assert.equal(normalizeEmail('  Creator@Example.COM '), 'creator@example.com');
  assert.equal(normalizeEmail('not-an-email'), null);
  assert.equal(normalizeEmail(''), null);
  assert.equal(normalizeEmail(undefined), null);
});

test('POST /waitlist stores the signup, counts it and is idempotent', async () => {
  const env = { WAITLIST: fakeKV() };
  const c = ctx();
  let res = await worker.fetch(req('/waitlist', { body: { email: 'Omar@Example.com', source: 'home/utm<script>' } }), env, c);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  await c.flush();

  const record = JSON.parse(env.WAITLIST.store.get('wl:omar@example.com'));
  assert.equal(record.email, 'omar@example.com');
  assert.equal(record.source, 'home/utmscript');
  assert.equal(env.WAITLIST.store.get('count:signups'), '1');

  res = await worker.fetch(req('/waitlist', { body: { email: 'omar@example.com' } }), env, ctx());
  assert.deepEqual(await res.json(), { ok: true, already: true });
  assert.equal(env.WAITLIST.store.get('count:signups'), '1');
});

test('POST /waitlist rejects invalid email and bad JSON', async () => {
  const env = { WAITLIST: fakeKV() };
  let res = await worker.fetch(req('/waitlist', { body: { email: 'nope' } }), env, ctx());
  assert.equal(res.status, 400);
  res = await worker.fetch(new Request('https://api.bowncr.app/waitlist', { method: 'POST', body: '{oops' }), env, ctx());
  assert.equal(res.status, 400);
});

test('POST /waitlist is rate limited per IP', async () => {
  const env = { WAITLIST: fakeKV() };
  const max = RATE_LIMITS['/waitlist'].max;
  for (let i = 0; i < max; i++) {
    const res = await worker.fetch(req('/waitlist', { body: { email: `u${i}@example.com` } }), env, ctx());
    assert.equal(res.status, 200);
  }
  const res = await worker.fetch(req('/waitlist', { body: { email: 'late@example.com' } }), env, ctx());
  assert.equal(res.status, 429);
  assert.ok(res.headers.get('Retry-After'));
  const other = await worker.fetch(req('/waitlist', { body: { email: 'other@example.com' }, ip: '9.9.9.9' }), env, ctx());
  assert.equal(other.status, 200);
});

test('POST /event counts checks by level and day, rejects unknown events', async () => {
  const env = { WAITLIST: fakeKV() };
  const c = ctx();
  let res = await worker.fetch(req('/event', { body: { event: 'check', level: 'critical' } }), env, c);
  assert.equal(res.status, 200);
  await c.flush();
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(env.WAITLIST.store.get(`count:check:critical:${day}`), '1');
  assert.equal(env.WAITLIST.store.get('count:checks'), '1');

  res = await worker.fetch(req('/event', { body: { event: 'pageview' } }), env, ctx());
  assert.equal(res.status, 400);
});

test('GET /stats requires the admin token', async () => {
  const env = { WAITLIST: fakeKV(), ADMIN_TOKEN: 'secret' };
  env.WAITLIST.store.set('count:signups', '3');
  env.WAITLIST.store.set('count:checks', '10');
  env.WAITLIST.store.set('count:check:low:2026-09-20', '4');

  let res = await worker.fetch(req('/stats', { method: 'GET' }), env, ctx());
  assert.equal(res.status, 401);
  res = await worker.fetch(req('/stats', { method: 'GET', headers: { Authorization: 'Bearer secret' } }), env, ctx());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { signups: 3, checks: 10, checksByDay: { '2026-09-20': { low: 4 } } });

  const noToken = await worker.fetch(req('/stats', { method: 'GET', headers: { Authorization: 'Bearer x' } }), { WAITLIST: fakeKV() }, ctx());
  assert.equal(noToken.status, 401);
});

test('CORS: unknown origins get no allow-origin header; OPTIONS preflight is 204', async () => {
  const env = { WAITLIST: fakeKV() };
  const res = await worker.fetch(req('/health', { method: 'GET', origin: 'https://evil.example' }), env, ctx());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  const pre = await worker.fetch(req('/waitlist', { method: 'OPTIONS' }), env, ctx());
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('unknown routes 404', async () => {
  const res = await worker.fetch(req('/nope', { method: 'GET' }), { WAITLIST: fakeKV() }, ctx());
  assert.equal(res.status, 404);
});

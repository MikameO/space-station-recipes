// Drives worker/index.js under Node with a fake env and a fake GitHub.
// Run: node scripts/test_feedback_worker.mjs
import assert from 'node:assert';
import worker, { validate, buildIssue, inert } from '../worker/index.js';

const ORIGIN = 'https://mikameo.github.io';
const ZWSP = '​';
let ghCalls = [];
let ghStatus = 201;
globalThis.fetch = async (url, init) => {
  ghCalls.push({ url, init, body: JSON.parse(init.body) });
  return new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/MikameO/space-station-recipes/issues/42' }), { status: ghStatus });
};
const env = (over = {}) => ({ ALLOWED_ORIGINS: ORIGIN, GITHUB_TOKEN: 'ghp_test', RL: { limit: async () => ({ success: true }) }, ...over });
const post = (body, { origin = ORIGIN, ct = 'application/json', raw } = {}) =>
  new Request('https://w.example/submit', { method: 'POST', headers: { Origin: origin, 'Content-Type': ct }, body: raw ?? JSON.stringify(body) });
const idea = (over = {}) => ({ kind: 'idea', text: 'Add a dark-roast coffee recipe list', contact: '', meta: { page: 'index', lang: 'ru', fork: 'rucm', tab: 'calculator', visits: 5, device: 'desktop', data: '3.13.0' }, hp: '', t: 4200, ...over });
const survey = (over = {}) => ({ kind: 'survey', answers: { hardest: 'Finding the beaker simulator', wanted: '' }, chips: ['calculator'], contact: 'nick#1', meta: { page: 'index', lang: 'en', fork: 'vanilla', visits: 3, device: 'mobile', data: '3.13.0' }, hp: '', t: 9000, ...over });

const cases = [
  ['OPTIONS from the site → 204 with CORS', async () => {
    const r = await worker.fetch(new Request('https://w.example/submit', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env());
    assert.strictEqual(r.status, 204);
    assert.strictEqual(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  }],
  ['OPTIONS from elsewhere → 403', async () => {
    const r = await worker.fetch(new Request('https://w.example/submit', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env());
    assert.strictEqual(r.status, 403);
  }],
  ['POST from elsewhere → 403', async () => {
    const r = await worker.fetch(post(idea(), { origin: 'https://evil.example' }), env());
    assert.strictEqual(r.status, 403);
  }],
  ['GET → 404', async () => {
    const r = await worker.fetch(new Request('https://w.example/submit', { headers: { Origin: ORIGIN } }), env());
    assert.strictEqual(r.status, 404);
  }],
  ['wrong content type → 400', async () => {
    const r = await worker.fetch(post(idea(), { ct: 'text/plain' }), env());
    assert.strictEqual(r.status, 400);
  }],
  ['body over 16 KB → 413', async () => {
    const r = await worker.fetch(post(null, { raw: JSON.stringify(idea({ text: 'x'.repeat(17000) })) }), env());
    assert.strictEqual(r.status, 413);
  }],
  ['a full-length Russian survey fits the byte limit', async () => {
    const r = await worker.fetch(post(survey({ answers: { hardest: 'ж'.repeat(2000), wanted: 'щ'.repeat(2000) } })), env());
    assert.strictEqual(r.status, 200);
  }],
  ['bad JSON → 400 bad-json', async () => {
    const r = await worker.fetch(post(null, { raw: '{nope' }), env());
    assert.strictEqual(r.status, 400);
    assert.strictEqual((await r.json()).error, 'bad-json');
  }],
  ['validate: honeypot, speed, kind, lengths, empty survey, chips', () => {
    assert.strictEqual(validate(idea({ hp: 'http://spam' })), 'honeypot');
    assert.strictEqual(validate(idea({ t: 900 })), 'too-fast');
    assert.strictEqual(validate(idea({ kind: 'bug' })), 'bad-kind');
    assert.strictEqual(validate(idea({ text: 'short' })), 'text-length');
    assert.strictEqual(validate(idea({ text: 'x'.repeat(2001) })), 'text-length');
    assert.strictEqual(validate(idea({ contact: 'c'.repeat(81) })), 'contact-long');
    assert.strictEqual(validate(survey({ answers: { hardest: '  ', wanted: '' } })), 'empty');
    assert.strictEqual(validate(survey({ chips: new Array(11).fill('x') })), 'chips');
    assert.strictEqual(validate(survey({ chips: ['![p](https://example.com/p.png) @octocat'] })), 'chips');
    assert.strictEqual(validate(idea()), null);
    assert.strictEqual(validate(survey()), null);
  }],
  ['inert: mentions, references, GitHub links and images go in harmless', () => {
    const raw = 'ping @octocat, see torvalds/linux#1 and https://github.com/x/y/issues/1 ![p](https://e.com/p.png) mail a@b.c';
    const out = inert(raw);
    for (const live of ['@octocat', 'linux#1', 'github.com/x', '![p]', '@b.c']) assert.ok(!out.includes(live), 'still live: ' + live);
    assert.strictEqual(out.replace(new RegExp(ZWSP, 'g'), ''), raw);     // reads the same
    const issue = buildIssue(idea({ text: '@octocat please look at #12', contact: '@nick' }));
    assert.ok(!issue.title.includes('@octocat') && !issue.title.includes('#12'));
    assert.ok(!issue.body.includes('@octocat') && !issue.body.includes('#12'));
    assert.ok(issue.body.includes('| Contact | @' + ZWSP + 'nick |'));
  }],
  ['valid idea → GitHub issue with labels, 200 with number and url', async () => {
    ghCalls = [];
    const r = await worker.fetch(post(idea()), env());
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { ok: true, number: 42, url: 'https://github.com/MikameO/space-station-recipes/issues/42' });
    assert.strictEqual(ghCalls.length, 1);
    assert.strictEqual(ghCalls[0].url, 'https://api.github.com/repos/MikameO/space-station-recipes/issues');
    assert.strictEqual(ghCalls[0].init.headers.Authorization, 'Bearer ghp_test');
    assert.deepStrictEqual(ghCalls[0].body.labels, ['idea', 'from-site']);
    assert.strictEqual(ghCalls[0].body.title, '[idea] Add a dark-roast coffee recipe list');
    assert.ok(ghCalls[0].body.body.includes('| Fork | rucm |'));
    assert.ok(!ghCalls[0].body.body.includes('Contact'));             // empty contact is omitted
  }],
  ['valid survey → survey labels, both answers, chips, contact', async () => {
    ghCalls = [];
    const r = await worker.fetch(post(survey()), env());
    assert.strictEqual(r.status, 200);
    const b = ghCalls[0].body;
    assert.deepStrictEqual(b.labels, ['survey', 'from-site']);
    assert.strictEqual(b.title, '[survey] visit 3 · en · vanilla');
    assert.ok(b.body.includes('Finding the beaker simulator'));
    assert.ok(b.body.includes('Sections: calculator'));
    assert.ok(b.body.includes('| Contact | nick#' + ZWSP + '1 |'));
  }],
  ['rate limit exceeded → 429, GitHub not called', async () => {
    ghCalls = [];
    const r = await worker.fetch(post(idea()), env({ RL: { limit: async () => ({ success: false }) } }));
    assert.strictEqual(r.status, 429);
    assert.strictEqual(ghCalls.length, 0);
  }],
  ['GitHub failure → 502', async () => {
    ghStatus = 500;
    const r = await worker.fetch(post(idea()), env());
    ghStatus = 201;
    assert.strictEqual(r.status, 502);
    assert.strictEqual((await r.json()).error, 'github-500');
  }],
  ['buildIssue: title is one line, cut at 60; pipes and newlines escaped in meta', () => {
    const long = buildIssue(idea({ text: 'line one\nline two ' + 'z'.repeat(80) }));
    assert.ok(!long.title.includes('\n'));
    assert.ok(long.title.length <= 60 + '[idea] '.length + 1);
    assert.ok(long.title.endsWith('…'));
    const tricky = buildIssue(idea({ meta: { page: 'a|b\nc', lang: 'en' } }));
    assert.ok(tricky.body.includes('| Page | a\\|b c |'));
  }],
];

let failed = 0;
for (const [name, fn] of cases) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + (e.message || e)); }
}
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);

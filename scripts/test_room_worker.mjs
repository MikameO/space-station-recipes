// scripts/test_room_worker.mjs — drives worker/room/* under Node with fake Durable Objects.
// Run: node scripts/test_room_worker.mjs
import assert from 'node:assert';
import { routeRoom } from '../worker/room/router.js';
import { Room } from '../worker/room/room.js';
import { Registry } from '../worker/room/registry.js';
import { signServerToken, stopSig } from '../worker/room/crypto.js';
import { chronology } from '../worker/room/export.js';
import FULL from './fixtures/room_policy_full.json' with { type: 'json' };

const ORIGIN = 'https://mikameo.github.io';
const SECRET = 'test-key-secret';
const STOP = 'test-stop-secret';
const clone = v => (v === undefined ? undefined : structuredClone(v));

class FakeStorage {
  constructor() { this.map = new Map(); this.writes = 0; this.alarmAt = null; }
  async get(k) {
    if (Array.isArray(k)) { const m = new Map(); for (const x of k) if (this.map.has(x)) m.set(x, clone(this.map.get(x))); return m; }
    return clone(this.map.get(k));
  }
  async put(k, v) {
    if (typeof k === 'object') { for (const [kk, vv] of Object.entries(k)) { this.map.set(kk, clone(vv)); this.writes++; } return; }
    this.map.set(k, clone(v)); this.writes++;
  }
  async delete(k) {
    const keys = Array.isArray(k) ? k : [k]; let n = 0;
    for (const x of keys) { if (this.map.delete(x)) n++; this.writes++; }
    return Array.isArray(k) ? n : n > 0;
  }
  async list(o = {}) {
    let keys = [...this.map.keys()].sort();
    if (o.prefix) keys = keys.filter(k => k.startsWith(o.prefix));
    if (o.start) keys = keys.filter(k => k >= o.start);
    if (o.startAfter) keys = keys.filter(k => k > o.startAfter);
    if (o.reverse) keys.reverse();
    if (o.limit) keys = keys.slice(0, o.limit);
    return new Map(keys.map(k => [k, clone(this.map.get(k))]));
  }
  async deleteAll() { this.map.clear(); }
  async setAlarm(t) { this.alarmAt = t; }
  async getAlarm() { return this.alarmAt; }
  async deleteAlarm() { this.alarmAt = null; }
}

function namespace(Klass, env) {
  const inst = new Map();
  return {
    instances: inst,
    idFromName: name => ({ name, toString: () => name }),
    get: id => ({
      fetch: (input, init) => {
        if (!inst.has(id.name)) inst.set(id.name, new Klass({ storage: new FakeStorage(), id }, env));
        return inst.get(id.name).fetch(input instanceof Request ? input : new Request(input, init));
      }
    })
  };
}

function makeEnv(over = {}) {
  const env = Object.assign({
    ALLOWED_ORIGINS: ORIGIN, ROOMS_ENABLED: '1', ROOMS_MAX_CONCURRENT: '6', ROOMS_MAX_DAILY: '30',
    ROOM_KEYS: JSON.stringify({ 'stories-k1': SECRET }), ROOM_STOP_SECRET: STOP,
    POLICIES: { stories_cm: FULL },
    clock: Date.UTC(2026, 8, 13, 18, 0, 0)
  }, over);
  env.NOW = () => env.clock;
  env.ROOMS = namespace(Room, env);
  env.REGISTRY = namespace(Registry, env);
  return env;
}

function call(env, method, path, { body, session, observer, keyId, origin = ORIGIN } = {}) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (session) headers['X-Room-Session'] = session;
  if (observer) headers['X-Room-Observer'] = observer;
  if (keyId) headers['X-Room-Key-Id'] = keyId;
  return routeRoom(new Request('https://w.example' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
}

const token = await signServerToken(SECRET, { fork: 'stories_cm', server: 'Space Stories - Marine Corps Core', keyId: 'stories-k1', iat: 1 });
const CO = { client: 'client-co-0001', post: 'co', callsign: 'Иванов' };
const create = (env, over = {}) => call(env, 'POST', '/room', { keyId: 'stories-k1', body: Object.assign({ token, planet: 'lv624', h: 'abc', creator: CO }, over) });

let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok', name); }

await t('policy route serves the generated policy', async () => {
  const env = makeEnv();
  const r = await call(env, 'GET', '/policy/stories_cm');
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).fork, 'stories_cm');
  assert.strictEqual((await call(env, 'GET', '/policy/nope')).status, 404);
});

await t('origin and sanction gate', async () => {
  const env = makeEnv();
  assert.strictEqual((await call(env, 'GET', '/health', { origin: 'https://evil.example' })).status, 403);
  assert.strictEqual((await call(env, 'POST', '/room', { keyId: 'stories-k1', body: { planet: 'lv624', creator: CO } })).status, 403);
  assert.strictEqual((await create(env, { token: token.slice(0, -2) + 'xx' })).status, 403);
  assert.strictEqual((await call(env, 'POST', '/room', { keyId: 'other', body: { token, planet: 'lv624', creator: CO } })).status, 403);
  const bad = await create(env, { creator: { client: 'client-sl-0001', post: 'sl', squad: 'bravo' } });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual((await bad.json()).error, 'creator');
});

await t('ceiling refuses new rooms with text, never an active one', async () => {
  const env = makeEnv({ ROOMS_MAX_CONCURRENT: '1' });
  assert.strictEqual((await create(env)).status, 200);
  const second = await create(env);
  assert.strictEqual(second.status, 429);
  assert.strictEqual((await second.json()).error, 'ceiling');
});

await t('stop link: GET shows a form, POST stops, start re-enables', async () => {
  const env = makeEnv();
  const sig = await stopSig(STOP, 'stop', 'stories-k1');
  const page = await routeRoom(new Request('https://w.example/stop/stories-k1/' + sig), env);
  assert.strictEqual(page.status, 200);
  assert.match(await page.text(), /<form method="post">/);
  assert.strictEqual((await create(env)).status, 200, 'GET alone does not stop');
  assert.strictEqual((await routeRoom(new Request('https://w.example/stop/stories-k1/wrong', { method: 'POST' }), env)).status, 403);
  assert.strictEqual((await routeRoom(new Request('https://w.example/stop/stories-k1/' + sig, { method: 'POST' }), env)).status, 200);
  const refused = await create(env);
  assert.strictEqual(refused.status, 403);
  assert.strictEqual((await refused.json()).error, 'stopped');
  const startSig = await stopSig(STOP, 'start', 'stories-k1');
  await routeRoom(new Request('https://w.example/start/stories-k1/' + startSig, { method: 'POST' }), env);
  assert.strictEqual((await create(env)).status, 200);
});

// One room, one evening: the rest of the cases share it in order.
const env = makeEnv();
const created = await (await create(env)).json();
const room = [...env.ROOMS.instances.values()][0];
const code = created.code;
const sheet = created.sheet;
let coSession = created.session;
const codeOf = (post, squad) => sheet.find(s => s.post === post && s.squad === (squad || null)).code;
let slSession, ftlSession;

await t('create returns a code, a session, an observer token and the briefing sheet', async () => {
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.strictEqual(sheet.length, 1 + 1 + 3 + 2 + 5 + 20 + 2 + 2 + 2);
  assert.ok(created.observerToken.length >= 20);
  const r = await call(env, 'GET', `/room/${code}/ops?since=0`, { session: coSession });
  assert.strictEqual(r.status, 200);
  const body = await r.json();
  assert.strictEqual(body.ops[0].kind, 'member');
  assert.strictEqual(body.ops[0].data.confirmed, true);
});

await t('post code joins as knocking; knocking reads nothing and writes nothing', async () => {
  const j = await call(env, 'POST', `/room/${code}/join`, { body: { client: 'client-slb-001', postCode: codeOf('sl', 'bravo'), callsign: 'Петров' } });
  assert.strictEqual(j.status, 200);
  const jb = await j.json();
  assert.strictEqual(jb.status, 'knocking');
  assert.ok(jb.word);
  slSession = jb.session;
  const poll = await (await call(env, 'GET', `/room/${code}/ops?since=0`, { session: slSession })).json();
  assert.strictEqual(poll.knocking, true);
  assert.deepStrictEqual(poll.ops, []);
  const w = await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'a', op: 'put', kind: 'marker', id: 'm1', data: { cat: 'enemy', label: 'ксено', x: 10, y: 20, layer: 'squad:bravo' } }] } });
  assert.strictEqual(w.status, 403);
});

await t('a used post code refuses another client', async () => {
  const r = await call(env, 'POST', `/room/${code}/join`, { body: { client: 'client-xeno-01', postCode: codeOf('sl', 'bravo') } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual((await r.json()).error, 'used');
});

await t('any confirmed member confirms one knock with a single click', async () => {
  const members = (await (await call(env, 'GET', `/room/${code}/ops?since=0`, { session: coSession })).json()).ops.filter(o => o.kind === 'member');
  const sl = members.find(o => o.data.post === 'sl');
  const r = await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'confirm', client: sl.data.client } });
  assert.strictEqual(r.status, 200);
});

await t('two knocks require the spoken word', async () => {
  const f = await (await call(env, 'POST', `/room/${code}/join`, { body: { client: 'client-ftlb-01', postCode: codeOf('ftl', 'bravo') } })).json();
  ftlSession = f.session;
  await call(env, 'POST', `/room/${code}/join`, { body: { client: 'client-ftla-01', post: 'ftl', squad: 'alpha' } });
  const noWord = await call(env, 'POST', `/room/${code}/admin`, { session: slSession, body: { action: 'confirm', client: 'client-ftlb-01' } });
  assert.strictEqual(noWord.status, 409);
  assert.strictEqual((await noWord.json()).error, 'word');
  const ok = await call(env, 'POST', `/room/${code}/admin`, { session: slSession, body: { action: 'confirm', client: 'client-ftlb-01', word: f.word } });
  assert.strictEqual(ok.status, 200);
});

await t('an accepted op writes exactly two rows; a refused one writes none', async () => {
  const before = room.s.writes;
  const r = await (await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'm1', op: 'put', kind: 'marker', id: 'm1', data: { cat: 'enemy', label: 'ксено', x: 10, y: 20, layer: 'squad:bravo' } }] } })).json();
  assert.ok(r.acks[0].seq > 0);
  assert.strictEqual(room.s.writes - before, 2);
  const before2 = room.s.writes;
  const refused = await (await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'x', op: 'put', kind: 'marker', id: 'm2', data: { cat: 'plan', x: 1, y: 1, layer: 'shared' } }] } })).json();
  assert.strictEqual(refused.acks[0].error, 'layer');
  assert.strictEqual(room.s.writes, before2);
});

await t('expectedStatus: the second accept of the same request is refused', async () => {
  await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'q', op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 30, y: 40 }, note: 'гнездо' } }] } });
  const a1 = await (await call(env, 'POST', `/room/${code}/ops`, { session: coSession, body: { ops: [{ cid: 'a1', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } }] } })).json();
  assert.ok(a1.acks[0].seq);
  const a2 = await (await call(env, 'POST', `/room/${code}/ops`, { session: coSession, body: { ops: [{ cid: 'a2', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } }] } })).json();
  assert.strictEqual(a2.acks[0].error, 'status');
  const f = await (await call(env, 'POST', `/room/${code}/ops`, { session: coSession, body: { ops: [{ cid: 'f', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'accepted', data: { status: 'firing', firedAt: 1 } }] } })).json();
  assert.ok(f.acks[0].seq);
  assert.strictEqual(room.state.objects.q1.firedAt, env.clock, 'firedAt is stamped by the server');
});

await t('Retry-After: 2 s while a request is fresh, 10 s later', async () => {
  const r1 = await call(env, 'GET', `/room/${code}/ops?since=0`, { session: coSession });
  assert.strictEqual(r1.headers.get('Retry-After'), '2');
  env.clock += 61000;
  const r2 = await call(env, 'GET', `/room/${code}/ops?since=0`, { session: coSession });
  assert.strictEqual(r2.headers.get('Retry-After'), '10');
});

await t('rate limit per client: the eleventh op in one second is refused', async () => {
  env.clock += 5000;
  const ops = Array.from({ length: 11 }, (_, i) => ({ cid: 'r' + i, op: 'put', kind: 'marker', id: 'rate' + i, data: { cat: 'enemy', x: i, y: i, layer: 'squad:bravo' } }));
  const r = await (await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops } })).json();
  assert.ok(r.acks[9].seq);
  assert.strictEqual(r.acks[10].error, 'rate');
});

await t('radio silence freezes writes and shows in meta', async () => {
  env.clock += 2000;
  await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'silence', on: true } });
  const w = await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 's', op: 'put', kind: 'marker', id: 's1', data: { cat: 'enemy', x: 1, y: 1, layer: 'squad:bravo' } }] } });
  assert.strictEqual(w.status, 423);
  assert.strictEqual((await w.json()).error, 'silence');
  const meta = (await (await call(env, 'GET', `/room/${code}/ops?since=0`, { session: slSession })).json()).meta;
  assert.strictEqual(meta.frozen.reason, 'silence');
  await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'silence', on: false } });
});

await t('idle lock after 8 minutes; staff continues with one click', async () => {
  env.clock += 480000;
  const w = await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'l', op: 'put', kind: 'marker', id: 'l1', data: { cat: 'enemy', x: 2, y: 2, layer: 'squad:bravo' } }] } });
  assert.strictEqual(w.status, 423);
  assert.strictEqual((await w.json()).error, 'locked');
  assert.strictEqual((await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'unlock' } })).status, 200);
  const ok = await (await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'l', op: 'put', kind: 'marker', id: 'l1', data: { cat: 'enemy', x: 2, y: 2, layer: 'squad:bravo' } }] } })).json();
  assert.ok(ok.acks[0].seq);
});

await t('reissue gives a dead SL slot a fresh post code', async () => {
  const r = await (await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'reissue', client: 'client-slb-001' } })).json();
  assert.match(r.postCode, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  assert.strictEqual((await call(env, 'GET', `/room/${code}/ops?since=0`, { session: slSession })).status, 401, 'the old holder is released');
  const j = await (await call(env, 'POST', `/room/${code}/join`, { body: { client: 'client-slb-002', postCode: r.postCode } })).json();
  assert.strictEqual(j.status, 'knocking');
  slSession = j.session;
  await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'confirm', client: 'client-slb-002', word: j.word } });
});

await t('export: no sessions or words, chronology in game coordinates', async () => {
  await call(env, 'POST', `/room/${code}/ops`, { session: coSession, body: { ops: [{ cid: 'c', op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [243, -218] } }] } });
  const r = await call(env, 'GET', `/room/${code}/export`, { session: coSession });
  assert.strictEqual(r.status, 200);
  const raw = await r.text();
  assert.ok(!/sess:|"hash"|"word":"[^"]/.test(raw));
  const body = JSON.parse(raw);
  assert.match(body.text, /метка «ксено» 253 -198/);
  const obs = await call(env, 'GET', `/room/${code}/export`, { observer: created.observerToken });
  assert.strictEqual(obs.status, 200);
  const obsWrite = await call(env, 'POST', `/room/${code}/ops`, { observer: created.observerToken, body: { ops: [] } });
  assert.strictEqual(obsWrite.status, 403);
});

await t('rotate: epoch revokes every session, only the rotating officer gets a new one', async () => {
  const r = await (await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'rotate' } })).json();
  assert.notStrictEqual(r.code, code);
  const oldPath = await call(env, 'GET', `/room/${code}/ops?since=0`, { session: coSession });
  assert.ok([401, 404].includes(oldPath.status));
  assert.strictEqual((await call(env, 'GET', `/room/${r.code}/ops?since=0`, { session: slSession })).status, 401);
  assert.strictEqual((await call(env, 'GET', `/room/${r.code}/ops?since=0`, { session: r.session })).status, 200);
  coSession = r.session;
  created.code = r.code;
});

await t('lifetime: close at max, export during grace, delete after grace', async () => {
  env.clock += 3 * 3600 * 1000;
  await room.alarm();
  const w = await call(env, 'POST', `/room/${created.code}/ops`, { session: coSession, body: { ops: [{ cid: 'z', op: 'put', kind: 'marker', id: 'z1', data: { cat: 'plan', x: 1, y: 1, layer: 'shared' } }] } });
  assert.strictEqual(w.status, 423);
  assert.strictEqual((await w.json()).error, 'closed');
  assert.strictEqual((await call(env, 'GET', `/room/${created.code}/export`, { session: coSession })).status, 200);
  env.clock += 3600 * 1000;
  await room.alarm();
  assert.strictEqual(room.s.map.size, 0);
  const health = await (await call(env, 'GET', '/health')).json();
  assert.strictEqual(health.active, 0);
});

await t('chronology names posts and squads', () => {
  const text = chronology([{ seq: 1, at: Date.UTC(2026, 8, 13, 18, 5, 7), by: { client: 'c', post: 'sl', squad: 'bravo' }, op: 'put', kind: 'marker', id: 'm', data: { label: 'ксено', x: 1, y: 2 } }], FULL, [10, 20]);
  assert.strictEqual(text, '18:05:07  Командир отряда Браво  метка «ксено» 11 22');
});

console.log('OK', passed, 'cases');

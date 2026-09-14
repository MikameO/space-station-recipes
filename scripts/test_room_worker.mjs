// scripts/test_room_worker.mjs — drives worker/room/* under Node with fake Durable Objects.
// Run: node scripts/test_room_worker.mjs
import assert from 'node:assert';
import { routeRoom } from '../worker/room/router.js';
import { Room } from '../worker/room/room.js';
import { Registry } from '../worker/room/registry.js';
import { signServerToken, stopSig } from '../worker/room/crypto.js';
import { chronology } from '../worker/room/export.js';
import FULL from './fixtures/room_policy_full.json' with { type: 'json' };
import STAGE1 from '../tactical/policy/stories_cm.json' with { type: 'json' };

const ORIGIN = 'https://mikameo.github.io';
// Server key secrets are at least 24 characters since the sanction hardening (crypto.js MIN_SECRET_LENGTH).
const SECRET = 'test-key-secret-0123456789';
const STOP = 'test-stop-secret';
const clone = v => (v === undefined ? undefined : structuredClone(v));

class FakeStorage {
  constructor() { this.map = new Map(); this.writes = 0; this.alarmAt = null; }
  async get(k) {
    if (Array.isArray(k)) { const m = new Map(); for (const x of k) if (this.map.has(x)) m.set(x, clone(this.map.get(x))); return m; }
    return clone(this.map.get(k));
  }
  async put(k, v) {
    if (typeof k === 'object') {
      // Durable Object storage takes at most 128 keys per call.
      if (Object.keys(k).length > 128) throw new Error('put: more than 128 keys');
      for (const [kk, vv] of Object.entries(k)) { this.map.set(kk, clone(vv)); this.writes++; }
      return;
    }
    this.map.set(k, clone(v)); this.writes++;
  }
  async delete(k) {
    if (Array.isArray(k) && k.length > 128) throw new Error('delete: more than 128 keys');
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

function call(env, method, path, { body, raw, session, observer, keyId, origin = ORIGIN } = {}) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (session) headers['X-Room-Session'] = session;
  if (observer) headers['X-Room-Observer'] = observer;
  if (keyId) headers['X-Room-Key-Id'] = keyId;
  return routeRoom(new Request('https://w.example' + path, { method, headers, body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined }), env);
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

await t('create returns a code, a session and the briefing sheet; no observer link yet', async () => {
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.strictEqual(sheet.length, 1 + 1 + 3 + 2 + 5 + 20 + 2 + 2 + 2);
  // Changed: the observer link is off by default; staff mint it with the `observer` admin action.
  assert.strictEqual(created.observerToken, undefined);
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
  // Changed: a used code answers like an unknown one (404 postCode), so codes cannot be probed.
  assert.strictEqual(r.status, 404);
  assert.strictEqual((await r.json()).error, 'postCode');
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
  // Changed: the observer token is minted by staff, not returned at create.
  const observerToken = (await (await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'observer' } })).json()).observerToken;
  const obs = await call(env, 'GET', `/room/${code}/export`, { observer: observerToken });
  assert.strictEqual(obs.status, 200);
  const obsWrite = await call(env, 'POST', `/room/${code}/ops`, { observer: observerToken, body: { ops: [] } });
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

// ── Stage 1 rooms on the shipping policy: write contract v2 and the Worker review ─────────
const stage1Env = (over = {}) => makeEnv(Object.assign({ POLICIES: { stories_cm: STAGE1 } }, over));
const SO = { client: 'client-so-0001', post: 'so', callsign: 'Орлов' };
const createStage1 = env => call(env, 'POST', '/room', { keyId: 'stories-k1', body: { token, planet: 'lv624', h: 'ee8dd1d6d4a4', creator: SO } });
async function stage1Room(env) {
  const res = await createStage1(env);
  const c = await res.json();
  assert.strictEqual(res.status, 200, JSON.stringify(c));
  return { c, code: c.code, so: c.session, room: [...env.ROOMS.instances.values()].at(-1), mortarCode: c.sheet.find(s => s.post === 'mortar').code };
}
const send = (env, r, session, ops) => call(env, 'POST', `/room/${r.code}/ops`, { session, body: { ops } }).then(res => res.json());
const pollRoom = (env, r, session) => call(env, 'GET', `/room/${r.code}/ops?since=0`, { session });
const adminAs = (env, r, session, body) => call(env, 'POST', `/room/${r.code}/admin`, { session, body });
async function joinMortar(env, r, client = 'client-mortar-01') {
  const j = await (await call(env, 'POST', `/room/${r.code}/join`, { body: { client, postCode: r.mortarCode, callsign: 'Сидоров' } })).json();
  assert.strictEqual((await adminAs(env, r, r.so, { action: 'confirm', client, word: j.word })).status, 200);
  return j.session;
}
const errorOf = async res => [res.status, (await res.json()).error];

await t('sanction: inherited key ids, short secrets and retired tokens are refused; /policy/constructor is 404', async () => {
  const env = stage1Env();
  for (const [keyId, secret] of [['constructor', String(Object)], ['__proto__', String(Object.prototype)], ['toString', String(Object.prototype.toString)]]) {
    const forged = await signServerToken(secret, { fork: 'stories_cm', server: 'FORGED', keyId, iat: 1 });
    assert.strictEqual((await call(env, 'POST', '/room', { keyId, body: { token: forged, planet: 'lv624', creator: SO } })).status, 403, keyId);
  }
  for (const p of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.strictEqual((await call(env, 'GET', '/policy/' + p)).status, 404, p);
  const short = stage1Env({ ROOM_KEYS: JSON.stringify({ 'stories-k1': 'short-secret' }) });
  const shortToken = await signServerToken('short-secret', { fork: 'stories_cm', server: 'S', keyId: 'stories-k1', iat: 1 });
  assert.strictEqual((await call(short, 'POST', '/room', { keyId: 'stories-k1', body: { token: shortToken, planet: 'lv624', creator: SO } })).status, 403);
  const retired = stage1Env({ ROOM_KEYS: JSON.stringify({ 'stories-k1': { secret: SECRET, minIat: 5 } }) });
  assert.strictEqual((await createStage1(retired)).status, 403, 'iat 1 is before minIat 5');
  const reissued = await signServerToken(SECRET, { fork: 'stories_cm', server: 'S', keyId: 'stories-k1', iat: 5 });
  assert.strictEqual((await call(retired, 'POST', '/room', { keyId: 'stories-k1', body: { token: reissued, planet: 'lv624', creator: SO } })).status, 200);
});

await t('re-entry as a confirmed member needs that member\'s session; a knock learns nothing about the room', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  const crew = await joinMortar(env, r);
  const knock = await (await call(env, 'POST', `/room/${r.code}/join`, { body: { client: 'attacker-client-1', post: 'so' } })).json();
  const seen = await (await pollRoom(env, r, knock.session)).json();
  assert.deepStrictEqual(seen.presence, {});
  assert.strictEqual(seen.meta.lastOpAt, undefined);
  assert.deepStrictEqual(await errorOf(await call(env, 'POST', `/room/${r.code}/join`, { body: { client: 'client-mortar-01', postCode: r.mortarCode } })), [409, 'member']);
  assert.deepStrictEqual(await errorOf(await call(env, 'POST', `/room/${r.code}/join`, { body: { client: 'client-mortar-01', post: 'mortar' } })), [409, 'member']);
  assert.strictEqual((await pollRoom(env, r, crew)).status, 200, 'the real crew keeps its session');
  const back = await (await call(env, 'POST', `/room/${r.code}/join`, { session: crew, body: { client: 'client-mortar-01', postCode: r.mortarCode } })).json();
  assert.strictEqual(back.status, 'confirmed', 'with its own session the crew re-enters without a knock');
});

await t('writes: validation before rights, server fields only from stamps, puts never replace', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  const crew = await joinMortar(env, r);
  const mortar = () => r.room.state.objects['asset-mortar-1'];
  assert.strictEqual((await send(env, r, crew, [{ cid: 'r', op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { radius: '<img src=x onerror=alert(1)>', state: 'deployed' } }])).acks[0].error, 'radius');
  assert.strictEqual(mortar().radius, undefined);
  assert.ok((await send(env, r, crew, [{ cid: 'r2', op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { shell: 'RMCMortarShellHE', radius: 5.35 } }])).acks[0].seq);
  const put = await send(env, r, r.so, [{ cid: 'q', op: 'put', kind: 'request', id: 'q8', data: { type: 'mortar', target: { x: 1, y: 1, extra: '<b>' },
    note: 'гнездо', priority: 'urgent', flags: [], level: 0, h: 'ee8dd1d6d4a4', acceptedBy: { post: 'so', client: 'x' }, firedAt: 5, status: 'done' } }]);
  assert.ok(put.acks[0].seq, JSON.stringify(put.acks));
  const q8 = () => r.room.state.objects.q8;
  assert.deepStrictEqual([q8().target, q8().acceptedBy, q8().firedAt, q8().status], [{ x: 1, y: 1 }, undefined, undefined, 'requested']);
  assert.strictEqual((await send(env, r, r.so, [{ cid: 'n', op: 'patch', kind: 'request', id: 'q8', data: { note: 'ближе', target: { x: 9, y: 9 } } }])).acks[0].error, 'fields');
  assert.strictEqual((await send(env, r, r.so, [{ cid: 'd', op: 'put', kind: 'request', id: 'q9', data: { type: 'mortar', target: { x: 1, y: 1 }, deadlineAt: 'soon' } }])).acks[0].error, 'fields');
  assert.strictEqual((await send(env, r, r.so, [{ cid: 'o', op: 'put', kind: 'request', id: 'q10', data: { type: 'ob', target: { x: 1, y: 1 } } }])).acks[0].error, 'type');
  assert.strictEqual((await send(env, r, r.so, [{ cid: 'oa', op: 'patch', kind: 'request', id: 'q8', expectedStatus: 'requested', data: { status: 'accepted' } }])).acks[0].error, 'author');
  assert.strictEqual((await send(env, r, crew, [{ cid: 'st', op: 'put', kind: 'request', id: 'q8', data: { type: 'mortar', target: { x: 99, y: 99 } } }])).acks[0].error, 'exists');
  assert.deepStrictEqual(q8().target, { x: 1, y: 1 });
  assert.strictEqual((await send(env, r, crew, [{ cid: 'as', op: 'put', kind: 'asset', id: 'asset-mortar-1', data: { type: 'mortar', state: 'deployed' } }])).acks[0].error, 'exists');
  assert.strictEqual((await send(env, r, r.so, [{ cid: 'cl', op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { claimedBy: 'somebody-else-01' } }])).acks[0].error, 'right');
  assert.strictEqual(mortar().claimedBy, null);
  const accept = await send(env, r, crew, [{ cid: 'a', op: 'patch', kind: 'request', id: 'q8', expectedStatus: 'requested', data: { status: 'accepted', acceptedBy: { client: 'forged' } } }]);
  assert.ok(accept.acks[0].seq);
  assert.deepStrictEqual(q8().acceptedBy, { client: 'client-mortar-01', post: 'mortar', squad: null });
  const recall = await send(env, r, r.so, [{ cid: 'rc', op: 'patch', kind: 'request', id: 'q8', expectedStatus: 'accepted', data: { status: 'denied' } }]);
  assert.ok(recall.acks[0].seq, 'the author recalls an accepted request');
  assert.deepStrictEqual(q8().deniedBy, { client: SO.client, post: 'so', squad: null });
});

await t('a resent op gets its original ack and writes nothing, also after the room object reloads', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  const crew = await joinMortar(env, r);
  const put = { cid: 'q-1', op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 30, y: 40 } } };
  const first = await send(env, r, r.so, [put]);
  let rows = r.room.s.writes;
  assert.deepStrictEqual((await send(env, r, r.so, [put])).acks[0], { cid: 'q-1', seq: first.acks[0].seq, dup: true });
  assert.strictEqual(r.room.s.writes, rows, 'no row for a resent put');
  const accept = { cid: 'a-1', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } };
  const accepted = await send(env, r, crew, [accept]);
  rows = r.room.s.writes;
  assert.deepStrictEqual((await send(env, r, crew, [accept])).acks[0], { cid: 'a-1', seq: accepted.acks[0].seq, dup: true }, 'a resent accept is no status conflict');
  assert.strictEqual(r.room.s.writes, rows);
  const del = { cid: 'd-1', op: 'del', kind: 'request', id: 'q1' };
  assert.ok((await send(env, r, r.so, [del])).acks[0].seq);
  rows = r.room.s.writes;
  assert.strictEqual((await send(env, r, r.so, [Object.assign({}, del, { cid: 'd-2' })])).acks[0].dup, true, 'a del on a deleted object is a dup');
  assert.strictEqual(r.room.s.writes, rows);
  const noCid = { cid: '', op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { state: 'moving' } };
  const once = (await send(env, r, crew, [noCid])).acks[0];
  const twice = (await send(env, r, crew, [noCid])).acks[0];
  assert.ok(twice.seq > once.seq && !twice.dup, 'an empty cid is never de-duplicated');
  const name = [...env.ROOMS.instances.keys()].at(-1);
  env.ROOMS.instances.set(name, new Room({ storage: r.room.s, id: { name } }, env));   // evicted and woken again
  const woken = env.ROOMS.instances.get(name);
  rows = woken.s.writes;
  assert.deepStrictEqual((await send(env, r, crew, [accept])).acks[0], { cid: 'a-1', seq: accepted.acks[0].seq, dup: true });
  assert.strictEqual(woken.s.writes, rows);
  assert.strictEqual((await pollRoom(env, r, r.so)).headers.get('Retry-After'), '2', 'the request clock is rebuilt too');
  env.clock += 9 * 60 * 1000;
  assert.strictEqual((await (await pollRoom(env, r, r.so)).json()).meta.locked, true);
  assert.deepStrictEqual((await send(env, r, crew, [accept])).acks[0], { cid: 'a-1', seq: accepted.acks[0].seq, dup: true }, 'a locked room still answers a resend');
});

await t('chronology: numbered requests in Russian, the recall, the withdrawal, and bad input never breaks it', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  const crew = await joinMortar(env, r);
  assert.ok((await send(env, r, crew, [{ cid: 'c', op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [243, -218] } }])).acks[0].seq);
  env.clock += 1000;
  await send(env, r, r.so, [{ cid: 'q1', op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 10, y: 20 }, note: 'гнездо' } }]);
  await send(env, r, crew, [{ cid: 'a1', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } }]);
  await send(env, r, r.so, [{ cid: 'n1', op: 'patch', kind: 'request', id: 'q1', data: { note: 'ближе к воротам' } }]);
  await send(env, r, r.so, [{ cid: 'r1', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'accepted', data: { status: 'denied' } }]);
  await send(env, r, r.so, [{ cid: 'q2', op: 'put', kind: 'request', id: 'q2', data: { type: 'position', target: { x: 11, y: 21 } } }]);
  await send(env, r, r.so, [{ cid: 'w2', op: 'patch', kind: 'request', id: 'q2', expectedStatus: 'requested', data: { status: 'denied' } }]);
  await send(env, r, r.so, [{ cid: 'q3', op: 'put', kind: 'request', id: 'q3', data: { type: 'mortar', target: { x: 12, y: 22 } } }]);
  await send(env, r, crew, [{ cid: 'd3', op: 'patch', kind: 'request', id: 'q3', expectedStatus: 'requested', data: { status: 'denied', reason: 'нет снарядов' } }]);
  const res = await call(env, 'GET', `/room/${r.code}/export`, { session: r.so });
  assert.strictEqual(res.status, 200);
  const lines = (await res.json()).text.split('\n');
  assert.strictEqual(lines[0], 'Хронология комнаты. Время UTC.');
  for (const expected of [
    '18:00:00  Офицер штаба  подтвердил: Миномётный расчёт «Сидоров»',
    '18:00:01  Офицер штаба  запрос №1 «удар миномёта» 253 -198',
    '18:00:01  Миномётный расчёт  №1 «удар миномёта» 253 -198: принят',
    '18:00:01  Офицер штаба  №1 «удар миномёта» 253 -198: примечание «ближе к воротам»',
    '18:00:01  Офицер штаба  №1 «удар миномёта» 253 -198: отозвано штабом',
    '18:00:01  Офицер штаба  запрос №2 «позиция миномёта» 254 -197',
    '18:00:01  Офицер штаба  №2 «позиция миномёта» 254 -197: снят автором',
    '18:00:01  Миномётный расчёт  №3 «удар миномёта» 255 -196: отклонён — нет снарядов'
  ]) assert.ok(lines.includes(expected), 'missing: ' + expected + '\n' + lines.join('\n'));
  // The W3 line shapes; a patch whose put is not in the log takes type and target from the room state.
  const by = post => ({ client: 'c-' + post, post, squad: null });
  const objects = { q7: { id: 'q7', kind: 'request', type: 'mortar', target: { x: 10, y: 20 }, by: by('so') } };
  assert.strictEqual(chronology([{ seq: 1, at: Date.UTC(2026, 8, 13, 18, 5, 7), by: by('so'), op: 'put', kind: 'request', id: 'q7', data: { type: 'mortar', target: { x: 10, y: 20 } } }], STAGE1, [243, -218]),
    '18:05:07  Офицер штаба  запрос №1 «удар миномёта» 253 -198');
  const at = Date.UTC(2026, 8, 13, 18, 5, 21);
  assert.strictEqual(chronology([{ seq: 9, at, by: by('mortar'), op: 'patch', kind: 'request', id: 'q7', data: { status: 'accepted' } }], STAGE1, [243, -218], objects),
    '18:05:21  Миномётный расчёт  «удар миномёта» 253 -198: принят');
  assert.deepStrictEqual(chronology([
    { seq: 2, at, by: by('so'), op: 'patch', kind: 'request', id: 'nope', data: { note: 'x' } },
    { seq: 3, at, by: by('so'), op: 'put', kind: 'calibration', id: 'calibration', data: { offset: 'abc' } },
    { seq: 4, at: 'never', by: null, op: 'put', kind: 'marker', id: 'm', data: null }
  ], STAGE1, 'abc').split('\n'), ['18:05:21  Офицер штаба  nope: примечание «x»', '18:05:21  Офицер штаба  калибровка (неверная)', '--:--:--  ?  операция marker (не разобрана)']);
});

await t('unlock keeps everyone who was in the room; a heartbeat passes the lock; the last confirmer never idles out', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  const crew = await joinMortar(env, r);
  env.clock += 11 * 60 * 1000;
  assert.strictEqual((await (await pollRoom(env, r, r.so)).json()).meta.locked, true);
  const mine = Object.values(r.room.state.objects).find(o => o.kind === 'member' && o.client === 'client-mortar-01');
  assert.ok((await send(env, r, crew, [{ cid: 'hb', op: 'patch', kind: 'member', id: mine.id, data: { presentAt: 1 } }])).acks[0].seq, 'heartbeat while locked');
  assert.strictEqual(r.room.state.objects[mine.id].presentAt, env.clock);
  assert.strictEqual((await adminAs(env, r, r.so, { action: 'unlock' })).status, 200);
  assert.strictEqual((await pollRoom(env, r, r.so)).status, 200, 'the officer who pressed «Продолжить раунд» stays');
  assert.strictEqual((await pollRoom(env, r, crew)).status, 200);
  const alone = stage1Env();
  const a = await stage1Room(alone);
  alone.clock += 7 * 60 * 1000;
  const k = await (await call(alone, 'POST', `/room/${a.code}/join`, { body: { client: 'knock-client-01', post: 'mortar' } })).json();
  alone.clock += 4 * 60 * 1000;   // the officer is 11 minutes quiet, the room is not locked
  assert.strictEqual((await pollRoom(alone, a, k.session)).status, 200);
  assert.strictEqual((await pollRoom(alone, a, a.so)).status, 200, 'the only member who can confirm joins stays');
});

await t('knocks expire after the word time and at most four wait; the last confirmer cannot be released', async () => {
  const env = makeEnv();
  const room = await (await create(env)).json();
  const knock = (client, post, squad) => call(env, 'POST', `/room/${room.code}/join`, { body: { client, post, squad } });
  for (let i = 0; i < 4; i++) assert.strictEqual((await knock('flood-client-' + i, 'ftl', 'alpha')).status, 200);
  assert.deepStrictEqual(await errorOf(await knock('flood-client-4', 'ftl', 'bravo')), [429, 'knocks']);
  env.clock += 301 * 1000;
  assert.strictEqual((await call(env, 'GET', `/room/${room.code}/ops?since=0`, { session: room.session })).status, 200);
  assert.strictEqual([...env.ROOMS.instances.values()].at(-1).activeMembers().filter(m => !m.confirmed).length, 0, 'stale knocks are released');
  assert.strictEqual((await knock('late-client-01', 'ftl', 'alpha')).status, 200);
  env.clock += 30 * 60 * 1000;   // the room idles into a lock; the stale knock still goes
  assert.strictEqual((await (await call(env, 'GET', `/room/${room.code}/ops?since=0`, { session: room.session })).json()).meta.locked, true);
  assert.strictEqual([...env.ROOMS.instances.values()].at(-1).activeMembers().filter(m => !m.confirmed).length, 0, 'released from a locked room too');
  const env2 = stage1Env();
  const r = await stage1Room(env2);
  await joinMortar(env2, r);
  assert.strictEqual((await adminAs(env2, r, r.so, { action: 'release', client: 'client-mortar-01' })).status, 200);
  assert.strictEqual((await call(env2, 'POST', `/room/${r.code}/join`, { body: { client: 'client-mortar-02', postCode: r.mortarCode } })).status, 200,
    'a released post code works for the next crew');
  assert.deepStrictEqual(await errorOf(await adminAs(env2, r, r.so, { action: 'release', client: SO.client })), [409, 'last']);
});

await t('radio silence cannot lift an administration stop; a closed room refuses admin; extend waits for the warning', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  await routeRoom(new Request('https://w.example/stop/stories-k1/' + await stopSig(STOP, 'stop', 'stories-k1'), { method: 'POST' }), env);
  env.clock += 61000;
  assert.strictEqual((await (await pollRoom(env, r, r.so)).json()).meta.frozen.reason, 'stopped');
  assert.deepStrictEqual(await errorOf(await adminAs(env, r, r.so, { action: 'silence', on: false })), [423, 'stopped']);
  assert.deepStrictEqual(await errorOf(await call(env, 'POST', `/room/${r.code}/join`, { body: { client: 'late-client-01', post: 'mortar' } })), [423, 'stopped']);
  await routeRoom(new Request('https://w.example/start/stories-k1/' + await stopSig(STOP, 'start', 'stories-k1'), { method: 'POST' }), env);
  env.clock += 61000;
  assert.strictEqual((await (await pollRoom(env, r, r.so)).json()).meta.frozen, null, 'the stop lifts with the flag');
  assert.deepStrictEqual(await errorOf(await adminAs(env, r, r.so, { action: 'extend' })), [409, 'early']);
  assert.strictEqual((await adminAs(env, r, r.so, { action: 'close' })).status, 200);
  assert.deepStrictEqual(await errorOf(await adminAs(env, r, r.so, { action: 'close' })), [423, 'closed']);
  assert.strictEqual((await (await call(env, 'GET', '/health')).json()).active, 0, 'a closed room leaves the ceilings');
});

await t('observer link: off until staff mint it, export for staff or observer only, no knock words, gone after rotate', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  const crew = await joinMortar(env, r);
  assert.strictEqual((await call(env, 'GET', `/room/${r.code}/ops?since=0`, { observer: 'guessed-token-000000' })).status, 401);
  assert.deepStrictEqual(await errorOf(await call(env, 'GET', `/room/${r.code}/export`, { session: crew })), [403, 'right']);
  await call(env, 'POST', `/room/${r.code}/join`, { body: { client: 'knock-client-01', post: 'so' } });
  assert.strictEqual((await adminAs(env, r, crew, { action: 'observer' })).status, 403, 'only staff mint the link');
  const { observerToken } = await (await adminAs(env, r, r.so, { action: 'observer' })).json();
  const seen = await (await call(env, 'GET', `/room/${r.code}/ops?since=0`, { observer: observerToken })).json();
  assert.ok(seen.ops.some(o => o.kind === 'member' && o.data.confirmed === false), 'the knock is in the log');
  assert.ok(!seen.ops.some(o => o.kind === 'member' && o.data && 'word' in o.data), 'without its word');
  const snap = await (await call(env, 'GET', `/room/${r.code}/snapshot`, { observer: observerToken })).json();
  assert.ok(snap.objects.length && !snap.objects.some(o => 'word' in o));
  assert.strictEqual((await call(env, 'GET', `/room/${r.code}/export`, { observer: observerToken })).status, 200);
  const rotated = await (await adminAs(env, r, r.so, { action: 'rotate' })).json();
  assert.strictEqual((await call(env, 'GET', `/room/${rotated.code}/ops?since=0`, { observer: observerToken })).status, 401, 'rotate retires the observer link');
});

await t('rotate: the old code answers 401 rotated, unused sheet codes change, every alias leaves with the room', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  await joinMortar(env, r);
  const res = await (await adminAs(env, r, r.so, { action: 'rotate' })).json();
  assert.deepStrictEqual(await errorOf(await call(env, 'GET', `/room/${r.code}/ops?since=0`, { session: res.session })), [401, 'rotated']);
  env.clock += 61000;   // past the router's code cache: the registry tombstone answers
  assert.deepStrictEqual(await errorOf(await call(env, 'GET', `/room/${r.code}/ops?since=0`, { session: res.session })), [401, 'rotated']);
  const slot = s => s.post + ':' + s.squad;
  assert.deepStrictEqual(res.sheet.map(slot), r.c.sheet.map(slot), 'the same posts on the new sheet');
  const unused = r.c.sheet.find(s => s.code !== r.mortarCode);
  assert.ok(!res.sheet.some(s => s.code === unused.code), 'an unused code changed');
  assert.ok(res.sheet.some(s => s.code === r.mortarCode), 'a bound code stays with its holder');
  assert.deepStrictEqual(await errorOf(await call(env, 'POST', `/room/${res.code}/join`, { body: { client: 'leaked-sheet-01', postCode: unused.code } })), [404, 'postCode']);
  assert.strictEqual((await call(env, 'POST', `/room/${res.code}/join`, { body: { client: 'client-mortar-01', postCode: r.mortarCode } })).status, 200,
    'the evicted crew knocks again with its own code');
  const registry = env.REGISTRY.instances.get('main').ctx.storage;
  assert.ok(await registry.get('rotated:' + r.code));
  env.clock += 4 * 3600 * 1000;
  await r.room.alarm();
  env.clock += 3600 * 1000;
  await r.room.alarm();
  assert.strictEqual(await registry.get('rotated:' + r.code), undefined);
  assert.strictEqual(await registry.get('code:' + res.code), undefined);
});

await t('abandoned rooms lock on their alarm and free the ceiling; per-key cap; limiter, body and JSON bounds', async () => {
  const env = stage1Env({ ROOMS_MAX_CONCURRENT: '1' });
  const r = await stage1Room(env);
  assert.strictEqual(r.room.s.alarmAt, env.clock + 480 * 1000, 'the first alarm is the idle lock');
  env.clock += 9 * 60 * 1000;
  await r.room.alarm();
  assert.strictEqual(r.room.meta.locked, true);
  assert.strictEqual((await createStage1(env)).status, 200, 'the locked room left the ceiling');
  const keyed = stage1Env({ ROOMS_MAX_PER_KEY: '1' });
  await stage1Room(keyed);
  assert.deepStrictEqual(await errorOf(await createStage1(keyed)), [429, 'ceiling']);
  const limited = stage1Env({ ROOM_RL: { limit: async () => ({ success: false }) } });
  const lr = await stage1Room(limited);
  assert.deepStrictEqual(await errorOf(await pollRoom(limited, lr, lr.so)), [429, 'rate']);
  const big = JSON.stringify({ client: 'big-client-001', post: 'mortar', callsign: 'x'.repeat(3000) });
  assert.deepStrictEqual(await errorOf(await call(env, 'POST', `/room/${r.code}/join`, { raw: big })), [413, 'size']);
  const bad = await call(env, 'POST', `/room/${r.code}/ops`, { session: r.so, raw: '{not json' });
  assert.strictEqual(bad.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepStrictEqual(await errorOf(bad), [400, 'json']);
});

// ── Final review, 2026-09-14 ─────────────────────────────────────────
const padSeq = n => String(n).padStart(9, '0');
const eventsIn = body => body.ops.filter(o => o.kind === 'event').map(o => [o.data.event, o.by.post, o.id === 'evt-' + o.seq]);

await t('final review 1: an object id named after a prototype member is refused with id; such a row already in storage loads and the room keeps serving', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  const crew = await joinMortar(env, r);
  const reqPut = (cid, id) => ({ cid, op: 'put', kind: 'request', id, data: { type: 'mortar', target: { x: 1, y: 1 }, markerId: null } });
  assert.deepStrictEqual((await send(env, r, r.so, [reqPut('p', '__proto__')])).acks, [{ cid: 'p', error: 'id' }]);
  for (const id of ['constructor', 'prototype', '_lead', '-lead', 'a'.repeat(41)]) assert.strictEqual((await send(env, r, r.so, [reqPut('i', id)])).acks[0].error, 'id', id);
  assert.strictEqual(Object.getPrototypeOf(r.room.state.objects), Object.prototype);
  assert.ok(![...r.room.s.map.keys()].some(k => /__proto__|constructor|prototype/.test(k)), 'no row was written');
  // A row written before ids were checked: the room object reloads without it, polls and every later write work.
  const seq = r.room.state.seq + 1, by = { client: SO.client, post: 'so', squad: null };
  const data = { type: 'mortar', target: { x: 1, y: 1 }, markerId: null, status: 'requested' };
  await r.room.s.put({ 'obj:__proto__': Object.assign({ id: '__proto__', kind: 'request', seq, at: env.clock, by, layer: 'requests' }, data),
    ['op:' + padSeq(seq)]: { seq, at: env.clock, by, op: 'put', kind: 'request', id: '__proto__', data, cid: 'old' } });
  const name = [...env.ROOMS.instances.keys()].at(-1);
  env.ROOMS.instances.set(name, new Room({ storage: r.room.s, id: { name } }, env));
  const woken = env.ROOMS.instances.get(name);
  const polled = await pollRoom(env, r, r.so);
  assert.strictEqual(polled.status, 200);
  assert.ok((await polled.json()).ops.some(o => o.id === '__proto__'), 'the old op stays in the log for the export');
  assert.deepStrictEqual([Object.getPrototypeOf(woken.state.objects) === Object.prototype, woken.state.seq], [true, seq]);
  assert.ok((await send(env, r, r.so, [{ cid: 'q', op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 2, y: 2 } } }])).acks[0].seq);
  assert.ok((await send(env, r, crew, [{ cid: 'a', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } }])).acks[0].seq,
    'a patch batch reads the claimants without throwing');
  assert.strictEqual((await send(env, r, r.so, [{ cid: 'd', op: 'del', kind: 'request', id: '__proto__' }])).acks[0].error, 'id');
  assert.strictEqual((await call(env, 'GET', `/room/${r.code}/snapshot`, { session: r.so })).status, 200);
});

await t('final review 2: radio silence, the administration stop and start, the idle lock, «Продолжить раунд» and close are journal events in the export', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  await joinMortar(env, r);
  const hhmmss = () => new Date(env.clock).toISOString().slice(11, 19);
  const expected = [];
  const expect = (who, text) => expected.push(hhmmss() + '  ' + who + '  ' + text);
  env.clock += 1000;
  assert.strictEqual((await adminAs(env, r, r.so, { action: 'silence', on: true })).status, 200);
  expect('Офицер штаба', 'радиомолчание включено');
  assert.strictEqual((await adminAs(env, r, r.so, { action: 'silence', on: true })).status, 200, 'a second «on» adds no line');
  env.clock += 1000;
  assert.strictEqual((await adminAs(env, r, r.so, { action: 'silence', on: false })).status, 200);
  expect('Офицер штаба', 'радиомолчание выключено');
  await routeRoom(new Request('https://w.example/stop/stories-k1/' + await stopSig(STOP, 'stop', 'stories-k1'), { method: 'POST' }), env);
  env.clock += 61000;
  assert.strictEqual((await (await pollRoom(env, r, r.so)).json()).meta.frozen.reason, 'stopped');
  expect('Администрация', 'комната остановлена рубильником администрации');
  await routeRoom(new Request('https://w.example/start/stories-k1/' + await stopSig(STOP, 'start', 'stories-k1'), { method: 'POST' }), env);
  env.clock += 61000;
  assert.strictEqual((await (await pollRoom(env, r, r.so)).json()).meta.frozen, null);
  expect('Администрация', 'рубильник администрации снят');
  env.clock += 9 * 60 * 1000;   // journal events are no activity: the lock counts from the confirm
  assert.strictEqual((await (await pollRoom(env, r, r.so)).json()).meta.locked, true);
  expect('Система', 'комната заблокирована: 8 минут без действий');
  assert.strictEqual((await adminAs(env, r, r.so, { action: 'unlock' })).status, 200);
  expect('Офицер штаба', 'раунд продолжен после простоя');
  env.clock += 1000;
  assert.strictEqual((await adminAs(env, r, r.so, { action: 'close' })).status, 200);
  expect('Офицер штаба', 'комната закрыта');
  const body = await (await call(env, 'GET', `/room/${r.code}/export`, { session: r.so })).json();
  const lines = body.text.split('\n');
  assert.deepStrictEqual(lines.filter(l => expected.includes(l)), expected, lines.join('\n'));
  assert.deepStrictEqual(eventsIn(body), [['silence_on', 'so', true], ['silence_off', 'so', true], ['stop', 'system', true], ['start', 'system', true],
    ['lock', 'system', true], ['unlock', 'so', true], ['close', 'so', true]]);
  assert.ok(!body.objects.some(o => o.kind === 'event') && !Object.values(r.room.state.objects).some(o => o.kind === 'event'), 'no event object');
  assert.ok(![...r.room.s.map.keys()].some(k => k.startsWith('obj:evt-')), 'an event is one row, the op');
  assert.strictEqual(r.room.countObjects(), 1, 'events never count toward limits.objects');
  // The lifetime close by the alarm is the system's own line.
  const late = stage1Env();
  const lr = await stage1Room(late);
  late.clock += STAGE1.ttl.roomMaxSec * 1000;
  await lr.room.alarm();
  const lateText = (await (await call(late, 'GET', `/room/${lr.code}/export`, { session: lr.so })).json()).text;
  assert.ok(lateText.split('\n').includes(hhmmssOf(late.clock) + '  Система  комната закрыта'), lateText);
});
function hhmmssOf(t) { return new Date(t).toISOString().slice(11, 19); }

await t('final review 3: a Room or Registry object that throws answers 503 internal with CORS, never a bare 500', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  const rooms = env.ROOMS, logged = [];
  const error = console.error;
  console.error = (...a) => logged.push(a.join(' '));
  try {
    env.ROOMS = { idFromName: rooms.idFromName, get: () => ({ fetch: () => { throw new Error('room object exploded'); } }) };
    let res = await pollRoom(env, r, r.so);
    assert.deepStrictEqual([res.status, res.headers.get('Access-Control-Allow-Origin'), (await res.json()).error], [503, ORIGIN, 'internal']);
    env.ROOMS = { idFromName: rooms.idFromName, get: () => ({ fetch: async () => { throw new Error('room object rejected'); } }) };
    res = await call(env, 'POST', `/room/${r.code}/ops`, { session: r.so, body: { ops: [] } });
    assert.deepStrictEqual([res.status, res.headers.get('Access-Control-Allow-Origin'), (await res.json()).error], [503, ORIGIN, 'internal']);
    env.ROOMS = rooms;
    const far = stage1Env({ clock: Date.UTC(2031, 0, 1) });
    far.REGISTRY = { idFromName: n => ({ name: n }), get: () => ({ fetch: () => Promise.reject(new Error('registry down')) }) };
    res = await call(far, 'GET', '/health');
    assert.deepStrictEqual([res.status, res.headers.get('Access-Control-Allow-Origin'), (await res.json()).error], [503, ORIGIN, 'internal']);
    res = await call(far, 'GET', '/health', { origin: 'https://evil.example' });
    assert.deepStrictEqual([res.status, res.headers.get('Access-Control-Allow-Origin')], [403, null], 'a foreign origin still gets no CORS');
    assert.strictEqual(logged.length, 3, 'each failure is logged for wrangler tail');
  } finally {
    console.error = error;
  }
  assert.strictEqual((await pollRoom(env, r, r.so)).status, 200, 'the room itself is fine');
});

await t('final review 4 and 5: the calibration id belongs to the calibration; purge never deletes the seeded assets', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  const crew = await joinMortar(env, r);
  assert.strictEqual((await send(env, r, r.so, [{ cid: 'h', op: 'put', kind: 'request', id: 'calibration', data: { type: 'mortar', target: { x: 1, y: 1 } } }])).acks[0].error, 'id');
  assert.ok((await send(env, r, crew, [{ cid: 'c', op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [243, -218] } }])).acks[0].seq, 'the crew still publishes it');
  for (const raw of [{ op: 'patch', kind: 'request', data: { note: 'x' } }, { op: 'del', kind: 'marker' }]) {
    assert.strictEqual((await send(env, r, r.so, [Object.assign({ cid: 'x', id: 'calibration' }, raw)])).acks[0].error, 'id', raw.op + ' ' + raw.kind);
  }
  assert.deepStrictEqual(r.room.state.objects.calibration.offset, [243, -218]);
  assert.ok((await send(env, r, r.so, [{ cid: 'q', op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 1, y: 1 } } }])).acks[0].seq);
  assert.strictEqual((await adminAs(env, r, r.so, { action: 'purge', client: 'room' })).status, 200);
  assert.strictEqual(r.room.state.objects['asset-mortar-1'].deleted, undefined, 'the mortar survives a purge of the system client');
  assert.strictEqual((await adminAs(env, r, r.so, { action: 'purge', client: SO.client })).status, 200);
  assert.deepStrictEqual([r.room.state.objects.q1.deleted, r.room.state.objects['asset-mortar-1'].deleted], [true, undefined], 'a real client\'s objects still go');
});

await t('final review 6: POST /room refuses a body over 2 KB by Content-Length and by its bytes before the token; /health is cached for 30 s', async () => {
  const env = stage1Env();
  const heavy = JSON.stringify({ token, planet: 'lv624', creator: Object.assign({}, SO, { callsign: 'я'.repeat(1100) }) });
  assert.ok(heavy.length < 2048 && new TextEncoder().encode(heavy).length > 2048, 'counted in bytes, not characters');
  assert.deepStrictEqual(await errorOf(await call(env, 'POST', '/room', { keyId: 'stories-k1', raw: heavy })), [413, 'size']);
  assert.deepStrictEqual(await errorOf(await call(env, 'POST', '/room', { keyId: 'stories-k1', raw: JSON.stringify({ token: 'x'.repeat(2100) }) })), [413, 'size'],
    'a big forged token is refused before it is verified (403 sanction otherwise)');
  const declared = new Request('https://w.example/room', { method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Room-Key-Id': 'stories-k1', 'Content-Length': '4096' },
    body: JSON.stringify({ token, planet: 'lv624', creator: SO }) });
  assert.deepStrictEqual(await errorOf(await routeRoom(declared, env)), [413, 'size'], 'a declared length is refused before the read');
  assert.strictEqual((await createStage1(env)).status, 200, 'a real create fits');
  const far = stage1Env({ clock: Date.UTC(2030, 0, 1) });
  const reg = far.REGISTRY;
  let asked = 0;
  far.REGISTRY = { idFromName: reg.idFromName, get: id => ({ fetch: (u, i) => { if (String(u).endsWith('/health')) asked++; return reg.get(id).fetch(u, i); } }) };
  assert.deepStrictEqual(await (await call(far, 'GET', '/health')).json(), { active: 0, today: 0 });
  far.clock += 29000;
  assert.strictEqual((await call(far, 'GET', '/health')).status, 200);
  assert.strictEqual(asked, 1, 'a second /health within 30 s costs no registry request');
  far.clock += 2000;
  await call(far, 'GET', '/health');
  assert.strictEqual(asked, 2, 'after 30 s it asks again');
});

await t('final review 7: the author withdraws a request only while it waits or is accepted, never once it fires', async () => {
  const env = stage1Env();
  const r = await stage1Room(env);
  const crew = await joinMortar(env, r);
  const status = (cid, who, from, to) => send(env, r, who, [{ cid, op: 'patch', kind: 'request', id: 'q1', expectedStatus: from, data: { status: to } }]);
  assert.ok((await send(env, r, r.so, [{ cid: 'q', op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 1, y: 1 } } }])).acks[0].seq);
  assert.ok((await status('a', crew, 'requested', 'accepted')).acks[0].seq);
  assert.ok((await status('f', crew, 'accepted', 'firing')).acks[0].seq);
  assert.strictEqual((await status('w', r.so, 'firing', 'denied')).acks[0].error, 'author');
  assert.strictEqual(r.room.state.objects.q1.status, 'firing');
  assert.ok((await status('d', crew, 'firing', 'done')).acks[0].seq, 'the crew finishes it');
});

console.log('OK', passed, 'cases');

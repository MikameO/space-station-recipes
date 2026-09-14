// scripts/test_room_client_worker.mjs — the real RoomClient over HttpTransport against the real Worker
// in-process, and the same Stage 1 evening through FixtureTransport: both must tell the same story.
// Run: node scripts/test_room_client_worker.mjs
import assert from 'node:assert';
import { routeRoom } from '../worker/room/router.js';
import { Room } from '../worker/room/room.js';
import { Registry } from '../worker/room/registry.js';
import { signServerToken } from '../worker/room/crypto.js';
import K from './test_room_client_kit.js';

const ORIGIN = 'https://mikameo.github.io';
const SECRET = 'test-key-secret';
const START = Date.UTC(2026, 8, 13, 18, 0, 0);
const clone = v => (v === undefined ? undefined : structuredClone(v));

// The fake Durable Object storage of scripts/test_room_worker.mjs.
class FakeStorage {
  constructor() { this.map = new Map(); this.alarmAt = null; }
  async get(k) {
    if (Array.isArray(k)) { const m = new Map(); for (const x of k) if (this.map.has(x)) m.set(x, clone(this.map.get(x))); return m; }
    return clone(this.map.get(k));
  }
  async put(k, v) {
    if (typeof k === 'object') { for (const [kk, vv] of Object.entries(k)) this.map.set(kk, clone(vv)); return; }
    this.map.set(k, clone(v));
  }
  async delete(k) {
    const keys = Array.isArray(k) ? k : [k]; let n = 0;
    for (const x of keys) if (this.map.delete(x)) n++;
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
    idFromName: name => ({ name, toString: () => name }),
    get: id => ({
      fetch: (input, init) => {
        if (!inst.has(id.name)) inst.set(id.name, new Klass({ storage: new FakeStorage(), id }, env));
        return inst.get(id.name).fetch(input instanceof Request ? input : new Request(input, init));
      }
    })
  };
}

const kit = K.load();
const { T, F, clock, STAGE1 } = kit;

// One evening; every observable outcome goes into the story as [step, JSON].
async function evening(transport, token, keyId) {
  const story = [];
  const note = (step, v) => story.push([step, JSON.stringify(v)]);
  const mk = (id, storage) => new T.RoomClient({ transport, storage: storage || T.makeStorage(K.fakeLocalStorage()), policy: STAGE1,
    fork: 'stories_cm', planet: 'lv624', h: 'h1', now: kit.now, clientId: id });
  const tick = () => { clock.t += 1100; };
  const so = mk('client-so-00001'), mo = mk('client-mortar-01'), mo2 = mk('client-mortar-02');

  const bad = mk('client-bad-00001');
  await bad.createRoom({ token, keyId, post: 'mortar' });
  note('create as mortar', [bad.status, bad.error]);
  await so.createRoom({ token, keyId, post: 'so', callsign: 'Орлов' });
  note('create as so', [so.status, so.error, so.me && so.me.post, so.sheet.map(s => s.post), so.visible({ kinds: ['asset'] }).map(a => a.id), so.room.seq]);
  const codes = so.sheet.filter(s => s.post === 'mortar').map(s => s.code);

  await mo.join({ entry: (so.code + '-' + codes[0]).toLowerCase(), callsign: 'Сидоров' });
  note('mortar knocks', [mo.status, mo.error, !!mo.word, mo.room.seq]);
  await so.poll();
  const knock = so.members().find(m => !m.confirmed);
  note('so sees the knock', [knock && knock.client, knock && knock.post, knock && knock.callsign]);
  const confirm = await so.admin('confirm', { client: mo.client });
  note('so confirms', [confirm.status, confirm.body.seq]);
  await mo.poll();
  note('mortar in', [mo.status, mo.me && mo.me.post, mo.members().map(m => m.post), mo.room.seq]);

  tick();
  const put = await so.queue({ op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 62, y: -62 }, note: ' Гнездо  у Nexus ', priority: 'urgent', flags: [] } });
  note('so puts a request', [put, so.requests().map(r => [r.id, r.status, r.note, !!r.pending]), so.retryAfter, so.pending.length]);
  await mo.poll();
  note('mortar sees it', mo.requests().map(r => [r.id, r.status, r.by.post]));

  await mo2.join({ entry: so.code + '-' + codes[1] });
  await so.poll();
  await so.admin('confirm', { client: mo2.client });
  await mo2.poll();
  note('second crew in', [mo2.status, mo2.requests().map(r => r.status)]);

  tick();
  const acc = await mo.queue({ op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } });
  note('crew accepts', [acc, mo.requests()[0].status, mo.requests()[0].acceptedBy]);
  tick();
  const late = await mo2.queue({ op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } });
  note('second crew accepts late', [late, mo2.requests()[0].status, mo2.pending.length]);
  for (const [from, to] of [['accepted', 'firing'], ['firing', 'done']]) {
    tick();
    note('crew ' + to, await mo.queue({ op: 'patch', kind: 'request', id: 'q1', expectedStatus: from, data: { status: to } }));
  }
  const r = mo.requests()[0];
  note('server stamps', [r.status, typeof r.firedAt, typeof r.doneAt]);

  tick();
  const cal = await mo.queue({ op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [212, -148] } });
  const asset = await mo.queue({ op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { tile: [20, -98], state: 'deployed' } });
  const present = await mo.queue({ op: 'patch', kind: 'member', id: mo.me.id, data: { presentAt: 1 } });
  note('crew calibration, mortar, presence', [cal.ok, asset.ok, present.ok, mo.calibration().offset, mo.visible({ kinds: ['asset'] }).map(a => [a.state, a.tile])]);

  const minted = await so.admin('observer');
  const obs = mk('client-obs-00001');
  await obs.observe(so.code, so.observerToken);
  const ex = await obs.exportRoom();
  note('observer', [minted.status, !!so.observerToken, obs.status, obs.error, obs.requests().length, ex.status, !!(ex.body && ex.body.ops.length)]);

  await so.admin('silence', { on: true });
  tick();
  const hush = await mo.queue({ op: 'put', kind: 'request', id: 'q2', data: { type: 'position', target: { x: 30, y: -90 }, priority: 'normal', flags: [] } });
  note('op during radio silence', [hush, mo.pending.length, mo.meta.frozen && mo.meta.frozen.reason]);
  await so.admin('silence', { on: false });

  const mr = await mo.admin('rotate');
  note('crew tries rotate', [mr.status, mo.error, mo.status]);
  tick();
  const oldCode = so.code;
  const rr = await so.admin('rotate');
  note('so rotates', [rr.status, so.code !== oldCode, so.status, so.observerToken, so.members().map(m => m.post), so.requests().map(x => x.id)]);
  await mo.poll();
  // The Worker answers a rotated code with 401 'rotated'; before that change, with 401 'code' from its cache.
  note('crew after rotate', [mo.status, ['rotated', 'code'].includes(mo.error) ? 'rotated' : mo.error, mo.session]);
  tick();
  await mo.join({ entry: so.code + '-' + codes[0], callsign: 'Сидоров' });
  note('crew knocks at the new code', [mo.status, mo.error]);
  return story;
}

const env = {
  ALLOWED_ORIGINS: ORIGIN, ROOMS_ENABLED: '1', ROOMS_MAX_CONCURRENT: '6', ROOMS_MAX_DAILY: '30',
  ROOM_KEYS: JSON.stringify({ 'stories-k1': SECRET }), ROOM_STOP_SECRET: 'stop', POLICIES: { stories_cm: STAGE1 },
  NOW: kit.now
};
env.ROOMS = namespace(Room, env);
env.REGISTRY = namespace(Registry, env);
const workerFetch = (url, init) => routeRoom(new Request(url, { method: init.method, headers: Object.assign({ Origin: ORIGIN }, init.headers), body: init.body }), env);

clock.t = START;
const token = await signServerToken(SECRET, { fork: 'stories_cm', server: 'Space Stories', keyId: 'stories-k1', iat: 1 });
const worker = await evening(new T.HttpTransport('https://w.example', workerFetch), token, 'stories-k1');
clock.t = START;
const fixture = await evening(new F.FixtureTransport(STAGE1, { now: kit.now }), 'demo', 'demo');

const step = (story, name) => JSON.parse(story.find(s => s[0] === name)[1]);
assert.deepStrictEqual(step(worker, 'create as mortar'), ['idle', 'creator']);
assert.deepStrictEqual(step(worker, 'mortar in').slice(0, 2), ['in', 'mortar']);
assert.strictEqual(step(worker, 'so puts a request')[0].ok, true);
assert.strictEqual(step(worker, 'crew accepts')[1], 'accepted');
assert.deepStrictEqual(step(worker, 'second crew accepts late')[0], { ok: false, error: 'status', status: 'accepted' });
assert.deepStrictEqual(step(worker, 'op during radio silence')[0], { ok: false, error: 'silence', status: 423 });
assert.deepStrictEqual(step(worker, 'crew after rotate'), ['expired', 'rotated', null]);
assert.deepStrictEqual(step(worker, 'crew knocks at the new code'), ['knocking', null]);

assert.strictEqual(worker.length, fixture.length);
const diffs = worker.map((w, i) => [w[0], w[1], fixture[i][1]]).filter(d => d[1] !== d[2]);
for (const [name, w, f] of diffs) console.log('differs: ' + name + '\n  worker  ' + w + '\n  fixture ' + f);
assert.deepStrictEqual(diffs.map(d => d[0]), []);
for (const [name] of worker) console.log('ok', name);
console.log('OK parity', worker.length, 'steps');

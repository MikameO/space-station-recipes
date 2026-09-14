// scripts/test_room_client_worker.mjs — the real RoomClient over HttpTransport against the real Worker
// in-process, and the same evenings through FixtureTransport: both must tell the same story.
// The Worker is the source of truth: its story is pinned below, then the fixture's must match it step by step.
// Run: node scripts/test_room_client_worker.mjs
import assert from 'node:assert';
import { routeRoom } from '../worker/room/router.js';
import { Room } from '../worker/room/room.js';
import { Registry } from '../worker/room/registry.js';
import { signServerToken } from '../worker/room/crypto.js';
import K from './test_room_client_kit.js';

const ORIGIN = 'https://mikameo.github.io';
// v2: the Worker refuses server key secrets shorter than 24 characters (crypto.js MIN_SECRET_LENGTH).
const SECRET = 'test-key-secret-0123456789';
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
const FULL = K.policy('full');
const tick = () => { clock.t += 1100; };

// The Worker in-process behind HttpTransport, one fresh Worker per run.
function workerTransport(policy) {
  const env = {
    ALLOWED_ORIGINS: ORIGIN, ROOMS_ENABLED: '1', ROOMS_MAX_CONCURRENT: '6', ROOMS_MAX_DAILY: '30',
    ROOM_KEYS: JSON.stringify({ 'stories-k1': SECRET }), ROOM_STOP_SECRET: 'test-stop-secret-0123456789', POLICIES: { stories_cm: policy },
    NOW: kit.now
  };
  env.ROOMS = namespace(Room, env);
  env.REGISTRY = namespace(Registry, env);
  return new T.HttpTransport('https://w.example', (url, init) =>
    routeRoom(new Request(url, { method: init.method, headers: Object.assign({ Origin: ORIGIN }, init.headers), body: init.body }), env));
}

// While echo.on, the next send reaches the room twice and the client reads the second answer.
function echoing(transport) {
  const echo = { on: false, first: null, second: null };
  const tx = { echo };
  for (const m of ['create', 'join', 'poll', 'snapshot', 'send', 'admin', 'exportRoom', 'getPolicy']) tx[m] = (...a) => transport[m](...a);
  tx.send = async (...a) => {
    if (!echo.on) return transport.send(...a);
    echo.on = false;
    echo.first = await transport.send(...a);
    echo.second = await transport.send(...a);
    return echo.second;
  };
  return tx;
}
// Acks without their random cids: [cid type, seq, dup, error].
const ackShape = r => r.body.acks.map(a => [typeof a.cid, a.seq, a.dup === true, a.error || null]);
// Journal events in an export: [seq, id, event, who].
const eventsOf = r => (r.body && Array.isArray(r.body.ops) ? r.body.ops : []).filter(o => o.kind === 'event').map(o => [o.seq, o.id, o.data.event, o.by.post]);

// Stage 1, one evening; every observable outcome goes into the story as [step, JSON].
async function evening(transport, token, keyId) {
  const story = [];
  const note = (step, v) => story.push([step, JSON.stringify(v)]);
  const tx = echoing(transport);
  const mk = (id, storage) => new T.RoomClient({ transport: tx, storage: storage || T.makeStorage(K.fakeLocalStorage()), policy: STAGE1,
    fork: 'stories_cm', planet: 'lv624', h: 'h1', now: kit.now, clientId: id });
  const so = mk('client-so-00001'), mo = mk('client-mortar-01'), mo2 = mk('client-mortar-02');
  const byId = (c, id) => c.requests().find(r => r.id === id);

  const bad = mk('client-bad-00001');
  await bad.createRoom({ token, keyId, post: 'mortar' });
  note('create as mortar', [bad.status, bad.error]);
  await so.createRoom({ token, keyId, post: 'so', callsign: 'Орлов' });
  note('create as so', [so.status, so.error, so.me && so.me.post, so.sheet.map(s => s.post), so.observerToken,
    so.visible({ kinds: ['asset'] }).map(a => a.id), so.room.seq]);
  const codes = so.sheet.filter(s => s.post === 'mortar').map(s => s.code);

  await mo.join({ entry: (so.code + '-' + codes[0]).toLowerCase(), callsign: 'Сидоров' });
  note('mortar knocks', [mo.status, mo.error, !!mo.word, mo.room.seq, mo.presence, mo.meta && mo.meta.lastOpAt]);
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
  note('crew accepts', [acc, byId(mo, 'q1').status, byId(mo, 'q1').acceptedBy]);
  tick();
  const late = await mo2.queue({ op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } });
  note('second crew accepts late', [late, byId(mo2, 'q1').status, mo2.pending.length]);
  for (const [from, to] of [['accepted', 'firing'], ['firing', 'done']]) {
    tick();
    note('crew ' + to, await mo.queue({ op: 'patch', kind: 'request', id: 'q1', expectedStatus: from, data: { status: to } }));
  }
  const q1 = byId(mo, 'q1');
  note('server stamps', [q1.status, typeof q1.firedAt, typeof q1.doneAt]);

  // v2: a put never replaces a live object; the same id from another client is 'exists'.
  tick();
  const foreign = await mo.queue({ op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 1, y: 1 } } });
  note('foreign put', [foreign, mo.pending.length, byId(mo, 'q1').target]);

  // v2: the author never carries a request out, and a status patch carries only status and reason.
  tick();
  await so.queue({ op: 'put', kind: 'request', id: 'qw', data: { type: 'position', target: { x: 30, y: -90 }, priority: 'normal', flags: [] } });
  const own = await so.queue({ op: 'patch', kind: 'request', id: 'qw', expectedStatus: 'requested', data: { status: 'accepted' } });
  const noted = await so.queue({ op: 'patch', kind: 'request', id: 'qw', expectedStatus: 'requested', data: { status: 'denied', note: 'x' } });
  note('author accepts own request', [own, noted]);
  // v2: the author withdraws a waiting request (canWrite before the server stamps deniedBy).
  const withdraw = await so.queue({ op: 'patch', kind: 'request', id: 'qw', expectedStatus: 'requested', data: { status: 'denied', reason: 'не нужно' } });
  note('author withdraws a waiting request', [withdraw, byId(so, 'qw').status, byId(so, 'qw').reason, byId(so, 'qw').deniedBy]);
  // v2: the author recalls an accepted one; the crew's accept is stamped acceptedBy after the rights check.
  tick();
  await so.queue({ op: 'put', kind: 'request', id: 'qr', data: { type: 'mortar', target: { x: 40, y: -80 }, priority: 'urgent', flags: [] } });
  tick();
  const crewTakes = await mo.queue({ op: 'patch', kind: 'request', id: 'qr', expectedStatus: 'requested', data: { status: 'accepted' } });
  tick();
  const recall = await so.queue({ op: 'patch', kind: 'request', id: 'qr', expectedStatus: 'accepted', data: { status: 'denied' } });
  note('author recalls an accepted request', [crewTakes, recall, byId(so, 'qr').status, byId(so, 'qr').acceptedBy, byId(so, 'qr').deniedBy]);

  tick();
  const cal = await mo.queue({ op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [212, -148] } });
  const asset = await mo.queue({ op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { tile: [20, -98], state: 'deployed' } });
  const present = await mo.queue({ op: 'patch', kind: 'member', id: mo.me.id, data: { presentAt: 1 } });
  const assetPut = await mo.queue({ op: 'put', kind: 'asset', id: 'asset-mortar-9', data: { type: 'mortar', state: 'deployed' } });
  note('crew calibration, mortar, presence', [cal.ok, asset.ok, present.ok, assetPut, mo.calibration().offset, mo.visible({ kinds: ['asset'] }).map(a => [a.id, a.state, a.tile])]);

  // v2: a resent op is answered from the Worker's memory with dup:true and the first seq; the client takes it as accepted.
  tick();
  tx.echo.on = true;
  const twice = await mo.queue({ op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { state: 'moving' } });
  note('resent op acked dup', [twice, ackShape(tx.echo.first), ackShape(tx.echo.second), mo.pending.length,
    mo.visible({ kinds: ['asset'] }).map(a => a.state)]);

  // v2: re-entering a confirmed seat takes that member's own session (X-Room-Session); a bare client id is 409 member.
  tick();
  const stranger = mk('client-mortar-01');
  await stranger.join({ entry: so.code + '-' + codes[0] });
  note('re-join without the session', [stranger.status, stranger.error, stranger.session]);
  await mo.join({ entry: so.code + '-' + codes[0], callsign: 'Сидоров' });
  note('re-join with the session', [mo.status, mo.error, mo.word, mo.me && mo.me.post, mo.members().length]);

  // v2: no observer link until staff mint one with the observer action; export is for staff and the observer only.
  const guess = mk('client-obs-00000');
  await guess.observe(so.code, 'guessed-token-000000000000');
  const crewExport = await mo.exportRoom();
  const minted = await so.admin('observer');
  const obs = mk('client-obs-00001');
  await obs.observe(so.code, so.observerToken);
  const ex = await obs.exportRoom();
  note('observer', [guess.status, guess.error, crewExport.status, crewExport.body.error, minted.status, Object.keys(minted.body).sort(),
    !!so.observerToken, obs.status, obs.error, obs.requests().length, ex.status, !!(ex.body && ex.body.ops.length), /"word"/.test(JSON.stringify(ex.body))]);

  await so.admin('silence', { on: true });
  tick();
  const hush = await mo.queue({ op: 'put', kind: 'request', id: 'q2', data: { type: 'position', target: { x: 30, y: -90 }, priority: 'normal', flags: [] } });
  // v2: a batch of presence heartbeats passes radio silence.
  const beat = await mo.queue({ op: 'patch', kind: 'member', id: mo.me.id, data: { presentAt: 1 } });
  note('op during radio silence', [hush, beat.ok, mo.pending.length, mo.meta.frozen && mo.meta.frozen.reason]);
  await so.admin('silence', { on: false });
  // Final review: radio silence leaves journal events; clients move past them and never show them.
  const hushLog = await so.exportRoom();
  await mo.poll();
  note('radio silence in the journal', [hushLog.status, eventsOf(hushLog), so.room.seq, mo.room.seq,
    [so, mo].map(c => c.visible({ kinds: ['event'] }).length + c.members().filter(m => m.kind !== 'member').length)]);

  const mr = await mo.admin('rotate');
  note('crew tries rotate', [mr.status, mo.error, mo.status]);
  // v2: extend waits for the warning 20 minutes before the deadline.
  const ext = await so.admin('extend');
  note('extend before the warning', [ext.status, ext.body.error, so.error]);

  tick();
  const oldCode = so.code, oldSheet = so.sheet;
  const rr = await so.admin('rotate');
  // v2: rotate answers {ok, code, sheet, session, seq, serverNow}; unused post codes change, bound ones stay.
  note('so rotates', [rr.status, Object.keys(rr.body).sort(), so.code !== oldCode, so.code === rr.body.code, so.status, so.observerToken,
    so.members().map(m => m.post), so.requests().map(x => x.id), so.sheet.map(s => s.post),
    so.sheet.filter(s => codes.includes(s.code)).length, so.sheet.filter(s => oldSheet.some(o => o.code === s.code)).length]);
  await mo.poll();
  // v2: a rotated code always answers 401 rotated.
  note('crew after rotate', [mo.status, mo.error, mo.session]);
  tick();
  await mo.join({ entry: so.code + '-' + codes[0], callsign: 'Сидоров' });
  note('crew knocks at the new code', [mo.status, mo.error]);
  const leaked = mk('client-leaked-001'), xeno = mk('client-xeno-00001');
  await leaked.join({ entry: so.code + '-' + oldSheet.find(s => s.post === 'so').code });
  // v2: a code bound to another client answers like an unknown one: 404 postCode ('used' is gone).
  await xeno.join({ entry: so.code + '-' + codes[1] });
  note('leaked or bound post codes after rotate', [leaked.status, leaked.error, xeno.status, xeno.error]);

  // Final review: the idle lock, «Продолжить раунд» and close are journal events too, and the room reads the same around them.
  clock.t += (STAGE1.ttl.roomIdleLockSec + 60) * 1000;
  await so.poll();
  const lockedSeen = !!(so.meta && so.meta.locked);
  const kinds = c => c.visible().map(o => o.kind).sort().join();
  const before = kinds(so);
  const unlock = await so.admin('unlock');
  tick();
  const close = await so.admin('close');
  const closedLog = await so.exportRoom();
  note('lock, unlock and close in the journal', [lockedSeen, unlock.status, close.status, so.status, eventsOf(closedLog).slice(-3),
    so.room.seq === closedLog.body.ops[closedLog.body.ops.length - 1].seq, kinds(so) === before, so.members().map(m => m.post)]);
  return story;
}

// The knock cap needs more seats than Stage 1 has: its five seats less the creator are exactly four knocks,
// so a fifth knock there is always 'full'. The full policy has room for a crowd.
async function crowd(transport, token, keyId) {
  const story = [];
  const note = (step, v) => story.push([step, JSON.stringify(v)]);
  const mk = id => new T.RoomClient({ transport, storage: T.makeStorage(K.fakeLocalStorage()), policy: FULL,
    fork: 'stories_cm', planet: 'lv624', h: 'h1', now: kit.now, clientId: id });
  const co = mk('client-co-000001');
  await co.createRoom({ token, keyId, post: 'co', callsign: 'Иванов' });
  note('crowd: co creates', [co.status, co.error, co.sheet.length]);
  // A post code counts seats like a word knock: the creator already holds the only co seat.
  const second = mk('client-co-000002');
  await second.join({ entry: co.code + '-' + co.sheet.find(s => s.post === 'co').code });
  note('crowd: the code of a full post', [second.status, second.error]);
  const knocks = [];
  for (const [i, squad] of ['alpha', 'alpha', 'bravo', 'bravo', 'charlie'].entries()) {
    const k = mk('client-knock-00' + i);
    await k.join({ entry: co.code, post: 'ftl', squad });
    knocks.push(k);
  }
  // v2: at most four fresh knocks wait; the fifth is 429 knocks.
  note('crowd: four knocks wait, the fifth is refused', knocks.map(k => [k.status, k.error, !!k.word]));
  await co.poll();
  note('crowd: co sees the knocks', co.members().filter(m => !m.confirmed).map(m => [m.post, m.squad]));
  clock.t += (FULL.ttl.wordSec + 1) * 1000;
  await knocks[4].join({ entry: co.code, post: 'ftl', squad: 'charlie' });
  note('crowd: after the word time the fifth gets in', [knocks[4].status, knocks[4].error]);
  await co.poll();
  note('crowd: stale knocks left', co.members().map(m => [m.post, m.squad, m.confirmed]));
  return story;
}

const token = await signServerToken(SECRET, { fork: 'stories_cm', server: 'Space Stories', keyId: 'stories-k1', iat: 1 });
const worker = [], fixture = [];
for (const [run, policy] of [[evening, STAGE1], [crowd, FULL]]) {
  clock.t = START;
  worker.push(...await run(workerTransport(policy), token, 'stories-k1'));
  clock.t = START;
  fixture.push(...await run(new F.FixtureTransport(policy, { now: kit.now }), 'demo', 'demo'));
}

// The Worker's own story, pinned.
const step = (story, name) => JSON.parse(story.find(s => s[0] === name)[1]);
const SO = { client: 'client-so-00001', post: 'so', squad: null };
const CREW = { client: 'client-mortar-01', post: 'mortar', squad: null };
assert.deepStrictEqual(step(worker, 'create as mortar'), ['idle', 'creator']);
assert.deepStrictEqual(step(worker, 'create as so').slice(0, 6), ['in', null, 'so', ['so', 'so', 'so', 'mortar', 'mortar'], null, ['asset-mortar-1']]);
assert.deepStrictEqual(step(worker, 'mortar knocks').slice(0, 3).concat(step(worker, 'mortar knocks').slice(4)), ['knocking', null, true, {}, null]);
assert.deepStrictEqual(step(worker, 'mortar in').slice(0, 2), ['in', 'mortar']);
assert.strictEqual(step(worker, 'so puts a request')[0].ok, true);
assert.deepStrictEqual(step(worker, 'crew accepts').slice(1), ['accepted', CREW]);
assert.deepStrictEqual(step(worker, 'second crew accepts late')[0], { ok: false, error: 'status', status: 'accepted' });
assert.deepStrictEqual(step(worker, 'server stamps'), ['done', 'number', 'number']);
assert.deepStrictEqual(step(worker, 'foreign put'), [{ ok: false, error: 'exists' }, 0, { x: 62, y: -62 }]);
assert.deepStrictEqual(step(worker, 'author accepts own request'), [{ ok: false, error: 'author' }, { ok: false, error: 'fields' }]);
const withdrawn = step(worker, 'author withdraws a waiting request');
assert.deepStrictEqual([withdrawn[0].ok, ...withdrawn.slice(1)], [true, 'denied', 'не нужно', SO]);
const recalled = step(worker, 'author recalls an accepted request');
assert.deepStrictEqual([recalled[0].ok, recalled[1].ok, ...recalled.slice(2)], [true, true, 'denied', CREW, SO]);
assert.deepStrictEqual(step(worker, 'crew calibration, mortar, presence').slice(0, 4), [true, true, true, { ok: false, error: 'right' }]);
const dup = step(worker, 'resent op acked dup');
assert.deepStrictEqual([dup[0].ok, dup[1][0][2], dup[2][0][2], dup[1][0][1], dup[2][0][1], dup[3], dup[4]],
  [true, false, true, dup[0].seq, dup[0].seq, 0, ['moving']]);
assert.deepStrictEqual(step(worker, 're-join without the session'), ['idle', 'member', null]);
assert.deepStrictEqual(step(worker, 're-join with the session').slice(0, 4), ['in', null, null, 'mortar']);
assert.deepStrictEqual(step(worker, 'observer'), ['expired', 'observer', 403, 'right', 200, ['observerToken', 'ok', 'seq', 'serverNow'],
  true, 'observer', null, 3, 200, true, false]);
assert.deepStrictEqual(step(worker, 'op during radio silence'), [{ ok: false, error: 'silence', status: 423 }, true, 0, 'silence']);
assert.deepStrictEqual(step(worker, 'crew tries rotate'), [403, 'right', 'in']);
assert.deepStrictEqual(step(worker, 'extend before the warning'), [409, 'early', 'early']);
const rotated = step(worker, 'so rotates');
assert.deepStrictEqual([rotated[0], rotated[1], ...rotated.slice(2, 6), ...rotated.slice(8)], [200, ['code', 'ok', 'seq', 'serverNow', 'session', 'sheet'],
  true, true, 'in', null, ['so', 'so', 'so', 'mortar', 'mortar'], 2, 2]);
assert.deepStrictEqual(step(worker, 'crew after rotate'), ['expired', 'rotated', null]);
assert.deepStrictEqual(step(worker, 'crew knocks at the new code'), ['knocking', null]);
assert.deepStrictEqual(step(worker, 'leaked or bound post codes after rotate'), ['idle', 'postCode', 'idle', 'postCode']);
const hushed = step(worker, 'radio silence in the journal');
assert.deepStrictEqual([hushed[0], hushed[1].map(e => [e[2], e[3], e[1] === 'evt-' + e[0]]), hushed[2] === hushed[1][1][0], hushed[3] === hushed[2], hushed[4]],
  [200, [['silence_on', 'so', true], ['silence_off', 'so', true]], true, true, [0, 0]]);
const closing = step(worker, 'lock, unlock and close in the journal');
assert.deepStrictEqual([closing.slice(0, 4), closing[4].map(e => [e[2], e[3], e[1] === 'evt-' + e[0]]), closing.slice(5)],
  [[true, 200, 200, 'closed'], [['lock', 'system', true], ['unlock', 'so', true], ['close', 'so', true]], [true, true, ['so']]]);
assert.deepStrictEqual(step(worker, 'crowd: the code of a full post'), ['idle', 'full']);
assert.deepStrictEqual(step(worker, 'crowd: four knocks wait, the fifth is refused'),
  [['knocking', null, true], ['knocking', null, true], ['knocking', null, true], ['knocking', null, true], ['idle', 'knocks', false]]);
assert.deepStrictEqual(step(worker, 'crowd: after the word time the fifth gets in'), ['knocking', null]);
assert.deepStrictEqual(step(worker, 'crowd: stale knocks left'), [['co', null, true], ['ftl', 'charlie', false]]);

// The fixture tells the same story.
assert.deepStrictEqual(worker.map(s => s[0]), fixture.map(s => s[0]));
const diffs = worker.map((w, i) => [w[0], w[1], fixture[i][1]]).filter(d => d[1] !== d[2]);
for (const [name, w, f] of diffs) console.log('differs: ' + name + '\n  worker  ' + w + '\n  fixture ' + f);
assert.deepStrictEqual(diffs.map(d => d[0]), []);
for (const [name] of worker) console.log('ok', name);
console.log('OK parity', worker.length, 'steps');

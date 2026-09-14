// scripts/test_room_client.js — RoomClient against the fixture transport under Node.
// Run: node scripts/test_room_client.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'tactical', f), 'utf8');
const window = { setTimeout: (fn) => 0, clearTimeout: () => {} };
new Function('window', read('room-logic.js'))(window);
new Function('window', read('room-fixtures.js'))(window);
new Function('window', read('room.js'))(window);
const policy = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'room_policy_full.json'), 'utf8'));
const { RoomClient, makeStorage } = window.TacRoom;
const { FixtureTransport } = window.TacRoomFixture;

function fakeLocalStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

let clock = 1_000_000;
const now = () => clock;
const transport = new FixtureTransport(policy, { now, skew: 5000 });
const lsCo = fakeLocalStorage();
const lsSl = fakeLocalStorage();
const co = new RoomClient({ transport, storage: makeStorage(lsCo), policy, fork: 'stories_cm', planet: 'lv624', h: 'h1', now });
const sl = new RoomClient({ transport, storage: makeStorage(lsSl), policy, fork: 'stories_cm', planet: 'lv624', h: 'h1', now });

let n = 0;
async function t(name, fn) { await fn(); n++; console.log('ok', name); }

(async () => {
  await t('create: status in, confirmed creator, briefing sheet, clock offset', async () => {
    await co.createRoom({ token: 'demo', keyId: 'demo', post: 'co', callsign: 'Иванов' });
    assert.strictEqual(co.status, 'in');
    assert.strictEqual(co.me.post, 'co');
    assert.strictEqual(co.me.confirmed, true);
    assert.strictEqual(co.sheet.length, 38);
    assert.strictEqual(co.offset, 5000);
    assert.strictEqual(co.serverNow(), clock + 5000);
  });

  await t('join by post code knocks; one click confirms; the joiner moves in on the next poll', async () => {
    const slCode = co.sheet.find(s => s.post === 'sl' && s.squad === 'bravo').code;
    await sl.join({ entry: co.code + '-' + slCode, callsign: 'Петров' });
    assert.strictEqual(sl.status, 'knocking');
    assert.ok(sl.word);
    await co.poll();
    const knock = co.members().find(m => !m.confirmed);
    await co.admin('confirm', { client: knock.client });
    await sl.poll();
    assert.strictEqual(sl.status, 'in');
    assert.strictEqual(sl.me.squad, 'bravo');
  });

  await t('queue shows the op at once, the ack clears pending, the server copy replaces it', async () => {
    const p = sl.queue({ op: 'put', kind: 'marker', id: 'm1', data: { cat: 'enemy', label: 'ксено', x: 60, y: -60, layer: 'squad:bravo' } });
    assert.strictEqual(sl.visible({ kinds: ['marker'] }).length, 1, 'optimistic');
    assert.strictEqual(sl.visible({ kinds: ['marker'] })[0].pending, true);
    await p;
    assert.strictEqual(sl.pending.length, 0);
    const m = sl.visible({ kinds: ['marker'] })[0];
    assert.ok(m.seq > 0);
    assert.ok(!m.pending);
    await co.poll();
    assert.strictEqual(co.visible({ kinds: ['marker'] })[0].label, 'ксено');
  });

  await t('a refused op leaves pending and lands in rejected with its reason', async () => {
    await sl.queue({ op: 'put', kind: 'line', id: 'l1', data: { cat: 'plan', points: [[0, 0], [5, 5]], layer: 'shared' } });
    assert.strictEqual(sl.pending.length, 0);
    assert.strictEqual(sl.rejected[0].error, 'layer');
  });

  await t('pending patches never mutate the confirmed state', async () => {
    sl.pending.push({ cid: 'x1', op: 'patch', kind: 'marker', id: 'm1', data: { label: 'два ксено' } });
    assert.strictEqual(sl.visible({ kinds: ['marker'] })[0].label, 'два ксено');
    assert.strictEqual(sl.room.objects.m1.label, 'ксено');
    sl.pending = [];
  });

  await t('queueAll: ops that belong together leave in one write and resolve in order', async () => {
    const sends = [];
    const send = transport.send;
    transport.send = function (code, ops, auth) { sends.push(ops.map(o => o.id)); return send.call(this, code, ops, auth); };
    try {
      const results = await sl.queueAll([
        { op: 'put', kind: 'marker', id: 'qa1', data: { cat: 'enemy', label: 'один', x: 61, y: -61, layer: 'squad:bravo' } },
        { op: 'put', kind: 'marker', id: 'qa2', data: { cat: 'enemy', label: 'два', x: 62, y: -62, layer: 'squad:bravo' } }]);
      assert.deepStrictEqual(sends, [['qa1', 'qa2']], 'one write carries both ops');
      assert.strictEqual(results.length, 2);
      assert.ok(results.every(r => r && r.ok !== false), JSON.stringify(results));
      assert.strictEqual(sl.pending.length, 0, 'both acked');
      assert.deepStrictEqual(await sl.queueAll([]), [], 'nothing to send');
    } finally {
      transport.send = send;
    }
  });

  await t('requests sort open first, urgent first, then by age', async () => {
    clock += 1000;
    await sl.queue({ op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 62, y: -62 }, priority: 'normal' } });
    clock += 1000;
    await sl.queue({ op: 'put', kind: 'request', id: 'q2', data: { type: 'ob', target: { x: 70, y: -70 }, priority: 'urgent' } });
    assert.deepStrictEqual(sl.requests().map(r => r.id), ['q2', 'q1']);
  });

  await t('restore from storage brings back code, session, objects and seq', async () => {
    const again = new RoomClient({ transport, storage: makeStorage(lsSl), policy, fork: 'stories_cm', planet: 'lv624', h: 'h1', now });
    assert.strictEqual(again.restore(sl.code), true);
    assert.strictEqual(again.room.seq, sl.room.seq);
    await again.poll();
    assert.strictEqual(again.status, 'in');
    assert.strictEqual(again.visible({ kinds: ['request'] }).length, 2);
  });

  // Was 'revoke', a fixture-only action: the Worker answers 400 action. Release is the Worker's way.
  await t('a released member\'s session turns into expired, and the secret leaves storage', async () => {
    const r = await co.admin('release', { client: sl.client });
    assert.strictEqual(r.status, 200);
    await sl.poll();
    assert.strictEqual(sl.status, 'expired');
    assert.strictEqual(sl.error, 'session');
    assert.strictEqual(sl.session, null);
    assert.strictEqual(makeStorage(lsSl).read(sl.key()).session, null);
  });

  // Used to pin a phantom pending op that could never be sent; queue() now refuses at once.
  // The Worker no longer hands out an observer token at create: staff mint it with the observer action.
  await t('observer reads but cannot write', async () => {
    assert.strictEqual(co.observerToken, null);
    await co.admin('observer');
    assert.ok(co.observerToken);
    const obs = new RoomClient({ transport, storage: makeStorage(fakeLocalStorage()), policy, fork: 'stories_cm', planet: 'lv624', h: 'h1', now });
    await obs.observe(co.code, co.observerToken);
    assert.strictEqual(obs.status, 'observer');
    assert.ok(obs.visible({ kinds: ['marker'] }).length >= 1);
    const res = await obs.queue({ op: 'put', kind: 'marker', id: 'o1', data: { cat: 'plan', x: 1, y: 1, layer: 'shared' } });
    assert.deepStrictEqual(res, { ok: false, error: 'observer' });
    assert.strictEqual(obs.pending.length, 0, 'nothing queued');
  });

  await t('the demo script plays members, a request and an asset over time, every step allowed', async () => {
    const demo = new FixtureTransport(policy, { now, script: window.TacRoomFixture.demoScript(policy) });
    const c = new RoomClient({ transport: demo, storage: makeStorage(fakeLocalStorage()), policy, fork: 'stories_cm', planet: 'lv624', h: 'h1', now });
    await c.createRoom({ token: 'demo', keyId: 'demo', post: 'co' });
    clock += 30000;
    await c.poll();
    assert.deepStrictEqual(demo.scriptErrors, []);
    assert.ok(c.members().length >= 3);
    const reqs = c.visible({ kinds: ['request'] });
    assert.strictEqual(reqs.length, 2);
    reqs.forEach(r => {
      assert.strictEqual(r.status, 'accepted');
      assert.strictEqual(r.acceptedBy.client, 'demo-crew-0001', 'the crew accepts, never the author');
      assert.notStrictEqual(r.by.client, r.acceptedBy.client);
    });
    assert.ok(c.visible({ kinds: ['asset'] }).length >= 1);
  });

  console.log('OK', n, 'cases');
})().catch(e => { console.error(e); process.exit(1); });

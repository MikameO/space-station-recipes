// scripts/test_room_client_stage1.js — Stage 1 (staff officer and mortar crew) on the shipping policy
// through the fixture, the fixture's Worker rules, and the demo script under those rules.
// Run: node scripts/test_room_client_stage1.js
'use strict';
const assert = require('assert');
const K = require('./test_room_client_kit.js');

const env = K.load();
const { R, T, F, clock, STAGE1 } = env;
const { t, count } = K.runner();
const client = (transport, id, extra) => new T.RoomClient(Object.assign({ transport, storage: T.makeStorage(K.fakeLocalStorage()),
  policy: STAGE1, fork: 'stories_cm', planet: 'lv624', h: 'h1', now: env.now, clientId: id }, extra || {}));
const req = (id, extra) => ({ cid: 'c-' + id, op: 'put', kind: 'request', id, data: Object.assign({ type: 'mortar', target: { x: 1, y: 1 } }, extra) });

(async () => {
  await t('stage 1: so creates, mortar joins and is confirmed, a request goes out, the crew accepts, a late accept resolves status', async () => {
    const fx = new F.FixtureTransport(STAGE1, { now: env.now });
    const so = client(fx, 'client-so-00001'), mo = client(fx, 'client-mortar-01'), mo2 = client(fx, 'client-mortar-02');
    await so.createRoom({ token: 'demo', keyId: 'demo', post: 'so', callsign: 'Орлов' });
    assert.deepStrictEqual([so.status, so.me.post, so.observerToken], ['in', 'so', null]);
    assert.deepStrictEqual(so.sheet.map(s => s.post), ['so', 'so', 'so', 'mortar', 'mortar']);
    assert.deepStrictEqual(so.visible({ kinds: ['asset'] }).map(a => a.id), ['asset-mortar-1']);

    const codes = so.sheet.filter(s => s.post === 'mortar').map(s => s.code);
    await mo.join({ entry: (so.code + '-' + codes[0]).toLowerCase(), callsign: 'Сидоров' });
    assert.deepStrictEqual([mo.status, !!mo.word, mo.room.seq], ['knocking', true, 0]);
    assert.deepStrictEqual(mo.presence, {}, 'a knock sees nobody');
    assert.strictEqual(mo.meta.lastOpAt, undefined);
    await so.poll();
    const knock = so.members().find(m => !m.confirmed);
    assert.strictEqual(knock.client, mo.client);
    assert.strictEqual((await so.admin('confirm', { client: knock.client })).status, 200);
    await mo.poll();
    assert.deepStrictEqual([mo.status, mo.me.post], ['in', 'mortar']);
    assert.strictEqual(typeof mo.presence[mo.client], 'number');

    clock.t += 1100;
    const put = await so.queue({ op: 'put', kind: 'request', id: 'q1',
      data: { type: 'mortar', target: { x: 62, y: -62 }, note: '  Гнездо   у Nexus ', priority: 'urgent', flags: [] } });
    assert.strictEqual(put.ok, true);
    assert.strictEqual(so.retryAfter, 2, 'a fresh request polls fast');
    const q = so.requests()[0];
    assert.deepStrictEqual([q.id, q.status, q.note, !!q.pending, q.seq], ['q1', 'requested', 'Гнездо у Nexus', false, put.seq]);

    await mo2.join({ entry: so.code + '-' + codes[1] });
    await so.poll();
    await so.admin('confirm', { client: mo2.client });
    await mo2.poll();
    assert.deepStrictEqual([mo2.status, mo2.requests().map(r => r.status)], ['in', ['requested']]);

    await mo.poll();
    clock.t += 1100;
    const acc = await mo.queue({ op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } });
    assert.strictEqual(acc.ok, true);
    assert.deepStrictEqual(mo.requests()[0].acceptedBy, { client: mo.client, post: 'mortar', squad: null });

    const late = await mo2.queue({ op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } });
    assert.deepStrictEqual(late, { ok: false, error: 'status', status: 'accepted' });
    assert.strictEqual(mo2.rejected.pop().error, 'status');
    assert.strictEqual(mo2.requests()[0].status, 'accepted', 'the poll after the refusal brought the winner');

    for (const [from, to] of [['accepted', 'firing'], ['firing', 'done']]) {
      clock.t += 1100;
      assert.strictEqual((await mo.queue({ op: 'patch', kind: 'request', id: 'q1', expectedStatus: from, data: { status: to } })).ok, true);
    }
    const done = mo.requests()[0];
    assert.deepStrictEqual([done.status, typeof done.firedAt, typeof done.doneAt], ['done', 'number', 'number']);
  });

  await t('fixture rights: admin actions, observers, unconfirmed members, export, release, reissue', async () => {
    const { so, mo, fx, mk } = await K.stage1Room(env);
    const code = so.code;
    const as = c => ({ session: c.session });
    for (const action of ['rotate', 'observer', 'extend', 'silence', 'close', 'unlock', 'purge']) {
      const r = await fx.admin(code, { action, on: true, client: so.client }, as(mo));
      assert.deepStrictEqual([action, r.status, r.body.error], [action, 403, 'right']);
    }
    assert.deepStrictEqual((await fx.admin(code, { action: 'revoke', client: mo.client }, as(so))).body, { error: 'action' });
    assert.deepStrictEqual((await fx.admin(code, { action: 'reissue', client: so.client }, as(mo))).body, { error: 'right' });

    const minted = await so.admin('observer');
    assert.strictEqual(so.observerToken, minted.body.observerToken);
    const obs = { observer: so.observerToken };
    assert.strictEqual((await fx.poll(code, 0, obs)).status, 200);
    assert.strictEqual((await fx.poll(code, 0, { observer: 'obs-wrong' })).status, 401);
    assert.deepStrictEqual([(await fx.admin(code, { action: 'silence', on: false }, obs)).status, (await fx.send(code, [], obs)).status], [403, 403]);

    const knock = mk('client-mortar-02');
    await knock.join({ entry: code + '-' + so.sheet.filter(s => s.post === 'mortar')[1].code });
    for (const [name, call] of [['admin', () => fx.admin(code, { action: 'confirm', client: knock.client }, as(knock))],
      ['send', () => fx.send(code, [], as(knock))], ['export', () => fx.exportRoom(code, as(knock))], ['snapshot', () => fx.snapshot(code, null, as(knock))]]) {
      const r = await call();
      assert.deepStrictEqual([name, r.status, r.body.error], [name, 403, 'unconfirmed']);
    }

    assert.deepStrictEqual((await fx.exportRoom(code, as(mo))).body, { error: 'right' }, 'export: staff and the observer only');
    const ex = await so.exportRoom();
    assert.strictEqual(ex.status, 200);
    assert.ok(!/"word"/.test(JSON.stringify(ex.body)), 'no words leave');
    assert.strictEqual((await fx.exportRoom(code, obs)).status, 200);

    const ri = await so.admin('reissue', { client: mo.client });
    assert.strictEqual((await fx.join(code, { client: 'client-mortar-09', postCode: ri.body.postCode })).body.status, 'knocking');
    assert.strictEqual((await fx.poll(code, 0, as(mo))).status, 401, 'the old holder is released');

    const last = await so.admin('release', { client: so.client });
    assert.deepStrictEqual([last.status, last.body.error, so.error], [409, 'last', 'last']);
  });

  await t('fixture joins: re-join proof, used codes, two knocks need the word, stale knocks leave, closed rooms refuse', async () => {
    const { so, mo, fx, moCode } = await K.stage1Room(env);
    const code = so.code;
    assert.deepStrictEqual((await fx.join(code, { client: mo.client, postCode: moCode })).body, { error: 'member' });
    const proven = await fx.join(code, { client: mo.client, postCode: moCode }, { session: mo.session });
    assert.deepStrictEqual([proven.status, proven.body.status], [200, 'confirmed']);
    assert.strictEqual(fx.activeMembers().filter(m => m.client === mo.client).length, 1);
    assert.strictEqual((await fx.poll(code, 0, { session: mo.session })).status, 401, 'the proof session is replaced');
    // v2: a code bound to someone else answers like an unknown one, 404 postCode ('used' is gone).
    assert.deepStrictEqual(await fx.join(code, { client: 'client-xeno-0001', postCode: moCode }).then(r => [r.status, r.body]), [404, { error: 'postCode' }]);
    assert.deepStrictEqual((await fx.join(code, { client: 'short', post: 'so' })).body, { error: 'client' });

    const k1 = await fx.join(code, { client: 'client-so-00002', post: 'so' });
    const k2 = await fx.join(code, { client: 'client-so-00003', post: 'so' });
    assert.deepStrictEqual((await fx.join(code, { client: 'client-so-00004', post: 'so' })).body, { error: 'full' });
    // v2: the post-code path counts seats too: a sheet code for a full post is 409 full.
    const soCode = so.sheet.find(s => s.post === 'so').code;
    assert.deepStrictEqual(await fx.join(code, { client: 'client-so-00005', postCode: soCode }).then(r => [r.status, r.body]), [409, { error: 'full' }]);
    assert.deepStrictEqual((await fx.admin(code, { action: 'confirm', client: 'client-so-00002' }, { session: so.session })).body, { error: 'word' });
    assert.strictEqual((await fx.admin(code, { action: 'confirm', client: 'client-so-00002', word: k1.body.word }, { session: so.session })).status, 200);
    clock.t += STAGE1.ttl.wordSec * 1000;
    assert.deepStrictEqual((await fx.poll(code, 0, { session: k2.body.session })).body, { error: 'session' });
    assert.ok(!fx.activeMembers().some(m => m.client === 'client-so-00003'), 'a knock older than the word is released');

    await so.admin('close');
    assert.strictEqual(so.status, 'closed');
    assert.deepStrictEqual((await fx.join(code, { client: 'client-mortar-02', postCode: so.sheet.filter(s => s.post === 'mortar')[1].code })).body, { error: 'closed' });
    const extend = await so.admin('extend');
    assert.deepStrictEqual([extend.status, so.error], [423, 'closed']);
  });

  await t('fixture rotate: new code and session, old code answers 401 rotated, sessions and observer token die', async () => {
    const { so, mo, fx, moCode } = await K.stage1Room(env);
    await so.admin('observer');
    const oldCode = so.code, oldSession = so.session, token = so.observerToken, oldSheet = so.sheet;
    clock.t += 1100;
    assert.strictEqual((await so.admin('rotate')).status, 200);
    assert.deepStrictEqual([so.code !== oldCode, so.session !== oldSession, so.observerToken, so.status], [true, true, null, 'in']);
    assert.deepStrictEqual(so.members().map(m => m.client), [so.client]);
    // v2: rotate answers a new sheet: unused post codes change, the bound one stays with its holder.
    assert.deepStrictEqual(so.sheet.map(s => s.post), oldSheet.map(s => s.post));
    assert.deepStrictEqual(so.sheet.filter(s => oldSheet.some(o => o.code === s.code)).map(s => s.code), [moCode]);
    assert.deepStrictEqual((await fx.poll(oldCode, 0, { session: oldSession })).body, { error: 'rotated' });
    assert.strictEqual((await fx.poll(so.code, 0, { session: oldSession })).status, 401);
    assert.strictEqual((await fx.poll(so.code, 0, { observer: token })).status, 401);
    assert.strictEqual(so.store.read(so.key(oldCode)), null);
    await mo.poll();
    assert.deepStrictEqual([mo.status, mo.error, mo.session], ['expired', 'rotated', null]);
  });

  await t('fixture writes: shape, size, cleaned text, dup, exists, kind, member rows, author, deleted, rate, validatePatch', async () => {
    const { so, mo, fx } = await K.stage1Room(env);
    const code = so.code;
    const send = (c, ops) => fx.send(code, ops, { session: c.session }).then(r => r.body.acks.map(a => a.error || (a.dup ? 'dup' : 'ok')));
    const bell = String.fromCharCode(7);
    clock.t += 1100;
    assert.deepStrictEqual(await send(so, [
      req('q.1'), { cid: 'x', op: 'nope', kind: 'request', id: 'q2' }, { cid: 'y', op: 'put', kind: 'ghost', id: 'q3' },
      req('big', { note: 'я'.repeat(5000) }), req('bad', { type: 'nuke' }), req('q4', { note: bell + '  много   пробелов  ' + 'я'.repeat(100) })
    ]), ['id', 'shape', 'shape', 'size', 'type', 'ok'], 'changed in the final review: an id off the pattern answers id');
    assert.strictEqual(fx.state.objects.q4.note, R.cleanText(bell + '  много   пробелов  ' + 'я'.repeat(100), STAGE1.limits.note));
    assert.ok(fx.state.objects.q4.note.startsWith('много пробелов') && fx.state.objects.q4.note.length === STAGE1.limits.note);
    const again = await fx.send(code, [req('q4', { note: 'x' })], { session: so.session });
    assert.deepStrictEqual(again.body.acks[0], { cid: 'c-q4', seq: fx.state.objects.q4.seq, dup: true });

    clock.t += 1100;
    assert.deepStrictEqual(await send(mo, [
      { cid: 'e1', op: 'put', kind: 'request', id: 'q4', data: { type: 'mortar', target: { x: 2, y: 2 } } },
      { cid: 'e2', op: 'patch', kind: 'asset', id: 'q4', data: { notes: 'x' } },
      { cid: 'e3', op: 'patch', kind: 'member', id: mo.me.id, data: { callsign: 'X' } },
      { cid: 'e4', op: 'put', kind: 'member', id: mo.me.id, data: { presentAt: 1 } },
      { cid: 'e5', op: 'patch', kind: 'member', id: mo.me.id, data: { presentAt: 1 } }
    ]), ['exists', 'kind', 'fields', 'right', 'ok'], 'changed in stage 2a: an own member patch goes through R.validateMemberPatch');

    clock.t += 1100;
    assert.deepStrictEqual(await send(so, [
      { cid: 'a1', op: 'patch', kind: 'request', id: 'q4', expectedStatus: 'requested', data: { status: 'accepted' } },
      { cid: 'a2', op: 'patch', kind: 'request', id: 'q4', expectedStatus: 'requested', data: { status: 'denied', reason: 'снято' } },
      { cid: 'a3', op: 'del', kind: 'request', id: 'q4' }
    ]), ['author', 'ok', 'ok']);
    clock.t += 1100;
    assert.deepStrictEqual(await send(so, [Object.assign(req('q4'), { cid: 'c-q4-again' })]), ['deleted']);

    clock.t += 1100;
    const burst = Array.from({ length: 12 }, (_, i) => ({ cid: 'r' + i, op: 'put', kind: 'request', id: 'qb' + i, data: { type: 'position', target: { x: i, y: i } } }));
    assert.deepStrictEqual((await send(so, burst)).slice(9), ['ok', 'rate', 'rate']);

    // v2: every patch goes through the shared R.validatePatch with the cleaned data and the existing object, before
    // rights. The real function is put back afterwards: the fixture has no fallback without it.
    const calls = [], validatePatch = R.validatePatch;
    R.validatePatch = (policy, kind, data, existing) => { calls.push([kind, Object.keys(data).sort().join(), !!existing]); return kind === 'asset' && data.owner ? 'owner' : null; };
    try {
      clock.t += 1100;
      assert.deepStrictEqual(await send(mo, [
        { cid: 'v1', op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { owner: { post: 'so' } } },
        { cid: 'v2', op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { state: 'deployed', tile: [1, 2] } }
      ]), ['owner', 'ok']);
      assert.deepStrictEqual(calls, [['asset', 'owner', true], ['asset', 'state,tile', true]]);
    } finally {
      R.validatePatch = validatePatch;
    }
  });

  await t('fixture lifetime: Retry-After by the last request, idle lock and unlock, close at the deadline, gone after the grace', async () => {
    const { so, fx } = await K.stage1Room(env);
    const code = so.code;
    const poll = () => fx.poll(code, 0, { session: so.session });
    assert.strictEqual((await poll()).retryAfter, 10);
    clock.t += 1100;
    await so.queue({ op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 1, y: 1 } } });
    assert.strictEqual((await poll()).retryAfter, 2);
    clock.t += 61000;
    assert.strictEqual((await poll()).retryAfter, 10);
    clock.t += STAGE1.ttl.roomIdleLockSec * 1000;
    assert.strictEqual((await poll()).body.meta.locked, true);
    const res = await so.queue({ op: 'put', kind: 'request', id: 'q2', data: { type: 'mortar', target: { x: 1, y: 1 } } });
    assert.deepStrictEqual(res, { ok: false, error: 'locked', status: 423 });
    assert.strictEqual((await so.admin('unlock')).status, 200);
    assert.strictEqual((await poll()).body.meta.locked, false);
    clock.t += STAGE1.ttl.roomMaxSec * 1000;
    assert.strictEqual((await poll()).body.meta.closed, true);
    assert.strictEqual((await fx.exportRoom(code, { session: so.session })).status, 200, 'export during the grace');
    clock.t += STAGE1.ttl.exportGraceSec * 1000;
    assert.deepStrictEqual((await poll()).body, { error: 'room' });
  });

  await t('fixture create: a staff creator, a client id and a planet; every room starts clean', async () => {
    const fx = new F.FixtureTransport(STAGE1, { now: env.now });
    const body = (post, extra) => Object.assign({ token: 'demo', planet: 'lv624', h: 'h', creator: { client: 'client-so-00001', post } }, extra);
    assert.deepStrictEqual((await fx.create(body('mortar'))).body, { error: 'creator' });
    assert.deepStrictEqual((await fx.create(body('so', { planet: 'no planet!' }))).body, { error: 'planet' });
    assert.deepStrictEqual((await fx.create({ planet: 'lv624', creator: { client: 'short', post: 'so' } })).body, { error: 'client' });
    const a = await fx.create(body('so'));
    assert.deepStrictEqual(Object.keys(a.body).sort(), ['code', 'epoch', 'fork', 'server', 'session', 'sheet']);
    await fx.send(a.body.code, [req('q1')], { session: a.body.session });
    const b = await fx.create(body('so'));
    assert.notStrictEqual(b.body.code, a.body.code);
    assert.strictEqual((await fx.poll(a.body.code, 0, { session: a.body.session })).status, 404);
    assert.ok(!(await fx.poll(b.body.code, 0, { session: b.body.session })).body.ops.some(o => o.id === 'q1'));
  });

  await t('fixture v2 gates: heartbeats pass a lock, acked batches answer dup, a second del is dup, no asset puts, extend waits, release frees the code', async () => {
    const { so, mo, fx, moCode } = await K.stage1Room(env);
    const code = so.code;
    const send = (c, ops) => fx.send(code, ops, { session: c.session });
    const heartbeat = cid => ({ cid, op: 'patch', kind: 'member', id: mo.me.id, data: { presentAt: 1 } });
    clock.t += 1100;
    const put = req('qv1');
    assert.ok((await send(so, [put])).body.acks[0].seq);
    // v2: assets are seeded from the policy; a client put is refused (a new id by rights, a seeded id exists).
    const assets = await send(mo, [
      { cid: 'ap1', op: 'put', kind: 'asset', id: 'asset-mortar-2', data: { type: 'mortar' } },
      { cid: 'ap2', op: 'put', kind: 'asset', id: 'asset-mortar-1', data: { type: 'mortar' } }]);
    assert.deepStrictEqual(assets.body.acks.map(a => a.error), ['right', 'exists']);

    // v2: a locked room takes a batch of heartbeats, answers a batch it already acked, and refuses anything else with 423.
    clock.t += STAGE1.ttl.roomIdleLockSec * 1000;
    const beat = await send(mo, [heartbeat('hb1')]);
    assert.deepStrictEqual([beat.status, !!beat.body.acks[0].seq, fx.meta.locked], [200, true, true]);
    assert.deepStrictEqual((await send(so, [put])).body.acks, [{ cid: 'c-qv1', seq: fx.state.objects.qv1.seq, dup: true }]);
    assert.deepStrictEqual(await send(mo, [heartbeat('hb2'), req('qv2')]).then(r => [r.status, r.body]), [423, { error: 'locked' }]);
    assert.strictEqual((await so.admin('unlock')).status, 200);

    // v2: a del of an object already deleted is acknowledged dup with the seq it has.
    clock.t += 1100;
    assert.ok((await send(so, [{ cid: 'd1', op: 'del', kind: 'request', id: 'qv1' }])).body.acks[0].seq);
    assert.deepStrictEqual((await send(so, [{ cid: 'd2', op: 'del', kind: 'request', id: 'qv1' }])).body.acks,
      [{ cid: 'd2', seq: fx.state.objects.qv1.seq, dup: true }]);
    // v2: extend waits for the warning 20 minutes before the deadline.
    assert.deepStrictEqual(await fx.admin(code, { action: 'extend' }, { session: so.session }).then(r => [r.status, r.body]), [409, { error: 'early' }]);
    // v2: release gives the post code back to the sheet; the next crew knocks with it.
    assert.strictEqual((await so.admin('release', { client: mo.client })).status, 200);
    assert.strictEqual((await fx.join(code, { client: 'client-mortar-07', postCode: moCode })).body.status, 'knocking');
  });

  await t('demo seats sit in sheet slots: a crew presenting the scripted crew\'s code takes the seat over; the post stays capped', async () => {
    const fx = new F.FixtureTransport(STAGE1, { now: env.now, script: F.demoScript(STAGE1) });
    const c = client(fx, 'client-so-00001');
    await c.createRoom({ token: 'demo', keyId: 'demo', post: 'so' });
    assert.strictEqual(fx.memberOf('demo-crew-0001').post, 'mortar');
    const [first, last] = c.sheet.filter(s => s.post === 'mortar').map(s => s.code);
    const a = await fx.join(c.code, { client: 'client-mortar-01', postCode: first });
    const b = await fx.join(c.code, { client: 'client-mortar-02', postCode: last });
    const extra = await fx.join(c.code, { client: 'client-mortar-03', post: 'mortar' });
    assert.deepStrictEqual([a.body.status, b.body.status, extra.status, extra.body.error], ['knocking', 'knocking', 409, 'full']);
    assert.strictEqual(fx.memberOf('demo-crew-0001'), null, 'the Worker\'s holder rule moved the scripted crew out');
  });

  for (const fork of ['stories_cm', 'rmc14']) {
    await t('demo script on ' + fork + ': every step passes the rules, and the crew, never the author, accepts', async () => {
      const policy = K.policy(fork);
      const fx = new F.FixtureTransport(policy, { now: env.now, script: F.demoScript(policy) });
      const c = new T.RoomClient({ transport: fx, storage: T.makeStorage(K.fakeLocalStorage()), policy, fork, planet: 'lv624', h: 'h1', now: env.now });
      await c.createRoom({ token: 'demo', keyId: 'demo', post: 'so' });
      for (let s = 0; s < 13; s++) { clock.t += 2000; await c.poll(); }
      assert.deepStrictEqual(fx.scriptErrors, []);
      assert.deepStrictEqual(c.requests().map(r => [r.id, r.status, r.by.client, r.acceptedBy.client]).sort(), [
        ['demo-req-1', 'accepted', 'demo-staff-0001', 'demo-crew-0001'],
        ['demo-req-2', 'accepted', 'demo-staff-0001', 'demo-crew-0001']]);
      assert.deepStrictEqual(c.calibration().offset, [212, -148]);
      assert.deepStrictEqual(c.visible({ kinds: ['asset'] }).map(a => [a.state, a.tile]), [['deployed', [20, -98]]]);
      assert.strictEqual(c.members().length, 3);
      const mine = await c.queue({ op: 'put', kind: 'request', id: 'q-me', data: { type: 'position', target: { x: 3, y: 4 }, priority: 'normal', flags: [] } });
      assert.strictEqual(mine.ok, true);
    });
  }

  console.log('OK', count(), 'cases');
})().catch(e => { console.error(e); process.exit(1); });

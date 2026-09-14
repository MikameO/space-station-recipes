// scripts/test_room_client_loop.js — RoomClient under failure: the loop, lost and stale answers,
// transient errors, HttpTransport, the promise queue() returns, and the hooks for tactical.js.
// Run: node scripts/test_room_client_loop.js
'use strict';
const assert = require('assert');
const K = require('./test_room_client_kit.js');

const env = K.load();
const { R, T, F, clock, warned, STAGE1 } = env;
const { t, count } = K.runner();
const { reqOp, drain, gate, lost } = K;
const client = (transport, id, extra) => new T.RoomClient(Object.assign({ transport, storage: T.makeStorage(K.fakeLocalStorage()),
  policy: STAGE1, fork: 'stories_cm', planet: 'lv624', h: 'h1', now: env.now, clientId: id }, extra || {}));
const liveIds = s => Object.keys(s.objects).filter(id => !s.objects[id].deleted).sort();

(async () => {
  await t('loop: a second startLoop adds no timer; every step schedules exactly one next', async () => {
    const T1 = K.fakeTimers();
    const { so } = await K.stage1Room(env, { so: { setTimeout: T1.set, clearTimeout: T1.clear } });
    so.startLoop();
    so.startLoop();
    await drain();
    assert.strictEqual(T1.size(), 1);
    T1.fireAll();
    await drain();
    assert.strictEqual(T1.size(), 1);
    so.stopLoop();
    assert.strictEqual(T1.size(), 0);
    assert.strictEqual(so.running, false);
  });

  await t('loop: leave while a step is out, start again: the stale step schedules nothing', async () => {
    const T1 = K.fakeTimers();
    const { so, w } = await K.stage1Room(env, { so: { setTimeout: T1.set, clearTimeout: T1.clear } });
    await so.admin('observer');
    const code = so.code, token = so.observerToken;
    const g = gate();
    w.faults.poll.push(K.holdBefore(g));
    so.startLoop();
    await g.reached;
    so.leave();
    assert.deepStrictEqual([T1.size(), so.running, so.status], [0, false, 'idle']);
    await so.observe(code, token);
    so.startLoop();
    await drain();
    assert.strictEqual(T1.size(), 1);
    g.open();
    await drain();
    assert.strictEqual(T1.size(), 1, 'the old step died quietly');
    so.stopLoop();
    assert.strictEqual(T1.size(), 0);
  });

  await t('loop: a throwing onUpdate or transport is logged, and the loop goes on', async () => {
    const T1 = K.fakeTimers();
    let boom = 0;
    const onUpdate = () => { if (boom > 0) { boom--; throw new Error('render bug'); } };
    const { so, w } = await K.stage1Room(env, { so: { setTimeout: T1.set, clearTimeout: T1.clear, onUpdate } });
    warned.length = 0;
    boom = 1;
    so.startLoop();
    await drain();
    assert.deepStrictEqual([T1.size(), so.running], [1, true]);
    assert.ok(warned.some(a => /onUpdate/.test(a[0])));
    w.faults.poll.push({ before: () => { throw new Error('transport bug'); } });
    T1.fireAll();
    await drain();
    assert.deepStrictEqual([T1.size(), so.running], [1, true]);
    assert.ok(warned.some(a => /loop|poll/.test(a[0])));
    so.stopLoop();
  });

  await t('lost answer: the op landed, so the next flush reads the log instead of sending it again', async () => {
    const { so, w, fx } = await K.stage1Room(env);
    clock.t += 1100;
    w.faults.send.push({ after: lost });
    let res = null;
    const p = so.queue(reqOp('qL1')).then(r => { res = r; });
    await drain();
    assert.deepStrictEqual([res, so.pending.length, so.error, w.count('send')], [null, 1, 'network', 1]);
    clock.t += 1100;
    await so.flush();
    await p;
    assert.strictEqual(w.count('send'), 1, 'not sent twice');
    assert.deepStrictEqual(res, { ok: true, seq: fx.log.find(o => o.id === 'qL1').seq });
    assert.strictEqual(fx.log.filter(o => o.id === 'qL1').length, 1);
    assert.deepStrictEqual([so.pending.length, so.requests().map(r => r.id)], [0, ['qL1']]);

    // The request never reached the room: the log does not have it, so it goes again.
    clock.t += 1100;
    w.faults.send.push({ before: () => Promise.resolve(lost()) });
    const p2 = so.queue(reqOp('qL2'));
    await drain();
    clock.t += 1100;
    await so.flush();
    assert.strictEqual((await p2).ok, true);
    assert.strictEqual(w.count('send'), 3);
    assert.strictEqual(fx.log.filter(o => o.id === 'qL2').length, 1);
  });

  await t('a send the room already took answers dup: queue() resolves ok with the first seq, nothing is rejected', async () => {
    const { so, w, fx } = await K.stage1Room(env);
    clock.t += 1100;
    // v2: the Worker answers a resent cid from memory with {cid, seq, dup: true} and writes nothing.
    let second = null;
    w.faults.send.push({ before: run => run().then(run).then(r => { second = r; return r; }) });
    const res = await so.queue(reqOp('qD1'));
    const seq = fx.log.find(o => o.id === 'qD1').seq;
    assert.strictEqual(second.body.acks[0].dup, true);
    assert.deepStrictEqual([res, so.pending.length, so.rejected, fx.log.filter(o => o.id === 'qD1').length], [{ ok: true, seq }, 0, [], 1]);
  });

  await t('a restored page that saved an unanswered op finds it in the log and never resends it', async () => {
    const { so, w, mk } = await K.stage1Room(env);
    clock.t += 1100;
    w.faults.send.push({ after: lost });
    so.queue(reqOp('qS1'));
    await drain();
    const again = mk('client-so-00001', { storage: so.store });
    assert.ok(again.restore(so.code));
    assert.deepStrictEqual([again.pending.length, again.unsure], [1, true]);
    await again.poll();
    await again.flush();
    assert.deepStrictEqual([again.pending.length, w.count('send')], [0, 1]);
  });

  await t('a 503 with a non-JSON body keeps the op pending, backs off, and the op goes later', async () => {
    const fx = new F.FixtureTransport(STAGE1, { now: env.now });
    let replace = false;
    const http = new T.HttpTransport('https://w.example', K.fixtureFetch(fx, (req, res) => {
      if (replace && req.method === 'POST' && req.path.endsWith('/ops')) {
        replace = false;
        return { status: 503, headers: { get: () => null }, text: async () => 'error code: 1101' };
      }
      return res;
    }));
    const so = client(http, 'client-so-00001');
    await so.createRoom({ token: 'demo', keyId: 'demo', post: 'so' });
    clock.t += 1100;
    replace = true;
    const before = so.retryAfter;
    let res = null;
    so.queue(reqOp('q503')).then(r => { res = r; });
    await drain();
    assert.deepStrictEqual([res, so.pending.length, so.rejected, so.error], [null, 1, [], 'network']);
    assert.ok(so.retryAfter > before);
    clock.t += 1100;
    await so.flush();
    await drain();
    assert.strictEqual(res.ok, true);
    assert.strictEqual(fx.log.filter(o => o.id === 'q503').length, 1);
  });

  await t('HttpTransport: secrets travel in headers, never in URLs; timeouts and broken answers resolve status 0', async () => {
    const fx = new F.FixtureTransport(STAGE1, { now: env.now });
    const seen = [];
    const http = new T.HttpTransport('https://w.example/', K.fixtureFetch(fx, (req, res) => { seen.push(req); return res; }));
    const so = client(http, 'client-so-00001');
    await so.createRoom({ token: 'demo', keyId: 'demo', post: 'so' });
    const create = seen.find(r => r.path === '/room');
    assert.strictEqual(create.url, 'https://w.example/room');
    assert.deepStrictEqual([create.init.headers['X-Room-Key-Id'], create.init.headers['Content-Type']], ['demo', 'application/json']);
    clock.t += 1100;
    await so.queue(reqOp('qh'));
    await so.admin('observer');
    const secret = so.session.split('.')[2];
    const rest = seen.filter(r => r.path !== '/room');
    assert.ok(rest.some(r => r.method === 'POST' && r.path.endsWith('/ops')) && rest.some(r => /\/ops\?since=\d+$/.test(r.url)));
    rest.forEach(r => {
      assert.strictEqual(r.init.headers['X-Room-Session'], so.session);
      assert.ok(!r.url.includes(secret), r.url);
    });
    seen.length = 0;
    const obs = client(http, 'client-obs-00001');
    await obs.observe(so.code, so.observerToken);
    assert.strictEqual(seen[0].init.headers['X-Room-Observer'], so.observerToken);
    assert.strictEqual(seen[0].init.headers['X-Room-Session'], undefined);
    assert.ok(!seen[0].url.includes(so.observerToken));

    const delays = [];
    let aborted = 0;
    class FakeAbort { constructor() { this.signal = {}; } abort() { aborted++; } }
    const hang = new T.HttpTransport('https://x', () => new Promise(() => {}),
      { setTimeout: (fn, ms) => { delays.push(ms); fn(); return 1; }, clearTimeout: () => {}, AbortController: FakeAbort });
    assert.deepStrictEqual(await hang.poll('ABCDEF', 0, { session: 'a.1.b' }), { status: 0, body: { error: 'timeout' }, retryAfter: null });
    assert.deepStrictEqual([delays, aborted], [[15000], 1]);
    const broken = new T.HttpTransport('https://x', async () => ({ status: 200, headers: { get: () => '2' }, text: () => Promise.reject(new Error('stream reset')) }));
    assert.strictEqual((await broken.poll('ABCDEF', 0, {})).status, 0);
    const throwing = new T.HttpTransport('https://x', () => { throw new TypeError('bad init'); });
    assert.strictEqual((await throwing.poll('ABCDEF', 0, {})).status, 0);
    const html = new T.HttpTransport('https://x', async () => ({ status: 503, headers: { get: k => (k === 'Retry-After' ? '7' : null) }, text: async () => 'error code: 1101' }));
    assert.deepStrictEqual(await html.send('ABCDEF', [], { session: 's' }), { status: 503, body: { error: 'bad-json' }, retryAfter: 7 });
  });

  await t('stale answers: a poll landing after rotate, a poll sent before it, and a poll after leave change nothing', async () => {
    const { so, mo, w, fx } = await K.stage1Room(env);
    clock.t += 1100; await so.queue(reqOp('qB0'));
    clock.t += 1100; await mo.queue({ op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [212, -148] } });
    clock.t += 1100; await mo.queue(reqOp('qB1', 'position'));
    const g1 = gate(), g2 = gate();
    w.faults.poll.push(K.holdAfter(g1));
    const p1 = so.poll();
    await g1.reached;
    w.faults.poll.push(K.holdAfter(g2));
    clock.t += 1100;
    const pa = so.admin('rotate');
    await g2.reached;
    g1.open(); await p1;
    g2.open(); await pa;
    const truth = R.createState();
    fx.log.forEach(op => R.applyOp(truth, op));
    assert.strictEqual(so.room.seq, fx.state.seq);
    assert.deepStrictEqual(liveIds(so.room), liveIds(truth));
    assert.ok(so.me);

    const g3 = gate();
    w.faults.poll.push(K.holdBefore(g3));
    const p3 = so.poll();
    await g3.reached;
    clock.t += 1100;
    await so.admin('rotate');
    g3.open(); await p3;   // went out with the old code and session: 401 rotated, dropped
    assert.deepStrictEqual([so.status, so.error], ['in', null]);
    assert.strictEqual((await fx.poll(so.code, 0, { session: so.session })).status, 200);

    const g4 = gate();
    w.faults.poll.push(K.holdAfter(g4));
    const p4 = so.poll();
    await g4.reached;
    so.leave();
    g4.open(); await p4;
    assert.deepStrictEqual([so.status, so.code, so.room.seq], ['idle', null, 0]);
  });

  await t('a log shorter than the seq it promises is read again from zero', async () => {
    const { so, mo, w, fx } = await K.stage1Room(env);
    clock.t += 1100;
    await mo.queue(reqOp('qR1', 'position'));
    const since = so.room.seq;
    w.faults.poll.push({ after: r => Object.assign({}, r, { body: Object.assign({}, r.body, { ops: [] }) }) });
    await so.poll();
    assert.deepStrictEqual(w.calls.filter(c => c.m === 'poll').slice(-2).map(c => c.args[1]), [since, 0]);
    assert.strictEqual(so.room.seq, fx.state.seq);
    assert.ok(so.room.objects.qR1);
  });

  await t('423: the op is answered with the reason, dropped, and the new meta is read', async () => {
    const { so, mo } = await K.stage1Room(env);
    clock.t += 1100;
    await so.admin('silence', { on: true });
    const res = await mo.queue({ op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [1, 2] } });
    assert.deepStrictEqual(res, { ok: false, error: 'silence', status: 423 });
    assert.deepStrictEqual([mo.pending.length, mo.rejected.pop().error, mo.meta.frozen.reason], [0, 'silence', 'silence']);
  });

  await t('an acked op stays on screen until the poll that carries it lands', async () => {
    const { so, w } = await K.stage1Room(env);
    clock.t += 1100;
    w.faults.poll.push({ before: () => Promise.resolve(lost()) });
    const res = await so.queue(reqOp('qH1'));
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual([so.pending.length, so.acked.length, so.error], [0, 1, 'network']);
    assert.deepStrictEqual(so.requests().map(r => [r.id, !!r.pending, r.seq]), [['qH1', false, res.seq]]);
    await so.poll();
    assert.deepStrictEqual([so.acked.length, so.requests().map(r => r.id)], [0, ['qH1']]);
  });

  await t('flush: ops queued during a send go right after it; batches stay within opsPerSec; a rate ack waits', async () => {
    const { so, w } = await K.stage1Room(env);
    clock.t += 1100;
    const g = gate();
    w.faults.send.push(K.holdBefore(g));
    const pA = so.queue(reqOp('qF1'));
    await g.reached;
    const pB = so.queue(reqOp('qF2', 'position'));
    g.open();
    assert.deepStrictEqual([(await pA).ok, (await pB).ok, so.pending.length], [true, true, 0]);

    clock.t += 1100;
    for (let i = 0; i < 15; i++) so.pending.push(Object.assign(reqOp('qK' + i, 'position'), { cid: 'k' + i }));
    const sent = w.count('send');
    await so.flush();
    const batches = w.calls.filter(c => c.m === 'send').slice(sent).map(c => c.args[1].length);
    assert.deepStrictEqual(batches, [10, 5]);
    assert.deepStrictEqual([so.pending.length, so.rejected], [5, []], 'the rate-limited rest waits');
    clock.t += 1100;
    await so.flush();
    assert.strictEqual(so.pending.length, 0);
  });

  await t('back-off: repeated 503 and network failures stretch the interval; Retry-After wins', async () => {
    const { so, w } = await K.stage1Room(env);
    const seen = [];
    for (let i = 0; i < 3; i++) {
      w.faults.poll.push({ before: () => Promise.resolve({ status: 503, body: { error: 'disabled' }, retryAfter: null }) });
      await so.poll();
      seen.push(so.retryAfter);
    }
    assert.deepStrictEqual([seen, so.error], [[20, 30, 30], 'disabled']);
    w.faults.poll.push({ before: () => Promise.resolve({ status: 429, body: { error: 'rate' }, retryAfter: 45 }) });
    await so.poll();
    assert.strictEqual(so.retryAfter, 45);
    await so.poll();
    assert.deepStrictEqual([so.error, so.retryAfter], [null, 10]);
  });

  await t('expiry: 401 rotated and a 404 before the deadline mean expired; a 404 after it means gone', async () => {
    const a = await K.stage1Room(env);
    clock.t += 1100;
    await a.so.admin('rotate');
    await a.mo.poll();
    assert.deepStrictEqual([a.mo.status, a.mo.error, a.mo.session], ['expired', 'rotated', null]);
    assert.strictEqual(a.mo.store.read(a.mo.key()).session, null, 'the dead secret left storage');

    const b = await K.stage1Room(env);
    clock.t += 1100;
    b.w.faults.send.push({ before: () => Promise.resolve(lost()) });
    let res = null;
    b.mo.queue({ op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [1, 2] } }).then(r => { res = r; });
    await drain();
    b.w.faults.poll.push({ before: () => Promise.resolve({ status: 404, body: { error: 'room' }, retryAfter: null }) });
    await b.mo.poll();
    await drain();
    assert.deepStrictEqual([b.mo.status, b.mo.error, res], ['expired', 'room', { ok: false, error: 'expired' }]);

    const c = await K.stage1Room(env);
    clock.t += (STAGE1.ttl.roomMaxSec + 60) * 1000;
    c.w.faults.poll.push({ before: () => Promise.resolve({ status: 404, body: { error: 'room' }, retryAfter: null }) });
    await c.mo.poll();
    assert.deepStrictEqual([c.mo.status, c.mo.error], ['gone', 'room']);
  });

  await t('queue() refuses at once where nothing can be written: idle, observer, expired, closed', async () => {
    const { so, mo, mk } = await K.stage1Room(env);
    assert.deepStrictEqual(await mk('client-idle-0001').queue(reqOp('qi')), { ok: false, error: 'idle' });
    await so.admin('observer');
    const obs = mk('client-obs-00001');
    await obs.observe(so.code, so.observerToken);
    assert.deepStrictEqual(await obs.queue(reqOp('qo')), { ok: false, error: 'observer' });
    clock.t += 1100;
    await so.admin('release', { client: mo.client });
    await mo.poll();
    assert.deepStrictEqual(await mo.queue(reqOp('qe')), { ok: false, error: 'expired' });
    await so.admin('close');
    assert.strictEqual(so.status, 'closed');
    assert.deepStrictEqual(await so.queue(reqOp('qc')), { ok: false, error: 'closed' });
    assert.deepStrictEqual([obs.pending.length, mo.pending.length, so.pending.length], [0, 0, 0]);
  });

  await t('re-join: the held session goes along as proof; without it the seat answers 409 member', async () => {
    const { so, mo, w, mk, moCode } = await K.stage1Room(env);
    const entry = so.code + '-' + moCode;
    assert.deepStrictEqual(w.calls.filter(c => c.m === 'join').pop().args[2], {}, 'a first join has nothing to prove');
    clock.t += 1100;
    const held = mo.session;
    await mo.join({ entry });
    assert.strictEqual(w.calls.filter(c => c.m === 'join').pop().args[2].session, held);
    assert.strictEqual(mo.status, 'in');
    const elsewhere = mk('client-mortar-01');
    await elsewhere.join({ entry });
    assert.deepStrictEqual([elsewhere.error, elsewhere.status], ['member', 'idle']);
    await so.poll();
    assert.strictEqual(so.members().filter(m => m.client === mo.client).length, 1, 'nobody evicted, nobody doubled');
    const reloaded = mk('client-mortar-01', { storage: mo.store });
    await reloaded.join({ entry });
    assert.strictEqual(reloaded.status, 'in', 'a stored session is proof too');
  });

  await t('merged() is memoized per seq and pending change', async () => {
    const { so } = await K.stage1Room(env);
    const a = so.merged();
    assert.strictEqual(so.merged(), a);
    clock.t += 1100;
    const p = so.queue(reqOp('qM1'));
    const b = so.merged();
    assert.notStrictEqual(b, a);
    assert.strictEqual(b.objects.qM1.pending, true);
    assert.strictEqual(so.merged(), b);
    await p;
    assert.ok(!so.merged().objects.qM1.pending);
    assert.ok(!so.room.objects.qM1.pending, 'the confirmed copy is never marked');
  });

  await t('clock offset keeps the shortest round trip, and takes a big jump at once', async () => {
    const fx = new F.FixtureTransport(STAGE1, { now: env.now, skew: 5000 });
    const w = K.wrap(fx);
    const slow = ms => ({ after: r => { clock.t += ms; return r; } });
    const c = client(w, 'client-so-00001');
    w.faults.poll.push(slow(400));
    await c.createRoom({ token: 'demo', keyId: 'demo', post: 'so' });
    assert.strictEqual(c.offset, 5000 - 200);
    w.faults.poll.push(slow(20));
    await c.poll();
    assert.strictEqual(c.offset, 5000 - 10);
    w.faults.poll.push(slow(300));
    await c.poll();
    assert.strictEqual(c.offset, 5000 - 10, 'a slow answer does not move it');
    fx.skew += 120000;
    w.faults.poll.push(slow(300));
    await c.poll();
    assert.strictEqual(c.offset, 125000 - 150);
  });

  await t('a room of another fork is refused; client ids are capped at 24 characters', async () => {
    const other = new F.FixtureTransport(Object.assign({}, STAGE1, { fork: 'rmc14' }), { now: env.now });
    const c = client(other, 'client-so-00001');
    await c.createRoom({ token: 'demo', keyId: 'demo', post: 'so' });
    assert.deepStrictEqual([c.error, c.status, c.code], ['fork', 'idle', null]);
    const long = client(null, 'x'.repeat(40));
    assert.strictEqual(long.client.length, 24);
    assert.ok(('mem-' + long.client + '-' + 99999999999).length <= 40);
    const ls = K.fakeLocalStorage();
    ls.setItem('chemdb-tactical:room-client', JSON.stringify('legacy-' + 'y'.repeat(40)));
    const fresh = new T.RoomClient({ transport: null, storage: T.makeStorage(ls), policy: STAGE1, fork: 'stories_cm' });
    assert.match(fresh.client, /^[A-Za-z0-9_-]{8,24}$/);
    assert.strictEqual(T.makeStorage(ls).read('chemdb-tactical:room-client'), fresh.client);
  });

  await t('hooks for tactical.js: a throwing panel never escapes into Series T', async () => {
    warned.length = 0;
    const TR = env.window.TacRoom;
    env.window.TacRoomUI = { mount() { throw new Error('mount'); }, notify() { throw new Error('notify'); }, consumePick() { throw new Error('pick'); } };
    assert.doesNotThrow(() => TR.attach({}));
    assert.doesNotThrow(() => TR.notify('marker', {}));
    assert.strictEqual(TR.consumePick([1, 2]), false);
    assert.strictEqual(warned.length, 3);
    env.window.TacRoomUI = { mount() {}, notify() {}, consumePick: () => true };
    assert.strictEqual(TR.consumePick([1, 2]), true);
    delete env.window.TacRoomUI;
    assert.strictEqual(TR.consumePick([1, 2]), false);
  });

  console.log('OK', count(), 'cases');
})().catch(e => { console.error(e); process.exit(1); });

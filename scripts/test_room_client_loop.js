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

// Page timers that only record; a test fires them by hand through .pages.
const pageHost = over => Object.assign({
  pages: [], cleared: [],
  setTimeout(fn, ms) { this.pages.push({ fn, ms, every: false }); return this.pages.length; },
  clearTimeout(id) { this.cleared.push(id); },
  setInterval(fn, ms) { this.pages.push({ fn, ms, every: true }); return this.pages.length; },
  clearInterval(id) { this.cleared.push(id); }
}, over || {});

// A dedicated Worker stand-in: new Worker(objectURL) runs the script from that Blob against timers the test
// fires by hand (wt.fire), and passes messages both ways.
function workerHost() {
  const blobs = {}, workers = [];
  const wt = {
    map: new Map(), id: 0,
    set: (fn, ms, every) => { wt.map.set(++wt.id, { fn, ms, every: !!every }); return wt.id; },
    clear: k => { wt.map.delete(k); },
    fire: () => { [...wt.map].forEach(([k, x]) => { if (!x.every) wt.map.delete(k); x.fn(); }); }
  };
  function Blob(parts, opts) { this.text = parts.join(''); this.type = opts && opts.type; }
  const URL = { createObjectURL: b => { const u = 'blob:test/' + (Object.keys(blobs).length + 1); blobs[u] = b; return u; } };
  function Worker(url) {
    const self = this;
    this.source = blobs[url].text;
    this.type = blobs[url].type;
    this.sent = [];
    this.terminated = false;
    workers.push(this);
    const scope = new Function('postMessage', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'var onmessage; ' + this.source + ' return function (data) { onmessage({ data: data }); };');
    this.deliver = scope(id => self.onmessage({ data: id }), (fn, ms) => wt.set(fn, ms), wt.clear, (fn, ms) => wt.set(fn, ms, true), wt.clear);
  }
  Worker.prototype.postMessage = function (m) { this.sent.push(m); this.deliver(JSON.parse(JSON.stringify(m))); };
  Worker.prototype.terminate = function () { this.terminated = true; };
  return { host: pageHost({ Worker, Blob, URL }), workers, wt };
}

// A document for visibilitychange; show(state) sets visibilityState and fires the event.
function fakeDocument() {
  const d = {
    visibilityState: 'visible', listeners: [],
    addEventListener(type, fn) { if (type === 'visibilitychange') d.listeners.push(fn); },
    removeEventListener(type, fn) { d.listeners = d.listeners.filter(x => x !== fn); },
    show(state) { d.visibilityState = state; d.listeners.slice().forEach(fn => fn({ type: 'visibilitychange' })); }
  };
  return d;
}

(async () => {
  await t('timers: without Worker the page timers run them; a Worker constructor that throws is tried once, then the page for good', async () => {
    const host = pageHost();
    const tm = T.makeTimers(host);
    assert.strictEqual(tm.mode(), 'idle', 'nothing is made before the first timer');
    const hits = [];
    const a = tm.setTimeout(() => hits.push('a'), 250);
    const b = tm.setInterval(() => hits.push('b'), 1000);
    assert.deepStrictEqual([tm.mode(), host.pages.map(p => [p.ms, p.every])], ['page', [[250, false], [1000, true]]]);
    host.pages[0].fn();
    host.pages[1].fn();
    host.pages[1].fn();
    assert.deepStrictEqual(hits, ['a', 'b', 'b']);
    tm.clearTimeout(a);
    assert.deepStrictEqual(host.cleared, [], 'a timeout that fired has nothing left to clear');
    tm.clearInterval(b);
    assert.deepStrictEqual(host.cleared, [2]);
    host.pages[1].fn();
    assert.deepStrictEqual(hits, ['a', 'b', 'b'], 'a page callback arriving after its clear runs nothing');
    host.Worker = workerHost().host.Worker;
    tm.setTimeout(() => {}, 5);
    assert.deepStrictEqual([tm.mode(), host.pages.length], ['page', 3], 'a Worker that shows up later is not tried');

    let made = 0;
    const refused = workerHost();
    refused.host.Worker = function () { made++; throw new Error('SecurityError: refused by worker-src'); };
    const tr = T.makeTimers(refused.host);
    tr.setTimeout(() => {}, 10);
    tr.setTimeout(() => {}, 20);
    tr.setInterval(() => {}, 30);
    assert.deepStrictEqual([made, tr.mode(), refused.host.pages.map(p => p.ms)], [1, 'page', [10, 20, 30]]);
    const noBlob = workerHost();
    delete noBlob.host.Blob;
    const tb = T.makeTimers(noBlob.host);
    tb.setTimeout(() => {}, 10);
    assert.deepStrictEqual([tb.mode(), noBlob.workers.length, noBlob.host.pages.length], ['page', 0, 1], 'no Blob: no worker either');
    assert.deepStrictEqual(['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'mode'].map(k => typeof T.timers[k]),
      ['function', 'function', 'function', 'function', 'function'], 'TacRoom.timers is one of these');
  });

  await t('timers: one Worker made from a Blob runs every timer; callbacks fire, clears cancel, a throwing callback keeps its schedule', async () => {
    const { host, workers, wt } = workerHost();
    const tm = T.makeTimers(host);
    const hits = [];
    warned.length = 0;
    tm.setTimeout(() => hits.push('a'), 1000);
    const b = tm.setTimeout(() => hits.push('b'), 2000);
    const c = tm.setInterval(() => { hits.push('c'); throw new Error('tick bug'); }, 500);
    assert.deepStrictEqual([tm.mode(), workers.length, host.pages.length, wt.map.size], ['worker', 1, 0, 3], 'one worker for all, no page timers');
    assert.strictEqual(workers[0].type, 'text/javascript');
    assert.ok(!/[\\\x00-\x08\x0b\x0c\x0e-\x1f]/.test(workers[0].source) && workers[0].source.indexOf('//') < 0, 'no escape, control character or comment in the worker script');
    assert.deepStrictEqual(workers[0].sent.map(m => [m.op, m.ms, m.every]), [['set', 1000, false], ['set', 2000, false], ['set', 500, true]]);
    tm.clearTimeout(b);
    assert.strictEqual(wt.map.size, 2, 'the clear reached the worker');
    wt.fire();
    wt.fire();
    assert.deepStrictEqual(hits, ['a', 'c', 'c']);
    assert.strictEqual(wt.map.size, 1, 'the interval stays on the worker');
    assert.strictEqual(warned.filter(x => x[0] === '[room] timer').length, 2, 'each throw is logged');
    tm.clearInterval(c);
    wt.fire();
    assert.deepStrictEqual([hits.length, wt.map.size], [3, 0]);

    const d = tm.setTimeout(() => hits.push('d'), 10);
    tm.clearTimeout(d);
    workers[0].onmessage({ data: d });
    assert.strictEqual(hits.length, 3, 'a timer cleared while its message is on the way runs nothing');

    tm.setTimeout(() => { hits.push('e'); tm.setTimeout(() => hits.push('f'), 10); }, 10);
    wt.fire();
    wt.fire();
    assert.deepStrictEqual([hits.slice(3), workers.length], [['e', 'f'], 1], 'a timer set in a callback goes to the same worker');

    // The worker reports an error after it was made: what it held moves to page timers, for good.
    tm.setTimeout(() => hits.push('g'), 3000);
    tm.setInterval(() => hits.push('h'), 1000);
    workers[0].onerror({ message: 'script refused' });
    assert.deepStrictEqual([tm.mode(), workers[0].terminated, host.pages.map(p => [p.ms, p.every])], ['page', true, [[3000, false], [1000, true]]]);
    wt.fire();
    assert.strictEqual(hits.length, 5, 'a late message from the dropped worker runs nothing');
    host.pages.forEach(p => p.fn());
    assert.deepStrictEqual(hits.slice(5), ['g', 'h']);
    tm.setTimeout(() => {}, 40);
    assert.deepStrictEqual([workers.length, host.pages.length], [1, 3]);
  });

  await t('loop: injected timers are used when given; otherwise the loop and the HTTP timeout run on TacRoom.timers', async () => {
    const saved = { set: T.timers.setTimeout, clear: T.timers.clearTimeout };
    const used = [];
    T.timers.setTimeout = (fn, ms) => { used.push(ms); return 99; };
    T.timers.clearTimeout = id => { used.push('clear ' + id); };
    try {
      const T1 = K.fakeTimers();
      const { so, mo } = await K.stage1Room(env, { so: { setTimeout: T1.set, clearTimeout: T1.clear } });
      so.startLoop();
      await drain();
      assert.deepStrictEqual([T1.size(), used], [1, []], 'the fake timers took the step');
      so.stopLoop();
      mo.startLoop();
      await drain();
      assert.deepStrictEqual(used, [Math.max(1, mo.retryAfter) * 1000], 'the default is TacRoom.timers');
      mo.stopLoop();
      assert.deepStrictEqual(used.slice(1), ['clear 99']);
      const http = new T.HttpTransport('https://x', async () => ({ status: 200, headers: { get: () => null }, text: async () => '{}' }));
      used.length = 0;
      await http.poll('ABCDEF', 0, {});
      assert.deepStrictEqual(used, [15000, 'clear 99'], 'the request timeout too');
    } finally {
      T.timers.setTimeout = saved.set;
      T.timers.clearTimeout = saved.clear;
    }
  });

  await t('back in view: one poll at once instead of the Retry-After wait; none beside a poll in flight; none once stopped', async () => {
    const T1 = K.fakeTimers(), doc = fakeDocument();
    const { so, w } = await K.stage1Room(env, { so: { setTimeout: T1.set, clearTimeout: T1.clear, document: doc } });
    so.startLoop();
    await drain();
    assert.deepStrictEqual([T1.size(), doc.listeners.length], [1, 1]);
    let polls = w.count('poll');
    doc.show('hidden');
    await drain();
    assert.strictEqual(w.count('poll'), polls, 'hiding polls nothing');
    doc.show('visible');
    await drain();
    assert.strictEqual(w.count('poll'), polls + 1, 'one poll at once');
    assert.strictEqual(T1.size(), 1, 'the waiting step was replaced, not doubled');

    polls = w.count('poll');
    const g = gate();
    w.faults.poll.push(K.holdBefore(g));
    T1.fireAll();
    await g.reached;
    doc.show('hidden');
    doc.show('visible');
    await drain();
    assert.strictEqual(w.count('poll'), polls + 1, 'no second poll beside the step\'s own');
    g.open();
    await drain();
    assert.strictEqual(T1.size(), 1);

    polls = w.count('poll');
    const g2 = gate();
    w.faults.poll.push(K.holdBefore(g2));
    const p = so.poll();
    await g2.reached;
    assert.strictEqual(so.polling, 1);
    doc.show('visible');
    await drain();
    assert.deepStrictEqual([w.count('poll'), T1.size()], [polls + 1, 1], 'none beside a poll sent outside the loop; the step keeps waiting');
    g2.open();
    await p;
    assert.strictEqual(so.polling, 0);
    doc.show('visible');
    await drain();
    assert.strictEqual(w.count('poll'), polls + 2, 'with nothing in flight it polls again');

    so.stopLoop();
    assert.strictEqual(doc.listeners.length, 0, 'stopLoop drops the listener');
    polls = w.count('poll');
    doc.show('visible');
    await drain();
    assert.strictEqual(w.count('poll'), polls);
    w.faults.poll.push({ before: () => { throw new Error('transport bug'); } });
    assert.throws(() => so.poll());
    assert.strictEqual(so.polling, 0, 'a poll that throws at once is not counted as out');
  });

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

  await t('restore never trusts the saved shape: acked {}, pending "x", seq -5 and junk objects give a working client', async () => {
    const { so, mk } = await K.stage1Room(env);
    const store = T.makeStorage(K.fakeLocalStorage());
    const again = mk('client-so-00001', { storage: store });
    const key = again.key(so.code);
    const base = { code: so.code, fork: 'stories_cm', planet: 'lv624', session: so.session };
    store.write(key, Object.assign({}, base, { seq: -5, objects: { junk: 'x', nul: null, list: [1] }, pending: 'x', acked: {} }));
    assert.ok(again.restore(so.code));
    assert.deepStrictEqual([again.room.seq, again.room.objects, again.pending, again.acked, again.unsure], [0, {}, [], [], false]);
    assert.doesNotThrow(() => { again.merged(); again.visible(); again.requests(); again.calibration(); });
    await again.poll();
    assert.deepStrictEqual([again.status, again.error, !!again.me], ['in', null, true]);
    assert.doesNotThrow(() => again.visible());

    const good = Object.assign(reqOp('qZ1'), { cid: 'z1' }), late = Object.assign(reqOp('qZ2'), { cid: 'z2' });
    store.write(key, Object.assign({}, base, { seq: 7.9, objects: [],
      pending: [good, { op: 'put', kind: 'request' }, null, 'x', Object.assign({}, good, { id: 5 })],
      acked: [{ seq: 9, op: late }, { seq: '9', op: late }, { seq: 9 }, 5, { seq: 9, op: 'x' }] }));
    assert.ok(again.restore(so.code));
    assert.deepStrictEqual([again.room.seq, again.room.objects, again.pending.map(o => o.cid), again.acked.map(a => a.op.cid), again.unsure],
      [7, {}, ['z1'], ['z2'], true], 'only well-formed entries stay');
    assert.doesNotThrow(() => { again.merged(); again.visible(); });
    store.write(key, 'x');
    assert.strictEqual(again.restore(so.code), false, 'an entry that is no object is not a room');
  });

  await t('final review: restore keeps a sheet only as [{post, squad, code}] and never a prototype key; a logged __proto__ op leaves the client whole', async () => {
    const { so, mk, fx } = await K.stage1Room(env);
    const store = T.makeStorage(K.fakeLocalStorage());
    const again = mk('client-so-00001', { storage: store });
    const key = again.key(so.code);
    const base = { code: so.code, fork: 'stories_cm', planet: 'lv624', session: so.session };
    for (const junk of ['x', 5, { post: 'so', code: 'AB23' }, null]) {
      store.write(key, Object.assign({}, base, { sheet: junk }));
      assert.ok(again.restore(so.code));
      assert.strictEqual(again.sheet, null, JSON.stringify(junk));
    }
    const objects = JSON.parse('{"__proto__": {"id": "__proto__", "kind": "member", "client": "ghost", "post": "so", "confirmed": true},' +
      ' "constructor": {"kind": "marker"}, "calibration": {"kind": "request"}}');
    store.write(key, Object.assign({}, base, { objects,
      sheet: [{ post: 'so', squad: null, code: 'AB23', extra: '<b>' }, { post: 'mortar', code: 'CD45' }, { post: 'so', squad: 7, code: 'EF67' }, 'x', null, { post: 'so' }] }));
    assert.ok(again.restore(so.code));
    assert.deepStrictEqual(again.sheet, [{ post: 'so', squad: null, code: 'AB23' }, { post: 'mortar', squad: null, code: 'CD45' }]);
    assert.deepStrictEqual([Object.getPrototypeOf(again.room.objects) === Object.prototype, Object.keys(again.room.objects)], [true, []]);
    assert.doesNotThrow(() => { again.members(); again.merged(); again.visible(); again.requests(); });
    // A saved pending op under such an id is dropped too: merged() never copies Object.prototype's `constructor`.
    const ok = Object.assign(reqOp('qP1'), { cid: 'p1' });
    store.write(key, Object.assign({}, base, { pending: [Object.assign(reqOp('constructor'), { cid: 'p0' }), ok,
      Object.assign(reqOp('calibration'), { cid: 'p2' })] }));
    assert.ok(again.restore(so.code));
    assert.deepStrictEqual(again.pending.map(o => o.cid), ['p1']);
    assert.doesNotThrow(() => again.merged());
    // An op of that id already in the log (written before the Worker checked ids): applyOp refuses it, seq still moves on.
    const seq = fx.state.seq + 1;
    fx.log.push({ seq, at: env.now(), by: { client: so.client, post: 'so', squad: null }, op: 'put', kind: 'request', id: '__proto__',
      data: { type: 'mortar', target: { x: 1, y: 1 }, markerId: null }, cid: '' });
    fx.state.seq = seq;
    await so.poll();
    assert.deepStrictEqual([so.room.seq, Object.getPrototypeOf(so.room.objects) === Object.prototype, so.error], [seq, true, null]);
    assert.doesNotThrow(() => { so.members(); so.merged(); so.requests(); });
    assert.deepStrictEqual(so.members().map(m => m.post).sort(), ['mortar', 'so']);
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

// scripts/test_room_client_kit.js — shared helpers for scripts/test_room_client_*.js; runs no cases itself.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const policy = name => JSON.parse(read(name === 'full' ? 'scripts/fixtures/room_policy_full.json' : 'tactical/policy/' + name + '.json'));

// A browser-like global with the logic, the fixture and the client loaded. Timers never fire unless a
// test injects its own; console.warn is captured; the clock moves only when a test moves it.
function load() {
  const warned = [];
  const window = { setTimeout: () => 0, clearTimeout: () => {}, console: { warn: (...a) => warned.push(a) } };
  for (const f of ['tactical/room-logic.js', 'tactical/room-fixtures.js', 'tactical/room.js']) new Function('window', read(f))(window);
  const clock = { t: Date.UTC(2026, 8, 13, 18, 0, 0) };
  return { window, warned, clock, now: () => clock.t, R: window.TacticalRoomLogic, T: window.TacRoom, F: window.TacRoomFixture, STAGE1: policy('stories_cm') };
}

function fakeLocalStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

// Lets every already-resolved promise chain run to its end.
const drain = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

// A door a request waits at: `reached` resolves when it arrives, open() lets it through.
function gate() {
  const g = {};
  g.p = new Promise(r => { g.open = r; });
  g.reached = new Promise(r => { g.hit = r; });
  return g;
}
const holdBefore = g => ({ before: run => { g.hit(); return g.p.then(run); } });
const holdAfter = g => ({ after: r => { g.hit(); return g.p.then(() => r); } });

function fakeTimers() {
  const map = new Map();
  let id = 0;
  return {
    set: (fn, ms) => { map.set(++id, { fn, ms }); return id; },
    clear: k => { map.delete(k); },
    size: () => map.size,
    fireAll: () => { const all = [...map.values()]; map.clear(); all.forEach(x => x.fn()); }
  };
}

const lost = () => ({ status: 0, body: { error: 'network' }, retryAfter: null });

// Records every transport call; faults[method] is a queue of {before(run, args)} or {after(result, args)}.
function wrap(inner) {
  const w = { inner, calls: [], faults: {} };
  for (const m of ['create', 'join', 'poll', 'snapshot', 'send', 'admin', 'exportRoom', 'getPolicy']) {
    w.faults[m] = [];
    w[m] = (...args) => {
      w.calls.push({ m, args });
      const f = w.faults[m].shift();
      if (f && f.before) return f.before(() => inner[m](...args), args);
      const p = inner[m](...args);
      return f && f.after ? p.then(r => f.after(r, args)) : p;
    };
  }
  w.count = m => w.calls.filter(c => c.m === m).length;
  return w;
}

// fetch() in front of a FixtureTransport, so HttpTransport runs for real; hook(req, res) may replace res.
function fixtureFetch(fx, hook) {
  return async (url, init) => {
    const u = new URL(url);
    const h = init.headers || {};
    const auth = h['X-Room-Observer'] ? { observer: h['X-Room-Observer'] } : h['X-Room-Session'] ? { session: h['X-Room-Session'] } : {};
    const body = init.body ? JSON.parse(init.body) : null;
    const m = /^\/room(?:\/([A-Z0-9]{6})\/(join|ops|admin|export|snapshot))?$/.exec(u.pathname);
    let r;
    if (!m) r = { status: 404, body: { error: 'path' }, retryAfter: null };
    else if (!m[1]) r = await fx.create(body, h['X-Room-Key-Id']);
    else if (m[2] === 'join') r = await fx.join(m[1], body, auth);
    else if (m[2] === 'ops' && init.method === 'GET') r = await fx.poll(m[1], u.searchParams.get('since'), auth);
    else if (m[2] === 'ops') r = await fx.send(m[1], body.ops, auth);
    else if (m[2] === 'admin') r = await fx.admin(m[1], body, auth);
    else if (m[2] === 'export') r = await fx.exportRoom(m[1], auth);
    else r = await fx.snapshot(m[1], u.searchParams.get('cursor'), auth);
    const res = { status: r.status, headers: { get: k => (k === 'Retry-After' && r.retryAfter != null ? String(r.retryAfter) : null) },
      text: async () => JSON.stringify(r.body) };
    return hook ? hook({ url, init, method: init.method, path: u.pathname }, res) : res;
  };
}

// Stage 1 on a fixture: the staff officer creates, the mortar crew joins by post code, the officer confirms.
async function stage1Room(env, opts = {}) {
  const fx = new env.F.FixtureTransport(env.STAGE1, { now: env.now });
  const w = wrap(fx);
  const mk = (id, extra) => new env.T.RoomClient(Object.assign({ transport: w, storage: env.T.makeStorage(fakeLocalStorage()),
    policy: env.STAGE1, fork: 'stories_cm', planet: 'lv624', h: 'h1', now: env.now, clientId: id }, extra || {}));
  const so = mk('client-so-00001', opts.so);
  const mo = mk('client-mortar-01', opts.mo);
  await so.createRoom({ token: 'demo', keyId: 'demo', post: 'so', callsign: 'Орлов' });
  const moCode = so.sheet.find(s => s.post === 'mortar').code;
  await mo.join({ entry: so.code + '-' + moCode, callsign: 'Сидоров' });
  await so.poll();
  await so.admin('confirm', { client: mo.client });
  await mo.poll();
  return { fx, w, so, mo, mk, moCode };
}

const reqOp = (id, type = 'mortar') => ({ op: 'put', kind: 'request', id, data: { type, target: { x: 62, y: -62 }, priority: 'urgent', flags: [] } });

function runner() {
  let n = 0;
  return { t: async (name, fn) => { await fn(); n++; console.log('ok', name); }, count: () => n };
}

module.exports = { load, policy, fakeLocalStorage, drain, gate, holdBefore, holdAfter, fakeTimers, lost, wrap, fixtureFetch, stage1Room, reqOp, runner };

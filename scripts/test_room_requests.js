// scripts/test_room_requests.js — the requests module under Node: stored values stay escaped (tokenizer check),
// recall labels, the strip button per status, shots against the taken target, the planet guard, repeat,
// the mortar a «Deployed» moves, the request filter, digit keys and op shapes, and the request ping (who hears
// it, the shared schedule, stop conditions, «Heard», patterns and volume, the audio unlock notice, the title badge),
// and stage 2a: tasks without a point, the «To» list and addressed cards, the ping for the addressee only, «Share
// position» with the crew's mortar, member markers and the mortar zone on a recording canvas, the zone switch.
// Run: node scripts/test_room_requests.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const policy = JSON.parse(read('tactical/policy/stories_cm.json'));
if (typeof global.document === 'undefined') global.document = { addEventListener() {}, activeElement: null };

// The real shell (for esc, btn, fmt, postName, gameText) with register wrapped to capture the module.
function load(lang) {
  const window = { I18N_LANG: lang };
  new Function('window', read('tactical/room-logic.js'))(window);
  new Function('window', read('tactical/room-ui.js'))(window);
  const shellT = JSON.parse(JSON.stringify(window.TacRoomUI.api.T()));
  const register = window.TacRoomUI.register;
  let mod = null;
  window.TacRoomUI.register = m => { mod = m; register(m); };
  new Function('window', read('tactical/room-requests.js'))(window);
  assert.ok(mod, 'room-requests.js registers a module');
  return { window, module: mod, shellT, api: window.TacRoomUI.api, H: mod.helpers };
}

const env = load('en');
const { window, module: mod, api, H } = env;
const R = window.TacticalRoomLogic;

// Tokenizer check (review r3 hostile.js): every tag and attribute is on a short list, attribute values
// carry no < or >, numbers sit where numbers belong, and no raw < > " is left in the text between tags.
const TAGS = new Set(['div', 'span', 'b', 'button', 'p', 'section', 'h2', 'h3', 'form', 'label', 'input', 'select', 'option', 'br', 'em']);
const ATTR_OK = /^(class|style|type|name|value|maxlength|autocomplete|checked|selected|disabled|role|data-[a-z-]+)$/;
function unsafe(html) {
  const problems = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s"'<>\/=]+(?:="[^"]*")?)*)\s*\/?>/g;
  const rest = String(html).replace(tagRe, (m, close, name, attrs) => {
    if (!TAGS.has(name.toLowerCase())) problems.push('tag <' + name + '>');
    const aRe = /\s+([^\s"'<>\/=]+)(?:="([^"]*)")?/g;
    let a;
    while ((a = aRe.exec(attrs))) {
      const k = a[1], v = a[2] === undefined ? '' : a[2];
      if (/^on/i.test(k) || !ATTR_OK.test(k)) problems.push('attribute ' + k);
      if (/[<>]/.test(v)) problems.push('raw <> in ' + k + '="' + v + '"');
      if (k === 'style' && !/^--req:#[0-9a-f]{6}$/i.test(v)) problems.push('style ' + v);
      if (k === 'data-deadline' && !/^\d+(\.\d+)?$/.test(v)) problems.push('deadline ' + v);
      if (k === 'class' && /[^a-z0-9 _-]/i.test(v)) problems.push('class ' + v);
      if (k === 'maxlength' && !/^\d+$/.test(v)) problems.push('maxlength ' + v);
    }
    return '';
  });
  const bad = rest.match(/.{0,30}[<>"].{0,30}/);
  if (bad) problems.push('raw char in text: ' + JSON.stringify(bad[0]));
  return problems;
}
function assertSafe(html, label) {
  const p = unsafe(html);
  assert.deepStrictEqual(p, [], label + ': ' + p.join('; '));
}

const so = { id: 'mem-so', kind: 'member', client: 'c-so', post: 'so', confirmed: true };
const so2 = { id: 'mem-so2', kind: 'member', client: 'c-so2', post: 'so', confirmed: true };
const crew = { id: 'mem-crew', kind: 'member', client: 'c-crew', post: 'mortar', confirmed: true };
const crew2 = { id: 'mem-crew2', kind: 'member', client: 'c-crew2', post: 'mortar', confirmed: true };
const by = m => ({ client: m.client, post: m.post, squad: null });
const NOW = 5000000;
const constants = { mortar: { travelDelay: 2, impactDelay: 3, minRange: 15, maxRange: 65, tilesPerOffset: 10 }, shells: [{ id: 'he', name: 'HE', radius: 3 }] };

let queued = [];
let ackWith = () => ({ ok: true, seq: 1 });
let ctx;
function world(objects, me, extra) {
  queued = [];
  const all = {};
  objects.forEach(o => { all[o.id] = o; });
  ctx = Object.assign({ fork: { key: 'stories_cm', constants }, meta: { id: 'lv624', h: 'h1' }, level: 0, planet: {}, calibration: null, mortar: null }, extra || {});
  api.ui.policy = policy;
  api.ui.storage = { read: () => null, write: () => {} };
  api.ui.tab = null;
  api.ui.hooks = {
    getContext: () => ctx, view: { scale: 10, centerOn() {}, requestDraw() {} },
    takeTarget() {}, takePosition() {}, fire: () => { api.fired = (api.fired || 0) + 1; }, redraw() {}
  };
  api.ui.client = {
    status: 'in', me, meta: { planet: 'lv624' }, offset: 0,
    serverNow: () => NOW,
    merged: () => ({ objects: all }),
    requests: () => Object.values(all).filter(o => o.kind === 'request' && !o.deleted),
    visible: () => Object.values(all).filter(o => !o.deleted),
    member: c => Object.values(all).find(o => o.kind === 'member' && !o.deleted && o.client === c) || null,
    members: () => Object.values(all).filter(o => o.kind === 'member' && !o.deleted),
    calibration: () => null,
    queue: op => { queued.push(op); return Promise.resolve(ackWith(op)); }
  };
  api.fired = 0;
  H.state.taken = null;
  H.state.denyAsk = null;
  return all;
}
const req = over => Object.assign({ id: 'q1', kind: 'request', type: 'mortar', target: { x: 62, y: -62 }, status: 'requested',
  priority: 'normal', note: '', flags: [], level: 0, h: 'h1', at: NOW - 120000, seq: 5, by: by(so) }, over);
const mortarAsset = over => Object.assign({ id: 'asset-mortar-1', kind: 'asset', type: 'mortar', n: 1, owner: { post: 'mortar' },
  state: 'deployed', tile: [20, -98], claimedBy: null, notes: '' }, over);
const el = attrs => ({ getAttribute: k => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null) });
const tick = () => new Promise(r => setTimeout(r, 0));
// Swap api members for one test and put the shell's own back afterwards.
function withApi(over, fn) {
  const saved = {};
  Object.keys(over).forEach(k => { saved[k] = Object.prototype.hasOwnProperty.call(api, k) ? { v: api[k] } : null; api[k] = over[k]; });
  const restore = () => Object.keys(saved).forEach(k => { if (saved[k]) api[k] = saved[k].v; else delete api[k]; });
  let out;
  try { out = fn(); } catch (e) { restore(); throw e; }
  if (out && typeof out.then === 'function') return out.then(v => { restore(); return v; }, e => { restore(); throw e; });
  restore();
  return out;
}

// ── stage 2a scaffolding ──
// A canvas that records every call with the fill, stroke and alpha in force at that moment.
function canvas() {
  const c = { calls: [], fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, stack: [] };
  ['beginPath', 'arc', 'rect', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'fillRect', 'setLineDash', 'strokeText', 'fillText'].forEach(name => {
    c[name] = (...args) => { c.calls.push({ name, args, fill: c.fillStyle, stroke: c.strokeStyle, alpha: c.globalAlpha }); };
  });
  c.save = () => { c.stack.push({ fillStyle: c.fillStyle, strokeStyle: c.strokeStyle, globalAlpha: c.globalAlpha, lineWidth: c.lineWidth }); };
  c.restore = () => { Object.assign(c, c.stack.pop()); };
  c.of = name => c.calls.filter(x => x.name === name);
  c.texts = () => c.of('fillText').map(x => x.args[0]);
  return c;
}
const view = { scale: 10, worldToScreen: (x, y) => [x * 10, y * 10] };
// Stories with one squad post and one squad, for {post, squad} addressees.
const squadPolicy = JSON.parse(JSON.stringify(policy));
squadPolicy.squads = { alpha: { nameRu: 'Альфа', nameEn: 'Alpha', color: '#ff0000' } };
squadPolicy.posts.push({ id: 'sl', nameRu: 'Командир отделения', nameEn: 'Squad Leader', level: 'squad', max: 4 });
// A task without a map point, addressed to the mortar post by the staff officer.
const task = over => { const r = req(Object.assign({ id: 't1', type: 'task', note: 'hold the north gate', to: { post: 'mortar' } }, over)); if (!over || !('target' in over)) delete r.target; return r; };

// ── request ping scaffolding ──
const PREFS = 'chemdb-tactical:room-prefs';
const HEARD = 'chemdb-tactical:room-heard:K7M4Q2:';
const ORIG_TITLE = 'Tactical map — NanoTrasen ChemDB';
// A recording AudioContext: each pattern opens a group with its low-pass filter; oscillators keep type, pitch
// and times; gains keep their automation. resume() starts it only while `allow` is true.
function fakeAudio(state) {
  const ac = { state: state || 'running', currentTime: 10, destination: {}, groups: [], gains: [], resumes: 0, allow: true };
  const param = v => ({ value: v, events: [],
    setValueAtTime(x, at) { this.events.push(['set', x, at]); },
    linearRampToValueAtTime(x, at) { this.events.push(['lin', x, at]); },
    exponentialRampToValueAtTime(x, at) { this.events.push(['exp', x, at]); } });
  ac.createBiquadFilter = () => { const f = { type: '', frequency: param(350), connect() {}, oscillators: [] }; ac.groups.push(f); return f; };
  ac.createGain = () => { const g = { gain: param(1), connect() {} }; ac.gains.push(g); return g; };
  ac.createOscillator = () => {
    const o = { type: 'sine', frequency: param(440), connect() {}, start(at) { o.startAt = at; }, stop(at) { o.stopAt = at; } };
    ac.groups[ac.groups.length - 1].oscillators.push(o);
    return o;
  };
  // `hold`: the promise answers only when the test calls the functions in `held`.
  ac.hold = false;
  ac.held = [];
  ac.resume = () => {
    ac.resumes++;
    if (ac.hold) return new Promise(res => ac.held.push(res));
    if (ac.allow) ac.state = 'running';
    return Promise.resolve();
  };
  return ac;
}
const pitches = g => g.oscillators.filter(o => o.type === 'triangle').map(o => o.frequency.value);
const patterns = ac => ac.groups.map(g => (pitches(g).length === 2 ? 'normal' : pitches(g).length === 6 ? 'urgent' : '?'));
const peakOf = ac => Math.max(0, ...ac.gains.map(g => Math.max(0, ...g.gain.events.filter(e => e[0] === 'lin').map(e => e[1]))));
// document.title with a write counter.
const titleDoc = { value: '', writes: 0 };
Object.defineProperty(global.document, 'title', { configurable: true, get: () => titleDoc.value, set: v => { titleDoc.writes++; titleDoc.value = String(v); } });
// Date.now under test control; tickAt(ms) runs the module tick at T0 + ms.
const T0 = 1.8e12;
const realNow = Date.now;
let clock = T0;
async function withClock(fn) { Date.now = () => clock; try { return await fn(); } finally { Date.now = realNow; } }
const tickAt = ms => { clock = T0 + ms; mod.tick(api); };
const audioMade = { n: 0 };
let session = {};
// A room with prefs in a store, a fresh recording AudioContext, an empty sessionStorage and the page title.
function pingWorld(objects, me, opts) {
  opts = opts || {};
  const all = world(objects, me);
  api.ui.client.code = 'K7M4Q2';
  api.ui.client.client = me ? me.client : 'c-none';
  const store = { [PREFS]: opts.prefs ? JSON.parse(JSON.stringify(opts.prefs)) : null };
  api.ui.storage = { read: k => (store[k] ? JSON.parse(JSON.stringify(store[k])) : null), write: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); } };
  const ac = fakeAudio(opts.audio);
  audioMade.n = 0;
  Object.assign(H.state, { audio: null, makeAudio: () => { audioMade.n++; return ac; }, ping: { lastAt: null, seen: [] }, pinging: [], blocked: false,
    heard: { key: null, ids: [] }, heardMem: {}, title: null, seenAll: null });
  session = {};
  delete window.sessionStorage;
  window.sessionStorage = { getItem: k => (Object.prototype.hasOwnProperty.call(session, k) ? session[k] : null), setItem: (k, v) => { session[k] = String(v); } };
  titleDoc.value = ORIG_TITLE;
  titleDoc.writes = 0;
  clock = T0;
  return { all, ac, store };
}

let n = 0;
async function t(name, fn) { await fn(); n++; console.log('ok', name); }

(async () => {
  await t('l10n: module keys never overwrite shell keys; en and ru have the same shape', () => {
    const shellKeys = Object.keys(env.shellT).filter(k => k !== 'tabs' && k !== 'errors');
    const mine = Object.keys(mod.l10n.en).filter(k => k !== 'tabs' && k !== 'errors');
    assert.deepStrictEqual(mine.filter(k => shellKeys.indexOf(k) >= 0), [], 'no collisions');
    assert.strictEqual(api.T().claim, 'Take over', 'the shell reissue label survives');
    assert.strictEqual(api.T().assetClaim, 'Crew');
    const shape = v => Array.isArray(v) ? 'array:' + v.length
      : v && typeof v === 'object' ? Object.keys(v).sort().map(k => k + '{' + shape(v[k]) + '}').join(',') : typeof v;
    assert.strictEqual(shape(mod.l10n.ru), shape(mod.l10n.en));
    const ru = load('ru');
    assert.strictEqual(ru.api.T().claim, 'Занять');
    assert.strictEqual(ru.api.T().assetUnclaim, 'Отпустить');
    assert.strictEqual(ru.api.T().reqWrongPlanet, 'Карта другой планеты — переключитесь на планету комнаты.');
  });

  await t('the tokenizer check bites on hostile markup and passes the module chrome', () => {
    assert.deepStrictEqual(unsafe('<div class="tac-room-card" data-id="q&quot;1"><b>x</b> · <button disabled type="button">y</button></div>'), []);
    ['<img src=x onerror=1>', '<div onclick="1">', '<div class="a" data-id="x"><i>b</i></div>', '<span data-deadline="1e3x"></span>',
      '<div style="color:red">', '<div class="a&quot;">', '<b>"</b>', '<span>a > b</span>', '<div title="x">']
      .forEach(h => assert.ok(unsafe(h).length > 0, h));
  });

  await t('fmtNum renders finite numbers only', () => {
    assert.strictEqual(H.fmtNum(5), '5');
    assert.strictEqual(H.fmtNum(0), '0');
    assert.strictEqual(H.fmtNum(-2.5), '-2.5');
    [NaN, Infinity, -Infinity, '5', '<img onerror>', null, undefined, {}, [7]].forEach(v => assert.strictEqual(H.fmtNum(v), '', String(v)));
  });

  await t('validReq: finite target and a known status', () => {
    assert.strictEqual(H.validReq(req()), true);
    assert.strictEqual(H.validReq(req({ status: 'done' })), true);
    assert.strictEqual(H.validReq(null), false);
    assert.strictEqual(H.validReq(req({ target: null })), false);
    assert.strictEqual(H.validReq(req({ target: { x: NaN, y: 1 } })), false);
    assert.strictEqual(H.validReq(req({ target: { x: 1, y: '1' } })), false);
    assert.strictEqual(H.validReq(req({ target: { x: 1, y: Infinity } })), false);
    assert.strictEqual(H.validReq(req({ status: 'exploded' })), false);
    assert.strictEqual(H.validReq(req({ status: 'constructor' })), false);
    assert.strictEqual(H.validReq(req({ status: '"><img onerror=1>' })), false);
  });

  await t('invalid requests are skipped in cards, strip and chips', () => {
    world([req({ id: 'ok1' }), req({ id: 'bad1', target: { x: '<img onerror=1>', y: 0 } }), req({ id: 'bad2', status: 'x" onclick="1' }), mortarAsset()], so);
    const panel = mod.panel('requests', api), strip = mod.strip(api), chips = mod.chips(api);
    assert.ok(panel.includes('data-id="ok1"'), 'the valid card renders');
    [['panel', panel], ['strip', strip], ['chips', chips]].forEach(([name, html]) => {
      assert.ok(!html.includes('bad1') && !html.includes('bad2'), name + ': invalid ids absent');
      assertSafe(html, name);
    });
    assert.ok(chips.includes('Requests 1'), 'chip counts only valid open requests');
  });

  await t('card HTML: stored strings escaped, non-numbers render nothing, the strip countdown leads line two', () => {
    const evil = req({ id: 'x"><img src=x onerror=1>', type: '<i>', status: 'firing', firedAt: '"><img onerror=1>', at: '<i>',
      note: '<script>alert(1)</script>', reason: '<img onerror=1>', priority: '"><i>', by: { client: 'c-x', post: '<i>', squad: '<i>' } });
    world([evil], crew);
    let html = mod.panel('requests', api) + mod.strip(api);
    assertSafe(html, 'hostile request');
    assert.ok(!html.includes('data-deadline'), 'a string firedAt gives no countdown');
    assert.ok(html.includes('&lt;script&gt;'), 'the note is shown escaped');
    assert.ok(html.includes('--req:#e8ecf4'), 'unknown type falls back to the default colour');
    world([req({ by: '"><img onerror=1>' })], so);
    html = mod.panel('requests', api);
    assertSafe(html, 'string by');
    assert.ok(!html.includes('undefined'), 'no author text from a non-object by');
    world([req({ status: 'firing', type: 'mortar', firedAt: '"><img onerror=1>' })], crew);
    html = mod.panel('requests', api) + mod.strip(api);
    assert.ok(!html.includes('data-deadline'), 'a string firedAt on a mortar strike renders no countdown');
    assertSafe(html, 'string firedAt');
    world([req({ status: 'firing', type: 'mortar', firedAt: '99' })], crew);
    assert.ok(!mod.panel('requests', api).includes('data-deadline'), 'a numeric string firedAt renders no countdown either');
    world([req({ status: 'firing', firedAt: NOW - 1000, type: 'mortar' })], crew);
    const panel = mod.panel('requests', api), strip = mod.strip(api);
    assertSafe(panel + strip, 'firing strike');
    assert.ok(/tac-room-status">[^<]*<\/span> · impact in <span data-deadline="\d+"><\/span><\/div>/.test(panel), 'full card: countdown in the head');
    const lines = strip.match(/<div class="tac-room-card-text"><div>(.*?)<\/div><div class="tac-muted">(.*?)<\/div><\/div>/);
    assert.ok(lines, strip);
    assert.ok(!lines[1].includes('data-deadline'), 'strip line one has no countdown');
    assert.ok(/^impact in <span data-deadline="\d+"><\/span> · Staff Officer · 2 min$/.test(lines[2]), 'strip line two starts with it: ' + lines[2]);
  });

  await t('asset board: a radius of "<img onerror>" renders nothing, a number renders', () => {
    world([mortarAsset({ radius: '<img onerror=1>', state: 'constructor', shell: '"><img onerror=1>', claimedBy: 'c-crew' }), crew], crew);
    let html = mod.panel('assets', api) + mod.chips(api);
    assertSafe(html, 'hostile asset');
    assert.ok(!html.includes('· r '), 'no radius text');
    assert.ok(html.includes('class="tac-room-state "'), 'no state class from an inherited key');
    world([mortarAsset({ radius: 7 })], crew);
    html = mod.panel('assets', api);
    assertSafe(html, 'asset');
    assert.ok(html.includes('· r 7'));
    assert.ok(/class="btn-small tac-room-btn big" data-room-action="assetState"/.test(html), 'state buttons are big');
  });

  await t('fire card: game coordinates are number-checked; it shows only while take is offered', () => {
    const r = req({ status: 'accepted', acceptedBy: by(crew) });
    world([r], crew, { calibration: { offset: ['<img onerror=1>', 3] }, mortar: { tile: [20, -98], mode: 'coordinates' } });
    window.TacticalLogic = {
      worldToGame: (o, x, y) => [x + o[0], y + o[1]],
      mortarFireChecks: () => ({ distance: 40, bounds: ['<i>', 1], reasons: ['<i>'], warnings: ['constructor'], ok: true })
    };
    mod.actions['req-take'](el({ 'data-id': 'q1' }), api);
    assert.strictEqual(H.state.taken, 'q1');
    assert.strictEqual(api.ui.tab, 'requests', 'take switches to the requests tab');
    const html = mod.panel('requests', api);
    assert.ok(html.includes('tac-room-fire-coords"> -59</div>'), 'the string coordinate renders nothing');
    assertSafe(html, 'fire card');
    api.ui.client.me = so;
    assert.ok(!mod.panel('requests', api).includes('tac-room-fire'), 'the author never gets the fire card');
    api.ui.client.me = crew;
    r.status = 'done';
    mod.actions.reqShoot(el({ 'data-id': 'q1' }), api);
    assert.strictEqual(api.fired, 0, 'no shot on a request that is no longer accepted');
    mod.tick(api);
    assert.strictEqual(H.state.taken, null);
    r.status = 'accepted';
    H.state.taken = 'q1';
    ctx.mortar = null;
    mod.actions.reqShoot(el({ 'data-id': 'q1' }), api);
    assert.strictEqual(api.fired, 0, 'no shot without a mortar on the Fire panel');
    ctx.mortar = { tile: [20, -98], mode: 'coordinates' };
    mod.actions.reqShoot(el({ 'data-id': 'q1' }), api);
    assert.strictEqual(api.fired, 1);
  });

  await t('off the room planet: take, place, pick, submit and repeat are disabled and refuse with one toast each', () => {
    const toasts = [];
    let picks = 0;
    const submit = () => mod.submits.request({ elements: { coords: { value: '' }, note: { value: 'n' }, urgent: { checked: false } } }, api);
    withApi({ toast: s => toasts.push(s), setPick: () => { picks++; } }, () => {
      const scenarios = [
        ['shell planetOk', () => { api.planetOk = () => false; }],
        ['local fallback', () => { delete api.planetOk; api.ui.client.meta.planet = 'bigred'; }]
      ];
      const hadPlanetOk = Object.prototype.hasOwnProperty.call(api, 'planetOk') ? api.planetOk : null;
      for (const [name, off] of scenarios) {
        world([req({ status: 'accepted', acceptedBy: by(crew) }), req({ id: 'q2', type: 'position', status: 'accepted', acceptedBy: by(crew) }),
          req({ id: 'q3', status: 'done' })], crew);
        off();
        let html = mod.panel('requests', api) + mod.strip(api);
        assert.ok(/<button disabled [^>]*data-room-action="req-take"/.test(html), name + ': take');
        assert.ok(/<button disabled [^>]*data-room-action="req-place"/.test(html), name + ': place');
        api.ui.client.me = so;
        H.state.form = true;
        H.state.target = [5, 6];
        html = mod.panel('requests', api);
        assertSafe(html, name);
        assert.ok(/<button disabled [^>]*data-room-action="reqPick"/.test(html), name + ': pick');
        assert.ok(/<button type="submit" class="[^"]*" disabled>/.test(html), name + ': submit');
        assert.ok(/<button disabled [^>]*data-room-action="req-repeat"/.test(html), name + ': repeat');
        toasts.length = 0;
        picks = 0;
        mod.actions['req-take'](el({ 'data-id': 'q1' }), api);
        mod.actions.reqPick(el({}), api);
        submit();
        mod.actions['req-repeat'](el({ 'data-id': 'q3' }), api);
        assert.strictEqual(H.state.taken, null, name + ': nothing taken');
        assert.strictEqual(picks, 0, name + ': no pick mode');
        assert.strictEqual(queued.length, 0, name + ': nothing queued');
        assert.deepStrictEqual(toasts, [1, 2, 3, 4].map(() => api.T().reqWrongPlanet), name + ': toasts');
        assert.strictEqual(H.state.form, true, name + ': the form stays open');
      }
      if (hadPlanetOk) api.planetOk = hadPlanetOk; else delete api.planetOk;
      world([req({ id: 'q3', status: 'done' })], so);
      H.state.form = true;
      H.state.target = [5, 6];
      const html = mod.panel('requests', api);
      assert.ok(!html.includes(' disabled'), 'on the room planet nothing is disabled');
      toasts.length = 0;
      mod.actions.reqPick(el({}), api);
      submit();
      mod.actions['req-repeat'](el({ 'data-id': 'q3' }), api);
      assert.strictEqual(picks, 1);
      assert.deepStrictEqual(queued.map(o => o.op + ':' + o.kind), ['put:request', 'put:request']);
      assert.deepStrictEqual(toasts, []);
      assert.strictEqual(H.state.form, false, 'a sent form closes');
    });
    H.state.form = false;
    H.state.target = null;
  });

  await t('repeat keeps the original level and map hash, not the page\'s', () => {
    world([req({ status: 'done', level: 2, h: 'h-old', note: 'гнездо', priority: 'urgent', flags: ['beacon'] })], so, { level: 0, meta: { id: 'lv624', h: 'h-page' } });
    mod.actions['req-repeat'](el({ 'data-id': 'q1' }), api);
    assert.strictEqual(queued.length, 1);
    assert.deepStrictEqual(queued[0].data, { type: 'mortar', target: { x: 62, y: -62 }, note: 'гнездо', priority: 'urgent', flags: ['beacon'], level: 2, h: 'h-old' });
    world([req({ status: 'done', level: undefined, h: undefined })], so, { level: 3, meta: { id: 'lv624', h: 'h-page' } });
    mod.actions['req-repeat'](el({ 'data-id': 'q1' }), api);
    assert.strictEqual(queued[0].data.level, 0, 'no level stored: 0, never the page level');
    assert.strictEqual(queued[0].data.h, '', 'no hash stored: empty, never the page hash');
  });

  await t('recalled and withdrawn labels; the reason shows only on a crew denial', () => {
    const P = policy;
    const cases = [
      ['staff author recalls an accepted request', req({ status: 'denied', acceptedBy: by(crew), deniedBy: by(so) }), 'recalled', 'withdrawn by staff'],
      ['another staff officer recalls it', req({ status: 'denied', acceptedBy: by(crew), deniedBy: by(so2) }), 'recalled', 'withdrawn by staff'],
      ['the crew that accepted denies it', req({ status: 'denied', acceptedBy: by(crew), deniedBy: by(crew), reason: 'no ammo' }), 'denied', 'denied'],
      ['the crew denies a fresh request', req({ status: 'denied', deniedBy: by(crew), reason: 'out of range' }), 'denied', 'denied'],
      ['the author withdraws a fresh request', req({ status: 'denied', deniedBy: by(so), reason: 'stale text' }), 'withdrawn', 'withdrawn by the author'],
      ['a crew author withdraws after another crew accepted', req({ by: by(crew), status: 'denied', acceptedBy: by(crew2), deniedBy: by(crew) }), 'withdrawn', 'withdrawn by the author']
    ];
    cases.forEach(([name, r, kind, label]) => {
      assert.strictEqual(H.denial(P, r), kind, name);
      assert.strictEqual(H.recalled(P, r), kind === 'recalled', name);
      world([r], so);
      const html = mod.panel('requests', api);
      assert.ok(html.includes('tac-room-status">' + label + '<'), name + ': ' + html);
      if (r.reason) assert.strictEqual(html.includes(r.reason), kind === 'denied', name + ': reason');
    });
    assert.strictEqual(H.recalled(P, req({ status: 'accepted', acceptedBy: by(crew), deniedBy: by(so) })), false, 'only denied');
    assert.strictEqual(H.recalled(P, req({ status: 'denied', acceptedBy: {}, deniedBy: {} })), false, 'no client on either side');
  });

  await t('strip button per status: the crew gets the next step, the staff officer never withdraw or deny', () => {
    const strip = (status, type, me) => {
      world([req({ status, type, acceptedBy: status === 'requested' ? undefined : by(crew), firedAt: status === 'firing' ? NOW - 1000 : undefined })], me);
      const html = mod.strip(api);
      assertSafe(html, status + '/' + type);
      return [...html.matchAll(/data-room-action="req-([a-z]+)"/g)].map(m => m[1]);
    };
    const statuses = Object.keys(R.REQUEST_FLOW);
    // With the agreed K2 actions (crew = owner and not author does the work; the author only withdraws).
    const real = R.requestActions;
    R.requestActions = function (P, member, r, extra) {
      if (!member || !member.confirmed || !member.client || r.deleted) return [];
      const owner = R.hasRight(P, member, 'acceptRequest', r, extra), author = !!(r.by && r.by.client === member.client), worker = owner && !author;
      const out = [];
      if (r.status === 'requested') { if (worker) out.push('accept', 'deny'); if (author) out.push('cancel'); }
      else if (r.status === 'accepted') {
        if (worker) { if (r.type === 'mortar') out.push('take'); if (r.type === 'position') out.push('place'); out.push('done', 'deny'); }
        if (author) out.push('cancel');
      } else if (r.status === 'loaded') { if (worker) out.push('fire', 'deny'); }
      else if (r.status === 'firing') { if (worker) out.push('done'); }
      else if (author) out.push('repeat');
      return out;
    };
    try {
      const expected = {
        mortar: { requested: ['accept'], accepted: ['take'], loaded: ['fire'], firing: ['done'], done: [], denied: [] },
        position: { requested: ['accept'], accepted: ['place'], loaded: ['fire'], firing: ['done'], done: [], denied: [] }
      };
      for (const type of TYPES_OF(expected)) for (const status of statuses) {
        assert.deepStrictEqual(strip(status, type, crew), expected[type][status], 'crew ' + status + '/' + type);
        assert.deepStrictEqual(strip(status, type, so), [], 'staff officer ' + status + '/' + type);
      }
    } finally { R.requestActions = real; }
    // With the logic on this branch: at most one button, the first action that is not withdraw or deny.
    for (const type of H.TYPES) for (const status of statuses) for (const me of [so, crew]) {
      const got = strip(status, type, me);
      const acts = status === 'done' || status === 'denied' ? []
        : real(policy, me, req({ status, type, acceptedBy: by(crew) }), { claimed: [] }).filter(a => a !== 'cancel' && a !== 'deny');
      assert.deepStrictEqual(got, acts.slice(0, 1), me.post + ' ' + status + '/' + type);
    }
  });

  await t('a Series T shot marks the taken request firing only when it hits that target (±1 tile)', () => {
    const shoot = (extra, roomOffset, shot) => {
      world([req({ status: 'accepted', acceptedBy: by(crew) })], crew, extra);
      if (roomOffset) api.ui.client.calibration = () => ({ offset: roomOffset });
      H.state.taken = 'q1';
      mod.notify('shot', shot, api);
      return { sent: queued.map(o => o.data.status), taken: H.state.taken };
    };
    const page = { calibration: { offset: [100, 200] } };   // 62,-62 is 162,138 in game
    assert.deepStrictEqual(shoot(page, null, { target: [162, 138] }), { sent: ['firing'], taken: null });
    assert.deepStrictEqual(shoot(page, null, { target: [163, 137] }), { sent: ['firing'], taken: null }, 'within a tile');
    assert.deepStrictEqual(shoot(page, null, { target: [164, 138] }), { sent: [], taken: 'q1' }, 'another target leaves it taken');
    assert.deepStrictEqual(shoot(page, null, {}), { sent: [], taken: 'q1' }, 'a shot without a target');
    assert.deepStrictEqual(shoot(null, [10, 10], { target: [72, -52] }), { sent: ['firing'], taken: null }, 'room calibration');
    assert.deepStrictEqual(shoot(page, [10, 10], { target: [161, 139] }), { sent: ['firing'], taken: null }, 'page calibration beside a room one');
    assert.deepStrictEqual(shoot(null, null, { target: [0, 0] }), { sent: ['firing'], taken: null }, 'no calibration known: any shot, as before');
    assert.deepStrictEqual(shoot(null, ['<i>', 3], { target: [0, 0] }), { sent: ['firing'], taken: null }, 'a broken room offset counts as unknown');
    world([req({ status: 'denied', acceptedBy: by(crew), deniedBy: by(so) })], crew, page);
    H.state.taken = 'q1';
    mod.notify('shot', { target: [162, 138] }, api);
    assert.strictEqual(queued.length, 0, 'after a recall the shot sends nothing');
    assert.strictEqual(H.state.taken, null, 'and the taken request is dropped');
  });

  await t('pickMortarRow: the mortar I crew, else the first I may edit', () => {
    const row = (k, claimedBy, type) => ({ id: 'asset-' + (type || 'mortar') + '-' + k, def: { type: type || 'mortar' }, n: k, obj: { claimedBy } });
    const rows = [row(1, null, 'ob'), row(1, 'c-other'), row(2, 'c-crew'), row(3, null)];
    const all = () => true;
    assert.strictEqual(H.pickMortarRow(rows, crew, all).id, 'asset-mortar-2');
    assert.strictEqual(H.pickMortarRow(rows, crew, r => r.id !== 'asset-mortar-2').id, 'asset-mortar-1');
    assert.strictEqual(H.pickMortarRow(rows, so, all).id, 'asset-mortar-1');
    assert.strictEqual(H.pickMortarRow(rows, crew, () => false), null);
    assert.strictEqual(H.pickMortarRow([row(1, undefined), row(2, undefined)], {}, all).id, 'asset-mortar-1', 'no undefined === undefined match');
    assert.strictEqual(H.pickMortarRow([row(1, null, 'ob')], crew, all), null, 'mortars only');
  });

  await t('«Deployed» moves the mortar and tracks only after {ok:true}; a refusal is left to the shell toast', async () => {
    const tracks = [], toasts = [];
    await withApi({ track: g => tracks.push(g), toast: s => toasts.push(s) }, async () => {
      const pos = () => req({ id: 'q2', type: 'position', target: { x: 30, y: -90 }, status: 'accepted', acceptedBy: by(crew) });
      world([pos(), mortarAsset({ id: 'asset-mortar-1' }), crew], crew);
      ackWith = () => ({ ok: true, seq: 9 });
      mod.actions['req-done'](el({ 'data-id': 'q2' }), api);
      assert.strictEqual(queued.length, 1, 'only the status patch at first');
      assert.deepStrictEqual(tracks, [], 'no goal before the ack');
      await tick();
      assert.deepStrictEqual(queued.map(o => o.kind + ':' + JSON.stringify(o.data)), ['request:{"status":"done"}', 'asset:{"tile":[30,-90],"state":"deployed"}']);
      assert.strictEqual(queued[1].id, 'asset-mortar-1');
      assert.deepStrictEqual(tracks, ['room_request_done']);

      tracks.length = 0;
      world([req({ status: 'firing', firedAt: NOW - 1000, acceptedBy: by(crew) })], crew);
      mod.actions['req-done'](el({ 'data-id': 'q1' }), api);
      await tick();
      assert.deepStrictEqual(queued.map(o => o.kind), ['request'], 'a strike done moves no asset');
      assert.deepStrictEqual(tracks, ['room_request_done']);

      for (const [name, ack] of [['refused', () => ({ ok: false, error: 'status', status: 'done' })], ['unknown', () => api.ui.client], ['empty', () => undefined]]) {
        tracks.length = 0;
        toasts.length = 0;
        world([pos(), mortarAsset(), crew], crew);
        ackWith = ack;
        mod.actions['req-done'](el({ 'data-id': 'q2' }), api);
        await tick();
        assert.strictEqual(queued.length, 1, name + ': the asset stays');
        assert.deepStrictEqual(tracks, [], name + ': no goal');
        assert.deepStrictEqual(toasts, [], name + ': no module toast (the shell toasts client.rejected once)');
      }
    });
    ackWith = () => ({ ok: true, seq: 1 });
  });

  await t('digit keys: 1..TYPES.length, no modifiers, not in fields, only while in the room', () => {
    const key = (k, over) => Object.assign({ key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }, over);
    assert.strictEqual(H.TYPES.length, 3);
    assert.strictEqual(H.typeForKey(key('1'), null, 'in'), 'mortar');
    assert.strictEqual(H.typeForKey(key('2'), { tagName: 'BUTTON' }, 'in'), 'position');
    assert.strictEqual(H.typeForKey(key('3'), null, 'in'), 'task');
    ['0', '4', '6', '9', '12', 'a', 'Enter', undefined].forEach(k => assert.strictEqual(H.typeForKey(key(k), null, 'in'), null, String(k)));
    ['ctrlKey', 'altKey', 'metaKey', 'shiftKey'].forEach(m => assert.strictEqual(H.typeForKey(key('1', { [m]: true }), null, 'in'), null, m));
    ['INPUT', 'SELECT', 'TEXTAREA'].forEach(tag => assert.strictEqual(H.typeForKey(key('1'), { tagName: tag }, 'in'), null, tag));
    assert.strictEqual(H.typeForKey(key('1'), { tagName: 'DIV', isContentEditable: true }, 'in'), null, 'contentEditable');
    ['knocking', 'observer', 'closed', 'idle'].forEach(s => assert.strictEqual(H.typeForKey(key('1'), null, s), null, s));
  });

  await t('44 px targets: withdraw and repeat are big', () => {
    ['take', 'place', 'accept', 'fire', 'load', 'done', 'deny', 'cancel', 'repeat'].forEach(a => assert.ok(H.BIG_ACTIONS.indexOf(a) >= 0, a));
    world([req(), req({ id: 'q3', status: 'done' })], so);
    const html = mod.panel('requests', api);
    assert.ok(/class="btn-small tac-room-btn big" data-room-action="req-cancel"/.test(html), 'withdraw');
    assert.ok(/class="btn-small tac-room-btn big" data-room-action="req-repeat"/.test(html), 'repeat');
  });

  await t('the sound is for requests aimed at an asset I own or crew', () => {
    const objects = { 'asset-mortar-1': mortarAsset({ claimedBy: 'c-so2' }) };
    const r = req();
    assert.strictEqual(H.aimedAtMine(policy, objects, crew, r), true, 'mortar post owns the mortar');
    assert.strictEqual(H.aimedAtMine(policy, objects, so, r), false, 'staff hears nothing for the crew');
    assert.strictEqual(H.aimedAtMine(policy, objects, so2, r), true, 'a claimed crew seat');
    assert.strictEqual(H.aimedAtMine(policy, objects, crew, req({ type: 'constructor' })), false);
  });

  await t('every op the module sends fits the patch whitelists', async () => {
    const REQ = ['status', 'reason', 'note', 'priority', 'flags', 'relayed'];
    const ASSET = ['tile', 'state', 'claimedBy', 'shell', 'radius', 'notes', 'label'];
    world([req({ status: 'requested' }), req({ id: 'q2', type: 'position', status: 'accepted', acceptedBy: by(crew), target: { x: 30, y: -90 } }), mortarAsset(), crew], crew);
    const E = id => el({ 'data-id': id });
    mod.actions['req-accept'](E('q1'), api);
    mod.actions.reqDenyReason(el({ 'data-id': 'q1', 'data-reason': 'no ammo' }), api);
    mod.actions.reqDenyReason(el({ 'data-id': 'q1', 'data-reason': '<forged>' }), api);
    mod.actions['req-cancel'](E('q1'), api);
    mod.actions['req-load'](E('q1'), api);
    mod.actions['req-fire'](E('q1'), api);
    mod.actions['req-done'](E('q2'), api);
    await tick();
    mod.actions.assetState(el({ 'data-id': 'asset-mortar-1', 'data-state': 'moving' }), api);
    mod.actions.assetState(el({ 'data-id': 'asset-mortar-1', 'data-state': 'onLz' }), api);
    mod.actions.assetClaim(el({ 'data-id': 'asset-mortar-1' }), api);
    mod.actions.assetClaim(el({ 'data-id': 'asset-mortar-1', 'data-release': '1' }), api);
    mod.changes.assetShell({ value: 'he', getAttribute: () => 'asset-mortar-1' }, api);
    mod.changes.assetShell({ value: '', getAttribute: () => 'asset-mortar-1' }, api);
    H.state.taken = 'q2';
    mod.notify('shot', { target: [0, 0] }, api);
    const patches = queued.filter(o => o.op === 'patch');
    assert.strictEqual(patches.length, 13, JSON.stringify(queued));
    patches.forEach(o => {
      const allowed = o.kind === 'request' ? REQ : ASSET;
      Object.keys(o.data).forEach(k => assert.ok(allowed.indexOf(k) >= 0, o.kind + ' patch carries ' + k));
      if (o.kind === 'request') assert.ok(typeof o.expectedStatus === 'string', 'request patches carry expectedStatus');
      if (o.data.state !== undefined) assert.ok(o.data.state === null || /^[a-z_]{1,20}$/.test(o.data.state), o.data.state);
      if (o.data.tile !== undefined) assert.ok(o.data.tile === null || o.data.tile.every(Number.isInteger));
      if (o.data.radius !== undefined) assert.ok(o.data.radius === null || (o.data.radius > 0 && o.data.radius <= 100));
    });
    assert.deepStrictEqual(patches.filter(o => o.kind === 'request').map(o => JSON.stringify(o.data)), [
      '{"status":"accepted"}', '{"status":"denied","reason":"no ammo"}', '{"status":"denied"}', '{"status":"loaded"}',
      '{"status":"firing"}', '{"status":"done"}', '{"status":"firing"}'
    ]);
  });

  await t('ping: the crew hears a new request on their mortar at once; the author, a second staff officer, an observer and a knocking member do not', () => withClock(() => {
    const observer = { id: 'mem-obs', kind: 'member', client: 'c-obs', post: 'observer', confirmed: true };
    const knocking = Object.assign({}, crew2, { confirmed: false });
    const who = me => {
      const w = pingWorld([req(), mortarAsset(), so, crew], me);
      tickAt(0);
      return { patterns: patterns(w.ac), pinging: H.state.pinging.slice() };
    };
    assert.deepStrictEqual(who(crew), { patterns: ['normal'], pinging: ['q1'] }, 'crew');
    [['author', so], ['second staff officer', so2], ['observer', observer], ['knocking', knocking]].forEach(([name, me]) =>
      assert.deepStrictEqual(who(me), { patterns: [], pinging: [] }, name));
    const objects = { 'asset-mortar-1': mortarAsset() };
    assert.deepStrictEqual(H.pingTargets(policy, crew, [req()], objects, []).map(r => r.id), ['q1']);
    [so, so2, observer, knocking, null].forEach(me => assert.deepStrictEqual(H.pingTargets(policy, me, [req()], objects, []), [], String(me && me.id)));
    assert.deepStrictEqual(H.pingTargets(policy, so2, [req()], { 'asset-mortar-1': mortarAsset({ claimedBy: 'c-so2' }) }, []).map(r => r.id), ['q1'],
      'a staff officer in the crew seat is the crew');
    assert.deepStrictEqual(H.pingTargets(policy, crew, [req({ type: 'position', by: by(crew) })], objects, []), [], 'the crew\'s own request: no accept, no ping');
    const w = pingWorld([req(), mortarAsset()], crew);
    api.ui.client.status = 'observer';
    tickAt(0);
    assert.deepStrictEqual(patterns(w.ac), [], 'an observer session');
  }));

  await t('ping: the pinging request pulses on its strip card, panel card and the Requests chip, with «Heard» on both cards', () => withClock(() => {
    pingWorld([req(), req({ id: 'q2', status: 'accepted', acceptedBy: by(crew) }), mortarAsset()], crew);
    tickAt(0);
    const strip = mod.strip(api), panel = mod.panel('requests', api), chips = mod.chips(api);
    [['strip', strip], ['panel', panel], ['chips', chips]].forEach(([name, html]) => assertSafe(html, name));
    assert.ok(/class="tac-room-card pinging" data-room-action="reqFocus" data-id="q1"/.test(strip), strip);
    assert.ok(/class="tac-room-card" data-room-action="reqFocus" data-id="q2"/.test(strip), 'the accepted one does not pulse');
    assert.strictEqual((strip.match(/data-room-action="reqHeard" data-id="q1"/g) || []).length, 1);
    assert.ok(!strip.includes('data-room-action="reqHeard" data-id="q2"'));
    assert.ok(/class="tac-room-req st-requested pinging"/.test(panel), panel);
    assert.ok(/class="btn-small tac-room-btn big heard" data-room-action="reqHeard" data-id="q1"/.test(panel));
    assert.strictEqual((panel.match(/data-room-action="reqHeard"/g) || []).length, 1);
    assert.ok(/class="tac-room-chip busy pinging" data-room-action="tab"/.test(chips), chips);
    api.ui.client.me = so;
    const staff = mod.strip(api) + mod.panel('requests', api) + mod.chips(api);
    assert.ok(!staff.includes('pinging') && !staff.includes('reqHeard'), 'the staff officer sees no pulse');
    api.ui.client.me = crew;
    api.ui.client.status = 'closed';
    const closed = mod.strip(api) + mod.chips(api);
    assert.ok(!closed.includes('pinging') && !closed.includes('reqHeard'), 'a closed room pulses for nobody');
  }));

  await t('ping: every 10 s (normal) and 5 s (urgent) on one shared schedule; urgent wins; a new request plays at once', () => withClock(() => {
    const run = (objects, seconds) => {
      const w = pingWorld(objects.concat([mortarAsset()]), crew);
      const at = [];
      for (let s = 0; s <= seconds; s++) { const before = w.ac.groups.length; tickAt(s * 1000); if (w.ac.groups.length > before) at.push(s); }
      return { at, patterns: patterns(w.ac) };
    };
    assert.deepStrictEqual(run([req()], 25).at, [0, 10, 20], 'normal');
    assert.strictEqual(audioMade.n, 1, 'one AudioContext for every ping');
    assert.deepStrictEqual(run([req({ priority: 'urgent' })], 12).at, [0, 5, 10], 'urgent');
    assert.deepStrictEqual(run([req(), req({ id: 'q2' })], 20).at, [0, 10, 20], 'two pending: one ping per interval');
    const mixed = run([req(), req({ id: 'q2', priority: 'urgent' })], 10);
    assert.deepStrictEqual(mixed.at, [0, 5, 10], 'the urgent interval');
    assert.deepStrictEqual(mixed.patterns, ['urgent', 'urgent', 'urgent'], 'the urgent pattern');
    const w = pingWorld([req(), mortarAsset()], crew);
    tickAt(0);
    tickAt(3000);
    w.all.q2 = req({ id: 'q2' });
    tickAt(4000);
    assert.strictEqual(w.ac.groups.length, 2, 'a request arriving mid-interval plays at once');
    tickAt(10000);
    assert.strictEqual(w.ac.groups.length, 2, 'and restarts the shared interval');
    tickAt(14000);
    assert.strictEqual(w.ac.groups.length, 3);
  }));

  await t('pingDue: first at once, a fresh request after the gap, the interval otherwise; a clock that went back plays', () => {
    const N = [req()], U = [req({ priority: 'urgent' })];
    assert.strictEqual(H.pingDue({ lastAt: null, seen: [] }, 0, []), null);
    assert.deepStrictEqual(H.pingDue({ lastAt: null, seen: [] }, 0, N), { ping: true, pattern: 'normal', interval: 10000 });
    assert.deepStrictEqual(H.pingDue(null, 0, U), { ping: true, pattern: 'urgent', interval: 5000 });
    const seen = { lastAt: 100000, seen: ['q1'] };
    assert.strictEqual(H.pingDue(seen, 109999, N).ping, false);
    assert.strictEqual(H.pingDue(seen, 110000, N).ping, true);
    assert.strictEqual(H.pingDue(seen, 104999, U).ping, false);
    assert.strictEqual(H.pingDue(seen, 105000, U).ping, true);
    const fresh = [req(), req({ id: 'q2' })];
    assert.strictEqual(H.pingDue(seen, 100999, fresh).ping, false, 'never inside the gap');
    assert.strictEqual(H.pingDue(seen, 101000, fresh).ping, true, 'a fresh request after the gap');
    assert.strictEqual(H.pingDue(seen, 99000, N).ping, true, 'the clock went back');
  });

  await t('ping: stops once accepted, denied, withdrawn, deleted or with the sound off; each target guard stands on its own', () => withClock(() => {
    const cases = [
      ['accepted', r => { r.status = 'accepted'; r.acceptedBy = by(crew); }],
      ['denied by the crew', r => { r.status = 'denied'; r.deniedBy = by(crew); r.reason = 'no ammo'; }],
      ['withdrawn by the author', r => { r.status = 'denied'; r.deniedBy = by(so); }],
      ['deleted', r => { r.deleted = true; }],
      ['sound off', (r, w) => { w.store[PREFS] = { sounds: false }; }]
    ];
    cases.forEach(([name, change]) => {
      const w = pingWorld([req(), mortarAsset()], crew);
      tickAt(0);
      assert.strictEqual(w.ac.groups.length, 1, name + ': first ping');
      assert.strictEqual(document.title, '● ' + ORIG_TITLE, name + ': badge');
      change(w.all.q1, w);
      for (let s = 1; s <= 30; s++) tickAt(s * 1000);
      assert.strictEqual(w.ac.groups.length, 1, name + ': silent after');
      assert.deepStrictEqual(H.state.pinging, [], name + ': nothing pinging');
      assert.strictEqual(document.title, ORIG_TITLE, name + ': title back');
    });
    const back = pingWorld([req(), mortarAsset()], crew);
    tickAt(0);
    back.store[PREFS] = { sounds: false };
    tickAt(1000);
    back.store[PREFS] = { sounds: true };
    tickAt(5000);
    assert.strictEqual(back.ac.groups.length, 2, 'the sound back on plays at once, not at the next interval');
    const w = pingWorld([req(), mortarAsset()], crew);
    tickAt(0);
    mod.changes.reqSounds({ checked: false }, api);
    assert.deepStrictEqual(w.store[PREFS], { sounds: false });
    assert.strictEqual(document.title, ORIG_TITLE, 'the sound switch clears the badge at once');
    const real = R.requestActions;
    R.requestActions = () => ['accept'];
    try {
      const objects = { 'asset-mortar-1': mortarAsset() };
      const ids = (list, heard) => H.pingTargets(policy, crew, list, objects, heard || []).map(r => r.id);
      assert.deepStrictEqual(ids([req({ status: 'accepted' })]), [], 'status');
      assert.deepStrictEqual(ids([req({ deleted: true })]), [], 'deleted');
      assert.deepStrictEqual(ids([req({ target: { x: 'a', y: 1 } })]), [], 'invalid');
      assert.deepStrictEqual(ids([req({ type: 'ob' })]), [], 'not aimed at my asset');
      assert.deepStrictEqual(ids([req(), req({ id: 'q2' })], ['q1']), ['q2'], 'heard');
    } finally { R.requestActions = real; }
  }));

  await t('ping: no sound, badge or pulse while the room is frozen (silence, stopped, budget), locked or closed; at once when that ends', () => withClock(() => {
    const freezes = [
      ['radio silence', m => { m.frozen = { at: T0, reason: 'silence', by: 'so' }; }],
      ['stopped', m => { m.frozen = { at: T0, reason: 'stopped' }; }],
      ['budget', m => { m.frozen = { at: T0, reason: 'budget' }; }],
      ['locked', m => { m.locked = true; }],
      ['closed', m => { m.closed = true; }]
    ];
    const quiet = name => {
      assert.deepStrictEqual(H.state.pinging, [], name + ': nothing pinging');
      assert.strictEqual(document.title, ORIG_TITLE, name + ': no badge');
      const html = mod.strip(api) + mod.panel('requests', api) + mod.chips(api);
      assert.ok(!html.includes('pinging') && !html.includes('reqHeard'), name + ': no pulse, no «Heard»');
    };
    freezes.forEach(([name, freeze]) => {
      const w = pingWorld([req(), mortarAsset()], crew);
      const thaw = () => { api.ui.client.meta = { planet: 'lv624' }; };
      tickAt(0);
      assert.strictEqual(w.ac.groups.length, 1, name + ': the first ping');
      freeze(api.ui.client.meta);
      for (let s = 1; s <= 25; s++) tickAt(s * 1000);
      assert.strictEqual(w.ac.groups.length, 1, name + ': silent through two intervals');
      quiet(name);
      thaw();
      tickAt(26000);
      assert.strictEqual(w.ac.groups.length, 2, name + ': a ping when it ends');
      assert.strictEqual(document.title, '● ' + ORIG_TITLE, name + ': the badge is back');
      assert.ok(mod.strip(api).includes('tac-room-card pinging'), name + ': the pulse is back');
      freeze(api.ui.client.meta);
      tickAt(27000);
      tickAt(28000);
      thaw();
      tickAt(29000);
      assert.strictEqual(w.ac.groups.length, 3, name + ': at once, 3 s after the last ping, not at the next interval');
    });
    const cold = pingWorld([req(), mortarAsset()], crew);
    api.ui.client.meta.frozen = { at: T0, reason: 'silence' };
    tickAt(0);
    assert.strictEqual(cold.ac.groups.length, 0, 'a request that arrives during silence stays quiet');
    quiet('during silence');
    delete api.ui.client.meta.frozen;
    tickAt(1000);
    assert.deepStrictEqual([cold.ac.groups.length, document.title], [1, '● ' + ORIG_TITLE], 'and pings the moment silence ends');
  }));

  await t('«Heard» silences only that request, only in this browser, per room code and client; a new request pings again', () => withClock(() => {
    const w = pingWorld([req(), req({ id: 'q2' }), mortarAsset()], crew);
    tickAt(0);
    assert.strictEqual(w.ac.groups.length, 1);
    clock = T0 + 10000;
    mod.actions.reqHeard(el({ 'data-id': 'q1' }), api);
    assert.strictEqual(w.ac.groups.length, 1, 'the click itself plays nothing, even when a ping is due');
    assert.deepStrictEqual(H.state.pinging, ['q2']);
    assert.strictEqual(queued.length, 0, 'nothing sent to the room');
    assert.deepStrictEqual(JSON.parse(session[HEARD + 'c-crew']), ['q1']);
    const strip = mod.strip(api);
    assert.ok(!strip.includes('data-room-action="reqHeard" data-id="q1"') && strip.includes('data-room-action="reqHeard" data-id="q2"'), strip);
    tickAt(10000);
    assert.strictEqual(w.ac.groups.length, 2, 'the other request still pings');
    mod.actions.reqHeard(el({ 'data-id': 'q2' }), api);
    assert.strictEqual(document.title, ORIG_TITLE, 'all heard: the badge goes');
    tickAt(20000);
    assert.strictEqual(w.ac.groups.length, 2, 'all heard: silence');
    mod.actions.reqHeard(el({ 'data-id': 'q9' }), api);
    assert.deepStrictEqual(JSON.parse(session[HEARD + 'c-crew']), ['q1', 'q2'], 'an id that does not ping is not stored');
    w.all.q3 = req({ id: 'q3' });
    tickAt(21000);
    assert.strictEqual(w.ac.groups.length, 3, 'a new request pings again');
    H.state.heard = { key: null, ids: [] };
    H.state.heardMem = {};
    tickAt(22000);
    assert.deepStrictEqual(H.state.pinging, ['q3'], 'a reload of the tab reads the heard ids back');
    api.ui.client.code = 'Z9Z9Z9';
    tickAt(23000);
    assert.deepStrictEqual(H.state.pinging, ['q1', 'q2', 'q3'], 'another room code has its own list');
    delete window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new Error('blocked'); } });
    mod.actions.reqHeard(el({ 'data-id': 'q3' }), api);
    H.state.heard = { key: null, ids: [] };
    tickAt(24000);
    assert.deepStrictEqual(H.state.pinging, ['q1', 'q2'], 'storage off: memory keeps it');
    delete window.sessionStorage;
  }));

  await t('pattern: two rising tones, or an urgent triple played twice, inside 1.2–2 kHz; the volume step sets the peak gain', () => withClock(() => {
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const band = ac => ac.groups.forEach(g => g.oscillators.forEach(o => assert.ok(o.frequency.value >= 1200 && o.frequency.value <= 2000, 'band ' + o.frequency.value)));
    const ac = fakeAudio();
    H.playPattern(ac, 'normal', 'quiet');
    const g = ac.groups[0];
    assert.strictEqual(ac.groups.length, 1);
    assert.strictEqual(g.type, 'lowpass');
    assert.deepStrictEqual(pitches(g), [1320, 1760]);
    assert.deepStrictEqual(g.oscillators.map(o => o.type), ['triangle', 'square', 'triangle', 'square']);
    band(ac);
    g.oscillators.forEach(o => assert.ok(near(o.stopAt - o.startAt, 0.09), 'a 90 ms tone'));
    const tri = g.oscillators.filter(o => o.type === 'triangle');
    assert.ok(near(tri[0].startAt, 10.02));
    assert.ok(near(tri[1].startAt - tri[0].stopAt, 0.04), 'a 40 ms gap');
    const env = ac.gains.filter(x => x.gain.events.length);
    assert.strictEqual(env.length, 2);
    assert.deepStrictEqual(env[0].gain.events.map(e => e[0]), ['set', 'lin', 'exp']);
    assert.ok(near(env[0].gain.events[1][2] - tri[0].startAt, 0.005), '5 ms attack');
    assert.ok(near(env[0].gain.events[2][2] - env[0].gain.events[1][2], 0.08), '80 ms decay');
    const peak = v => { const a = fakeAudio(); H.playPattern(a, 'normal', v); return peakOf(a); };
    assert.deepStrictEqual(['quiet', 'normal', 'loud', 'constructor', undefined].map(peak), [0.15, 0.3, 0.55, 0.55, 0.55]);
    const u = fakeAudio();
    H.playPattern(u, 'urgent', 'loud');
    assert.deepStrictEqual(pitches(u.groups[0]), [1320, 1568, 1976, 1320, 1568, 1976]);
    band(u);
    const ut = u.groups[0].oscillators.filter(o => o.type === 'triangle');
    assert.ok(ut[3].startAt - ut[2].stopAt > 0.1, 'a pause between the two rises');
    assert.ok(ut[5].stopAt - 10 < 1, 'the whole pattern ends inside the 1 s gap');
    const quiet = pingWorld([req(), mortarAsset()], crew, { prefs: { volume: 'quiet' } });
    tickAt(0);
    assert.strictEqual(peakOf(quiet.ac), 0.15, 'the stored volume');
    const loud = pingWorld([req(), mortarAsset()], crew);
    tickAt(0);
    assert.strictEqual(peakOf(loud.ac), 0.55, 'loud by default');
  }));

  await t('volume: «quiet / normal / loud» on the asset board, loud by default; a pick is stored and previewed', () => withClock(async () => {
    const sus = pingWorld([mortarAsset()], crew, { audio: 'suspended' });
    mod.actions.reqVolume(el({ 'data-volume': 'normal' }), api);
    assert.strictEqual(sus.ac.groups.length, 0, 'a suspended context: nothing scheduled before the resume');
    await tick();
    assert.strictEqual(sus.ac.groups.length, 1, 'the preview plays once resumed');
    const busy = pingWorld([req(), mortarAsset()], crew);
    tickAt(0);
    clock = T0 + 9500;
    mod.actions.reqVolume(el({ 'data-volume': 'loud' }), api);
    tickAt(10000);
    assert.strictEqual(busy.ac.groups.length, 2, 'the preview counts as a ping: none right after it');
    const w = pingWorld([mortarAsset()], crew);
    let html = mod.panel('assets', api);
    assertSafe(html, 'asset board with volume');
    const steps = html => [...html.matchAll(/class="btn-small tac-room-btn( on)?" data-room-action="reqVolume" data-volume="([a-z]+)"/g)].map(m => m[2] + (m[1] ? '*' : ''));
    assert.deepStrictEqual(steps(html), ['quiet', 'normal', 'loud*']);
    mod.actions.reqVolume(el({ 'data-volume': 'quiet' }), api);
    assert.deepStrictEqual(w.store[PREFS], { volume: 'quiet' });
    assert.strictEqual(peakOf(w.ac), 0.15, 'the preview plays at the new level');
    mod.actions.reqVolume(el({ 'data-volume': 'constructor' }), api);
    assert.strictEqual(w.store[PREFS].volume, 'quiet');
    assert.strictEqual(w.ac.groups.length, 1, 'no preview for a forged step');
    assert.deepStrictEqual(steps(mod.panel('assets', api)), ['quiet*', 'normal', 'loud']);
    const ru = load('ru').api.T();
    assert.deepStrictEqual([ru.pingHeard, ru.pingBlocked, ru.pingVolume, ru.pingVolumes],
      ['Услышал', 'Звук заблокирован браузером — нажмите в панели', 'Громкость', { quiet: 'тихо', normal: 'обычно', loud: 'громко' }]);
  }));

  await t('a suspended context shows the notice in the panel and strip; a click in the room UI resumes it, hides it and plays what pends', () => withClock(async () => {
    const w = pingWorld([req(), mortarAsset()], crew, { audio: 'suspended' });
    w.ac.allow = false;
    tickAt(0);
    await tick();
    assert.strictEqual(w.ac.groups.length, 0, 'nothing scheduled on a suspended context');
    assert.strictEqual(H.state.blocked, true);
    const notice = /data-room-action="reqUnlock">Sound is blocked by the browser — click the panel</;
    assert.ok(notice.test(mod.strip(api)), 'strip');
    assert.ok(notice.test(mod.tools(api)), 'the panel tools row');
    assertSafe(mod.strip(api) + mod.tools(api), 'notice');
    const boxes = {};
    ['tacRoom', 'tacRoomStrip', 'tacRoomChips', 'tacRoomShelf', 'tacRoomEntry'].forEach(id => {
      boxes[id] = { on: {}, addEventListener(type, fn) { (this.on[type] = this.on[type] || []).push(fn); } };
    });
    document.getElementById = id => boxes[id] || null;
    mod.mount(api);
    Object.keys(boxes).forEach(id => assert.ok(boxes[id].on.click && boxes[id].on.keydown, id));
    const fire = (id, type) => boxes[id].on[type].forEach(fn => fn({}));
    fire('tacRoom', 'keydown');
    await tick();
    assert.strictEqual(w.ac.resumes, 2, 'a key asks for a resume too');
    assert.strictEqual(H.state.blocked, true, 'still refused: the notice stays');
    w.ac.allow = true;
    clock = T0 + 9500;
    fire('tacRoomStrip', 'click');
    await tick();
    assert.strictEqual(w.ac.state, 'running');
    assert.strictEqual(H.state.blocked, false);
    assert.ok(!mod.strip(api).includes('reqUnlock') && !mod.tools(api).includes('reqUnlock'), 'the notice is gone');
    assert.deepStrictEqual(patterns(w.ac), ['normal'], 'the pending ping plays once resumed');
    tickAt(10000);
    assert.strictEqual(w.ac.groups.length, 1, 'and the schedule counts it: no second ping half a second later');
    const resumes = w.ac.resumes;
    fire('tacRoomStrip', 'click');
    assert.strictEqual(w.ac.resumes, resumes, 'a running context is left alone');
    const late = pingWorld([req(), mortarAsset()], crew, { audio: 'suspended' });
    late.ac.hold = true;
    tickAt(0);
    fire('tacRoom', 'click');
    late.ac.state = 'running';
    late.ac.held.forEach(res => res());
    await tick();
    assert.deepStrictEqual(patterns(late.ac), ['normal'], 'two resumes answering together play one ping');
    const gone = pingWorld([req(), mortarAsset()], crew, { audio: 'suspended' });
    gone.ac.allow = false;
    tickAt(0);
    gone.all.q1.status = 'accepted';
    gone.all.q1.acceptedBy = by(crew);
    tickAt(1000);
    gone.ac.state = 'running';
    gone.all.q2 = req({ id: 'q2' });
    tickAt(2000);
    assert.strictEqual(gone.ac.groups.length, 1, 'a running context plays');
    assert.ok(!mod.strip(api).includes('reqUnlock'), 'no stale notice once nothing was left pinging');
    const again = pingWorld([req(), mortarAsset()], crew, { audio: 'suspended' });
    again.ac.allow = false;
    tickAt(0);
    again.ac.allow = true;
    mod.actions.reqUnlock(el({}), api);
    await tick();
    assert.strictEqual(H.state.blocked, false, 'the notice button itself resumes');
    const out = pingWorld([req(), mortarAsset()], crew);
    api.ui.client.status = 'knocking';
    fire('tacRoom', 'click');
    assert.strictEqual(audioMade.n, 0, 'no audio outside the room');
    api.ui.client.status = 'in';
    out.store[PREFS] = { sounds: false };
    fire('tacRoom', 'click');
    assert.strictEqual(audioMade.n, 0, 'no audio with the sound off');
  }));

  await t('title badge: added once while something pings, the exact title back when handled, on leaving or unmount; the page\'s own title wins', () => withClock(() => {
    assert.strictEqual(H.titleWithBadge('x', true), '● x');
    assert.strictEqual(H.titleWithBadge('● ● x', true), '● x');
    assert.strictEqual(H.titleWithBadge('● x', false), 'x');
    const w = pingWorld([req(), mortarAsset()], crew);
    tickAt(0);
    tickAt(1000);
    tickAt(2000);
    assert.strictEqual(document.title, '● ' + ORIG_TITLE);
    assert.strictEqual(titleDoc.writes, 1, 'written once, never stacked');
    w.all.q1.status = 'accepted';
    w.all.q1.acceptedBy = by(crew);
    tickAt(3000);
    assert.strictEqual(document.title, ORIG_TITLE);
    tickAt(4000);
    assert.strictEqual(titleDoc.writes, 2, 'nothing pinging: the title is left alone');
    const RU = 'Тактическая карта — NanoTrasen ChemDB';
    w.all.q2 = req({ id: 'q2' });
    tickAt(5000);
    titleDoc.value = RU;
    tickAt(6000);
    assert.strictEqual(document.title, '● ' + RU, 'the page renamed itself: its title is the base');
    api.ui.client.status = 'idle';
    tickAt(7000);
    assert.strictEqual(document.title, RU, 'left the room');
    api.ui.client.status = 'in';
    tickAt(8000);
    assert.strictEqual(document.title, '● ' + RU);
    mod.unmount(api);
    assert.strictEqual(document.title, RU, 'unmount');
    assert.deepStrictEqual(H.state.pinging, []);
    const badged = pingWorld([req(), mortarAsset()], crew);
    titleDoc.value = '● Live';
    tickAt(0);
    assert.strictEqual(document.title, '● Live');
    badged.all.q1.status = 'accepted';
    badged.all.q1.acceptedBy = by(crew);
    tickAt(1000);
    assert.strictEqual(document.title, '● Live', 'an original that starts with the badge comes back exactly');
    assert.strictEqual(titleDoc.writes, 0);
  }));

  await t('a task without a point: valid, «no point» on the card, no take, place or ring, and nothing that reads a target throws', async () => {
    assert.strictEqual(H.validReq(task()), true);
    assert.strictEqual(H.validReq(task({ target: null })), true);
    assert.strictEqual(H.validReq(Object.assign(req(), { target: undefined })), false, 'a strike still needs its point');
    assert.strictEqual(H.validReq(task({ target: { x: '<i>', y: 1 } })), false, 'a point that is there must be finite');
    assert.strictEqual(H.hasTarget(task()), false);
    assert.strictEqual(H.shotMatches(task(), [[1, 1]], { target: [1, 1] }), false);
    const flows = { requested: {}, accepted: { acceptedBy: by(crew) }, done: { acceptedBy: by(crew) }, denied: { deniedBy: by(crew), reason: 'busy' } };
    for (const status of Object.keys(flows)) for (const me of [so, crew, so2]) {
      const r = task(Object.assign({ status }, flows[status]));
      const name = status + ' / ' + me.client;
      world([r, so, crew, so2], me);
      const panel = mod.panel('requests', api), html = panel + mod.strip(api) + mod.chips(api) + mod.tools(api);
      assertSafe(html, name);
      assert.ok(panel.includes('<span class="tac-room-nopoint">no point</span>'), name + ': no point');
      assert.ok(!/data-room-action="req-(take|place|fire|load)"/.test(html), name + ': no take, place, fire or load');
      const acts = [...panel.matchAll(/data-room-action="req-([a-z]+)"/g)].map(m => m[1]);
      assert.deepStrictEqual(acts, R.requestActions(policy, me, r, { claimed: [] }), name + ': the card offers what requestActions does');
      const c = canvas();
      assert.doesNotThrow(() => mod.draw(c, view, api), name + ': draw');
      assert.strictEqual(c.of('arc').length + c.of('rect').length, 0, name + ': no ring');
      let centred = 0;
      api.ui.hooks.view.centerOn = () => { centred++; };
      ['req-take', 'req-place', 'reqShoot', 'reqFocus', 'req-done', 'req-repeat', 'req-accept', 'req-cancel'].forEach(a =>
        assert.doesNotThrow(() => mod.actions[a](el({ 'data-id': 't1' }), api), name + ': ' + a));
      await tick();
      assert.strictEqual(centred, 0, name + ': focus does not centre on a missing point');
      assert.strictEqual(H.state.taken, null, name + ': nothing taken');
      H.state.taken = 't1';
      assert.doesNotThrow(() => mod.notify('shot', { target: [1, 1] }, api), name + ': shot');
      assert.ok(!queued.some(o => o.data && o.data.status === 'firing'), name + ': a shot never fires a task');
      assert.doesNotThrow(() => mod.tick(api), name + ': tick');
    }
    world([task({ status: 'done', acceptedBy: by(crew), to: { client: 'c-crew', post: 'so' } })], so);
    mod.actions['req-repeat'](el({ 'data-id': 't1' }), api);
    assert.deepStrictEqual(queued.map(o => o.data), [{ type: 'task', note: 'hold the north gate', priority: 'normal', flags: [], level: 0, h: 'h1', to: { client: 'c-crew' } }],
      'a repeat keeps no point and the addressee, rebuilt from its own keys');
    assert.strictEqual(R.validateData(policy, 'request', queued[0].data), null, 'the contract takes the repeat');
    const ru = load('ru').api.T();
    assert.deepStrictEqual([ru.types.task, ru.reqNoPoint, ru.taskText, ru.reqTo, ru.reqToAll, ru.posShare, ru.posFromFire, ru.posClear, ru.zoneToggle],
      ['Задача', 'без точки', 'Текст задачи', 'Кому', 'Всем по типу', 'Передать позицию', 'Позиция из панели огня', 'Убрать позицию', 'Зона миномётов']);
  });

  await t('«To»: a strike offers everyone, the mortar post and its members; a task swaps everyone for a pick and offers every answering post and member but me', () => {
    const observer = { id: 'mem-obs', kind: 'member', client: 'c-obs', post: 'observer', confirmed: true };
    const knocking = { id: 'mem-k', kind: 'member', client: 'c-k', post: 'mortar', confirmed: false };
    const evil = '<img src=x onerror=1>';
    world([so, so2, Object.assign({}, crew, { callsign: 'Бекас' }), Object.assign({}, crew2, { callsign: evil }), observer, knocking], so);
    const opts = type => H.toOptions(api, type).map(o => [o.value, o.label, o.to]);
    assert.deepStrictEqual(opts('mortar'), [
      ['', 'Everyone by type', null], ['post:mortar', 'Mortar crew', { post: 'mortar' }],
      ['client:c-crew', 'Бекас · Mortar crew', { client: 'c-crew' }], ['client:c-crew2', evil + ' · Mortar crew', { client: 'c-crew2' }]]);
    assert.deepStrictEqual(opts('task'), [
      ['', '— pick —', null], ['post:so', 'Staff Officer', { post: 'so' }], ['post:mortar', 'Mortar crew', { post: 'mortar' }],
      ['client:c-so2', 'Staff Officer', { client: 'c-so2' }], ['client:c-crew', 'Бекас · Mortar crew', { client: 'c-crew' }],
      ['client:c-crew2', evil + ' · Mortar crew', { client: 'c-crew2' }]]);
    assert.deepStrictEqual(opts('position').map(o => o[0]), opts('task').map(o => o[0]), 'a position request may go to any post');
    assert.strictEqual(opts('position')[0][1], 'Everyone by type');
    const base = { note: 'go', priority: 'normal', flags: [], level: 0, h: '' };
    ['mortar', 'position', 'task'].forEach(type => H.toOptions(api, type).filter(o => o.to).forEach(o => {
      const data = Object.assign({ type, to: o.to }, base, type === 'task' ? {} : { target: { x: 1, y: 1 } });
      assert.strictEqual(R.validateData(policy, 'request', data), null, type + ' ' + o.value);
    }));
    api.ui.policy = squadPolicy;
    assert.deepStrictEqual(opts('task').slice(0, 5), [
      ['', '— pick —', null], ['post:so', 'Staff Officer', { post: 'so' }], ['post:mortar', 'Mortar crew', { post: 'mortar' }],
      ['post:sl', 'Squad Leader', { post: 'sl' }], ['squad:sl:alpha', 'Squad Leader · Alpha', { post: 'sl', squad: 'alpha' }]]);
    assert.strictEqual(R.validateData(squadPolicy, 'request', Object.assign({ type: 'task', to: { post: 'sl', squad: 'alpha' } }, base)), null);
    assert.deepStrictEqual(opts('mortar').map(o => o[0]).slice(0, 2), ['', 'post:mortar'], 'a strike never offers a squad post');

    world([so, Object.assign({}, crew, { callsign: evil })], so);
    H.state.form = true;
    H.state.target = null;
    api.ui.drafts['request.type'] = 'task';
    let html = mod.panel('requests', api);
    assertSafe(html, 'task form');
    assert.ok(html.includes('data-room-action="reqType" data-type="task">3 Task</button>'), '«3 Task» in the type row');
    assert.ok(html.includes('<select class="tac-select" name="to"><option value="" selected>— pick —</option><option value="post:so">Staff Officer</option>'), html);
    assert.ok(html.includes('Task text<input class="tac-input" name="note"'), 'the note is the task text');
    assert.ok(html.includes('<span class="tac-item-coords">no point (optional)</span>'), 'the point is optional');
    api.ui.drafts['request.to'] = 'client:c-crew';
    html = mod.panel('requests', api);
    assert.ok(html.includes('<option value="client:c-crew" selected>&lt;img src=x onerror=1&gt; · Mortar crew</option>'), 'the draft stays chosen, the callsign escaped');
    api.ui.drafts['request.type'] = 'mortar';
    assert.ok(mod.panel('requests', api).includes('<option value="client:c-crew" selected>'), 'a crew member is still offered for a strike');
    api.ui.drafts['request.to'] = 'post:so';
    html = mod.panel('requests', api);
    assert.ok(html.includes('<option value="" selected>Everyone by type</option>') && !html.includes('post:so'), 'a strike never offers staff: back to everyone');
    assert.ok(html.includes('Note<input class="tac-input" name="note"') && html.includes('<span class="tac-item-coords">—</span>'));
    api.clearDrafts('request');
    H.state.form = false;
  });

  await t('submit: a task needs its text and an addressee, not a point; the addressee goes out as {post}, {post, squad} or {client}; a vanished one is refused', () => {
    const toasts = [];
    withApi({ toast: s => toasts.push(s) }, () => {
      const send = (type, to, note, target) => {
        H.state.form = true;
        H.state.target = target || null;
        api.ui.drafts['request.type'] = type;
        toasts.length = 0;
        queued = [];
        mod.submits.request({ elements: { coords: { value: '' }, note: { value: note }, urgent: { checked: false }, to: { value: to } } }, api);
        return { toast: toasts.slice(), data: queued.map(o => o.data), open: H.state.form };
      };
      world([so, crew], so);
      const T = api.T();
      assert.deepStrictEqual(send('task', 'post:mortar', '   '), { toast: [T.taskNeedText], data: [], open: true });
      assert.deepStrictEqual(send('task', '', 'hold the gate'), { toast: [T.reqToNeed], data: [], open: true });
      assert.deepStrictEqual(send('task', 'client:c-gone', 'hold the gate'), { toast: [T.reqToStale], data: [], open: true });
      assert.deepStrictEqual(send('mortar', '', 'x'), { toast: [T.needTarget], data: [], open: true });
      assert.deepStrictEqual([T.taskNeedText, T.reqToNeed, T.reqToStale], ['Write the task text.', 'Pick who the task is for.', 'That addressee is gone: pick again.']);
      const plain = send('task', 'post:mortar', 'hold the gate');
      assert.deepStrictEqual(plain, { toast: [], data: [{ type: 'task', note: 'hold the gate', priority: 'normal', flags: [], level: 0, h: 'h1', to: { post: 'mortar' } }], open: false });
      assert.strictEqual(R.validateData(policy, 'request', plain.data[0]), null, 'the contract takes a task without a point');
      const pointed = send('task', 'client:c-crew', 'check here', [5, 6]);
      assert.deepStrictEqual([pointed.data[0].target, pointed.data[0].to], [{ x: 5, y: 6 }, { client: 'c-crew' }]);
      assert.strictEqual(R.validateData(policy, 'request', pointed.data[0]), null);
      const everyone = send('mortar', '', 'x', [62, -62]);
      assert.ok(everyone.data.length === 1 && !('to' in everyone.data[0]), 'everyone by type sends no addressee');
      const toCrew = send('mortar', 'client:c-crew', 'x', [62, -62]);
      assert.deepStrictEqual(toCrew.data[0].to, { client: 'c-crew' });
      assert.strictEqual(R.validateData(policy, 'request', toCrew.data[0]), null);
      assert.deepStrictEqual(send('mortar', 'post:so', 'x', [62, -62]).toast, [T.reqToStale], 'a forged staff addressee on a strike is refused');
      api.ui.policy = squadPolicy;
      const squad = send('task', 'squad:sl:alpha', 'go');
      assert.deepStrictEqual(squad.data[0].to, { post: 'sl', squad: 'alpha' });
      assert.strictEqual(R.validateData(squadPolicy, 'request', squad.data[0]), null);
    });
    api.clearDrafts('request');
    H.state.form = false;
    H.state.target = null;
  });

  await t('card: «→ addressee» after the type; the addressee or staff accept, the asset owner and a claimed crew do not; a task has its own deny reasons', () => {
    const named = Object.assign({}, crew2, { callsign: 'Бекас' });
    const r = req({ to: { client: 'c-crew2' } });
    const acts = me => {
      world([r, mortarAsset({ claimedBy: 'c-crew' }), so, so2, crew, named], me);
      return [...mod.panel('requests', api).matchAll(/data-room-action="req-([a-z]+)"/g)].map(m => m[1]);
    };
    assert.deepStrictEqual([so, so2, crew, named].map(acts), [['cancel'], ['accept', 'deny'], [], ['accept', 'deny']]);
    world([r, so, named], so);
    const head = '<b>Mortar</b> <span class="tac-room-to">→ Бекас · Mortar crew</span> <span class="tac-item-coords">';
    assert.ok(mod.panel('requests', api).includes(head) && mod.strip(api).includes(head), 'panel and strip');
    const headFor = to => { world([req({ to })], so); const html = mod.panel('requests', api) + mod.strip(api); assertSafe(html, JSON.stringify(to)); return html.match(/<span class="tac-room-to">(.*?)<\/span>/)[1]; };
    assert.strictEqual(headFor({ post: 'mortar' }), '→ Mortar crew');
    assert.strictEqual(headFor({ client: 'c-left' }), '→ left the room');
    assert.strictEqual(headFor({ post: '<img src=x onerror=1>' }), '→ &lt;img src=x onerror=1&gt;');
    world([req()], so);
    assert.ok(!mod.panel('requests', api).includes('tac-room-to'), 'no addressee: no arrow');
    world([task(), so, crew], crew);
    mod.actions['req-deny'](el({ 'data-id': 't1' }), api);
    const reasons = [...mod.panel('requests', api).matchAll(/data-room-action="reqDenyReason" data-id="t1" data-reason="([^"]+)"/g)].map(m => m[1]);
    assert.deepStrictEqual(reasons, ['busy', 'not possible', 'not my job']);
    mod.actions.reqDenyReason(el({ 'data-id': 't1', 'data-reason': 'no ammo' }), api);
    mod.actions.reqDenyReason(el({ 'data-id': 't1', 'data-reason': 'busy' }), api);
    assert.deepStrictEqual(queued.map(o => o.data), [{ status: 'denied', reason: 'busy' }]);
  });

  await t('ping: a request with an addressee sounds only for the addressee; without one, as in stage 1', () => withClock(() => {
    const hears = (r, me) => { const w = pingWorld([r, mortarAsset(), so, so2, crew, crew2], me); tickAt(0); return patterns(w.ac).length > 0; };
    const all = [so, so2, crew, crew2];
    assert.deepStrictEqual(all.map(m => hears(req({ to: { client: 'c-crew2' } }), m)), [false, false, false, true], 'a strike for one crew member');
    assert.deepStrictEqual(all.map(m => hears(req({ to: { post: 'mortar' } }), m)), [false, false, true, true], 'a strike for the mortar post');
    assert.deepStrictEqual(all.map(m => hears(task({ by: by(crew), to: { post: 'so' } }), m)), [true, true, false, false], 'a task for staff; its author hears nothing');
    assert.deepStrictEqual(all.map(m => hears(req(), m)), [false, false, true, true], 'no addressee: the mortar crew, as before');
    const objects = { 'asset-mortar-1': mortarAsset({ claimedBy: 'c-so2' }) };
    assert.strictEqual(H.aimedAtMine(policy, objects, so2, req()), true, 'a claimed seat without an addressee');
    assert.strictEqual(H.aimedAtMine(policy, objects, so2, req({ to: { post: 'mortar' } })), false, 'a claimed seat is no addressee');
    assert.strictEqual(H.aimedAtMine(policy, objects, crew, req({ to: 'mortar' })), false, 'a broken addressee aims at nobody');
  }));

  await t('ownMortarRow: the mortar I claimed, else the first of my post; none for staff without a seat or a level that cannot write assets', () => {
    const rows = [1, 2].map(n => ({ id: 'asset-mortar-' + n, def: { type: 'mortar', owner: 'mortar' }, n, obj: { claimedBy: n === 2 ? 'c-crew' : null } }));
    assert.strictEqual(H.ownMortarRow(rows, policy, crew).id, 'asset-mortar-2', 'claimed');
    assert.strictEqual(H.ownMortarRow(rows, policy, crew2).id, 'asset-mortar-1', 'first of my post');
    assert.strictEqual(H.ownMortarRow(rows, policy, so), null, 'staff without a seat');
    assert.strictEqual(H.ownMortarRow([rows[0], Object.assign({}, rows[1], { obj: { claimedBy: 'c-so2' } })], policy, so2).id, 'asset-mortar-2', 'a staff officer in a crew seat');
    assert.strictEqual(H.ownMortarRow(rows.map(x => Object.assign({}, x, { obj: null })), policy, crew), null, 'no asset object yet');
    assert.strictEqual(H.ownMortarRow([{ id: 'asset-ob-1', def: { type: 'ob', owner: 'mortar' }, n: 1, obj: {} }], policy, crew), null, 'mortars only');
    assert.strictEqual(H.ownMortarRow(rows, policy, { client: 'c-obs', post: 'observer', confirmed: true }), null, 'observer');
    assert.strictEqual(H.ownMortarRow(rows, policy, null), null);
  });

  await t('«Share position»: a map pick patches my member and deploys my mortar in one click; staff moves none; «From the Fire panel» and «Clear position»', () => {
    const ops = () => queued.map(o => [o.op, o.kind, o.id, o.data]);
    let picked = null, cancels = 0;
    withApi({ setPick: (mode, fn, hint) => { picked = { mode, fn, hint }; }, cancelPick: () => { cancels++; } }, () => {
      api.ui.pick = null;
      world([so, crew, mortarAsset({ state: 'moving', tile: null })], crew, { level: 2 });
      let tools = mod.tools(api);
      assertSafe(tools, 'tools');
      assert.ok(tools.includes('<button type="button" class="btn-small tac-room-btn big" data-room-action="posShare">Share position</button>'), tools);
      assert.ok(!tools.includes('posFromFire') && !tools.includes('posClear'), 'no Fire panel mortar, no position yet');
      mod.actions.posShare(el({}), api);
      assert.deepStrictEqual([picked.mode, picked.hint], ['position', 'Click the tile you stand on']);
      picked.fn([30.7, -89.6]);   // a fractional tile floors: 30, -90
      assert.deepStrictEqual(ops(), [
        ['patch', 'member', 'mem-crew', { pos: { x: 30, y: -90, level: 2 } }],
        ['patch', 'asset', 'asset-mortar-1', { tile: [30, -90], state: 'deployed' }]]);
      assert.strictEqual(R.validateMemberPatch(policy, crew, queued[0].data), null, 'the member patch fits the contract');
      assert.strictEqual(R.validatePatch(policy, 'asset', queued[1].data, mortarAsset()), null, 'the asset patch fits the contract');
      assert.ok(R.canWrite(policy, crew, queued[1], mortarAsset()).ok, 'the crew may move its mortar');
      api.ui.pick = { mode: 'position' };
      assert.ok(mod.tools(api).includes('class="btn-small tac-room-btn on big" data-room-action="posShare"'), 'on while picking');
      mod.actions.posShare(el({}), api);
      assert.strictEqual(cancels, 1, 'a second press leaves pick mode');
      api.ui.pick = null;

      world([so, crew, mortarAsset()], so);
      mod.actions.posShare(el({}), api);
      picked.fn([1, 2]);
      assert.deepStrictEqual(ops(), [['patch', 'member', 'mem-so', { pos: { x: 1, y: 2, level: 0 } }]], 'staff moves no mortar');

      world([so, crew, mortarAsset()], crew, { mortar: { tile: [20, -98], mode: 'coordinates', level: 1 } });
      tools = mod.tools(api);
      assert.ok(tools.includes('data-room-action="posFromFire">From the Fire panel</button>'), tools);
      mod.actions.posFromFire(el({}), api);
      assert.deepStrictEqual(ops(), [
        ['patch', 'member', 'mem-crew', { pos: { x: 20, y: -98, level: 1 } }],
        ['patch', 'asset', 'asset-mortar-1', { tile: [20, -98], state: 'deployed' }]]);

      const placed = Object.assign({}, crew, { pos: { x: 20, y: -98, level: 1 }, posAt: NOW });
      world([so, placed, mortarAsset()], placed);
      assert.ok(mod.tools(api).includes('data-room-action="posClear">Clear position</button>'));
      mod.actions.posClear(el({}), api);
      assert.deepStrictEqual(ops(), [['patch', 'member', 'mem-crew', { pos: null }]], 'clear sends pos: null and leaves the mortar');
      assert.strictEqual(R.validateMemberPatch(policy, placed, queued[0].data), null);

      const observer = { id: 'mem-obs', kind: 'member', client: 'c-obs', post: 'observer', confirmed: true };
      world([observer], observer, { mortar: { tile: [1, 1] } });
      assert.ok(!/pos(Share|FromFire|Clear)/.test(mod.tools(api)), 'an observer post shares nothing');
      world([crew], Object.assign({}, crew, { confirmed: false }));
      assert.ok(!/posShare/.test(mod.tools(api)), 'a knocking member neither');
    });
    const toasts = [];
    withApi({ planetOk: () => false, toast: s => toasts.push(s), setPick: () => { throw new Error('no pick off the room planet'); } }, () => {
      world([crew, mortarAsset()], crew, { mortar: { tile: [20, -98] } });
      const tools = mod.tools(api);
      assert.ok(/<button disabled [^>]*data-room-action="posShare"/.test(tools) && /<button disabled [^>]*data-room-action="posFromFire"/.test(tools), tools);
      mod.actions.posShare(el({}), api);
      mod.actions.posFromFire(el({}), api);
      assert.deepStrictEqual([queued.length, toasts], [0, [api.T().reqWrongPlanet, api.T().reqWrongPlanet]]);
    });
  });

  await t('map: member diamonds in the level colour with «callsign · N min», faded after 5 min, only for confirmed members in the room on this level', () => {
    const crewPos = Object.assign({}, crew, { callsign: 'Бекас', pos: { x: 30, y: -90, level: 0 }, posAt: NOW - 2 * 60000 });
    const soPos = Object.assign({}, so, { pos: { x: 10, y: 10 }, posAt: NOW - 6 * 60000 });
    const gone = Object.assign({}, so2, { deleted: true, pos: { x: 1, y: 1 }, posAt: NOW });
    const knocking = Object.assign({}, crew2, { confirmed: false, pos: { x: 2, y: 2 }, posAt: NOW });
    const upstairs = { id: 'mem-up', kind: 'member', client: 'c-up', post: 'mortar', confirmed: true, callsign: 'Верх', pos: { x: 3, y: 3, level: 1 }, posAt: NOW };
    const broken = { id: 'mem-b', kind: 'member', client: 'c-b', post: 'so', confirmed: true, pos: { x: '<i>', y: 3 }, posAt: NOW };
    world([crewPos, soPos, gone, knocking, upstairs, broken], so);
    let c = canvas();
    mod.draw(c, view, api);
    assert.deepStrictEqual(c.texts(), ['Бекас · 2 min', 'Staff Officer · 6 min']);
    assert.deepStrictEqual(c.of('fill').map(x => [x.fill, x.alpha]), [['#5ad1e6', 1], ['#f5f5f5', 0.45]], 'the service colour fresh, the staff colour faded');
    assert.deepStrictEqual(c.of('fillText').map(x => x.alpha), [1, 0.45]);
    assert.deepStrictEqual(c.of('moveTo').map(x => x.args), [[305, -901], [105, 99]], 'a diamond tip above each tile centre');
    assert.strictEqual(c.of('lineTo').length, 6);
    ctx.level = 1;
    c = canvas();
    mod.draw(c, view, api);
    assert.deepStrictEqual(c.texts(), ['Staff Officer · 6 min', 'Верх · 0 min'], 'level 1: a position without a level and the one up there');
    const mine = Object.assign({}, crew, { callsign: 'Я', pos: { x: 5, y: 5, level: 0 }, posAt: NOW - 30 * 60000, pending: true });
    world([mine], crew);
    c = canvas();
    mod.draw(c, view, api);
    assert.deepStrictEqual(c.of('fillText').map(x => [x.args[0], x.alpha]), [['Я · 0 min', 1]], 'my position not yet acked is fresh');
    withApi({ planetOk: () => false }, () => {
      const off = canvas();
      mod.draw(off, view, api);
      assert.strictEqual(off.calls.length, 0, 'another planet on the page: nothing');
    });
  });

  await t('map: a deployed mortar gets a green annulus, a red disc inside minRange and both outlines; «Mortar zones» off keeps only the square and its label', () => {
    const store = {};
    world([Object.assign({}, crew, { callsign: 'Бекас' }), mortarAsset({ tile: [30, -90], claimedBy: 'c-crew' })], so);
    api.ui.storage = { read: k => (store[k] ? JSON.parse(JSON.stringify(store[k])) : null), write: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); } };
    const M = [305, -895];
    let c = canvas();
    mod.draw(c, view, api);
    assert.deepStrictEqual(c.of('arc').map(x => x.args.slice(0, 3)), [M.concat(650), M.concat(150), M.concat(150), M.concat(650), M.concat(150)],
      'annulus 65 and 15 tiles, the dead disc, then both outlines');
    assert.strictEqual(c.of('arc')[1].args[5], true, 'the inner edge of the annulus runs the other way');
    assert.deepStrictEqual(c.of('fill').map(x => [x.args[0], x.fill]), [['evenodd', H.ZONE.ring], [undefined, H.ZONE.dead]]);
    assert.deepStrictEqual(c.of('stroke').map(x => x.stroke), [H.ZONE.ringLine, H.ZONE.deadLine]);
    assert.deepStrictEqual(c.of('fillRect').map(x => x.args), [[299, -901, 12, 12]], 'the mortar square');
    assert.deepStrictEqual(c.texts(), ['Mortar 1 · Бекас']);
    let html = mod.panel('assets', api);
    assertSafe(html, 'assets with the zone switch');
    assert.ok(html.includes('<label class="tac-room-check"><input type="checkbox" data-room-change="reqZone" checked> Mortar zones</label>'), 'on by default');
    mod.changes.reqZone({ checked: false }, api);
    assert.deepStrictEqual(store[PREFS], { zone: false });
    assert.ok(mod.panel('assets', api).includes('data-room-change="reqZone"> Mortar zones'), 'unchecked once off');
    c = canvas();
    mod.draw(c, view, api);
    assert.deepStrictEqual([c.of('arc').length, c.of('fill').length, c.of('stroke').length, c.of('fillRect').length, c.texts()], [0, 0, 0, 1, ['Mortar 1 · Бекас']]);
    mod.changes.reqZone({ checked: true }, api);
    c = canvas();
    mod.draw(c, view, api);
    assert.strictEqual(c.of('arc').length, 5, 'back on');
    const labels = objects => { world(objects, so); const cv = canvas(); mod.draw(cv, view, api); return cv.texts(); };
    assert.deepStrictEqual(labels([mortarAsset({ tile: [30, -90] })]), ['Mortar 1'], 'nobody serves it');
    assert.deepStrictEqual(labels([crew, mortarAsset({ tile: [30, -90] })]), ['Mortar 1 · Mortar crew'], 'the post without a callsign');
    world([mortarAsset({ tile: [30, -90], state: 'moving' })], so);
    c = canvas();
    mod.draw(c, view, api);
    assert.strictEqual(c.calls.length, 0, 'a mortar on the move draws nothing');
    assert.deepStrictEqual(labels([Object.assign({}, crew, { pos: { x: 30, y: -90, level: 1 }, posAt: NOW }), mortarAsset({ tile: [30, -90] })]), [],
      'shared from level 1 while the page shows level 0: neither the crew nor its mortar');
    world([mortarAsset({ tile: [30, -90] })], so);
    ctx.fork.constants = { shells: [] };
    c = canvas();
    mod.draw(c, view, api);
    assert.deepStrictEqual([c.of('arc').length, c.of('fillRect').length], [0, 1], 'no mortar constants: the square without a zone');
    ctx.fork.constants = constants;
  });

  await t('room.css: pinging pulses, reduced motion keeps a still highlight, braces balance', () => {
    const css = read('tactical/room.css');
    assert.strictEqual((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, 'braces');
    assert.ok(/\/\* Stage 2a: requests, positions, mortar zone \*\/[^]*\.tac-room-to \{[^]*\.tac-room-nopoint \{/.test(css), 'the stage 2a block');
    assert.ok(/\.tac-room-card\.pinging, \.tac-room-req\.pinging, \.tac-room-chip\.pinging \{[^}]*animation: tac-room-ping/.test(css), 'pulse');
    const rm = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?\})\s*\}/);
    assert.ok(rm && /\.pinging[^{]*\{[^}]*animation: none;[^}]*box-shadow/.test(rm[1]), 'reduced motion');
  });

  console.log('OK', n, 'cases');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

function TYPES_OF(table) { return Object.keys(table); }

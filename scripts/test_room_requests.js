// scripts/test_room_requests.js — the requests module under Node: stored values stay escaped (tokenizer check),
// recall labels, the strip button per status, shots against the taken target, the planet guard, repeat,
// the mortar a «Deployed» moves, the request filter, digit keys and op shapes.
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
    member: c => Object.values(all).find(o => o.kind === 'member' && o.client === c) || null,
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
    assert.strictEqual(H.TYPES.length, 2);
    assert.strictEqual(H.typeForKey(key('1'), null, 'in'), 'mortar');
    assert.strictEqual(H.typeForKey(key('2'), { tagName: 'BUTTON' }, 'in'), 'position');
    ['0', '3', '6', '9', '12', 'a', 'Enter', undefined].forEach(k => assert.strictEqual(H.typeForKey(key(k), null, 'in'), null, String(k)));
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

  console.log('OK', n, 'cases');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

function TYPES_OF(table) { return Object.keys(table); }

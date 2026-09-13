// scripts/test_room_requests.js — the requests module under Node: stored values stay escaped,
// recall labels, the mortar a «Deployed» moves, the request filter, digit keys and op shapes.
// Run: node scripts/test_room_requests.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const policy = JSON.parse(read('tactical/policy/stories_cm.json'));

// The real shell (for esc, btn, fmt, postName, gameText) with register wrapped to capture the mod.
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
const XSS = /<img|<script|<i>|onerror=1>/i;

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
    assert.ok(panel.includes('data-id="ok1"') || panel.includes('tac-room-req'), 'the valid card renders');
    [panel, strip, chips].forEach(html => {
      assert.ok(!html.includes('bad1') && !html.includes('bad2'), 'invalid ids absent');
      assert.ok(!XSS.test(html) && !html.includes('onclick'), 'nothing unescaped');
    });
    assert.ok(chips.includes('Requests 1'), 'chip counts only valid open requests');
  });

  await t('card HTML: stored strings escaped, non-numbers render nothing', () => {
    const evil = req({ id: 'x"><img src=x onerror=1>', type: '<i>', status: 'firing', firedAt: '"><img onerror=1>', at: '<i>',
      note: '<script>alert(1)</script>', reason: '<img onerror=1>', priority: '"><i>', by: { client: 'c-x', post: '<i>', squad: '<i>' } });
    world([evil], crew);
    const html = mod.panel('requests', api) + mod.strip(api);
    assert.ok(!XSS.test(html), html);
    assert.ok(!html.includes('data-deadline'), 'a string firedAt gives no countdown');
    assert.ok(html.includes('&lt;script&gt;'), 'the note is shown escaped');
    assert.ok(html.includes('--req:#e8ecf4'), 'unknown type falls back to the default colour');
    world([req({ status: 'firing', firedAt: NOW - 1000, type: 'mortar' })], crew);
    assert.ok(/data-deadline="\d+"/.test(mod.panel('requests', api)), 'a numeric firedAt gives a countdown');
    world([req({ status: 'firing', type: 'mortar', firedAt: '"><img onerror=1>' })], crew);
    const firing = mod.panel('requests', api) + mod.strip(api);
    assert.ok(!firing.includes('data-deadline') && !XSS.test(firing), 'a string firedAt on a mortar strike renders no countdown');
    world([req({ status: 'firing', type: 'mortar', firedAt: '99' })], crew);
    assert.ok(!mod.panel('requests', api).includes('data-deadline'), 'a numeric string firedAt renders no countdown either');
  });

  await t('asset board: a radius of "<img onerror>" renders nothing, a number renders', () => {
    world([mortarAsset({ radius: '<img onerror=1>', state: 'constructor', shell: '"><img onerror=1>', claimedBy: 'c-crew' }), crew], crew);
    let html = mod.panel('assets', api) + mod.chips(api);
    assert.ok(!XSS.test(html), html);
    assert.ok(!html.includes('· r '), 'no radius text');
    assert.ok(html.includes('class="tac-room-state "'), 'no state class from an inherited key');
    world([mortarAsset({ radius: 7 })], crew);
    html = mod.panel('assets', api);
    assert.ok(html.includes('· r 7'));
    assert.ok(/data-room-action="assetState"[^>]*>/.test(html) && html.includes('tac-room-btn big') , 'state buttons are big');
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
    let html = mod.panel('requests', api);
    assert.ok(html.includes('tac-room-fire-coords">'), 'fire card shown');
    assert.ok(html.includes('tac-room-fire-coords"> -59</div>'), 'the string coordinate renders nothing: ' + html.match(/tac-room-fire-coords">[^<]*/)[0]);
    assert.ok(!XSS.test(html), html);
    // the author's view of the same request never gets the fire card
    api.ui.client.me = so;
    assert.ok(!mod.panel('requests', api).includes('tac-room-fire'));
    api.ui.client.me = crew;
    // done elsewhere: tick clears the taken request, shoot does nothing
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

  await t('take and place are disabled while the page shows another planet', () => {
    world([req({ status: 'accepted', acceptedBy: by(crew) }), req({ id: 'q2', type: 'position', status: 'accepted', acceptedBy: by(crew) })], crew);
    api.planetOk = () => false;
    const html = mod.panel('requests', api);
    assert.ok(/<button disabled [^>]*data-room-action="req-take"/.test(html));
    assert.ok(/<button disabled [^>]*data-room-action="req-place"/.test(html));
    mod.actions['req-take'](el({ 'data-id': 'q1' }), api);
    assert.strictEqual(H.state.taken, null);
    delete api.planetOk;
    assert.ok(!mod.panel('requests', api).includes('<button disabled'));
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

  await t('pickMortarRow: the mortar I crew, else the first I may edit', () => {
    const row = (n, claimedBy, type) => ({ id: 'asset-' + (type || 'mortar') + '-' + n, def: { type: type || 'mortar' }, n, obj: { claimedBy } });
    const rows = [row(1, null, 'ob'), row(1, 'c-other'), row(2, 'c-crew'), row(3, null)];
    const all = () => true;
    assert.strictEqual(H.pickMortarRow(rows, crew, all).id, 'asset-mortar-2');
    assert.strictEqual(H.pickMortarRow(rows, crew, r => r.id !== 'asset-mortar-2').id, 'asset-mortar-1');
    assert.strictEqual(H.pickMortarRow(rows, so, all).id, 'asset-mortar-1');
    assert.strictEqual(H.pickMortarRow(rows, crew, () => false), null);
    assert.strictEqual(H.pickMortarRow([row(1, undefined), row(2, undefined)], {}, all).id, 'asset-mortar-1', 'no undefined === undefined match');
    assert.strictEqual(H.pickMortarRow([row(1, null, 'ob')], crew, all), null, 'mortars only');
  });

  await t('«Deployed» moves the mortar only after the done patch is acked', async () => {
    const pos = () => req({ id: 'q2', type: 'position', target: { x: 30, y: -90 }, status: 'accepted', acceptedBy: by(crew) });
    world([pos(), mortarAsset({ id: 'asset-mortar-1' }), crew], crew);
    ackWith = () => ({ ok: true, seq: 9 });
    mod.actions['req-done'](el({ 'data-id': 'q2' }), api);
    assert.strictEqual(queued.length, 1, 'only the status patch at first');
    await tick();
    assert.deepStrictEqual(queued.map(o => o.kind + ':' + JSON.stringify(o.data)), ['request:{"status":"done"}', 'asset:{"tile":[30,-90],"state":"deployed"}']);
    assert.strictEqual(queued[1].id, 'asset-mortar-1');

    world([pos(), mortarAsset(), crew], crew);
    let toasted = null;
    const toast = api.toast;
    api.toast = text => { toasted = text; };
    ackWith = () => ({ ok: false, error: 'status', status: 'done' });
    mod.actions['req-done'](el({ 'data-id': 'q2' }), api);
    await tick();
    assert.strictEqual(queued.length, 1, 'a refused done leaves the asset untouched');
    assert.strictEqual(toasted, api.errorText('status'), 'the conflict toast');

    world([pos(), mortarAsset(), crew], crew);
    toasted = null;
    ackWith = () => api.ui.client;   // today's queue resolves to the client: unknown, act on nothing
    mod.actions['req-done'](el({ 'data-id': 'q2' }), api);
    await tick();
    assert.strictEqual(queued.length, 1);
    assert.strictEqual(toasted, null);
    api.toast = toast;
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
    const r = req({ status: 'requested' });
    world([r, req({ id: 'q2', type: 'position', status: 'accepted', acceptedBy: by(crew), target: { x: 30, y: -90 } }), mortarAsset(), crew], crew);
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
    mod.notify('shot', {}, api);
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

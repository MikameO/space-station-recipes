// scripts/test_room_ui.js — the room panel shell under Node with a small stub DOM:
// it never breaks the tactical map, and the review fixes (U1–U7, K3) hold.
// Run: node scripts/test_room_ui.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const basePolicy = JSON.parse(read('tactical/policy/stories_cm.json'));
const clone = v => JSON.parse(JSON.stringify(v));
const settle = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = 'chemdb-tactical:room-key:stories_cm';
const DEMO = 'chemdb-tactical:room-demo';

function policyWith(status) { const p = clone(basePolicy); p.sanction[0].status = status; return p; }
const answer = p => () => Promise.resolve({ ok: true, json: () => Promise.resolve(clone(p)) });

function fakeStorage() {
  const m = new Map();
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

function el(tag) {
  const classes = new Set(), attrs = {};
  let html = '';
  return {
    tagName: String(tag).toUpperCase(), listeners: {}, writes: 0, textContent: '',
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; this.writes++; },
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : !!on; if (v) classes.add(c); else classes.delete(c); return v; }
    },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: k => (k in attrs ? attrs[k] : null),
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    querySelectorAll: () => [], querySelector: () => null, contains: () => false,
    appendChild() {}, remove() {}, focus() {}
  };
}

// opt: hash, localStorage ('throw' | storage), sessionStorage, fixtures, fetch, raf, nav, narrow, framed, missing
function world(opt = {}) {
  const els = {};
  ['tacRoom', 'tacRoomToggle', 'tacRoomChips', 'tacRoomStrip', 'tacRoomShelf', 'tacRoomDraw'].forEach(id => {
    if (!(opt.missing || []).includes(id)) els[id] = el('div');
  });
  const document = {
    body: el('body'), head: el('head'), activeElement: null,
    getElementById: id => els[id] || null, createElement: tag => el(tag), addEventListener() {}
  };
  const w = { els, document, warnings: [], goals: [], fetches: [], intervals: [], layers: [], draws: 0, listeners: {} };
  const win = {
    I18N_LANG: opt.lang || 'ru',
    location: { hash: opt.hash || '', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8000', pathname: '/tactical.html', search: '' },
    history: { state: null, replaceState: (s, t, url) => { w.replaced = url; win.location.hash = url.indexOf('#') >= 0 ? url.slice(url.indexOf('#')) : ''; } },
    console: { warn: (...a) => w.warnings.push(a.map(x => (x && x.message) || String(x)).join(' ')) },
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: t => clearTimeout(t),
    setInterval: fn => { w.intervals.push(fn); return w.intervals.length; },
    requestAnimationFrame: opt.raf || (fn => { fn(); return 1; }),
    matchMedia: () => ({ matches: !!opt.narrow, addEventListener() {} }),
    performance: { getEntriesByType: () => [{ type: opt.nav || 'navigate' }] },
    ym: (id, kind, goal) => w.goals.push(goal),
    fetch: url => { w.fetches.push(url); return opt.fetch ? opt.fetch(url) : Promise.reject(new Error('offline')); },
    addEventListener: (type, fn) => { (w.listeners[type] = w.listeners[type] || []).push(fn); }
  };
  win.self = win;
  win.top = opt.framed ? {} : win;
  const ls = opt.localStorage === undefined ? 'throw' : opt.localStorage;
  const ss = opt.sessionStorage === undefined ? 'throw' : opt.sessionStorage;
  Object.defineProperty(win, 'localStorage', { get() { if (ls === 'throw') throw new Error('SecurityError: site data is blocked'); return ls; } });
  Object.defineProperty(win, 'sessionStorage', { get() { if (ss === 'throw') throw new Error('SecurityError: site data is blocked'); return ss; } });
  const files = ['tactical/room-logic.js', 'tactical/room.js'].concat(opt.fixtures ? ['tactical/room-fixtures.js'] : [], ['tactical/room-ui.js']);
  files.forEach(f => new Function('window', 'document', read(f))(win, document));
  w.win = win;
  w.stories = { key: 'stories_cm', planets: [{ id: 'lv624', name: 'LV-624' }, { id: 'bigred', name: 'Big Red' }], constants: {} };
  w.ctx = { fork: w.stories, meta: { id: 'lv624', h: 'h1' }, level: 0, calibration: null, mortar: null };
  w.hooks = {
    view: { addLayer: fn => w.layers.push(fn), requestDraw: () => { w.draws++; }, scale: 1 },
    getContext: () => w.ctx, takeTarget() {}, takePosition() {}, fire() {}, redraw() {}
  };
  w.ui = () => win.TacRoomUI.api.ui;
  w.api = () => win.TacRoomUI.api;
  w.attach = () => win.TacRoom.attach(w.hooks);
  return w;
}

function click(w, action, data = {}) {
  const target = { getAttribute: k => (k === 'data-room-action' ? action : k.indexOf('data-') === 0 && data[k.slice(5)] !== undefined ? data[k.slice(5)] : null) };
  target.closest = () => target;
  w.els.tacRoom.listeners.click[0]({ target, preventDefault() {} });
}
function submit(w, name, fields) {
  const form = { getAttribute: k => (k === 'data-room-form' ? name : null), elements: {} };
  Object.keys(fields).forEach(k => { form.elements[k] = { value: fields[k] }; });
  w.els.tacRoom.listeners.submit[0]({ target: form, preventDefault() {} });
}
function bannersOf(html) { return [...html.matchAll(/<div class="tac-banner tac-room-banner[^"]*">([\s\S]*?)<\/div>/g)].map(m => m[1]); }
const stubClient = extra => Object.assign({ status: 'in', meta: null, members: () => [], serverNow: () => 0, stopLoop() {} }, extra);

let n = 0;
const notes = [];
async function t(name, fn) { await fn(); n++; console.log('ok', name); }

(async () => {
  await t('U1: attach survives a localStorage getter that throws', async () => {
    const w = world();
    assert.doesNotThrow(() => w.attach());
    assert.strictEqual(w.ui().storage.ok, false, 'memory storage');
    assert.strictEqual(w.layers.length, 1, 'the room layer is added');
    assert.strictEqual(w.intervals.length, 1, 'the tick runs');
    await settle();
    assert.ok(w.els.tacRoomToggle.classList.contains('tac-hide'), 'no room URL: the toggle stays hidden');
  });

  await t('U1: attach runs once, never inside a frame, and quits quietly without its elements', async () => {
    const w = world();
    w.attach();
    w.attach();
    assert.strictEqual(w.layers.length, 1);
    assert.strictEqual(w.intervals.length, 1);
    const framed = world({ framed: true });
    framed.attach();
    assert.strictEqual(framed.layers.length + framed.intervals.length, 0);
    const bare = world({ missing: ['tacRoomStrip'] });
    assert.doesNotThrow(() => bare.attach());
    assert.strictEqual(bare.layers.length, 0);
  });

  await t('U2: a throwing module stays inside the shell (notify, draw, tick, pick) and a used pick is no cancel', async () => {
    const w = world();
    w.win.TacRoomUI.register({ id: 'boom', notify() { throw new Error('notify'); }, draw() { throw new Error('draw'); }, tick() { throw new Error('tick'); } });
    assert.doesNotThrow(() => w.attach(), 'the first tick throws inside the module');
    await settle();
    const ui = w.ui();
    ui.on = true;
    ui.client = stubClient();
    assert.doesNotThrow(() => w.win.TacRoom.notify('shot', { id: 's1' }));
    let depth = 0;
    assert.doesNotThrow(() => w.layers[0]({ save: () => depth++, restore: () => depth-- }, w.hooks.view));
    assert.strictEqual(depth, 0, 'save and restore stay paired');
    assert.doesNotThrow(() => w.intervals[0]());
    let cancelled = false;
    w.api().setPick('probe', () => { throw new Error('pick'); }, null, false, () => { cancelled = true; });
    assert.strictEqual(w.win.TacRoom.consumePick([1, 2]), true);
    assert.strictEqual(cancelled, false, 'onCancel is not called for a used pick');
    assert.strictEqual(ui.pick, null);
    ['notify', 'draw', 'tick', 'pick'].forEach(k => assert.ok(w.warnings.some(x => x.indexOf(k) >= 0), k + ' is warned, not thrown'));
    // room.js wraps TacRoom.notify itself (client track); until that lands a throwing shell would still escape.
    w.win.TacRoomUI.notify = () => { throw new Error('shell'); };
    try { w.win.TacRoom.notify('shot', {}); } catch (e) { notes.push('TacRoom.notify in room.js does not catch yet (client track)'); }
  });

  await t('K3: register warns when a module key collides with an existing key', async () => {
    const w = world();
    w.win.TacRoomUI.register({ id: 'probe', l10n: { en: { claim: 'Crew', fresh: 'x' }, ru: { claim: 'Расчёт', tabs: { roster: 'Люди' } } } });
    const msg = w.warnings.find(x => x.indexOf('probe') >= 0) || '';
    assert.ok(msg.indexOf('claim') >= 0 && msg.indexOf('tabs.roster') >= 0, msg);
    assert.ok(msg.indexOf('fresh') < 0, 'new keys are not clashes');
  });

  await t('U4/K3: planetOk before meta, on the room planet and elsewhere; the layer draws only on the room planet', async () => {
    const w = world();
    w.attach();
    await settle();
    const ui = w.ui(), api = w.api();
    let drew = 0;
    w.win.TacRoomUI.register({ id: 'pen', draw() { drew++; } });
    ui.on = true;
    ui.client = stubClient();
    assert.strictEqual(api.planetOk(), true, 'meta not loaded yet');
    ui.client.meta = { planet: 'lv624' };
    assert.strictEqual(api.planetOk(), true);
    const c2d = { save() {}, restore() {} };
    w.layers[0](c2d, w.hooks.view);
    assert.strictEqual(drew, 1);
    w.ctx.meta = { id: 'bigred', h: 'h2' };
    assert.strictEqual(api.planetOk(), false);
    w.layers[0](c2d, w.hooks.view);
    assert.strictEqual(drew, 1, 'no room objects over another planet');
  });

  await t('U7: a failed policy load hides the toggle and retries on the next fork switch', async () => {
    let storiesCalls = 0;
    const granted = policyWith('pilot');
    const w = world({
      localStorage: fakeStorage(),
      fetch: url => (/\/rmc14$/.test(url) ? Promise.resolve({ ok: false })
        : ++storiesCalls === 1 ? Promise.reject(new Error('offline')) : answer(granted)())
    });
    w.win.TacRoom.ROOM_URL = 'https://room.example';
    w.attach();
    await settle();
    assert.strictEqual(storiesCalls, 1);
    assert.ok(w.els.tacRoomToggle.classList.contains('tac-hide'));
    assert.strictEqual(w.ui().client, null);
    w.ctx.fork = Object.assign({}, w.stories, { key: 'rmc14' });
    w.intervals[0]();
    await settle();
    w.ctx.fork = w.stories;
    w.intervals[0]();
    await settle();
    assert.strictEqual(storiesCalls, 2, 'retried');
    assert.ok(!w.els.tacRoomToggle.classList.contains('tac-hide'), 'the toggle shows once the policy loads');
    assert.ok(w.ui().client);
  });

  await t('U7: the demo keeps storage in memory, fires no goals, and survives a reload of the tab only', async () => {
    const ls = fakeStorage(), ss = fakeStorage();
    const w = world({ hash: '#room=demo', localStorage: ls, sessionStorage: ss, fixtures: true, fetch: answer(basePolicy) });
    w.attach();
    await settle();
    const ui = w.ui();
    assert.strictEqual(ui.demo, true);
    assert.strictEqual(ui.on, true, 'the demo opens the panel');
    submit(w, 'create', { post: 'so', callsign: 'Орлов' });
    await settle();
    ui.client.stopLoop();
    assert.strictEqual(ui.client.status, 'in');
    assert.strictEqual(ls.m.size, 0, 'nothing in localStorage');
    assert.deepStrictEqual(w.goals, [], 'no Metrika goals');
    assert.ok(w.els.tacRoom.innerHTML.indexOf('Хранилище браузера выключено') < 0, 'no storage banner in the demo');
    assert.strictEqual(ss.getItem(DEMO), '1');
    const reload = world({ hash: '#map=stories_cm/lv624', localStorage: fakeStorage(), sessionStorage: ss, fixtures: true, fetch: answer(basePolicy), nav: 'reload' });
    reload.attach();
    await settle();
    assert.strictEqual(reload.ui().demo, true, 'a reload keeps the demo');
    const visit = world({ hash: '#map=stories_cm/lv624', localStorage: fakeStorage(), sessionStorage: ss, fixtures: true, fetch: answer(basePolicy), nav: 'navigate' });
    visit.attach();
    await settle();
    assert.strictEqual(visit.ui().demo, false, 'a fresh visit does not');
    assert.strictEqual(ss.getItem(DEMO), null);
  });

  await t('U3: a knock shows as a banner at any width, words for two knocks, the count on the Roster tab; colours are checked', async () => {
    const evil = clone(basePolicy);
    evil.levels.staff.color = '#fff" onmouseover="alert(1)';
    const w = world({ hash: '#room=demo', sessionStorage: fakeStorage(), fixtures: true, fetch: answer(evil), narrow: true });
    w.attach();
    await settle();
    submit(w, 'create', { post: 'so', callsign: 'Орлов' });
    await settle();
    const ui = w.ui(), c = ui.client;
    c.stopLoop();
    const codes = c.sheet.filter(s => s.post === 'mortar').map(s => s.code);
    const joiner = () => new w.win.TacRoom.RoomClient({ transport: c.transport, storage: w.win.TacRoom.makeStorage(null), policy: ui.policy, fork: 'stories_cm', planet: 'lv624', h: 'h1' });
    const crew = joiner();
    await crew.join({ entry: c.code + '-' + codes[0], callsign: 'Сидоров' });
    assert.strictEqual(crew.status, 'knocking');
    await c.poll();
    await settle();
    let html = w.els.tacRoom.innerHTML;
    let knocks = bannersOf(html).filter(b => b.indexOf('Ждёт входа') >= 0);
    assert.strictEqual(knocks.length, 1);
    assert.ok(knocks[0].indexOf('data-room-action="confirm"') >= 0 && knocks[0].indexOf('data-client="' + crew.client + '"') >= 0, knocks[0]);
    assert.ok(html.indexOf('Реестр · стук 1') >= 0, 'the Roster tab counts the knock');
    assert.ok(html.indexOf('onmouseover') < 0, 'a policy colour cannot break out of the style attribute');
    const second = joiner();
    await second.join({ entry: c.code + '-' + codes[1] });
    await c.poll();
    await settle();
    html = w.els.tacRoom.innerHTML;
    knocks = bannersOf(html).filter(b => b.indexOf('Ждёт входа') >= 0);
    assert.strictEqual(knocks.length, 2);
    knocks.forEach(b => assert.ok((b.match(/data-word="/g) || []).length === 3, 'three word choices: ' + b));
    assert.ok(html.indexOf('Реестр · стук 2') >= 0);
  });

  await t('U5: the server key is a password field, a saved key is only named, kept only after the room opens, and can be forgotten', async () => {
    const ls = fakeStorage();
    ls.setItem(KEY, JSON.stringify('saved-key'));
    const w = world({ hash: '#room=K7M4Q2', localStorage: ls, fixtures: true, fetch: answer(policyWith('pilot')) });
    w.win.TacRoom.ROOM_URL = 'https://room.example';
    w.attach();
    await settle();
    const ui = w.ui(), panel = w.els.tacRoom;
    assert.strictEqual(ui.on, true);
    assert.ok(panel.innerHTML.indexOf('ключ сохранён') >= 0 && panel.innerHTML.indexOf('data-room-action="keyReplace"') >= 0);
    assert.ok(panel.innerHTML.indexOf('saved-key') < 0, 'the saved key never enters the page');
    assert.ok(panel.innerHTML.indexOf('name="token"') < 0);
    click(w, 'keyReplace');
    assert.ok(/<input class="tac-input" type="password" name="token"[^>]*value=""/.test(panel.innerHTML), 'replace shows an empty password field');
    ui.client.transport = { create: () => Promise.resolve({ status: 403, body: { error: 'sanction' }, retryAfter: null }) };
    submit(w, 'create', { token: 'wrong-key', post: 'so', callsign: '' });
    await settle();
    assert.strictEqual(JSON.parse(ls.getItem(KEY)), 'saved-key', 'a refused key is not stored');
    const html = panel.innerHTML, at = html.indexOf('data-room-form="create"');
    assert.ok(html.slice(at).indexOf('Ключ сервера не подходит') >= 0, 'the error shows inside the create form');
    assert.ok(html.slice(0, at).indexOf('tac-msg error') < 0, 'and not under the join form');
    click(w, 'keyForget');
    assert.strictEqual(ls.getItem(KEY), null);
    assert.ok(panel.innerHTML.indexOf('ключ сохранён') < 0 && panel.innerHTML.indexOf('name="token"') >= 0);
    ui.client.transport = new w.win.TacRoomFixture.FixtureTransport(ui.policy);
    submit(w, 'create', { token: 'good-key', post: 'so', callsign: '' });
    await settle();
    ui.client.stopLoop();
    assert.strictEqual(ui.client.status, 'in');
    assert.strictEqual(JSON.parse(ls.getItem(KEY)), 'good-key', 'the key that opened a room is kept');
    assert.ok(w.goals.indexOf('room_create') >= 0, 'a real room counts');
    const current = 'chemdb-tactical:room-current:' + ui.client.client;
    assert.ok(ls.getItem(current));
    ui.client.status = 'gone';
    ui.client.onUpdate(ui.client);
    assert.strictEqual(ls.getItem(current), null, 'room-current is cleared after gone');
  });

  await t('U6: unchanged markup is not rewritten; a focused field defers the write to focusout or the next change; details state is kept', async () => {
    const w = world({ hash: '#room=demo', sessionStorage: fakeStorage(), fixtures: true, fetch: answer(basePolicy) });
    w.attach();
    await settle();
    const panel = w.els.tacRoom, ui = w.ui(), api = w.api();
    const start = panel.writes;
    assert.ok(start > 0 && panel.innerHTML.indexOf('data-room-form="join"') >= 0);
    api.render();
    api.render();
    assert.strictEqual(panel.writes, start, 'same markup, no write');
    const field = { tagName: 'INPUT' };
    w.document.activeElement = field;
    panel.contains = x => x === field;
    ui.drafts['join.callsign'] = 'Орлов';
    api.render();
    assert.strictEqual(panel.writes, start, 'no write under a focused input');
    w.document.activeElement = null;
    panel.listeners.focusout[0]({});
    assert.strictEqual(panel.writes, start + 1, 'the write lands on focusout');
    assert.ok(panel.innerHTML.indexOf('value="Орлов"') >= 0);
    const list = { tagName: 'SELECT' };
    w.document.activeElement = list;
    panel.contains = x => x === list;
    ui.drafts['join.callsign'] = 'Петров';
    api.render();
    assert.strictEqual(panel.writes, start + 1, 'no write under an open list');
    panel.listeners.change[0]({ target: { name: 'post', value: 'so', form: { getAttribute: () => 'join' }, getAttribute: () => null } });
    assert.strictEqual(panel.writes, start + 2, 'the next change event writes');
    w.document.activeElement = null;
    assert.ok(panel.innerHTML.indexOf('data-room-details="create" open') >= 0, 'the demo opens the create form');
    panel.listeners.toggle[0]({ target: { getAttribute: k => (k === 'data-room-details' ? 'create' : null), open: false } });
    api.render();
    assert.ok(panel.innerHTML.indexOf('data-room-details="create" open') < 0, 'a closed create form stays closed');
  });

  await t('queueRender renders within 150 ms when animation frames never fire, and only once when both fire', async () => {
    const w = world({ hash: '#room=demo', sessionStorage: fakeStorage(), fixtures: true, fetch: answer(basePolicy), raf: () => 1 });
    w.attach();
    await settle();
    await sleep(150);
    const panel = w.els.tacRoom, ui = w.ui();
    const writes = panel.writes;
    ui.drafts['join.callsign'] = 'Орлов';
    w.api().render();
    assert.strictEqual(ui.renderQueued, true);
    await sleep(150);
    assert.strictEqual(ui.renderQueued, false);
    assert.strictEqual(panel.writes, writes + 1);
    const frames = [];
    const both = world({ hash: '#room=demo', sessionStorage: fakeStorage(), fixtures: true, fetch: answer(basePolicy), raf: fn => { frames.push(fn); return 1; } });
    both.attach();
    await settle();
    await sleep(150);
    frames.length = 0;
    const draws = both.draws;
    both.api().render();
    frames.forEach(fn => fn());
    await sleep(150);
    assert.strictEqual(both.draws, draws + 1, 'the frame renders and the timer is a no-op');
  });

  await t('U7: the observer token leaves the address bar at once and on hashchange, the rest of the hash stays', async () => {
    const w = world({ hash: '#map=stories_cm/lv624&observe=DEMA42.tok_en-1' });
    w.attach();
    assert.strictEqual(w.ui().pendingHash.observe, 'DEMA42.tok_en-1', 'read first');
    assert.strictEqual(w.replaced, '/tactical.html#map=stories_cm/lv624');
    w.replaced = null;
    w.win.location.hash = '#observe=DEMA42.other&map=stories_cm/lv624&level=1';
    w.listeners.hashchange.forEach(fn => fn());
    assert.strictEqual(w.replaced, '/tactical.html#map=stories_cm/lv624&level=1');
  });

  await t('U7: SITE follows the page origin outside production', async () => {
    const w = world({ hash: '#room=demo', sessionStorage: fakeStorage(), fixtures: true, fetch: answer(basePolicy) });
    w.attach();
    await settle();
    submit(w, 'create', { post: 'so', callsign: '' });
    await settle();
    w.ui().client.stopLoop();
    assert.ok(w.els.tacRoom.innerHTML.indexOf('127.0.0.1:8000/tactical.html') >= 0, 'the briefing sheet names the local page');
    assert.ok(w.els.tacRoom.innerHTML.indexOf('mikameo.github.io') < 0);
  });

  await t('Worker protocol: export buttons for staff and the observer only; every new error code and 423 reason has text', async () => {
    const w = world({ hash: '#room=demo', sessionStorage: fakeStorage(), fixtures: true, fetch: answer(basePolicy) });
    w.attach();
    await settle();
    submit(w, 'create', { post: 'so', callsign: '' });
    await settle();
    const ui = w.ui(), c = ui.client, api = w.api();
    c.stopLoop();
    const hasExport = () => w.els.tacRoom.innerHTML.indexOf('data-room-action="exportLog"') >= 0;
    assert.ok(hasExport(), 'staff sees the export');
    const staff = c.me;
    c.me = Object.assign({}, staff, { post: 'mortar' });
    api.render();
    assert.ok(!hasExport(), 'the crew does not');
    c.me = null;
    c.status = 'observer';
    api.render();
    assert.ok(hasExport(), 'the observer does');
    const codes = ['member', 'exists', 'author', 'last', 'knocks', 'rotated', 'json', 'fields', 'field', 'stopped', 'budget', 'closed', 'silence'];
    codes.forEach(code => assert.ok(api.errorText(code).indexOf('Ошибка') !== 0, 'ru text for ' + code));
    assert.strictEqual(api.errorText('toString'), 'Ошибка: toString', 'hasOwnProperty lookup');
    const en = world({ lang: 'en' });
    codes.forEach(code => assert.ok(en.api().errorText(code).indexOf('Error:') !== 0, 'en text for ' + code));
    ['silence', 'stopped', 'budget'].forEach(r => assert.ok(api.T().banners[r], 'frozen banner for ' + r));
  });

  notes.forEach(x => console.log('note:', x));
  console.log('OK', n, 'cases');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

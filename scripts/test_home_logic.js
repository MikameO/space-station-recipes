// Exercises the pure half of home.js (visits, badges, auto-show decision) under Node.
// Run: node scripts/test_home_logic.js
//
// The module runs in THIS realm with a stub window, not in a vm context: objects
// built in another realm carry another Object.prototype, and deepStrictEqual
// compares prototypes, so a correct result would still fail the assert.
// Moments (visits, "now") are built in local time, the way a browser sees them;
// manifest dates stay ISO strings, which parse as UTC midnight.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'home.js'), 'utf8');
const win = {};
vm.runInThisContext('(function (window) {' + src + '\n})')(win);
const L = win.ChemDBHomeLogic;

const H = 3600 * 1000, D = 24 * H;
const T0 = new Date(2026, 8, 12, 12, 0, 0).getTime();          // local noon, 12 Sep
const SECTIONS = [
  { id: 'a', added: '2026-04-19', updated: '2026-07-01', whatsNew: { en: 'x', ru: 'х' } },
  { id: 'b', added: '2026-07-12', updated: '2026-09-10', whatsNew: { en: 'y', ru: 'у' } },
  { id: 'c', added: '2026-09-11', updated: '2026-09-11', whatsNew: { en: 'z', ru: 'з' } },
  { id: 'feedback' },
];
const OK = { storageOk: true, companion: false, deepLink: false, tutorialActive: false, userBusy: false };

const cases = [
  ['first load creates visit 1', () => {
    const r = L.bumpVisits(null, T0);
    assert.deepStrictEqual(r, { visits: { n: 1, first: T0, last: T0, prevLast: null, touched: T0 }, isNewVisit: true });
  }],
  ['reload within 6h is the same visit', () => {
    const v1 = L.bumpVisits(null, T0).visits;
    const r = L.bumpVisits(v1, T0 + 5 * H);
    assert.strictEqual(r.isNewVisit, false);
    assert.strictEqual(r.visits.n, 1);
    assert.strictEqual(r.visits.touched, T0 + 5 * H);
  }],
  ['6h after the last touch starts visit 2 and remembers the previous start', () => {
    const v1 = L.bumpVisits(null, T0).visits;
    const touched = L.bumpVisits(v1, T0 + 5 * H).visits;
    const r = L.bumpVisits(touched, T0 + 11 * H);
    assert.strictEqual(r.isNewVisit, true);
    assert.strictEqual(r.visits.n, 2);
    assert.strictEqual(r.visits.prevLast, T0);
    assert.strictEqual(r.visits.first, T0);
  }],
  ['garbage in storage restarts at visit 1', () => {
    assert.strictEqual(L.bumpVisits({ n: 'x' }, T0).visits.n, 1);
    assert.strictEqual(L.bumpVisits('[bad', T0).visits.n, 1);
  }],
  ['markAllSeen snapshots every dated section', () => {
    const s = L.markAllSeen(SECTIONS, { autoShow: true });
    assert.deepStrictEqual(s.seen, { a: '2026-07-01', b: '2026-09-10', c: '2026-09-11' });
    assert.strictEqual(s.autoShow, true);
  }],
  ['no badges right after first-visit snapshot', () => {
    const visits = { n: 1, first: T0 };
    const state = L.markAllSeen(SECTIONS, {});
    assert.strictEqual(L.computeBadges(SECTIONS, state, visits, T0).count, 0);
  }],
  ['updated after seen → updated badge; older than 60 days → none', () => {
    const visits = { n: 3, first: Date.parse('2026-06-01') };
    const state = { seen: { a: '2026-06-01', b: '2026-09-01', c: '2026-09-11' } };
    const b = L.computeBadges(SECTIONS, state, visits, T0);
    assert.deepStrictEqual(b.byId, { b: 'updated' });       // a: its update is 73 days old
    assert.strictEqual(b.count, 1);
  }],
  ['section added after first visit and never seen → new badge', () => {
    const visits = { n: 3, first: Date.parse('2026-09-01') };
    const state = { seen: { a: '2026-07-01', b: '2026-09-10' } };
    const b = L.computeBadges(SECTIONS, state, visits, T0);
    assert.strictEqual(b.byId.c, 'new');
  }],
  ['undated feedback card never badges', () => {
    const b = L.computeBadges(SECTIONS, { seen: {} }, { n: 5, first: 0 }, T0);
    assert.strictEqual(b.byId.feedback, undefined);
  }],
  ['auto-show: blocked contexts win', () => {
    const visits = { n: 4, first: 0 };
    const state = { autoShow: true, introShown: true, lastAutoShown: null };
    for (const k of ['companion', 'deepLink', 'tutorialActive', 'userBusy']) {
      assert.strictEqual(L.decideAutoShow(Object.assign({}, OK, { [k]: true }), state, visits, 3, T0).mode, null, k);
    }
    assert.strictEqual(L.decideAutoShow(Object.assign({}, OK, { storageOk: false }), state, visits, 3, T0).mode, null);
  }],
  ['auto-show: first visit never, second visit intro once', () => {
    assert.strictEqual(L.decideAutoShow(OK, { autoShow: true }, { n: 1 }, 0, T0).mode, null);
    assert.strictEqual(L.decideAutoShow(OK, { autoShow: true, introShown: false }, { n: 2 }, 0, T0).mode, 'intro');
    // blocked on visit 2 (say, by a deep link) → shown at the next chance
    assert.strictEqual(L.decideAutoShow(OK, { autoShow: true, introShown: false }, { n: 3 }, 0, T0).mode, 'intro');
    assert.strictEqual(L.decideAutoShow(OK, { autoShow: true, introShown: true }, { n: 2 }, 0, T0).mode, null);
  }],
  ['auto-show: switched off silences the intro as well as updates', () => {
    assert.strictEqual(L.decideAutoShow(OK, { autoShow: false, introShown: false }, { n: 2 }, 0, T0).mode, null);
    assert.strictEqual(L.decideAutoShow(OK, { autoShow: false, introShown: true }, { n: 5 }, 3, T0).mode, null);
  }],
  ['auto-show: updates once a day, toggle off respected', () => {
    const st = { autoShow: true, introShown: true, lastAutoShown: null };
    assert.strictEqual(L.decideAutoShow(OK, st, { n: 5 }, 2, T0).mode, 'updates');
    assert.strictEqual(L.decideAutoShow(OK, Object.assign({}, st, { lastAutoShown: T0 - H }), { n: 5 }, 2, T0).mode, null);
    assert.strictEqual(L.decideAutoShow(OK, Object.assign({}, st, { lastAutoShown: T0 - 2 * D }), { n: 5 }, 2, T0).mode, 'updates');
    assert.strictEqual(L.decideAutoShow(OK, Object.assign({}, st, { autoShow: false }), { n: 5 }, 2, T0).mode, null);
    assert.strictEqual(L.decideAutoShow(OK, st, { n: 5 }, 0, T0).mode, null);
  }],
  ['headline: count + date, or "recently" when the previous visit is too old', () => {
    const prev = new Date(2026, 8, 5, 13, 0).getTime();
    assert.strictEqual(L.headline('en', 2, prev, T0), '2 sections updated since your visit on 5 September');
    assert.strictEqual(L.headline('en', 1, prev, T0), '1 section updated since your visit on 5 September');
    assert.strictEqual(L.headline('ru', 1, prev, T0), '1 раздел обновился с вашего визита 5 сентября');
    assert.strictEqual(L.headline('ru', 3, prev, T0), '3 раздела обновились с вашего визита 5 сентября');
    assert.strictEqual(L.headline('ru', 5, prev, T0), '5 разделов обновились с вашего визита 5 сентября');
    assert.strictEqual(L.headline('en', 2, null, T0), '2 sections updated recently');
    assert.strictEqual(L.headline('en', 2, T0 - 70 * D, T0), '2 sections updated recently');
    assert.strictEqual(L.headline('ru', 2, null, T0), '2 раздела обновились за последнее время');
  }],
  ["headline names the visitor's calendar day, even just after midnight", () => {
    const earlyMorning = new Date(2026, 8, 5, 1, 30).getTime();      // 01:30 local; still 4 Sep in UTC east of Greenwich
    assert.strictEqual(L.headline('ru', 2, earlyMorning, T0), '2 раздела обновились с вашего визита 5 сентября');
  }],
  ['badge line: what is new + short date', () => {
    assert.strictEqual(L.badgeLine('en', SECTIONS[1], 'updated'), 'New: y · 10 Sep');
    assert.strictEqual(L.badgeLine('ru', SECTIONS[1], 'updated'), 'Новое: у · 10 сен');
    assert.strictEqual(L.badgeLine('en', SECTIONS[2], 'new'), 'New section · 11 Sep');
    assert.strictEqual(L.badgeLine('ru', SECTIONS[2], 'new'), 'Новый раздел · 11 сен');
  }],
];

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + (e.message || e)); }
}
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);

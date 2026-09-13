// Exercises the pure half of feedback.js (validation, payload, prefill URL,
// issue link check, survey decision, visible-time clock) under Node.
// Run: node scripts/test_feedback_logic.js
//
// Runs the module in THIS realm (see test_home_logic.js): deepStrictEqual
// compares prototypes, and objects from a vm context carry a foreign one.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'feedback.js'), 'utf8');
const win = {};
vm.runInThisContext('(function (window) {' + src + '\n})')(win);
const L = win.ChemDBFeedbackLogic;

const D = 86400000;
const T0 = Date.parse('2026-09-12T12:00:00Z');
const okCtx = { enabled: true, storageOk: true, companion: false, deepLink: false, tutorialActive: false, visits: { n: 3 }, homeOpen: false, popupTaken: false };
const withCtx = over => Object.assign({}, okCtx, over);

const cases = [
  ['idea: short / long / fine', () => {
    assert.deepStrictEqual(L.validate('idea', { text: 'too short' }), { text: 'short' });
    assert.deepStrictEqual(L.validate('idea', { text: 'x'.repeat(2001) }), { text: 'long' });
    assert.deepStrictEqual(L.validate('idea', { text: 'ten chars!', contact: 'c'.repeat(81) }), { contact: 'long' });
    assert.deepStrictEqual(L.validate('idea', { text: 'Add a coffee recipe list please' }), {});
  }],
  ['survey: at least one answer', () => {
    assert.deepStrictEqual(L.validate('survey', { hardest: '  ', wanted: '' }), { form: 'empty' });
    assert.deepStrictEqual(L.validate('survey', { hardest: '', wanted: 'More maps' }), {});
    assert.deepStrictEqual(L.validate('survey', { hardest: 'x'.repeat(2001), wanted: 'y' }), { hardest: 'long' });
  }],
  ['payload carries trimmed fields, meta, honeypot and open time', () => {
    const meta = { page: 'index', lang: 'ru' };
    const p = L.buildPayload('idea', { text: '  hello world  ', contact: ' me ', hp: '' }, meta, T0 - 5000, T0);
    assert.deepStrictEqual(p, { kind: 'idea', contact: 'me', meta, hp: '', t: 5000, text: 'hello world' });
    const s = L.buildPayload('survey', { hardest: 'a', wanted: '', chips: ['maps', 'trees'] }, meta, T0 - 9000, T0);
    assert.deepStrictEqual(s.answers, { hardest: 'a', wanted: '' });
    assert.deepStrictEqual(s.chips, ['maps', 'trees']);
    assert.strictEqual(s.t, 9000);
  }],
  ['prefill URL targets the right template and encodes fields', () => {
    assert.strictEqual(L.prefillUrl('idea', { text: 'a b&c', contact: '' }),
      'https://github.com/MikameO/space-station-recipes/issues/new?template=idea.yml&idea=a%20b%26c');
    assert.strictEqual(L.prefillUrl('survey', { hardest: 'h', wanted: '', contact: 'nick' }),
      'https://github.com/MikameO/space-station-recipes/issues/new?template=survey.yml&hardest=h&contact=nick');
    assert.strictEqual(L.prefillUrl('idea', {}), 'https://github.com/MikameO/space-station-recipes/issues/new?template=idea.yml');
  }],
  ["issueLink accepts only this repository's issues", () => {
    const ok = 'https://github.com/MikameO/space-station-recipes/issues/42';
    assert.strictEqual(L.issueLink(ok), ok);
    for (const bad of ['javascript:alert(1)', 'https://github.com/other/repo/issues/1', ok + 'x', ok + '/../../x', '', null]) {
      assert.strictEqual(L.issueLink(bad), null, String(bad));
    }
  }],
  ['survey decision: disabled / no storage / blocked contexts', () => {
    assert.strictEqual(L.surveyDecision({}, withCtx({ enabled: false }), T0).reason, 'disabled');
    assert.strictEqual(L.surveyDecision({}, withCtx({ storageOk: false }), T0).reason, 'no-storage');
    for (const k of ['companion', 'deepLink', 'tutorialActive']) {
      assert.strictEqual(L.surveyDecision({}, withCtx({ [k]: true }), T0).show, false);
    }
  }],
  ['survey decision: needs 3 visits, shows when eligible', () => {
    assert.strictEqual(L.surveyDecision({}, withCtx({ visits: { n: 2 } }), T0).reason, 'too-few-visits');
    assert.deepStrictEqual(L.surveyDecision({}, okCtx, T0), { show: true, reason: 'eligible' });
    assert.deepStrictEqual(L.surveyDecision(null, okCtx, T0), { show: true, reason: 'eligible' });
  }],
  ['survey decision: mode B — one retry after 30 days, never after the second dismiss', () => {
    const once = L.applyDismiss({}, T0);
    assert.deepStrictEqual(once, { dismissed: 1, dismissedAt: T0 });
    assert.strictEqual(L.surveyDecision(once, okCtx, T0 + 10 * D).reason, 'cooling');
    assert.strictEqual(L.surveyDecision(once, okCtx, T0 + 31 * D).show, true);
    const twice = L.applyDismiss(once, T0 + 31 * D);
    assert.strictEqual(L.surveyDecision(twice, okCtx, T0 + 400 * D).reason, 'dismissed-twice');
  }],
  ['survey decision: submitted → done forever; home took this visit → skip once', () => {
    assert.strictEqual(L.surveyDecision(L.applySubmit({}), okCtx, T0).reason, 'done');
    const r = L.surveyDecision({}, withCtx({ homeOpen: true }), T0);
    assert.deepStrictEqual(r, { show: false, reason: 'home-took-it', skipVisit: true });
    const skipped = L.applySkip({}, 3);
    assert.strictEqual(L.surveyDecision(skipped, okCtx, T0).reason, 'skipped-this-visit');
    assert.strictEqual(L.surveyDecision(skipped, withCtx({ visits: { n: 4 } }), T0).show, true);
  }],
  ['a survey shown and ignored keeps its visit mark through a dismiss', () => {
    const shown = L.applySkip({}, 5);                       // recorded the moment it appears
    assert.strictEqual(L.surveyDecision(shown, withCtx({ visits: { n: 5 } }), T0).reason, 'skipped-this-visit');
    const dismissed = L.applyDismiss(shown, T0);
    assert.deepStrictEqual(dismissed, { skippedVisit: 5, dismissed: 1, dismissedAt: T0 });
  }],
  ['visibleClock counts only visible time and is due after 60 s of it', () => {
    const c = L.visibleClock(60000);
    c.set(true, T0);                         // tab visible at load
    assert.strictEqual(c.due(T0 + 59000), false);
    c.set(false, T0 + 20000);                // user switches away after 20 s
    assert.strictEqual(c.elapsed(T0 + 100000), 20000);
    c.set(true, T0 + 100000);                // back after 80 s away
    assert.strictEqual(c.due(T0 + 130000), false);   // 20 + 30 = 50 s
    assert.strictEqual(c.due(T0 + 140000), true);    // 20 + 40 = 60 s
  }],
  ['visibleClock ignores repeated same-state events', () => {
    const c = L.visibleClock(1000);
    c.set(true, T0); c.set(true, T0 + 500);
    assert.strictEqual(c.elapsed(T0 + 700), 700);
    c.set(false, T0 + 700); c.set(false, T0 + 900);
    assert.strictEqual(c.elapsed(T0 + 5000), 700);
  }],
];

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + (e.message || e)); }
}
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);

// scripts/test_room_logic.js — exercises tactical/room-logic.js under Node.
// Run: node scripts/test_room_logic.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'tactical', 'room-logic.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const R = window.TacticalRoomLogic;
const policy = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'room_policy_full.json'), 'utf8'));

const staff = { client: 'c-so', post: 'so', confirmed: true };
const slB = { client: 'c-slb', post: 'sl', squad: 'bravo', confirmed: true };
const slA = { client: 'c-sla', post: 'sl', squad: 'alpha', confirmed: true };
const ot = { client: 'c-ot', post: 'ot', confirmed: true };
const obs = { client: 'c-obs', post: 'observer', confirmed: true };
const knocking = { client: 'c-new', post: 'ftl', squad: 'bravo', confirmed: false };
const op = (over) => Object.assign({ cid: 'x', op: 'put', kind: 'marker', id: 'm1',
  data: { cat: 'enemy', label: 'ксено', x: 10, y: 20, level: 0, h: 'h1', layer: 'squad:bravo' } }, over);

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }

t('SL writes an enemy marker to its own squad layer', () => {
  assert.deepStrictEqual(R.canWrite(policy, slB, op()), { ok: true });
});
t('SL cannot write to another squad or the shared layer', () => {
  assert.strictEqual(R.canWrite(policy, slB, op({ data: { layer: 'squad:alpha', cat: 'enemy', x: 1, y: 1 } })).reason, 'layer');
  assert.strictEqual(R.canWrite(policy, slB, op({ data: { layer: 'shared', cat: 'plan', x: 1, y: 1 } })).reason, 'layer');
});
t('staff writes to shared; observer and unconfirmed members write nothing', () => {
  assert.strictEqual(R.canWrite(policy, staff, op({ data: { layer: 'shared', cat: 'plan', x: 1, y: 1 } })).ok, true);
  assert.strictEqual(R.canWrite(policy, obs, op()).reason, 'level');
  assert.strictEqual(R.canWrite(policy, knocking, op()).reason, 'unconfirmed');
});
t('requests: any confirmed post creates; asset owner or staff accepts; another squad cannot', () => {
  const req = { cid: 'r', op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 5, y: 6 }, layer: 'requests' } };
  assert.strictEqual(R.canWrite(policy, slB, req).ok, true);
  const accept = { cid: 'a', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } };
  const existing = { id: 'q1', kind: 'request', type: 'mortar', status: 'requested', by: { post: 'sl', squad: 'bravo', client: 'c-slb' } };
  assert.strictEqual(R.canWrite(policy, ot, accept, existing).ok, true);
  assert.strictEqual(R.canWrite(policy, staff, accept, existing).ok, true);
  assert.strictEqual(R.canWrite(policy, slA, accept, existing).reason, 'right');
  const cancel = { cid: 'c', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'denied', reason: 'снято' } };
  assert.strictEqual(R.canWrite(policy, slB, cancel, existing).ok, true, 'author cancels own request while requested');
});
t('applyOp: put, patch, del, tombstone wins, expectedStatus and transitions', () => {
  const s = R.createState();
  assert.strictEqual(R.applyOp(s, Object.assign(op(), { seq: 1, at: 1000, by: slB })).ok, true);
  assert.strictEqual(s.objects.m1.label, 'ксено');
  const p = R.applyOp(s, { seq: 2, at: 1100, by: slB, op: 'patch', kind: 'marker', id: 'm1', data: { label: 'два ксено' } });
  assert.strictEqual(p.ok, true); assert.strictEqual(s.objects.m1.label, 'два ксено'); assert.strictEqual(s.objects.m1.x, 10);
  assert.strictEqual(R.applyOp(s, { seq: 3, at: 1200, by: slB, op: 'del', kind: 'marker', id: 'm1' }).ok, true);
  assert.strictEqual(s.objects.m1.deleted, true);
  assert.strictEqual(R.applyOp(s, { seq: 4, at: 1300, by: slB, op: 'patch', kind: 'marker', id: 'm1', data: { label: 'воскрес' } }).reason, 'deleted');
  assert.strictEqual(R.applyOp(s, { seq: 5, at: 1400, by: slB, op: 'put', kind: 'marker', id: 'm1', data: { x: 1, y: 1 } }).reason, 'deleted');
  R.applyOp(s, { seq: 6, at: 2000, by: slB, op: 'put', kind: 'request', id: 'q1', data: { type: 'ob', target: { x: 1, y: 2 }, status: 'requested', layer: 'requests' } });
  assert.strictEqual(R.applyOp(s, { seq: 7, at: 2100, by: staff, op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'accepted', data: { status: 'firing' } }).reason, 'status');
  assert.strictEqual(R.applyOp(s, { seq: 8, at: 2200, by: staff, op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'done' } }).reason, 'transition');
  assert.strictEqual(R.applyOp(s, { seq: 9, at: 2300, by: staff, op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } }).ok, true);
  assert.strictEqual(s.seq, 9);
});
t('visible objects: tombstones, enemy expiry with confirm refresh, filters', () => {
  const s = R.createState();
  R.applyOp(s, { seq: 1, at: 0, by: slB, op: 'put', kind: 'marker', id: 'old', data: { cat: 'enemy', x: 1, y: 1, layer: 'squad:bravo' } });
  R.applyOp(s, { seq: 2, at: 500000, by: slB, op: 'put', kind: 'marker', id: 'fresh', data: { cat: 'enemy', x: 2, y: 2, layer: 'squad:bravo' } });
  R.applyOp(s, { seq: 3, at: 0, by: slB, op: 'put', kind: 'marker', id: 'kept', data: { cat: 'enemy', x: 3, y: 3, layer: 'squad:bravo', confirmedAt: 550000 } });
  R.applyOp(s, { seq: 4, at: 0, by: staff, op: 'put', kind: 'line', id: 'plan', data: { cat: 'plan', points: [[0, 0], [5, 5]], layer: 'shared' } });
  const now = 700000; // 700 s
  const ids = R.visibleObjects(s, policy, now).map(o => o.id).sort();
  assert.deepStrictEqual(ids, ['fresh', 'kept', 'plan']);
  assert.deepStrictEqual(R.visibleObjects(s, policy, now, { layers: ['shared'] }).map(o => o.id), ['plan']);
  assert.deepStrictEqual(R.visibleObjects(s, policy, now, { posts: ['sl'] }).map(o => o.id).sort(), ['fresh', 'kept']);
  assert.strictEqual(R.enemyAlpha(300, 600), 0.5);
  assert.strictEqual(R.enemyAlpha(590, 600), 0.25);
});
t('clock: offset from hello and countdown never negative', () => {
  const off = R.clockOffset(1000, 1200, 51100); // sent at 1000, got reply at 1200, server said 51100 at midpoint 1100
  assert.strictEqual(off, 50000);
  assert.strictEqual(R.serverNowEst(off, 1300), 51300);
  assert.strictEqual(R.countdown(60000, 51300), 8.7);
  assert.strictEqual(R.countdown(1000, 51300), 0);
});
t('deadlines from fork constants', () => {
  const c = { mortar: { impactDelay: 4.5, travelDelay: 4.5 }, ob: { cooldown: 500, timeline: { impact: 24 } } };
  assert.deepStrictEqual(R.deadlines('mortar', 10000, c, policy), { impactAt: 19000, readyAt: null });
  assert.deepStrictEqual(R.deadlines('ob', 10000, c, policy), { impactAt: 34000, readyAt: 534000 });
  assert.deepStrictEqual(R.deadlines('supply', 10000, c, policy), { impactAt: null, readyAt: 510000 });
  assert.deepStrictEqual(R.deadlines('dropship', 10000, c, policy), { impactAt: null, readyAt: 110000 });
});
t('text limits and control characters', () => {
  assert.strictEqual(R.cleanText('  a\u0007b   c  ', 40), 'ab c');
  assert.strictEqual(R.validateData(policy, 'marker', { label: 'x'.repeat(41), x: 1, y: 1 }), 'label');
  assert.strictEqual(R.validateData(policy, 'line', { points: new Array(65).fill([0, 0]) }), 'points');
  assert.strictEqual(R.validateData(policy, 'request', { note: 'y'.repeat(81), target: { x: 1, y: 1 }, type: 'ob' }), 'note');
  assert.strictEqual(R.validateData(policy, 'request', { type: 'nuke', target: { x: 1, y: 1 } }), 'type');
  assert.strictEqual(R.validateData(policy, 'marker', { label: 'ok', x: 1, y: 1 }), null);
});
t('entry parsing and codes', () => {
  assert.deepStrictEqual(R.parseEntry(' k7m4q2 '), { code: 'K7M4Q2', postCode: null });
  assert.deepStrictEqual(R.parseEntry('K7M4Q2-SKB7'), { code: 'K7M4Q2', postCode: 'SKB7' });
  assert.strictEqual(R.parseEntry('K7M4Q2-SLB7-X'), null);
  assert.strictEqual(R.parseEntry('K70O1I'), null, 'O, 0, 1, I are not in the alphabet');
  const code = R.randomCode(6, () => 0.5);
  assert.strictEqual(code.length, 6);
  assert.ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code));
});
t('level style resolves the squad colour and the enemy signature', () => {
  assert.deepStrictEqual(R.levelStyle(policy, slB), { width: 2.5, dash: [], marker: 'diamond', color: '#f1c40f', level: 'squad' });
  assert.deepStrictEqual(R.levelStyle(policy, staff), { width: 4, dash: [], marker: 'square', color: '#f5f5f5', level: 'staff' });
  assert.strictEqual(R.markerShape(policy, { cat: 'enemy' }, slB), 'triangle');
});
t('polling cadence and room clocks', () => {
  assert.strictEqual(R.retryAfter(1000, 30000), 2);
  assert.strictEqual(R.retryAfter(1000, 70000), 10);
  const d = R.roomDeadlines(policy, 0, false);
  assert.deepStrictEqual(d, { maxAt: 10800000, warnAt: 9600000 });
  assert.deepStrictEqual(R.roomDeadlines(policy, 0, true), { maxAt: 14400000, warnAt: 13200000 });
  assert.strictEqual(R.idleLocked(policy, 0, 480000), true);
  assert.strictEqual(R.idleLocked(policy, 0, 479999), false);
  assert.strictEqual(R.memberStale(policy, 0, 600000), true);
});
t('pending queue merge drops acknowledged ops', () => {
  const pending = [{ cid: 'a' }, { cid: 'b' }, { cid: 'c' }];
  assert.deepStrictEqual(R.mergePending(pending, ['a', 'c']).map(o => o.cid), ['b']);
});
t('ordnance loader, claimed crews, CAS pilot, anyone confirms an enemy mark', () => {
  const ob = { id: 'q9', kind: 'request', type: 'ob', status: 'accepted', by: { client: 'c-slb', post: 'sl', squad: 'bravo' } };
  const load = { cid: 'l', op: 'patch', kind: 'request', id: 'q9', expectedStatus: 'accepted', data: { status: 'loaded' } };
  assert.strictEqual(R.canWrite(policy, ot, load, ob).ok, true, 'OT loads the OB');
  assert.strictEqual(R.canWrite(policy, slB, load, ob).reason, 'right');
  const crew = { client: 'c-ftl', post: 'ftl', squad: 'alpha', confirmed: true, functions: ['mortar'] };
  const mortarReq = { id: 'q8', kind: 'request', type: 'mortar', status: 'requested', by: { client: 'c-slb', post: 'sl', squad: 'bravo' } };
  const accept = { cid: 'a', op: 'patch', kind: 'request', id: 'q8', expectedStatus: 'requested', data: { status: 'accepted' } };
  assert.strictEqual(R.canWrite(policy, crew, accept, mortarReq).reason, 'right');
  const objects = { m: { id: 'm', kind: 'asset', type: 'mortar', claimedBy: 'c-ftl' } };
  assert.deepStrictEqual(R.claimants(objects, mortarReq), ['c-ftl']);
  assert.strictEqual(R.canWrite(policy, crew, accept, mortarReq, { claimed: R.claimants(objects, mortarReq) }).ok, true);
  const claim = { cid: 'c', op: 'patch', kind: 'asset', id: 'm', data: { claimedBy: 'c-ftl' } };
  const asset = { id: 'm', kind: 'asset', type: 'mortar', owner: { post: 'ot' } };
  assert.strictEqual(R.canWrite(policy, crew, claim, asset).ok, true, 'a labelled crew member claims');
  assert.strictEqual(R.canWrite(policy, slB, claim, asset).reason, 'right', 'an unlabelled squad member does not');
  const pilot = { client: 'c-pilot', post: 'pilot', confirmed: true };
  const cas = { id: 'q7', kind: 'request', type: 'cas', status: 'requested', by: { client: 'c-slb', post: 'sl', squad: 'bravo' } };
  assert.strictEqual(R.canWrite(policy, pilot, { cid: 'p', op: 'patch', kind: 'request', id: 'q7', expectedStatus: 'requested', data: { status: 'accepted' } }, cas).ok, true);
  const enemy = { id: 'e', kind: 'marker', cat: 'enemy', layer: 'squad:bravo', by: { client: 'c-slb', post: 'sl', squad: 'bravo' } };
  assert.strictEqual(R.canWrite(policy, staff, { cid: 's', op: 'patch', kind: 'marker', id: 'e', data: { confirmedAt: 5 } }, enemy).ok, true);
  assert.strictEqual(R.canWrite(policy, staff, { cid: 's', op: 'patch', kind: 'marker', id: 'e', data: { label: 'x' } }, enemy).reason, 'layer');
});
t('request actions by post and state', () => {
  const by = { client: 'c-slb', post: 'sl', squad: 'bravo' };
  const req = (type, status) => ({ id: 'r', kind: 'request', type, status, by });
  const pilot = { client: 'c-pilot', post: 'pilot', confirmed: true };
  assert.deepStrictEqual(R.requestActions(policy, slB, req('mortar', 'requested')), ['cancel']);
  assert.deepStrictEqual(R.requestActions(policy, ot, req('mortar', 'requested')), ['accept', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, ot, req('mortar', 'accepted')), ['take', 'done', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, ot, req('ob', 'accepted')), ['load']);
  assert.deepStrictEqual(R.requestActions(policy, staff, req('ob', 'accepted')), ['load', 'done', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, staff, req('ob', 'loaded')), ['fire', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, pilot, req('cas', 'accepted')), ['fire', 'done', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, slB, req('supply', 'done')), ['repeat']);
  assert.deepStrictEqual(R.requestActions(policy, knocking, req('mortar', 'requested')), []);
});
t('geometry: simplify, smooth segments, snap', () => {
  assert.deepStrictEqual(R.simplify([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], 0.5, 64), [[0, 0], [4, 0]]);
  assert.deepStrictEqual(R.simplify([[0, 0], [2, 2], [4, 0]], 0.5, 64), [[0, 0], [2, 2], [4, 0]]);
  const noisy = Array.from({ length: 300 }, (_, i) => [i, Math.sin(i) * 3]);
  assert.ok(R.simplify(noisy, 0.2, 64).length <= 64);
  assert.deepStrictEqual(R.smoothSegments([[0, 0], [3, 0], [6, 0]]), [[0.5, 0, 2, 0, 3, 0], [4, 0, 5.5, 0, 6, 0]]);
  assert.deepStrictEqual(R.snapPoints([[0.2, 0.9], [0.7, 0.1], [1.5, -0.5]]), [[0, 0], [1, -1]]);
});
t('stage 1: position requests go to the mortar owner; the author never accepts their own request', () => {
  const pos = { id: 'p', kind: 'request', type: 'position', status: 'requested', by: { client: 'c-so', post: 'so', squad: null } };
  assert.strictEqual(R.validateData(policy, 'request', { type: 'position', target: { x: 1, y: 2 } }), null);
  assert.deepStrictEqual(R.requestActions(policy, ot, pos), ['accept', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, staff, pos), ['cancel']);
  assert.deepStrictEqual(R.requestActions(policy, ot, Object.assign({}, pos, { status: 'accepted' })), ['place', 'done', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, staff, Object.assign({}, pos, { type: 'mortar', status: 'accepted' })), ['done', 'deny']);
});
console.log('OK', n, 'groups');

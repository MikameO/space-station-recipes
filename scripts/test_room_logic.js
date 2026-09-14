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
  // slB wrote this request: since the v2 write contract the author gets 'author', a squad leader who is not gets 'right'.
  assert.strictEqual(R.canWrite(policy, slB, load, ob).reason, 'author');
  assert.strictEqual(R.canWrite(policy, slA, load, ob).reason, 'right');
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
  // Changed with the v2 write contract (K2): the staff author no longer carries out an accepted request, only recalls it.
  assert.deepStrictEqual(R.requestActions(policy, staff, Object.assign({}, pos, { type: 'mortar', status: 'accepted' })), ['cancel']);
});

// ── v2 write contract on the shipping Stage 1 policy ─────────────────────
const stage1 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tactical', 'policy', 'stories_cm.json'), 'utf8'));
const soAuthor = { client: 'c-so-author', post: 'so', confirmed: true };
const soOther = { client: 'c-so-other', post: 'so', confirmed: true };
const crewM = { client: 'c-mortar', post: 'mortar', confirmed: true };
const watcher = { client: 'c-watch', post: 'observer', confirmed: true };
const byOf = m => ({ client: m.client, post: m.post, squad: m.squad || null });
const ch = String.fromCharCode;

// A Stage 1 room: the seeded mortar and one request by the authoring staff officer, forced into `status`.
function stage1State(type, status) {
  const s = R.createState();
  R.applyOp(s, { seq: 1, at: 1000, by: { client: 'room', post: 'system', squad: null }, op: 'put', kind: 'asset', id: 'asset-mortar-1',
    data: { type: 'mortar', n: 1, owner: { post: 'mortar' }, state: null, notes: '', claimedBy: null } });
  const put = { type, target: { x: 62, y: -62 }, note: 'гнездо', priority: 'urgent', flags: [], level: 0, h: 'ee8dd1d6d4a4' };
  R.applyOp(s, { seq: 2, at: 2000, by: byOf(soAuthor), op: 'put', kind: 'request', id: 'q1', data: R.stampData('request', 'put', put, byOf(soAuthor), 2000) });
  s.objects.q1.status = status;
  return s;
}

// The ops tactical/room-requests.js sends for each button; «Развёрнут» on a position request also moves the mortar.
function buttonOps(action, req) {
  const patch = data => ({ op: 'patch', kind: 'request', id: req.id, expectedStatus: req.status, data });
  switch (action) {
    case 'accept': return [patch({ status: 'accepted' })];
    case 'deny': return [patch({ status: 'denied', reason: 'нет снарядов' })];
    case 'cancel': return [patch({ status: 'denied' })];
    case 'take': case 'fire': return [patch({ status: 'firing' })];
    case 'load': return [patch({ status: 'loaded' })];
    case 'done': return [patch({ status: 'done' })];
    case 'place': return [patch({ status: 'done' }), { op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { tile: [req.target.x, req.target.y], state: 'deployed' } }];
    case 'repeat': return [{ op: 'put', kind: 'request', id: req.id + 'again', data: { type: req.type, target: { x: req.target.x, y: req.target.y },
      note: req.note, priority: req.priority, flags: req.flags, level: 0, h: 'ee8dd1d6d4a4' } }];
  }
  throw new Error('no op for button ' + action);
}

t('stage 1 property: every button a member gets is an op the room validates, allows and applies', () => {
  let pressed = 0;
  for (const member of [soAuthor, soOther, crewM, watcher]) {
    for (const type of ['mortar', 'position']) {
      for (const status of Object.keys(R.REQUEST_FLOW)) {
        const card = stage1State(type, status);
        for (const action of R.requestActions(stage1, member, card.objects.q1, { claimed: R.claimants(card.objects, card.objects.q1) })) {
          const s = stage1State(type, status);
          for (const raw of buttonOps(action, s.objects.q1)) {
            const where = `${member.client} ${type}/${status} ${action} ${raw.kind}`;
            const existing = s.objects[raw.id];
            const data = R.cleanData(stage1, raw.kind, raw.op, raw.data);
            assert.strictEqual(raw.op === 'put' ? R.validateData(stage1, raw.kind, data) : R.validatePatch(stage1, raw.kind, data, existing), null, where + ' validates');
            assert.deepStrictEqual(R.canWrite(stage1, member, Object.assign({}, raw, { data }), existing, { claimed: R.claimants(s.objects, existing) }), { ok: true }, where + ' is allowed');
            R.stampData(raw.kind, raw.op, data, byOf(member), 5000);
            assert.deepStrictEqual(R.applyOp(s, Object.assign({}, raw, { seq: s.seq + 1, at: 5000, by: byOf(member), data })), { ok: true }, where + ' applies');
            pressed++;
          }
        }
      }
    }
  }
  // author 4 + 4 (cancel ×2, repeat ×2 per type); other staff officer and crew 8 + 9 each («Развёрнут» is two ops); observer 0.
  assert.strictEqual(pressed, 42, 'ops sent across the grid');
});

t('stage 1 buttons by role: the author withdraws or recalls, the crew carries out, the observer has none', () => {
  const card = (type, status) => stage1State(type, status).objects.q1;
  assert.deepStrictEqual(R.requestActions(stage1, soAuthor, card('mortar', 'requested')), ['cancel']);
  assert.deepStrictEqual(R.requestActions(stage1, soAuthor, card('mortar', 'accepted')), ['cancel']);
  assert.deepStrictEqual(R.requestActions(stage1, soAuthor, card('mortar', 'firing')), []);
  assert.deepStrictEqual(R.requestActions(stage1, soAuthor, card('position', 'done')), ['repeat']);
  assert.deepStrictEqual(R.requestActions(stage1, soOther, card('mortar', 'accepted')), ['take', 'done', 'deny']);
  assert.deepStrictEqual(R.requestActions(stage1, crewM, card('position', 'requested')), ['accept', 'deny']);
  assert.deepStrictEqual(R.requestActions(stage1, crewM, card('position', 'accepted')), ['place', 'done', 'deny']);
  assert.deepStrictEqual(R.requestActions(stage1, crewM, card('mortar', 'firing')), ['done']);
  for (const status of Object.keys(R.REQUEST_FLOW)) assert.deepStrictEqual(R.requestActions(stage1, watcher, card('mortar', status)), []);
  const nameless = { post: 'mortar', confirmed: true };
  assert.deepStrictEqual(R.requestActions(stage1, nameless, Object.assign(card('mortar', 'accepted'), { by: { post: 'so' } })), ['take', 'done', 'deny'],
    'a member without a client id is never taken for the author');
  const accept = { op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } };
  assert.strictEqual(R.canWrite(stage1, soAuthor, accept, card('mortar', 'requested')).reason, 'author');
  assert.strictEqual(R.canWrite(stage1, watcher, accept, card('mortar', 'requested')).reason, 'level');
});

t('validatePatch: allowlists and typed values for requests, assets, calibration and members', () => {
  const asset = { id: 'asset-mortar-1', kind: 'asset', type: 'mortar' };
  for (const data of [{ tile: [20, -98], state: 'deployed' }, { state: 'moving' }, { state: null }, { claimedBy: 'c-mortar' }, { claimedBy: null },
    { shell: 'RMCMortarShellHE', radius: 5.35 }, { shell: null, radius: null }, { notes: 'у ворот' }, { label: 'М-1' }]) {
    assert.strictEqual(R.validatePatch(stage1, 'asset', data, asset), null, JSON.stringify(data));
  }
  assert.strictEqual(R.validatePatch(stage1, 'asset', { radius: '<img src=x onerror=alert(1)>' }, asset), 'radius');
  assert.strictEqual(R.validatePatch(stage1, 'asset', { radius: 0 }, asset), 'radius');
  assert.strictEqual(R.validatePatch(stage1, 'asset', { radius: 101 }, asset), 'radius');
  assert.strictEqual(R.validatePatch(stage1, 'asset', { tile: 'nope' }, asset), 'tile');
  assert.strictEqual(R.validatePatch(stage1, 'asset', { tile: [1.5, 2] }, asset), 'tile');
  assert.strictEqual(R.validatePatch(stage1, 'asset', { state: 'on_lz' }, asset), 'state', 'a dropship state is not a mortar state');
  assert.strictEqual(R.validatePatch(stage1, 'asset', { state: 'on_lz' }), null, 'without the object any known state passes');
  assert.strictEqual(R.validatePatch(stage1, 'asset', { state: '<b>' }), 'state');
  assert.strictEqual(R.validatePatch(stage1, 'asset', { shell: 'x'.repeat(41) }, asset), 'shell');
  assert.strictEqual(R.validatePatch(stage1, 'asset', { claimedBy: 'c-mortar', state: 'deployed' }, asset), 'fields', 'a claim travels alone');
  assert.strictEqual(R.validatePatch(stage1, 'asset', { owner: { post: 'so' } }, asset), 'fields');
  for (const data of [{ status: 'accepted' }, { status: 'denied', reason: 'нет снарядов' }, { note: 'ближе' }, { flags: ['beacon'] }, { priority: 'normal' }, { relayed: true }]) {
    assert.strictEqual(R.validatePatch(stage1, 'request', data), null, JSON.stringify(data));
  }
  assert.strictEqual(R.validatePatch(stage1, 'request', { note: 'ближе', target: { x: 1, y: 1 } }), 'fields', 'a note patch never moves the target');
  assert.strictEqual(R.validatePatch(stage1, 'request', { status: 'exploded' }), 'status');
  assert.strictEqual(R.validatePatch(stage1, 'request', { reason: 'y'.repeat(81) }), 'reason');
  assert.strictEqual(R.validatePatch(stage1, 'request', { flags: ['beacon', '<i>'] }), 'flags');
  assert.strictEqual(R.validatePatch(stage1, 'request', { priority: '<i>' }), 'priority');
  assert.strictEqual(R.validatePatch(stage1, 'request', {}), 'fields');
  assert.strictEqual(R.validatePatch(stage1, 'calibration', { offset: [212, -148] }), null);
  assert.strictEqual(R.validatePatch(stage1, 'calibration', { offset: 'abc' }), 'offset');
  assert.strictEqual(R.validateData(stage1, 'calibration', { offset: [1, NaN] }), 'offset');
  assert.strictEqual(R.validatePatch(stage1, 'member', { presentAt: 1 }), null);
  assert.strictEqual(R.validatePatch(stage1, 'member', { confirmed: true }), 'fields');
});

t('validateData and cleanData: the Stage 1 request put, server fields and stamps', () => {
  const put = { type: 'mortar', target: { x: 62, y: -62 }, note: 'гнездо', priority: 'urgent', flags: [], level: 0, h: 'ee8dd1d6d4a4' };
  const variant = over => R.validateData(stage1, 'request', Object.assign({}, put, over));
  assert.strictEqual(variant({}), null);
  assert.strictEqual(variant({ type: 'position' }), null);
  assert.strictEqual(variant({ type: 'other' }), null);
  assert.strictEqual(variant({ type: 'ob' }), 'type', 'no OB asset in Stage 1');
  assert.strictEqual(variant({ target: { x: 1.5, y: 2 } }), 'target');
  assert.strictEqual(variant({ target: { x: 5000, y: 2 } }), 'target');
  assert.strictEqual(variant({ priority: '<i>' }), 'priority');
  assert.strictEqual(variant({ flags: new Array(9).fill('beacon') }), 'flags');
  assert.strictEqual(variant({ level: 'x' }), 'level');
  assert.strictEqual(variant({ h: 'h'.repeat(41) }), 'h');
  assert.strictEqual(variant({ deadlineAt: 'soon' }), 'fields');
  const raw = Object.assign({}, put, { status: 'done', layer: 'shared', acceptedBy: { client: 'x' }, firedAt: 5,
    target: { x: 62, y: -62, extra: '<b>' }, note: ' гнездо\nу ворот' + ch(0x200b) + ' ' });
  const clean = R.cleanData(stage1, 'request', 'put', raw);
  assert.deepStrictEqual(clean.target, { x: 62, y: -62 });
  assert.strictEqual(clean.note, 'гнездо у ворот');
  for (const k of ['status', 'layer', 'acceptedBy', 'firedAt']) assert.ok(!(k in clean), k + ' is dropped');
  assert.strictEqual(R.validateData(stage1, 'request', clean), null);
  assert.strictEqual(R.stampData('request', 'put', clean, byOf(soAuthor), 7000).status, 'requested');
  const polluted = R.cleanData(stage1, 'request', 'put', JSON.parse('{"__proto__":{"polluted":1},"constructor":1,"type":"mortar"}'));
  assert.strictEqual(Object.getPrototypeOf(polluted), Object.prototype);
  assert.deepStrictEqual(Object.keys(polluted), ['type']);
  const accept = R.stampData('request', 'patch', R.cleanData(stage1, 'request', 'patch', { status: 'accepted', acceptedBy: { client: 'forged' } }), byOf(crewM), 8000);
  assert.deepStrictEqual(accept, { status: 'accepted', acceptedBy: byOf(crewM) });
  const confirm = R.stampData('marker', 'patch', R.cleanData(stage1, 'marker', 'patch', { confirmedAt: 99999999999 }), byOf(soAuthor), 9000);
  assert.deepStrictEqual(confirm, { confirmedAt: 9000 }, 'confirmedAt is the server time whatever the client sent');
});

t('a put over a live object: duplicate for its author, exists for anyone else; calibration is re-published', () => {
  const s = stage1State('mortar', 'requested');
  const again = { op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 1, y: 1 } } };
  assert.strictEqual(R.canWrite(stage1, soAuthor, again, s.objects.q1).reason, 'duplicate');
  assert.strictEqual(R.canWrite(stage1, crewM, again, s.objects.q1).reason, 'exists');
  assert.strictEqual(R.canWrite(stage1, soOther, { op: 'put', kind: 'asset', id: 'asset-mortar-1', data: { type: 'mortar' } }, s.objects['asset-mortar-1']).reason, 'exists');
  R.applyOp(s, { seq: 3, at: 3000, by: byOf(soAuthor), op: 'del', kind: 'request', id: 'q1' });
  assert.strictEqual(R.canWrite(stage1, soAuthor, again, s.objects.q1).reason, 'deleted');
  const cal = { op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [212, -148] } };
  R.applyOp(s, Object.assign({ seq: 4, at: 4000, by: byOf(crewM) }, cal));
  assert.deepStrictEqual(R.canWrite(stage1, soAuthor, cal, s.objects.calibration), { ok: true });
  assert.strictEqual(R.applyOp(s, Object.assign({ seq: 5, at: 5000, by: byOf(soAuthor) }, cal, { data: { offset: [213, -148] } })).ok, true);
  assert.deepStrictEqual(s.objects.calibration.offset, [213, -148]);
  // applyOp itself still replays a put over a live object: the log stays the truth.
  assert.strictEqual(R.applyOp(s, { seq: 6, at: 6000, by: byOf(soAuthor), op: 'put', kind: 'marker', id: 'mk', data: { x: 1, y: 1 } }).ok, true);
  assert.strictEqual(R.applyOp(s, { seq: 7, at: 7000, by: byOf(soAuthor), op: 'put', kind: 'marker', id: 'mk', data: { x: 2, y: 2 } }).ok, true);
  // Changed: a prototype name is refused as an id before any lookup.
  assert.strictEqual(R.applyOp(s, { seq: 8, at: 8000, by: byOf(soAuthor), op: 'patch', kind: 'marker', id: 'constructor', data: { x: 1 } }).reason, 'id',
    'object ids never reach Object.prototype');
});

t('request patches: relayed by anyone, note, flags and priority by the author or staff, other keys refused', () => {
  const req = stage1State('mortar', 'accepted').objects.q1;
  const p = data => ({ op: 'patch', kind: 'request', id: 'q1', data });
  assert.deepStrictEqual(R.canWrite(stage1, crewM, p({ relayed: true }), req), { ok: true });
  assert.strictEqual(R.canWrite(stage1, crewM, p({ note: 'x' }), req).reason, 'right');
  assert.deepStrictEqual(R.canWrite(stage1, soAuthor, p({ note: 'x', priority: 'normal' }), req), { ok: true });
  assert.deepStrictEqual(R.canWrite(stage1, soOther, p({ flags: ['beacon'] }), req), { ok: true });
  assert.strictEqual(R.canWrite(stage1, soAuthor, p({ reason: 'x' }), req).reason, 'fields');
  assert.strictEqual(R.canWrite(stage1, soAuthor, p({ status: 'denied', note: 'x' }), req).reason, 'fields');
  assert.strictEqual(R.canWrite(stage1, crewM, p({ status: 'loaded' }), req).reason, 'transition', 'only an OB is loaded');
  assert.deepStrictEqual(R.canWrite(stage1, soAuthor, p({ status: 'denied' }), req), { ok: true }, 'the author recalls an accepted request');
  assert.strictEqual(R.canWrite(stage1, soAuthor, p({ status: 'done' }), req).reason, 'author');
  assert.strictEqual(R.hasRight(policy, slB, 'acceptRequest', { kind: 'request', type: 'mortar', claimedBy: slB.client }), false, 'a claim counts on the asset only');
  assert.strictEqual(R.hasRight(policy, slB, 'acceptRequest', { kind: 'asset', type: 'mortar', claimedBy: slB.client }), true);
});

t('claims: only on claimable assets, only for oneself, cleared by the holder or staff', () => {
  const crew = { client: 'c-ftl', post: 'ftl', squad: 'alpha', confirmed: true, functions: ['mortar'] };
  const asset = { id: 'm', kind: 'asset', type: 'mortar', owner: { post: 'ot' }, claimedBy: null };
  const claim = v => ({ op: 'patch', kind: 'asset', id: 'm', data: { claimedBy: v } });
  assert.deepStrictEqual(R.canWrite(policy, crew, claim('c-ftl'), asset), { ok: true });
  assert.strictEqual(R.canWrite(policy, crew, claim('c-other'), asset).reason, 'right');
  const held = Object.assign({}, asset, { claimedBy: 'c-ftl' });
  assert.deepStrictEqual(R.canWrite(policy, crew, claim(null), held), { ok: true });
  assert.strictEqual(R.canWrite(policy, ot, claim(null), held).reason, 'right');
  assert.deepStrictEqual(R.canWrite(policy, staff, claim(null), held), { ok: true });
  assert.strictEqual(R.canWrite(policy, crew, { op: 'patch', kind: 'asset', id: 'm', data: { claimedBy: 'c-ftl', state: 'deployed' } }, asset).reason, 'fields');
  const mortar1 = stage1State('mortar', 'requested').objects['asset-mortar-1'];
  assert.strictEqual(R.canWrite(stage1, crewM, { op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { claimedBy: crewM.client } }, mortar1).reason, 'right',
    'the Stage 1 mortar is not claimable');
  assert.strictEqual(R.canWrite(stage1, soOther, { op: 'put', kind: 'asset', id: 'asset-mortar-9', data: { type: 'mortar' } }).reason, 'right', 'assets come from the policy');
});

t('cleanText, parseEntry and deadlines at their edges', () => {
  assert.strictEqual(R.cleanText('первая\nвторая\r\nтретья\tчетвёртая', 80), 'первая вторая третья четвёртая');
  assert.strictEqual(R.cleanText('a' + ch(0x85) + 'b' + ch(0x200b) + 'c' + ch(0x202e) + 'd' + ch(0x2066) + 'e' + ch(0xfeff) + 'f' + ch(0) + 'g', 80), 'abcdefg');
  const smile = ch(0xd83d, 0xde00);
  assert.strictEqual(R.cleanText(smile.repeat(5), 3), smile.repeat(3), 'cut by code points, never inside a pair');
  assert.strictEqual(R.cleanText('ab cd', 3), 'ab');
  assert.strictEqual(R.validateData(stage1, 'marker', { label: smile.repeat(40), x: 1, y: 1 }), null, '40 code points fit a 40-character label');
  assert.strictEqual(R.parseEntry('K7M4Q'), null, 'a room code is six characters');
  assert.strictEqual(R.parseEntry('K7M4Q2X'), null);
  assert.strictEqual(R.parseEntry('K7M4Q2-SKB'), null, 'a post code is four characters');
  assert.strictEqual(R.parseEntry('K7M4Q2-SKB77'), null);
  assert.strictEqual(R.parseEntry('K7M4Q2-'), null);
  assert.deepStrictEqual(R.parseEntry('k7m4q2-skb7'), { code: 'K7M4Q2', postCode: 'SKB7' });
  const none = { impactAt: null, readyAt: null };
  assert.deepStrictEqual(R.deadlines('mortar', 10000, {}, stage1), none);
  assert.deepStrictEqual(R.deadlines('mortar', 10000, null, stage1), none);
  assert.deepStrictEqual(R.deadlines('ob', 10000, { mortar: { travelDelay: 1, impactDelay: 1 } }, stage1), none);
});
t('final review: prototype and borrowed calibration ids are refused, loops read own keys only, events make no object, the author stops at accepted', () => {
  const put = id => ({ seq: 1, at: 1000, by: byOf(soAuthor), op: 'put', kind: 'request', id, data: { type: 'mortar', target: { x: 1, y: 1 }, markerId: null } });
  for (const id of ['__proto__', 'constructor', 'prototype']) {
    const s = R.createState();
    assert.deepStrictEqual(R.applyOp(s, put(id)), { ok: false, reason: 'id' }, id);
    assert.strictEqual(Object.getPrototypeOf(s.objects), Object.prototype, id + ' leaves the prototype alone');
    assert.strictEqual(R.applyOp(s, { seq: 2, at: 1000, by: byOf(soAuthor), op: 'del', kind: 'request', id }).reason, 'id');
    assert.deepStrictEqual([s.seq, Object.keys(s.objects)], [0, []]);
    assert.doesNotThrow(() => R.claimants(s.objects, { kind: 'request', type: 'mortar' }));
  }
  assert.deepStrictEqual([R.idError('marker', 'calibration'), R.idError('request', 'calibration'), R.idError('calibration', 'calibration'), R.idError('request', 'q1'), R.idError('request', 5)],
    ['id', 'id', null, null, 'id']);
  const s = stage1State('mortar', 'requested');
  assert.strictEqual(R.applyOp(s, Object.assign(put('calibration'), { seq: 3 })).reason, 'id', 'a request never takes the calibration id');
  assert.strictEqual(s.objects.calibration, undefined);
  // Own keys only: an enumerable key on Object.prototype adds no claimant and no visible object.
  Object.prototype.ghost = { id: 'ghost', kind: 'asset', type: 'mortar', claimedBy: 'c-ghost', seq: 99, at: 0, layer: 'assets' };
  try {
    assert.deepStrictEqual(R.claimants(s.objects, s.objects.q1), []);
    assert.deepStrictEqual(R.visibleObjects(s, stage1, 3000).map(o => o.id), ['asset-mortar-1', 'q1']);
  } finally {
    delete Object.prototype.ghost;
  }
  const keys = Object.keys(s.objects).join();
  const SYS = { client: 'room', post: 'system', squad: null };
  assert.deepStrictEqual(R.applyOp(s, { seq: 4, at: 4000, by: SYS, op: 'put', kind: 'event', id: 'evt-4', data: { event: 'lock' } }), { ok: true });
  assert.deepStrictEqual([s.seq, Object.keys(s.objects).join(), R.visibleObjects(s, stage1, 4000).length], [4, keys, 2], 'an event moves seq and makes no object');
  assert.strictEqual(R.applyOp(s, { seq: 5, at: 5000, by: SYS, op: 'patch', kind: 'event', id: 'evt-4', data: {} }).reason, 'op', 'events are puts only');
  const deny = { op: 'patch', kind: 'request', id: 'q1', data: { status: 'denied' } };
  for (const status of ['loaded', 'firing']) {
    const req = stage1State('mortar', status).objects.q1;
    assert.strictEqual(R.canWrite(stage1, soAuthor, deny, req, { claimed: [] }).reason, 'author', 'the author no longer withdraws a request that is ' + status);
    assert.deepStrictEqual(R.canWrite(stage1, soOther, deny, req, { claimed: [] }), { ok: true }, 'another staff officer still recalls it when ' + status);
  }
});

t('stage 2a: member position and calibration, the heartbeat, addressed requests and tasks, the room calibration', () => {
  // A member's own patch.
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, { pos: { x: 30, y: -90, level: 0 } }), null);
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, { pos: null, cal: [12, -5] }), null);
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, { cal: null, presentAt: 1 }), null);
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, {}), 'fields');
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, { posAt: 5 }), 'fields', 'the server stamps posAt');
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, { pos: { x: 1.5, y: 2 } }), 'pos');
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, { pos: { x: 1, y: 99999 } }), 'pos');
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, { pos: { x: 1, y: 2, level: 0.5 } }), 'pos');
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, { pos: [1, 2] }), 'pos');
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, { cal: [1] }), 'cal');
  assert.strictEqual(R.validateMemberPatch(stage1, watcher, { pos: { x: 1, y: 2 } }), 'level', 'an observer shares no position');
  assert.strictEqual(R.validateMemberPatch(stage1, watcher, { cal: [1, 2] }), 'level');
  assert.strictEqual(R.validateMemberPatch(stage1, watcher, { presentAt: 1 }), null);
  const cleaned = R.cleanData(stage1, 'member', 'patch', { pos: { x: 3, y: 4, colour: 'red' }, posAt: 1 });
  assert.deepStrictEqual(cleaned.pos, { x: 3, y: 4 });
  assert.strictEqual(R.validatePatch(stage1, 'member', cleaned), 'fields', 'posAt from a client is refused');
  assert.strictEqual(R.stampData('member', 'patch', { pos: { x: 3, y: 4 } }, byOf(crewM), 7000).posAt, 7000);
  assert.strictEqual(R.stampData('member', 'patch', { pos: null }, byOf(crewM), 7100).posAt, 7100, 'clearing is stamped too');
  assert.strictEqual(R.stampData('member', 'patch', { cal: null }, byOf(crewM), 7200).posAt, undefined);
  const hb = (op, kind, data) => R.isHeartbeat({ op, kind, id: 'm', data });
  assert.deepStrictEqual([hb('patch', 'member', { presentAt: 1 }), hb('patch', 'member', { presentAt: 1, pos: null }), hb('patch', 'member', { cal: null }),
    hb('put', 'member', { presentAt: 1 }), hb('patch', 'request', { presentAt: 1 }), R.isHeartbeat(null)], [true, false, false, false, false, false]);

  // Requests with an addressee, and tasks.
  const req = over => Object.assign({ target: { x: 1, y: 2 }, note: '', priority: 'normal', flags: [] }, over);
  assert.strictEqual(R.validateData(stage1, 'request', req({ type: 'mortar', to: { post: 'mortar' } })), null);
  assert.strictEqual(R.validateData(stage1, 'request', req({ type: 'mortar', to: { post: 'so' } })), 'to', 'a strike goes to the mortar post only');
  assert.strictEqual(R.validateData(stage1, 'request', req({ type: 'mortar', to: { client: 'c-mortar' } })), null);
  assert.strictEqual(R.validateData(stage1, 'request', req({ type: 'position', to: { post: 'so' } })), null);
  for (const bad of [{ post: 'observer' }, { post: 'nobody' }, { client: '' }, { client: 'x'.repeat(65) }, { client: 'x', post: 'so' }, 'mortar', [], { post: 'mortar', squad: 'alpha' }]) {
    assert.strictEqual(R.validateData(stage1, 'request', req({ type: 'position', to: bad })), 'to', JSON.stringify(bad));
  }
  assert.strictEqual(R.validateData(policy, 'request', req({ type: 'position', to: { post: 'sl', squad: 'alpha' } })), null, 'the full policy has squads');
  assert.strictEqual(R.validateData(policy, 'request', req({ type: 'position', to: { post: 'sl', squad: 'zulu' } })), 'to');
  const task = { type: 'task', note: 'держать мост', to: { post: 'mortar' }, priority: 'normal', flags: [] };
  assert.strictEqual(R.validateData(stage1, 'request', task), null, 'a task needs no map point');
  assert.strictEqual(R.validateData(stage1, 'request', Object.assign({}, task, { target: { x: 5, y: 6 } })), null);
  assert.strictEqual(R.validateData(stage1, 'request', Object.assign({}, task, { target: { x: 5.5, y: 6 } })), 'target');
  const { to: dropped, ...noAddressee } = task;
  assert.ok(dropped);
  assert.strictEqual(R.validateData(stage1, 'request', noAddressee), 'to', 'a task names its addressee');
  assert.strictEqual(R.validateData(stage1, 'request', Object.assign({}, task, { note: '   ' })), 'note', 'and says what to do');
  assert.strictEqual(R.validateData(stage1, 'request', { type: 'mortar', note: '', priority: 'normal', flags: [] }), 'target', 'other types still need a point');
  assert.strictEqual(R.validatePatch(stage1, 'request', { to: { post: 'so' } }), 'fields', 'the addressee is set once, at creation');
  assert.deepStrictEqual(R.cleanData(stage1, 'request', 'put', { type: 'task', to: { post: 'mortar', extra: 1 } }).to, { post: 'mortar' });

  // Who acts on an addressed request.
  const crew2 = { client: 'c-mortar-2', post: 'mortar', confirmed: true };
  const toMember = Object.assign(stage1State('mortar', 'requested').objects.q1, { to: { client: 'c-mortar-2' } });
  assert.deepStrictEqual([R.isAddressee(toMember, crew2), R.isAddressee(toMember, crewM), R.isAddressee({}, crew2), R.isAddressee(toMember, null)], [true, false, false, false]);
  assert.deepStrictEqual(R.requestActions(stage1, crewM, toMember, { claimed: [] }), [], 'the mortar post is not the addressee of a request to one of its members');
  assert.deepStrictEqual(R.requestActions(stage1, crew2, toMember, { claimed: [] }), ['accept', 'deny']);
  assert.deepStrictEqual(R.requestActions(stage1, soOther, toMember, { claimed: [] }), ['accept', 'deny'], 'staff still act');
  assert.deepStrictEqual(R.requestActions(stage1, soAuthor, toMember, { claimed: [] }), ['cancel'], 'the author never accepts');
  const accept = { op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } };
  assert.strictEqual(R.canWrite(stage1, crewM, accept, toMember, { claimed: ['c-mortar'] }).reason, 'right', 'a claimed crew does not take a request addressed elsewhere');
  assert.deepStrictEqual(R.canWrite(stage1, crew2, accept, toMember, { claimed: [] }), { ok: true });
  const toPost = Object.assign({}, toMember, { to: { post: 'mortar' } });
  assert.deepStrictEqual([R.isAddressee(toPost, crewM), R.isAddressee(toPost, crew2), R.isAddressee(toPost, soOther)], [true, true, false]);
  const toSquad = { to: { post: 'sl', squad: 'alpha' } };
  assert.deepStrictEqual([R.isAddressee(toSquad, slA), R.isAddressee(toSquad, slB)], [true, false]);
  assert.strictEqual(R.canWrite(policy, ot, accept, Object.assign({ kind: 'request', type: 'mortar', status: 'requested', by: byOf(staff) }, toSquad), { claimed: [] }).reason, 'right',
    'the mortar owner post of the full policy does not accept a request addressed to a squad');
  const t1 = Object.assign(stage1State('task', 'requested').objects.q1, { to: { post: 'mortar' } });
  assert.deepStrictEqual(R.requestActions(stage1, crewM, t1, { claimed: [] }), ['accept', 'deny']);
  t1.status = 'accepted';
  assert.deepStrictEqual(R.requestActions(stage1, crewM, t1, { claimed: [] }), ['done', 'deny'], 'no fire, take or place for a task');
  assert.deepStrictEqual(R.requestActions(stage1, soAuthor, t1, { claimed: [] }), ['cancel']);
  t1.status = 'done';
  assert.deepStrictEqual(R.requestActions(stage1, soAuthor, t1, { claimed: [] }), ['repeat']);

  // The room calibration: tile and reading agree with the offset; the freshest publish replaces it.
  const calData = over => Object.assign({ offset: [12, -5], tile: [10, 20], reading: [22, 15] }, over);
  assert.strictEqual(R.validateData(stage1, 'calibration', { offset: [12, -5] }), null, 'the stage 1 shape stays valid');
  assert.strictEqual(R.validateData(stage1, 'calibration', calData()), null);
  assert.strictEqual(R.validateData(stage1, 'calibration', calData({ offset: [12, -4] })), 'offset');
  assert.strictEqual(R.validateData(stage1, 'calibration', { offset: [12, -5], tile: [10, 20] }), 'reading');
  assert.strictEqual(R.validateData(stage1, 'calibration', { offset: [12, -5], reading: [22, 15] }), 'tile');
  assert.strictEqual(R.validateData(stage1, 'calibration', calData({ tile: [10.5, 20] })), 'tile');
  assert.strictEqual(R.validatePatch(stage1, 'calibration', calData({ note: 'x' })), 'fields');
  const cs = R.createState();
  const publish = (seq, by, offset) => ({ seq, at: seq * 1000, by: byOf(by), op: 'put', kind: 'calibration', id: 'calibration', data: { offset } });
  assert.strictEqual(R.applyOp(cs, publish(1, soAuthor, [1, 1])).ok, true);
  assert.deepStrictEqual(R.canWrite(stage1, crewM, { op: 'put', kind: 'calibration', id: 'calibration', data: calData() }, cs.objects.calibration), { ok: true }, 'the crew refines it');
  assert.strictEqual(R.canWrite(stage1, watcher, { op: 'put', kind: 'calibration', id: 'calibration', data: calData() }, cs.objects.calibration).reason, 'level');
  assert.strictEqual(R.applyOp(cs, publish(2, crewM, [2, 2])).ok, true);
  assert.deepStrictEqual([cs.objects.calibration.offset, cs.objects.calibration.by.client], [[2, 2], 'c-mortar'], 'the freshest publish replaces the room calibration');

  // Review fixes: addressee ids, squads only for squad posts, whole calibrations, no firing tasks, bounded levels.
  const forged = 'ghost' + String.fromCharCode(10) + '18:30:00  Администрация  комната закрыта';
  for (const client of [forged, 'short', 'a b c d e f', '<b>crew</b>xx', 'x'.repeat(41)]) {
    assert.strictEqual(R.validateData(stage1, 'request', req({ type: 'position', to: { client } })), 'to', 'client ' + JSON.stringify(client));
  }
  assert.strictEqual(R.validateData(stage1, 'request', req({ type: 'position', to: { client: 'e2ecrew01' } })), null);
  assert.strictEqual(R.validateData(policy, 'request', req({ type: 'position', to: { post: 'ot', squad: 'bravo' } })), 'to', 'the ordnance post has no squads');
  for (const opName of ['patch', 'del']) {
    assert.strictEqual(R.canWrite(stage1, soAuthor, { op: opName, kind: 'calibration', id: 'calibration', data: { offset: [7, -3] } }, cs.objects.calibration).reason, 'op', opName + ' of the room calibration');
  }
  const taskAccepted = Object.assign(stage1State('task', 'accepted').objects.q1, { to: { post: 'mortar' } });
  for (const status of ['firing', 'loaded']) {
    assert.strictEqual(R.canWrite(stage1, crewM, { op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'accepted', data: { status } }, taskAccepted, { claimed: [] }).reason, 'transition', 'a task never goes ' + status);
  }
  assert.deepStrictEqual(R.canWrite(stage1, crewM, { op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'accepted', data: { status: 'done' } }, taskAccepted, { claimed: [] }), { ok: true });
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, { pos: { x: 1, y: 2, level: 64 } }), null);
  assert.strictEqual(R.validateMemberPatch(stage1, crewM, { pos: { x: 1, y: 2, level: 1e300 } }), 'pos');
});

console.log('OK', n, 'groups');

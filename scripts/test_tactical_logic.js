// Exercises tactical/logic.js (window.TacticalLogic) under Node: coordinates,
// calibration, input parsing, strike checks and mortar fire maths. Numbers come
// from game code and the owner-approved mockup in docs/design/2026-09-13-tactical-map.md.
// Run: node scripts/test_tactical_logic.js
//
// The module runs in THIS realm with a stub window (as scripts/test_home_logic.js
// does), so deepStrictEqual compares plain arrays without prototype mismatches.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'tactical', 'logic.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const L = window.TacticalLogic;
const F = L.FLAGS;

const MORTAR_RMC = {
  minRange: 15, maxRange: 65, maxDial: 10, maxTarget: 1000, tilesPerOffset: 20, jitter: [-1, 0, 0, 1],
  loadDelay: 1.5, travelDelay: 4.5, impactWarningDelay: 2.5, impactDelay: 4.5,
  warnRange: 15, impactWarnRange: 10,
};
const MORTAR_CMU = Object.assign({}, MORTAR_RMC, { minRange: 8, maxRange: 165 });
const OB = {
  scatter: [-3, 2], cooldown: 500,
  timeline: { alert: 2, beginFire: 6, fire: 12, warnOne: 16, warnTwo: 20, impact: 24 },
  warnRanges: [30, 25, 15],
};
const ROOFING = [
  { proto: 'HiveCoreXeno', range: 11.848, allows: [] },
  { proto: 'HivePylonXeno', range: 8.463, allows: ['OB'] },
];

const OPEN = F.OB | F.CAS | F.MORTAR_FIRE | F.MORTAR_PLACE | F.SUPPLY | F.LASING;

// Synthetic planet: areaOf(x, y) returns a 1-based area index (0 = no tile).
function rle(values) {
  const out = [];
  let prev = values[0], run = 0;
  for (const v of values) {
    if (v === prev) run++;
    else { out.push(prev, run); prev = v; run = 1; }
  }
  out.push(prev, run);
  return out;
}

function planet(b, areas, areaOf, masks) {
  const rows = (fn) => {
    const r = [];
    for (let y = b.maxY; y >= b.minY; y--) {
      const line = [];
      for (let x = b.minX; x <= b.maxX; x++) line.push(fn(x, y));
      r.push(rle(line));
    }
    return r;
  };
  const m = masks || {};
  return L.preparePlanet({
    schemaVersion: 1, fork: 'test', planet: 'test', level: 0, bounds: b, areas,
    grid: rows(areaOf),
    masks: {
      blocked: rows((x, y) => (m.blocked && m.blocked(x, y) ? 1 : 0)),
      hardWall: rows((x, y) => (m.hardWall && m.hardWall(x, y) ? 1 : 0)),
    },
    labels: [],
  });
}

const openWorld = planet({ minX: -120, minY: -120, maxX: 120, maxY: 120 },
  [['open', 'Open', null, OPEN]], () => 1);

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('ok ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL ' + name + '\n  ' + (e && e.message ? e.message.split('\n').join('\n  ') : e));
  }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);

// ── coordinates and calibration ─────────────────────────────────────────────

test('calibration pair gives the round offset', () => {
  const offset = L.offsetFrom([31, -78], [243, -226]);
  assert.deepStrictEqual(offset, [212, -148]);
  assert.deepStrictEqual(L.worldToGame(offset, 31, -78), [243, -226]);
  assert.deepStrictEqual(L.gameToWorld(offset, 243, -226), [31, -78]);
});

test('offset beyond the planet variance is flagged', () => {
  assert.deepStrictEqual(L.calibrationIssues([212, -148], 500), []);
  assert.deepStrictEqual(L.calibrationIssues([501, 0], 500), ['outOfVariance']);
});

test('check tile must discriminate', () => {
  assert.strictEqual(L.isDiscriminating([0, 0], [3, 1]), true);
  assert.strictEqual(L.isDiscriminating([0, 0], [2, 2]), false);
  assert.strictEqual(L.isDiscriminating([0, 0], [-2, 2]), false);
  assert.strictEqual(L.isDiscriminating([0, 0], [0, 3]), false);
  assert.ok(L.checkTileCandidates([31, -78]).every((t) => L.isDiscriminating([31, -78], t)));
});

test('a swapped first reading is caught by a discriminating check tile', () => {
  const trueOffset = [212, -148];
  const tile = [31, -78];
  const swapped = L.offsetFrom(tile, [-226, 243]);            // X and Y typed in the wrong order
  assert.deepStrictEqual(L.calibrationIssues(swapped, 500), []); // passes the variance bound
  const predict = (t) => L.worldToGame(swapped, t[0], t[1]);
  const display = (t) => L.worldToGame(trueOffset, t[0], t[1]);
  const swap = (p) => [p[1], p[0]];
  const good = [tile[0] + 3, tile[1] + 1];
  assert.notDeepStrictEqual(predict(good), display(good));
  assert.notDeepStrictEqual(predict(good), swap(display(good)));
  const diagonal = [tile[0] + 2, tile[1] + 2];                  // |dx| = |dy| hides the swap
  assert.deepStrictEqual(predict(diagonal), swap(display(diagonal)));
});

test('copied coordinates use ASCII minus', () => {
  assert.strictEqual(L.formatCoords([-100, 200]), '-100 200');
});

// ── parsing ─────────────────────────────────────────────────────────────────

test('coordinate formats players paste', () => {
  const cases = [
    ['-100 200', [-100, 200]],
    ['−100 200', [-100, 200]],
    ['-100, 200', [-100, 200]],
    ['ДОЛГОТА -100 ШИРОТА 200', [-100, 200]],
    ['LONGITUDE : -100, LATITUDE : 200', [-100, 200]],
    ['Para-Cam (-100):(200)', [-100, 200]],
    ['X: -100 Y: 200', [-100, 200]],
    ['долгота: 12, ширина: -7', [12, -7]],
  ];
  for (const [text, want] of cases) {
    const r = L.parseCoords(text);
    assert.ok(r.ok, text + ' → ' + JSON.stringify(r));
    assert.deepStrictEqual([r.x, r.y], want, text);
  }
});

test('ambiguous or impossible input is refused', () => {
  assert.strictEqual(L.parseCoords('1 2 3').reason, 'tooMany');
  assert.strictEqual(L.parseCoords('7').reason, 'tooFew');
  assert.strictEqual(L.parseCoords('5000 1').reason, 'outOfRange');
});

// ── planet data ─────────────────────────────────────────────────────────────

test('RLE rows decode and must cover the width', () => {
  assert.deepStrictEqual(L.decodeRows([[1, 2, 0, 3]], 5), [1, 1, 0, 0, 0]);
  assert.throws(() => L.decodeRows([[1, 2]], 5));
});

const small = planet({ minX: 0, minY: 0, maxX: 4, maxY: 2 },
  [['open', 'Open', null, OPEN], ['roofed', 'Roofed', null, F.OB | F.MORTAR_FIRE], ['lz', 'LZ', null, OPEN | F.LANDING_ZONE]],
  (x, y) => (y === 2 ? 1 : y === 1 ? (x < 2 ? 2 : 3) : 0),
  { hardWall: (x, y) => x === 4 && y === 2, blocked: (x, y) => x === 0 && y === 2 });

test('areas, flags and masks by world tile', () => {
  assert.strictEqual(L.areaAt(small, 1, 2)[0], 'open');
  assert.strictEqual(L.areaAt(small, 0, 1)[0], 'roofed');
  assert.strictEqual(L.areaAt(small, 3, 1)[0], 'lz');
  assert.strictEqual(L.areaAt(small, 3, 0), null);
  assert.strictEqual(L.areaAt(small, 9, 9), null);
  assert.strictEqual(L.flagsAt(small, 0, 1), F.OB | F.MORTAR_FIRE);
  assert.strictEqual(L.maskAt(small, 'hardWall', 4, 2), true);
  assert.strictEqual(L.maskAt(small, 'blocked', 0, 2), true);
  assert.strictEqual(L.maskAt(small, 'blocked', 1, 2), false);
});

// ── mortar geometry ─────────────────────────────────────────────────────────

test('range runs from the mortar tile centre to the target corner (M−64…M+65)', () => {
  const m = [0, 0];
  const check = (t) => L.mortarFireChecks(openWorld, m, t, MORTAR_RMC, 'coordinates').reasons;
  assert.deepStrictEqual(check([65, 0]), []);
  assert.deepStrictEqual(check([66, 0]), ['tooFar']);
  assert.deepStrictEqual(check([-64, 0]), []);
  assert.deepStrictEqual(check([-65, 0]), ['tooFar']);
  assert.deepStrictEqual(check([15, 0]), ['tooClose']);
  assert.deepStrictEqual(check([-15, 0]), []);
});

test('CMU mortar range is 8–165', () => {
  const r = L.mortarFireChecks(openWorld, [0, 0], [100, 0], MORTAR_CMU, 'coordinates');
  assert.deepStrictEqual(r.reasons, []);
  assert.deepStrictEqual(L.mortarFireChecks(openWorld, [0, 0], [100, 0], MORTAR_RMC, 'coordinates').reasons, ['tooFar']);
});

test('aim error bounds and the zero-error span (M−19…M+20)', () => {
  const m = [20, -98];
  assert.deepStrictEqual(L.errorBounds(m, [62, -62], 20), [2, 1]);
  assert.deepStrictEqual(L.zeroErrorSpan(m, 20), { minX: 1, maxX: 40, minY: -117, maxY: -78 });
  assert.deepStrictEqual(L.errorBounds(m, [40, -98], 20), [0, 0]);
  assert.deepStrictEqual(L.errorBounds(m, [41, -98], 20), [1, 0]);
  assert.deepStrictEqual(L.errorBounds(m, [1, -98], 20), [0, 0]);
  assert.deepStrictEqual(L.errorBounds(m, [0, -98], 20), [1, 0]);
});

test('placement needs the mortarPlacement flag', () => {
  assert.deepStrictEqual(L.placementCheck(small, [1, 2]), { ok: true, reasons: [] });
  assert.deepStrictEqual(L.placementCheck(small, [0, 1]), { ok: false, reasons: ['indoors'] });
  assert.deepStrictEqual(L.placementCheck(small, [3, 0]), { ok: false, reasons: ['noArea'] });
});

test('landing zones and covered areas refuse mortar fire', () => {
  const lzWorld = planet({ minX: -40, minY: -40, maxX: 40, maxY: 40 },
    [['open', 'Open', null, OPEN], ['lz', 'LZ', null, OPEN | F.LANDING_ZONE], ['cave', 'Cave', null, F.OB]],
    (x) => (x >= 20 ? 2 : x <= -20 ? 3 : 1));
  assert.deepStrictEqual(L.mortarFireChecks(lzWorld, [0, 0], [25, 0], MORTAR_RMC, 'coordinates').reasons, ['landingZone']);
  assert.deepStrictEqual(L.mortarFireChecks(lzWorld, [0, 0], [-25, 0], MORTAR_RMC, 'coordinates').reasons, ['covered']);
});

test('laser mode has no aim error but needs CAS and lasing', () => {
  const noLase = planet({ minX: -40, minY: -40, maxX: 40, maxY: 40 },
    [['open', 'Open', null, OPEN], ['dim', 'Dim', null, F.OB | F.MORTAR_FIRE | F.MORTAR_PLACE]],
    (x) => (x >= 20 ? 2 : 1));
  const ok = L.mortarFireChecks(noLase, [0, 0], [-30, 0], MORTAR_RMC, 'laser');
  assert.deepStrictEqual(ok.bounds, [0, 0]);
  assert.deepStrictEqual(ok.reasons, []);
  assert.deepStrictEqual(L.mortarFireChecks(noLase, [0, 0], [30, 0], MORTAR_RMC, 'laser').reasons, ['noCas', 'noLasing']);
});

test('aim error near the range edge is a warning', () => {
  const r = L.mortarFireChecks(openWorld, [0, 0], [63, 0], MORTAR_RMC, 'coordinates');
  assert.deepStrictEqual(r.reasons, []);
  assert.deepStrictEqual(r.bounds, [3, 0]);
  assert.ok(r.warnings.includes('errorMayExceedMaxRange'));
});

// ── fire variants (mockup scenario) ─────────────────────────────────────────

const offset = [212, -148];
const mortarTile = L.gameToWorld(offset, 232, -246);   // world 20 −98

test('mockup: new target 274 −210 is 55 tiles away with error ±2/±1', () => {
  assert.deepStrictEqual(mortarTile, [20, -98]);
  const v = L.fireVariants({ offset, gameTarget: [274, -210], constants: MORTAR_RMC, planet: openWorld, mortarTile });
  assert.deepStrictEqual(v.newTarget.target, [274, -210]);
  assert.strictEqual(v.newTarget.resetDial, false);
  assert.strictEqual(Math.round(v.newTarget.checks.distance), 55);
  assert.deepStrictEqual(v.newTarget.checks.bounds, [2, 1]);
  assert.strictEqual(v.dial, null);
});

const shot = { id: 1, target: [274, -210], dial: [0, 0], impacts: [[276, -209]] };

test('mockup: impact 276 −209 means error +2 +1 and dial −2 −1 for the same point', () => {
  assert.deepStrictEqual(L.estimateError(shot), [2, 1]);
  const v = L.fireVariants({ offset, gameTarget: [274, -210], constants: MORTAR_RMC, lastShot: shot });
  assert.deepStrictEqual(v.dial.dial, [-2, -1]);
  assert.strictEqual(v.dial.errorKnown, true);
  assert.deepStrictEqual(v.dial.baseTarget, [274, -210]);
});

test('mockup: 280 −214 dials +4 −5; 262 −196 is beyond ±10', () => {
  assert.deepStrictEqual(L.fireVariants({ offset, gameTarget: [280, -214], constants: MORTAR_RMC, lastShot: shot }).dial.dial, [4, -5]);
  assert.strictEqual(L.fireVariants({ offset, gameTarget: [262, -196], constants: MORTAR_RMC, lastShot: shot }).dial, null);
});

test('a dial already set on the mortar is called out on a new target', () => {
  const v = L.fireVariants({ offset, gameTarget: [262, -196], constants: MORTAR_RMC, currentDial: [-2, -1] });
  assert.strictEqual(v.newTarget.resetDial, true);
  assert.deepStrictEqual(v.newTarget.currentDial, [-2, -1]);
});

test('without impacts the dial variant assumes no known error', () => {
  const v = L.fireVariants({ offset, gameTarget: [280, -214], constants: MORTAR_RMC,
    lastShot: { id: 2, target: [274, -210], dial: [0, 0], impacts: [] } });
  assert.deepStrictEqual(v.dial.dial, [6, -4]);
  assert.strictEqual(v.dial.errorKnown, false);
});

test('error estimate averages impacts; implausible impacts are spotted', () => {
  assert.deepStrictEqual(L.estimateError({ target: [0, 0], dial: [0, 0], impacts: [[2, 1], [2, -1]] }), [2, 0]);
  assert.strictEqual(L.impactPlausible(shot, [276, -209], [2, 1]), true);
  assert.strictEqual(L.impactPlausible(shot, [280, -209], [2, 1]), false);
});

// ── timers ──────────────────────────────────────────────────────────────────

test('mortar timeline from firing and from loading', () => {
  assert.deepStrictEqual(L.mortarTimeline(MORTAR_RMC, false).map((e) => e.at), [0, 4.5, 7, 9]);
  assert.deepStrictEqual(L.mortarTimeline(MORTAR_RMC, true).map((e) => e.at), [1.5, 6, 8.5, 10.5]);
  const s = L.timelineState(L.mortarTimeline(MORTAR_RMC, false), 5);
  assert.strictEqual(s.next.event, 'impactWarning');
  assert.ok(near(s.remaining, 4));
  assert.strictEqual(L.timelineState(L.mortarTimeline(MORTAR_RMC, false), 9.5).done, true);
});

test('OB timeline', () => {
  assert.deepStrictEqual(L.obTimeline(OB).map((e) => [e.at, e.range || null]), [[12, 30], [16, 25], [20, 15], [24, null]]);
});

// ── OB, supply, roofs ───────────────────────────────────────────────────────

test('OB scatter box is −3…+2, scaled by misfuel', () => {
  assert.deepStrictEqual(L.obScatterBox([10, 10], OB, 0), { minX: 7, maxX: 12, minY: 7, maxY: 12 });
  assert.deepStrictEqual(L.obScatterBox([10, 10], OB, 1), { minX: 4, maxX: 14, minY: 4, maxY: 14 });
});

test('OB: blocked area, wall at the point, scatter outside OB ground', () => {
  const w = planet({ minX: -10, minY: -10, maxX: 10, maxY: 10 },
    [['open', 'Open', null, OPEN], ['deep', 'Deep', null, F.CAS]],
    (x) => (x >= 2 ? 2 : 1), { hardWall: (x, y) => x === 0 && y === 0 });
  const r = L.obChecks(w, [0, 0], OB);
  assert.deepStrictEqual(r.reasons, []);
  assert.ok(r.warnings.includes('wallRedirect'));
  assert.ok(r.warnings.includes('scatterOutsideOb'));
  assert.deepStrictEqual(L.obChecks(w, [5, 0], OB).reasons, ['obBlocked']);
});

test('supply drop: flag and blocked tile', () => {
  assert.deepStrictEqual(L.supplyChecks(small, [1, 2]).reasons, []);
  assert.deepStrictEqual(L.supplyChecks(small, [0, 2]).reasons, ['blocked']);
  assert.deepStrictEqual(L.supplyChecks(small, [0, 1]).reasons, ['underground']);
});

test('hive roof reach is measured corner-to-centre (x −11…+12 along its row)', () => {
  const core = [{ proto: 'HiveCoreXeno', x: 0, y: 0 }];
  assert.ok(L.roofedFlags(core, [12, 0], ROOFING) & F.MORTAR_FIRE);
  assert.strictEqual(L.roofedFlags(core, [13, 0], ROOFING), 0);
  assert.ok(L.roofedFlags(core, [-11, 0], ROOFING) & F.MORTAR_FIRE);
  assert.strictEqual(L.roofedFlags(core, [-12, 0], ROOFING), 0);
  const pylon = [{ proto: 'HivePylonXeno', x: 0, y: 0 }];
  assert.strictEqual(L.roofedFlags(pylon, [3, 0], ROOFING) & F.OB, 0);
  assert.ok(L.roofedFlags(pylon, [3, 0], ROOFING) & F.CAS);
});

// ── round lifetime ──────────────────────────────────────────────────────────

test('T3 pair: world 31 −78 ↔ game 243 −226; the suggested check tile catches a swap', () => {
  const tile = [31, -78];
  const offset = L.offsetFrom(tile, [243, -226]);
  const check = L.pickCheckTile(openWorld, tile, []);
  assert.ok(check && L.isDiscriminating(tile, check));
  const swapped = L.offsetFrom(tile, [-226, 243]);
  const expected = L.worldToGame(swapped, check[0], check[1]);   // what the page would predict
  const shown = L.worldToGame(offset, check[0], check[1]);       // what the rangefinder shows
  assert.notDeepStrictEqual(expected, shown);
  assert.notDeepStrictEqual(expected, [shown[1], shown[0]]);     // even when read back swapped
});

test('check tile skips walls, off-planet tiles and tiles already tried', () => {
  const b = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const open = (x, y) => (x === 4 && y === 8) || (x === 8 && y === 3);
  const cramped = planet(b, [['a', 'A', null, OPEN]], () => 1, { blocked: (x, y) => !open(x, y) });
  assert.deepStrictEqual(L.pickCheckTile(cramped, [5, 5], []), [4, 8]);
  assert.deepStrictEqual(L.pickCheckTile(cramped, [5, 5], [[4, 8]]), [8, 3]);
  assert.strictEqual(L.pickCheckTile(cramped, [5, 5], [[4, 8], [8, 3]]), null);
  const small = planet(b, [['a', 'A', null, OPEN]], () => 1);
  assert.deepStrictEqual(L.pickCheckTile(small, [0, 0], []), [1, 2]);
});

test('«same round?» after a reload, 20 idle minutes or an off-planet coordinate', () => {
  const t0 = 1_000_000, min = 60000;
  const cal = { offset: [212, -148], at: t0 };
  assert.deepStrictEqual(L.calibrationState(null, t0, L.newSession(t0, false)),
    { calibrated: false, askSameRound: false, reasons: [] });

  const untouched = L.newSession(t0, false);
  assert.deepStrictEqual(L.calibrationState(cal, t0 + 10 * min, untouched).reasons, []);
  assert.deepStrictEqual(L.calibrationState(cal, t0 + 21 * min, untouched).reasons, ['idle']);

  const busy = L.newSession(t0, false);
  L.noteInput(busy, t0 + 15 * min);
  L.noteInput(busy, t0 + 30 * min);
  assert.deepStrictEqual(L.calibrationState(cal, t0 + 30 * min, busy).reasons, []);
  L.noteInput(busy, t0 + 55 * min);                              // a 25-minute gap between inputs
  assert.deepStrictEqual(L.calibrationState(cal, t0 + 55 * min, busy).reasons, ['idle']);

  const reloaded = L.newSession(t0, true);
  assert.deepStrictEqual(L.calibrationState(cal, t0 + min, reloaded).reasons, ['reload']);
  reloaded.offPlanet = true;
  assert.deepStrictEqual(L.calibrationState(cal, t0 + min, reloaded).reasons, ['reload', 'offPlanet']);
  L.confirmSameRound(reloaded, t0 + 2 * min);
  const after = L.calibrationState(cal, t0 + 3 * min, reloaded);
  assert.strictEqual(after.askSameRound, false);
  assert.strictEqual(after.ageMs, 3 * min);
});

test('T4: where the shell can land — aim error plus jitter, none in laser mode', () => {
  const mortar = [20, -98], target = [62, -62];               // mockup pair, 55 tiles apart
  const box = L.impactBox(mortar, target, MORTAR_RMC, 'coordinates');
  assert.deepStrictEqual(box, { minX: 59, maxX: 65, minY: -64, maxY: -60, error: [2, 1], jitter: [-1, 1] });
  const near = L.impactBox(mortar, [30, -90], MORTAR_RMC, 'coordinates');   // inside the zero-error span
  assert.deepStrictEqual([near.minX, near.maxX, near.minY, near.maxY], [29, 31, -91, -89]);
  const laser = L.impactBox(mortar, target, MORTAR_RMC, 'laser');
  assert.deepStrictEqual([laser.minX, laser.maxX, laser.minY, laser.maxY], [62, 62, -62, -62]);
});

test('T4: page prefs migrate strictly, layers keep their defaults', () => {
  const d = L.migratePrefs(null);
  assert.deepStrictEqual(d, { v: 1, weapon: 'mortar', shell: null, hitRadius: {}, layers: { fire: true, deploy: false, rings: true, zone: true } });
  const p = L.migratePrefs({ v: 1, weapon: 'ob', shell: 'RMCMortarShellHE', hitRadius: { RMCMortarShellHE: 4.5, bad: 'x', huge: 500 },
    layers: { fire: false, nope: true, rings: 'yes' }, junk: 1 });
  assert.deepStrictEqual(p, { v: 1, weapon: 'ob', shell: 'RMCMortarShellHE', hitRadius: { RMCMortarShellHE: 4.5 },
    layers: { fire: false, deploy: false, rings: true, zone: true } });
  assert.strictEqual(L.migratePrefs({ v: 2, weapon: 'ob' }).weapon, 'mortar');
});

test('stored planet state: foreign or inconsistent shapes are dropped', () => {
  const empty = { v: 1, calibration: null, mortar: null, target: null, shots: [], markers: [] };
  assert.deepStrictEqual(L.migrateStorage(null), empty);
  assert.deepStrictEqual(L.migrateStorage('x'), empty);
  assert.deepStrictEqual(L.migrateStorage({ v: 2, calibration: {} }), empty);
  const cal = { tile: [31, -78], reading: [243, -226], offset: [212, -148], at: 5,
    check: { tile: [33, -77], expect: [245, -225], result: null, tried: [] } };
  const kept = L.migrateStorage({ v: 1, calibration: cal, shots: [], markers: [{ id: 'm1' }],
    mortar: { tile: [20, -98], mode: 'weird' }, target: [62, -62] });
  assert.deepStrictEqual(kept.calibration, cal);
  assert.deepStrictEqual(kept.markers, [{ id: 'm1' }]);
  assert.deepStrictEqual(kept.mortar, { tile: [20, -98], mode: 'coordinates' });
  assert.deepStrictEqual(kept.target, [62, -62]);
  assert.strictEqual(L.migrateStorage({ v: 1, mortar: { tile: [1.5, 2] } }).mortar, null);
  assert.strictEqual(L.migrateStorage({ v: 1, target: 'x' }).target, null);
  assert.strictEqual(L.migrateStorage({ v: 1, calibration: Object.assign({}, cal, { offset: [0, 0] }) }).calibration, null);
  const wrongCheck = Object.assign({}, cal, { check: { tile: [33, -77], expect: [0, 0], result: null } });
  assert.strictEqual(L.migrateStorage({ v: 1, calibration: wrongCheck }).calibration.check, null);
});

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall tactical logic tests passed');

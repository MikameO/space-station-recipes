/*
  SPDX-License-Identifier: GPL-3.0-only
  Copyright (C) 2026 MikameO
  This file is part of Space Station Recipes.
  See LICENSE for details.
*/
// Pure half of the tactical map (no DOM): coordinates, calibration, input parsing,
// strike checks and mortar fire maths. Every rule mirrors game code — see
// docs/design/2026-09-13-tactical-map.md, «Механика игры». Node tests:
// scripts/test_tactical_logic.js.
(function (root) {
  'use strict';

  var FLAGS = { OB: 1, CAS: 2, MORTAR_FIRE: 4, MORTAR_PLACE: 8, SUPPLY: 16, LANDING_ZONE: 32, LASING: 64 };

  // ── coordinates ──────────────────────────────────────────────────────────

  // The rangefinder shows floor(tile centre) + planet offset, so a tile index
  // plus the round's offset is exactly what the player reads in game.
  function worldToGame(offset, x, y) { return [x + offset[0], y + offset[1]]; }
  function gameToWorld(offset, x, y) { return [x - offset[0], y - offset[1]]; }

  function offsetFrom(tile, reading) {
    return [reading[0] - tile[0], reading[1] - tile[1]];
  }

  function calibrationIssues(offset, variance) {
    var issues = [];
    if (Math.abs(offset[0]) > variance || Math.abs(offset[1]) > variance) issues.push('outOfVariance');
    return issues;
  }

  // A check tile discriminates only when a consistent X/Y swap or sign error in
  // the first reading would change its predicted numbers: dx, dy non-zero and
  // |dx| != |dy| relative to the calibration tile.
  function isDiscriminating(first, second) {
    var dx = second[0] - first[0], dy = second[1] - first[1];
    return dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy);
  }

  // Every discriminating step within 5 tiles, nearest first: a close tile stays in
  // line of sight, and a cramped corridor still leaves one on open floor.
  var CHECK_STEPS = (function () {
    var steps = [];
    for (var dx = -5; dx <= 5; dx++) {
      for (var dy = -5; dy <= 5; dy++) {
        if (dx && dy && Math.abs(dx) !== Math.abs(dy)) steps.push([dx, dy]);
      }
    }
    return steps.sort(function (a, b) {
      return (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]) || a[0] - b[0] || a[1] - b[1];
    });
  })();

  function checkTileCandidates(first) {
    return CHECK_STEPS.map(function (s) { return [first[0] + s[0], first[1] + s[1]]; });
  }

  function formatCoords(pair) {
    return String(pair[0]) + ' ' + String(pair[1]);   // ASCII minus, the way chat and the game spin boxes take it
  }

  // ── input parsing ────────────────────────────────────────────────────────

  function parseCoords(text, maxValue) {
    var limit = maxValue || 1000;
    var s = String(text || '').replace(/[−‒–—﹣－]/g, '-');
    var x = null, y = null, m;
    if ((m = /para-?cam\s*\(\s*(-?\d+)\s*\)\s*:\s*\(\s*(-?\d+)\s*\)/i.exec(s))) {
      x = +m[1]; y = +m[2];
    } else {
      var lx = /(?:долгота|longitude|long\.?|\bx\b)\s*[:=]?\s*(-?\d+)/i.exec(s);
      var ly = /(?:широта|ширина|latitude|lat\.?|\by\b)\s*[:=]?\s*(-?\d+)/i.exec(s);
      if (lx && ly) {
        x = +lx[1]; y = +ly[1];
      } else {
        var nums = s.match(/-?\d+/g) || [];
        if (nums.length !== 2) return { ok: false, reason: nums.length < 2 ? 'tooFew' : 'tooMany' };
        x = +nums[0]; y = +nums[1];
      }
    }
    if (Math.abs(x) > limit || Math.abs(y) > limit) return { ok: false, reason: 'outOfRange' };
    return { ok: true, x: x, y: y };
  }

  // ── planet data ──────────────────────────────────────────────────────────

  function decodeRows(rows, width) {
    var out = new Array(rows.length * width), k = 0;
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r], filled = 0;
      for (var i = 0; i < row.length; i += 2) {
        for (var n = 0; n < row[i + 1]; n++) out[k++] = row[i];
        filled += row[i + 1];
      }
      if (filled !== width) throw new Error('RLE row ' + r + ' covers ' + filled + ' of ' + width);
    }
    return out;
  }

  function preparePlanet(json) {
    var b = json.bounds;
    var width = b.maxX - b.minX + 1, height = b.maxY - b.minY + 1;
    return {
      json: json,
      width: width,
      height: height,
      bounds: b,
      grid: decodeRows(json.grid, width),
      blocked: decodeRows(json.masks.blocked, width),
      hardWall: decodeRows(json.masks.hardWall, width),
      // Multi-level planets (CMU): a strike must be allowed by every surface in the
      // column, and a mortar deploys only under open sky.
      columnMortar: json.masks.columnMortar ? decodeRows(json.masks.columnMortar, width) : null,
      columnOb: json.masks.columnOb ? decodeRows(json.masks.columnOb, width) : null,
      openSky: json.masks.openSky ? decodeRows(json.masks.openSky, width) : null,
      landmarks: indexLandmarks(json)
    };
  }

  // Landmarks as the page draws them: one object per item with its category row
  // resolved, indexed by tile. A landmark inside a variable area (an insert zone
  // with odds above zero) may not be there this round, so it counts as unreliable.
  function indexLandmarks(json) {
    var lm = json.landmarks || { protos: [], items: [] };
    var zones = [];
    (json.inserts || []).forEach(function (ins) {
      ins.zones.forEach(function (z) { if (z.p > 0) zones.push(z.bounds); });
    });
    var items = [], byTile = {};
    (lm.items || []).forEach(function (it) {
      var row = (lm.protos || [])[it[2]];
      if (!row) return;
      var x = it[0], y = it[1];
      var inInsert = zones.some(function (b) { return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY; });
      var item = { x: x, y: y, proto: row[0], name: row[1], cat: row[2], mayMove: !row[3], inInsert: inInsert,
        reliable: !!row[3] && !inInsert, rot: it[3] || 0 };
      items.push(item);
      (byTile[x + ',' + y] = byTile[x + ',' + y] || []).push(item);
    });
    return { items: items, byTile: byTile };
  }

  function landmarksAt(planet, x, y) {
    return planet.landmarks.byTile[x + ',' + y] || [];
  }

  // The landmarks the category filters let through.
  function visibleLandmarks(planet, filters) {
    return planet.landmarks.items.filter(function (it) { return !!filters[it.cat]; });
  }

  // Whether a strike of one kind may reach the ground at a tile: the column rule
  // where the planet has levels, the area flag otherwise.
  function strikeAllowed(planet, kind, x, y) {
    var mask = kind === 'ob' ? planet.columnOb : planet.columnMortar;
    if (mask) {
      var i = cellIndex(planet, x, y);
      return i >= 0 && mask[i] === 1;
    }
    return !!(flagsAt(planet, x, y) & (kind === 'ob' ? FLAGS.OB : FLAGS.MORTAR_FIRE));
  }

  function cellIndex(planet, x, y) {
    var b = planet.bounds;
    if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return -1;
    return (b.maxY - y) * planet.width + (x - b.minX);
  }

  function areaAt(planet, x, y) {
    var i = cellIndex(planet, x, y);
    if (i < 0) return null;
    var a = planet.grid[i];
    return a ? planet.json.areas[a - 1] : null;
  }

  function flagsAt(planet, x, y) {
    var area = areaAt(planet, x, y);
    return area ? area[3] : 0;
  }

  function maskAt(planet, name, x, y) {
    var i = cellIndex(planet, x, y);
    return i >= 0 && planet[name][i] === 1;
  }

  // ── mortar geometry ──────────────────────────────────────────────────────

  // An anchored mortar sits at its tile centre; a target is an integer point
  // (the tile corner). Range and aim error both use that pair.
  function mortarDelta(mortarTile, target) {
    return [target[0] - (mortarTile[0] + 0.5), target[1] - (mortarTile[1] + 0.5)];
  }

  function distance(mortarTile, target) {
    var d = mortarDelta(mortarTile, target);
    return Math.sqrt(d[0] * d[0] + d[1] * d[1]);
  }

  function errorBounds(mortarTile, target, tilesPerOffset) {
    var d = mortarDelta(mortarTile, target);
    return [Math.floor(Math.abs(d[0]) / tilesPerOffset), Math.floor(Math.abs(d[1]) / tilesPerOffset)];
  }

  // Where a shell aimed at `target` can actually land: the aim error the game
  // rolls for this mortar–target pair, plus the per-shot jitter. Integer points,
  // inclusive; `radius` (blast or fire) widens the box into the hit zone.
  function impactBox(mortarTile, target, mortar, mode) {
    var e = mode === 'laser' ? [0, 0] : errorBounds(mortarTile, target, mortar.tilesPerOffset);
    var jitter = mode === 'laser' ? [0] : (mortar.jitter || [0]);
    var jMin = Math.min.apply(null, jitter), jMax = Math.max.apply(null, jitter);
    return {
      minX: target[0] - e[0] + jMin, maxX: target[0] + e[0] + jMax,
      minY: target[1] - e[1] + jMin, maxY: target[1] + e[1] + jMax,
      error: e, jitter: [jMin, jMax]
    };
  }

  function zeroErrorSpan(mortarTile, tilesPerOffset) {
    return {
      minX: mortarTile[0] - tilesPerOffset + 1, maxX: mortarTile[0] + tilesPerOffset,
      minY: mortarTile[1] - tilesPerOffset + 1, maxY: mortarTile[1] + tilesPerOffset
    };
  }

  function placementCheck(planet, tile) {
    var area = areaAt(planet, tile[0], tile[1]);
    if (!area) return { ok: false, reasons: ['noArea'] };
    if (!(area[3] & FLAGS.MORTAR_PLACE)) return { ok: false, reasons: ['indoors'] };
    if (planet.openSky && !maskAt(planet, 'openSky', tile[0], tile[1])) return { ok: false, reasons: ['covered'] };
    return { ok: true, reasons: [] };
  }

  // Checks the server runs when the shell is loaded (MortarSystem.ValidateTargetCoordinates),
  // plus warnings for what the aim error can push over a limit.
  function mortarFireChecks(planet, mortarTile, target, mortar, mode) {
    var reasons = [], warnings = [];
    var dist = distance(mortarTile, target);
    var laser = mode === 'laser';
    var bounds = laser ? [0, 0] : errorBounds(mortarTile, target, mortar.tilesPerOffset);
    if (dist < mortar.minRange) reasons.push('tooClose');
    if (dist > mortar.maxRange) reasons.push('tooFar');
    var area = areaAt(planet, target[0], target[1]);
    if (!area) {
      reasons.push('noArea');
    } else {
      if (area[3] & FLAGS.LANDING_ZONE) reasons.push('landingZone');
      if (!strikeAllowed(planet, 'mortar', target[0], target[1])) reasons.push('covered');
      if (laser && !(area[3] & FLAGS.CAS)) reasons.push('noCas');
      if (laser && !(area[3] & FLAGS.LASING)) reasons.push('noLasing');
    }
    if (!reasons.length && (bounds[0] || bounds[1])) {
      var far = 0, near = Infinity, refused = false;
      [-bounds[0], bounds[0]].forEach(function (ex) {
        [-bounds[1], bounds[1]].forEach(function (ey) {
          var d = distance(mortarTile, [target[0] + ex, target[1] + ey]);
          far = Math.max(far, d); near = Math.min(near, d);
        });
      });
      if (far > mortar.maxRange) warnings.push('errorMayExceedMaxRange');
      if (near < mortar.minRange) warnings.push('errorMayUndercutMinRange');
      // The game validates target + error + dial, not the aim point: any point of
      // the error box in a refused area can make the mortar refuse the shot.
      for (var x = target[0] - bounds[0]; x <= target[0] + bounds[0] && !refused; x++) {
        for (var y = target[1] - bounds[1]; y <= target[1] + bounds[1]; y++) {
          var a = areaAt(planet, x, y);
          if (!a || (a[3] & FLAGS.LANDING_ZONE) || !strikeAllowed(planet, 'mortar', x, y)) { refused = true; break; }
        }
      }
      if (refused) warnings.push('errorMayHitRefusedArea');
    }
    return { ok: reasons.length === 0, reasons: reasons, warnings: warnings, distance: dist, bounds: bounds };
  }

  // ── fire variants ────────────────────────────────────────────────────────

  function sameVec(a, b) { return a[0] === b[0] && a[1] === b[1]; }

  // Mean aim error seen on a shot's impacts (impact − target − dial), rounded;
  // null without impacts. Jitter keeps a single impact within ±1.
  function estimateError(shot) {
    if (!shot || !shot.impacts || !shot.impacts.length) return null;
    var sx = 0, sy = 0;
    shot.impacts.forEach(function (p) {
      sx += p[0] - shot.target[0] - shot.dial[0];
      sy += p[1] - shot.target[1] - shot.dial[1];
    });
    return [Math.round(sx / shot.impacts.length), Math.round(sy / shot.impacts.length)];
  }

  function impactPlausible(shot, impact, bounds) {
    var ex = impact[0] - shot.target[0] - shot.dial[0];
    var ey = impact[1] - shot.target[1] - shot.dial[1];
    return Math.abs(ex) <= bounds[0] + 1 && Math.abs(ey) <= bounds[1] + 1;
  }

  // Game-coordinate numbers for a target: a new target (the error re-rolls) and,
  // near the last shot, the same target plus a dial (the error stays).
  function fireVariants(opts) {
    var mortar = opts.constants;
    var mode = opts.mode === 'laser' ? 'laser' : 'coordinates';
    var target = gameToWorld(opts.offset, opts.gameTarget[0], opts.gameTarget[1]);
    var current = opts.currentDial || [0, 0];
    var result = {
      newTarget: {
        target: opts.gameTarget.slice(),
        dial: [0, 0],
        resetDial: mode !== 'laser' && !sameVec(current, [0, 0]),
        currentDial: current.slice(),
        checks: opts.planet && opts.mortarTile ? mortarFireChecks(opts.planet, opts.mortarTile, target, mortar, mode) : null
      },
      dial: null
    };
    var last = opts.lastShot;
    if (last && mode !== 'laser') {
      var err = estimateError(last);
      var e = err || [0, 0];
      var d = [opts.gameTarget[0] - last.target[0] - e[0], opts.gameTarget[1] - last.target[1] - e[1]];
      if (Math.abs(d[0]) <= mortar.maxDial && Math.abs(d[1]) <= mortar.maxDial) {
        result.dial = {
          baseTarget: last.target.slice(),
          dial: d,
          errorKnown: !!err,
          error: err,
          shotId: last.id
        };
      }
    }
    return result;
  }

  // ── timers ───────────────────────────────────────────────────────────────

  function mortarTimeline(mortar, fromLoad) {
    var start = fromLoad ? mortar.loadDelay : 0;
    return [
      { at: start, event: 'fired' },
      { at: start + mortar.travelDelay, event: 'travelSound', range: mortar.warnRange },
      { at: start + mortar.travelDelay + mortar.impactWarningDelay, event: 'impactWarning', range: mortar.impactWarnRange },
      { at: start + mortar.travelDelay + mortar.impactDelay, event: 'impact' }
    ];
  }

  function obTimeline(ob) {
    var t = ob.timeline;
    return [
      { at: t.fire, event: 'warning', range: ob.warnRanges[0] },
      { at: t.warnOne, event: 'warning', range: ob.warnRanges[1] },
      { at: t.warnTwo, event: 'warning', range: ob.warnRanges[2] },
      { at: t.impact, event: 'impact' }
    ];
  }

  function timelineState(timeline, elapsed) {
    var next = null;
    for (var i = 0; i < timeline.length; i++) {
      if (timeline[i].at > elapsed) { next = timeline[i]; break; }
    }
    var end = timeline[timeline.length - 1].at;
    return { done: elapsed >= end, remaining: Math.max(0, end - elapsed), next: next };
  }

  // A recorded shot's clock: seconds since the button was pressed decide the
  // state, so a tab that was hidden for a while shows the truth on return.
  function shotState(shot, mortar, now) {
    var timeline = mortarTimeline(mortar, !!shot.fromLoad);
    var elapsed = (now - shot.at) / 1000;
    var state = timelineState(timeline, elapsed);
    state.elapsed = elapsed;
    state.timeline = timeline;
    return state;
  }

  // The orbital cannon's clock after a launch: warnings at 12/16/20 s, impact
  // at 24 s, then the fire cooldown counted from the impact.
  function obState(ob, firedAt, now) {
    if (typeof firedAt !== 'number') return { phase: 'ready', remaining: 0, next: null };
    var elapsed = (now - firedAt) / 1000;
    var timeline = obTimeline(ob);
    var st = timelineState(timeline, elapsed);
    if (!st.done) return { phase: 'flight', remaining: st.remaining, next: st.next, elapsed: elapsed };
    var sinceImpact = elapsed - ob.timeline.impact;
    if (sinceImpact < ob.cooldown) return { phase: 'cooldown', remaining: ob.cooldown - sinceImpact, next: null, elapsed: elapsed };
    return { phase: 'ready', remaining: 0, next: null, elapsed: elapsed };
  }

  // The dial the mortar holds now: whatever the last recorded shot set.
  function currentDial(shots) {
    var last = shots && shots.length ? shots[shots.length - 1] : null;
    return last ? last.dial.slice() : [0, 0];
  }

  // The in-game aim point of a shot: target plus dial, both in game coordinates.
  function shotAim(shot) {
    return [shot.target[0] + shot.dial[0], shot.target[1] + shot.dial[1]];
  }

  // ── OB and supply ────────────────────────────────────────────────────────

  function obScatterBox(target, ob, misfuel) {
    var k = (misfuel || 0) + 1;
    return { minX: target[0] + k * ob.scatter[0], maxX: target[0] + k * ob.scatter[1],
             minY: target[1] + k * ob.scatter[0], maxY: target[1] + k * ob.scatter[1] };
  }

  function obChecks(planet, target, ob) {
    var reasons = [], warnings = [];
    var area = areaAt(planet, target[0], target[1]);
    if (!area) reasons.push('noArea');
    else if (!strikeAllowed(planet, 'ob', target[0], target[1])) reasons.push('obBlocked');
    if (maskAt(planet, 'hardWall', target[0], target[1])) warnings.push('wallRedirect');
    var box = obScatterBox(target, ob, 0), outside = 0, total = 0;
    for (var x = box.minX; x <= box.maxX; x++) {
      for (var y = box.minY; y <= box.maxY; y++) {
        total++;
        if (!strikeAllowed(planet, 'ob', x, y)) outside++;
      }
    }
    if (outside) warnings.push('scatterOutsideOb');
    return { ok: reasons.length === 0, reasons: reasons, warnings: warnings, box: box, outside: outside, total: total };
  }

  function supplyChecks(planet, target) {
    var reasons = [];
    var area = areaAt(planet, target[0], target[1]);
    if (!area) reasons.push('noArea');
    else if (!(area[3] & FLAGS.SUPPLY)) reasons.push('underground');
    if (maskAt(planet, 'blocked', target[0], target[1])) reasons.push('blocked');
    return { ok: reasons.length === 0, reasons: reasons };
  }

  // Roof structures (hive core, pylon) block strikes around them. AreaSystem.IsRoofed
  // measures from the aim point (tile corner) to the structure's tile centre.
  function roofedFlags(roofMarkers, target, roofing) {
    var blocked = 0;
    (roofMarkers || []).forEach(function (m) {
      var roof = roofing.filter(function (r) { return r.proto === m.proto; })[0];
      if (!roof) return;
      var dx = target[0] - (m.x + 0.5), dy = target[1] - (m.y + 0.5);
      if (Math.sqrt(dx * dx + dy * dy) <= roof.range) {
        var allows = roof.allows || [];
        if (allows.indexOf('OB') < 0) blocked |= FLAGS.OB;
        if (allows.indexOf('CAS') < 0) blocked |= FLAGS.CAS;
        if (allows.indexOf('mortarFire') < 0) blocked |= FLAGS.MORTAR_FIRE;
        if (allows.indexOf('mortarPlacement') < 0) blocked |= FLAGS.MORTAR_PLACE;
        if (allows.indexOf('supplyDrop') < 0) blocked |= FLAGS.SUPPLY;
      }
    });
    return blocked;
  }

  // ── calibration check ────────────────────────────────────────────────────

  // The tile the page suggests after a calibration: a discriminating neighbour
  // that exists on the planet and is not a wall or window, so the rangefinder
  // lands on open floor. Tiles the player already tried are skipped.
  function pickCheckTile(planet, first, tried) {
    var skip = tried || [];
    var list = checkTileCandidates(first);
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (skip.some(function (s) { return sameVec(s, t); })) continue;
      if (!areaAt(planet, t[0], t[1]) || maskAt(planet, 'blocked', t[0], t[1])) continue;
      return t;
    }
    return null;
  }

  // ── round lifetime ───────────────────────────────────────────────────────

  var STALE_AFTER_MS = 20 * 60 * 1000;

  // Whether the page may trust the offset in this page load. A second monitor
  // never goes hidden, so staleness is measured between inputs, not by visibility.
  //   fromStorage — the calibration was read back, not made in this load;
  //   confirmed   — the player calibrated or answered «same round» in this load;
  //   idleGap     — two inputs on the page were more than 20 minutes apart;
  //   offPlanet   — a typed coordinate fell off the planet under this offset.
  function newSession(now, fromStorage) {
    return { fromStorage: !!fromStorage, confirmed: false, idleGap: false, offPlanet: false, lastInput: now };
  }

  function noteInput(session, now) {
    if (now - session.lastInput > STALE_AFTER_MS) session.idleGap = true;
    session.lastInput = now;
    return session;
  }

  function confirmSameRound(session, now) {
    session.confirmed = true;
    session.idleGap = false;
    session.offPlanet = false;
    session.lastInput = now;
    return session;
  }

  function calibrationState(calibration, now, session) {
    if (!calibration || !calibration.offset) return { calibrated: false, askSameRound: false, reasons: [] };
    var s = session || newSession(now, false);
    var reasons = [];
    if (s.fromStorage && !s.confirmed) reasons.push('reload');
    if (s.idleGap || now - s.lastInput > STALE_AFTER_MS) reasons.push('idle');
    if (s.offPlanet) reasons.push('offPlanet');
    return { calibrated: true, ageMs: Math.max(0, now - (calibration.at || now)), askSameRound: reasons.length > 0, reasons: reasons };
  }

  // Whether the calibration block may fold into one line: an offset exists, its
  // check tile agreed (or there was none to check), the offset is within the
  // server's variance and the page is not asking «same round?».
  function calCollapsible(calibration, calState, variance) {
    if (!calibration || !isTile(calibration.offset) || !calState) return false;
    if (calibration.check && calibration.check.result !== 'match') return false;
    if (calibrationIssues(calibration.offset, variance).length) return false;
    return !calState.askSameRound;
  }

  // ── storage ──────────────────────────────────────────────────────────────

  var STORAGE_VERSION = 1;

  function isTile(p) {
    return Array.isArray(p) && p.length === 2 && p.every(function (n) {
      return typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
    });
  }

  // Page preferences shared by every planet: weapon, shell, a player's own hit
  // radius per shell, and which layers are on. Unknown keys are dropped.
  var PREFS_VERSION = 1;
  var LAYER_KEYS = ['fire', 'deploy', 'rings', 'zone', 'markers', 'grid', 'inserts', 'landmarks'];
  var DEFAULT_LAYERS = { fire: true, deploy: false, rings: true, zone: true, markers: true, grid: true, inserts: true, landmarks: true };

  // Landmark categories (T11) in display order. A category that stays put is
  // shown by default; one the round may move (racks, crates, vending machines,
  // tanks) is hidden until the player asks for it.
  var LANDMARK_CATS = [
    { id: 'light', reliable: true }, { id: 'tree', reliable: true }, { id: 'table', reliable: true },
    { id: 'closet', reliable: true }, { id: 'bed', reliable: true }, { id: 'power', reliable: true },
    { id: 'door', reliable: true },
    { id: 'rack', reliable: false }, { id: 'crate', reliable: false }, { id: 'vending', reliable: false },
    { id: 'tank', reliable: false }
  ];

  // ── grid and ruler ───────────────────────────────────────────────────────

  // Grid lines every 10 tiles read well from ~4 px per tile; below that every 50.
  function gridStep(scale) { return scale >= 4 ? 10 : 50; }

  // World x (or y) of every grid line inside [lo, hi] whose in-game number is a
  // multiple of the step — so the labels are round in-game numbers.
  function gridLines(lo, hi, step, offset) {
    var out = [];
    var first = Math.ceil((lo + offset) / step) * step - offset;
    for (var v = first; v <= hi; v += step) out.push(v);
    return out;
  }

  // Straight-line distance between two tiles, centre to centre, in tiles.
  function rulerDistance(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    return { tiles: Math.sqrt(dx * dx + dy * dy), dx: dx, dy: dy };
  }

  function migratePrefs(raw) {
    var out = { v: PREFS_VERSION, weapon: 'mortar', shell: null, warhead: null, hitRadius: {}, layers: {}, landmarks: {}, timerFrom: 'fire' };
    LAYER_KEYS.forEach(function (k) { out.layers[k] = DEFAULT_LAYERS[k]; });
    LANDMARK_CATS.forEach(function (c) { out.landmarks[c.id] = c.reliable; });
    if (!raw || typeof raw !== 'object' || raw.v !== PREFS_VERSION) return out;
    if (raw.weapon === 'mortar' || raw.weapon === 'ob' || raw.weapon === 'supply') out.weapon = raw.weapon;
    if (raw.timerFrom === 'load') out.timerFrom = 'load';
    if (typeof raw.shell === 'string' && raw.shell) out.shell = raw.shell;
    if (typeof raw.warhead === 'string' && raw.warhead) out.warhead = raw.warhead;
    if (raw.hitRadius && typeof raw.hitRadius === 'object') {
      Object.keys(raw.hitRadius).forEach(function (k) {
        var r = raw.hitRadius[k];
        if (typeof r === 'number' && isFinite(r) && r >= 0 && r <= 100) out.hitRadius[k] = r;
      });
    }
    if (raw.layers && typeof raw.layers === 'object') {
      LAYER_KEYS.forEach(function (k) { if (typeof raw.layers[k] === 'boolean') out.layers[k] = raw.layers[k]; });
    }
    if (raw.landmarks && typeof raw.landmarks === 'object') {
      LANDMARK_CATS.forEach(function (c) { if (typeof raw.landmarks[c.id] === 'boolean') out.landmarks[c.id] = raw.landmarks[c.id]; });
    }
    return out;
  }

  // Whatever localStorage held for a planet becomes a valid state. An unknown
  // version, or a calibration whose numbers disagree with each other, is
  // dropped rather than repaired. Shots and markers are validated by their own
  // increments (T5, T6) and pass through as arrays.
  function migrateStorage(raw) {
    var out = { v: STORAGE_VERSION, calibration: null, mortar: null, target: null, shots: [], markers: [], shapes: [], ob: null };
    if (!raw || typeof raw !== 'object' || raw.v !== STORAGE_VERSION) return out;
    if (raw.mortar && isTile(raw.mortar.tile)) {
      out.mortar = { tile: raw.mortar.tile.slice(), mode: raw.mortar.mode === 'laser' ? 'laser' : 'coordinates' };
    }
    if (isTile(raw.target)) out.target = raw.target.slice();
    if (raw.ob && typeof raw.ob === 'object' && typeof raw.ob.firedAt === 'number' && isFinite(raw.ob.firedAt) && isTile(raw.ob.target)) {
      out.ob = { firedAt: raw.ob.firedAt, target: raw.ob.target.slice(),
                 warhead: typeof raw.ob.warhead === 'string' ? raw.ob.warhead : null,
                 radius: typeof raw.ob.radius === 'number' && isFinite(raw.ob.radius) ? raw.ob.radius : null };
    }
    var c = raw.calibration;
    if (c && isTile(c.tile) && isTile(c.reading) && isTile(c.offset) && typeof c.at === 'number' &&
        sameVec(offsetFrom(c.tile, c.reading), c.offset)) {
      var k = c.check;
      var checkOk = k && isTile(k.tile) && isTile(k.expect) &&
        (k.result === null || k.result === 'match' || k.result === 'mismatch') &&
        sameVec(worldToGame(c.offset, k.tile[0], k.tile[1]), k.expect);
      out.calibration = {
        tile: c.tile.slice(), reading: c.reading.slice(), offset: c.offset.slice(), at: c.at,
        check: checkOk
          ? { tile: k.tile.slice(), expect: k.expect.slice(), result: k.result,
              tried: (Array.isArray(k.tried) ? k.tried : []).filter(isTile) }
          : null
      };
    }
    if (Array.isArray(raw.shots)) out.shots = raw.shots.map(validShot).filter(Boolean);
    if (Array.isArray(raw.markers)) {
      out.markers = raw.markers.map(function (m, i) { return validMarker(m, 'm' + i); }).filter(Boolean);
    }
    if (Array.isArray(raw.shapes)) {
      out.shapes = raw.shapes.map(function (s, i) { return validShape(s, 's' + i); }).filter(Boolean);
    }
    return out;
  }

  // ── markers, lines and areas ─────────────────────────────────────────────

  var MARKER_CATS = ['mortar', 'cas', 'supply', 'ob', 'custom'];
  var LABEL_MAX = 40;

  function cleanLabel(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);
  }

  // Markers live in world tiles, so they outlive the round's offset; `h` is the
  // planet data they were placed on — a marker from an older map is flagged.
  function validMarker(m, fallbackId) {
    if (!m || typeof m !== 'object' || !isTile([m.x, m.y])) return null;
    return {
      id: m.id ? String(m.id) : fallbackId,
      cat: MARKER_CATS.indexOf(m.cat) >= 0 ? m.cat : 'custom',
      label: cleanLabel(m.label),
      x: m.x, y: m.y,
      h: typeof m.h === 'string' ? m.h : null,
      at: typeof m.at === 'number' && isFinite(m.at) ? m.at : 0
    };
  }

  function validShape(s, fallbackId) {
    if (!s || typeof s !== 'object' || (s.kind !== 'line' && s.kind !== 'area')) return null;
    var points = (Array.isArray(s.points) ? s.points : []).filter(isTile).map(function (p) { return p.slice(); });
    if (points.length < (s.kind === 'area' ? 3 : 2)) return null;
    return {
      id: s.id ? String(s.id) : fallbackId,
      kind: s.kind,
      cat: MARKER_CATS.indexOf(s.cat) >= 0 ? s.cat : 'custom',
      label: cleanLabel(s.label),
      points: points,
      h: typeof s.h === 'string' ? s.h : null,
      at: typeof s.at === 'number' && isFinite(s.at) ? s.at : 0
    };
  }

  // The line a player pastes into chat: the label and the in-game numbers of
  // every point (world tiles without an offset, when nothing is calibrated).
  function chatText(item, offset, fallbackLabel) {
    var conv = function (p) { return formatCoords(offset ? worldToGame(offset, p[0], p[1]) : p); };
    var label = item.label || fallbackLabel || '';
    if (item.points) {
      return (label ? label + ': ' : '') + item.points.map(conv).join(item.kind === 'line' ? ' → ' : ', ');
    }
    return (label ? label + ' ' : '') + conv([item.x, item.y]);
  }

  // Variable insert zones covering a tile: the planet's MapInsert markers whose
  // variation footprints contain it, with the odds the round shows them.
  // Inserts whose variants can change the tile: one entry per marker with the
  // summed odds of the variants covering the tile and, apart, the share that
  // needs a scenario tag ('none' is the game's tag for "no special scenario").
  function insertsAt(planet, x, y) {
    var out = [];
    (planet.json.inserts || []).forEach(function (ins) {
      var p = 0, parts = {};
      ins.zones.forEach(function (z) {
        var b = z.bounds;
        if (!(z.p > 0) || x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return;
        p += z.p;
        if (z.scenario) parts[z.scenario] = (parts[z.scenario] || 0) + z.p;
      });
      if (p > 0) out.push({ name: ins.name, p: Math.min(1, Math.round(p * 1e4) / 1e4),
        parts: Object.keys(parts).map(function (s) { return { scenario: s, p: Math.round(parts[s] * 1e4) / 1e4 }; }) });
    });
    return out;
  }

  // Variant rectangles for drawing: variants of one marker that share a footprint
  // are one hatched box labelled with their summed odds.
  function insertBoxes(planet) {
    var out = [];
    (planet.json.inserts || []).forEach(function (ins) {
      var byKey = {};
      ins.zones.forEach(function (z) {
        if (!(z.p > 0)) return;
        var b = z.bounds, key = [b.minX, b.minY, b.maxX, b.maxY].join(',');
        if (!byKey[key]) { byKey[key] = { name: ins.name, bounds: b, p: 0 }; out.push(byKey[key]); }
        byKey[key].p = Math.min(1, Math.round((byKey[key].p + z.p) * 1e4) / 1e4);
      });
    });
    return out;
  }

  function shapeCentre(points) {
    var sx = 0, sy = 0;
    points.forEach(function (p) { sx += p[0] + 0.5; sy += p[1] + 0.5; });
    return [sx / points.length, sy / points.length];
  }

  // A shot as the page records it: target and dial in game coordinates, the
  // mortar tile it was fired from, the clock it was stamped with, its impacts.
  function validShot(s) {
    if (!s || typeof s !== 'object' || !isTile(s.target) || !isTile(s.dial) || !isTile(s.mortarTile)) return null;
    if (typeof s.at !== 'number' || !isFinite(s.at) || typeof s.n !== 'number') return null;
    return {
      id: typeof s.id === 'string' ? s.id : String(s.n),
      n: s.n,
      target: s.target.slice(),
      dial: s.dial.slice(),
      at: s.at,
      fromLoad: !!s.fromLoad,
      mortarTile: s.mortarTile.slice(),
      mode: s.mode === 'laser' ? 'laser' : 'coordinates',
      shell: typeof s.shell === 'string' ? s.shell : null,
      radius: typeof s.radius === 'number' && isFinite(s.radius) ? s.radius : null,
      impacts: (Array.isArray(s.impacts) ? s.impacts : []).filter(isTile).map(function (p) { return p.slice(); }),
      // reported impacts too far from the target to be this shell: kept for the eye, not for the maths
      doubtful: (Array.isArray(s.doubtful) ? s.doubtful : []).filter(isTile).map(function (p) { return p.slice(); })
    };
  }

  root.TacticalLogic = {
    STORAGE_VERSION: STORAGE_VERSION,
    PREFS_VERSION: PREFS_VERSION,
    LAYER_KEYS: LAYER_KEYS,
    pickCheckTile: pickCheckTile,
    newSession: newSession,
    noteInput: noteInput,
    confirmSameRound: confirmSameRound,
    migrateStorage: migrateStorage,
    migratePrefs: migratePrefs,
    gridStep: gridStep,
    gridLines: gridLines,
    rulerDistance: rulerDistance,
    validShot: validShot,
    MARKER_CATS: MARKER_CATS,
    LABEL_MAX: LABEL_MAX,
    cleanLabel: cleanLabel,
    validMarker: validMarker,
    validShape: validShape,
    chatText: chatText,
    shapeCentre: shapeCentre,
    insertsAt: insertsAt,
    insertBoxes: insertBoxes,
    LANDMARK_CATS: LANDMARK_CATS,
    landmarksAt: landmarksAt,
    visibleLandmarks: visibleLandmarks,
    impactBox: impactBox,
    shotState: shotState,
    obState: obState,
    currentDial: currentDial,
    shotAim: shotAim,
    FLAGS: FLAGS,
    STALE_AFTER_MS: STALE_AFTER_MS,
    worldToGame: worldToGame,
    gameToWorld: gameToWorld,
    offsetFrom: offsetFrom,
    calibrationIssues: calibrationIssues,
    isDiscriminating: isDiscriminating,
    checkTileCandidates: checkTileCandidates,
    formatCoords: formatCoords,
    parseCoords: parseCoords,
    decodeRows: decodeRows,
    preparePlanet: preparePlanet,
    areaAt: areaAt,
    flagsAt: flagsAt,
    maskAt: maskAt,
    strikeAllowed: strikeAllowed,
    distance: distance,
    errorBounds: errorBounds,
    zeroErrorSpan: zeroErrorSpan,
    placementCheck: placementCheck,
    mortarFireChecks: mortarFireChecks,
    estimateError: estimateError,
    impactPlausible: impactPlausible,
    fireVariants: fireVariants,
    mortarTimeline: mortarTimeline,
    obTimeline: obTimeline,
    timelineState: timelineState,
    obScatterBox: obScatterBox,
    obChecks: obChecks,
    supplyChecks: supplyChecks,
    roofedFlags: roofedFlags,
    calibrationState: calibrationState,
    calCollapsible: calCollapsible,
    isTile: isTile
  };
})(typeof window !== 'undefined' ? window : this);

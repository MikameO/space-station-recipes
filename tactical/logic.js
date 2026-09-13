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

  function checkTileCandidates(first) {
    var steps = [[3, 1], [1, 3], [-3, 1], [1, -3], [-3, -1], [-1, -3], [3, -1], [-1, 3], [4, 2], [2, 4]];
    return steps.map(function (s) { return [first[0] + s[0], first[1] + s[1]]; });
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
      hardWall: decodeRows(json.masks.hardWall, width)
    };
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

  function zeroErrorSpan(mortarTile, tilesPerOffset) {
    return {
      minX: mortarTile[0] - tilesPerOffset + 1, maxX: mortarTile[0] + tilesPerOffset,
      minY: mortarTile[1] - tilesPerOffset + 1, maxY: mortarTile[1] + tilesPerOffset
    };
  }

  function placementCheck(planet, tile) {
    var area = areaAt(planet, tile[0], tile[1]);
    if (!area) return { ok: false, reasons: ['noArea'] };
    return (area[3] & FLAGS.MORTAR_PLACE) ? { ok: true, reasons: [] } : { ok: false, reasons: ['indoors'] };
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
      if (!(area[3] & FLAGS.MORTAR_FIRE)) reasons.push('covered');
      if (laser && !(area[3] & FLAGS.CAS)) reasons.push('noCas');
      if (laser && !(area[3] & FLAGS.LASING)) reasons.push('noLasing');
    }
    if (!reasons.length && (bounds[0] || bounds[1])) {
      var far = 0, near = Infinity;
      [-bounds[0], bounds[0]].forEach(function (ex) {
        [-bounds[1], bounds[1]].forEach(function (ey) {
          var d = distance(mortarTile, [target[0] + ex, target[1] + ey]);
          far = Math.max(far, d); near = Math.min(near, d);
        });
      });
      if (far > mortar.maxRange) warnings.push('errorMayExceedMaxRange');
      if (near < mortar.minRange) warnings.push('errorMayUndercutMinRange');
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
    var target = gameToWorld(opts.offset, opts.gameTarget[0], opts.gameTarget[1]);
    var current = opts.currentDial || [0, 0];
    var result = {
      newTarget: {
        target: opts.gameTarget.slice(),
        dial: [0, 0],
        resetDial: !sameVec(current, [0, 0]),
        currentDial: current.slice(),
        checks: opts.planet && opts.mortarTile ? mortarFireChecks(opts.planet, opts.mortarTile, target, mortar, 'coordinates') : null
      },
      dial: null
    };
    var last = opts.lastShot;
    if (last) {
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
    else if (!(area[3] & FLAGS.OB)) reasons.push('obBlocked');
    if (maskAt(planet, 'hardWall', target[0], target[1])) warnings.push('wallRedirect');
    var box = obScatterBox(target, ob, 0), outside = 0, total = 0;
    for (var x = box.minX; x <= box.maxX; x++) {
      for (var y = box.minY; y <= box.maxY; y++) {
        total++;
        if (!(flagsAt(planet, x, y) & FLAGS.OB)) outside++;
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

  // ── round lifetime ───────────────────────────────────────────────────────

  var STALE_AFTER_MS = 20 * 60 * 1000;

  function calibrationState(calibration, now, reloaded) {
    if (!calibration || !calibration.offset) return { calibrated: false };
    var idle = now - (calibration.lastInput || calibration.at || 0);
    return {
      calibrated: true,
      ageMs: now - (calibration.at || now),
      askSameRound: !!reloaded && !calibration.confirmedThisLoad || idle > STALE_AFTER_MS
    };
  }

  root.TacticalLogic = {
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
    calibrationState: calibrationState
  };
})(typeof window !== 'undefined' ? window : this);

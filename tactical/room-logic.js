// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Room semantics shared by tactical/room.js (browser) and worker/room/*.js
// (Cloudflare Worker): the op log, rights by policy, expiry, clocks and codes.
// No DOM, no fetch. Contract: docs/design/2026-09-13-tactical-tablet.md,
// section «Поправки по итогам war-room». Tests: scripts/test_room_logic.js.
(function (root) {
  'use strict';

  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;
  var REQUEST_TYPES = ['mortar', 'position', 'ob', 'cas', 'supply', 'medevac', 'other'];
  var REQUEST_FLOW = {
    requested: ['accepted', 'denied'],
    accepted: ['loaded', 'firing', 'done', 'denied'],
    loaded: ['firing', 'denied'],
    firing: ['done', 'denied'],
    done: [],
    denied: []
  };
  var KIND_LAYER = { request: 'requests', asset: 'assets', calibration: 'shared' };
  // Which asset a request type is aimed at: CAS requests belong to the dropship pilot.
  var REQUEST_ASSET = { mortar: 'mortar', position: 'mortar', ob: 'ob', cas: 'dropship', supply: 'supply', medevac: 'medevac' };

  function createState(seq) {
    return { seq: seq || 0, objects: {}, members: {}, epoch: 0, locked: false, closed: false, frozenAt: null };
  }

  function postDef(policy, post) {
    for (var i = 0; i < policy.posts.length; i++) if (policy.posts[i].id === post) return policy.posts[i];
    return null;
  }
  function levelOf(policy, post) { var d = postDef(policy, post); return d ? d.level : null; }
  function isStaff(policy, member) { return levelOf(policy, member.post) === 'staff'; }

  function assetDef(policy, type) {
    for (var i = 0; i < policy.assets.length; i++) if (policy.assets[i].type === type) return policy.assets[i];
    return null;
  }
  function assetOwnerPost(policy, type) { var d = assetDef(policy, type); return d ? d.owner : null; }
  function assetTypeOf(obj) { return obj.kind === 'request' ? (REQUEST_ASSET[obj.type] || null) : obj.type; }

  // extra.claimed: clients holding a claim on an asset of obj's type (see claimants()).
  function hasRight(policy, member, right, obj, extra) {
    var who = policy.rights[right] || [];
    var level = levelOf(policy, member.post);
    if (who.indexOf(level) >= 0) return true;
    if (who.indexOf('asset-owner') >= 0 && obj) {
      var type = assetTypeOf(obj);
      if (type && assetOwnerPost(policy, type) === member.post) return true;
      if (extra && extra.claimed && extra.claimed.indexOf(member.client) >= 0) return true;
      if (obj.claimedBy && obj.claimedBy === member.client) return true;
    }
    return false;
  }

  function claimants(objects, obj) {
    var type = obj ? assetTypeOf(obj) : null, out = [];
    if (!type) return out;
    for (var id in objects) {
      var o = objects[id];
      if (o.kind === 'asset' && !o.deleted && o.type === type && o.claimedBy) out.push(o.claimedBy);
    }
    return out;
  }

  function layerWritable(policy, member, layer) {
    var level = levelOf(policy, member.post);
    var key = layer.indexOf('squad:') === 0 ? 'squad:*' : layer;
    var def = policy.layers[key];
    if (!def || def.write.indexOf(level) < 0) return false;
    if (key === 'squad:*' && layer !== 'squad:' + member.squad) return false;
    return true;
  }

  // {ok:true} or {ok:false, reason}. `existing` is the current object for patch/del;
  // `extra` is {claimed: claimants(objects, existing)} for request patches.
  function canWrite(policy, member, op, existing, extra) {
    if (!member || !member.confirmed) return { ok: false, reason: 'unconfirmed' };
    var level = levelOf(policy, member.post);
    if (!level || level === 'observer') return { ok: false, reason: 'level' };
    var kind = op.kind;
    if (kind === 'calibration') return hasRight(policy, member, 'publishCalibration') ? { ok: true } : { ok: false, reason: 'right' };
    if (op.op === 'del') {
      if (!existing) return { ok: false, reason: 'missing' };
      if (existing.by && existing.by.client === member.client) return { ok: true };
      return hasRight(policy, member, 'kick') ? { ok: true } : { ok: false, reason: 'right' };
    }
    if (kind === 'request') {
      if (op.op === 'put') return layerWritable(policy, member, 'requests') ? { ok: true } : { ok: false, reason: 'layer' };
      if (!existing) return { ok: false, reason: 'missing' };
      var d = op.data || {};
      var author = existing.by && existing.by.client === member.client;
      if (d.status === 'denied' && existing.status === 'requested' && author) return { ok: true };
      if (d.status === 'loaded') {
        var def = assetDef(policy, assetTypeOf(existing));
        return (def && def.loader === member.post) || isStaff(policy, member) ? { ok: true } : { ok: false, reason: 'right' };
      }
      if (d.status !== undefined) return hasRight(policy, member, 'acceptRequest', existing, extra) ? { ok: true } : { ok: false, reason: 'right' };
      if (d.flags !== undefined || d.note !== undefined || d.relayed !== undefined) return { ok: true };
      return author ? { ok: true } : { ok: false, reason: 'right' };
    }
    if (kind === 'asset') {
      // Claiming a crew seat: staff, services, or a squad member labelled «mortar crew».
      var claimOnly = op.op === 'patch' && op.data && Object.keys(op.data).join() === 'claimedBy';
      if (claimOnly) {
        var crew = (member.functions || []).indexOf('mortar') >= 0 || level !== 'squad';
        return crew ? { ok: true } : { ok: false, reason: 'right' };
      }
      if (!layerWritable(policy, member, 'assets')) return { ok: false, reason: 'layer' };
      if (op.op === 'put') return { ok: true };
      var owner = existing && ((existing.owner && existing.owner.post === member.post) || existing.claimedBy === member.client);
      return owner || isStaff(policy, member) ? { ok: true } : { ok: false, reason: 'right' };
    }
    // marker / line / area: anyone confirmed may mark an enemy still there or relayed
    if (op.op === 'patch' && existing) {
      var keys = Object.keys(op.data || {});
      if (keys.length && keys.every(function (k) { return k === 'confirmedAt' || k === 'relayed'; })) return { ok: true };
    }
    var layer = (op.data && op.data.layer) || (existing && existing.layer);
    if (!layer || !layerWritable(policy, member, layer)) return { ok: false, reason: 'layer' };
    if (op.op === 'patch' && existing && existing.by && existing.by.client !== member.client && !isStaff(policy, member)) {
      return { ok: false, reason: 'right' };
    }
    return { ok: true };
  }

  // Applies a server-stamped op {seq, at, by, op, kind, id, data, expectedStatus}.
  function applyOp(state, op) {
    if (state.closed) return { ok: false, reason: 'closed' };
    var cur = state.objects[op.id];
    if (op.op === 'put') {
      if (cur && cur.deleted) return { ok: false, reason: 'deleted' };
      var obj = {};
      var data = op.data || {};
      for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) obj[k] = data[k];
      obj.id = op.id; obj.kind = op.kind; obj.seq = op.seq; obj.at = op.at; obj.by = op.by;
      if (op.kind === 'request' && !obj.status) obj.status = 'requested';
      if (!obj.layer) obj.layer = KIND_LAYER[op.kind] || obj.layer;
      state.objects[op.id] = obj;
    } else if (op.op === 'patch') {
      if (!cur) return { ok: false, reason: 'missing' };
      if (cur.deleted) return { ok: false, reason: 'deleted' };
      if (op.expectedStatus !== undefined && cur.status !== op.expectedStatus) return { ok: false, reason: 'status' };
      var d = op.data || {};
      if (d.status !== undefined && cur.kind === 'request') {
        var allowed = REQUEST_FLOW[cur.status] || [];
        if (allowed.indexOf(d.status) < 0) return { ok: false, reason: 'transition' };
      }
      for (var j in d) if (Object.prototype.hasOwnProperty.call(d, j)) cur[j] = d[j];
      cur.seq = op.seq;
    } else if (op.op === 'del') {
      if (!cur) return { ok: false, reason: 'missing' };
      cur.deleted = true; cur.seq = op.seq; cur.deletedAt = op.at;
    } else {
      return { ok: false, reason: 'op' };
    }
    if (op.seq > state.seq) state.seq = op.seq;
    return { ok: true };
  }

  function markerAge(obj, now) { return (now - (obj.confirmedAt || obj.at)) / 1000; }
  function expired(obj, policy, now) {
    return obj.kind === 'marker' && obj.cat === 'enemy' && markerAge(obj, now) > (obj.ttl || policy.ttl.enemyMarkerSec);
  }
  function enemyAlpha(ageSec, ttlSec) { var a = 1 - ageSec / ttlSec; return Math.max(0.25, Math.min(1, Math.round(a * 100) / 100)); }

  // filters: {layers:[...], posts:[...], kinds:[...], maxAgeSec}
  function visibleObjects(state, policy, now, filters) {
    var f = filters || {};
    var out = [];
    for (var id in state.objects) {
      var o = state.objects[id];
      if (o.deleted || expired(o, policy, now)) continue;
      if (f.layers && f.layers.indexOf(o.layer) < 0) continue;
      if (f.posts && !(o.by && f.posts.indexOf(o.by.post) >= 0)) continue;
      if (f.kinds && f.kinds.indexOf(o.kind) < 0) continue;
      if (f.maxAgeSec && (now - o.at) / 1000 > f.maxAgeSec) continue;
      out.push(o);
    }
    out.sort(function (a, b) { return a.seq - b.seq; });
    return out;
  }

  function clockOffset(sentAt, receivedAt, serverNow) { return serverNow - (sentAt + (receivedAt - sentAt) / 2); }
  function serverNowEst(offset, now) { return now + offset; }
  function countdown(deadlineAt, nowEst) { return Math.max(0, Math.round((deadlineAt - nowEst) / 100) / 10); }

  // Hints only: nothing switches state by itself. impactAt/readyAt in ms of server time.
  function deadlines(type, firedAt, constants, policy) {
    var c = constants || {};
    if (type === 'mortar') return { impactAt: firedAt + ((c.mortar.travelDelay + c.mortar.impactDelay) * 1000), readyAt: null };
    if (type === 'ob') return { impactAt: firedAt + c.ob.timeline.impact * 1000, readyAt: firedAt + (c.ob.timeline.impact + c.ob.cooldown) * 1000 };
    var asset = null;
    for (var i = 0; i < policy.assets.length; i++) if (policy.assets[i].type === type) asset = policy.assets[i];
    if (type === 'supply') return { impactAt: null, readyAt: asset ? firedAt + asset.cooldownSec * 1000 : null };
    if (type === 'dropship') return { impactAt: null, readyAt: asset ? firedAt + asset.flyBySec * 1000 : null };
    return { impactAt: null, readyAt: null };
  }

  function cleanText(s, max) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  // null when acceptable, otherwise the failing field name.
  function validateData(policy, kind, data) {
    var L = policy.limits;
    if (!data || typeof data !== 'object') return 'data';
    if (data.label !== undefined && String(data.label).length > L.label) return 'label';
    if (data.note !== undefined && String(data.note).length > L.note) return 'note';
    if (data.callsign !== undefined && String(data.callsign).length > L.callsign) return 'callsign';
    if (kind === 'line' || kind === 'area') {
      if (!Array.isArray(data.points) || data.points.length > L.points) return 'points';
      if (data.points.length < (kind === 'area' ? 3 : 2)) return 'points';
    }
    if (kind === 'marker' && (typeof data.x !== 'number' || typeof data.y !== 'number')) return 'xy';
    if (kind === 'request') {
      if (REQUEST_TYPES.indexOf(data.type) < 0) return 'type';
      if (!data.target || typeof data.target.x !== 'number' || typeof data.target.y !== 'number') return 'target';
      if (data.flags !== undefined && !Array.isArray(data.flags)) return 'flags';
    }
    return null;
  }

  function parseEntry(str) {
    var s = String(str || '').trim().toUpperCase().replace(/\s+/g, '');
    var parts = s.split('-');
    if (parts.length > 2 || !parts[0]) return null;
    if (!CODE_RE.test(parts[0]) || (parts[1] !== undefined && !CODE_RE.test(parts[1]))) return null;
    return { code: parts[0], postCode: parts[1] || null };
  }
  function randomCode(len, rng) {
    var r = rng || Math.random, out = '';
    for (var i = 0; i < len; i++) out += CODE_ALPHABET.charAt(Math.floor(r() * CODE_ALPHABET.length));
    return out;
  }

  function levelStyle(policy, member) {
    var level = levelOf(policy, member.post) || 'observer';
    var lv = policy.levels[level];
    var color = lv.color === 'squad' ? ((policy.squads[member.squad] || {}).color || '#ffffff') : lv.color;
    return { width: lv.line ? lv.line.width : 0, dash: lv.line ? lv.line.dash.slice() : [], marker: lv.marker, color: color, level: level };
  }
  function markerShape(policy, obj, member) {
    if (obj.cat === 'enemy') return policy.enemy.marker;
    return levelStyle(policy, member).marker;
  }

  function retryAfter(lastOpAt, now) { return now - lastOpAt < 60000 ? 2 : 10; }
  function roomDeadlines(policy, createdAt, extended) {
    var maxAt = createdAt + (policy.ttl.roomMaxSec + (extended ? policy.ttl.roomExtendSec : 0)) * 1000;
    return { maxAt: maxAt, warnAt: maxAt - 20 * 60 * 1000 };
  }
  function idleLocked(policy, lastOpAt, now) { return now - lastOpAt >= policy.ttl.roomIdleLockSec * 1000; }
  function memberStale(policy, lastSeenAt, now) { return now - lastSeenAt >= policy.ttl.memberIdleSec * 1000; }
  function mergePending(pending, ackedCids) {
    return pending.filter(function (o) { return ackedCids.indexOf(o.cid) < 0; });
  }

  // Buttons a member gets on a request card, by state and rights. `extra` as in hasRight.
  function requestActions(policy, member, req, extra) {
    if (!member || !member.confirmed || req.deleted) return [];
    var owner = hasRight(policy, member, 'acceptRequest', req, extra);
    var author = !!(req.by && req.by.client === member.client);
    var crew = owner && !author;   // whoever carries it out, never whoever asked
    var def = assetDef(policy, assetTypeOf(req));
    var loader = !!(def && def.loader === member.post) || isStaff(policy, member);
    var out = [];
    if (req.status === 'requested') {
      if (crew) out.push('accept', 'deny');
      if (author) out.push('cancel');
    } else if (req.status === 'accepted') {
      if (req.type === 'mortar' && crew) out.push('take');
      if (req.type === 'position' && crew) out.push('place');
      if (req.type === 'ob' && loader) out.push('load');
      if (['mortar', 'ob', 'position'].indexOf(req.type) < 0 && owner) out.push('fire');
      if (owner) out.push('done', 'deny');
    } else if (req.status === 'loaded') {
      if (owner) out.push('fire', 'deny');
    } else if (req.status === 'firing') {
      if (owner) out.push('done');
    } else if (author) {
      out.push('repeat');
    }
    return out;
  }

  // ── geometry for lines, areas and freehand strokes ────────────────────

  function perpDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.hypot(dx, dy);
  }
  function rdp(points, eps) {
    if (points.length < 3) return points.slice();
    var maxD = -1, idx = 0, last = points.length - 1;
    for (var i = 1; i < last; i++) {
      var d = perpDist(points[i], points[0], points[last]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= eps) return [points[0], points[last]];
    return rdp(points.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(points.slice(idx), eps));
  }
  // Ramer–Douglas–Peucker; widens epsilon until the stroke fits `max` points.
  function simplify(points, epsilon, max) {
    var eps = epsilon, out = rdp(points, eps);
    while (max && out.length > max) { eps *= 1.5; out = rdp(points, eps); }
    return out;
  }
  // Catmull-Rom through the points as cubic Bézier segments [c1x, c1y, c2x, c2y, x, y].
  function smoothSegments(pts) {
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      out.push([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]]);
    }
    return out;
  }
  // Continuous world points to tiles, consecutive duplicates dropped.
  function snapPoints(points) {
    var out = [];
    points.forEach(function (p) {
      var q = [Math.floor(p[0]), Math.floor(p[1])], l = out[out.length - 1];
      if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q);
    });
    return out;
  }

  root.TacticalRoomLogic = {
    CODE_ALPHABET: CODE_ALPHABET, REQUEST_TYPES: REQUEST_TYPES, REQUEST_FLOW: REQUEST_FLOW, REQUEST_ASSET: REQUEST_ASSET,
    assetDef: assetDef, assetTypeOf: assetTypeOf, claimants: claimants, requestActions: requestActions,
    simplify: simplify, smoothSegments: smoothSegments, snapPoints: snapPoints,
    createState: createState, postDef: postDef, levelOf: levelOf, isStaff: isStaff, hasRight: hasRight,
    assetOwnerPost: assetOwnerPost, layerWritable: layerWritable, canWrite: canWrite, applyOp: applyOp,
    markerAge: markerAge, expired: expired, enemyAlpha: enemyAlpha, visibleObjects: visibleObjects,
    clockOffset: clockOffset, serverNowEst: serverNowEst, countdown: countdown, deadlines: deadlines,
    cleanText: cleanText, validateData: validateData, parseEntry: parseEntry, randomCode: randomCode,
    levelStyle: levelStyle, markerShape: markerShape, retryAfter: retryAfter, roomDeadlines: roomDeadlines,
    idleLocked: idleLocked, memberStale: memberStale, mergePending: mergePending
  };
})(typeof window !== 'undefined' ? window : globalThis);

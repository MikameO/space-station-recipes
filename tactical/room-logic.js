// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Room semantics shared by tactical/room.js (browser) and worker/room/*.js
// (Cloudflare Worker): the op log, rights by policy, write validation, expiry,
// clocks and codes. No DOM, no fetch. Contract: docs/design/2026-09-13-tactical-tablet.md,
// section «Поправки по итогам war-room». Tests: scripts/test_room_logic.js.
(function (root) {
  'use strict';

  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;
  var ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
  // Object ids that name Object.prototype members: stored as keys of state.objects they would change its prototype.
  var RESERVED_IDS = ['__proto__', 'constructor', 'prototype'];
  var REQUEST_TYPES = ['mortar', 'position', 'ob', 'cas', 'supply', 'medevac', 'other', 'task'];
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
  // Manual asset states per asset type, as the board in tactical/room-requests.js offers them.
  var ASSET_STATES = {
    mortar: ['deployed', 'moving', 'destroyed'], ob: ['ready', 'loading', 'cooldown'],
    dropship: ['offline', 'ship', 'to_lz', 'on_lz', 'flyby', 'cooldown'], supply: ['ready', 'cooldown'], medevac: ['available', 'unavailable']
  };
  var PRIORITIES = ['urgent', 'normal'];
  var REQUEST_FLAGS = ['beacon'];
  var MAX_COORD = 4096;
  // Write allowlists: any other key in op.data is refused with 'fields'.
  var FIELDS = {
    requestPut: ['type', 'target', 'note', 'priority', 'flags', 'level', 'h', 'markerId', 'to'],
    requestPatch: ['status', 'reason', 'note', 'priority', 'flags', 'relayed'],
    asset: ['tile', 'state', 'claimedBy', 'shell', 'radius', 'notes', 'label'],
    shape: ['cat', 'label', 'x', 'y', 'points', 'smooth', 'level', 'h', 'layer', 'ttl', 'relayed', 'confirmedAt'],
    calibration: ['offset', 'tile', 'reading'],
    member: ['presentAt', 'pos', 'cal']
  };
  // Keys a client never sets: object bookkeeping, server stamps and prototype names.
  var RESERVED = ['id', 'kind', 'seq', 'at', 'by', 'deleted', 'deletedAt', 'pending', 'cid',
    'acceptedBy', 'deniedBy', 'firedAt', 'doneAt', '__proto__', 'constructor', 'prototype'];

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isCoord(v) { return isNum(v) && Math.floor(v) === v && Math.abs(v) <= MAX_COORD; }
  function codePoints(s) { return String(s).match(/[\ud800-\udbff][\udc00-\udfff]|[\s\S]/g) || []; }
  function isText(v, max) { return typeof v === 'string' && codePoints(v).length <= max; }
  function unknownKey(data, allowed) {
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) if (allowed.indexOf(keys[i]) < 0) return true;
    return false;
  }
  var OK = { ok: true };
  function no(reason) { return { ok: false, reason: reason }; }

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
  // A request with `to` belongs to its addressee: a client, or a post and, when given, its squad.
  function isAddressee(req, member) {
    var to = req && isObj(req.to) ? req.to : null;
    if (!to || !member) return false;
    if (has(to, 'client')) return !!member.client && to.client === member.client;
    return typeof to.post === 'string' && to.post === member.post && (!has(to, 'squad') || to.squad === member.squad);
  }

  // extra.claimed: clients holding a claim on an asset of obj's type (see claimants()).
  function hasRight(policy, member, right, obj, extra) {
    var who = policy.rights[right] || [];
    var level = levelOf(policy, member.post);
    if (who.indexOf(level) >= 0) return true;
    // An addressed request is its addressee's to accept: asset owners and claimed crews of its type do not act on it.
    if (obj && isObj(obj.to)) return right === 'acceptRequest' && isAddressee(obj, member);
    if (who.indexOf('asset-owner') >= 0 && obj) {
      var type = assetTypeOf(obj);
      if (type && assetOwnerPost(policy, type) === member.post) return true;
      if (!member.client) return false;
      if (extra && extra.claimed && extra.claimed.indexOf(member.client) >= 0) return true;
      if (obj.kind === 'asset' && obj.claimedBy === member.client) return true;
    }
    return false;
  }

  function claimants(objects, obj) {
    var type = obj ? assetTypeOf(obj) : null, out = [];
    if (!type) return out;
    for (var id in objects) {
      if (!has(objects, id)) continue;
      var o = objects[id];
      if (o.kind === 'asset' && !o.deleted && o.type === type && o.claimedBy) out.push(o.claimedBy);
    }
    return out;
  }

  function layerWritable(policy, member, layer) {
    var level = levelOf(policy, member.post);
    var key = layer.indexOf('squad:') === 0 ? 'squad:*' : layer;
    var def = has(policy.layers, key) ? policy.layers[key] : null;
    if (!def || def.write.indexOf(level) < 0) return false;
    if (key === 'squad:*' && layer !== 'squad:' + member.squad) return false;
    return true;
  }

  // {ok:true} or {ok:false, reason}. `existing` is the current object for the op's id;
  // `extra` is {claimed: claimants(objects, existing)} for request patches.
  // Validate the data first (validateData for put, validatePatch for patch).
  function canWrite(policy, member, op, existing, extra) {
    if (!member || !member.confirmed) return no('unconfirmed');
    var level = levelOf(policy, member.post);
    if (!level || level === 'observer') return no('level');
    var kind = op.kind, d = op.data || {}, keys = Object.keys(d);
    var mine = !!(member.client && existing && existing.by && existing.by.client === member.client);
    // The room calibration is only ever published whole: a patch would keep a tile and reading that no longer agree
    // with the offset, and a delete would leave a tombstone that refuses every later publish.
    if (kind === 'calibration') return op.op !== 'put' ? no('op') : hasRight(policy, member, 'publishCalibration') ? OK : no('right');
    // A put never replaces a live object: the same client repeating it is a duplicate, anyone else clashes.
    if (op.op === 'put' && existing) return no(existing.deleted ? 'deleted' : mine ? 'duplicate' : 'exists');
    if (op.op !== 'put' && !existing) return no('missing');
    if (op.op === 'del') return mine || hasRight(policy, member, 'kick') ? OK : no('right');
    if (kind === 'request') {
      if (op.op === 'put') return layerWritable(policy, member, 'requests') ? OK : no('layer');
      if (!keys.length) return no('fields');
      if (d.status !== undefined) {
        if (unknownKey(d, ['status', 'reason'])) return no('fields');
        // The author withdraws a waiting request and recalls an accepted one, nothing later; carrying it out is the crew's.
        if (mine) return d.status === 'denied' && (existing.status === 'requested' || existing.status === 'accepted') ? OK : no('author');
        if (existing.type === 'task' && (d.status === 'loaded' || d.status === 'firing')) return no('transition');   // a task is done, not fired
        if (d.status === 'loaded') {
          if (existing.type !== 'ob') return no('transition');
          var def = assetDef(policy, assetTypeOf(existing));
          return (def && def.loader === member.post) || isStaff(policy, member) ? OK : no('right');
        }
        return hasRight(policy, member, 'acceptRequest', existing, extra) ? OK : no('right');
      }
      if (unknownKey(d, ['note', 'flags', 'priority', 'relayed'])) return no('fields');
      if (keys.length === 1 && keys[0] === 'relayed') return OK;
      return mine || isStaff(policy, member) ? OK : no('right');
    }
    if (kind === 'asset') {
      if (op.op === 'put') return no('right');   // assets come from the policy, seeded when the room opens
      if (has(d, 'claimedBy')) {
        // Claiming a crew seat: only claimable assets, only for oneself; staff may also clear a claim.
        var adef = assetDef(policy, existing.type);
        if (keys.length !== 1) return no('fields');
        var crew = (member.functions || []).indexOf('mortar') >= 0 || level !== 'squad';
        if (!adef || !adef.claimable || !crew || !member.client) return no('right');
        if (d.claimedBy === null) return existing.claimedBy === member.client || isStaff(policy, member) ? OK : no('right');
        return d.claimedBy === member.client ? OK : no('right');
      }
      if (!layerWritable(policy, member, 'assets')) return no('layer');
      var owner = (existing.owner && existing.owner.post === member.post) || (!!member.client && existing.claimedBy === member.client);
      return owner || isStaff(policy, member) ? OK : no('right');
    }
    // marker / line / area: anyone confirmed may mark an enemy still there or relayed
    if (op.op === 'patch' && keys.length && keys.every(function (k) { return k === 'confirmedAt' || k === 'relayed'; })) return OK;
    var layer = d.layer || (existing && existing.layer);
    if (!layer || !layerWritable(policy, member, layer)) return no('layer');
    if (op.op === 'patch' && !mine && !isStaff(policy, member)) return no('right');
    return OK;
  }

  // 'id' when an op may not use this id: not a string, a prototype name, or `calibration` for another kind.
  function idError(kind, id) {
    if (typeof id !== 'string' || RESERVED_IDS.indexOf(id) >= 0) return 'id';
    return id === 'calibration' && kind !== 'calibration' ? 'id' : null;
  }

  // Applies a server-stamped op {seq, at, by, op, kind, id, data, expectedStatus}.
  // An `event` op (radio silence, close, lock, the administration stop…) is journal only: it moves seq, makes no object.
  function applyOp(state, op) {
    if (state.closed) return { ok: false, reason: 'closed' };
    var bad = idError(op.kind, op.id);
    if (bad) return { ok: false, reason: bad };
    if (op.kind === 'event') {
      if (op.op !== 'put') return { ok: false, reason: 'op' };
      if (op.seq > state.seq) state.seq = op.seq;
      return { ok: true };
    }
    var cur = has(state.objects, op.id) ? state.objects[op.id] : undefined;
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
      if (!has(state.objects, id)) continue;
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
    var c = constants || {}, none = { impactAt: null, readyAt: null };
    if (type === 'mortar') return c.mortar ? { impactAt: firedAt + ((c.mortar.travelDelay + c.mortar.impactDelay) * 1000), readyAt: null } : none;
    if (type === 'ob') {
      if (!c.ob || !c.ob.timeline) return none;
      return { impactAt: firedAt + c.ob.timeline.impact * 1000, readyAt: firedAt + (c.ob.timeline.impact + c.ob.cooldown) * 1000 };
    }
    var asset = null;
    for (var i = 0; i < policy.assets.length; i++) if (policy.assets[i].type === type) asset = policy.assets[i];
    if (type === 'supply') return { impactAt: null, readyAt: asset ? firedAt + asset.cooldownSec * 1000 : null };
    if (type === 'dropship') return { impactAt: null, readyAt: asset ? firedAt + asset.flyBySec * 1000 : null };
    return none;
  }

  // One line of plain text: line breaks become spaces, control and invisible
  // format characters go, runs of spaces collapse; cut at `max` code points.
  function cleanText(s, max) {
    var t = String(s == null ? '' : s).replace(/[\t\r\n]/g, ' ')
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
      .replace(/\s+/g, ' ').trim();
    var cps = codePoints(t);
    return cps.length > max ? cps.slice(0, max).join('').replace(/\s+$/, '') : t;
  }

  function validOffset(v) { return Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]); }
  function isPair(v) { return Array.isArray(v) && v.length === 2 && isCoord(v[0]) && isCoord(v[1]); }
  function pickKeys(o, keys) {
    var out = {};
    keys.forEach(function (k) { if (has(o, k)) out[k] = o[k]; });
    return out;
  }
  // `to` on a new request: {client}, {post} or {post, squad}; a mortar strike goes to the mortar's own post only.
  function toField(policy, data) {
    if (!has(data, 'to')) return null;
    var to = data.to;
    if (!isObj(to)) return 'to';
    // The client id shape the Worker issues sessions for: nothing else reaches the moderator log as an addressee.
    if (has(to, 'client')) return Object.keys(to).length === 1 && typeof to.client === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(to.client) ? null : 'to';
    if (unknownKey(to, ['post', 'squad']) || typeof to.post !== 'string') return 'to';
    var level = levelOf(policy, to.post);
    if (!level || level === 'observer') return 'to';
    if (has(to, 'squad') && !(typeof to.squad === 'string' && isObj(policy.squads) && has(policy.squads, to.squad) && postDef(policy, to.post).perSquad)) return 'to';
    if (data.type === 'mortar' && to.post !== assetOwnerPost(policy, 'mortar')) return 'to';
    return null;
  }
  // A room calibration: the offset, plus the tile and rangefinder reading it came from, both or neither, and they agree.
  function calibrationFields(data) {
    if (unknownKey(data, FIELDS.calibration)) return 'fields';
    if (!validOffset(data.offset)) return 'offset';
    var tile = has(data, 'tile'), reading = has(data, 'reading');
    if (!tile && !reading) return null;
    if (!tile || !isPair(data.tile)) return 'tile';
    if (!reading || !isPair(data.reading)) return 'reading';
    return data.reading[0] - data.tile[0] === data.offset[0] && data.reading[1] - data.tile[1] === data.offset[1] ? null : 'offset';
  }
  // A member's own patch: presence, a shared position ({x, y, level} or null) and the calibration offset in use.
  // `member`, when given, is the writer: an observer shares neither a position nor a calibration.
  function validateMemberPatch(policy, member, data) {
    if (!isObj(data)) return 'data';
    if (!Object.keys(data).length || unknownKey(data, FIELDS.member)) return 'fields';
    if (member && (has(data, 'pos') || has(data, 'cal'))) {
      var level = levelOf(policy, member.post);
      if (!level || level === 'observer') return 'level';
    }
    if (has(data, 'pos') && data.pos !== null) {
      var p = data.pos;
      if (!isObj(p) || unknownKey(p, ['x', 'y', 'level']) || !isCoord(p.x) || !isCoord(p.y) ||
          (has(p, 'level') && !(isNum(p.level) && Math.floor(p.level) === p.level && Math.abs(p.level) <= 64))) return 'pos';
    }
    if (has(data, 'cal') && data.cal !== null && !isPair(data.cal)) return 'cal';
    return null;
  }
  // A presence heartbeat passes an idle lock and radio silence; a position or calibration write does not.
  function isHeartbeat(op) {
    return !!op && op.kind === 'member' && op.op === 'patch' && isObj(op.data) &&
      Object.keys(op.data).length === 1 && has(op.data, 'presentAt');
  }
  function validFlags(v) {
    if (!Array.isArray(v) || v.length > 8) return false;
    for (var i = 0; i < v.length; i++) if (REQUEST_FLAGS.indexOf(v[i]) < 0) return false;
    return true;
  }
  function validPoints(v, max, min) {
    if (!Array.isArray(v) || v.length > max || v.length < min) return false;
    for (var i = 0; i < v.length; i++) if (!Array.isArray(v[i]) || v[i].length !== 2 || !isNum(v[i][0]) || !isNum(v[i][1])) return false;
    return true;
  }
  function validState(v, type) {
    if (typeof v !== 'string') return false;
    if (type && has(ASSET_STATES, type)) return ASSET_STATES[type].indexOf(v) >= 0;
    for (var t in ASSET_STATES) if (has(ASSET_STATES, t) && ASSET_STATES[t].indexOf(v) >= 0) return true;
    return false;
  }

  function requestFields(policy, data) {
    var L = policy.limits;
    if (has(data, 'status') && !(typeof data.status === 'string' && has(REQUEST_FLOW, data.status))) return 'status';
    if (has(data, 'reason') && !isText(data.reason, L.note)) return 'reason';
    if (has(data, 'note') && !isText(data.note, L.note)) return 'note';
    if (has(data, 'priority') && PRIORITIES.indexOf(data.priority) < 0) return 'priority';
    if (has(data, 'flags') && !validFlags(data.flags)) return 'flags';
    if (has(data, 'level') && !isNum(data.level)) return 'level';
    if (has(data, 'h') && !isText(data.h, 40)) return 'h';
    if (has(data, 'markerId') && data.markerId !== null && !(typeof data.markerId === 'string' && ID_RE.test(data.markerId))) return 'markerId';
    if (has(data, 'relayed') && typeof data.relayed !== 'boolean') return 'relayed';
    return null;
  }

  function assetFields(policy, data, type) {
    var L = policy.limits;
    if (has(data, 'tile') && data.tile !== null && !(Array.isArray(data.tile) && data.tile.length === 2 && isCoord(data.tile[0]) && isCoord(data.tile[1]))) return 'tile';
    if (has(data, 'state') && data.state !== null && !validState(data.state, type)) return 'state';
    if (has(data, 'claimedBy') && data.claimedBy !== null && !(typeof data.claimedBy === 'string' && data.claimedBy.length <= 64)) return 'claimedBy';
    if (has(data, 'shell') && data.shell !== null && !(typeof data.shell === 'string' && data.shell.length <= 40)) return 'shell';
    if (has(data, 'radius') && data.radius !== null && !(isNum(data.radius) && data.radius > 0 && data.radius <= 100)) return 'radius';
    if (has(data, 'notes') && data.notes !== null && !isText(data.notes, L.note)) return 'notes';
    if (has(data, 'label') && data.label !== null && !isText(data.label, L.label)) return 'label';
    return null;
  }

  function shapeFields(policy, kind, data, isPut) {
    var L = policy.limits;
    if (unknownKey(data, FIELDS.shape)) return 'fields';
    if (has(data, 'cat') && !(typeof data.cat === 'string' && /^[a-z_]{1,20}$/.test(data.cat))) return 'cat';
    if (has(data, 'label') && !isText(data.label, L.label)) return 'label';
    if ((kind === 'marker' && isPut) || has(data, 'x') || has(data, 'y')) {
      if (!isNum(data.x) || !isNum(data.y)) return 'xy';
    }
    if (kind === 'line' || kind === 'area') {
      if ((isPut || has(data, 'points')) && !validPoints(data.points, L.points, kind === 'area' ? 3 : 2)) return 'points';
    } else if (has(data, 'points')) {
      return 'points';
    }
    if (has(data, 'smooth') && typeof data.smooth !== 'boolean') return 'smooth';
    if (has(data, 'level') && !isNum(data.level)) return 'level';
    if (has(data, 'h') && data.h !== null && !isText(data.h, 40)) return 'h';
    if (has(data, 'layer') && !(typeof data.layer === 'string' && /^[a-z]{1,20}(:[a-z0-9_-]{1,20})?$/.test(data.layer))) return 'layer';
    if (has(data, 'ttl') && !(isNum(data.ttl) && data.ttl > 0 && data.ttl <= 86400)) return 'ttl';
    if (has(data, 'relayed') && typeof data.relayed !== 'boolean') return 'relayed';
    return null;
  }

  // Put data: null when acceptable, otherwise the failing field ('fields' for a key off the allowlist).
  function validateData(policy, kind, data) {
    if (!isObj(data)) return 'data';
    if (kind === 'request') {
      if (unknownKey(data, FIELDS.requestPut)) return 'fields';
      if (REQUEST_TYPES.indexOf(data.type) < 0) return 'type';
      if (data.type !== 'other' && data.type !== 'task' && !assetDef(policy, REQUEST_ASSET[data.type])) return 'type';
      var to = toField(policy, data);
      if (to) return to;
      // A task names its addressee and says what to do; its map point is optional.
      if (data.type === 'task' && !has(data, 'to')) return 'to';
      if (data.type === 'task' && !(typeof data.note === 'string' && data.note.trim())) return 'note';
      if ((data.type !== 'task' || has(data, 'target')) && (!isObj(data.target) || !isCoord(data.target.x) || !isCoord(data.target.y))) return 'target';
      return requestFields(policy, data);
    }
    if (kind === 'marker' || kind === 'line' || kind === 'area') return shapeFields(policy, kind, data, true);
    if (kind === 'calibration') return calibrationFields(data);
    if (kind === 'asset') return unknownKey(data, FIELDS.asset.concat(['type', 'n'])) ? 'fields' : assetFields(policy, data, data.type);
    return 'kind';
  }

  // Patch data, the same answer shape. `existing` (optional) narrows asset states to its type.
  function validatePatch(policy, kind, data, existing) {
    if (!isObj(data)) return 'data';
    if (!Object.keys(data).length) return 'fields';
    if (kind === 'request') return unknownKey(data, FIELDS.requestPatch) ? 'fields' : requestFields(policy, data);
    if (kind === 'asset') {
      if (unknownKey(data, FIELDS.asset)) return 'fields';
      if (has(data, 'claimedBy') && Object.keys(data).length > 1) return 'fields';
      return assetFields(policy, data, existing ? existing.type : null);
    }
    if (kind === 'marker' || kind === 'line' || kind === 'area') return shapeFields(policy, kind, data, false);
    if (kind === 'calibration') return calibrationFields(data);
    if (kind === 'member') return validateMemberPatch(policy, null, data);
    return 'kind';
  }

  // Client op data as the server accepts it, before validation: reserved and
  // server-stamped keys dropped, texts cleaned, the request target rebuilt as {x, y}.
  function cleanData(policy, kind, op, raw) {
    var L = policy.limits, data = {};
    if (op === 'del' || !isObj(raw)) return data;
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (RESERVED.indexOf(k) >= 0) continue;
      if (kind === 'request' && op === 'put' && (k === 'status' || k === 'layer')) continue;
      data[k] = raw[k];
    }
    var texts = { label: L.label, note: L.note, reason: L.note, notes: L.note, callsign: L.callsign };
    for (var t in texts) if (has(texts, t) && typeof data[t] === 'string') data[t] = cleanText(data[t], texts[t]);
    if (kind === 'request' && isObj(data.target)) data.target = { x: data.target.x, y: data.target.y };
    if (kind === 'request' && isObj(data.to)) data.to = pickKeys(data.to, ['client', 'post', 'squad']);
    if (kind === 'member' && isObj(data.pos)) data.pos = pickKeys(data.pos, ['x', 'y', 'level']);
    return data;
  }

  // Server fields, set only after validation and rights: who accepted or denied, when fired or done.
  function stampData(kind, op, data, by, now) {
    if (kind === 'request' && op === 'put') data.status = 'requested';
    if (kind === 'request' && op === 'patch') {
      if (data.status === 'accepted') data.acceptedBy = by;
      if (data.status === 'firing') data.firedAt = now;
      if (data.status === 'done') data.doneAt = now;
      if (data.status === 'denied') data.deniedBy = by;
    }
    if (has(data, 'confirmedAt')) data.confirmedAt = now;
    if (kind === 'member' && has(data, 'presentAt')) data.presentAt = now;
    if (kind === 'member' && has(data, 'pos')) data.posAt = now;
    if (kind === 'marker' && op === 'put' && data.cat === 'enemy' && data.relayed === undefined) data.relayed = false;
    return data;
  }

  function parseEntry(str) {
    var s = String(str || '').trim().toUpperCase().replace(/\s+/g, '');
    var parts = s.split('-');
    if (parts.length > 2 || parts[0].length !== 6 || !CODE_RE.test(parts[0])) return null;
    if (parts[1] !== undefined && (parts[1].length !== 4 || !CODE_RE.test(parts[1]))) return null;
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
  // The crew (an owner who is not the author) carries a request out; the author only
  // withdraws it while it waits, recalls it once accepted, and repeats a closed one.
  function requestActions(policy, member, req, extra) {
    if (!member || !member.confirmed || !req || req.deleted) return [];
    var level = levelOf(policy, member.post);
    if (!level || level === 'observer') return [];
    var author = !!(member.client && req.by && req.by.client === member.client);
    var crew = !author && hasRight(policy, member, 'acceptRequest', req, extra);
    var def = assetDef(policy, assetTypeOf(req));
    var loader = !author && (!!(def && def.loader === member.post) || isStaff(policy, member));
    var out = [];
    if (req.status === 'requested') {
      if (crew) out.push('accept', 'deny');
      if (author) out.push('cancel');
    } else if (req.status === 'accepted') {
      if (req.type === 'mortar' && crew) out.push('take');
      if (req.type === 'position' && crew) out.push('place');
      if (req.type === 'ob' && loader) out.push('load');
      if (['mortar', 'ob', 'position', 'task'].indexOf(req.type) < 0 && crew) out.push('fire');
      if (crew) out.push('done', 'deny');
      if (author) out.push('cancel');
    } else if (req.status === 'loaded') {
      if (crew) out.push('fire', 'deny');
    } else if (req.status === 'firing') {
      if (crew) out.push('done');
    } else if (author && (req.status === 'done' || req.status === 'denied')) {
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
    ASSET_STATES: ASSET_STATES,
    assetDef: assetDef, assetTypeOf: assetTypeOf, claimants: claimants, requestActions: requestActions, isAddressee: isAddressee,
    simplify: simplify, smoothSegments: smoothSegments, snapPoints: snapPoints,
    createState: createState, postDef: postDef, levelOf: levelOf, isStaff: isStaff, hasRight: hasRight,
    assetOwnerPost: assetOwnerPost, layerWritable: layerWritable, canWrite: canWrite, applyOp: applyOp, idError: idError,
    markerAge: markerAge, expired: expired, enemyAlpha: enemyAlpha, visibleObjects: visibleObjects,
    clockOffset: clockOffset, serverNowEst: serverNowEst, countdown: countdown, deadlines: deadlines,
    cleanText: cleanText, validateData: validateData, validatePatch: validatePatch, cleanData: cleanData, stampData: stampData,
    validateMemberPatch: validateMemberPatch, isHeartbeat: isHeartbeat,
    parseEntry: parseEntry, randomCode: randomCode,
    levelStyle: levelStyle, markerShape: markerShape, retryAfter: retryAfter, roomDeadlines: roomDeadlines,
    idleLocked: idleLocked, memberStale: memberStale, mergePending: mergePending
  };
})(typeof window !== 'undefined' ? window : globalThis);

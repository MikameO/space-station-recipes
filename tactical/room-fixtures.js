// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// A fake Worker for the officers' room: same transport interface as
// HttpTransport, the rules of worker/room/room.js on top of tactical/room-logic.js,
// and a scripted LV-624 round for the clickable demo (tactical.html#room=demo).
// Never more permissive than the Worker. Loaded on demand.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  var SYSTEM = { client: 'room', post: 'system', squad: null };
  var WRITE_KINDS = ['marker', 'line', 'area', 'request', 'asset', 'calibration', 'member'];
  var RESERVED = ['id', 'kind', 'seq', 'at', 'by', 'deleted'];
  var CLIENT_RE = /^[A-Za-z0-9_-]{8,40}$/;
  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  var WORDS = {
    ru: ['ФАЗАН', 'КЛЁН', 'РУБИН', 'ЯКОРЬ', 'ГРОМ', 'ЛИМОН', 'ТУМАН', 'КОМЕТА'],
    en: ['FALCON', 'MAPLE', 'ANCHOR', 'THUNDER', 'LEMON', 'HARBOR', 'COMET', 'SAPPHIRE']
  };

  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function reply(status, body, retryAfter) { return Promise.resolve({ status: status, body: body, retryAfter: retryAfter === undefined ? null : retryAfter }); }
  function ok(body, retryAfter) { return reply(200, body, retryAfter); }
  function fail(status, error) { return reply(status, { error: error }); }
  function byOf(m) { return { client: m.client, post: m.post, squad: m.squad || null }; }

  // R.validatePatch arrives with the logic track; before that, patches pass as they do in the Worker.
  function patchProblem(policy, kind, data) {
    if (!R.validatePatch) return null;
    var v = R.validatePatch(policy, kind, data);
    if (!v || v.ok === true) return null;
    return typeof v === 'string' ? v : v.reason || 'patch';
  }

  function FixtureTransport(policy, opts) {
    opts = opts || {};
    this.policy = policy;
    this.now = opts.now || function () { return Date.now(); };
    this.skew = opts.skew || 0;
    this.script = (opts.script || []).slice();
    this.scriptErrors = [];
    this.rooms = 0;
    this.rotated = {};
    this.wipe();
  }

  FixtureTransport.prototype.serverNow = function () { return this.now() + this.skew; };

  FixtureTransport.prototype.wipe = function () {
    this.meta = null;
    this.state = R.createState();
    this.log = [];
    this.sessions = {};
    this.bytes = 0;
    this.lastOpAt = 0;
    this.lastRequestOpAt = 0;
    this.seen = {};
    this.memberOpAt = {};
    this.rate = {};
    this.acks = {};
    this.rotated = {};
  };

  FixtureTransport.prototype.apply = function (op, by) {
    var stamped = { seq: this.state.seq + 1, at: this.serverNow(), by: by, op: op.op, kind: op.kind, id: op.id,
      data: copy(op.data), expectedStatus: op.expectedStatus, cid: op.cid || '' };
    var res = R.applyOp(this.state, stamped);
    if (res.ok) {
      this.log.push(copy(stamped));
      this.bytes += JSON.stringify(stamped).length;
    }
    return res;
  };

  FixtureTransport.prototype.activeMembers = function () {
    var out = [];
    for (var id in this.state.objects) {
      var o = this.state.objects[id];
      if (o.kind === 'member' && !o.deleted) out.push(o);
    }
    return out;
  };
  FixtureTransport.prototype.memberOf = function (client) {
    return this.activeMembers().filter(function (m) { return m.client === client; })[0] || null;
  };
  FixtureTransport.prototype.member = FixtureTransport.prototype.memberOf;

  FixtureTransport.prototype.countObjects = function () {
    var n = 0;
    for (var id in this.state.objects) if (!this.state.objects[id].deleted && this.state.objects[id].kind !== 'member') n++;
    return n;
  };

  FixtureTransport.prototype.newSession = function (client) {
    var token = client + '.' + this.meta.epoch + '.' + R.randomCode(16);
    this.sessions[client] = token;
    return token;
  };

  FixtureTransport.prototype.authenticate = function (token) {
    var parts = String(token || '').split('.');
    if (parts.length !== 3 || !this.meta) return null;
    if (this.sessions[parts[0]] !== token || Number(parts[1]) !== this.meta.epoch) return null;
    return this.memberOf(parts[0]);
  };

  FixtureTransport.prototype.publicMeta = function () {
    var m = this.meta, d = R.roomDeadlines(this.policy, m.createdAt, m.extended);
    return { fork: m.fork, server: m.server, planet: m.planet, h: m.h, createdAt: m.createdAt, epoch: m.epoch,
      locked: m.locked, closed: m.closed, frozen: m.frozen ? copy(m.frozen) : null, extended: m.extended,
      maxAt: d.maxAt, warnAt: d.warnAt, lastOpAt: this.lastOpAt };
  };

  FixtureTransport.prototype.presence = function (now) {
    var out = {}, self = this;
    this.activeMembers().forEach(function (m) { out[m.client] = self.seen[m.client] !== undefined ? now - self.seen[m.client] : null; });
    return out;
  };

  // The Worker's alarm (close at the deadline, delete after the export grace), the script, then the lazy lifecycle.
  FixtureTransport.prototype.tick = function (now) {
    var m = this.meta, P = this.policy;
    var grace = P.ttl.exportGraceSec * 1000;
    if ((m.closed && now >= m.closedAt + grace) || (!m.closed && m.locked && now >= m.lockedAt + grace)) { this.wipe(); return; }
    if (!m.closed && now >= R.roomDeadlines(P, m.createdAt, m.extended).maxAt) { m.closed = true; m.closedAt = now; }
    this.play(now);
    this.lifecycle(now);
  };

  // Idle lock, then release of idle members and of knocks older than the word.
  FixtureTransport.prototype.lifecycle = function (now) {
    var m = this.meta, P = this.policy, self = this;
    if (m.closed) return;
    if (!m.locked && R.idleLocked(P, this.lastOpAt, now)) { m.locked = true; m.lockedAt = now; return; }
    if (m.locked) return;
    var stale = this.activeMembers().filter(function (o) {
      if (!o.confirmed) return now - (o.knockAt || o.at) >= P.ttl.wordSec * 1000;
      return R.memberStale(P, Math.max(self.memberOpAt[o.client] || 0, o.presentAt || 0, o.confirmedAt || 0, o.at), now);
    });
    stale.forEach(function (o) {
      self.apply({ op: 'del', kind: 'member', id: o.id, cid: 'auto' }, SYSTEM);
      delete self.sessions[o.client];
    });
  };

  // The request gate: rotated or unknown code, lifecycle, then the observer token or the session.
  FixtureTransport.prototype.enter = function (code, auth) {
    var now = this.serverNow();
    if (this.rotated[code]) return { fail: fail(401, 'rotated') };
    if (!this.meta || code !== this.meta.code) return { fail: fail(404, 'room') };
    this.tick(now);
    if (!this.meta) return { fail: fail(404, 'room') };
    if (auth && auth.observer) {
      return this.meta.observerToken && auth.observer === this.meta.observerToken ? { observer: true, now: now } : { fail: fail(401, 'observer') };
    }
    var actor = this.authenticate(auth && auth.session);
    return actor ? { actor: actor, now: now } : { fail: fail(401, 'session') };
  };

  FixtureTransport.prototype.create = function (body) {
    var P = this.policy, self = this, now = this.serverNow();
    body = body || {};
    var c = body.creator || {};
    if (!CLIENT_RE.test(String(c.client || ''))) return fail(400, 'client');
    if (R.levelOf(P, c.post) !== 'staff') return fail(400, 'creator');
    if (typeof body.planet !== 'string' || !/^[a-z0-9_.-]{1,40}$/i.test(body.planet)) return fail(400, 'planet');
    this.wipe();
    this.rooms += 1;
    var codes = {}, sheet = [];
    P.posts.forEach(function (p) {
      if (p.level === 'observer') return;
      (p.perSquad ? Object.keys(P.squads) : [null]).forEach(function (sq) {
        for (var i = 0; i < p.max; i++) {
          var pc;
          do pc = R.randomCode(4); while (codes[pc]);
          codes[pc] = { slot: p.id + ':' + (sq || '') + ':' + i, post: p.id, squad: sq, usedAt: null, client: null };
          sheet.push({ post: p.id, squad: sq, code: pc });
        }
      });
    });
    this.meta = { code: this.rooms === 1 ? 'DEMA42' : R.randomCode(6),   // room codes use no O, I, 0 or 1
      fork: P.fork, server: 'Demo', planet: body.planet, h: String(body.h || ''), createdAt: now, extended: false,
      locked: false, lockedAt: null, unlockedAt: null, closed: false, closedAt: null, frozen: null, epoch: 1,
      codes: codes, observerToken: null };
    this.lastOpAt = now;
    this.apply({ op: 'put', kind: 'member', id: 'mem-' + c.client + '-1',
      data: { client: c.client, post: c.post, squad: null, slot: c.post + '::creator', callsign: R.cleanText(c.callsign, P.limits.callsign),
        confirmed: true, confirmedBy: 'creator', confirmedAt: now } }, byOf(c));
    P.assets.forEach(function (def) {
      for (var n = 1; n <= (def.count || 1); n++) {
        self.apply({ op: 'put', kind: 'asset', id: 'asset-' + def.type + '-' + n,
          data: { type: def.type, n: n, owner: { post: def.owner }, state: null, notes: '', claimedBy: null } }, SYSTEM);
      }
    });
    // No observer token here: staff mint it with the observer action.
    return ok({ code: this.meta.code, fork: P.fork, server: 'Demo', session: this.newSession(c.client), sheet: sheet, epoch: 1 });
  };

  FixtureTransport.prototype.join = function (code, body, auth) {
    var P = this.policy, now = this.serverNow();
    if (this.rotated[code]) return fail(401, 'rotated');
    if (!this.meta || code !== this.meta.code) return fail(404, 'room');
    this.tick(now);
    var m = this.meta;
    if (!m) return fail(404, 'room');
    if (m.closed) return fail(423, 'closed');
    if (m.locked) return fail(423, 'locked');
    if (m.frozen && m.frozen.reason !== 'silence') return fail(423, m.frozen.reason);
    body = body || {};
    if (!CLIENT_RE.test(String(body.client || ''))) return fail(400, 'client');
    var existing = this.memberOf(body.client);
    var post, squad, slot, entry = null;
    if (body.postCode) {
      entry = m.codes[String(body.postCode).toUpperCase()];
      if (!entry) return fail(404, 'postCode');
      if (entry.client && entry.client !== body.client) return fail(409, 'used');
      post = entry.post; squad = entry.squad; slot = entry.slot;
    } else {
      var def = R.postDef(P, body.post);
      if (!def || def.level === 'observer') return fail(400, 'post');
      squad = def.perSquad ? body.squad : null;
      if (def.perSquad && !P.squads[squad]) return fail(400, 'squad');
      post = def.id;
      var taken = this.activeMembers().filter(function (x) { return x.post === post && (x.squad || null) === squad && x.client !== body.client; }).length;
      if (taken >= def.max) return fail(409, 'full');
      slot = post + ':' + (squad || '') + ':word';
    }
    // Re-entry over a confirmed member needs that member's current session; without it nobody is evicted.
    var proof = this.authenticate(auth && auth.session);
    if (existing && existing.confirmed && !(proof && proof.client === body.client)) return fail(409, 'member');
    if (entry) { entry.usedAt = entry.usedAt || now; entry.client = body.client; }
    if (existing && existing.confirmed && existing.slot === slot) {
      return ok({ session: this.newSession(body.client), status: 'confirmed', post: post, squad: squad, epoch: m.epoch });
    }
    var words = P.fork === 'stories_cm' ? WORDS.ru : WORDS.en;
    var word = words[Math.floor(Math.random() * words.length)];
    var id = 'mem-' + body.client + '-' + (this.state.seq + 1);
    if (existing) this.apply({ op: 'del', kind: 'member', id: existing.id, cid: 'rejoin' }, SYSTEM);
    this.apply({ op: 'put', kind: 'member', id: id,
      data: { client: body.client, post: post, squad: squad, slot: slot, callsign: R.cleanText(body.callsign, P.limits.callsign),
        confirmed: false, word: word, knockAt: now } }, { client: body.client, post: post, squad: squad });
    this.lastOpAt = now;
    return ok({ session: this.newSession(body.client), status: 'knocking', word: word, post: post, squad: squad, epoch: m.epoch });
  };

  FixtureTransport.prototype.poll = function (code, since, auth) {
    var g = this.enter(code, auth);
    if (g.fail) return g.fail;
    var now = g.now, actor = g.actor;
    since = Math.max(0, parseInt(since, 10) || 0);
    var retryAfter = R.retryAfter(this.lastRequestOpAt, now);
    if (actor) this.seen[actor.client] = now;
    var meta = this.publicMeta();
    if (actor && !actor.confirmed) {
      delete meta.lastOpAt;   // a knock learns nothing about who is active
      return ok({ serverNow: now, seq: this.state.seq, meta: meta, presence: {}, knocking: true, word: actor.word, ops: [] }, retryAfter);
    }
    var ops = this.log.filter(function (op) { return op.seq > since; }).slice(0, 500);
    return ok({ serverNow: now, seq: this.state.seq, meta: meta, presence: this.presence(now), ops: copy(ops), more: ops.length === 500 }, retryAfter);
  };

  FixtureTransport.prototype.snapshot = function (code, cursor, auth) {
    var g = this.enter(code, auth);
    if (g.fail) return g.fail;
    if (g.actor && !g.actor.confirmed) return fail(403, 'unconfirmed');
    var objects = this.state.objects;
    var ids = Object.keys(objects).filter(function (id) { return !objects[id].deleted && id > (cursor || ''); }).sort();
    return ok({ serverNow: g.now, seq: this.state.seq, objects: copy(ids.slice(0, 200).map(function (id) { return objects[id]; })),
      cursor: ids.length > 200 ? ids[199] : null, meta: this.publicMeta() });
  };

  // null, or {status, error} when the room takes no writes from this member now.
  FixtureTransport.prototype.writeGate = function (actor) {
    var m = this.meta;
    if (!actor.confirmed) return { status: 403, error: 'unconfirmed' };
    if (m.closed) return { status: 423, error: 'closed' };
    if (m.locked) return { status: 423, error: 'locked' };
    if (m.frozen) return { status: 423, error: m.frozen.reason };
    return null;
  };

  FixtureTransport.prototype.allow = function (client, now) {
    var L = this.policy.limits;
    var r = this.rate[client];
    if (!r) r = this.rate[client] = { sec: now, secN: 0, min: now, minN: 0 };
    if (now - r.sec >= 1000) { r.sec = now; r.secN = 0; }
    if (now - r.min >= 60000) { r.min = now; r.minN = 0; }
    if (r.secN >= L.opsPerSec || r.minN >= L.opsPerMin) return false;
    r.secN++; r.minN++;
    return true;
  };

  FixtureTransport.prototype.sanitize = function (raw, src, actor, now) {
    var L = this.policy.limits, data = {};
    for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) data[k] = src[k];
    if (data.label !== undefined) data.label = R.cleanText(data.label, L.label);
    if (data.note !== undefined) data.note = R.cleanText(data.note, L.note);
    if (raw.kind === 'request' && raw.op === 'put') data.status = 'requested';
    if (raw.kind === 'request' && raw.op === 'patch') {
      if (data.status === 'accepted') data.acceptedBy = byOf(actor);
      if (data.status === 'firing') data.firedAt = now;
      if (data.status === 'done') data.doneAt = now;
      if (data.status === 'denied') data.deniedBy = byOf(actor);
    }
    if (raw.kind === 'marker' && raw.op === 'put' && data.cat === 'enemy' && data.relayed === undefined) data.relayed = false;
    return data;
  };

  // One op of a batch, the way the Worker's write() takes it; returns the ack.
  FixtureTransport.prototype.writeOne = function (actor, raw, now) {
    var P = this.policy, L = P.limits;
    var cid = raw && typeof raw.cid === 'string' ? raw.cid.slice(0, 40) : '';
    if (!raw || typeof raw !== 'object' || WRITE_KINDS.indexOf(raw.kind) < 0 || ['put', 'patch', 'del'].indexOf(raw.op) < 0 ||
        typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return { cid: cid, error: 'shape' };
    var known = cid ? this.acks[actor.client + ' ' + cid] : 0;
    if (known) return { cid: cid, seq: known, dup: true };
    if (JSON.stringify(raw).length > L.message) return { cid: cid, error: 'size' };
    if (!this.allow(actor.client, now)) return { cid: cid, error: 'rate' };
    if (this.bytes > L.bytes) { this.meta.frozen = { at: now, reason: 'budget' }; return { cid: cid, error: 'budget' }; }
    var existing = this.state.objects[raw.id];
    if (existing && existing.kind !== raw.kind) return { cid: cid, error: 'kind' };
    if (raw.op === 'put' && existing) {
      if (existing.deleted) return { cid: cid, error: 'deleted' };
      if (!existing.by || existing.by.client !== actor.client) return { cid: cid, error: 'exists' };
    }
    var src = {}, given = raw.data && typeof raw.data === 'object' ? copy(raw.data) : {};
    for (var k in given) if (RESERVED.indexOf(k) < 0) src[k] = given[k];
    var data = this.sanitize(raw, src, actor, now);
    if (raw.kind === 'member') {
      var mine = existing && !existing.deleted && existing.client === actor.client;
      if (raw.op !== 'patch' || !mine || Object.keys(data).join() !== 'presentAt') return { cid: cid, error: 'right' };
      data.presentAt = now;
    } else {
      if (raw.op === 'put') {
        var bad = R.validateData(P, raw.kind, data);
        if (bad) return { cid: cid, error: bad };
        if (this.countObjects() >= L.objects) return { cid: cid, error: 'objects' };
      }
      if (raw.op === 'patch') {
        var badPatch = patchProblem(P, raw.kind, src);
        if (badPatch) return { cid: cid, error: badPatch };
        // Whoever asked never carries the request out: its author only withdraws it.
        if (raw.kind === 'request' && existing && src.status !== undefined && src.status !== 'denied' &&
            existing.by && existing.by.client === actor.client) return { cid: cid, error: 'author' };
      }
      var check = R.canWrite(P, actor, { op: raw.op, kind: raw.kind, id: raw.id, data: data, expectedStatus: raw.expectedStatus },
        existing, { claimed: R.claimants(this.state.objects, existing) });
      if (!check.ok) return { cid: cid, error: check.reason };
    }
    var res = this.apply({ op: raw.op, kind: raw.kind, id: raw.id, data: data, expectedStatus: raw.expectedStatus, cid: cid }, byOf(actor));
    if (!res.ok) return existing && existing.status !== undefined ? { cid: cid, error: res.reason, status: existing.status } : { cid: cid, error: res.reason };
    this.memberOpAt[actor.client] = now;
    if (raw.kind === 'request') this.lastRequestOpAt = now;
    if (cid) this.acks[actor.client + ' ' + cid] = this.state.seq;
    return { cid: cid, seq: this.state.seq };
  };

  FixtureTransport.prototype.send = function (code, ops, auth) {
    var g = this.enter(code, auth);
    if (g.fail) return g.fail;
    if (g.observer) return fail(403, 'observer');
    var gate = this.writeGate(g.actor);
    if (gate) return fail(gate.status, gate.error);
    var list = Array.isArray(ops) ? ops.slice(0, 64) : [], acks = [], accepted = 0;
    for (var i = 0; i < list.length; i++) {
      var ack = this.writeOne(g.actor, list[i], g.now);
      acks.push(ack);
      if (ack.seq && !ack.dup) accepted++;
      if (ack.error === 'budget') break;
    }
    if (accepted) this.lastOpAt = g.now;
    return ok({ acks: acks, serverNow: g.now, seq: this.state.seq });
  };

  FixtureTransport.prototype.admin = function (code, body, auth) {
    var g = this.enter(code, auth);
    if (g.fail) return g.fail;
    if (g.observer) return fail(403, 'observer');
    var actor = g.actor, now = g.now, m = this.meta, P = this.policy, self = this;
    if (!actor.confirmed) return fail(403, 'unconfirmed');
    if (m.closed) return fail(423, 'closed');
    if (m.frozen && m.frozen.reason !== 'silence') return fail(423, m.frozen.reason);
    var b = body || {};
    var staff = R.isStaff(P, actor);
    var target = b.client ? this.memberOf(b.client) : null;
    var out = { ok: true }, ops = [], drop = [];
    function canConfirm(x) { return x.confirmed && R.hasRight(P, x, 'confirmJoin'); }
    switch (b.action) {
      case 'confirm': {
        if (!R.hasRight(P, actor, 'confirmJoin')) return fail(403, 'right');
        if (!target || target.confirmed) return fail(404, 'member');
        if (now - target.knockAt > P.ttl.wordSec * 1000) return fail(409, 'expired');
        var knocking = this.activeMembers().filter(function (x) { return !x.confirmed; }).length;
        if (knocking >= 2 && b.word !== target.word) return fail(409, 'word');
        ops.push({ op: 'patch', kind: 'member', id: target.id, data: { confirmed: true, confirmedBy: actor.post, confirmedAt: now, word: null } });
        break;
      }
      case 'release': {
        if (!target) return fail(404, 'member');
        if (canConfirm(target) && !this.activeMembers().some(function (x) { return x.client !== target.client && canConfirm(x); })) return fail(409, 'last');
        ops.push({ op: 'del', kind: 'member', id: target.id });
        drop.push(target.client);
        break;
      }
      case 'reissue': {
        if (!target) return fail(404, 'member');
        if (!staff && !(target.squad && actor.squad === target.squad)) return fail(403, 'right');
        Object.keys(m.codes).forEach(function (k) { if (m.codes[k].slot === target.slot) delete m.codes[k]; });
        var pc;
        do pc = R.randomCode(4); while (m.codes[pc]);
        m.codes[pc] = { slot: target.slot, post: target.post, squad: target.squad || null, usedAt: null, client: null };
        ops.push({ op: 'del', kind: 'member', id: target.id });
        drop.push(target.client);
        out.postCode = pc;
        break;
      }
      case 'purge': {
        if (!staff) return fail(403, 'right');
        for (var oid in this.state.objects) {
          var o = this.state.objects[oid];
          if (!o.deleted && o.kind !== 'member' && o.by && o.by.client === b.client) ops.push({ op: 'del', kind: o.kind, id: o.id });
        }
        break;
      }
      case 'label': {
        if (!R.hasRight(P, actor, 'assignLabel')) return fail(403, 'right');
        if (!target || !target.confirmed) return fail(404, 'member');
        if (!P.functions.some(function (f) { return f.id === b.fn; })) return fail(400, 'fn');
        var list = (target.functions || []).slice(), at = list.indexOf(b.fn);
        if (at >= 0) list.splice(at, 1); else list.push(b.fn);
        ops.push({ op: 'patch', kind: 'member', id: target.id, data: { functions: list } });
        break;
      }
      case 'unlock':
        if (!staff) return fail(403, 'right');
        if (!m.locked) return fail(409, 'state');
        m.locked = false; m.lockedAt = null; m.unlockedAt = now; this.lastOpAt = now;
        break;
      case 'extend':
        if (!R.hasRight(P, actor, 'extend')) return fail(403, 'right');
        if (m.extended) return fail(409, 'extended');
        m.extended = true;
        break;
      case 'silence':
        if (!R.hasRight(P, actor, 'radioSilence')) return fail(403, 'right');
        m.frozen = b.on ? { at: now, reason: 'silence', by: actor.post } : null;
        break;
      case 'close':
        if (!staff) return fail(403, 'right');
        m.closed = true; m.closedAt = now;
        break;
      case 'observer':
        if (!staff) return fail(403, 'right');
        m.observerToken = 'obs' + R.randomCode(20);
        out.observerToken = m.observerToken;
        break;
      case 'rotate': {
        if (!staff) return fail(403, 'right');
        var next;
        do next = R.randomCode(6); while (next === m.code || this.rotated[next]);
        this.rotated[m.code] = true;
        m.code = next; m.epoch += 1; m.observerToken = null;
        this.activeMembers().forEach(function (x) {
          if (x.client !== actor.client) { ops.push({ op: 'del', kind: 'member', id: x.id }); drop.push(x.client); }
        });
        out.code = next;
        break;
      }
      default:
        return fail(400, 'action');
    }
    ops.forEach(function (op) { self.apply(op, byOf(actor)); });
    drop.forEach(function (client) { delete self.sessions[client]; });
    if (b.action === 'rotate') {
      this.sessions = {};
      out.session = this.newSession(actor.client);
    }
    if (ops.length) this.lastOpAt = now;
    out.seq = this.state.seq;
    out.serverNow = now;
    return ok(out);
  };

  // Staff and the observer only; words never leave.
  FixtureTransport.prototype.exportRoom = function (code, auth) {
    var g = this.enter(code, auth);
    if (g.fail) return g.fail;
    if (g.actor && !g.actor.confirmed) return fail(403, 'unconfirmed');
    if (g.actor && !R.isStaff(this.policy, g.actor)) return fail(403, 'right');
    var objects = [], members = [], id;
    for (id in this.state.objects) {
      var o = this.state.objects[id];
      if (o.deleted) continue;
      var c = copy(o);
      if (o.kind === 'member') { delete c.word; members.push(c); } else objects.push(c);
    }
    var ops = copy(this.log).map(function (op) { if (op.kind === 'member' && op.data) delete op.data.word; return op; });
    var m = this.meta;
    return ok({ meta: { code: m.code, fork: m.fork, server: m.server, planet: m.planet, createdAt: m.createdAt, closedAt: m.closedAt,
      extended: m.extended, frozen: m.frozen ? copy(m.frozen) : null }, members: members, objects: objects, ops: ops, text: '' });
  };

  FixtureTransport.prototype.getPolicy = function () { return ok(this.policy); };

  // Scripted officers act as members through the same write path; refusals land in scriptErrors.
  FixtureTransport.prototype.play = function (now) {
    if (!this.script.length) return;
    var elapsed = now - this.meta.createdAt, self = this, due = [];
    this.script = this.script.filter(function (step) {
      if (step.afterMs > elapsed) return true;
      due.push(step);
      return false;
    });
    due.forEach(function (step, i) {
      if (step.seat) { self.seat(step.by, step.seat, now); return; }
      var actor = self.memberOf(step.by.client);
      var gate = actor ? self.writeGate(actor) : { error: 'member' };
      var raw = copy(step.op);
      raw.cid = 'demo-' + self.log.length + '-' + i;
      var ack = gate || self.writeOne(actor, raw, now);
      if (ack.error) self.scriptErrors.push({ id: step.op.id, error: ack.error });
      else self.lastOpAt = now;
    });
  };

  FixtureTransport.prototype.seat = function (by, seat, now) {
    if (this.memberOf(by.client)) return;
    this.apply({ op: 'put', kind: 'member', id: 'mem-' + by.client + '-' + (this.state.seq + 1),
      data: { client: by.client, post: by.post, squad: by.squad || null, slot: by.post + ':' + (by.squad || '') + ':demo',
        callsign: R.cleanText(seat.callsign, this.policy.limits.callsign), confirmed: true, confirmedBy: 'demo', confirmedAt: now } }, byOf(by));
    this.seen[by.client] = now;
  };

  // A short LV-624 evening for whatever policy is loaded: a second staff officer
  // and the mortar crew take their seats, the crew publishes the round calibration
  // and its mortar, the staff officer sends a strike and a position request, and
  // the crew (never the author) accepts both.
  function demoScript(policy) {
    var ru = policy.fork === 'stories_cm';
    var staffPost = policy.posts.filter(function (p) { return p.level === 'staff'; })[0].id;
    var mortarDef = policy.assets.filter(function (a) { return a.type === 'mortar'; })[0];
    var so = { client: 'demo-staff-0001', post: staffPost, squad: null };
    var crew = { client: 'demo-crew-0001', post: mortarDef ? mortarDef.owner : staffPost, squad: null };
    return [
      { afterMs: 0, by: so, seat: { callsign: ru ? 'Орлов' : 'Orlov' } },
      { afterMs: 0, by: crew, seat: { callsign: ru ? 'Сидоров' : 'Sidorov' } },
      { afterMs: 3000, by: crew, op: { op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [212, -148] } } },
      { afterMs: 5000, by: crew, op: { op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { tile: [20, -98], state: 'deployed' } } },
      { afterMs: 8000, by: so, op: { op: 'put', kind: 'request', id: 'demo-req-1', data: { type: 'mortar', target: { x: 62, y: -62 },
        note: ru ? 'Гнездо у Nexus' : 'Nest near Nexus', priority: 'urgent', flags: [] } } },
      { afterMs: 12000, by: crew, op: { op: 'patch', kind: 'request', id: 'demo-req-1', expectedStatus: 'requested', data: { status: 'accepted' } } },
      { afterMs: 16000, by: so, op: { op: 'put', kind: 'request', id: 'demo-req-2', data: { type: 'position', target: { x: 30, y: -90 },
        note: ru ? 'Ближе к посадке' : 'Closer to the LZ', priority: 'normal', flags: [] } } },
      { afterMs: 20000, by: crew, op: { op: 'patch', kind: 'request', id: 'demo-req-2', expectedStatus: 'requested', data: { status: 'accepted' } } }
    ];
  }

  root.TacRoomFixture = { FixtureTransport: FixtureTransport, demoScript: demoScript };
})(typeof window !== 'undefined' ? window : globalThis);

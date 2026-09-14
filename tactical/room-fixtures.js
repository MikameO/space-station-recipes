// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// A fake Worker for the officers' room: same transport interface as
// HttpTransport, the rules of worker/room/room.js (write contract v2) on top of
// tactical/room-logic.js, and a scripted LV-624 round for the clickable demo
// (tactical.html#room=demo). Never more permissive than the Worker; the parity
// test scripts/test_room_client_worker.mjs holds the two together. Loaded on demand.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  var SYSTEM = { client: 'room', post: 'system', squad: null };
  var WRITE_KINDS = ['marker', 'line', 'area', 'request', 'asset', 'calibration', 'member'];
  var OPS = ['put', 'patch', 'del'];
  var CLIENT_RE = /^[A-Za-z0-9_-]{8,40}$/;
  var ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
  var CID_MEMORY = 500;          // resent ops are answered from the acks of the last 500 ops
  var KNOCKS_MAX = 4;            // fresh knocks per room
  var PAGE_BYTES = 256 * 1024;   // one poll page, besides the 500-op cap
  var WORDS = {
    ru: ['ФАЗАН', 'КЛЁН', 'РУБИН', 'ЯКОРЬ', 'ГРОМ', 'ЛИМОН', 'ТУМАН', 'КОМЕТА'],
    en: ['FALCON', 'MAPLE', 'ANCHOR', 'THUNDER', 'LEMON', 'HARBOR', 'COMET', 'SAPPHIRE']
  };

  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function reply(status, body, retryAfter) { return Promise.resolve({ status: status, body: body, retryAfter: retryAfter === undefined ? null : retryAfter }); }
  function ok(body, retryAfter) { return reply(200, body, retryAfter); }
  function fail(status, error) { return reply(status, { error: error }); }
  function byOf(m) { return { client: m.client, post: m.post, squad: m.squad || null }; }
  function cidOf(raw) { return raw && typeof raw === 'object' && typeof raw.cid === 'string' ? raw.cid.slice(0, 40) : ''; }

  // UTF-8 length as the Worker's TextEncoder counts it; a lone surrogate becomes U+FFFD, three bytes.
  function utf8Bytes(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  // A refusal as it arrives through JSON: a status the object never had is no key at all.
  function refusal(cid, error, status) {
    var a = { cid: cid, error: error };
    if (status !== undefined) a.status = status;
    return a;
  }

  // Knock words are for the members who confirm; the observer and the export never see them.
  function opWithoutWord(op) { if (op.kind === 'member' && op.data) delete op.data.word; return op; }
  function objectWithoutWord(o) { if (o.kind === 'member') delete o.word; return o; }

  function FixtureTransport(policy, opts) {
    opts = opts || {};
    this.policy = policy;
    this.now = opts.now || function () { return Date.now(); };
    this.skew = opts.skew || 0;
    this.script = (opts.script || []).slice();
    this.scriptErrors = [];
    this.rooms = 0;
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
    this.cids = {};
    this.cidOrder = [];
    this.rotated = {};
  };

  // Stamps and applies one op; {ok:true, seq} or applyOp's refusal. An event takes the id evt-<seq>.
  FixtureTransport.prototype.apply = function (op, by, now) {
    var seq = this.state.seq + 1;
    var stamped = { seq: seq, at: now, by: by, op: op.op, kind: op.kind, id: op.kind === 'event' ? 'evt-' + seq : op.id,
      data: op.data, expectedStatus: op.expectedStatus, cid: op.cid || '' };
    var res = R.applyOp(this.state, stamped);
    if (!res.ok) return res;
    this.log.push(copy(stamped));
    this.bytes += JSON.stringify(stamped).length;
    return { ok: true, seq: stamped.seq };
  };

  // The ack of an accepted op, kept per client and cid so a resend is answered without a second row.
  FixtureTransport.prototype.remember = function (client, cid, seq) {
    var ack = { cid: cid || '', seq: seq, dup: true };
    if (!cid || client === SYSTEM.client) return ack;
    var key = client + '|' + cid, at = this.cidOrder.indexOf(key);
    if (at >= 0) this.cidOrder.splice(at, 1);
    this.cidOrder.push(key);
    this.cids[key] = seq;
    while (this.cidOrder.length > CID_MEMORY) delete this.cids[this.cidOrder.shift()];
    return ack;
  };
  FixtureTransport.prototype.acked = function (client, cid) {
    var key = client + '|' + cid;
    return cid && has(this.cids, key) ? { cid: cid, seq: this.cids[key], dup: true } : null;
  };

  // The Worker's journal line with no object (radio silence, close, «Продолжить раунд», the idle lock).
  FixtureTransport.prototype.event = function (name, by, now) {
    return this.apply({ op: 'put', kind: 'event', id: '', data: { event: name } }, by, now);
  };

  FixtureTransport.prototype.activeMembers = function () {
    var out = [];
    for (var id in this.state.objects) {
      if (!has(this.state.objects, id)) continue;
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
    for (var id in this.state.objects) if (has(this.state.objects, id) && !this.state.objects[id].deleted && this.state.objects[id].kind !== 'member') n++;
    return n;
  };
  // A confirmed member, or a knock still within its word time.
  FixtureTransport.prototype.fresh = function (o, now) {
    return !!o.confirmed || now - (o.knockAt || o.at) < this.policy.ttl.wordSec * 1000;
  };
  FixtureTransport.prototype.confirmers = function () {
    var P = this.policy;
    return this.activeMembers().filter(function (x) { return x.confirmed && R.hasRight(P, x, 'confirmJoin'); });
  };

  FixtureTransport.prototype.slots = function () {
    var P = this.policy, out = [];
    P.posts.forEach(function (p) {
      if (p.level === 'observer') return;
      (p.perSquad ? Object.keys(P.squads) : [null]).forEach(function (squad) {
        for (var i = 0; i < p.max; i++) out.push({ slot: p.id + ':' + (squad || '') + ':' + i, post: p.id, squad: squad });
      });
    });
    return out;
  };
  FixtureTransport.prototype.newCode = function (codes, avoid) {
    var c;
    do c = R.randomCode(4); while (has(codes, c) || (avoid && has(avoid, c)));
    return c;
  };
  // The briefing sheet: one line per slot that has a post code, in policy order.
  FixtureTransport.prototype.sheet = function () {
    var codes = this.meta.codes, bySlot = {};
    Object.keys(codes).forEach(function (code) { bySlot[codes[code].slot] = code; });
    return this.slots().filter(function (s) { return has(bySlot, s.slot); })
      .map(function (s) { return { post: s.post, squad: s.squad, code: bySlot[s.slot] }; });
  };

  FixtureTransport.prototype.newSession = function (client) {
    var token = client + '.' + this.meta.epoch + '.' + R.randomCode(24);
    this.sessions[client] = token;
    return token;
  };

  FixtureTransport.prototype.authenticate = function (token) {
    var parts = String(token || '').split('.');
    if (parts.length !== 3 || !this.meta) return null;
    if (!has(this.sessions, parts[0]) || this.sessions[parts[0]] !== token || Number(parts[1]) !== this.meta.epoch) return null;
    return this.memberOf(parts[0]);
  };

  // A knocking member learns nothing about the room's activity: no lastOpAt.
  FixtureTransport.prototype.publicMeta = function (full) {
    var m = this.meta, d = R.roomDeadlines(this.policy, m.createdAt, m.extended);
    var out = { fork: m.fork, server: m.server, planet: m.planet, h: m.h, createdAt: m.createdAt, epoch: m.epoch,
      locked: m.locked, closed: m.closed, frozen: m.frozen ? copy(m.frozen) : null, extended: m.extended,
      maxAt: d.maxAt, warnAt: d.warnAt };
    if (full) out.lastOpAt = this.lastOpAt;
    return out;
  };

  FixtureTransport.prototype.presence = function (now) {
    var out = {}, self = this;
    this.activeMembers().forEach(function (m) { out[m.client] = has(self.seen, m.client) ? now - self.seen[m.client] : null; });
    return out;
  };

  // The Worker's alarm (close at the deadline, delete after the export grace), the script, then the lazy lifecycle.
  FixtureTransport.prototype.tick = function (now) {
    var m = this.meta, P = this.policy;
    var grace = P.ttl.exportGraceSec * 1000;
    if ((m.closed && now >= m.closedAt + grace) || (!m.closed && m.locked && now >= m.lockedAt + grace)) { this.wipe(); return; }
    if (!m.closed && now >= R.roomDeadlines(P, m.createdAt, m.extended).maxAt) { m.closed = true; m.closedAt = now; this.event('close', SYSTEM, now); }
    this.play(now);
    this.lifecycle(now);
  };

  // The idle lock; knocks past their word time go even from a locked room; confirmed members idle out
  // of an open room only, and the last member who can confirm joins never does.
  FixtureTransport.prototype.lifecycle = function (now) {
    var m = this.meta, P = this.policy, self = this;
    if (m.closed) return;
    if (!m.locked && R.idleLocked(P, this.lastOpAt, now)) { m.locked = true; m.lockedAt = now; this.event('lock', SYSTEM, now); }
    var members = this.activeMembers();
    var gone = members.filter(function (o) { return !o.confirmed && !self.fresh(o, now); });
    if (!m.locked) {
      var base = Math.max(m.createdAt, m.unlockedAt || 0);
      var activeAt = function (o) { return Math.max(base, self.memberOpAt[o.client] || 0, o.presentAt || 0, o.confirmedAt || 0, o.at); };
      var stale = members.filter(function (o) { return o.confirmed && R.memberStale(P, activeAt(o), now); });
      var confirmers = this.confirmers();
      if (confirmers.length && confirmers.every(function (o) { return stale.indexOf(o) >= 0; })) {
        var keep = confirmers.reduce(function (a, b) { return activeAt(b) > activeAt(a) ? b : a; });
        stale.splice(stale.indexOf(keep), 1);
      }
      gone = gone.concat(stale);
    }
    gone.forEach(function (o) {
      self.apply({ op: 'del', kind: 'member', id: o.id, cid: 'auto' }, SYSTEM, now);
      delete self.sessions[o.client];
    });
  };

  // The request gate: rotated or unknown code, lifecycle, then the observer token or the session.
  FixtureTransport.prototype.enter = function (code, auth) {
    var now = this.serverNow();
    if (has(this.rotated, code)) return { fail: fail(401, 'rotated') };
    if (!this.meta || code !== this.meta.code) return { fail: fail(404, 'room') };
    this.tick(now);
    if (!this.meta) return { fail: fail(404, 'room') };
    if (auth && auth.observer) {
      return this.meta.observerToken && auth.observer === this.meta.observerToken ? { observer: true, now: now } : { fail: fail(401, 'observer') };
    }
    var actor = this.authenticate(auth && auth.session);
    return actor ? { actor: actor, now: now } : { fail: fail(401, 'session') };
  };

  // Answers {code, fork, server, session, sheet, epoch}: no observer token, staff mint it with the observer action.
  FixtureTransport.prototype.create = function (body) {
    var P = this.policy, self = this, now = this.serverNow();
    if (!isObj(body)) return fail(400, 'bad-json');
    var c = isObj(body.creator) ? body.creator : {};
    if (!CLIENT_RE.test(String(c.client || ''))) return fail(400, 'client');
    if (R.levelOf(P, c.post) !== 'staff') return fail(400, 'creator');
    if (typeof body.planet !== 'string' || !/^[a-z0-9_.-]{1,40}$/i.test(body.planet)) return fail(400, 'planet');
    this.wipe();
    this.rooms += 1;
    var codes = {};
    this.slots().forEach(function (s) { codes[self.newCode(codes)] = { slot: s.slot, post: s.post, squad: s.squad, usedAt: null, client: null }; });
    this.meta = { code: this.rooms === 1 ? 'DEMA42' : R.randomCode(6),   // room codes use no O, I, 0 or 1
      codeHistory: [], fork: P.fork, server: 'Demo', planet: body.planet, h: String(body.h || '').slice(0, 40), createdAt: now,
      extended: false, locked: false, lockedAt: null, unlockedAt: null, closed: false, closedAt: null, frozen: null, epoch: 1,
      codes: codes, observerToken: null };
    this.lastOpAt = now;
    this.apply({ op: 'put', kind: 'member', id: 'mem-' + c.client + '-1',
      data: { client: c.client, post: c.post, squad: null, slot: c.post + '::creator', callsign: R.cleanText(c.callsign, P.limits.callsign),
        confirmed: true, confirmedBy: 'creator', confirmedAt: now } }, byOf(c), now);
    // Assets exist from the start (state unknown), seeded from the policy: clients never put them.
    P.assets.forEach(function (def) {
      for (var n = 1; n <= (def.count || 1); n++) {
        self.apply({ op: 'put', kind: 'asset', id: 'asset-' + def.type + '-' + n,
          data: { type: def.type, n: n, owner: { post: def.owner }, state: null, notes: '', claimedBy: null } }, SYSTEM, now);
      }
    });
    return ok({ code: this.meta.code, fork: P.fork, server: 'Demo', session: this.newSession(c.client), sheet: this.sheet(), epoch: 1 });
  };

  FixtureTransport.prototype.join = function (code, body, auth) {
    var P = this.policy, self = this, now = this.serverNow();
    if (has(this.rotated, code)) return fail(401, 'rotated');
    if (!this.meta || code !== this.meta.code) return fail(404, 'room');
    this.tick(now);
    var m = this.meta;
    if (!m) return fail(404, 'room');
    if (!isObj(body)) return fail(400, 'json');
    if (m.closed) return fail(423, 'closed');
    if (m.locked) return fail(423, 'locked');
    if (m.frozen && m.frozen.reason !== 'silence') return fail(423, m.frozen.reason);
    if (!CLIENT_RE.test(String(body.client || ''))) return fail(400, 'client');
    var members = this.activeMembers();
    var existing = members.filter(function (x) { return x.client === body.client; })[0] || null;
    // A client id proves nothing: re-entering as a confirmed member takes that member's own session.
    if (existing && existing.confirmed) {
      var proof = this.authenticate(auth && auth.session);
      if (!proof || proof.client !== body.client) return fail(409, 'member');
    }
    var post, squad, slot, entry = null, holder = null;
    if (body.postCode) {
      var key = String(body.postCode).toUpperCase();
      entry = has(m.codes, key) ? m.codes[key] : null;
      // An unknown code and a code bound to someone else answer alike.
      if (!entry || (entry.client && entry.client !== body.client)) return fail(404, 'postCode');
      post = entry.post; squad = entry.squad; slot = entry.slot;
      // The first presentation of a code moves whoever still held its slot out.
      if (!entry.client) holder = members.filter(function (x) { return x.slot === slot && x.client !== body.client; })[0] || null;
    } else {
      var def = R.postDef(P, body.post);
      if (!def || def.level === 'observer') return fail(400, 'post');
      squad = def.perSquad ? body.squad : null;
      if (def.perSquad && !(typeof squad === 'string' && has(P.squads, squad))) return fail(400, 'squad');
      post = def.id;
      slot = post + ':' + (squad || '') + ':word';
    }
    if (existing && existing.confirmed && existing.slot === slot) {
      return ok({ session: this.newSession(body.client), status: 'confirmed', post: post, squad: squad, epoch: m.epoch });
    }
    var pdef = R.postDef(P, post);
    var taken = members.filter(function (x) {
      return x.post === post && (x.squad || null) === (squad || null) && x.client !== body.client && x !== holder && self.fresh(x, now);
    }).length;
    if (pdef && taken >= pdef.max) return fail(409, 'full');
    var knocks = members.filter(function (x) { return !x.confirmed && x.client !== body.client && self.fresh(x, now); }).length;
    if (knocks >= KNOCKS_MAX) return fail(429, 'knocks');
    if (entry) { entry.usedAt = entry.usedAt || now; entry.client = body.client; }
    var words = m.fork === 'stories_cm' ? WORDS.ru : WORDS.en;
    var word = words[Math.floor(Math.random() * words.length)];
    var id = 'mem-' + body.client + '-' + (this.state.seq + 1);
    if (existing) this.apply({ op: 'del', kind: 'member', id: existing.id, cid: 'rejoin' }, SYSTEM, now);
    if (holder) this.apply({ op: 'del', kind: 'member', id: holder.id, cid: 'slot' }, SYSTEM, now);
    this.apply({ op: 'put', kind: 'member', id: id,
      data: { client: body.client, post: post, squad: squad, slot: slot, callsign: R.cleanText(body.callsign, P.limits.callsign),
        confirmed: false, word: word, knockAt: now } }, { client: body.client, post: post, squad: squad }, now);
    if (holder) delete this.sessions[holder.client];
    var session = this.newSession(body.client);
    this.lastOpAt = now;
    return ok({ session: session, status: 'knocking', word: word, post: post, squad: squad, epoch: m.epoch });
  };

  FixtureTransport.prototype.poll = function (code, since, auth) {
    var g = this.enter(code, auth);
    if (g.fail) return g.fail;
    var now = g.now, actor = g.actor;
    since = Math.max(0, parseInt(since || '0', 10) || 0);
    var retryAfter = R.retryAfter(this.lastRequestOpAt, now);
    if (actor) this.seen[actor.client] = now;
    if (actor && !actor.confirmed) {
      return ok({ serverNow: now, seq: this.state.seq, meta: this.publicMeta(false), presence: {}, knocking: true, word: actor.word, ops: [] }, retryAfter);
    }
    var rows = this.log.filter(function (op) { return op.seq > since; }).slice(0, 500);
    var ops = [], size = 0, more = rows.length === 500;
    for (var i = 0; i < rows.length; i++) {
      var op = copy(rows[i]);
      if (!actor) opWithoutWord(op);
      var n = JSON.stringify(op).length;
      if (ops.length && size + n > PAGE_BYTES) { more = true; break; }
      ops.push(op);
      size += n;
    }
    return ok({ serverNow: now, seq: this.state.seq, meta: this.publicMeta(true), presence: this.presence(now), ops: ops, more: more }, retryAfter);
  };

  FixtureTransport.prototype.snapshot = function (code, cursor, auth) {
    var g = this.enter(code, auth);
    if (g.fail) return g.fail;
    if (g.actor && !g.actor.confirmed) return fail(403, 'unconfirmed');
    var objects = this.state.objects, after = cursor || '';
    var ids = Object.keys(objects).filter(function (id) { return !objects[id].deleted && id > after; }).sort();
    var page = ids.slice(0, 200).map(function (id) { var o = copy(objects[id]); return g.actor ? o : objectWithoutWord(o); });
    return ok({ serverNow: g.now, seq: this.state.seq, objects: page, cursor: ids.length > 200 ? ids[199] : null, meta: this.publicMeta(true) });
  };

  FixtureTransport.prototype.allow = function (client, now) {
    var L = this.policy.limits;
    var r = has(this.rate, client) ? this.rate[client] : (this.rate[client] = { sec: now, secN: 0, min: now, minN: 0 });
    if (now - r.sec >= 1000) { r.sec = now; r.secN = 0; }
    if (now - r.min >= 60000) { r.min = now; r.minN = 0; }
    if (r.secN >= L.opsPerSec || r.minN >= L.opsPerMin) return false;
    r.secN++; r.minN++;
    return true;
  };

  FixtureTransport.prototype.send = function (code, ops, auth) {
    var g = this.enter(code, auth);
    if (g.fail) return g.fail;
    if (g.observer) return fail(403, 'observer');
    var r = this.write(g.actor, ops, g.now);
    return r.error ? fail(r.status, r.error) : ok(r.body);
  };

  // The Worker's write(): the batch gate, then each op in turn. {status, error} or {body}.
  FixtureTransport.prototype.write = function (actor, ops, now) {
    var self = this, m = this.meta;
    if (!actor.confirmed) return { status: 403, error: 'unconfirmed' };
    // The ops as the Worker reads them: through JSON, at most 64.
    var list = Array.isArray(ops) ? copy(ops).slice(0, 64) : [];
    var resent = function (raw) { return self.acked(actor.client, cidOf(raw)); };
    // Presence heartbeats (a member patch of presentAt alone) pass a lock and radio silence, so a quiet room keeps
    // its members; a position or calibration patch is a write like any other.
    var heartbeat = function (raw) { return !!raw && typeof raw === 'object' && R.isHeartbeat(raw); };
    var blocked = m.closed ? 'closed'
      : m.locked && !list.every(heartbeat) ? 'locked'
      : m.frozen && !(m.frozen.reason === 'silence' && list.every(heartbeat)) ? m.frozen.reason
      : null;
    if (blocked) {
      if (list.length && list.every(resent)) return { body: { acks: list.map(resent), serverNow: now, seq: this.state.seq } };
      return { status: 423, error: blocked };
    }
    var acks = [], accepted = 0;
    for (var i = 0; i < list.length; i++) {
      var ack = this.writeOne(actor, list[i], now);
      acks.push(ack);
      if (ack.error === 'budget') break;
      if (!ack.error && !ack.dup) accepted++;
    }
    if (accepted) this.lastOpAt = now;
    return { body: { acks: acks, serverNow: now, seq: this.state.seq } };
  };

  // One op, in the Worker's order: resend, shape, size, rate, budget, kind, R.cleanData,
  // R.validateData / R.validatePatch, R.canWrite, R.stampData, R.applyOp. Returns the ack.
  FixtureTransport.prototype.writeOne = function (actor, raw, now) {
    var P = this.policy, L = P.limits;
    var cid = cidOf(raw);
    var again = this.acked(actor.client, cid);
    if (again) return again;
    if (!raw || typeof raw !== 'object' || WRITE_KINDS.indexOf(raw.kind) < 0 || OPS.indexOf(raw.op) < 0 ||
        typeof raw.id !== 'string') return { cid: cid, error: 'shape' };
    // Ids start with a letter or digit, never name a prototype member, and `calibration` is the calibration's own.
    if (!ID_RE.test(raw.id) || R.idError(raw.kind, raw.id)) return { cid: cid, error: 'id' };
    if (utf8Bytes(JSON.stringify(raw)) > L.message) return { cid: cid, error: 'size' };
    if (!this.allow(actor.client, now)) return { cid: cid, error: 'rate' };
    if (this.bytes > L.bytes) { this.meta.frozen = { at: now, reason: 'budget' }; return { cid: cid, error: 'budget' }; }
    var existing = has(this.state.objects, raw.id) ? this.state.objects[raw.id] : undefined;
    if (existing && existing.kind !== raw.kind) return { cid: cid, error: 'kind' };
    var data = R.cleanData(P, raw.kind, raw.op, raw.data);
    var expectedStatus = typeof raw.expectedStatus === 'string' ? raw.expectedStatus : undefined;
    if (raw.kind === 'member') {
      // A member object is its holder's own and only patched: presence, position, the calibration in use.
      var mine = existing && !existing.deleted && existing.client === actor.client;
      if (raw.op !== 'patch' || !mine) return { cid: cid, error: 'right' };
      var badMember = R.validateMemberPatch(P, actor, data);
      if (badMember) return { cid: cid, error: badMember };
    } else {
      var bad = raw.op === 'put' ? R.validateData(P, raw.kind, data)
        : raw.op === 'patch' ? R.validatePatch(P, raw.kind, data, existing) : null;
      if (bad) return { cid: cid, error: bad };
      if (raw.op === 'put' && !existing && this.countObjects() >= L.objects) return { cid: cid, error: 'objects' };
      var check = R.canWrite(P, actor, { op: raw.op, kind: raw.kind, id: raw.id, data: data, expectedStatus: expectedStatus },
        existing, { claimed: R.claimants(this.state.objects, existing) });
      // The author's own put already stands (its ack was lost beyond the cid memory): acknowledge, write nothing.
      if (!check.ok && check.reason === 'duplicate') return this.remember(actor.client, cid, existing.seq);
      if (!check.ok) return { cid: cid, error: check.reason };
      if (raw.op === 'del' && existing.deleted) return this.remember(actor.client, cid, existing.seq);
    }
    R.stampData(raw.kind, raw.op, data, byOf(actor), now);
    var done = this.apply({ op: raw.op, kind: raw.kind, id: raw.id, data: data, expectedStatus: expectedStatus, cid: cid }, byOf(actor), now);
    if (!done.ok) return refusal(cid, done.reason, existing ? existing.status : undefined);
    this.remember(actor.client, cid, done.seq);
    this.memberOpAt[actor.client] = now;
    if (raw.kind === 'request') this.lastRequestOpAt = now;
    return { cid: cid, seq: done.seq };
  };

  FixtureTransport.prototype.admin = function (code, body, auth) {
    var g = this.enter(code, auth);
    if (g.fail) return g.fail;
    if (g.observer) return fail(403, 'observer');
    if (!isObj(body)) return fail(400, 'json');
    var b = body, actor = g.actor, now = g.now, m = this.meta, P = this.policy, self = this;
    if (!actor.confirmed) return fail(403, 'unconfirmed');
    var action = typeof b.action === 'string' ? b.action : '';
    if (m.closed) return fail(423, 'closed');
    // Radio silence is the staff's own freeze; an administration stop or a spent budget holds every action but close and observer.
    if (m.frozen && m.frozen.reason !== 'silence' && action !== 'close' && action !== 'observer') return fail(423, m.frozen.reason);
    var staff = R.isStaff(P, actor);
    var target = typeof b.client === 'string' ? this.memberOf(b.client) : null;
    var out = { ok: true }, ops = [], drop = [], k;
    var lastConfirmer = function (x) { return x.confirmed && R.hasRight(P, x, 'confirmJoin') && self.confirmers().length <= 1; };
    switch (action) {
      case 'confirm': {
        if (!R.hasRight(P, actor, 'confirmJoin')) return fail(403, 'right');
        if (!target || target.confirmed) return fail(404, 'member');
        if (now - target.knockAt > P.ttl.wordSec * 1000) return fail(409, 'expired');
        var knocking = this.activeMembers().filter(function (x) { return !x.confirmed && self.fresh(x, now); }).length;
        if (knocking >= 2 && b.word !== target.word) return fail(409, 'word');
        ops.push({ op: 'patch', kind: 'member', id: target.id, data: { confirmed: true, confirmedBy: actor.post, confirmedAt: now, word: null } });
        break;
      }
      case 'release': {
        if (!target) return fail(404, 'member');
        if (lastConfirmer(target)) return fail(409, 'last');
        ops.push({ op: 'del', kind: 'member', id: target.id });
        drop.push(target.client);
        // The post code goes back to the sheet: whoever holds it next knocks again.
        for (k in m.codes) if (has(m.codes, k) && m.codes[k].client === target.client) m.codes[k].client = null;
        break;
      }
      case 'reissue': {
        if (!target) return fail(404, 'member');
        if (!staff && !(target.squad && actor.squad === target.squad)) return fail(403, 'right');
        if (lastConfirmer(target)) return fail(409, 'last');
        Object.keys(m.codes).forEach(function (c) { if (m.codes[c].slot === target.slot) delete m.codes[c]; });
        var pc = this.newCode(m.codes);
        m.codes[pc] = { slot: target.slot, post: target.post, squad: target.squad || null, usedAt: null, client: null };
        ops.push({ op: 'del', kind: 'member', id: target.id });
        drop.push(target.client);
        out.postCode = pc;
        break;
      }
      case 'purge': {
        if (!staff) return fail(403, 'right');
        for (var oid in this.state.objects) {
          if (!has(this.state.objects, oid)) continue;
          var o = this.state.objects[oid];
          // The policy's seeded assets belong to the room: no client name reaches them.
          if (o.deleted || o.kind === 'member' || !o.by || o.by.client === SYSTEM.client) continue;
          if (o.by.client === b.client) ops.push({ op: 'del', kind: o.kind, id: o.id });
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
        ops.push({ op: 'put', kind: 'event', id: '', data: { event: 'unlock' } });
        break;
      case 'extend':
        if (!R.hasRight(P, actor, 'extend')) return fail(403, 'right');
        if (m.extended) return fail(409, 'extended');
        if (now < R.roomDeadlines(P, m.createdAt, false).warnAt) return fail(409, 'early');
        m.extended = true;
        break;
      case 'silence':
        if (!R.hasRight(P, actor, 'radioSilence')) return fail(403, 'right');
        // The journal records a change only: a second «on» moves the frozen time, never a second line.
        if (!!b.on !== !!m.frozen) ops.push({ op: 'put', kind: 'event', id: '', data: { event: b.on ? 'silence_on' : 'silence_off' } });
        m.frozen = b.on ? { at: now, reason: 'silence', by: actor.post } : null;
        break;
      case 'close':
        if (!staff) return fail(403, 'right');
        m.closed = true; m.closedAt = now;
        ops.push({ op: 'put', kind: 'event', id: '', data: { event: 'close' } });
        break;
      case 'observer':
        if (!staff) return fail(403, 'right');
        m.observerToken = 'obs' + R.randomCode(24);
        out.observerToken = m.observerToken;
        break;
      case 'rotate': {
        if (!staff) return fail(403, 'right');
        var next;
        do next = R.randomCode(6); while (next === m.code || has(this.rotated, next));
        this.rotated[m.code] = true;
        m.codeHistory = m.codeHistory.concat(m.code);
        m.code = next; m.epoch += 1; m.observerToken = null;
        // Post codes nobody used yet are on the leaked sheet too: they change; bound codes stay with their holders.
        var old = {};
        Object.keys(m.codes).forEach(function (c) { old[c] = true; });
        Object.keys(old).forEach(function (c) {
          if (m.codes[c].client) return;
          var entry = m.codes[c];
          delete m.codes[c];
          m.codes[self.newCode(m.codes, old)] = entry;
        });
        this.activeMembers().forEach(function (x) {
          if (x.client !== actor.client) { ops.push({ op: 'del', kind: 'member', id: x.id }); drop.push(x.client); }
        });
        out.code = next;
        out.sheet = this.sheet();
        break;
      }
      default:
        return fail(400, 'action');
    }
    var applied = 0;
    // Journal events are no activity: only real ops move the idle-lock clock.
    ops.forEach(function (op) { if (self.apply(op, byOf(actor), now).ok && op.kind !== 'event') applied++; });
    if (action === 'rotate') {
      this.sessions = {};
      out.session = this.newSession(actor.client);
    }
    drop.forEach(function (client) { delete self.sessions[client]; });
    if (applied) this.lastOpAt = now;
    this.memberOpAt[actor.client] = now;
    out.seq = this.state.seq;
    out.serverNow = now;
    return ok(out);
  };

  // Staff and the observer only; words never leave.
  FixtureTransport.prototype.exportRoom = function (code, auth) {
    var g = this.enter(code, auth);
    if (g.fail) return g.fail;
    if (!g.observer) {
      if (!g.actor.confirmed) return fail(403, 'unconfirmed');
      if (!R.isStaff(this.policy, g.actor)) return fail(403, 'right');
    }
    var members = this.activeMembers().map(function (x) { return objectWithoutWord(copy(x)); });
    var objects = [];
    for (var id in this.state.objects) {
      if (!has(this.state.objects, id)) continue;
      var o = this.state.objects[id];
      if (!o.deleted && o.kind !== 'member') objects.push(copy(o));
    }
    var ops = copy(this.log).map(opWithoutWord);
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
      if (!actor) { self.scriptErrors.push({ id: step.op.id, error: 'member' }); return; }
      var raw = copy(step.op);
      raw.cid = 'demo-' + self.log.length + '-' + i;
      var r = self.write(actor, [raw], now);
      var ack = r.error ? r : r.body.acks[0];
      if (ack.error) self.scriptErrors.push({ id: step.op.id, error: ack.error });
    });
  };

  // A scripted officer sits in the last sheet seat of its post, as if it had come in before the sheet went out:
  // whoever presents that seat's unused code takes the seat over, by the Worker's holder rule in join().
  FixtureTransport.prototype.seat = function (by, seat, now) {
    if (this.memberOf(by.client)) return;
    var def = R.postDef(this.policy, by.post);
    this.apply({ op: 'put', kind: 'member', id: 'mem-' + by.client + '-' + (this.state.seq + 1),
      data: { client: by.client, post: by.post, squad: by.squad || null, slot: by.post + ':' + (by.squad || '') + ':' + (def ? def.max - 1 : 'demo'),
        callsign: R.cleanText(seat.callsign, this.policy.limits.callsign), confirmed: true, confirmedBy: 'demo', confirmedAt: now } }, byOf(by), now);
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

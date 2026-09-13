// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// A fake Worker for the officers' room: same transport interface as
// HttpTransport, rules from tactical/room-logic.js, and a scripted LV-624
// round for the clickable demo (tactical.html#room=demo). Loaded on demand.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function ok(body, retryAfter) { return Promise.resolve({ status: 200, body: body, retryAfter: retryAfter || 2 }); }
  function fail(status, error) { return Promise.resolve({ status: status, body: { error: error }, retryAfter: null }); }
  function byOf(m) { return { client: m.client, post: m.post, squad: m.squad || null }; }

  function FixtureTransport(policy, opts) {
    opts = opts || {};
    this.policy = policy;
    this.now = opts.now || function () { return Date.now(); };
    this.skew = opts.skew || 0;
    this.script = (opts.script || []).slice();
    this.state = R.createState();
    this.log = [];
    this.sessions = {};
    this.codes = {};
    this.code = null;
    this.createdAt = null;
    this.planet = null;
    this.frozen = null;
    this.locked = false;
    this.closed = false;
  }

  FixtureTransport.prototype.serverNow = function () { return this.now() + this.skew; };

  FixtureTransport.prototype.apply = function (op, by) {
    var stamped = { seq: this.state.seq + 1, at: this.serverNow(), by: by, op: op.op, kind: op.kind, id: op.id,
      data: copy(op.data || {}), expectedStatus: op.expectedStatus, cid: op.cid || '' };
    var res = R.applyOp(this.state, stamped);
    if (res.ok) this.log.push(copy(stamped));
    return res;
  };

  FixtureTransport.prototype.member = function (client) {
    for (var id in this.state.objects) {
      var o = this.state.objects[id];
      if (o.kind === 'member' && !o.deleted && o.client === client) return o;
    }
    return null;
  };

  FixtureTransport.prototype.who = function (auth) {
    if (auth && auth.observer) return auth.observer === 'demo-observer' ? { observer: true } : null;
    var client = auth && auth.session ? String(auth.session).split('.')[0] : null;
    if (!client || this.sessions[client] !== auth.session) return null;
    return this.member(client);
  };

  FixtureTransport.prototype.play = function () {
    var elapsed = this.serverNow() - this.createdAt, self = this;
    this.script = this.script.filter(function (step) {
      if (step.afterMs > elapsed) return true;
      self.apply(step.op, step.by);
      return false;
    });
  };

  FixtureTransport.prototype.meta = function () {
    var d = R.roomDeadlines(this.policy, this.createdAt, false);
    return { fork: this.policy.fork, server: 'Demo', planet: this.planet, h: '', createdAt: this.createdAt, epoch: 1,
      locked: this.locked, closed: this.closed, frozen: this.frozen, extended: false, maxAt: d.maxAt, warnAt: d.warnAt,
      lastOpAt: this.serverNow() };
  };

  FixtureTransport.prototype.create = function (body) {
    var P = this.policy, sheet = [], self = this;
    this.code = 'DEMA42';   // room codes use no O, I, 0 or 1
    this.createdAt = this.serverNow();
    this.planet = body.planet;
    P.posts.forEach(function (p) {
      if (p.level === 'observer') return;
      (p.perSquad ? Object.keys(P.squads) : [null]).forEach(function (sq) {
        for (var i = 0; i < p.max; i++) {
          var c;
          do c = R.randomCode(4); while (self.codes[c]);
          self.codes[c] = { slot: p.id + ':' + (sq || '') + ':' + i, post: p.id, squad: sq, client: null };
          sheet.push({ post: p.id, squad: sq, code: c });
        }
      });
    });
    var c = body.creator;
    this.apply({ op: 'put', kind: 'member', id: 'mem-' + c.client,
      data: { client: c.client, post: c.post, squad: null, slot: c.post + '::creator', callsign: c.callsign || '', confirmed: true, confirmedAt: this.serverNow() } },
      { client: c.client, post: c.post, squad: null });
    P.assets.forEach(function (def) {
      for (var n = 1; n <= (def.count || 1); n++) {
        self.apply({ op: 'put', kind: 'asset', id: 'asset-' + def.type + '-' + n,
          data: { type: def.type, n: n, owner: { post: def.owner }, state: null, notes: '', claimedBy: null } },
          { client: 'room', post: 'system', squad: null });
      }
    });
    this.sessions[c.client] = c.client + '.1.demo';
    return ok({ code: this.code, session: this.sessions[c.client], sheet: sheet, observerToken: 'demo-observer', epoch: 1 });
  };

  FixtureTransport.prototype.join = function (code, body) {
    if (code !== this.code) return fail(404, 'room');
    var post, squad, slot;
    if (body.postCode) {
      var e = this.codes[body.postCode];
      if (!e) return fail(404, 'postCode');
      if (e.client && e.client !== body.client) return fail(409, 'used');
      e.client = body.client;
      post = e.post; squad = e.squad; slot = e.slot;
    } else {
      post = body.post; squad = body.squad || null; slot = post + ':' + (squad || '') + ':word';
    }
    var word = this.policy.fork === 'stories_cm' ? 'ФАЗАН' : 'FALCON';
    this.apply({ op: 'put', kind: 'member', id: 'mem-' + body.client + '-' + (this.state.seq + 1),
      data: { client: body.client, post: post, squad: squad, slot: slot, callsign: body.callsign || '', confirmed: false, word: word, knockAt: this.serverNow() } },
      { client: body.client, post: post, squad: squad });
    this.sessions[body.client] = body.client + '.1.demo';
    return ok({ session: this.sessions[body.client], status: 'knocking', word: word, post: post, squad: squad, epoch: 1 });
  };

  FixtureTransport.prototype.poll = function (code, since, auth) {
    if (code !== this.code) return fail(404, 'room');
    var who = this.who(auth);
    if (!who) return fail(401, 'session');
    this.play();
    var base = { serverNow: this.serverNow(), seq: this.state.seq, meta: this.meta(), presence: {} };
    if (who.kind === 'member' && !who.confirmed) { base.knocking = true; base.word = who.word; base.ops = []; return ok(base); }
    base.ops = this.log.filter(function (op) { return op.seq > since; });
    base.more = false;
    return ok(base);
  };

  FixtureTransport.prototype.snapshot = function (code, cursor, auth) {
    var who = this.who(auth);
    if (!who) return fail(401, 'session');
    var objs = [];
    for (var id in this.state.objects) if (!this.state.objects[id].deleted) objs.push(copy(this.state.objects[id]));
    return ok({ serverNow: this.serverNow(), seq: this.state.seq, objects: objs, cursor: null, meta: this.meta() });
  };

  FixtureTransport.prototype.send = function (code, ops, auth) {
    var who = this.who(auth), self = this;
    if (!who) return fail(401, 'session');
    if (who.observer) return fail(403, 'observer');
    if (!who.confirmed) return fail(403, 'unconfirmed');
    if (this.closed) return fail(423, 'closed');
    if (this.locked) return fail(423, 'locked');
    if (this.frozen) return fail(423, this.frozen.reason);
    var acks = [];
    ops.forEach(function (raw) {
      var existing = self.state.objects[raw.id];
      var data = copy(raw.data || {});
      if (raw.kind === 'member') {
        if (!(existing && existing.client === who.client)) { acks.push({ cid: raw.cid, error: 'right' }); return; }
        data = { presentAt: self.serverNow() };
      } else {
        if (raw.op === 'put') {
          var bad = R.validateData(self.policy, raw.kind, data);
          if (bad) { acks.push({ cid: raw.cid, error: bad }); return; }
        }
        if (raw.kind === 'request' && raw.op === 'put') data.status = 'requested';
        if (raw.kind === 'request' && data.status === 'firing') data.firedAt = self.serverNow();
        if (raw.kind === 'request' && data.status === 'accepted') data.acceptedBy = byOf(who);
        if (raw.kind === 'request' && data.status === 'denied') data.deniedBy = byOf(who);
        var check = R.canWrite(self.policy, who, { op: raw.op, kind: raw.kind, id: raw.id, data: data, expectedStatus: raw.expectedStatus },
          existing, { claimed: R.claimants(self.state.objects, existing) });
        if (!check.ok) { acks.push({ cid: raw.cid, error: check.reason }); return; }
      }
      var res = self.apply({ op: raw.op, kind: raw.kind, id: raw.id, data: data, expectedStatus: raw.expectedStatus, cid: raw.cid }, byOf(who));
      acks.push(res.ok ? { cid: raw.cid, seq: self.state.seq } : { cid: raw.cid, error: res.reason, status: existing && existing.status });
    });
    return ok({ acks: acks, serverNow: this.serverNow(), seq: this.state.seq });
  };

  FixtureTransport.prototype.admin = function (code, body, auth) {
    var who = this.who(auth);
    if (!who || who.observer) return fail(401, 'session');
    var target = body.client ? this.member(body.client) : null;
    switch (body.action) {
      case 'confirm':
        if (!target || target.confirmed) return fail(404, 'member');
        this.apply({ op: 'patch', kind: 'member', id: target.id, data: { confirmed: true, confirmedBy: who.post, confirmedAt: this.serverNow(), word: null } }, byOf(who));
        return ok({ ok: true });
      case 'release':
      case 'reissue':
        if (!target) return fail(404, 'member');
        this.apply({ op: 'del', kind: 'member', id: target.id }, byOf(who));
        delete this.sessions[target.client];
        return ok(body.action === 'reissue' ? { ok: true, postCode: 'NEW4' } : { ok: true });
      case 'revoke':
        delete this.sessions[body.client];
        return ok({ ok: true });
      case 'label':
        if (!target) return fail(404, 'member');
        var list = (target.functions || []).slice(), i = list.indexOf(body.fn);
        if (i >= 0) list.splice(i, 1); else list.push(body.fn);
        this.apply({ op: 'patch', kind: 'member', id: target.id, data: { functions: list } }, byOf(who));
        return ok({ ok: true });
      case 'silence': this.frozen = body.on ? { at: this.serverNow(), reason: 'silence' } : null; return ok({ ok: true });
      case 'unlock': this.locked = false; return ok({ ok: true });
      case 'close': this.closed = true; return ok({ ok: true });
      case 'observer': return ok({ ok: true, observerToken: 'demo-observer' });
      default: return ok({ ok: true });
    }
  };

  FixtureTransport.prototype.exportRoom = function () {
    var objects = [], id;
    for (id in this.state.objects) if (!this.state.objects[id].deleted) objects.push(copy(this.state.objects[id]));
    return ok({ meta: this.meta(), members: objects.filter(function (o) { return o.kind === 'member'; }),
      objects: objects.filter(function (o) { return o.kind !== 'member'; }), ops: copy(this.log), text: '' });
  };

  FixtureTransport.prototype.getPolicy = function () { return ok(this.policy); };

  // A short LV-624 evening for whatever policy is loaded: a second staff officer
  // and the mortar crew join, the crew publishes the round calibration and its
  // mortar, the staff officer sends a strike and a position request, the crew accepts.
  function demoScript(policy) {
    var ru = policy.fork === 'stories_cm';
    var staffPost = policy.posts.filter(function (p) { return p.level === 'staff'; })[0].id;
    var mortarDef = policy.assets.filter(function (a) { return a.type === 'mortar'; })[0];
    var so = { client: 'demo-staff-0001', post: staffPost, squad: null };
    var crew = { client: 'demo-crew-0001', post: mortarDef ? mortarDef.owner : staffPost, squad: null };
    function member(m, callsign) {
      return { afterMs: 0, by: m, op: { op: 'put', kind: 'member', id: 'mem-' + m.client,
        data: { client: m.client, post: m.post, squad: null, slot: m.post + '::0', confirmed: true, confirmedAt: 0, callsign: callsign } } };
    }
    return [
      member(so, ru ? 'Орлов' : 'Orlov'),
      member(crew, ru ? 'Сидоров' : 'Sidorov'),
      { afterMs: 3000, by: crew, op: { op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [212, -148] } } },
      { afterMs: 5000, by: crew, op: { op: 'patch', kind: 'asset', id: 'asset-mortar-1', data: { tile: [20, -98], state: 'deployed' } } },
      { afterMs: 8000, by: so, op: { op: 'put', kind: 'request', id: 'demo-req-1', data: { type: 'mortar', target: { x: 62, y: -62 },
        note: ru ? 'Гнездо у Nexus' : 'Nest near Nexus', priority: 'urgent', status: 'requested', flags: [] } } },
      { afterMs: 12000, by: crew, op: { op: 'patch', kind: 'request', id: 'demo-req-1', expectedStatus: 'requested', data: { status: 'accepted', acceptedBy: crew } } },
      { afterMs: 16000, by: so, op: { op: 'put', kind: 'request', id: 'demo-req-2', data: { type: 'position', target: { x: 30, y: -90 },
        note: ru ? 'Ближе к посадке' : 'Closer to the LZ', priority: 'normal', status: 'requested', flags: [] } } },
      { afterMs: 20000, by: crew, op: { op: 'patch', kind: 'request', id: 'demo-req-2', expectedStatus: 'requested', data: { status: 'accepted', acceptedBy: crew } } }
    ];
  }

  root.TacRoomFixture = { FixtureTransport: FixtureTransport, demoScript: demoScript };
})(typeof window !== 'undefined' ? window : globalThis);

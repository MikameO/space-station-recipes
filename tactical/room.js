// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Officers' room client: transports (the Worker over HTTP, or the fixture for
// the demo), session and storage, polling with Retry-After, pending ops with
// optimistic apply, and window.TacRoom — the hook tactical.js attaches to.
// No DOM: tactical/room-ui.js renders. Tests: scripts/test_room_client.js.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  var PREFIX = 'chemdb-tactical:';
  var CLIENT_KEY = PREFIX + 'room-client';
  var ROOM_URL = '';   // set by the owner after `wrangler deploy`; empty keeps the room hidden

  function makeStorage(ls) {
    var memory = {}, ok = false;
    try { ls.setItem(PREFIX + 'probe', '1'); ls.removeItem(PREFIX + 'probe'); ok = true; } catch (e) { ok = false; }
    return {
      ok: ok,
      read: function (k) {
        if (!ok) return memory[k] === undefined ? null : memory[k];
        try { return JSON.parse(ls.getItem(k)); } catch (e) { return null; }
      },
      write: function (k, v) {
        memory[k] = v;
        if (!ok) return;
        try { ls.setItem(k, JSON.stringify(v)); } catch (e) { /* quota: the memory copy stays */ }
      },
      remove: function (k) {
        delete memory[k];
        if (!ok) return;
        try { ls.removeItem(k); } catch (e) { /* ignore */ }
      }
    };
  }

  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function assign(a, b) { for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }

  // ── HTTP transport ─────────────────────────────────────────

  function HttpTransport(base, fetchFn) {
    this.base = String(base || '').replace(/\/$/, '');
    this.fetchFn = fetchFn || (root.fetch ? root.fetch.bind(root) : null);
  }
  HttpTransport.prototype.request = function (method, path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (opts.session) headers['X-Room-Session'] = opts.session;
    if (opts.observer) headers['X-Room-Observer'] = opts.observer;
    if (opts.keyId) headers['X-Room-Key-Id'] = opts.keyId;
    return this.fetchFn(this.base + path, { method: method, headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (res) {
        var retry = parseInt(res.headers.get('Retry-After') || '', 10);
        return res.text().then(function (text) {
          var body;
          try { body = text ? JSON.parse(text) : null; } catch (e) { body = { error: 'bad-json' }; }
          return { status: res.status, body: body, retryAfter: isFinite(retry) ? retry : null };
        });
      }, function () { return { status: 0, body: { error: 'network' }, retryAfter: null }; });
  };
  HttpTransport.prototype.create = function (body, keyId) { return this.request('POST', '/room', { body: body, keyId: keyId }); };
  HttpTransport.prototype.join = function (code, body) { return this.request('POST', '/room/' + code + '/join', { body: body }); };
  HttpTransport.prototype.poll = function (code, since, auth) { return this.request('GET', '/room/' + code + '/ops?since=' + since, auth); };
  HttpTransport.prototype.snapshot = function (code, cursor, auth) {
    return this.request('GET', '/room/' + code + '/snapshot' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), auth);
  };
  HttpTransport.prototype.send = function (code, ops, auth) { return this.request('POST', '/room/' + code + '/ops', assign({ body: { ops: ops } }, auth)); };
  HttpTransport.prototype.admin = function (code, body, auth) { return this.request('POST', '/room/' + code + '/admin', assign({ body: body }, auth)); };
  HttpTransport.prototype.exportRoom = function (code, auth) { return this.request('GET', '/room/' + code + '/export', auth); };
  HttpTransport.prototype.getPolicy = function (fork) { return this.request('GET', '/policy/' + fork); };

  // ── client ─────────────────────────────────────────────

  var cidSeq = 0;

  function RoomClient(opts) {
    this.transport = opts.transport;
    this.store = opts.storage;
    this.policy = opts.policy;
    this.fork = opts.fork;
    this.planet = opts.planet;
    this.h = opts.h || '';
    this.clock = opts.now || function () { return Date.now(); };
    this.onUpdate = opts.onUpdate || function () {};
    this.setTimer = opts.setTimeout || (root.setTimeout ? root.setTimeout.bind(root) : function () { return 0; });
    this.clearTimer = opts.clearTimeout || (root.clearTimeout ? root.clearTimeout.bind(root) : function () {});
    this.client = opts.clientId || this.store.read(CLIENT_KEY);
    if (!this.client) {
      this.client = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      this.store.write(CLIENT_KEY, this.client);
    }
    this.running = false;
    this.timer = null;
    this.reset();
  }

  RoomClient.prototype.reset = function () {
    this.code = null;
    this.session = null;
    this.observer = null;
    this.me = null;
    this.status = 'idle';     // idle | knocking | resuming | in | observer | closed | expired | gone
    this.error = null;
    this.word = null;
    this.sheet = null;
    this.observerToken = null;
    this.room = R.createState();
    this.meta = null;
    this.presence = {};
    this.offset = 0;
    this.pending = [];
    this.rejected = [];
    this.retryAfter = 10;
    this.lastOwnOpAt = 0;
    this.flushing = false;
  };

  // Per room and per client: two officers testing in one browser never share a session.
  RoomClient.prototype.key = function (code) { return PREFIX + 'room/' + (code || this.code) + ':' + this.client; };
  RoomClient.prototype.auth = function () { return this.observer ? { observer: this.observer } : { session: this.session }; };
  RoomClient.prototype.serverNow = function () { return R.serverNowEst(this.offset, this.clock()); };

  RoomClient.prototype.persist = function () {
    if (!this.code) return;
    this.store.write(this.key(), {
      code: this.code, fork: this.fork, planet: this.planet, session: this.session, observer: this.observer,
      word: this.word, sheet: this.sheet, observerToken: this.observerToken,
      seq: this.room.seq, objects: this.room.objects, pending: this.pending
    });
  };

  RoomClient.prototype.restore = function (code) {
    var saved = this.store.read(this.key(code));
    if (!saved || saved.fork !== this.fork) return false;
    this.reset();
    this.code = saved.code;
    this.session = saved.session;
    this.observer = saved.observer || null;
    this.word = saved.word || null;
    this.sheet = saved.sheet || null;
    this.observerToken = saved.observerToken || null;
    this.room = R.createState(saved.seq || 0);
    this.room.objects = saved.objects || {};
    this.pending = saved.pending || [];
    this.status = this.observer ? 'observer' : 'resuming';
    this.me = this.findMe();
    return true;
  };

  RoomClient.prototype.fail = function (r) {
    this.error = (r.body && r.body.error) || 'http-' + r.status;
    this.onUpdate(this);
    return this;
  };

  RoomClient.prototype.createRoom = function (p) {
    var self = this;
    var body = { token: p.token, planet: this.planet, h: this.h, creator: { client: this.client, post: p.post, callsign: p.callsign || '' } };
    return this.transport.create(body, p.keyId).then(function (r) {
      if (r.status !== 200) return self.fail(r);
      self.reset();
      self.code = r.body.code;
      self.session = r.body.session;
      self.sheet = r.body.sheet;
      self.observerToken = r.body.observerToken;
      self.status = 'in';
      self.persist();
      return self.poll();
    });
  };

  RoomClient.prototype.join = function (p) {
    var self = this;
    var e = R.parseEntry(p.entry);
    if (!e) { this.error = 'entry'; this.onUpdate(this); return Promise.resolve(this); }
    var body = { client: this.client, callsign: p.callsign || '' };
    if (e.postCode) body.postCode = e.postCode;
    else { body.post = p.post; body.squad = p.squad || null; }
    return this.transport.join(e.code, body).then(function (r) {
      if (r.status !== 200) return self.fail(r);
      self.reset();
      self.code = e.code;
      self.session = r.body.session;
      self.word = r.body.word || null;
      self.status = r.body.status === 'confirmed' ? 'in' : 'knocking';
      self.persist();
      return self.poll();
    });
  };

  RoomClient.prototype.observe = function (code, token) {
    this.reset();
    this.code = code;
    this.observer = token;
    this.status = 'observer';
    this.persist();
    return this.poll();
  };

  RoomClient.prototype.poll = function () {
    var self = this;
    if (!this.code) return Promise.resolve(this);
    var sent = this.clock();
    return this.transport.poll(this.code, this.room.seq, this.auth()).then(function (r) {
      var got = self.clock();
      if (r.status === 0) {
        self.error = 'network';
        self.retryAfter = Math.min(30, Math.max(2, self.retryAfter * 2));
        self.onUpdate(self);
        return self;
      }
      if (r.status === 401) { self.status = 'expired'; self.persist(); self.onUpdate(self); return self; }
      if (r.status === 404) { self.status = 'gone'; self.onUpdate(self); return self; }
      if (r.status !== 200) return self.fail(r);
      var b = r.body;
      self.error = null;
      self.offset = R.clockOffset(sent, got, b.serverNow);
      self.meta = b.meta;
      self.presence = b.presence || {};
      self.retryAfter = r.retryAfter || 10;
      if (b.knocking) {
        self.status = 'knocking';
        self.word = b.word;
      } else {
        b.ops.forEach(function (op) { if (op.seq > self.room.seq) R.applyOp(self.room, op); });
        if (self.status === 'knocking' || self.status === 'resuming') self.status = 'in';
        if (b.more) self.retryAfter = 0;
      }
      self.me = self.findMe();
      if (b.meta && b.meta.closed && self.status === 'in') self.status = 'closed';
      self.persist();
      self.onUpdate(self);
      return self;
    });
  };

  RoomClient.prototype.queue = function (op) {
    cidSeq += 1;
    op.cid = Date.now().toString(36) + '-' + cidSeq.toString(36);
    this.pending.push(op);
    this.lastOwnOpAt = this.clock();
    this.persist();
    this.onUpdate(this);
    return this.flush();
  };

  RoomClient.prototype.flush = function () {
    var self = this;
    if (this.flushing || !this.pending.length || !this.code || this.observer || this.status !== 'in') return Promise.resolve(this);
    this.flushing = true;
    var batch = this.pending.slice(0, 64);
    var cids = batch.map(function (o) { return o.cid; });
    return this.transport.send(this.code, batch, this.auth()).then(function (r) {
      self.flushing = false;
      if (r.status === 0) { self.error = 'network'; self.onUpdate(self); return self; }
      if (r.status === 401) { self.status = 'expired'; self.persist(); self.onUpdate(self); return self; }
      if (r.status !== 200) {
        var reason = (r.body && r.body.error) || 'http-' + r.status;
        batch.forEach(function (op) { self.rejected.push({ op: op, error: reason }); });
        self.pending = R.mergePending(self.pending, cids);
        self.persist();
        return self.poll();
      }
      r.body.acks.forEach(function (a) {
        if (!a.error) return;
        var op = batch.filter(function (o) { return o.cid === a.cid; })[0];
        self.rejected.push({ op: op, error: a.error, status: a.status });
      });
      self.pending = R.mergePending(self.pending, cids);
      self.persist();
      return self.poll();
    });
  };

  RoomClient.prototype.admin = function (action, payload) {
    var self = this;
    var body = assign({ action: action }, payload || {});
    return this.transport.admin(this.code, body, this.auth()).then(function (r) {
      if (r.status === 401) { self.status = 'expired'; self.onUpdate(self); return r; }
      if (r.status !== 200) { self.fail(r); return r; }
      if (action === 'rotate' && r.body.code) {
        self.store.remove(self.key());
        self.code = r.body.code;
        self.session = r.body.session;
        self.room = R.createState();
      }
      self.persist();
      return self.poll().then(function () { return r; });
    });
  };

  RoomClient.prototype.exportRoom = function () {
    return this.transport.exportRoom(this.code, this.auth());
  };

  RoomClient.prototype.leave = function () {
    this.stopLoop();
    if (this.code) this.store.remove(this.key());
    this.reset();
    this.onUpdate(this);
  };

  RoomClient.prototype.startLoop = function () {
    var self = this;
    if (this.running) return;
    this.running = true;
    function step() {
      if (!self.running) return;
      self.flush().then(function () { return self.poll(); }).then(function () {
        if (!self.running) return;
        if (self.status === 'expired' || self.status === 'gone') { self.running = false; return; }
        self.timer = self.setTimer(step, Math.max(1, self.retryAfter) * 1000);
      });
    }
    step();
  };

  RoomClient.prototype.stopLoop = function () {
    this.running = false;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
  };

  // Confirmed objects plus pending ops applied on copies: what the officer sees.
  RoomClient.prototype.merged = function () {
    var objects = {}, id;
    for (id in this.room.objects) objects[id] = this.room.objects[id];
    var s = R.createState(this.room.seq);
    s.objects = objects;
    var at = this.serverNow();
    var me = this.me ? { client: this.me.client, post: this.me.post, squad: this.me.squad || null } : { client: this.client, post: null, squad: null };
    this.pending.forEach(function (op) {
      if (objects[op.id]) objects[op.id] = copy(objects[op.id]);
      var res = R.applyOp(s, { seq: s.seq + 1, at: at, by: me, op: op.op, kind: op.kind, id: op.id, data: copy(op.data || {}), expectedStatus: op.expectedStatus });
      if (res.ok && objects[op.id]) objects[op.id].pending = true;
    });
    return s;
  };

  RoomClient.prototype.visible = function (filters) {
    var f = assign({}, filters || {});
    var kinds = f.kinds;
    delete f.kinds;
    var list = R.visibleObjects(this.merged(), this.policy, this.serverNow(), f);
    return kinds ? list.filter(function (o) { return kinds.indexOf(o.kind) >= 0; }) : list.filter(function (o) { return o.kind !== 'member'; });
  };

  RoomClient.prototype.members = function () {
    var out = [], P = this.policy, id, o;
    for (id in this.room.objects) {
      o = this.room.objects[id];
      if (o.kind === 'member' && !o.deleted) out.push(o);
    }
    var order = { staff: 0, squad: 1, service: 2, observer: 3 };
    out.sort(function (a, b) {
      return (order[R.levelOf(P, a.post)] - order[R.levelOf(P, b.post)]) ||
        String(a.squad || '').localeCompare(String(b.squad || '')) || String(a.post).localeCompare(String(b.post));
    });
    return out;
  };

  RoomClient.prototype.findMe = function () {
    var c = this.client;
    return this.members().filter(function (m) { return m.client === c; })[0] || null;
  };

  RoomClient.prototype.member = function (client) {
    return this.members().filter(function (m) { return m.client === client; })[0] || null;
  };

  RoomClient.prototype.requests = function () {
    var rank = { urgent: 0, normal: 1 };
    function closed(r) { return r.status === 'done' || r.status === 'denied' ? 1 : 0; }
    return this.visible({ kinds: ['request'] }).sort(function (a, b) {
      return closed(a) - closed(b) || (rank[a.priority] === undefined ? 1 : rank[a.priority]) - (rank[b.priority] === undefined ? 1 : rank[b.priority]) || a.at - b.at;
    });
  };

  RoomClient.prototype.calibration = function () {
    var c = this.merged().objects.calibration;
    return c && !c.deleted ? c : null;
  };

  // ── hook for tactical.js ─────────────────────────────────────

  root.TacRoom = {
    ROOM_URL: ROOM_URL,
    RoomClient: RoomClient,
    HttpTransport: HttpTransport,
    makeStorage: makeStorage,
    attach: function (hooks) { if (root.TacRoomUI) root.TacRoomUI.mount(hooks, root.TacRoom); },
    notify: function (event, payload) { if (root.TacRoomUI) root.TacRoomUI.notify(event, payload); },
    consumePick: function (tile) { return !!(root.TacRoomUI && root.TacRoomUI.consumePick(tile)); }
  };
})(typeof window !== 'undefined' ? window : globalThis);

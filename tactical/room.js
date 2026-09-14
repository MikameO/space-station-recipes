// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Officers' room client: transports (the Worker over HTTP, or the fixture for
// the demo), session and storage, polling with Retry-After, pending ops with
// optimistic apply, timers that survive a hidden window (TacRoom.timers), and
// window.TacRoom — the hook tactical.js attaches to.
// No DOM: tactical/room-ui.js renders. Tests: scripts/test_room_client*.js.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  var PREFIX = 'chemdb-tactical:';
  var CLIENT_KEY = PREFIX + 'room-client';
  // Member ids are 'mem-' + client + '-' + seq, and the Worker caps ids at 40 characters.
  var CLIENT_MAX = 24;
  var CLIENT_RE = /^[A-Za-z0-9_-]{8,24}$/;
  var ROOM_URL = '';   // set by the owner after `wrangler deploy`; empty keeps the room hidden
  var TIMEOUT_MS = 15000;
  var MAX_BACKOFF_SEC = 30;
  // Statuses in which queue() refuses at once: nothing written there would ever reach the room.
  var NO_WRITE = ['idle', 'observer', 'closed', 'expired', 'gone'];

  function warn(what, e) {
    var c = root.console || (typeof console !== 'undefined' ? console : null);
    try { if (c && c.warn) c.warn('[room] ' + what, e); } catch (x) { /* nowhere left to report */ }
  }

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
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function assign(a, b) { for (var k in b) if (has(b, k)) a[k] = b[k]; return a; }

  // ── background-safe timers ────────────────────────────────────
  // Chrome wakes chained page timers about once a minute in a window hidden for five minutes, and a
  // browser covered by a full-screen game counts as hidden; a dedicated Worker's timers keep their pace.
  // One worker, made from this script on first use, runs every timer and posts its id back; the callback
  // runs here. Without Worker, Blob or an object URL (Node tests), when one throws (a CSP refusal) or
  // when the worker reports an error, the page's own timers take over for good.
  // The worker script: plain statements joined by spaces, so no escape sequence and no // comment.
  var TIMER_WORKER = [
    'var t = {};',
    'onmessage = function (e) {',
    'var d = e.data || {}, id = d.id;',
    'if (d.op === "set") {',
    't[id] = d.every ? setInterval(function () { postMessage(id); }, d.ms)',
    ': setTimeout(function () { delete t[id]; postMessage(id); }, d.ms);',
    '} else if (d.op === "clear" && t[id] !== undefined) {',
    'clearTimeout(t[id]); clearInterval(t[id]); delete t[id];',
    '}',
    '};'
  ].join(' ');

  // host: the window (Worker, Blob, URL and the page timers, read when used). Ids are this object's own,
  // so a timer cleared while its message is on the way finds nothing to run.
  function makeTimers(host) {
    var worker = null, failed = false, seq = 0, jobs = {};

    // Only the side that holds the timer may run it: a late message from a dropped worker runs nothing twice.
    function fired(id, where) {
      if (!has(jobs, id) || jobs[id].where !== where) return;
      var job = jobs[id];
      if (!job.every) delete jobs[id];
      try { job.fn(); } catch (e) { warn('timer', e); }   // a throwing callback never stops the schedule
    }
    function onPage(id, job) {
      job.where = 'page';
      var run = function () { fired(id, 'page'); };
      job.page = job.every ? host.setInterval(run, job.ms) : host.setTimeout(run, job.ms);
    }
    // The worker broke after it was made: what it held moves to page timers.
    function fallBack() {
      var w = worker;
      worker = null;
      failed = true;
      try { if (w && typeof w.terminate === 'function') w.terminate(); } catch (e) { /* already gone */ }
      for (var id in jobs) if (has(jobs, id) && jobs[id].where === 'worker') onPage(id, jobs[id]);
    }
    function start() {
      if (worker || failed) return worker;
      try {
        var W = host.Worker, B = host.Blob, U = host.URL;
        if (typeof W !== 'function' || typeof B !== 'function' || !U || typeof U.createObjectURL !== 'function') throw new Error('no worker timers');
        // The object URL lives as long as the page: revoking it at once can cancel the worker's load.
        var w = new W(U.createObjectURL(new B([TIMER_WORKER], { type: 'text/javascript' })));
        w.onmessage = function (e) { fired(e.data, 'worker'); };
        w.onerror = function (e) { warn('timer worker', e); fallBack(); };
        worker = w;
      } catch (e) {
        failed = true;
      }
      return worker;
    }
    function add(fn, ms, every) {
      var id = ++seq, job = { fn: fn, ms: Math.max(0, +ms || 0), every: every, where: 'worker', page: null };
      jobs[id] = job;
      if (start()) {
        try { worker.postMessage({ op: 'set', id: id, ms: job.ms, every: every }); } catch (e) { warn('timer worker', e); fallBack(); }
      } else {
        onPage(id, job);
      }
      return id;
    }
    function clear(id) {
      if (id === null || id === undefined || !has(jobs, id)) return;
      var job = jobs[id];
      delete jobs[id];
      if (job.where === 'page') {
        if (job.every) host.clearInterval(job.page); else host.clearTimeout(job.page);
      } else if (worker) {
        try { worker.postMessage({ op: 'clear', id: id }); } catch (e) { /* its message finds no job */ }
      }
    }
    return {
      setTimeout: function (fn, ms) { return add(fn, ms, false); },
      clearTimeout: clear,
      setInterval: function (fn, ms) { return add(fn, ms, true); },
      clearInterval: clear,
      // 'idle' before the first timer, then 'worker' or 'page': for tests and a look from the console.
      mode: function () { return worker ? 'worker' : failed ? 'page' : 'idle'; }
    };
  }

  var timers = makeTimers(root);

  // No answer, a rate limit or a server error: the request may be retried later.
  function transient(status) { return status === 0 || status === 429 || status >= 500; }
  // The Worker's own reason when it gave one (disabled, rate), otherwise plain 'network'.
  function transientError(r) {
    var e = r.body && r.body.error;
    return r.status !== 0 && r.status !== 200 && e && e !== 'bad-json' ? e : 'network';
  }

  // ── HTTP transport ─────────────────────────────────────────

  // opts: {timeoutMs, setTimeout, clearTimeout, AbortController} — for tests.
  function HttpTransport(base, fetchFn, opts) {
    opts = opts || {};
    this.base = String(base || '').replace(/\/$/, '');
    this.fetchFn = fetchFn || (root.fetch ? root.fetch.bind(root) : null);
    this.timeoutMs = opts.timeoutMs || TIMEOUT_MS;
    // The timeout of a request sent from a hidden window must not wait for the page's next wake-up either.
    this.setTimer = opts.setTimeout || timers.setTimeout;
    this.clearTimer = opts.clearTimeout || timers.clearTimeout;
    this.Abort = opts.AbortController || root.AbortController || (typeof AbortController !== 'undefined' ? AbortController : null);
  }
  // Always resolves {status, body, retryAfter}; status 0 for no answer, a failed body read or the timeout.
  HttpTransport.prototype.request = function (method, path, opts) {
    opts = opts || {};
    var self = this;
    var headers = { 'Content-Type': 'application/json' };
    if (opts.session) headers['X-Room-Session'] = opts.session;
    if (opts.observer) headers['X-Room-Observer'] = opts.observer;
    if (opts.keyId) headers['X-Room-Key-Id'] = opts.keyId;
    var init = { method: method, headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined };
    var ctrl = null, timer = null;
    function noAnswer(error) { return { status: 0, body: { error: error }, retryAfter: null }; }
    var answer;
    try {
      if (this.Abort) { ctrl = new this.Abort(); init.signal = ctrl.signal; }
      answer = Promise.resolve(this.fetchFn(this.base + path, init)).then(function (res) {
        var retry = parseInt((res.headers && res.headers.get && res.headers.get('Retry-After')) || '', 10);
        return res.text().then(function (text) {
          var body;
          try { body = text ? JSON.parse(text) : null; } catch (e) { body = { error: 'bad-json' }; }
          return { status: res.status, body: body, retryAfter: isFinite(retry) ? retry : null };
        });
      });
    } catch (e) {
      answer = Promise.reject(e);
    }
    answer = answer.then(null, function () { return noAnswer('network'); });
    if (!this.setTimer) return answer;
    var late = new Promise(function (resolve) {
      timer = self.setTimer(function () {
        try { if (ctrl) ctrl.abort(); } catch (e) { /* already settled */ }
        resolve(noAnswer('timeout'));
      }, self.timeoutMs);
    });
    return Promise.race([answer, late]).then(function (r) {
      if (timer !== null) self.clearTimer(timer);
      return r;
    });
  };
  HttpTransport.prototype.create = function (body, keyId) { return this.request('POST', '/room', { body: body, keyId: keyId }); };
  // auth: re-entering a confirmed seat needs the seat's current session as proof.
  HttpTransport.prototype.join = function (code, body, auth) { return this.request('POST', '/room/' + code + '/join', assign({ body: body }, auth || {})); };
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
    // The loop and its back-off run on TacRoom.timers: a window behind the game keeps polling on time.
    this.setTimer = opts.setTimeout || timers.setTimeout;
    this.clearTimer = opts.clearTimeout || timers.clearTimeout;
    this.doc = opts.document !== undefined ? opts.document : root.document || null;   // for visibilitychange
    if (opts.clientId) {
      this.client = String(opts.clientId).slice(0, CLIENT_MAX);
    } else {
      this.client = this.store.read(CLIENT_KEY);
      if (typeof this.client !== 'string' || !CLIENT_RE.test(this.client)) {
        this.client = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        this.store.write(CLIENT_KEY, this.client);
      }
    }
    this.running = false;
    this.timer = null;
    this.loopId = 0;
    this.stepNow = null;      // set by startLoop: runs the waiting step at once
    this.onVisible = null;
    this.gen = 0;
    this.pollTicket = 0;
    this.polling = 0;         // polls sent and not answered yet, of any room: never reset
    this.caughtUp = 0;
    this.waiters = {};
    this.reset();
  }

  RoomClient.prototype.reset = function () {
    var waiters = this.waiters;
    this.gen += 1;            // every answer to a request sent before this belongs to another room
    this.waiters = {};
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
    this.rtt = null;
    this.pending = [];
    this.acked = [];          // [{op, seq}]: accepted by the server, not yet in this.room
    this.rejected = [];
    this.retryAfter = 10;
    this.lastOwnOpAt = 0;
    this.flushing = false;
    this.flushGen = 0;
    this.unsure = false;      // a send went unanswered: read the log before sending again
    this.unsureAt = 0;
    this.more = false;
    this.changes = 0;
    this.memo = null;
    for (var cid in waiters) if (has(waiters, cid)) waiters[cid]({ ok: false, error: 'reset' });
  };

  // Per room and per client: two officers testing in one browser never share a session.
  RoomClient.prototype.key = function (code) { return PREFIX + 'room/' + (code || this.code) + ':' + this.client; };
  RoomClient.prototype.auth = function () { return this.observer ? { observer: this.observer } : { session: this.session }; };
  RoomClient.prototype.holder = function () { return this.observer || this.session || null; };
  RoomClient.prototype.serverNow = function () { return R.serverNowEst(this.offset, this.clock()); };

  // onUpdate belongs to the panel: its exceptions never break the client's own chains.
  RoomClient.prototype.emit = function () {
    try { this.onUpdate(this); } catch (e) { warn('onUpdate', e); }
  };

  // Answers queue()'s promise for cid: now, or with `later` once the caller has polled, so whoever
  // awaits the op already sees the server's copy. Taken out of waiters at once: reset() cannot undo it.
  RoomClient.prototype.answer = function (cid, result, later) {
    var fn = this.waiters[cid];
    if (!fn) return;
    delete this.waiters[cid];
    if (later) later.push(function () { fn(result); }); else fn(result);
  };

  RoomClient.prototype.isPending = function (cid) {
    for (var i = 0; i < this.pending.length; i++) if (this.pending[i].cid === cid) return true;
    return false;
  };

  RoomClient.prototype.drop = function (ops, error, status, later) {
    if (!ops.length) return;
    this.pending = R.mergePending(this.pending, ops.map(function (o) { return o.cid; }));
    this.changes++;
    for (var i = 0; i < ops.length; i++) {
      this.answer(ops[i].cid, status === undefined ? { ok: false, error: error } : { ok: false, error: error, status: status }, later);
    }
  };

  function callAll(list) { for (var i = 0; i < list.length; i++) list[i](); }

  RoomClient.prototype.markUnsure = function () {
    this.unsure = true;
    this.unsureAt = this.pollTicket;
  };

  RoomClient.prototype.backoff = function (r) {
    var hint = r && r.retryAfter ? r.retryAfter : 0;
    this.retryAfter = Math.max(hint, Math.min(MAX_BACKOFF_SEC, Math.max(2, this.retryAfter * 2)));
  };

  // Keeps the sample with the shortest round trip: its error is at most half of it. The bound
  // relaxes by 10 ms a sample so an old best gives way, and a jump over a minute is taken at once.
  RoomClient.prototype.sampleClock = function (sent, got, serverNow) {
    if (typeof serverNow !== 'number') return;
    var rtt = Math.max(0, got - sent);
    var offset = R.clockOffset(sent, got, serverNow);
    if (this.rtt === null || rtt <= this.rtt || Math.abs(offset - this.offset) > 60000) {
      this.rtt = rtt;
      this.offset = offset;
    } else {
      this.rtt += 10;
    }
  };

  RoomClient.prototype.persist = function () {
    if (!this.code) return;
    this.store.write(this.key(), {
      code: this.code, fork: this.fork, planet: this.planet, session: this.session, observer: this.observer,
      word: this.word, sheet: this.sheet, observerToken: this.observerToken,
      seq: this.room.seq, objects: this.room.objects, pending: this.pending, acked: this.acked
    });
  };

  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  // A pending op as queue() stores it, with an id the room accepts; anything else in storage is dropped.
  function storedOp(op) {
    return isObject(op) && typeof op.cid === 'string' && typeof op.op === 'string' && typeof op.kind === 'string' && typeof op.id === 'string' &&
      !R.idError(op.kind, op.id);
  }
  // The briefing sheet as the Worker sends it, [{post, squad, code}]; other entries go, and anything but a list is no sheet.
  function storedSheet(v) {
    if (!Array.isArray(v)) return null;
    return v.filter(function (s) {
      return isObject(s) && typeof s.post === 'string' && typeof s.code === 'string' && (s.squad === null || s.squad === undefined || typeof s.squad === 'string');
    }).map(function (s) { return { post: s.post, squad: s.squad || null, code: s.code }; });
  }

  // Storage is never trusted: an older format, a hand edit or a broken write must not break every render.
  RoomClient.prototype.restore = function (code) {
    var saved = this.store.read(this.key(code));
    if (!isObject(saved) || saved.fork !== this.fork) return false;
    this.reset();
    this.code = saved.code;
    this.session = saved.session || null;
    this.observer = saved.observer || null;
    this.word = saved.word || null;
    this.sheet = storedSheet(saved.sheet);
    this.observerToken = saved.observerToken || null;
    var seq = saved.seq, objects = {}, id;
    this.room = R.createState(typeof seq === 'number' && isFinite(seq) && seq > 0 ? Math.floor(seq) : 0);
    // JSON.parse keeps a "__proto__" key as an own key: assigned here it would replace the prototype of objects.
    if (isObject(saved.objects)) {
      for (id in saved.objects) {
        if (has(saved.objects, id) && isObject(saved.objects[id]) && !R.idError(saved.objects[id].kind, id)) objects[id] = saved.objects[id];
      }
    }
    this.room.objects = objects;
    this.pending = (Array.isArray(saved.pending) ? saved.pending : []).filter(storedOp);
    this.acked = (Array.isArray(saved.acked) ? saved.acked : []).filter(function (a) {
      return isObject(a) && typeof a.seq === 'number' && isFinite(a.seq) && storedOp(a.op);
    });
    if (this.pending.length) this.markUnsure();   // they may have landed before the page closed
    this.status = this.observer ? 'observer' : this.session ? 'resuming' : 'expired';
    this.me = this.findMe();
    return true;
  };

  RoomClient.prototype.fail = function (r) {
    this.error = (r.body && r.body.error) || 'http-' + r.status;
    this.emit();
    return this;
  };

  // 401, or 404 for the room: the dead secret leaves storage, the last picture stays.
  RoomClient.prototype.end = function (status, r) {
    this.status = status;
    this.error = (r.body && r.body.error) || (status === 'gone' ? 'room' : 'session');
    this.drop(this.pending.slice(), status);
    this.session = null;
    this.observer = null;
    this.persist();
    this.emit();
    return this;
  };

  // A 404 for a room that should still be alive: the code was rotated and this client left behind.
  RoomClient.prototype.evicted = function () {
    var m = this.meta;
    return !!(this.session && m && !m.closed && m.maxAt && this.serverNow() < m.maxAt);
  };

  RoomClient.prototype.createRoom = function (p) {
    var self = this, gen = this.gen;
    var body = { token: p.token, planet: this.planet, h: this.h, creator: { client: this.client, post: p.post, callsign: p.callsign || '' } };
    return this.transport.create(body, p.keyId).then(function (r) {
      if (gen !== self.gen) return self;
      if (r.status !== 200 || !r.body) return self.fail(r);
      if (r.body.fork !== self.fork) { self.error = 'fork'; self.emit(); return self; }
      self.reset();
      self.code = r.body.code;
      self.session = r.body.session;
      self.sheet = r.body.sheet || null;
      // Create answers {code, fork, server, session, sheet, epoch}: staff mint the observer link with the observer action.
      self.observerToken = r.body.observerToken || null;
      self.status = 'in';
      self.persist();
      return self.poll();
    });
  };

  RoomClient.prototype.join = function (p) {
    var self = this, gen = this.gen;
    var e = R.parseEntry(p.entry);
    if (!e) { this.error = 'entry'; this.emit(); return Promise.resolve(this); }
    var body = { client: this.client, callsign: p.callsign || '' };
    if (e.postCode) body.postCode = e.postCode;
    else { body.post = p.post; body.squad = p.squad || null; }
    var proof = null;
    if (this.code === e.code) proof = this.session;
    else {
      var saved = this.store.read(this.key(e.code));
      if (saved && saved.fork === this.fork) proof = saved.session || null;
    }
    return this.transport.join(e.code, body, proof ? { session: proof } : {}).then(function (r) {
      if (gen !== self.gen) return self;
      if (r.status !== 200 || !r.body) return self.fail(r);   // 409 member: the seat is held and no proof matched
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
    var gen = this.gen, holder = this.holder(), room = this.room, code = this.code, since = room.seq;
    var ticket = ++this.pollTicket;
    var sent = this.clock();
    var out = true, answer;
    // Counted while out, so a wake-up never sends a second poll beside this one.
    function back() { if (out) { out = false; self.polling -= 1; } }
    this.polling += 1;
    try {
      answer = this.transport.poll(code, since, this.auth()).then(function (r) {
        back();
        // A reset, rotation, expiry or rebuild while this poll was out: its answer describes another room.
        if (gen !== self.gen || holder !== self.holder() || room !== self.room || code !== self.code) return self;
        return self.onPoll(r, sent, self.clock(), since, ticket);
      }, function (e) { back(); throw e; });
    } catch (e) {
      back();
      throw e;
    }
    return answer.then(null, function (e) { warn('poll', e); return self; });
  };

  RoomClient.prototype.onPoll = function (r, sent, got, since, ticket) {
    var self = this;
    var b = r.body;
    if (transient(r.status) || (r.status === 200 && !(b && b.meta))) {
      this.error = transientError(r);
      this.backoff(r);
      this.emit();
      return this;
    }
    if (r.status === 401) return this.end('expired', r);   // session revoked, epoch rotated, or 'rotated' code
    if (r.status === 404) return this.end(this.evicted() ? 'expired' : 'gone', r);
    if (r.status !== 200) { this.backoff(r); return this.fail(r); }
    this.error = null;
    this.sampleClock(sent, got, b.serverNow);
    this.meta = b.meta;
    this.presence = b.presence || {};   // empty while knocking
    this.retryAfter = r.retryAfter || 10;
    var rebuild = false;
    if (b.knocking) {
      this.status = 'knocking';
      this.word = b.word;
    } else {
      var ops = Array.isArray(b.ops) ? b.ops : [];
      ops.forEach(function (op) {
        if (op.seq <= self.room.seq) return;
        R.applyOp(self.room, op);
        if (op.seq > self.room.seq) self.room.seq = op.seq;   // never ask again for an op the log already gave
        // Our own op in the log: accepted, even if its ack never arrived.
        if (op.cid && op.by && op.by.client === self.client && self.isPending(op.cid)) {
          self.pending = R.mergePending(self.pending, [op.cid]);
          self.answer(op.cid, { ok: true, seq: op.seq });
        }
      });
      if (ops.length) this.changes++;
      this.acked = this.acked.filter(function (a) { return a.seq > self.room.seq; });
      this.more = !!b.more;
      if (b.more) this.retryAfter = 0;
      else {
        this.caughtUp = Math.max(this.caughtUp, ticket);
        // Fewer ops than the server's seq promised: rebuild from the start of the log.
        if (typeof b.seq === 'number' && this.room.seq < b.seq) {
          if (since > 0) rebuild = true;
          else this.room.seq = b.seq;
        }
      }
      if (this.status === 'knocking' || this.status === 'resuming') this.status = 'in';
    }
    this.me = this.findMe();
    if (b.meta.closed && this.status === 'in') {
      this.status = 'closed';
      this.drop(this.pending.slice(), 'closed');
    }
    if (rebuild) {
      this.room = R.createState();
      this.changes++;
    }
    this.persist();
    this.emit();
    return rebuild ? this.poll() : this;
  };

  // Resolves {ok:true, seq} once the room has the op, {ok:false, error, status} when it refuses it;
  // waits through network errors, 429 and 5xx. Refused at once where nothing can be written.
  RoomClient.prototype.queue = function (op) {
    var self = this;
    var refused = this.observer ? 'observer' : NO_WRITE.indexOf(this.status) >= 0 ? this.status : null;
    if (refused) return Promise.resolve({ ok: false, error: refused });
    cidSeq += 1;
    op.cid = Date.now().toString(36) + '-' + cidSeq.toString(36) + Math.random().toString(36).slice(2, 6);
    var result = new Promise(function (resolve) { self.waiters[op.cid] = resolve; });
    this.pending.push(op);
    this.changes++;
    this.lastOwnOpAt = this.clock();
    this.persist();
    this.emit();
    this.flush();
    return result;
  };

  // Several ops that belong together, queued before the flush starts: they leave in one write (up to the
  // policy's per-second cap) and radio silence refuses them together. Resolves to the per-op results, in order.
  RoomClient.prototype.queueAll = function (ops) {
    var self = this, list = Array.isArray(ops) ? ops : [];
    var refused = this.observer ? 'observer' : NO_WRITE.indexOf(this.status) >= 0 ? this.status : null;
    if (refused) return Promise.resolve(list.map(function () { return { ok: false, error: refused }; }));
    if (!list.length) return Promise.resolve([]);
    var results = list.map(function (op) {
      cidSeq += 1;
      op.cid = Date.now().toString(36) + '-' + cidSeq.toString(36) + Math.random().toString(36).slice(2, 6);
      var result = new Promise(function (resolve) { self.waiters[op.cid] = resolve; });
      self.pending.push(op);
      self.changes++;
      return result;
    });
    this.lastOwnOpAt = this.clock();
    this.persist();
    this.emit();
    this.flush();
    return Promise.all(results);
  };

  RoomClient.prototype.flush = function () {
    var self = this;
    if ((this.flushing && this.flushGen === this.gen) || !this.pending.length || !this.code || this.observer || this.status !== 'in') {
      return Promise.resolve(this);
    }
    var gen = this.gen, holder = this.holder(), code = this.code;
    this.flushing = true;
    this.flushGen = gen;
    function done() { if (self.flushGen === gen) self.flushing = false; }
    function fresh() { return gen === self.gen && holder === self.holder() && code === self.code; }
    if (this.unsure && this.caughtUp <= this.unsureAt) {
      // The last send went unanswered: read the log first, so an op that landed is not sent twice.
      return this.poll().then(function () {
        done();
        return fresh() && self.caughtUp > self.unsureAt ? self.flush() : self;
      });
    }
    this.unsure = false;
    var perSec = this.policy && this.policy.limits && this.policy.limits.opsPerSec;
    var batch = this.pending.slice(0, Math.max(1, Math.min(64, perSec || 10)));
    return this.transport.send(code, batch, this.auth()).then(function (r) {
      done();
      if (!fresh()) {
        if (self.pending.length) self.markUnsure();
        return self;
      }
      return self.onSend(r, batch);
    }).then(null, function (e) { done(); warn('flush', e); return self; });
  };

  RoomClient.prototype.onSend = function (r, batch) {
    var self = this, st = r.status, body = r.body;
    if (transient(st) || (st === 200 && !(body && Array.isArray(body.acks)))) {
      if (st !== 429) this.markUnsure();
      this.error = transientError(r);
      this.backoff(r);
      this.emit();
      return this;
    }
    if (st === 401) return this.end('expired', r);
    if (st === 404) return this.end(this.evicted() ? 'expired' : 'gone', r);
    var later = [];
    if (st !== 200) {
      // 423 (silence, locked, closed, stopped, budget) or another 4xx: the batch is refused, with the reason.
      var reason = (body && body.error) || 'http-' + st;
      var sent = batch.filter(function (op) { return self.isPending(op.cid); });
      sent.forEach(function (op) { self.rejected.push({ op: op, error: reason, status: st }); });
      this.drop(sent, reason, st, later);
      this.persist();
      this.emit();
      return this.poll().then(function () { callAll(later); return self; });
    }
    this.error = null;
    var acks = {}, progressed = false, limited = false;
    body.acks.forEach(function (a) { if (a && a.cid) acks[a.cid] = a; });
    batch.forEach(function (op) {
      var a = acks[op.cid];
      if (!a || !self.isPending(op.cid)) return;   // no ack: stays pending; already confirmed by a poll: done
      if (a.error === 'rate') { limited = true; return; }   // the per-client limit: send it again later
      progressed = true;
      self.pending = R.mergePending(self.pending, [op.cid]);
      if (a.error) {
        self.rejected.push({ op: op, error: a.error, status: a.status });
        self.answer(op.cid, a.status === undefined ? { ok: false, error: a.error } : { ok: false, error: a.error, status: a.status }, later);
      } else {
        // dup:true answers a resent cid, the author's own put that already stands, or a del of a deleted
        // object (also from a locked or frozen room): accepted all the same, with the seq the Worker kept.
        if (a.seq > self.room.seq) self.acked.push({ op: op, seq: a.seq });
        self.answer(op.cid, { ok: true, seq: a.seq }, later);
      }
    });
    this.changes++;
    this.persist();
    this.emit();
    return this.poll().then(function () {
      callAll(later);
      return progressed && !limited && self.pending.length ? self.flush() : self;
    });
  };

  RoomClient.prototype.admin = function (action, payload) {
    var self = this;
    if (!this.code) return Promise.resolve({ status: 0, body: { error: 'room' }, retryAfter: null });
    var gen = this.gen, holder = this.holder(), code = this.code;
    var body = assign({ action: action }, payload || {});
    return this.transport.admin(code, body, this.auth()).then(function (r) {
      if (gen !== self.gen || holder !== self.holder() || code !== self.code) return r;
      if (r.status === 401) { self.end('expired', r); return r; }
      if (r.status === 404 && r.body && r.body.error === 'room') { self.end(self.evicted() ? 'expired' : 'gone', r); return r; }
      if (r.status !== 200 || !r.body) { self.fail(r); return r; }
      self.error = null;
      if (action === 'observer' && r.body.observerToken) self.observerToken = r.body.observerToken;
      if (action === 'rotate' && r.body.code) {
        // New code and epoch: earlier answers describe the old room, and the observer link died with it.
        self.store.remove(self.key());
        self.gen += 1;
        self.code = r.body.code;
        self.session = r.body.session;
        // Unused post codes changed with the room code; the old sheet would hand out dead ones.
        self.sheet = Array.isArray(r.body.sheet) ? r.body.sheet : null;
        self.observerToken = null;
        self.room = R.createState();
        self.flushing = false;
        self.changes++;
        if (self.pending.length) self.markUnsure();
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
    this.emit();
  };

  RoomClient.prototype.startLoop = function () {
    var self = this;
    if (this.running) return;
    this.running = true;
    var loop = ++this.loopId;
    function live() { return self.running && loop === self.loopId; }
    function step() {
      self.timer = null;
      if (!live()) return;
      var polled = self.pollTicket;
      var work;
      try {
        work = self.flush().then(function () { return self.pollTicket > polled ? self : self.poll(); });
      } catch (e) {
        work = Promise.reject(e);
      }
      work.then(null, function (e) { warn('loop', e); }).then(function () {
        if (!live()) return;
        if (self.status === 'expired' || self.status === 'gone' || !self.code) { self.running = false; self.unwatch(); return; }
        self.timer = self.setTimer(step, Math.max(1, self.retryAfter) * 1000);
      });
    }
    // The step waiting out Retry-After runs now; not while a step is at work or any poll is out.
    this.stepNow = function () {
      if (!live() || self.timer === null || self.polling > 0) return false;
      self.clearTimer(self.timer);
      step();
      return true;
    };
    this.watch();
    step();
  };

  RoomClient.prototype.stopLoop = function () {
    this.running = false;
    this.loopId++;
    this.stepNow = null;
    this.unwatch();
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
  };

  // The officer comes back from the game: the room shows what happened meanwhile at once.
  RoomClient.prototype.watch = function () {
    var self = this, doc = this.doc;
    if (this.onVisible || !doc || typeof doc.addEventListener !== 'function') return;
    this.onVisible = function () {
      try {
        if (doc.visibilityState ? doc.visibilityState !== 'visible' : doc.hidden) return;
        if (self.running && self.stepNow) self.stepNow();
      } catch (e) { warn('visibility', e); }
    };
    doc.addEventListener('visibilitychange', this.onVisible);
  };

  RoomClient.prototype.unwatch = function () {
    var fn = this.onVisible, doc = this.doc;
    this.onVisible = null;
    try { if (fn && doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', fn); } catch (e) { /* the page is going */ }
  };

  // Confirmed objects, then acked ops the next poll has not brought yet, then pending ops, applied on
  // copies: what the officer sees. Memoized: the panel asks many times per render.
  RoomClient.prototype.merged = function () {
    var m = this.memo;
    if (m && m.room === this.room && m.seq === this.room.seq && m.changes === this.changes && m.me === this.me &&
        m.pending === this.pending && m.pendingN === this.pending.length && m.acked === this.acked && m.ackedN === this.acked.length) {
      return m.state;
    }
    var objects = {}, own = {}, id;
    for (id in this.room.objects) if (has(this.room.objects, id)) objects[id] = this.room.objects[id];
    var s = R.createState(this.room.seq);
    s.objects = objects;
    var at = this.serverNow();
    var me = this.me ? { client: this.me.client, post: this.me.post, squad: this.me.squad || null } : { client: this.client, post: null, squad: null };
    // Own keys only: an op id like `constructor` must never pick up Object.prototype's member.
    function overlay(op, seq, mark) {
      if (has(objects, op.id) && !has(own, op.id)) { objects[op.id] = copy(objects[op.id]); own[op.id] = true; }
      var res = R.applyOp(s, { seq: seq, at: at, by: me, op: op.op, kind: op.kind, id: op.id, data: copy(op.data || {}), expectedStatus: op.expectedStatus });
      if (res.ok && has(objects, op.id)) {
        own[op.id] = true;
        if (mark) objects[op.id].pending = true;
      }
    }
    var room = this.room;
    this.acked.forEach(function (a) { if (a.seq > room.seq) overlay(a.op, a.seq, false); });
    this.pending.forEach(function (op) { overlay(op, s.seq + 1, true); });
    this.memo = { room: this.room, seq: this.room.seq, changes: this.changes, me: this.me, pending: this.pending,
      pendingN: this.pending.length, acked: this.acked, ackedN: this.acked.length, state: s };
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
      if (!has(this.room.objects, id)) continue;
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
  // A throwing panel stays inside the room: Series T keeps drawing and picking.

  root.TacRoom = {
    ROOM_URL: ROOM_URL,
    RoomClient: RoomClient,
    HttpTransport: HttpTransport,
    makeStorage: makeStorage,
    timers: timers,
    makeTimers: makeTimers,
    attach: function (hooks) {
      try { if (root.TacRoomUI) root.TacRoomUI.mount(hooks, root.TacRoom); } catch (e) { warn('attach', e); }
    },
    notify: function (event, payload) {
      try { if (root.TacRoomUI) root.TacRoomUI.notify(event, payload); } catch (e) { warn('notify ' + event, e); }
    },
    consumePick: function (tile) {
      try { return !!(root.TacRoomUI && root.TacRoomUI.consumePick(tile)); } catch (e) { warn('consumePick', e); return false; }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

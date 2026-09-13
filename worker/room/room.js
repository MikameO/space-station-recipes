// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// One Room object per officers' room. Op log in the SQLite-backed KV API
// (op:<seq> + obj:<id> per accepted op), lazy idle lock and member release,
// one alarm for lifetime and export grace. Semantics: tactical/room-logic.js.
import '../../tactical/room-logic.js';
import POLICIES from './policies.js';
import { wordFor } from './words.js';
import { sha256, randomSecret, rng, safeEqual } from './crypto.js';
import { chronology } from './export.js';

const policiesOf = env => env.POLICIES || POLICIES;

const R = globalThis.TacticalRoomLogic;
const SYSTEM = { client: 'room', post: 'system', squad: null };
const WRITE_KINDS = ['marker', 'line', 'area', 'request', 'asset', 'calibration', 'member'];
const pad = n => String(n).padStart(9, '0');
const json = (status, body, headers) =>
  new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) });
const byOf = m => ({ client: m.client, post: m.post, squad: m.squad || null });

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.s = ctx.storage;
    this.loaded = false;
    this.rate = new Map();
    this.seen = new Map();
    this.memberOpAt = new Map();
    this.lastRequestOpAt = 0;
    this.stopCheckedAt = 0;
  }

  now() { return this.env.NOW ? this.env.NOW() : Date.now(); }

  async load() {
    if (this.loaded) return;
    this.meta = (await this.s.get('meta')) || null;
    this.state = R.createState();
    this.sessions = new Map();
    this.bytes = 0;
    this.lastOpAt = 0;
    if (this.meta) {
      this.policy = policiesOf(this.env)[this.meta.fork];
      for (const [, obj] of await this.s.list({ prefix: 'obj:' })) {
        this.state.objects[obj.id] = obj;
        this.bytes += JSON.stringify(obj).length;
      }
      for (const [k, v] of await this.s.list({ prefix: 'sess:' })) this.sessions.set(k.slice(5), v);
      for (const [, op] of await this.s.list({ prefix: 'op:', reverse: true, limit: 500 })) {
        if (op.seq > this.state.seq) { this.state.seq = op.seq; this.lastOpAt = op.at; }
        if (!this.memberOpAt.has(op.by.client)) this.memberOpAt.set(op.by.client, op.at);
      }
      this.lastOpAt = Math.max(this.lastOpAt || 0, this.meta.createdAt, this.meta.unlockedAt || 0);
    }
    this.loaded = true;
  }

  registry(path, body) {
    const ns = this.env.REGISTRY;
    return ns.get(ns.idFromName('main')).fetch('https://registry' + path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);
  }

  activeMembers() {
    return Object.values(this.state.objects).filter(o => o.kind === 'member' && !o.deleted);
  }
  memberOf(client) { return this.activeMembers().find(m => m.client === client) || null; }
  countObjects() { return Object.values(this.state.objects).filter(o => !o.deleted && o.kind !== 'member').length; }

  stamp(op, by) {
    return { seq: this.state.seq + 1, at: this.now(), by, op: op.op, kind: op.kind, id: op.id,
      data: op.data, expectedStatus: op.expectedStatus, cid: op.cid || '' };
  }

  // Applies and remembers ops one by one; persists them with `extra` rows in one put.
  async commit(ops, extra) {
    const entries = Object.assign({}, extra || {});
    for (const op of ops) {
      entries['op:' + pad(op.seq)] = op;
      entries['obj:' + op.id] = this.state.objects[op.id];
      this.bytes += JSON.stringify(op).length;
    }
    if (Object.keys(entries).length) await this.s.put(entries);
  }

  applyAll(ops) {
    const done = [];
    for (const op of ops) {
      const fresh = this.stamp(op, op.by);
      if (R.applyOp(this.state, fresh).ok) done.push(fresh);
    }
    return done;
  }

  async newSession(client) {
    const secret = randomSecret();
    const record = { hash: await sha256(secret), epoch: this.meta.epoch };
    this.sessions.set(client, record);
    return { token: client + '.' + this.meta.epoch + '.' + secret, row: { ['sess:' + client]: record } };
  }

  async authenticate(header) {
    const parts = String(header || '').split('.');
    if (parts.length !== 3) return null;
    const [client, epoch, secret] = parts;
    const rec = this.sessions.get(client);
    if (!rec || rec.epoch !== this.meta.epoch || Number(epoch) !== this.meta.epoch) return null;
    if (!safeEqual(await sha256(secret), rec.hash)) return null;
    return this.memberOf(client);
  }

  publicMeta() {
    const m = this.meta;
    const d = R.roomDeadlines(this.policy, m.createdAt, m.extended);
    return { fork: m.fork, server: m.server, planet: m.planet, h: m.h, createdAt: m.createdAt, epoch: m.epoch,
      locked: m.locked, closed: m.closed, frozen: m.frozen, extended: m.extended, maxAt: d.maxAt, warnAt: d.warnAt,
      lastOpAt: this.lastOpAt };
  }

  presence(now) {
    const out = {};
    for (const m of this.activeMembers()) out[m.client] = this.seen.has(m.client) ? now - this.seen.get(m.client) : null;
    return out;
  }

  async schedule() {
    const m = this.meta;
    const grace = this.policy.ttl.exportGraceSec * 1000;
    const maxAt = R.roomDeadlines(this.policy, m.createdAt, m.extended).maxAt;
    let at = maxAt;
    if (m.closed) at = m.closedAt + grace;
    else if (m.locked) at = Math.min(maxAt, m.lockedAt + grace);
    await this.s.setAlarm(at);
  }

  async checkStop(now) {
    this.stopCheckedAt = now;
    const r = await (await this.registry('/stopped?keyId=' + encodeURIComponent(this.meta.keyId))).json();
    if (r.stopped && !(this.meta.frozen && this.meta.frozen.reason === 'stopped')) {
      this.meta.frozen = { at: now, reason: 'stopped' };
      await this.s.put('meta', this.meta);
    }
  }

  async lifecycle(now) {
    const m = this.meta;
    if (m.closed) return;
    if (!m.locked && R.idleLocked(this.policy, this.lastOpAt, now)) {
      m.locked = true;
      m.lockedAt = now;
      await this.s.put('meta', m);
      await this.schedule();
      return;
    }
    if (m.locked) return;
    const stale = this.activeMembers().filter(o => o.confirmed &&
      R.memberStale(this.policy, Math.max(this.memberOpAt.get(o.client) || 0, o.presentAt || 0, o.confirmedAt || 0, o.at), now));
    if (!stale.length) return;
    const ops = this.applyAll(stale.map(o => ({ op: 'del', kind: 'member', id: o.id, by: SYSTEM, cid: 'auto' })));
    for (const o of stale) this.sessions.delete(o.client);
    await this.commit(ops);
    await this.s.delete(stale.map(o => 'sess:' + o.client));
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);
    const path = url.pathname;
    const now = this.now();
    if (path === '/init') return this.init(await request.json(), now);
    if (!this.meta) return json(404, { error: 'room' });
    if (url.searchParams.get('code') !== this.meta.code) return json(401, { error: 'code' });
    await this.lifecycle(now);
    if (path === '/join') return this.join(await request.json(), now);

    const observer = request.headers.get('X-Room-Observer');
    let actor = null;
    let isObserver = false;
    if (observer) {
      isObserver = safeEqual(await sha256(observer), this.meta.observerHash);
      if (!isObserver) return json(401, { error: 'observer' });
    } else {
      actor = await this.authenticate(request.headers.get('X-Room-Session'));
      if (!actor) return json(401, { error: 'session' });
    }
    if (now - this.stopCheckedAt > 60000 && !this.meta.closed) await this.checkStop(now);

    if (path === '/ops' && request.method === 'GET') return this.poll(actor, url, now);
    if (path === '/snapshot') return this.snapshot(actor, url, now);
    if (path === '/export') return (isObserver || actor.confirmed) ? this.exportRoom() : json(403, { error: 'unconfirmed' });
    if (isObserver) return json(403, { error: 'observer' });
    if (path === '/ops' && request.method === 'POST') return this.write(actor, await request.json(), now);
    if (path === '/admin') return this.admin(actor, await request.json(), now);
    return json(404, { error: 'path' });
  }

  async init(b, now) {
    if (this.meta) return json(409, { error: 'exists' });
    const policy = policiesOf(this.env)[b.fork];
    if (!policy) return json(400, { error: 'fork' });
    this.policy = policy;
    const codes = {};
    const sheet = [];
    for (const p of policy.posts) {
      if (p.level === 'observer') continue;
      const squads = p.perSquad ? Object.keys(policy.squads) : [null];
      for (const sq of squads) {
        for (let i = 0; i < p.max; i++) {
          let c;
          do c = R.randomCode(4, rng); while (codes[c]);
          codes[c] = { slot: p.id + ':' + (sq || '') + ':' + i, post: p.id, squad: sq, usedAt: null, client: null };
          sheet.push({ post: p.id, squad: sq, code: c });
        }
      }
    }
    const observerToken = randomSecret();
    this.meta = { name: b.name, code: b.code, fork: b.fork, server: b.server, keyId: b.keyId, planet: b.planet, h: b.h,
      createdAt: now, extended: false, locked: false, lockedAt: null, unlockedAt: null, closed: false, closedAt: null,
      frozen: null, epoch: 1, codes, observerHash: await sha256(observerToken) };
    this.lastOpAt = now;
    const c = b.creator;
    const data = { client: c.client, post: c.post, squad: null, slot: c.post + '::creator',
      callsign: R.cleanText(c.callsign, policy.limits.callsign), confirmed: true, confirmedBy: 'creator', confirmedAt: now };
    // Assets exist from the start (state unknown), so crews can claim and owners patch them.
    const seed = [{ op: 'put', kind: 'member', id: 'mem-' + c.client + '-1', data, by: byOf(c) }];
    for (const def of policy.assets) {
      for (let n = 1; n <= (def.count || 1); n++) {
        seed.push({ op: 'put', kind: 'asset', id: 'asset-' + def.type + '-' + n, by: SYSTEM,
          data: { type: def.type, n, owner: { post: def.owner }, state: null, notes: '', claimedBy: null } });
      }
    }
    const ops = this.applyAll(seed);
    const session = await this.newSession(c.client);
    await this.commit(ops, Object.assign({ meta: this.meta }, session.row));
    await this.schedule();
    this.stopCheckedAt = now;
    return json(200, { session: session.token, sheet, observerToken, epoch: 1 });
  }

  async join(b, now) {
    const m = this.meta;
    if (m.closed) return json(423, { error: 'closed' });
    if (m.locked) return json(423, { error: 'locked' });
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(String(b.client || ''))) return json(400, { error: 'client' });
    let post, squad, slot;
    const existing = this.memberOf(b.client);
    if (b.postCode) {
      const c = m.codes[String(b.postCode).toUpperCase()];
      if (!c) return json(404, { error: 'postCode' });
      if (c.client && c.client !== b.client) return json(409, { error: 'used' });
      c.usedAt = c.usedAt || now;
      c.client = b.client;
      post = c.post; squad = c.squad; slot = c.slot;
    } else {
      const def = R.postDef(this.policy, b.post);
      if (!def || def.level === 'observer') return json(400, { error: 'post' });
      squad = def.perSquad ? b.squad : null;
      if (def.perSquad && !this.policy.squads[squad]) return json(400, { error: 'squad' });
      post = def.id;
      const taken = this.activeMembers().filter(x => x.post === post && (x.squad || null) === squad && x.client !== b.client).length;
      if (taken >= def.max) return json(409, { error: 'full' });
      slot = post + ':' + (squad || '') + ':word';
    }
    // The same browser re-entering its own slot keeps its confirmation: only the session changes.
    if (existing && existing.confirmed && existing.slot === slot) {
      const session = await this.newSession(b.client);
      await this.s.put(Object.assign({ meta: m }, session.row));
      return json(200, { session: session.token, status: 'confirmed', post, squad, epoch: m.epoch });
    }
    const word = wordFor(m.fork, rng);
    const ops = [];
    if (existing) ops.push({ op: 'del', kind: 'member', id: existing.id, by: SYSTEM, cid: 'rejoin' });
    ops.push({ op: 'put', kind: 'member', id: 'mem-' + b.client + '-' + (this.state.seq + 1), by: { client: b.client, post, squad },
      data: { client: b.client, post, squad, slot, callsign: R.cleanText(b.callsign, this.policy.limits.callsign),
        confirmed: false, word, knockAt: now } });
    const done = this.applyAll(ops);
    const session = await this.newSession(b.client);
    await this.commit(done, Object.assign({ meta: m }, session.row));
    this.lastOpAt = now;
    return json(200, { session: session.token, status: 'knocking', word, post, squad, epoch: m.epoch });
  }

  async poll(actor, url, now) {
    const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
    const headers = { 'Retry-After': String(R.retryAfter(this.lastRequestOpAt, now)) };
    if (actor) this.seen.set(actor.client, now);
    const base = { serverNow: now, seq: this.state.seq, meta: this.publicMeta(), presence: this.presence(now) };
    if (actor && !actor.confirmed) return json(200, Object.assign(base, { knocking: true, word: actor.word, ops: [] }), headers);
    const ops = [];
    for (const [, op] of await this.s.list({ prefix: 'op:', startAfter: 'op:' + pad(since), limit: 500 })) ops.push(op);
    return json(200, Object.assign(base, { ops, more: ops.length === 500 }), headers);
  }

  async snapshot(actor, url, now) {
    if (actor && !actor.confirmed) return json(403, { error: 'unconfirmed' });
    const cursor = url.searchParams.get('cursor') || '';
    const ids = Object.keys(this.state.objects).filter(id => !this.state.objects[id].deleted && id > cursor).sort();
    const page = ids.slice(0, 200).map(id => this.state.objects[id]);
    return json(200, { serverNow: now, seq: this.state.seq, objects: page, cursor: ids.length > 200 ? ids[199] : null, meta: this.publicMeta() });
  }

  allow(client, now) {
    const L = this.policy.limits;
    let r = this.rate.get(client);
    if (!r) { r = { sec: now, secN: 0, min: now, minN: 0 }; this.rate.set(client, r); }
    if (now - r.sec >= 1000) { r.sec = now; r.secN = 0; }
    if (now - r.min >= 60000) { r.min = now; r.minN = 0; }
    if (r.secN >= L.opsPerSec || r.minN >= L.opsPerMin) return false;
    r.secN++; r.minN++;
    return true;
  }

  sanitize(raw, actor, now) {
    const L = this.policy.limits;
    const src = raw.data && typeof raw.data === 'object' ? raw.data : {};
    const data = {};
    for (const k of Object.keys(src)) {
      if (['id', 'kind', 'seq', 'at', 'by', 'deleted'].includes(k)) continue;
      data[k] = src[k];
    }
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
  }

  async write(actor, body, now) {
    const m = this.meta;
    if (!actor.confirmed) return json(403, { error: 'unconfirmed' });
    if (m.closed) return json(423, { error: 'closed' });
    if (m.locked) return json(423, { error: 'locked' });
    if (m.frozen) return json(423, { error: m.frozen.reason });
    const list = body && Array.isArray(body.ops) ? body.ops.slice(0, 64) : [];
    const acks = [];
    const accepted = [];
    let extra = null;
    for (const raw of list) {
      const cid = raw && typeof raw.cid === 'string' ? raw.cid.slice(0, 40) : '';
      if (!raw || typeof raw !== 'object' || !WRITE_KINDS.includes(raw.kind) || !['put', 'patch', 'del'].includes(raw.op) ||
          typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(raw.id)) { acks.push({ cid, error: 'shape' }); continue; }
      if (JSON.stringify(raw).length > this.policy.limits.message) { acks.push({ cid, error: 'size' }); continue; }
      if (!this.allow(actor.client, now)) { acks.push({ cid, error: 'rate' }); continue; }
      if (this.bytes > this.policy.limits.bytes) {
        m.frozen = { at: now, reason: 'budget' };
        extra = { meta: m };
        acks.push({ cid, error: 'budget' });
        break;
      }
      const existing = this.state.objects[raw.id];
      if (existing && existing.kind !== raw.kind) { acks.push({ cid, error: 'kind' }); continue; }
      const data = this.sanitize(raw, actor, now);
      if (raw.kind === 'member') {
        const self = existing && !existing.deleted && existing.client === actor.client;
        if (raw.op !== 'patch' || !self || Object.keys(data).join() !== 'presentAt') { acks.push({ cid, error: 'right' }); continue; }
        data.presentAt = now;
      } else {
        if (raw.op === 'put') {
          const bad = R.validateData(this.policy, raw.kind, data);
          if (bad) { acks.push({ cid, error: bad }); continue; }
          if (this.countObjects() >= this.policy.limits.objects) { acks.push({ cid, error: 'objects' }); continue; }
        }
        const check = R.canWrite(this.policy, actor, { op: raw.op, kind: raw.kind, id: raw.id, data, expectedStatus: raw.expectedStatus },
          existing, { claimed: R.claimants(this.state.objects, existing) });
        if (!check.ok) { acks.push({ cid, error: check.reason }); continue; }
      }
      const op = this.stamp({ op: raw.op, kind: raw.kind, id: raw.id, data, expectedStatus: raw.expectedStatus, cid }, byOf(actor));
      const res = R.applyOp(this.state, op);
      if (!res.ok) { acks.push({ cid, error: res.reason, status: existing ? existing.status : undefined }); continue; }
      accepted.push(op);
      acks.push({ cid, seq: op.seq });
      this.memberOpAt.set(actor.client, now);
      if (op.kind === 'request') this.lastRequestOpAt = now;
    }
    if (accepted.length || extra) await this.commit(accepted, extra);
    if (accepted.length) this.lastOpAt = now;
    return json(200, { acks, serverNow: now, seq: this.state.seq });
  }

  async admin(actor, b, now) {
    const m = this.meta;
    const P = this.policy;
    if (!actor.confirmed) return json(403, { error: 'unconfirmed' });
    const staff = R.isStaff(P, actor);
    const target = b && b.client ? this.memberOf(b.client) : null;
    const ops = [];
    let metaChanged = false;
    const reply = { ok: true };
    const sessionsToDrop = [];

    switch (b && b.action) {
      case 'confirm': {
        if (!R.hasRight(P, actor, 'confirmJoin')) return json(403, { error: 'right' });
        if (!target || target.confirmed) return json(404, { error: 'member' });
        if (now - target.knockAt > P.ttl.wordSec * 1000) return json(409, { error: 'expired' });
        const knocking = this.activeMembers().filter(x => !x.confirmed).length;
        if (knocking >= 2 && b.word !== target.word) return json(409, { error: 'word' });
        ops.push({ op: 'patch', kind: 'member', id: target.id, by: byOf(actor),
          data: { confirmed: true, confirmedBy: actor.post, confirmedAt: now, word: null } });
        break;
      }
      case 'release': {
        if (!target) return json(404, { error: 'member' });
        ops.push({ op: 'del', kind: 'member', id: target.id, by: byOf(actor) });
        sessionsToDrop.push(target.client);
        break;
      }
      case 'reissue': {
        if (!target) return json(404, { error: 'member' });
        const sameSquad = target.squad && actor.squad === target.squad;
        if (!staff && !sameSquad) return json(403, { error: 'right' });
        for (const k of Object.keys(m.codes)) if (m.codes[k].slot === target.slot) delete m.codes[k];
        let c;
        do c = R.randomCode(4, rng); while (m.codes[c]);
        m.codes[c] = { slot: target.slot, post: target.post, squad: target.squad || null, usedAt: null, client: null };
        metaChanged = true;
        ops.push({ op: 'del', kind: 'member', id: target.id, by: byOf(actor) });
        sessionsToDrop.push(target.client);
        reply.postCode = c;
        break;
      }
      case 'purge': {
        if (!staff) return json(403, { error: 'right' });
        for (const o of Object.values(this.state.objects)) {
          if (!o.deleted && o.kind !== 'member' && o.by && o.by.client === b.client) ops.push({ op: 'del', kind: o.kind, id: o.id, by: byOf(actor) });
        }
        break;
      }
      case 'label': {
        if (!R.hasRight(P, actor, 'assignLabel')) return json(403, { error: 'right' });
        if (!target || !target.confirmed) return json(404, { error: 'member' });
        if (!P.functions.some(f => f.id === b.fn)) return json(400, { error: 'fn' });
        const list = (target.functions || []).slice();
        const i = list.indexOf(b.fn);
        if (i >= 0) list.splice(i, 1); else list.push(b.fn);
        ops.push({ op: 'patch', kind: 'member', id: target.id, by: byOf(actor), data: { functions: list } });
        break;
      }
      case 'unlock':
        if (!staff) return json(403, { error: 'right' });
        if (!m.locked || m.closed) return json(409, { error: 'state' });
        m.locked = false; m.lockedAt = null; m.unlockedAt = now; this.lastOpAt = now; metaChanged = true;
        break;
      case 'extend':
        if (!R.hasRight(P, actor, 'extend')) return json(403, { error: 'right' });
        if (m.extended) return json(409, { error: 'extended' });
        m.extended = true; metaChanged = true;
        break;
      case 'silence':
        if (!R.hasRight(P, actor, 'radioSilence')) return json(403, { error: 'right' });
        m.frozen = b.on ? { at: now, reason: 'silence', by: actor.post } : null; metaChanged = true;
        break;
      case 'close':
        if (!staff) return json(403, { error: 'right' });
        m.closed = true; m.closedAt = now; metaChanged = true;
        break;
      case 'observer': {
        if (!staff) return json(403, { error: 'right' });
        const token = randomSecret();
        m.observerHash = await sha256(token); metaChanged = true;
        reply.observerToken = token;
        break;
      }
      case 'rotate': {
        if (!staff) return json(403, { error: 'right' });
        let code = null;
        for (let i = 0; i < 5 && !code; i++) {
          const candidate = R.randomCode(6, rng);
          const r = await (await this.registry('/rotate', { old: m.code, code: candidate, name: m.name })).json();
          if (r.ok) code = candidate;
        }
        if (!code) return json(503, { error: 'collision' });
        m.code = code; m.epoch += 1; metaChanged = true;
        for (const x of this.activeMembers()) {
          if (x.client === actor.client) continue;
          ops.push({ op: 'del', kind: 'member', id: x.id, by: byOf(actor) });
          sessionsToDrop.push(x.client);
        }
        reply.code = code;
        break;
      }
      default:
        return json(400, { error: 'action' });
    }

    const done = this.applyAll(ops);
    const extra = metaChanged ? { meta: m } : {};
    if (b.action === 'rotate') {
      this.sessions = new Map();
      const session = await this.newSession(actor.client);
      Object.assign(extra, session.row);
      reply.session = session.token;
      sessionsToDrop.push(...[...(await this.s.list({ prefix: 'sess:' })).keys()].map(k => k.slice(5)).filter(c => c !== actor.client));
    }
    for (const c of sessionsToDrop) this.sessions.delete(c);
    await this.commit(done, extra);
    if (sessionsToDrop.length) await this.s.delete([...new Set(sessionsToDrop)].map(c => 'sess:' + c));
    if (done.length) this.lastOpAt = now;
    if (metaChanged) await this.schedule();
    return json(200, Object.assign(reply, { seq: this.state.seq, serverNow: now }));
  }

  async exportRoom() {
    const ops = [];
    for (const [, op] of await this.s.list({ prefix: 'op:' })) {
      const copy = structuredClone(op);
      if (copy.kind === 'member' && copy.data) delete copy.data.word;
      ops.push(copy);
    }
    const members = this.activeMembers().map(x => { const c = structuredClone(x); delete c.word; return c; });
    const objects = Object.values(this.state.objects).filter(o => !o.deleted && o.kind !== 'member');
    const cal = this.state.objects.calibration;
    const offset = cal && !cal.deleted ? cal.offset : null;
    const m = this.meta;
    return json(200, {
      meta: { code: m.code, fork: m.fork, server: m.server, planet: m.planet, createdAt: m.createdAt, closedAt: m.closedAt, extended: m.extended, frozen: m.frozen },
      members, objects, ops, text: chronology(ops, this.policy, offset)
    });
  }

  async alarm() {
    await this.load();
    if (!this.meta) return;
    const now = this.now();
    const m = this.meta;
    const grace = this.policy.ttl.exportGraceSec * 1000;
    const maxAt = R.roomDeadlines(this.policy, m.createdAt, m.extended).maxAt;
    if ((m.closed && now >= m.closedAt + grace) || (!m.closed && m.locked && now >= m.lockedAt + grace)) {
      await this.registry('/release', { name: m.name, code: m.code });
      await this.s.deleteAlarm();
      await this.s.deleteAll();
      this.meta = null;
      this.loaded = false;
      return;
    }
    if (!m.closed && now >= maxAt) {
      m.closed = true;
      m.closedAt = now;
      await this.s.put('meta', m);
    }
    await this.checkStop(now);
    await this.schedule();
  }
}

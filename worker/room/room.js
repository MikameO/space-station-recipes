// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// One Room object per officers' room. Op log in the SQLite-backed KV API
// (op:<seq> + obj:<id> per accepted op), lazy idle lock and member release,
// one alarm for the idle lock, lifetime and export grace. Semantics: tactical/room-logic.js.
import '../../tactical/room-logic.js';
import POLICIES from './policies.js';
import { wordFor } from './words.js';
import { sha256, randomSecret, rng, safeEqual, own } from './crypto.js';
import { chronology, CHRONOLOGY_HEADER } from './export.js';

const policyOf = (env, fork) => own(env.POLICIES || POLICIES, fork);

const R = globalThis.TacticalRoomLogic;
const SYSTEM = { client: 'room', post: 'system', squad: null };
const WRITE_KINDS = ['marker', 'line', 'area', 'request', 'asset', 'calibration', 'member'];
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const CLIENT_RE = /^[A-Za-z0-9_-]{8,40}$/;
const CID_MEMORY = 500;          // resent ops answered from memory: the acks of the last 500 ops
const KNOCKS_MAX = 4;            // fresh knocks per room
const PAGE_BYTES = 256 * 1024;   // one ops?since page, besides the 500-op cap
const ROWS_PER_CALL = 128;       // storage put/delete key limit
const pad = n => String(n).padStart(9, '0');
const json = (status, body, headers) =>
  new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) });
const byOf = m => ({ client: m.client, post: m.post, squad: m.squad || null });
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const bytes = s => new TextEncoder().encode(s).length;

async function readJson(request) {
  try {
    const b = await request.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
  } catch {
    return null;
  }
}

// Knock words are for the members who confirm; the observer never sees them.
function opForObserver(op) {
  if (op.kind !== 'member' || !op.data || op.data.word === undefined) return op;
  const c = structuredClone(op);
  delete c.data.word;
  return c;
}
function objectForObserver(o) {
  if (o.kind !== 'member' || o.word === undefined) return o;
  const c = structuredClone(o);
  delete c.word;
  return c;
}

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.s = ctx.storage;
    this.loaded = false;
    this.rate = new Map();
    this.seen = new Map();
    this.memberOpAt = new Map();
    this.cids = new Map();
    this.lastRequestOpAt = 0;
    this.stopCheckedAt = 0;
  }

  now() { return this.env.NOW ? this.env.NOW() : Date.now(); }

  async load() {
    if (this.loaded) return;
    this.meta = (await this.s.get('meta')) || null;
    this.state = R.createState();
    this.sessions = new Map();
    this.cids = new Map();
    this.bytes = 0;
    this.lastOpAt = 0;
    this.lastRequestOpAt = 0;
    if (this.meta) {
      this.policy = policyOf(this.env, this.meta.fork);
      for (const [, obj] of await this.s.list({ prefix: 'obj:' })) {
        this.state.objects[obj.id] = obj;
        this.bytes += JSON.stringify(obj).length;
      }
      for (const [k, v] of await this.s.list({ prefix: 'sess:' })) this.sessions.set(k.slice(5), v);
      const recent = [...(await this.s.list({ prefix: 'op:', reverse: true, limit: CID_MEMORY })).values()];
      for (const op of recent) {
        if (op.seq > this.state.seq) { this.state.seq = op.seq; this.lastOpAt = op.at; }
        if (!this.memberOpAt.has(op.by.client)) this.memberOpAt.set(op.by.client, op.at);
        if (op.kind === 'request' && op.at > this.lastRequestOpAt) this.lastRequestOpAt = op.at;
      }
      for (const op of recent.reverse()) this.remember(op.by.client, op.cid, op.seq);
      this.lastOpAt = Math.max(this.lastOpAt || 0, this.meta.createdAt, this.meta.unlockedAt || 0);
    }
    this.loaded = true;
  }

  // Ack of an accepted op, kept per client and cid so a resend is answered without a second row.
  remember(client, cid, seq) {
    const ack = { cid: cid || '', seq, dup: true };
    if (!cid || client === SYSTEM.client) return ack;
    const key = client + '|' + cid;
    this.cids.delete(key);
    this.cids.set(key, seq);
    while (this.cids.size > CID_MEMORY) this.cids.delete(this.cids.keys().next().value);
    return ack;
  }
  acked(client, cid) {
    if (!cid) return null;
    const seq = this.cids.get(client + '|' + cid);
    return seq === undefined ? null : { cid, seq, dup: true };
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
  // A confirmed member, or a knock still within its word time.
  fresh(o, now) { return o.confirmed || now - (o.knockAt || o.at) < this.policy.ttl.wordSec * 1000; }
  confirmers() { return this.activeMembers().filter(x => x.confirmed && R.hasRight(this.policy, x, 'confirmJoin')); }

  slots() {
    const P = this.policy, out = [];
    for (const p of P.posts) {
      if (p.level === 'observer') continue;
      for (const squad of p.perSquad ? Object.keys(P.squads) : [null]) {
        for (let i = 0; i < p.max; i++) out.push({ slot: p.id + ':' + (squad || '') + ':' + i, post: p.id, squad });
      }
    }
    return out;
  }
  newCode(codes, avoid) {
    let c;
    do c = R.randomCode(4, rng); while (has(codes, c) || (avoid && avoid.has(c)));
    return c;
  }
  sheet() {
    const bySlot = new Map(Object.entries(this.meta.codes).map(([code, c]) => [c.slot, code]));
    return this.slots().filter(s => bySlot.has(s.slot)).map(s => ({ post: s.post, squad: s.squad, code: bySlot.get(s.slot) }));
  }

  stamp(op, by) {
    return { seq: this.state.seq + 1, at: this.now(), by, op: op.op, kind: op.kind, id: op.id,
      data: op.data, expectedStatus: op.expectedStatus, cid: op.cid || '' };
  }

  async putRows(entries) {
    const keys = Object.keys(entries);
    for (let i = 0; i < keys.length; i += ROWS_PER_CALL) {
      const chunk = {};
      for (const k of keys.slice(i, i + ROWS_PER_CALL)) chunk[k] = entries[k];
      await this.s.put(chunk);
    }
  }
  async deleteRows(keys) {
    for (let i = 0; i < keys.length; i += ROWS_PER_CALL) await this.s.delete(keys.slice(i, i + ROWS_PER_CALL));
  }

  // Applies and remembers ops one by one; persists them with `extra` rows.
  async commit(ops, extra) {
    const entries = Object.assign({}, extra || {});
    for (const op of ops) {
      entries['op:' + pad(op.seq)] = op;
      entries['obj:' + op.id] = this.state.objects[op.id];
      this.bytes += JSON.stringify(op).length;
    }
    if (Object.keys(entries).length) await this.putRows(entries);
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

  // A knocking member learns nothing about the room's activity.
  publicMeta(full) {
    const m = this.meta;
    const d = R.roomDeadlines(this.policy, m.createdAt, m.extended);
    const out = { fork: m.fork, server: m.server, planet: m.planet, h: m.h, createdAt: m.createdAt, epoch: m.epoch,
      locked: m.locked, closed: m.closed, frozen: m.frozen, extended: m.extended, maxAt: d.maxAt, warnAt: d.warnAt };
    if (full) out.lastOpAt = this.lastOpAt;
    return out;
  }

  presence(now) {
    const out = {};
    for (const m of this.activeMembers()) out[m.client] = this.seen.has(m.client) ? now - this.seen.get(m.client) : null;
    return out;
  }

  // One alarm at a time: the idle lock while the room is open, then export grace, capped by the lifetime.
  async schedule() {
    const m = this.meta, P = this.policy;
    const grace = P.ttl.exportGraceSec * 1000;
    const maxAt = R.roomDeadlines(P, m.createdAt, m.extended).maxAt;
    let at;
    if (m.closed) at = m.closedAt + grace;
    else if (m.locked) at = Math.min(maxAt, m.lockedAt + grace);
    else at = Math.min(maxAt, this.lastOpAt + P.ttl.roomIdleLockSec * 1000);
    await this.s.setAlarm(Math.max(at, this.now() + 1000));
  }

  // Locked and closed rooms leave the ceilings; «Продолжить раунд» puts the room back.
  async setActive(on) {
    const m = this.meta, P = this.policy;
    const horizon = (P.ttl.roomMaxSec + P.ttl.roomExtendSec + P.ttl.exportGraceSec) * 1000;
    try {
      await this.registry(on ? '/activate' : '/deactivate', { name: m.name, keyId: m.keyId, createdAt: m.createdAt, until: m.createdAt + horizon });
    } catch {
      // the reservation horizon clears a missed update
    }
  }

  async lock(now) {
    this.meta.locked = true;
    this.meta.lockedAt = now;
    await this.s.put('meta', this.meta);
    await this.schedule();
    await this.setActive(false);
  }

  async checkStop(now) {
    this.stopCheckedAt = now;
    const m = this.meta;
    const r = await (await this.registry('/stopped?keyId=' + encodeURIComponent(m.keyId))).json();
    const reason = m.frozen ? m.frozen.reason : null;
    if (r.stopped && reason !== 'stopped' && reason !== 'budget') m.frozen = { at: now, reason: 'stopped' };
    else if (!r.stopped && reason === 'stopped') m.frozen = null;
    else return;
    await this.s.put('meta', m);
  }

  async lifecycle(now) {
    const m = this.meta, P = this.policy;
    if (m.closed) return;
    if (!m.locked && R.idleLocked(P, this.lastOpAt, now)) await this.lock(now);
    const members = this.activeMembers();
    // Knocks past their word time go even from a locked room; confirmed members idle out of an open room only.
    const gone = members.filter(o => !o.confirmed && !this.fresh(o, now));
    if (!m.locked) {
      // Nobody goes stale before the room opened or was continued, whatever their last op.
      const base = Math.max(m.createdAt, m.unlockedAt || 0);
      const activeAt = o => Math.max(base, this.memberOpAt.get(o.client) || 0, o.presentAt || 0, o.confirmedAt || 0, o.at);
      const stale = members.filter(o => o.confirmed && R.memberStale(P, activeAt(o), now));
      const confirmers = this.confirmers();
      if (confirmers.length && confirmers.every(o => stale.includes(o))) {
        const keep = confirmers.reduce((a, b) => (activeAt(b) > activeAt(a) ? b : a));
        stale.splice(stale.indexOf(keep), 1);
      }
      gone.push(...stale);
    }
    if (!gone.length) return;
    const ops = this.applyAll(gone.map(o => ({ op: 'del', kind: 'member', id: o.id, by: SYSTEM, cid: 'auto' })));
    for (const o of gone) this.sessions.delete(o.client);
    await this.commit(ops);
    await this.deleteRows(gone.map(o => 'sess:' + o.client));
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);
    const path = url.pathname;
    const now = this.now();
    if (path === '/init') {
      const b = await readJson(request);
      return b ? this.init(b, now) : json(400, { error: 'json' });
    }
    if (!this.meta) return json(404, { error: 'room' });
    const code = url.searchParams.get('code');
    if (code !== this.meta.code) return json(401, { error: (this.meta.codeHistory || []).includes(code) ? 'rotated' : 'code' });
    await this.lifecycle(now);
    if (path === '/join') {
      const b = await readJson(request);
      return b ? this.join(request, b, now) : json(400, { error: 'json' });
    }

    const observer = request.headers.get('X-Room-Observer');
    let actor = null;
    let isObserver = false;
    if (observer) {
      isObserver = !!this.meta.observerHash && safeEqual(await sha256(observer), this.meta.observerHash);
      if (!isObserver) return json(401, { error: 'observer' });
    } else {
      actor = await this.authenticate(request.headers.get('X-Room-Session'));
      if (!actor) return json(401, { error: 'session' });
    }
    if (now - this.stopCheckedAt > 60000 && !this.meta.closed) await this.checkStop(now);

    if (path === '/ops' && request.method === 'GET') return this.poll(actor, url, now);
    if (path === '/snapshot') return this.snapshot(actor, url, now);
    if (path === '/export') {
      if (isObserver) return this.exportRoom();
      if (!actor.confirmed) return json(403, { error: 'unconfirmed' });
      return R.isStaff(this.policy, actor) ? this.exportRoom() : json(403, { error: 'right' });
    }
    if (isObserver) return json(403, { error: 'observer' });
    if (request.method === 'POST' && (path === '/ops' || path === '/admin')) {
      const b = await readJson(request);
      if (!b) return json(400, { error: 'json' });
      return path === '/ops' ? this.write(actor, b, now) : this.admin(actor, b, now);
    }
    return json(404, { error: 'path' });
  }

  async init(b, now) {
    if (this.meta) return json(409, { error: 'exists' });
    const policy = policyOf(this.env, b.fork);
    if (!policy) return json(400, { error: 'fork' });
    this.policy = policy;
    const codes = {};
    for (const s of this.slots()) codes[this.newCode(codes)] = { slot: s.slot, post: s.post, squad: s.squad, usedAt: null, client: null };
    // No observer link until a staff officer asks for one.
    this.meta = { name: b.name, code: b.code, codeHistory: [], fork: b.fork, server: b.server, keyId: b.keyId, planet: b.planet,
      h: String(b.h || '').slice(0, 40), createdAt: now, extended: false, locked: false, lockedAt: null, unlockedAt: null,
      closed: false, closedAt: null, frozen: null, epoch: 1, codes, observerHash: null };
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
    return json(200, { session: session.token, sheet: this.sheet(), epoch: 1 });
  }

  async join(request, b, now) {
    const m = this.meta, P = this.policy;
    if (m.closed) return json(423, { error: 'closed' });
    if (m.locked) return json(423, { error: 'locked' });
    if (m.frozen && m.frozen.reason !== 'silence') return json(423, { error: m.frozen.reason });
    if (!CLIENT_RE.test(String(b.client || ''))) return json(400, { error: 'client' });
    const members = this.activeMembers();
    const existing = members.find(x => x.client === b.client) || null;
    // A client id proves nothing: re-entering as a confirmed member takes that member's own session.
    if (existing && existing.confirmed) {
      const proof = await this.authenticate(request.headers.get('X-Room-Session'));
      if (!proof || proof.client !== b.client) return json(409, { error: 'member' });
    }
    let post, squad, slot, code = null, holder = null;
    if (b.postCode) {
      const key = String(b.postCode).toUpperCase();
      code = has(m.codes, key) ? m.codes[key] : null;
      // An unknown code and a code bound to someone else answer alike.
      if (!code || (code.client && code.client !== b.client)) return json(404, { error: 'postCode' });
      post = code.post; squad = code.squad; slot = code.slot;
      // The first presentation of a code moves whoever still held its slot out («должность перезашла»).
      if (!code.client) holder = members.find(x => x.slot === slot && x.client !== b.client) || null;
    } else {
      const def = R.postDef(P, b.post);
      if (!def || def.level === 'observer') return json(400, { error: 'post' });
      squad = def.perSquad ? b.squad : null;
      if (def.perSquad && !(typeof squad === 'string' && has(P.squads, squad))) return json(400, { error: 'squad' });
      post = def.id;
      slot = post + ':' + (squad || '') + ':word';
    }
    if (existing && existing.confirmed && existing.slot === slot) {
      const session = await this.newSession(b.client);
      await this.putRows(session.row);
      return json(200, { session: session.token, status: 'confirmed', post, squad, epoch: m.epoch });
    }
    const def = R.postDef(P, post);
    const taken = members.filter(x => x.post === post && (x.squad || null) === (squad || null) && x.client !== b.client &&
      x !== holder && this.fresh(x, now)).length;
    if (def && taken >= def.max) return json(409, { error: 'full' });
    const knocks = members.filter(x => !x.confirmed && x.client !== b.client && this.fresh(x, now)).length;
    if (knocks >= KNOCKS_MAX) return json(429, { error: 'knocks' });
    if (code) { code.usedAt = code.usedAt || now; code.client = b.client; }
    const word = wordFor(m.fork, rng);
    const ops = [];
    if (existing) ops.push({ op: 'del', kind: 'member', id: existing.id, by: SYSTEM, cid: 'rejoin' });
    if (holder) ops.push({ op: 'del', kind: 'member', id: holder.id, by: SYSTEM, cid: 'slot' });
    ops.push({ op: 'put', kind: 'member', id: 'mem-' + b.client + '-' + (this.state.seq + 1), by: { client: b.client, post, squad },
      data: { client: b.client, post, squad, slot, callsign: R.cleanText(b.callsign, P.limits.callsign),
        confirmed: false, word, knockAt: now } });
    const done = this.applyAll(ops);
    if (holder) this.sessions.delete(holder.client);
    const session = await this.newSession(b.client);
    await this.commit(done, Object.assign({ meta: m }, session.row));
    if (holder) await this.deleteRows(['sess:' + holder.client]);
    this.lastOpAt = now;
    return json(200, { session: session.token, status: 'knocking', word, post, squad, epoch: m.epoch });
  }

  async poll(actor, url, now) {
    const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
    const headers = { 'Retry-After': String(R.retryAfter(this.lastRequestOpAt, now)) };
    if (actor) this.seen.set(actor.client, now);
    if (actor && !actor.confirmed) {
      return json(200, { serverNow: now, seq: this.state.seq, meta: this.publicMeta(false), presence: {},
        knocking: true, word: actor.word, ops: [] }, headers);
    }
    const base = { serverNow: now, seq: this.state.seq, meta: this.publicMeta(true), presence: this.presence(now) };
    const rows = await this.s.list({ prefix: 'op:', startAfter: 'op:' + pad(since), limit: 500 });
    const ops = [];
    let size = 0;
    let more = rows.size === 500;
    for (const [, row] of rows) {
      const op = actor ? row : opForObserver(row);
      const n = JSON.stringify(op).length;
      if (ops.length && size + n > PAGE_BYTES) { more = true; break; }
      ops.push(op);
      size += n;
    }
    return json(200, Object.assign(base, { ops, more }), headers);
  }

  async snapshot(actor, url, now) {
    if (actor && !actor.confirmed) return json(403, { error: 'unconfirmed' });
    const cursor = url.searchParams.get('cursor') || '';
    const ids = Object.keys(this.state.objects).filter(id => !this.state.objects[id].deleted && id > cursor).sort();
    const page = ids.slice(0, 200).map(id => (actor ? this.state.objects[id] : objectForObserver(this.state.objects[id])));
    return json(200, { serverNow: now, seq: this.state.seq, objects: page, cursor: ids.length > 200 ? ids[199] : null, meta: this.publicMeta(true) });
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

  // Per op: resend check, shape, size, rate, R.cleanData, validateData/validatePatch,
  // canWrite, then the server stamps (R.stampData), applyOp and an ack by cid.
  async write(actor, body, now) {
    const m = this.meta, P = this.policy, L = P.limits;
    if (!actor.confirmed) return json(403, { error: 'unconfirmed' });
    const list = Array.isArray(body.ops) ? body.ops.slice(0, 64) : [];
    const cidOf = raw => (raw && typeof raw === 'object' && typeof raw.cid === 'string' ? raw.cid.slice(0, 40) : '');
    const resent = raw => this.acked(actor.client, cidOf(raw));
    // Presence heartbeats pass a lock and radio silence, so a quiet room keeps its members.
    const heartbeat = raw => !!raw && raw.kind === 'member' && raw.op === 'patch';
    const blocked = m.closed ? 'closed'
      : m.locked && !list.every(heartbeat) ? 'locked'
      : m.frozen && !(m.frozen.reason === 'silence' && list.every(heartbeat)) ? m.frozen.reason
      : null;
    if (blocked) {
      if (list.length && list.every(resent)) return json(200, { acks: list.map(resent), serverNow: now, seq: this.state.seq });
      return json(423, { error: blocked });
    }
    const acks = [];
    const accepted = [];
    let extra = null;
    for (const raw of list) {
      const cid = cidOf(raw);
      const again = this.acked(actor.client, cid);
      if (again) { acks.push(again); continue; }
      if (!raw || typeof raw !== 'object' || !WRITE_KINDS.includes(raw.kind) || !['put', 'patch', 'del'].includes(raw.op) ||
          typeof raw.id !== 'string' || !ID_RE.test(raw.id)) { acks.push({ cid, error: 'shape' }); continue; }
      if (bytes(JSON.stringify(raw)) > L.message) { acks.push({ cid, error: 'size' }); continue; }
      if (!this.allow(actor.client, now)) { acks.push({ cid, error: 'rate' }); continue; }
      if (this.bytes > L.bytes) {
        m.frozen = { at: now, reason: 'budget' };
        extra = { meta: m };
        acks.push({ cid, error: 'budget' });
        break;
      }
      const existing = has(this.state.objects, raw.id) ? this.state.objects[raw.id] : undefined;
      if (existing && existing.kind !== raw.kind) { acks.push({ cid, error: 'kind' }); continue; }
      const data = R.cleanData(P, raw.kind, raw.op, raw.data);
      const expectedStatus = typeof raw.expectedStatus === 'string' ? raw.expectedStatus : undefined;
      if (raw.kind === 'member') {
        const self = existing && !existing.deleted && existing.client === actor.client;
        if (raw.op !== 'patch' || !self || Object.keys(data).join() !== 'presentAt') { acks.push({ cid, error: 'right' }); continue; }
      } else {
        const bad = raw.op === 'put' ? R.validateData(P, raw.kind, data)
          : raw.op === 'patch' ? R.validatePatch(P, raw.kind, data, existing) : null;
        if (bad) { acks.push({ cid, error: bad }); continue; }
        if (raw.op === 'put' && !existing && this.countObjects() >= L.objects) { acks.push({ cid, error: 'objects' }); continue; }
        const check = R.canWrite(P, actor, { op: raw.op, kind: raw.kind, id: raw.id, data, expectedStatus },
          existing, { claimed: R.claimants(this.state.objects, existing) });
        // The author's own put already stands (its ack was lost beyond the cid memory): acknowledge, write nothing.
        if (!check.ok && check.reason === 'duplicate') { acks.push(this.remember(actor.client, cid, existing.seq)); continue; }
        if (!check.ok) { acks.push({ cid, error: check.reason }); continue; }
        if (raw.op === 'del' && existing.deleted) { acks.push(this.remember(actor.client, cid, existing.seq)); continue; }
      }
      R.stampData(raw.kind, raw.op, data, byOf(actor), now);
      const op = this.stamp({ op: raw.op, kind: raw.kind, id: raw.id, data, expectedStatus, cid }, byOf(actor));
      const res = R.applyOp(this.state, op);
      if (!res.ok) { acks.push({ cid, error: res.reason, status: existing ? existing.status : undefined }); continue; }
      accepted.push(op);
      this.remember(actor.client, cid, op.seq);
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
    const action = typeof b.action === 'string' ? b.action : '';
    if (m.closed) return json(423, { error: 'closed' });
    // Radio silence is the staff's own freeze; an administration stop or a spent budget holds every action but close and observer.
    if (m.frozen && m.frozen.reason !== 'silence' && action !== 'close' && action !== 'observer') return json(423, { error: m.frozen.reason });
    const staff = R.isStaff(P, actor);
    const target = typeof b.client === 'string' ? this.memberOf(b.client) : null;
    const ops = [];
    let metaChanged = false;
    let retired = null;
    const reply = { ok: true };
    const sessionsToDrop = [];
    const lastConfirmer = x => x.confirmed && R.hasRight(P, x, 'confirmJoin') && this.confirmers().length <= 1;

    switch (action) {
      case 'confirm': {
        if (!R.hasRight(P, actor, 'confirmJoin')) return json(403, { error: 'right' });
        if (!target || target.confirmed) return json(404, { error: 'member' });
        if (now - target.knockAt > P.ttl.wordSec * 1000) return json(409, { error: 'expired' });
        const knocking = this.activeMembers().filter(x => !x.confirmed && this.fresh(x, now)).length;
        if (knocking >= 2 && b.word !== target.word) return json(409, { error: 'word' });
        ops.push({ op: 'patch', kind: 'member', id: target.id, by: byOf(actor),
          data: { confirmed: true, confirmedBy: actor.post, confirmedAt: now, word: null } });
        break;
      }
      case 'release': {
        if (!target) return json(404, { error: 'member' });
        if (lastConfirmer(target)) return json(409, { error: 'last' });
        ops.push({ op: 'del', kind: 'member', id: target.id, by: byOf(actor) });
        sessionsToDrop.push(target.client);
        // The post code goes back to the sheet: whoever holds it next knocks again.
        for (const k of Object.keys(m.codes)) if (m.codes[k].client === target.client) { m.codes[k].client = null; metaChanged = true; }
        break;
      }
      case 'reissue': {
        if (!target) return json(404, { error: 'member' });
        const sameSquad = target.squad && actor.squad === target.squad;
        if (!staff && !sameSquad) return json(403, { error: 'right' });
        if (lastConfirmer(target)) return json(409, { error: 'last' });
        for (const k of Object.keys(m.codes)) if (m.codes[k].slot === target.slot) delete m.codes[k];
        const c = this.newCode(m.codes);
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
        if (!m.locked) return json(409, { error: 'state' });
        m.locked = false; m.lockedAt = null; m.unlockedAt = now; this.lastOpAt = now; metaChanged = true;
        break;
      case 'extend':
        if (!R.hasRight(P, actor, 'extend')) return json(403, { error: 'right' });
        if (m.extended) return json(409, { error: 'extended' });
        if (now < R.roomDeadlines(P, m.createdAt, false).warnAt) return json(409, { error: 'early' });
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
        // The new alias first: if anything below fails, the old code still reaches the room.
        let code = null;
        for (let i = 0; i < 5 && !code; i++) {
          const candidate = R.randomCode(6, rng);
          const r = await (await this.registry('/alias', { code: candidate, name: m.name })).json();
          if (r.ok) code = candidate;
        }
        if (!code) return json(503, { error: 'collision' });
        retired = m.code;
        m.codeHistory = (m.codeHistory || []).concat(m.code);
        m.code = code; m.epoch += 1; m.observerHash = null; metaChanged = true;
        // Post codes nobody used yet are on the leaked sheet too: they change; bound codes stay with their holders.
        const old = new Set(Object.keys(m.codes));
        for (const k of [...old]) {
          if (m.codes[k].client) continue;
          const c = m.codes[k];
          delete m.codes[k];
          m.codes[this.newCode(m.codes, old)] = c;
        }
        for (const x of this.activeMembers()) {
          if (x.client === actor.client) continue;
          ops.push({ op: 'del', kind: 'member', id: x.id, by: byOf(actor) });
          sessionsToDrop.push(x.client);
        }
        reply.code = code;
        reply.sheet = this.sheet();
        break;
      }
      default:
        return json(400, { error: 'action' });
    }

    const done = this.applyAll(ops);
    const extra = metaChanged ? { meta: m } : {};
    if (action === 'rotate') {
      this.sessions = new Map();
      const session = await this.newSession(actor.client);
      Object.assign(extra, session.row);
      reply.session = session.token;
      sessionsToDrop.push(...[...(await this.s.list({ prefix: 'sess:' })).keys()].map(k => k.slice(5)).filter(c => c !== actor.client));
    }
    for (const c of sessionsToDrop) this.sessions.delete(c);
    await this.commit(done, extra);
    if (sessionsToDrop.length) await this.deleteRows([...new Set(sessionsToDrop)].map(c => 'sess:' + c));
    if (retired) {
      try { await this.registry('/retire', { old: retired, name: m.name }); } catch { /* the room itself answers 'rotated' */ }
    }
    if (done.length) this.lastOpAt = now;
    this.memberOpAt.set(actor.client, now);
    if (metaChanged) await this.schedule();
    if (action === 'close') await this.setActive(false);
    if (action === 'unlock') await this.setActive(true);
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
    const cal = has(this.state.objects, 'calibration') ? this.state.objects.calibration : null;
    const offset = cal && !cal.deleted && Array.isArray(cal.offset) ? cal.offset : null;
    const m = this.meta;
    return json(200, {
      meta: { code: m.code, fork: m.fork, server: m.server, planet: m.planet, createdAt: m.createdAt, closedAt: m.closedAt, extended: m.extended, frozen: m.frozen },
      members, objects, ops, text: CHRONOLOGY_HEADER + '\n' + chronology(ops, this.policy, offset, this.state.objects)
    });
  }

  async alarm() {
    await this.load();
    if (!this.meta) return;
    const now = this.now();
    const m = this.meta, P = this.policy;
    const grace = P.ttl.exportGraceSec * 1000;
    const maxAt = R.roomDeadlines(P, m.createdAt, m.extended).maxAt;
    if ((m.closed && now >= m.closedAt + grace) || (!m.closed && m.locked && now >= m.lockedAt + grace)) {
      await this.registry('/release', { name: m.name, codes: [m.code].concat(m.codeHistory || []) });
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
      await this.setActive(false);
    } else if (!m.closed && !m.locked && R.idleLocked(P, this.lastOpAt, now)) {
      // An abandoned room locks on its own and frees its ceiling slot.
      m.locked = true;
      m.lockedAt = now;
      await this.s.put('meta', m);
      await this.setActive(false);
    }
    await this.checkStop(now);
    await this.schedule();
  }
}

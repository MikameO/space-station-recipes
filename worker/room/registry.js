// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// One Registry object ("main"): room code aliases and tombstones of rotated
// codes, active/daily counters for the ceilings, stop flags per server key, and
// numbers-only health. Locked and closed rooms leave the ceilings but keep
// their codes until the room is deleted.
const day = t => new Date(t).toISOString().slice(0, 10);
const ok = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const codesOf = b => (Array.isArray(b.codes) ? b.codes : [b.code]).filter(c => typeof c === 'string' && c);
const live = (v, now) => !v.until || now <= v.until;

export class Registry {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  now() { return this.env.NOW ? this.env.NOW() : Date.now(); }

  async stopped(keyId) {
    const s = this.ctx.storage;
    return !!((await s.get('stop:*')) || (await s.get('stop:' + keyId)));
  }

  // A live alias or a tombstone blocks a code: a rotated code never reaches another room.
  async taken(code) {
    const s = this.ctx.storage;
    return !!((await s.get('code:' + code)) || (await s.get('rotated:' + code)));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const s = this.ctx.storage;
    const now = this.now();
    const b = request.method === 'POST' ? await request.json() : null;
    switch (url.pathname) {
      case '/reserve': {
        if (await this.stopped(b.keyId)) return ok({ ok: false, reason: 'stopped' });
        const stale = [];
        let rooms = 0, ofKey = 0;
        for (const [k, v] of await s.list({ prefix: 'active:' })) {
          if (!live(v, now) || now - v.createdAt > b.horizonMs) { stale.push(k); continue; }
          rooms++;
          if (v.keyId === b.keyId) ofKey++;
        }
        if (stale.length) await s.delete(stale);
        if (rooms >= b.maxConcurrent || ofKey >= (b.maxPerKey || 3)) return ok({ ok: false, reason: 'ceiling' });
        const dayKey = 'day:' + day(now);
        const today = (await s.get(dayKey)) || 0;
        if (today >= b.maxDaily) return ok({ ok: false, reason: 'daily' });
        if (await this.taken(b.code)) return ok({ ok: false, reason: 'collision' });
        await s.put({ [dayKey]: today + 1, ['active:' + b.name]: { createdAt: now, keyId: b.keyId, until: now + b.horizonMs }, ['code:' + b.code]: b.name });
        return ok({ ok: true });
      }
      case '/resolve': {
        const code = url.searchParams.get('code');
        const name = await s.get('code:' + code);
        if (name) return ok({ name });
        return ok({ name: null, rotated: !!(await s.get('rotated:' + code)) });
      }
      // Rotation in two steps: the new alias first, the old code retired only after the room committed.
      case '/alias':
        if (await this.taken(b.code)) return ok({ ok: false, reason: 'collision' });
        await s.put('code:' + b.code, b.name);
        return ok({ ok: true });
      case '/retire':
        await s.delete('code:' + b.old);
        await s.put('rotated:' + b.old, { name: b.name, at: now });
        return ok({ ok: true });
      case '/deactivate':
        await s.delete('active:' + b.name);
        return ok({ ok: true });
      case '/activate':
        await s.put('active:' + b.name, { createdAt: b.createdAt, keyId: b.keyId, until: b.until });
        return ok({ ok: true });
      case '/release': {
        const keys = ['active:' + b.name];
        for (const c of codesOf(b)) keys.push('code:' + c, 'rotated:' + c);
        for (let i = 0; i < keys.length; i += 128) await s.delete(keys.slice(i, i + 128));
        return ok({ ok: true });
      }
      case '/stopped':
        return ok({ stopped: await this.stopped(url.searchParams.get('keyId')) });
      case '/stop':
        if (b.on) await s.put('stop:' + b.keyId, now); else await s.delete('stop:' + b.keyId);
        return ok({ ok: true });
      case '/health': {
        let active = 0;
        for (const [, v] of await s.list({ prefix: 'active:' })) if (live(v, now)) active++;
        return ok({ active, today: (await s.get('day:' + day(now))) || 0 });
      }
    }
    return new Response('not found', { status: 404 });
  }
}

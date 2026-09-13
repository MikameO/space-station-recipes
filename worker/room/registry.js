// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// One Registry object ("main"): room code aliases, active/daily counters for
// the ceilings, stop flags per server key, and numbers-only health.
const day = t => new Date(t).toISOString().slice(0, 10);
const ok = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

export class Registry {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  now() { return this.env.NOW ? this.env.NOW() : Date.now(); }

  async stopped(keyId) {
    const s = this.ctx.storage;
    return !!((await s.get('stop:*')) || (await s.get('stop:' + keyId)));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const s = this.ctx.storage;
    const now = this.now();
    const b = request.method === 'POST' ? await request.json() : null;
    switch (url.pathname) {
      case '/reserve': {
        if (await this.stopped(b.keyId)) return ok({ ok: false, reason: 'stopped' });
        const active = await s.list({ prefix: 'active:' });
        const stale = [];
        let live = 0;
        for (const [k, v] of active) { if (now - v.createdAt > b.horizonMs) stale.push(k); else live++; }
        if (stale.length) await s.delete(stale);
        if (live >= b.maxConcurrent) return ok({ ok: false, reason: 'ceiling' });
        const dayKey = 'day:' + day(now);
        const today = (await s.get(dayKey)) || 0;
        if (today >= b.maxDaily) return ok({ ok: false, reason: 'daily' });
        if (await s.get('code:' + b.code)) return ok({ ok: false, reason: 'collision' });
        await s.put({ [dayKey]: today + 1, ['active:' + b.name]: { createdAt: now, keyId: b.keyId }, ['code:' + b.code]: b.name });
        return ok({ ok: true });
      }
      case '/resolve':
        return ok({ name: (await s.get('code:' + url.searchParams.get('code'))) || null });
      case '/rotate': {
        if (await s.get('code:' + b.code)) return ok({ ok: false, reason: 'collision' });
        await s.delete('code:' + b.old);
        await s.put('code:' + b.code, b.name);
        return ok({ ok: true });
      }
      case '/release':
        await s.delete(['active:' + b.name, 'code:' + b.code]);
        return ok({ ok: true });
      case '/stopped':
        return ok({ stopped: await this.stopped(url.searchParams.get('keyId')) });
      case '/stop':
        if (b.on) await s.put('stop:' + b.keyId, now); else await s.delete('stop:' + b.keyId);
        return ok({ ok: true });
      case '/health': {
        const active = await s.list({ prefix: 'active:' });
        return ok({ active: active.size, today: (await s.get('day:' + day(now))) || 0 });
      }
    }
    return new Response('not found', { status: 404 });
  }
}

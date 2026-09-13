// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// HTTP entry for the officers' room: CORS, sanction token, ceilings, stop links,
// code → Room object resolution with a 60 s per-isolate cache.
import '../../tactical/room-logic.js';
import POLICIES from './policies.js';
import { verifyServerToken, stopSig, safeEqual, rng } from './crypto.js';

const policiesOf = env => env.POLICIES || POLICIES;

const R = globalThis.TacticalRoomLogic;
const cache = new Map();
const CODE = '[ABCDEFGHJKMNPQRSTUVWXYZ23456789]';
const ROOM_RE = new RegExp('^/room/(' + CODE + '{6})/(join|ops|snapshot|export|admin)$');
const PASS_HEADERS = ['Content-Type', 'X-Room-Session', 'X-Room-Observer'];

export function isRoomPath(p) {
  return p === '/room' || p.startsWith('/room/') || p.startsWith('/policy/') || p === '/health' ||
    p.startsWith('/stop/') || p.startsWith('/start/');
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Room-Session, X-Room-Observer, X-Room-Key-Id',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function reply(status, body, origin, extra) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, origin ? corsHeaders(origin) : {}, extra || {});
  return new Response(JSON.stringify(body), { status, headers });
}

function registry(env, path, body) {
  return env.REGISTRY.get(env.REGISTRY.idFromName('main')).fetch('https://registry' + path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
}

async function cached(key, now, load) {
  const hit = cache.get(key);
  if (hit && now - hit.t < 60000) return hit.v;
  const v = await load();
  cache.set(key, { v, t: now });
  return v;
}

async function stopLink(request, env, path) {
  const [, action, keyId, sig] = path.split('/');
  if (!keyId || !sig || !env.ROOM_STOP_SECRET || !['stop', 'start'].includes(action)) return new Response('not found', { status: 404 });
  if (!safeEqual(await stopSig(env.ROOM_STOP_SECRET, action, keyId), sig)) return new Response('forbidden', { status: 403 });
  const html = { 'Content-Type': 'text/html; charset=utf-8' };
  const label = action === 'stop' ? 'Отключить командный планшет' : 'Включить командный планшет';
  if (request.method !== 'POST') {
    return new Response('<!doctype html><meta charset="utf-8"><title>' + label + '</title>' +
      '<p>Ключ сервера: <b>' + keyId.replace(/[^A-Za-z0-9_-]/g, '') + '</b></p>' +
      '<form method="post"><button type="submit">' + label + '</button></form>', { status: 200, headers: html });
  }
  await registry(env, '/stop', { keyId, on: action === 'stop' });
  const text = action === 'stop'
    ? 'Командный планшет отключён: новые комнаты не создаются, идущие переходят в «Радиомолчание» в течение минуты.'
    : 'Командный планшет снова включён.';
  return new Response('<!doctype html><meta charset="utf-8"><p>' + text + '</p>', { status: 200, headers: html });
}

async function createRoom(request, env, origin, now) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (env.ROOM_CREATE_RL) {
    const { success } = await env.ROOM_CREATE_RL.limit({ key: ip });
    if (!success) return reply(429, { error: 'rate' }, origin);
  }
  let b;
  try { b = await request.json(); } catch { return reply(400, { error: 'bad-json' }, origin); }
  const keyId = request.headers.get('X-Room-Key-Id') || '';
  const tok = await verifyServerToken(env.ROOM_KEYS, b && b.token);
  if (!tok || tok.keyId !== keyId || !policiesOf(env)[tok.fork]) return reply(403, { error: 'sanction' }, origin);
  const policy = policiesOf(env)[tok.fork];
  const creator = (b && b.creator) || {};
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(String(creator.client || ''))) return reply(400, { error: 'client' }, origin);
  if (R.levelOf(policy, creator.post) !== 'staff') return reply(400, { error: 'creator' }, origin);
  if (typeof b.planet !== 'string' || !/^[a-z0-9_.-]{1,40}$/i.test(b.planet)) return reply(400, { error: 'planet' }, origin);
  const horizonMs = (policy.ttl.roomMaxSec + policy.ttl.roomExtendSec + policy.ttl.exportGraceSec) * 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = R.randomCode(6, rng);
    const name = 'r-' + code + '-' + now.toString(36) + '-' + attempt;
    const res = await (await registry(env, '/reserve', {
      code, name, keyId, horizonMs,
      maxConcurrent: Number(env.ROOMS_MAX_CONCURRENT) || 6, maxDaily: Number(env.ROOMS_MAX_DAILY) || 30
    })).json();
    if (!res.ok && res.reason === 'collision') continue;
    if (!res.ok) return reply(res.reason === 'stopped' ? 403 : 429, { error: res.reason }, origin);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(name));
    const init = await stub.fetch(new Request('https://room/init', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, fork: tok.fork, server: tok.server, keyId, planet: b.planet, h: String(b.h || ''), creator })
    }));
    const data = await init.json();
    if (!init.ok) return reply(init.status, data, origin);
    return reply(200, Object.assign({ code, fork: tok.fork, server: tok.server }, data), origin);
  }
  return reply(503, { error: 'collision' }, origin);
}

export async function routeRoom(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.startsWith('/stop/') || path.startsWith('/start/')) return stopLink(request, env, path);
  const origin = request.headers.get('Origin') || '';
  const allowed = allowedOrigins(env).includes(origin);
  if (request.method === 'OPTIONS') return allowed ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
  if (!allowed) return reply(403, { error: 'origin' });
  const now = env.NOW ? env.NOW() : Date.now();

  if (path.startsWith('/policy/')) {
    const policy = policiesOf(env)[path.slice('/policy/'.length)];
    return policy ? reply(200, policy, origin, { 'Cache-Control': 'max-age=60' }) : reply(404, { error: 'fork' }, origin);
  }
  if (path === '/health') return reply(200, await (await registry(env, '/health')).json(), origin);
  if (env.ROOMS_ENABLED !== '1') return reply(503, { error: 'disabled' }, origin);
  if (path === '/room' && request.method === 'POST') return createRoom(request, env, origin, now);

  const m = path.match(ROOM_RE);
  if (!m) return reply(404, { error: 'path' }, origin);
  if (m[2] === 'join' && env.ROOM_JOIN_RL) {
    const { success } = await env.ROOM_JOIN_RL.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
    if (!success) return reply(429, { error: 'rate' }, origin);
  }
  const name = await cached('code:' + m[1], now, async () => (await (await registry(env, '/resolve?code=' + m[1])).json()).name);
  if (!name) return reply(404, { error: 'room' }, origin);
  const headers = {};
  for (const h of PASS_HEADERS) if (request.headers.get(h)) headers[h] = request.headers.get(h);
  const params = new URLSearchParams(url.search);
  params.set('code', m[1]);
  const inner = new Request('https://room/' + m[2] + '?' + params.toString(), {
    method: request.method, headers, body: request.method === 'POST' ? await request.text() : undefined
  });
  const res = await env.ROOMS.get(env.ROOMS.idFromName(name)).fetch(inner);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
  return out;
}

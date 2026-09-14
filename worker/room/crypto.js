// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// Tokens and secrets for the officers' room: HMAC-SHA256 server tokens, stop
// links, session hashes. Web Crypto only, so the same file runs in Node tests.
const enc = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

export async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

export async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function randomSecret(bytes = 18) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function rng() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function signServerToken(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return body + '.' + await hmac(secret, body);
}

export const KEY_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const MIN_SECRET_LENGTH = 24;

// Own properties only: a key id or fork named `constructor` or `__proto__` must not reach Object.prototype.
export function own(obj, key) {
  return obj !== null && typeof obj === 'object' && typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

// Payload {fork, server, keyId, iat} when the signature matches ROOM_KEYS[keyId], else null.
// A ROOM_KEYS entry is the secret string, or {secret, minIat} to retire tokens issued before minIat.
export async function verifyServerToken(keysJson, token) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  let payload, keys;
  try { payload = JSON.parse(fromB64url(parts[0])); } catch { return null; }
  try { keys = JSON.parse(keysJson || '{}'); } catch { return null; }
  if (!payload || typeof payload !== 'object' || !keys || typeof keys !== 'object') return null;
  if (typeof payload.keyId !== 'string' || !KEY_ID_RE.test(payload.keyId)) return null;
  const entry = own(keys, payload.keyId);
  const secret = typeof entry === 'string' ? entry : own(entry, 'secret');
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) return null;
  const minIat = own(entry, 'minIat');
  if (typeof minIat === 'number' && !(typeof payload.iat === 'number' && payload.iat >= minIat)) return null;
  return safeEqual(await hmac(secret, parts[0]), parts[1]) ? payload : null;
}

export function stopSig(stopSecret, action, keyId) {
  return hmac(stopSecret, action + ':' + keyId);
}

// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Cloudflare Worker: the site's idea form and returning-visitor survey POST
// here; the Worker files a labelled GitHub issue with the owner's token so the
// public repo never carries a secret. Design: docs/design/2026-09-12-home-menu-and-feedback.md.
// Tests: scripts/test_feedback_worker.mjs. Setup: header of wrangler.toml.

const REPO = 'MikameO/space-station-recipes';
const LABELS = { idea: ['idea', 'from-site'], survey: ['survey', 'from-site'] };
// Bytes, not characters: a full-length Russian survey is about 4 000 characters
// but twice that in UTF-8, before the JSON around it.
const MAX_BODY_BYTES = 16 * 1024;
const MIN_OPEN_MS = 3000;
const LIMITS = { text: [10, 2000], answer: [0, 2000], contact: [0, 80], chips: 10 };
const CHIP_RE = /^[a-z]{1,20}$/;            // section ids from sections.json
const ZWSP = '​';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(status, body, origin) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(body), { status, headers });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function within(s, [min, max]) {
  return typeof s === 'string' && s.trim().length >= min && s.length <= max;
}

// Anonymous text is posted under the owner's token, so it has to stay inert on
// GitHub: an @mention notifies a stranger, #N, owner/repo#N and issue links add
// "mentioned this" events to other repositories, and ![](…) embeds a remote
// image. A zero-width space breaks each pattern and reads the same.
export function inert(s) {
  return String(s ?? '')
    .replace(/@(?=[\w-])/g, '@' + ZWSP)
    .replace(/#(?=\d)/g, '#' + ZWSP)
    .replace(/github\.com/gi, m => m.slice(0, 6) + ZWSP + m.slice(6))
    .replace(/!\[/g, '!' + ZWSP + '[');
}

// One line, at most `max` characters, "…" when cut.
function oneLine(s, max) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// Markdown table cell: inert, no pipes, no newlines, bounded.
function cell(v) {
  return inert(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 120);
}

// null when acceptable, otherwise a short error code (mirrors feedback.js validate()).
export function validate(body) {
  if (!body || typeof body !== 'object') return 'bad-json';
  if (body.hp) return 'honeypot';
  if (!(typeof body.t === 'number' && body.t >= MIN_OPEN_MS)) return 'too-fast';
  if (body.kind !== 'idea' && body.kind !== 'survey') return 'bad-kind';
  if (body.contact !== undefined && !within(String(body.contact), LIMITS.contact)) return 'contact-long';
  if (body.kind === 'idea') {
    return within(body.text, LIMITS.text) ? null : 'text-length';
  }
  const a = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const hardest = typeof a.hardest === 'string' ? a.hardest : '';
  const wanted = typeof a.wanted === 'string' ? a.wanted : '';
  if (!within(hardest, LIMITS.answer) || !within(wanted, LIMITS.answer)) return 'answer-length';
  if (!hardest.trim() && !wanted.trim()) return 'empty';
  if (body.chips !== undefined && (!Array.isArray(body.chips) || body.chips.length > LIMITS.chips ||
      !body.chips.every(c => typeof c === 'string' && CHIP_RE.test(c)))) return 'chips';
  return null;
}

export function buildIssue(body) {
  const m = body.meta && typeof body.meta === 'object' ? body.meta : {};
  const rows = [
    ['Page', cell(m.page) + (m.tab ? ' · tab ' + cell(m.tab) : '')],
    ['Lang', cell(m.lang)], ['Fork', cell(m.fork)], ['Visits', cell(m.visits)],
    ['Device', cell(m.device)], ['Data', cell(m.data)],
  ];
  if (body.contact && String(body.contact).trim()) rows.push(['Contact', cell(body.contact)]);
  const table = '| | |\n|---|---|\n' + rows.map(([k, v]) => `| ${k} | ${v || '—'} |`).join('\n');

  let title, text;
  if (body.kind === 'idea') {
    title = '[idea] ' + oneLine(inert(body.text), 60);
    text = '**Idea / Идея**\n\n' + inert(body.text.trim());
  } else {
    const a = body.answers;
    title = `[survey] visit ${cell(m.visits) || '?'} · ${cell(m.lang) || '?'} · ${cell(m.fork) || '?'}`;
    text = '**What was the hardest part? / Что было сложнее всего?**\n\n' + (inert(a.hardest.trim()) || '—') +
           '\n\n**What is missing? / Чего не хватает?**\n\n' + (inert(a.wanted.trim()) || '—');
    if (Array.isArray(body.chips) && body.chips.length) text += '\n\nSections: ' + body.chips.join(', ');
  }
  return { title, body: text + '\n\n---\n' + table + '\n\n_Sent from the site feedback form._', labels: LABELS[body.kind] };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = allowedOrigins(env).includes(origin);

    if (request.method === 'OPTIONS') {
      return allowed ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
    }
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/submit') return json(404, { ok: false, error: 'not-found' });
    if (!allowed) return json(403, { ok: false, error: 'origin' });
    if (!/^application\/json\b/i.test(request.headers.get('Content-Type') || '')) return json(400, { ok: false, error: 'content-type' }, origin);
    // Refuse a declared oversize body before reading it; the limiter runs before
    // the read too, so a flood costs one header check per request.
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) return json(413, { ok: false, error: 'too-large' }, origin);

    if (env.RL) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RL.limit({ key: ip });
      if (!success) return json(429, { ok: false, error: 'rate-limited' }, origin);
    }

    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'too-large' }, origin);
    let body;
    try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'bad-json' }, origin); }
    const err = validate(body);
    if (err) return json(400, { ok: false, error: err }, origin);

    const issue = buildIssue(body);
    const gh = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'chemdb-feedback-worker',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(issue),
    });
    if (!gh.ok) return json(502, { ok: false, error: 'github-' + gh.status }, origin);
    const data = await gh.json();
    return json(200, { ok: true, number: data.number, url: data.html_url }, origin);
  },
};

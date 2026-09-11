# Document Library (Series G / G1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `library.html` page that archives player-written in-game papers verbatim (first: the RuCM Staff Officer doctrine), renders them like SS14 paper, and lets a player copy the markup back within the 10000-char paper limit.

**Architecture:** A second static page next to the SPA: `library.html` (chrome + layout) → `library.js` (pure markup renderer + page controller, no deps) → `library/index.json` (manifest) + `library/<id>.paper.txt` (verbatim sources). Styles append to `style.css`; RU chrome via the existing `i18n.js` dictionary; the SPA only gets a `.tab-link` anchor. Deploy/offline wiring: `deploy.yml` cp-list + two-page asset check, `sw.js` precache.

**Tech Stack:** Vanilla JS (ES5-style IIFE like `i18n.js`/`ordnance.js`), CSS on existing tokens, Node 24 for the renderer test, Python 3 for data checks, GitHub Pages deploy workflow.

**Spec:** [docs/design/2026-09-11-document-library.md](../../design/2026-09-11-document-library.md)

---

## File structure

| File | Responsibility |
|---|---|
| `library/rucm-staff-officer-doctrine.paper.txt` (create) | Verbatim SS14 paper markup of the doctrine. UTF-8, no BOM, LF. Never edited. |
| `library/index.json` (create) | Manifest: one entry per document (id, title, role{en,ru}, fork, forkName, lang, kind, file, author, provenance, received, notes). |
| `library.js` (create) | `window.LibraryMarkup.render(raw)` — tag tokenizer + tolerant stack → HTML. Page controller: manifest load, list by role, `#doc=` deep link, Rendered/Markup views, counter, copy, Metrika goals. |
| `scripts/test_library_markup.js` (create) | Node test of the renderer (15 cases + the real doctrine renders every tag). |
| `library.html` (create) | Page chrome (header/logo/lang/feedback), intro, two-column layout, footer, Metrika snippet, script tags. |
| `style.css` (modify) | `.tab-btn, .tab-link` shared base; new `.lib-*` block incl. paper sheet and the 700 px breakpoint; body/main overrides for a scrolling page. |
| `i18n.js` (modify) | 19 dictionary keys for the library chrome. |
| `index.html` (modify) | `.tab-link` to `library.html` after Fork Diff; `?v=` bumps (style 60, i18n 30). |
| `sw.js` (modify) | `CACHE` → v81; precache `library.html`, `library.js?v=1`, `library/index.json`; version bumps. |
| `.github/workflows/deploy.yml` (modify) | cp `library.html library.js`, `cp -r library`; asset check over `index.html` **and** `library.html`. |
| `sitemap.xml` (modify) | Add `library.html`. |
| `NOTICES` (modify) | §3 community-authored documents. |
| `scripts/create_metrika_goals.py` (modify) | Register `library_doc_open`, `library_copy_markup` (script is NOT run). |
| `README.md`, `CHANGELOG.md`, `ROADMAP.md` (modify) | Feature row; Series G changelog entry; Series G section + Backlog note + revision row. |

Commits: after Task 2 (data + renderer + test), after Task 4 (page + styles + i18n verified in preview), after Task 6 (wiring + docs + final verification). Push after the last one (user authorised: «деплоим»).

---

### Task 1: Document source + manifest

**Files:**
- Create: `library/rucm-staff-officer-doctrine.paper.txt`
- Create: `library/index.json`

- [ ] **Step 1: Copy the verified source file from the scratchpad**

The scratchpad copy `so-guide.paper.txt` was saved from the user's message and measured at 9550 UTF-16 units. Copy it in and normalise line endings:

```bash
mkdir -p library
python - <<'PY'
import io, pathlib
src = pathlib.Path(r'C:/Users/Mikhail/AppData/Local/Temp/claude/D--Space-Station-Recipes/63231c77-967a-461e-9d56-d23d9763ffcb/scratchpad/so-guide.paper.txt')
text = src.read_text(encoding='utf-8-sig').replace('\r\n', '\n').replace('\r', '\n')
if not text.endswith('\n'): text += '\n'
pathlib.Path('library/rucm-staff-officer-doctrine.paper.txt').write_bytes(text.encode('utf-8'))
print(len(text), 'chars written')
PY
```

Expected: `9551 chars written` or `9550 chars written` (the trailing newline is the only allowed difference from the measured 9550; the in-game paste will not carry it).

- [ ] **Step 2: Write the manifest**

`library/index.json`:

```json
{
  "schemaVersion": 1,
  "documents": [
    {
      "id": "rucm-staff-officer-doctrine",
      "title": "Доктрина оперативного управления и штабной работы",
      "role": { "en": "Staff Officer", "ru": "Офицер Штаба" },
      "fork": "rucm",
      "forkName": "Russian Marine Corps",
      "lang": "ru",
      "kind": "paper",
      "file": "rucm-staff-officer-doctrine.paper.txt",
      "author": "Штаб роты, RuCM",
      "provenance": "Выдан командующим роты во время раунда за Офицера Штаба. Текст воспроизведён дословно.",
      "received": "2026-09-10",
      "notes": ""
    }
  ]
}
```

- [ ] **Step 3: Validate both files**

```bash
python - <<'PY'
import json, pathlib, re
raw = pathlib.Path('library/rucm-staff-officer-doctrine.paper.txt').read_bytes()
assert not raw.startswith(b'\xef\xbb\xbf'), 'BOM'
assert b'\r' not in raw, 'CR'
text = raw.decode('utf-8')
print('chars (UTF-16 units):', len(text.encode('utf-16-le')) // 2)
for t in ('color', 'bold', 'italic', 'head'):
    o = len(re.findall(r'\[%s(=[^\]]*)?\]' % t, text)); c = text.count('[/%s]' % t)
    assert o == c, (t, o, c)
idx = json.loads(pathlib.Path('library/index.json').read_text(encoding='utf-8'))
d = idx['documents'][0]
assert pathlib.Path('library', d['file']).exists()
assert d['file'] == d['id'] + '.paper.txt'
print('manifest ok:', d['id'], d['role'])
PY
```

Expected: `chars (UTF-16 units): 9551` (or 9550), four balanced tag pairs, `manifest ok: rucm-staff-officer-doctrine {...}`.

---

### Task 2: Markup renderer (TDD) + page controller in `library.js`

**Files:**
- Create: `scripts/test_library_markup.js`
- Create: `library.js`

- [ ] **Step 1: Write the failing test**

`scripts/test_library_markup.js`:

```js
// Renders SS14 paper markup through library.js outside the browser and checks
// the cases the document library relies on. Run: node scripts/test_library_markup.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'library.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const render = ctx.window.LibraryMarkup.render;

const cases = [
  ['plain text is escaped', 'a <b> & "q"', 'a &lt;b&gt; &amp; &quot;q&quot;'],
  ['bold', 'a [bold]b[/bold] c', 'a <span class="lib-b">b</span> c'],
  ['italic + bolditalic + mono', '[italic]i[/italic][bolditalic]bi[/bolditalic][mono]m[/mono]',
    '<span class="lib-i">i</span><span class="lib-bi">bi</span><span class="lib-mono">m</span>'],
  ['hex colour', '[color=#1b67a5]x[/color]', '<span style="color:#1b67a5">x</span>'],
  ['named colour', '[color=CornflowerBlue]x[/color]', '<span style="color:CornflowerBlue">x</span>'],
  ['bad colour stays text', '[color=url(x)]x[/color]', '[color=url(x)]x[/color]'],
  ['heading levels', '[head=2]T[/head][head]U[/head]', '<span class="lib-h2">T</span><span class="lib-h1">U</span>'],
  ['heading out of range stays text', '[head=9]x[/head]', '[head=9]x[/head]'],
  ['bullet', '[bullet]item', '\u2022 item'],
  ['font tag is transparent', '[font=Fancy]x[/font]', '<span>x</span>'],
  ['unknown tag stays text', '[unknown]x[/unknown]', '[unknown]x[/unknown]'],
  ['stray close stays text', 'x[/bold]', 'x[/bold]'],
  ['unclosed tag is closed at the end', '[bold]open', '<span class="lib-b">open</span>'],
  ['misnested close keeps both styles', '[color=#AAAAAA][italic] x[/color][/italic]',
    '<span style="color:#AAAAAA"><span class="lib-i"> x</span></span><span class="lib-i"></span>'],
  ['newlines and spaces survive', '  a\n   b', '  a\n   b'],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  const got = render(input);
  if (got === expected) { console.log('ok   ' + name); continue; }
  failed++;
  console.log('FAIL ' + name + '\n  expected: ' + JSON.stringify(expected) + '\n  got:      ' + JSON.stringify(got));
}

// The real document must render without leaving any tag visible as text.
const doc = fs.readFileSync(path.join(__dirname, '..', 'library', 'rucm-staff-officer-doctrine.paper.txt'), 'utf8');
const html = render(doc);
const leftover = html.match(/\[\/?(color|bold|italic|head)[^\]]*\]/g);
if (leftover) { failed++; console.log('FAIL doctrine: tags left as text: ' + leftover.slice(0, 5).join(' ')); }
else console.log('ok   doctrine renders every tag (' + doc.length + ' chars)');

console.log(failed ? failed + ' failing' : 'all passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/test_library_markup.js`
Expected: crash with `ENOENT ... library.js` (file does not exist yet).

- [ ] **Step 3: Write `library.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Series G: the document library (library.html). In-game papers written by
// players — doctrines, field manuals, role memos — stored verbatim as SS14
// paper markup under library/ and rendered the way the game shows them.
// Design: docs/design/2026-09-11-document-library.md.
//
// window.LibraryMarkup.render(raw) is pure and is what scripts/test_library_markup.js
// exercises under Node; everything below the "page" line needs a DOM.
(function () {
  'use strict';

  // PaperComponent.ContentSize — identical in space-wizards/space-station-14 and
  // RMC-14/RMC-14 (checked 2026-09-11). The server compares string.Length, i.e.
  // UTF-16 units including the markup tags, which is exactly JS .length.
  var PAPER_LIMIT = 10000;
  var YM_COUNTER_ID = 108585248;

  function track(goal, params) {
    try {
      if (typeof ym === 'function') ym(YM_COUNTER_ID, 'reachGoal', goal, params);
    } catch (e) { /* analytics must never break the page */ }
  }

  // ── markup renderer ──────────────────────────────────────
  // Tag set of Robust.Client/UserInterface/RichText. Anything else stays visible
  // as text, which is also what the game does with a tag it cannot read.
  var TAG_RE = /\[(\/)?([a-z]+)(?:=([^\]]*))?\]/g;
  var COLOR_RE = /^(#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+)$/i;
  var CLASS_TAGS = { bold: 'lib-b', italic: 'lib-i', bolditalic: 'lib-bi', mono: 'lib-mono' };

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Opening HTML for a tag, or null when it is not one we render.
  function openHtml(name, arg) {
    if (name === 'color') {
      if (arg === undefined || !COLOR_RE.test(arg)) return null;
      return '<span style="color:' + arg + '">';
    }
    if (CLASS_TAGS[name]) return '<span class="' + CLASS_TAGS[name] + '">';
    if (name === 'head') {
      var n = arg === undefined ? 1 : parseInt(arg, 10);
      if (!(n >= 1 && n <= 3)) return null;
      return '<span class="lib-h' + n + '">';
    }
    if (name === 'font') return '<span>';
    return null;
  }

  function render(raw) {
    var out = '';
    var stack = []; // open tags, innermost last: {name, html}
    var last = 0;
    var m, i, k;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(raw)) !== null) {
      out += escapeHtml(raw.slice(last, m.index));
      last = TAG_RE.lastIndex;
      var closing = !!m[1], name = m[2], arg = m[3];
      if (name === 'bullet' && !closing) { out += '\u2022 '; continue; }
      if (!closing) {
        var html = openHtml(name, arg);
        if (html === null) { out += escapeHtml(m[0]); continue; }
        stack.push({ name: name, html: html });
        out += html;
        continue;
      }
      // Closing tag: close the nearest open tag of this kind. Tags opened after
      // it are closed too and reopened right away, so a misnested source
      // ([color][italic]…[/color][/italic]) still yields valid HTML with both
      // styles alive until each one is actually closed.
      i = stack.length - 1;
      while (i >= 0 && stack[i].name !== name) i--;
      if (i < 0) { out += escapeHtml(m[0]); continue; }
      var reopen = stack.splice(i + 1);
      for (k = 0; k < reopen.length + 1; k++) out += '</span>';
      stack.pop();
      for (k = 0; k < reopen.length; k++) { out += reopen[k].html; stack.push(reopen[k]); }
    }
    out += escapeHtml(raw.slice(last));
    for (i = 0; i < stack.length; i++) out += '</span>';
    return out;
  }

  window.LibraryMarkup = { render: render, PAPER_LIMIT: PAPER_LIMIT };

  // ── page ─────────────────────────────────────────────────
  if (typeof document === 'undefined' || !document.getElementById('libList')) return;

  var lang = window.I18N_LANG === 'ru' ? 'ru' : 'en';
  var $ = function (id) { return document.getElementById(id); };
  var S = { docs: [], current: null, raw: '' };

  function esc(s) { return escapeHtml(String(s == null ? '' : s)); }
  function roleLabel(d) { return (d.role && (d.role[lang] || d.role.en)) || ''; }

  function docFromHash() {
    return new URLSearchParams(location.hash.slice(1)).get('doc');
  }

  function pickDoc(id) {
    for (var i = 0; i < S.docs.length; i++) if (S.docs[i].id === id) return S.docs[i];
    return S.docs[0] || null;
  }

  function setStatus(msg) {
    var el = $('libStatus');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function showView(which) {
    var rendered = which === 'rendered';
    $('libSheet').hidden = !rendered;
    $('libMarkup').hidden = rendered;
    $('libViewRendered').setAttribute('aria-pressed', rendered ? 'true' : 'false');
    $('libViewMarkup').setAttribute('aria-pressed', rendered ? 'false' : 'true');
  }

  function renderList() {
    var groups = {}, order = [];
    S.docs.forEach(function (d) {
      var key = roleLabel(d);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(d);
    });
    var html = '';
    order.forEach(function (key) {
      html += '<div class="lib-group"><div class="lib-group-title">' + esc(key) + '</div>';
      groups[key].forEach(function (d) {
        var cur = S.current && S.current.id === d.id;
        html += '<button type="button" class="lib-item' + (cur ? ' active' : '') + '" data-id="' + esc(d.id) + '"'
          + (cur ? ' aria-current="true"' : '') + '>'
          + '<span class="lib-item-title">' + esc(d.title) + '</span>'
          + '<span class="lib-badge">' + esc(d.forkName || d.fork) + '</span></button>';
      });
      html += '</div>';
    });
    $('libList').innerHTML = html;
  }

  function renderMeta(d) {
    var parts = [];
    var add = function (k, v) { if (v) parts.push('<span class="lib-meta-k">' + k + '</span> ' + esc(v)); };
    add('Role', roleLabel(d));
    add('Fork', d.forkName || d.fork);
    add('Received', d.received);
    add('Author', d.author);
    add('Source', d.provenance);
    $('libMeta').innerHTML = parts.join(' <span class="lib-meta-sep">\u00b7</span> ');
  }

  function loadDoc(d) {
    S.current = d;
    S.raw = '';
    renderList();
    $('libTitle').textContent = d.title;
    renderMeta(d);
    $('libSheet').innerHTML = '';
    $('libMarkup').textContent = '';
    $('libCount').textContent = '0';
    setStatus('');
    fetch('library/' + d.file).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      if (S.current !== d) return; // the reader already moved on
      S.raw = text;
      $('libSheet').innerHTML = render(text);
      $('libMarkup').textContent = text;
      var n = text.replace(/\n$/, '').length; // the file's final newline is not pasted
      $('libCount').textContent = String(n);
      $('libCount').parentNode.classList.toggle('lib-over', n > PAPER_LIMIT);
      document.title = d.title + ' \u2014 ChemDB Library';
      track('library_doc_open', { doc: d.id });
    }).catch(function () {
      if (S.current === d) setStatus('Failed to load the document');
    });
  }

  function legacyCopy() {
    try {
      showView('markup');
      var range = document.createRange();
      range.selectNodeContents($('libMarkup'));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      var ok = document.execCommand('copy');
      sel.removeAllRanges();
      return ok;
    } catch (e) { return false; }
  }

  function copyMarkup() {
    if (!S.raw) return;
    var text = S.raw.replace(/\n$/, '');
    var done = function () { setStatus('Copied'); track('library_copy_markup', { doc: S.current && S.current.id }); };
    var fail = function () { setStatus('Copy failed \u2014 select the text and press Ctrl+C'); showView('markup'); };
    var fallback = function () { if (legacyCopy()) done(); else fail(); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function selectFromHash() {
    var d = pickDoc(docFromHash());
    if (!d) { setStatus('The library is empty'); return; }
    if (S.current && S.current.id === d.id) return;
    loadDoc(d);
  }

  function loadIndex() {
    setStatus('');
    $('libRetry').hidden = true;
    fetch('library/index.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (idx) {
      S.docs = (idx && idx.documents) || [];
      renderList();
      selectFromHash();
    }).catch(function () {
      setStatus('Failed to load the library');
      $('libRetry').hidden = false;
    });
  }

  $('libLimit').textContent = String(PAPER_LIMIT);
  $('libViewRendered').addEventListener('click', function () { showView('rendered'); });
  $('libViewMarkup').addEventListener('click', function () { showView('markup'); });
  $('libCopy').addEventListener('click', copyMarkup);
  $('libRetry').addEventListener('click', loadIndex);
  $('libList').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-id]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    if (docFromHash() === id) return;
    location.hash = 'doc=' + encodeURIComponent(id);
  });
  window.addEventListener('hashchange', selectFromHash);
  loadIndex();
})();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/test_library_markup.js`
Expected: 15 × `ok`, then `ok   doctrine renders every tag (9551 chars)`, then `all passed`, exit 0.

Run: `node --check library.js`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add library/ library.js scripts/test_library_markup.js
git commit -m "feat(library): paper markup renderer + the Staff Officer doctrine, verbatim

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `library.html` + styles

**Files:**
- Create: `library.html`
- Modify: `style.css` (`.tab-btn` rule at ~line 406, `.tab-btn:hover` at ~423; append a `.lib-*` block at the end)

- [ ] **Step 1: Write `library.html`**

The Metrika snippet is copied verbatim from `index.html` lines 77–88 (same counter). The logo SVG is the `logo-normal` one from `index.html` line 102.

```html
<!--
  SPDX-License-Identifier: GPL-3.0-only
  Copyright (C) 2026 MikameO
  This file is part of Space Station Recipes.
  See LICENSE for details.
-->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Library — NanoTrasen ChemDB</title>
<meta name="description" content="In-game documents for Space Station 14: doctrines, field manuals and role memos written by players, stored verbatim as SS14 paper markup and rendered as in game. Copy the markup to issue the paper again.">
<link rel="canonical" href="https://mikameo.github.io/space-station-recipes/library.html">
<meta property="og:title" content="ChemDB Library — SS14 in-game documents">
<meta property="og:description" content="Player-written doctrines and role memos for Space Station 14, stored verbatim as paper markup. Read them as in game, copy them back onto paper.">
<meta property="og:image" content="https://mikameo.github.io/space-station-recipes/og-image.png">
<meta property="og:url" content="https://mikameo.github.io/space-station-recipes/library.html">
<meta property="og:type" content="website">
<meta property="og:site_name" content="NanoTrasen ChemDB">
<meta name="theme-color" content="#22c55e">
<link rel="icon" type="image/svg+xml" href="favicon.svg?v=2">
<link rel="icon" type="image/x-icon" href="favicon.ico?v=2" sizes="16x16 32x32 48x48">
<link rel="apple-touch-icon" href="apple-touch-icon.png?v=2">
<link rel="manifest" href="manifest.json">
<link rel="stylesheet" href="style.css?v=60">
<!-- Yandex.Metrika counter (same counter as index.html) -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=108585248', 'ym');

    ym(108585248, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/108585248" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->
</head>
<body class="lib-body">

<header>
  <div class="header-left">
    <h1><a class="lib-home" href="./" title="Back to ChemDB"><svg class="header-icon" viewBox="0 0 144 148" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><filter id="bg"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#bg)"><rect x="48" y="0" width="48" height="50" stroke="#39ff85" stroke-width="6" rx="2"/><path d="M48,50 L20,110 Q12,130 30,140 L114,140 Q132,130 124,110 L96,50" stroke="#39ff85" stroke-width="6" stroke-linejoin="round"/><path d="M36,100 Q30,120 38,132 L106,132 Q114,120 108,100 Z" fill="#39ff85" opacity="0.3"/><circle cx="60" cy="108" r="4" stroke="#39ff85" stroke-width="2.5" opacity="0.7"/><circle cx="85" cy="116" r="5" stroke="#39ff85" stroke-width="2.5" opacity="0.6"/></g></svg>NanoTrasen <span class="accent">ChemDB</span></a></h1>
    <span class="header-meta lib-page-name">Library</span>
  </div>
  <div class="header-right lib-header-right">
    <button class="share-btn lang-toggle" id="langToggle" title="Переключить на русский" aria-label="Switch language / Переключить язык">RU</button>
    <a class="feedback-btn" href="https://github.com/MikameO/space-station-recipes/issues" target="_blank" rel="noopener noreferrer" title="Feedback &amp; Bug Reports">
      <svg class="feedback-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3h14v10H7l-4 4V3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7.5" cy="8" r="1" fill="currentColor"/><circle cx="10" cy="8" r="1" fill="currentColor"/><circle cx="12.5" cy="8" r="1" fill="currentColor"/></svg>
    </a>
  </div>
</header>

<p class="lib-intro">In-game documents: doctrines, field manuals, role memos. Texts are stored verbatim.</p>

<main class="lib-layout">
  <nav class="lib-list" id="libList" aria-label="Documents"></nav>
  <article class="lib-doc">
    <h2 id="libTitle" class="lib-title"></h2>
    <p id="libMeta" class="lib-meta"></p>
    <div class="lib-toolbar">
      <div class="lib-views" role="group" aria-label="View">
        <button type="button" class="btn-small" id="libViewRendered" aria-pressed="true">Rendered</button>
        <button type="button" class="btn-small" id="libViewMarkup" aria-pressed="false">Markup</button>
      </div>
      <div class="lib-count"><span id="libCount">0</span> / <span id="libLimit">10000</span> <span>characters</span></div>
      <button type="button" class="btn-small" id="libCopy">Copy markup</button>
    </div>
    <div id="libStatus" class="lib-status" aria-live="polite" hidden></div>
    <button type="button" class="btn-small lib-retry" id="libRetry" hidden>Retry</button>
    <div id="libSheet" class="lib-sheet"></div>
    <pre id="libMarkup" class="lib-markup" hidden></pre>
  </article>
</main>

<footer class="lib-footer">&copy; 2025 MikameO &middot; Not affiliated with or endorsed by the SS14 development team &middot; <a href="https://github.com/MikameO/space-station-recipes" target="_blank" rel="noopener noreferrer">GitHub</a> &middot; <a href="https://github.com/MikameO/space-station-recipes/issues" target="_blank" rel="noopener noreferrer">Feedback</a></footer>

<script src="i18n.js?v=30"></script>
<script src="library.js?v=1" defer></script>
</body>
</html>
```

- [ ] **Step 2: Share the tab base style with the new anchor**

In `style.css`, change the two selectors:

```css
.tab-btn, .tab-link {
  padding: 11px 20px;
```
(the rest of that rule unchanged), and

```css
.tab-btn:hover, .tab-link:hover { color: var(--text-sub); }
```

- [ ] **Step 3: Append the library block at the end of `style.css`**

```css
/* ═══════════════════════════════════════════════════════
   Series G: document library (library.html)
   The app shell is a fixed-height flex column with its own scrolling
   panels; the library is an ordinary scrolling page, hence the body/main
   overrides. .lib-sheet is the one light surface on the site on purpose —
   the game draws paper light, and the documents' colours were picked for it.
   ═══════════════════════════════════════════════════════ */
.tab-link { text-decoration: none; display: inline-block; }

body.lib-body { height: auto; min-height: 100vh; overflow: auto; }
main.lib-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 20px;
  padding: 20px 24px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  overflow: visible;
  flex: 1 0 auto;
}
.lib-home { color: inherit; text-decoration: none; display: inline-flex; align-items: center; }
.lib-home:hover .accent { animation-duration: 1.5s; }
.lib-page-name { text-transform: uppercase; }
.lib-header-right { flex: 0 0 auto; }
.lib-intro {
  margin: 0;
  padding: 10px 24px;
  font-size: 0.8rem;
  color: var(--text-sub);
  background: var(--hull-plate);
  border-bottom: 1px solid var(--border-subtle);
}

.lib-list { display: flex; flex-direction: column; gap: 16px; align-self: start; position: sticky; top: 12px; }
.lib-group-title {
  font-family: 'Oxanium', sans-serif;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-ghost);
  margin-bottom: 6px;
}
.lib-item {
  display: block;
  width: 100%;
  text-align: left;
  background: var(--panel);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 10px 12px;
  color: var(--text-main);
  cursor: pointer;
  font: inherit;
  transition: border-color 0.2s, background 0.2s;
}
.lib-item + .lib-item { margin-top: 8px; }
.lib-item:hover { background: var(--panel-hover); border-color: var(--border-active); }
.lib-item.active { border-color: var(--phosphor); color: var(--text-bright); box-shadow: 0 0 var(--glow-spread) var(--phosphor-glow); }
.lib-item-title { display: block; font-size: 0.86rem; line-height: 1.3; }
.lib-badge {
  display: inline-block;
  margin-top: 6px;
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--cyan);
  background: var(--cyan-dim);
  border-radius: 3px;
  padding: 2px 6px;
}

.lib-doc { min-width: 0; }
.lib-title { margin: 0 0 6px; font-family: 'Oxanium', sans-serif; font-size: 1.15rem; color: var(--text-bright); }
.lib-meta { margin: 0 0 12px; font-size: 0.78rem; color: var(--text-sub); line-height: 1.7; }
.lib-meta-k { color: var(--text-ghost); text-transform: uppercase; font-size: 0.64rem; letter-spacing: 0.08em; }
.lib-meta-sep { color: var(--border-active); }
.lib-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.lib-views { display: flex; gap: 4px; }
.lib-views .btn-small[aria-pressed="true"] { border-color: var(--phosphor); color: var(--phosphor); }
.lib-count { font-size: 0.78rem; color: var(--text-sub); margin-left: auto; }
.lib-count.lib-over { color: var(--red-alert); }
.lib-status { font-size: 0.8rem; color: var(--amber); margin-bottom: 10px; }
.lib-retry { margin-bottom: 10px; }
.lib-status[hidden], .lib-retry[hidden], .lib-sheet[hidden], .lib-markup[hidden] { display: none; }

.lib-sheet {
  background: #efe9db;
  color: #1e1e1e;
  font-family: 'Noto Sans', 'Segoe UI', Arial, sans-serif;
  font-size: 15px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 28px 32px;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.5);
  max-width: 760px;
}
.lib-sheet .lib-b { font-weight: 700; }
.lib-sheet .lib-i { font-style: italic; }
.lib-sheet .lib-bi { font-weight: 700; font-style: italic; }
.lib-sheet .lib-mono { font-family: 'Share Tech Mono', 'Consolas', monospace; }
.lib-sheet .lib-h1 { font-size: 1.6em; font-weight: 700; }
.lib-sheet .lib-h2 { font-size: 1.35em; font-weight: 700; }
.lib-sheet .lib-h3 { font-size: 1.15em; font-weight: 700; }

.lib-markup {
  margin: 0;
  background: var(--panel);
  color: var(--text-main);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 16px;
  font-family: 'Share Tech Mono', 'Consolas', monospace;
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-width: 760px;
}

.lib-footer {
  padding: 16px 24px;
  font-size: 0.66rem;
  color: var(--text-ghost);
  border-top: 1px solid var(--border-subtle);
  text-align: center;
}
.lib-footer a { color: var(--text-sub); }

@media (max-width: 700px) {
  main.lib-layout { grid-template-columns: 1fr; padding: 14px; gap: 14px; }
  .lib-list { position: static; }
  .lib-sheet { padding: 18px 14px; font-size: 14px; }
  .lib-count { margin-left: 0; }
}
```

- [ ] **Step 4: Smoke-test in the preview**

Start the `ss14-chem` preview (`.claude/launch.json`, bound to 127.0.0.1) and open `library.html`. Check with `read_page`/`javascript_tool`:

```js
({
  items: document.querySelectorAll('.lib-item').length,             // 1
  title: document.getElementById('libTitle').textContent,          // Доктрина …
  count: document.getElementById('libCount').textContent,          // 9550
  spans: document.querySelectorAll('#libSheet span').length,       // > 60
  sheetVisible: getComputedStyle(document.getElementById('libSheet')).display,   // block
  markupHidden: getComputedStyle(document.getElementById('libMarkup')).display,  // none
  scrollW: document.documentElement.scrollWidth <= window.innerWidth
})
```

Expected: one item, the doctrine title, `9550`, dozens of spans, sheet `block`, markup `none`, no horizontal overflow. Console: no errors (Metrika may log a blocked request in the sandbox — that is not ours).

---

### Task 4: Russian chrome via `i18n.js`

**Files:**
- Modify: `i18n.js` (dictionary `T`, after `'Fork Diff': 'Сравнение форков',` at ~line 114)

- [ ] **Step 1: Add the keys**

Insert after the `'Fork Diff'` line (the `'Source'` key already exists at line 94 and is reused):

```js
    'Library': 'Библиотека',
    // Document library (Series G, library.html)
    'In-game documents: doctrines, field manuals, role memos. Texts are stored verbatim.': 'Внутриигровые документы: уставы, наставления, памятки ролей. Тексты хранятся дословно.',
    'Documents': 'Документы',
    'View': 'Вид',
    'Rendered': 'Как в игре',
    'Markup': 'Разметка',
    'Copy markup': 'Скопировать разметку',
    'Copied': 'Скопировано',
    'Copy failed — select the text and press Ctrl+C': 'Не скопировалось: выделите текст и нажмите Ctrl+C',
    'characters': 'символов',
    'Role': 'Роль',
    'Fork': 'Форк',
    'Received': 'Получен',
    'Author': 'Автор',
    'Failed to load the library': 'Библиотека не загрузилась',
    'Failed to load the document': 'Документ не загрузился',
    'The library is empty': 'Библиотека пуста',
    'Retry': 'Повторить',
    'Back to ChemDB': 'Назад в ChemDB',
```

- [ ] **Step 2: Verify in the preview**

Open `library.html?lang=ru`. Expected: intro line, view buttons, `символов`, meta labels (`РОЛЬ`, `ФОРК`, `ПОЛУЧЕН`, `АВТОР`, `ИСТОЧНИК`) and the group title `Офицер Штаба` are Russian; the sheet text is unchanged; `document.documentElement.lang === 'ru'`. Then `library.html?lang=en` restores English. `node --check i18n.js` passes.

- [ ] **Step 3: Commit**

```bash
git add library.html style.css i18n.js
git commit -m "feat(library): library.html — the paper sheet, the list by role, markup copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Wiring — SPA link, service worker, deploy, sitemap, notices, goals

**Files:**
- Modify: `index.html:75` (`style.css?v=59`), `:778` (`i18n.js?v=29`), `:196-197` (tab bar)
- Modify: `sw.js:6-21`
- Modify: `.github/workflows/deploy.yml` (Collect + Verify steps)
- Modify: `sitemap.xml`
- Modify: `NOTICES` (append §3)
- Modify: `scripts/create_metrika_goals.py` (after `ordnance_plan_open`)

- [ ] **Step 1: `index.html`** — bump `style.css?v=59` → `?v=60`, `i18n.js?v=29` → `?v=30`, and insert after the Fork Diff button (line 196):

```html
      <a class="tab-link" href="library.html">Library</a>
```

- [ ] **Step 2: `sw.js`** — `const CACHE = 'chemdb-v81';` and in `PRECACHE`: `'./style.css?v=60'`, `'./i18n.js?v=30'`, plus three new lines after `'./ordnance.js?v=47',`:

```js
  './library.html',
  './library.js?v=1',
  './library/index.json',
```

- [ ] **Step 3: `deploy.yml`** — Collect step:

```yaml
          cp index.html library.html app.js i18n.js tutorial.js maps.js ordnance.js library.js style.css data.json favicon.ico _site/
          cp sw.js manifest.json robots.txt sitemap.xml _site/
          cp favicon.svg favicon-192.png favicon-512.png apple-touch-icon.png _site/
          cp -r sprites _site/sprites
          cp -r maps _site/maps
          cp -r ordnance _site/ordnance
          cp -r library _site/library
          [ -f og-image.png ] && cp og-image.png _site/ || true
```

Verify step body (replaces the Python inside `python - <<'PY' … PY`):

```python
          import re, sys, pathlib
          pages = ['index.html', 'library.html']
          missing = []
          checked = 0
          for page in pages:
              html = pathlib.Path(page).read_text(encoding='utf-8')
              refs = set(re.findall(r'(?:src|href)="([^"]+)"', html))
              checked += len(refs)
              for ref in refs:
                  if re.match(r'(?:https?:)?//|data:|mailto:|#', ref):
                      continue
                  path = ref.split('?')[0].split('#')[0].lstrip('./')
                  if not path:
                      continue
                  if not (pathlib.Path('_site') / path).exists():
                      missing.append(page + ' -> ' + ref)
          if missing:
              print('Referenced by a page but absent from _site:')
              for m in sorted(set(missing)):
                  print('  ' + m)
              sys.exit(1)
          print(f'{checked} references checked across {len(pages)} pages, all present')
```

Also extend the comment above it: `(sw.js/manifest in 2c062f6, i18n.js in 3408bcd, ordnance.js here)` → add `; library.html joined the scan in Series G`.

- [ ] **Step 4: `sitemap.xml`** — add before `</urlset>`:

```xml
  <url>
    <loc>https://mikameo.github.io/space-station-recipes/library.html</loc>
    <lastmod>2026-09-11</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
```

- [ ] **Step 5: `NOTICES`** — append after §2 (Google Fonts):

```
3. Community-authored in-game documents (library/)
───────────────────────────────────────────────────
   The texts under library/ — doctrines, field manuals, role memos — were
   written by Space Station 14 players and handed out in-game. They are
   reproduced verbatim as an archive; the attribution for each one is
   recorded in library/index.json. They are not code and are not covered
   by this project's GPL-3.0 license. An author who wants a text changed
   or removed can say so at
   https://github.com/MikameO/space-station-recipes/issues
```

- [ ] **Step 6: Goal registry** — in `scripts/create_metrika_goals.py` after the `ordnance_plan_open` tuple:

```python
    # Series G — document library (library.html)
    ("library_doc_open",     "Библиотека: открыт документ"),
    ("library_copy_markup",  "Библиотека: скопирована разметка"),
```

Do **not** run the script (needs the Metrika token; user go-ahead required).

- [ ] **Step 7: Local deploy rehearsal**

Simulate the Collect + Verify steps into a temp dir:

```bash
rm -rf /tmp/_site_rehearsal && mkdir -p /tmp/_site_rehearsal && cd "/d/Space Station Recipes" && \
cp index.html library.html app.js i18n.js tutorial.js maps.js ordnance.js library.js style.css data.json favicon.ico /tmp/_site_rehearsal/ && \
cp sw.js manifest.json robots.txt sitemap.xml favicon.svg favicon-192.png favicon-512.png apple-touch-icon.png og-image.png /tmp/_site_rehearsal/ && \
cp -r sprites maps ordnance library /tmp/_site_rehearsal/ && \
python - <<'PY'
import re, sys, pathlib
site = pathlib.Path('/tmp/_site_rehearsal')
pages = ['index.html', 'library.html']; missing = []; checked = 0
for page in pages:
    html = pathlib.Path(page).read_text(encoding='utf-8')
    refs = set(re.findall(r'(?:src|href)="([^"]+)"', html)); checked += len(refs)
    for ref in refs:
        if re.match(r'(?:https?:)?//|data:|mailto:|#', ref): continue
        path = ref.split('?')[0].split('#')[0].lstrip('./')
        if path and not (site / path).exists(): missing.append(page + ' -> ' + ref)
print('missing:', missing); print(checked, 'refs checked'); sys.exit(1 if missing else 0)
PY
```

Expected: `missing: []`, exit 0. Then `node --check sw.js`, and confirm `curl -sI http://127.0.0.1:<port>/library/index.json` from the preview returns 200.

- [ ] **Step 8: Preview re-check of the SPA** — reload `index.html?nocache=1`: the tab bar shows `Library` after Fork Diff, styled like a tab; clicking it navigates to `library.html`; the SPA console is clean.

---

### Task 6: Docs, ROADMAP, final verification, commit, push

**Files:**
- Modify: `README.md` (Features table), `CHANGELOG.md` (top), `ROADMAP.md` (new Series G before Backlog; Backlog note; revision row)

- [ ] **Step 1: README** — add after the Ordnance row:

```markdown
| **Library** | In-game documents | Player-written doctrines, field manuals and role memos stored verbatim as SS14 paper markup — read them as in game, copy the markup to issue the paper again. Separate page: [library.html](https://mikameo.github.io/space-station-recipes/library.html) |
```

- [ ] **Step 2: CHANGELOG** — insert under the intro paragraph, above `## Series O`:

```markdown
## Series G — 2026-09-11 (Document library: new page, new data folder)

**New page:** `library.html` + `library.js` — in-game papers written by players
(doctrines, field manuals, role memos), stored verbatim as SS14 paper markup
under `library/` and rendered the way the game shows them (colour, bold,
italic, headings, bullets, mono). A Markup view with a copy button and a
`N / 10000` counter (`PaperComponent.ContentSize`, same in vanilla and RMC-14)
lets a player issue the paper again in-game.

**New data file:** `library/index.json` (schema 1) — one entry per document:
`id`, `title`, `role {en, ru}`, `fork`, `forkName`, `lang`, `kind`, `file`,
`author`, `provenance`, `received`, `notes`. First document:
`rucm-staff-officer-doctrine` (Russian Marine Corps, Staff Officer doctrine,
9550 chars). `data.json` schema is unchanged.

Design: `docs/design/2026-09-11-document-library.md`.
```

- [ ] **Step 3: ROADMAP** — insert before `## Backlog (кандидаты, не в работе)`:

```markdown
## Серия G — «Библиотека документов» (внутриигровые уставы и памятки ролей, страница library.html)

Спека: [docs/design/2026-09-11-document-library.md](docs/design/2026-09-11-document-library.md) · план: [docs/superpowers/plans/2026-09-11-document-library.md](docs/superpowers/plans/2026-09-11-document-library.md). **Спрос:** запрос пользователя 2026-09-10 (доктрина ОШ, выданная командующим в раунде RuCM: «добавить на платформу, просто чтобы было; есть похожие документы для медиков и пилотов»), O7 role-guides из Backlog, отложенный вопрос о тексте наставления из дизайна Ordnance.

### G1. Страница library.html, рендерер разметки бумаги, доктрина ОШ `[x]` (2026-09-11) — HAE 3h (frontend) + 0.5h (ops)
**Шаги:**
1. `library/rucm-staff-officer-doctrine.paper.txt` (дословно, UTF-8/LF) + `library/index.json` (schema 1: id, title, role{en,ru}, fork, forkName, lang, kind, file, author, provenance, received, notes).
2. `library.js`: рендерер тегов color/bold/italic/bolditalic/head/bullet/mono/font со стеком и терпимым закрытием (перепутанный порядок даёт валидный HTML); Node-тест `scripts/test_library_markup.js` (15 случаев + прогон реального документа).
3. `library.html` + блок `.lib-*` в `style.css`: лист как бумага (светлый), список по ролям с бейджем форка, Rendered/Markup, счётчик N/10000, копирование с фолбэком, deep link `#doc=`.
4. `i18n.js`: 19 ключей шапки; `index.html`: ссылка `.tab-link` в таб-баре (не `.tab-btn`: `setupTabs` читает `dataset.tab`), bump `?v=`.
5. `sw.js` PRECACHE + CACHE v81; `deploy.yml` cp-list + проверка ссылок обеих страниц; `sitemap.xml`; `NOTICES` §3; реестр целей Метрики (`library_doc_open`, `library_copy_markup`; скрипт не запускался).
6. README/CHANGELOG; верификация в превью; коммит; пуш; curl прод.
**DoD (спека §Верификация):** лист рендерится с цветами и заголовками, строка с перепутанными тегами курсивная и серая, `#doc=` работает, счётчик 9550 / 10000, копирование, RU/EN, 375 px без горизонтального overflow, консоль чистая, локальный прогон cp-list «all present»; после пуша curl `library.html`, `library/index.json`, `library/rucm-staff-officer-doctrine.paper.txt` → 200.

### G2. Документы медиков и пилотов `[ ]` — HAE 1h (curation) — **зависит от G1**
Файлы + записи манифеста, когда пользователь принесёт тексты. Кандидат: «Наставление оружейного техника» — закрывает отложенный вопрос из [docs/design/2026-09-10-ordnance-calculator.md](docs/design/2026-09-10-ordnance-calculator.md) §Решения по scope.

### G3. Оглавление, поиск по документам, per-doc HTML для Discord-unfurl и SEO `[ ]` — HAE 4h (frontend + script) — **зависит от G2**, при ≥ 5 документах
Per-doc страницы печёт Python-скрипт по образцу экстракторов; манифест остаётся источником истины.

```

Backlog line `- **Role-guides** (O7) …` becomes:

```markdown
- **Role-guides** (O7) сверх пресетов: страницы «как играть химика/ботаника». *Частично: серия G даёт архив внутриигровых документов ролей (library.html); авторские страницы-гайды остаются здесь.*
```

Revision row (append to the table):

```markdown
| 2026-09-11 | 2.3 | Серия G («Библиотека документов»): G1 закрыт — страница `library.html` + рендерер разметки бумаги SS14 (Node-тест) + доктрина ОШ RuCM дословно (9550 / 10000). Спека docs/design/2026-09-11-document-library.md. Ссылка «Library» в таб-баре SPA; deploy-проверка ссылок теперь сканирует обе страницы. Отложенный вопрос о тексте наставления Ordnance получил место (G2) |
```

- [ ] **Step 4: Final verification pass (spec §Верификация)**

In the preview: `library.html#doc=rucm-staff-officer-doctrine` and `#doc=nope` (falls back to the first doc); Markup view + Copy (status `Copied`, or the selection fallback); `resize_window` mobile → `scrollWidth <= innerWidth`, one column; screenshot of the sheet; `read_console_messages` clean. Run `node scripts/test_library_markup.js` and `node --check library.js i18n.js sw.js` once more.

- [ ] **Step 5: Commit and push**

```bash
git add index.html sw.js .github/workflows/deploy.yml sitemap.xml NOTICES scripts/create_metrika_goals.py README.md CHANGELOG.md ROADMAP.md docs/superpowers/plans/2026-09-11-document-library.md
git commit -m "feat(library): wire the page into the app, the worker and the deploy; series G in the roadmap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 6: Production check after the Pages run**

```bash
for p in library.html library/index.json library/rucm-staff-officer-doctrine.paper.txt library.js; do
  printf '%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://mikameo.github.io/space-station-recipes/$p"; done
```

Expected: four `200`s. Then open the production `library.html` in the browser once and confirm the sheet renders.

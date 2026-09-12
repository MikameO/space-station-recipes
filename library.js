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
      if (name === 'bullet' && !closing) { out += '• '; continue; }
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

  // library/ files ride on this script's own ?v= (see ordnance.js), so a bump
  // in library.html refreshes the index and documents the new code reads.
  var ASSET_V = document.currentScript ? new URL(document.currentScript.src).searchParams.get('v') : null;
  function versioned(p) { return ASSET_V ? p + '?v=' + ASSET_V : p; }

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
    $('libMeta').innerHTML = parts.join(' <span class="lib-meta-sep">·</span> ');
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
    fetch(versioned('library/' + d.file)).then(function (r) {
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
      document.title = d.title + ' — ChemDB Library';
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
    var fail = function () { setStatus('Copy failed — select the text and press Ctrl+C'); showView('markup'); };
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
    fetch(versioned('library/index.json')).then(function (r) {
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

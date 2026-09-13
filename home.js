// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Series H: the "Sections" overlay — a map of the platform with badges on
// sections that changed since the visitor's last look. Reads sections.json,
// keeps the visit counter (window.ChemDBVisits) and decides when to pop up.
// Design: docs/design/2026-09-12-home-menu-and-feedback.md.
//
// window.ChemDBHomeLogic is pure and is what scripts/test_home_logic.js drives
// under Node; everything below the "page" line needs a DOM.
(function () {
  'use strict';

  var YM_COUNTER_ID = 108585248;
  var VISIT_GAP_MS = 6 * 60 * 60 * 1000;   // a new visit starts after 6 quiet hours
  var BADGE_TTL_DAYS = 60;                 // older changes are history, not news
  var DAY_MS = 24 * 60 * 60 * 1000;
  var KEY_VISITS = 'chemdb-visits';
  var KEY_STATE = 'chemdb-home';
  var ISSUES_CHOOSE_URL = 'https://github.com/MikameO/space-station-recipes/issues/new/choose';

  function track(goal, params) {
    try {
      if (typeof ym === 'function') ym(YM_COUNTER_ID, 'reachGoal', goal, params);
    } catch (e) { /* analytics must never break the page */ }
  }

  // ── pure logic ───────────────────────────────────────────
  function parseDate(s) {
    var t = typeof s === 'string' ? Date.parse(s) : NaN;
    return isNaN(t) ? null : t;
  }

  // prev: stored {n, first, last, prevLast, touched} or anything corrupt.
  // `last` is when the current visit started, `touched` the latest page load.
  function bumpVisits(prev, now) {
    var valid = prev && typeof prev === 'object' && typeof prev.n === 'number' &&
                typeof prev.first === 'number' && typeof prev.last === 'number';
    if (!valid) {
      return { visits: { n: 1, first: now, last: now, prevLast: null, touched: now }, isNewVisit: true };
    }
    var touched = typeof prev.touched === 'number' ? prev.touched : prev.last;
    if (now - touched >= VISIT_GAP_MS) {
      return { visits: { n: prev.n + 1, first: prev.first, last: now, prevLast: prev.last, touched: now }, isNewVisit: true };
    }
    return { visits: { n: prev.n, first: prev.first, last: prev.last, prevLast: prev.prevLast || null, touched: now }, isNewVisit: false };
  }

  function markAllSeen(sections, state) {
    var seen = {};
    sections.forEach(function (s) { if (s.updated) seen[s.id] = s.updated; });
    var next = {};
    for (var k in state) if (Object.prototype.hasOwnProperty.call(state, k)) next[k] = state[k];
    next.seen = seen;
    return next;
  }

  // 'new' | 'updated' | null for one section.
  function badgeFor(section, state, visits, now) {
    var added = parseDate(section.added), updated = parseDate(section.updated);
    if (added === null && updated === null) return null;       // undated = action card
    var seen = (state && state.seen) || {};
    var seenStr = Object.prototype.hasOwnProperty.call(seen, section.id) ? seen[section.id] : undefined;
    var ttl = BADGE_TTL_DAYS * DAY_MS;
    if (added !== null && seenStr === undefined && visits && added > visits.first && now - added <= ttl) return 'new';
    if (updated !== null && now - updated <= ttl) {
      var seenT = seenStr === undefined ? null : parseDate(seenStr);
      if (seenT === null || updated > seenT) return 'updated';
    }
    return null;
  }

  function computeBadges(sections, state, visits, now) {
    var byId = {}, count = 0;
    sections.forEach(function (s) {
      var b = badgeFor(s, state, visits, now);
      if (b) { byId[s.id] = b; count++; }
    });
    return { byId: byId, count: count };
  }

  function sameDay(a, b) {
    var da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  }

  // ctx: {storageOk, companion, deepLink, tutorialActive, userBusy}. Rules: design §Авто-показ.
  // "Show when sections update" switched off silences the intro too.
  function decideAutoShow(ctx, state, visits, badgeCount, now) {
    if (!ctx.storageOk || ctx.companion || ctx.deepLink || ctx.tutorialActive || ctx.userBusy) return { mode: null, reason: 'blocked' };
    if (!visits || visits.n <= 1) return { mode: null, reason: 'first-visit' };
    if (state.autoShow === false) return { mode: null, reason: 'switched-off' };
    if (!state.introShown) return { mode: 'intro', reason: 'second-visit' };
    if (badgeCount > 0 && !(state.lastAutoShown && sameDay(state.lastAutoShown, now))) {
      return { mode: 'updates', reason: 'unseen' };
    }
    return { mode: null, reason: 'nothing-new' };
  }

  // ── wording ──────────────────────────────────────────────
  var RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var RU_MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function plural(n, one, few, many) {
    n = Math.abs(n) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }
  // A visit is a moment: name the visitor's own calendar day, not UTC's.
  function longDate(lang, t) {
    var d = new Date(t);
    return d.getDate() + ' ' + (lang === 'ru' ? RU_MONTHS : EN_MONTHS)[d.getMonth()];
  }
  // A manifest date ('2026-09-10') parses as UTC midnight, so read it back in UTC.
  function shortDate(lang, t) {
    var d = new Date(t);
    return d.getUTCDate() + ' ' + (lang === 'ru' ? RU_MONTHS_SHORT[d.getUTCMonth()] : EN_MONTHS[d.getUTCMonth()].slice(0, 3));
  }

  // "2 sections updated since your visit on 5 September" — or "recently" when
  // the previous visit is unknown or older than the badge window.
  function headline(lang, count, prevVisit, now) {
    var recent = typeof prevVisit === 'number' && now - prevVisit <= BADGE_TTL_DAYS * DAY_MS;
    if (lang === 'ru') {
      var noun = plural(count, 'раздел', 'раздела', 'разделов');
      var verb = plural(count, 'обновился', 'обновились', 'обновились');
      return count + ' ' + noun + ' ' + verb + (recent ? ' с вашего визита ' + longDate('ru', prevVisit) : ' за последнее время');
    }
    return count + ' section' + (count === 1 ? '' : 's') + ' updated' + (recent ? ' since your visit on ' + longDate('en', prevVisit) : ' recently');
  }

  function badgeLine(lang, section, badge) {
    if (badge === 'new') {
      return (lang === 'ru' ? 'Новый раздел' : 'New section') + ' · ' + shortDate(lang, parseDate(section.added));
    }
    var what = section.whatsNew ? (section.whatsNew[lang] || section.whatsNew.en || '') : '';
    return (lang === 'ru' ? 'Новое: ' : 'New: ') + what + ' · ' + shortDate(lang, parseDate(section.updated));
  }

  window.ChemDBHomeLogic = {
    bumpVisits: bumpVisits, markAllSeen: markAllSeen, computeBadges: computeBadges,
    decideAutoShow: decideAutoShow, headline: headline, badgeLine: badgeLine,
    VISIT_GAP_MS: VISIT_GAP_MS, BADGE_TTL_DAYS: BADGE_TTL_DAYS,
  };

  // ── page ─────────────────────────────────────────────────
  if (typeof document === 'undefined') return;

  // sections.json rides on this script's own ?v= (see ordnance.js), so bumping
  // home.js refreshes the manifest too. currentScript is only set while this runs.
  var ASSET_V = document.currentScript ? new URL(document.currentScript.src).searchParams.get('v') : null;
  function versioned(p) { return ASSET_V ? p + '?v=' + ASSET_V : p; }
  // A link someone followed (#r=…, #doc=…) is judged as the page arrived: the
  // library writes #doc= on its own later, and that must not count.
  var arrivedWithHash = location.hash.replace(/^#/, '').length > 0;
  // Someone who is already typing or clicking keeps the page: an auto-open
  // would take their focus and swallow the next key.
  var userActed = false;
  ['keydown', 'pointerdown'].forEach(function (type) {
    document.addEventListener(type, function () { userActed = true; }, { capture: true, once: true });
  });

  var lang = window.I18N_LANG === 'ru' ? 'ru' : 'en';
  var L10N = {
    en: { title: 'What is on the platform',
          intro: 'Here is what the platform has. A card lights up when its section gets something new.',
          toggle: 'Show when sections update', close: 'Close', here: 'You are here',
          btnLabel: function (n) { return n ? 'Sections — ' + n + ' updated' : 'Sections'; } },
    ru: { title: 'Что есть на платформе',
          intro: 'Вот что есть на платформе. Карточка подсвечивается, когда в разделе появляется новое.',
          toggle: 'Показывать при обновлениях', close: 'Закрыть', here: 'Вы здесь',
          btnLabel: function (n) { return n ? 'Разделы — обновлений: ' + n : 'Разделы'; } },
  }[lang];

  // localStorage with a write probe: in private mode store.ok is false and
  // every auto-popup stays off (design §Состояние посетителя).
  var store = (function () {
    var ok = false;
    try { localStorage.setItem('chemdb-probe', '1'); localStorage.removeItem('chemdb-probe'); ok = true; } catch (e) { ok = false; }
    return {
      ok: ok,
      get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    };
  })();

  var now = Date.now();
  var visits = bumpVisits(store.get(KEY_VISITS), now).visits;
  store.set(KEY_VISITS, visits);
  window.ChemDBVisits = visits;                   // feedback.js reads this

  var state = store.get(KEY_STATE);
  if (!state || typeof state !== 'object') state = { seen: {}, autoShow: true, lastAutoShown: null, introShown: false };
  if (!state.seen || typeof state.seen !== 'object') state.seen = {};

  var onIndex = !!document.getElementById('tab-reagents');
  var sections = [];
  var badges = { byId: {}, count: 0 };
  var root = null, lastFocus = null;

  function saveState() { store.set(KEY_STATE, state); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function tx(obj) { return obj ? (obj[lang] || obj.en || '') : ''; }
  function pageName() { return location.pathname.replace(/^.*\//, '') || 'index.html'; }
  function targetOf(s) {
    var t = String(s.target || ''), i = t.indexOf(':');
    return { kind: t.slice(0, i), arg: t.slice(i + 1) };
  }
  function isTyping() {
    var a = document.activeElement;
    return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
  }

  function updateButton() {
    var btn = document.getElementById('homeBtn'), dot = document.getElementById('homeDot');
    if (!btn) return;
    btn.setAttribute('aria-label', L10N.btnLabel(badges.count));
    if (dot) dot.hidden = badges.count === 0;       // .home-dot-btn[hidden] carries display:none !important
  }

  // ── overlay ──────────────────────────────────────────────
  function cardHtml(s) {
    var badge = badges.byId[s.id] || null;
    var t = targetOf(s);
    var here = t.kind === 'page' && pageName() === t.arg;
    var cls = 'home-card' + (s.weight === 'hero' ? ' is-hero' : '') + (badge ? ' is-' + badge : '') +
              (t.kind === 'action' ? ' is-action' : '') + (t.kind === 'mode' ? ' is-antag' : '') + (here ? ' is-here' : '');
    var chips = (s.inside || []).slice(0, s.weight === 'hero' ? undefined : 3)
      .map(function (c) { return '<span class="home-chip">' + esc(tx(c)) + '</span>'; }).join('');
    var line = badge ? badgeLine(lang, s, badge) : '';
    var label = tx(s.title) + (line ? ' — ' + line : '. ' + tx(s.desc));
    var tag = t.kind === 'page' ? 'a' : 'button';
    var attrs = t.kind === 'page' ? ' href="' + esc(t.arg) + '"' : ' type="button"';
    return '<' + tag + attrs + ' class="' + cls + '" data-id="' + esc(s.id) + '" aria-label="' + esc(label) + '">' +
      (s.shot ? '<img class="home-shot" src="' + esc(s.shot) + '" alt="" loading="lazy" decoding="async">' : '') +
      '<span class="home-scrim" aria-hidden="true"></span><span class="home-dot" aria-hidden="true"></span>' +
      '<span class="home-body">' +
        '<span class="home-title"><span class="home-icon" aria-hidden="true">' + esc(s.icon || '') + '</span>' + esc(tx(s.title)) +
          (here ? ' <span class="home-here">' + esc(L10N.here) + '</span>' : '') + '</span>' +
        '<span class="home-desc">' + esc(tx(s.desc)) + '</span>' +
        (chips ? '<span class="home-chips">' + chips + '</span>' : '') +
        (line ? '<span class="home-new">' + esc(line) + '</span>' : '') +
      '</span></' + tag + '>';
  }

  function buildOverlay() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'home-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'homeTitle');
    document.body.appendChild(root);
    root.addEventListener('click', function (e) {
      if (e.target === root || e.target.closest('.home-close')) { close(); return; }
      var card = e.target.closest('.home-card');
      if (card) { e.preventDefault(); onCard(card.getAttribute('data-id')); }
    });
    root.addEventListener('change', function (e) {
      if (e.target.id !== 'homeAutoShow') return;
      state.autoShow = !!e.target.checked;
      saveState();
      if (!state.autoShow) track('home_autoshow_off');
    });
    root.addEventListener('keydown', function (e) {
      // Stop Escape here: app.js closes the reagent panel on a document-level Escape.
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = root.querySelectorAll('button, a[href], input');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return root;
  }

  function render(mode) {
    var heroes = sections.filter(function (s) { return s.weight === 'hero'; });
    var rest = sections.filter(function (s) { return s.weight !== 'hero'; });
    var sub = mode === 'intro' ? L10N.intro : (badges.count ? headline(lang, badges.count, visits.prevLast, now) : '');
    root.innerHTML =
      '<div class="home-panel">' +
        '<div class="home-head"><div><div class="home-title-main" id="homeTitle">' + esc(L10N.title) + '</div>' +
          (sub ? '<div class="home-sub">' + esc(sub) + '</div>' : '') + '</div>' +
          '<div class="home-head-right">' +
            '<label class="home-toggle"><input type="checkbox" id="homeAutoShow"' + (state.autoShow === false ? '' : ' checked') + '> <span>' + esc(L10N.toggle) + '</span></label>' +
            '<button type="button" class="home-close" aria-label="' + esc(L10N.close) + '">&#10005;</button>' +
          '</div></div>' +
        '<div class="home-grid home-grid-hero">' + heroes.map(cardHtml).join('') + '</div>' +
        '<div class="home-grid">' + rest.map(cardHtml).join('') + '</div>' +
      '</div>';
  }

  // mode: 'manual' | 'intro' | 'updates'
  function open(mode) {
    if (!sections.length) return;
    buildOverlay();
    render(mode);
    lastFocus = document.activeElement;
    root.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var btn = document.getElementById('homeBtn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    var closeBtn = root.querySelector('.home-close');
    if (closeBtn) closeBtn.focus();
    if (mode === 'manual') {
      // Someone who found the map on their own has no use for the intro.
      if (!state.introShown) { state.introShown = true; saveState(); }
    } else {
      window.__chemdbPopup = 'home';                // one auto-popup per page load
      state.lastAutoShown = now;
      if (mode === 'intro') state.introShown = true;
      saveState();
    }
    track('home_open', { auto: mode === 'manual' ? 0 : (mode === 'intro' ? 'intro' : 1), unseen: badges.count });
  }

  function close() {
    if (!root || !root.classList.contains('is-open')) return;
    root.classList.remove('is-open');
    document.body.style.overflow = '';
    var btn = document.getElementById('homeBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    state = markAllSeen(sections, state);          // closing = "seen everything shown"
    saveState();
    badges = computeBadges(sections, state, visits, now);
    updateButton();
    // An auto-opened overlay had no opener: give focus to the Sections button.
    var back = lastFocus && lastFocus !== document.body && document.contains(lastFocus) ? lastFocus : btn;
    if (back && typeof back.focus === 'function') {
      try { back.focus({ preventScroll: true }); } catch (e) { /* element gone */ }
    }
  }

  function onCard(id) {
    var s = null;
    for (var i = 0; i < sections.length; i++) if (sections[i].id === id) s = sections[i];
    if (!s) return;
    track('home_card', { id: id });
    close();
    runTarget(s);
  }

  function clickTab(tab) {
    var btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
    if (!btn) return false;
    btn.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }

  function runTarget(s) {
    var t = targetOf(s);
    if (t.kind === 'tab') {
      if (!onIndex || !clickTab(t.arg)) location.href = './#tab=' + encodeURIComponent(t.arg);
    } else if (t.kind === 'mode' && t.arg === 'antag') {
      if (!onIndex) { location.href = './#antag=1&tab=antag'; return; }
      if (!document.body.classList.contains('antag-active')) {
        var toggle = document.getElementById('antagToggle');
        if (toggle) toggle.click();
      }
      clickTab('antag');
    } else if (t.kind === 'page') {
      if (pageName() !== t.arg) location.href = t.arg;
    } else if (t.kind === 'action' && t.arg === 'feedback') {
      if (window.ChemDBFeedback && typeof window.ChemDBFeedback.open === 'function') window.ChemDBFeedback.open('idea', { source: 'home' });
      else window.open(ISSUES_CHOOSE_URL, '_blank', 'noopener');
    }
  }

  // ── boot ─────────────────────────────────────────────────
  function decide() {
    var ctx = {
      storageOk: store.ok,
      companion: document.body.classList.contains('companion'),
      deepLink: arrivedWithHash,
      tutorialActive: !!document.querySelector('#tut-root.active'),
      userBusy: userActed || isTyping(),
    };
    var d = decideAutoShow(ctx, state, visits, badges.count, now);
    if (d.mode && !window.__chemdbPopup) open(d.mode);
  }

  // index.html: wait for app.js (app:ready, or the loading overlay already
  // hidden when it fired before the manifest arrived). library.html has no
  // bootstrap to wait for.
  function whenReady(fn) {
    var overlay = document.getElementById('loadingOverlay');
    if (!overlay || overlay.classList.contains('hidden')) { fn(); return; }
    document.addEventListener('app:ready', fn, { once: true });
  }

  function init() {
    var btn = document.getElementById('homeBtn');
    if (btn) btn.addEventListener('click', function () { open('manual'); });
    fetch(versioned('sections.json'))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (m) {
        sections = (m && m.sections) || [];
        // First visit: everything that exists now counts as seen — badges start from here.
        if (visits.n === 1 && !Object.keys(state.seen).length) { state = markAllSeen(sections, state); saveState(); }
        badges = computeBadges(sections, state, visits, now);
        updateButton();
        whenReady(function () { setTimeout(decide, 800); });
      })
      .catch(function () { /* offline without the manifest: the button stays inert */ });
  }

  window.ChemDBHome = {
    open: function () { open('manual'); },
    isOpen: function () { return !!(root && root.classList.contains('is-open')); },
    sections: function () { return sections.slice(); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

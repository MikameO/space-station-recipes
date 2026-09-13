// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Series H: the idea form and the returning-visitor survey. One form component
// in two modes, posted to the Cloudflare Worker in worker/, which files a GitHub
// issue; while FEEDBACK_URL is empty every entry point falls back to GitHub's
// own issue forms instead. Design: docs/design/2026-09-12-home-menu-and-feedback.md.
//
// window.ChemDBFeedbackLogic is pure and is what scripts/test_feedback_logic.js
// drives under Node; everything below the "page" line needs a DOM.
(function () {
  'use strict';

  var YM_COUNTER_ID = 108585248;
  var REPO_URL = 'https://github.com/MikameO/space-station-recipes';
  var ISSUE_URL_RE = /^https:\/\/github\.com\/MikameO\/space-station-recipes\/issues\/\d+$/;
  // Worker endpoint (origin only, no trailing slash). Empty = feature off.
  var FEEDBACK_URL = '';
  var LIMITS = { text: [10, 2000], answer: [0, 2000], contact: [0, 80] };
  var MIN_OPEN_MS = 3000;                   // faster than this is a bot
  var COOLDOWN_MS = 60 * 1000;              // one submission per minute per mode
  var SURVEY_MIN_VISITS = 3;
  var SURVEY_DELAY_MS = 60 * 1000;          // visible time before the survey may appear
  var SURVEY_RETRY_MS = 30 * 24 * 60 * 60 * 1000;
  var KEY_SURVEY = 'chemdb-survey';
  var KEY_LAST = 'chemdb-feedback-last';

  function track(goal, params) {
    try {
      if (typeof ym === 'function') ym(YM_COUNTER_ID, 'reachGoal', goal, params);
    } catch (e) { /* analytics must never break the page */ }
  }

  // ── pure logic ───────────────────────────────────────────
  function str(v) { return v == null ? '' : String(v); }

  // {} when fine; otherwise field → 'short' | 'long', or form → 'empty'.
  function validate(kind, f) {
    f = f || {};
    var errors = {};
    if (str(f.contact).length > LIMITS.contact[1]) errors.contact = 'long';
    if (kind === 'idea') {
      var t = str(f.text);
      if (t.trim().length < LIMITS.text[0]) errors.text = 'short';
      else if (t.length > LIMITS.text[1]) errors.text = 'long';
      return errors;
    }
    var h = str(f.hardest), w = str(f.wanted);
    if (h.length > LIMITS.answer[1]) errors.hardest = 'long';
    if (w.length > LIMITS.answer[1]) errors.wanted = 'long';
    if (!h.trim() && !w.trim()) errors.form = 'empty';
    return errors;
  }

  function buildPayload(kind, f, meta, openedAt, now) {
    f = f || {};
    var p = { kind: kind, contact: str(f.contact).trim(), meta: meta, hp: str(f.hp), t: now - openedAt };
    if (kind === 'idea') {
      p.text = str(f.text).trim();
    } else {
      p.answers = { hardest: str(f.hardest).trim(), wanted: str(f.wanted).trim() };
      p.chips = (f.chips || []).slice(0, 10);
    }
    return p;
  }

  // GitHub issue forms prefill fields by id: ?template=idea.yml&idea=…&contact=…
  function prefillUrl(kind, f) {
    f = f || {};
    var parts = ['template=' + (kind === 'idea' ? 'idea.yml' : 'survey.yml')];
    function add(k, v) { v = str(v).trim(); if (v) parts.push(k + '=' + encodeURIComponent(v)); }
    if (kind === 'idea') add('idea', f.text);
    else { add('hardest', f.hardest); add('wanted', f.wanted); }
    add('contact', f.contact);
    return REPO_URL + '/issues/new?' + parts.join('&');
  }

  // The Worker's answer only becomes a link when it is one of this repository's issues.
  function issueLink(url) { return ISSUE_URL_RE.test(str(url)) ? str(url) : null; }

  function copy(o) {
    var c = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k];
    return c;
  }

  // state: {done, dismissed, dismissedAt, skippedVisit}
  // ctx: {enabled, storageOk, companion, deepLink, tutorialActive, visits:{n}, homeOpen, popupTaken}
  function surveyDecision(state, ctx, now) {
    state = state || {};
    if (!ctx.enabled) return { show: false, reason: 'disabled' };
    if (!ctx.storageOk) return { show: false, reason: 'no-storage' };
    if (ctx.companion || ctx.deepLink || ctx.tutorialActive) return { show: false, reason: 'blocked' };
    if (!ctx.visits || ctx.visits.n < SURVEY_MIN_VISITS) return { show: false, reason: 'too-few-visits' };
    if (state.done) return { show: false, reason: 'done' };
    var d = state.dismissed || 0;
    if (d >= 2) return { show: false, reason: 'dismissed-twice' };
    if (d === 1 && typeof state.dismissedAt === 'number' && now - state.dismissedAt < SURVEY_RETRY_MS) return { show: false, reason: 'cooling' };
    if (state.skippedVisit === ctx.visits.n) return { show: false, reason: 'skipped-this-visit' };
    if (ctx.homeOpen || ctx.popupTaken) return { show: false, reason: 'home-took-it', skipVisit: true };
    return { show: true, reason: 'eligible' };
  }
  function applyDismiss(state, now) { var s = copy(state || {}); s.dismissed = (s.dismissed || 0) + 1; s.dismissedAt = now; return s; }
  function applySubmit(state) { var s = copy(state || {}); s.done = true; return s; }
  function applySkip(state, n) { var s = copy(state || {}); s.skippedVisit = n; return s; }

  // Accumulates time while the tab is visible; `due` once needMs of it has passed.
  function visibleClock(needMs) {
    var acc = 0, since = null;
    return {
      set: function (visible, now) {
        if (visible && since === null) since = now;
        else if (!visible && since !== null) { acc += now - since; since = null; }
      },
      elapsed: function (now) { return acc + (since === null ? 0 : now - since); },
      due: function (now) { return this.elapsed(now) >= needMs; },
    };
  }

  window.ChemDBFeedbackLogic = {
    validate: validate, buildPayload: buildPayload, prefillUrl: prefillUrl, issueLink: issueLink,
    surveyDecision: surveyDecision, applyDismiss: applyDismiss, applySubmit: applySubmit, applySkip: applySkip,
    visibleClock: visibleClock,
    LIMITS: LIMITS, MIN_OPEN_MS: MIN_OPEN_MS, SURVEY_DELAY_MS: SURVEY_DELAY_MS,
  };

  // ── page ─────────────────────────────────────────────────
  if (typeof document === 'undefined') return;

  // A link someone followed is judged as the page arrived (see home.js).
  var arrivedWithHash = location.hash.replace(/^#/, '').length > 0;

  var lang = window.I18N_LANG === 'ru' ? 'ru' : 'en';
  var L10N = {
    en: {
      ideaTitle: 'Suggest an idea', ideaLabel: 'What is missing, or what got in the way?',
      surveyTitle: 'A minute of your opinion?', q1: 'What was the hardest part?', q2: 'What is missing on the platform?',
      chipsHint: 'Tap a section to start with it',
      contactLabel: 'How to reach you (optional, public)', contactPh: 'Discord nick',
      note: 'Posted publicly as a GitHub issue. No personal data, please — a Discord nick is enough.',
      send: 'Send', sending: 'Sending…', alt: 'or open an issue yourself', close: 'Close',
      doneTitle: 'Thanks!', doneBody: 'Filed as issue',
      headerLabel: 'Feedback and bug reports',
      err: { short: 'At least 10 characters', long: 'Too long', empty: 'Fill in at least one answer',
             offline: 'No connection — try again later', cooldown: 'One message per minute — give it a moment',
             fast: 'Take a second to read it over, then send', fail: 'Could not send. Use the GitHub link below.' },
    },
    ru: {
      ideaTitle: 'Предложить идею', ideaLabel: 'Чего не хватает или что мешало?',
      surveyTitle: 'Минута на ваше мнение?', q1: 'Что было сложнее всего?', q2: 'Чего не хватает на платформе?',
      chipsHint: 'Нажмите на раздел, чтобы начать с него',
      contactLabel: 'Как с вами связаться (необязательно, публично)', contactPh: 'Ник в Discord',
      note: 'Публикуется как issue на GitHub — публично. Без личных данных; для связи достаточно ника в Discord.',
      send: 'Отправить', sending: 'Отправляю…', alt: 'или откройте issue сами', close: 'Закрыть',
      doneTitle: 'Спасибо!', doneBody: 'Заявка',
      headerLabel: 'Обратная связь и баг-репорты',
      err: { short: 'Минимум 10 символов', long: 'Слишком длинно', empty: 'Заполните хотя бы один ответ',
             offline: 'Нет сети — попробуйте позже', cooldown: 'Одно сообщение в минуту — подождите немного',
             fast: 'Перечитайте секунду — и отправляйте', fail: 'Не отправилось. Воспользуйтесь ссылкой на GitHub ниже.' },
    },
  }[lang];

  var store = (function () {
    var ok = false;
    try { localStorage.setItem('chemdb-probe', '1'); localStorage.removeItem('chemdb-probe'); ok = true; } catch (e) { ok = false; }
    return {
      ok: ok,
      get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    };
  })();

  var onIndex = !!document.getElementById('tab-reagents');
  // seq counts openings, so an answer that arrives after the form was closed or
  // replaced by the other mode updates state without drawing into the new form.
  var root = null, mode = null, openedAt = 0, lastFocus = null, chips = [], seq = 0;
  var surveyState = store.get(KEY_SURVEY);
  if (!surveyState || typeof surveyState !== 'object') surveyState = {};

  function endpoint() { return str(window.CHEMDB_FEEDBACK_URL || FEEDBACK_URL).replace(/\/$/, ''); }
  function enabled() { return !!endpoint(); }
  function esc(s) {
    return str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(sel) { return root ? root.querySelector(sel) : null; }
  function current(openSeq) { return openSeq === seq && !!root && root.classList.contains('is-open'); }

  // Hidden context the Worker puts in the issue's meta table.
  function meta() {
    var src = document.querySelector('input[name="source"]:checked');
    var tab = document.querySelector('.tab-btn.active');
    var data = '';
    try { if (typeof DATA !== 'undefined' && DATA && DATA.meta) data = str(DATA.meta.schemaVersion); } catch (e) { /* not on this page */ }
    return {
      page: onIndex ? 'index' : 'library', lang: lang,
      fork: src ? src.value : '', tab: tab ? tab.getAttribute('data-tab') : '',
      visits: window.ChemDBVisits ? window.ChemDBVisits.n : null,
      device: window.matchMedia && window.matchMedia('(max-width: 700px)').matches ? 'mobile' : 'desktop',
      data: data,
    };
  }

  // ── markup ───────────────────────────────────────────────
  function textarea(id, label, rows) {
    return '<label class="fb-label" for="' + id + '">' + esc(label) + '</label>' +
      '<textarea id="' + id + '" class="fb-textarea" rows="' + rows + '" maxlength="2000"></textarea>' +
      '<div class="fb-err" id="' + id + 'Err" aria-live="polite"></div>';
  }

  function formHtml(kind) {
    var body = kind === 'idea'
      ? textarea('fbText', L10N.ideaLabel, 4)
      : '<div class="fb-chips" id="fbChips" role="group" aria-label="' + esc(L10N.chipsHint) + '"></div>' +
        textarea('fbHardest', L10N.q1, 3) + textarea('fbWanted', L10N.q2, 3);
    return '<div class="fb-panel">' +
      '<div class="fb-head"><h2 class="fb-title" id="fbTitle">' + esc(kind === 'idea' ? L10N.ideaTitle : L10N.surveyTitle) + '</h2>' +
        '<button type="button" class="fb-close" aria-label="' + esc(L10N.close) + '">&#10005;</button></div>' +
      '<form class="fb-form" novalidate>' + body +
        '<label class="fb-label" for="fbContact">' + esc(L10N.contactLabel) + '</label>' +
        '<input id="fbContact" class="fb-input" maxlength="80" autocomplete="off" placeholder="' + esc(L10N.contactPh) + '">' +
        '<div class="fb-err" id="fbContactErr" aria-live="polite"></div>' +
        // Honeypot: off-screen, out of the tab order, hidden from assistive tech.
        '<div class="fb-hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>' +
        '<p class="fb-note">' + esc(L10N.note) + '</p>' +
        '<div class="fb-actions"><button type="submit" class="btn-primary fb-send">' + esc(L10N.send) + '</button>' +
          '<a class="fb-alt" target="_blank" rel="noopener noreferrer" href="' + esc(prefillUrl(kind, {})) + '">' + esc(L10N.alt) + '</a></div>' +
        '<div class="fb-err fb-err-form" id="fbFormErr" aria-live="polite"></div>' +
      '</form>' +
      '<div class="fb-done" id="fbDone" hidden></div>' +
    '</div>';
  }

  function renderChips() {
    var box = $('#fbChips');
    if (!box) return;
    var list = window.ChemDBHome && typeof window.ChemDBHome.sections === 'function' ? window.ChemDBHome.sections() : [];
    box.innerHTML = list.filter(function (s) { return s.title && s.id !== 'feedback'; }).map(function (s) {
      var t = s.title[lang] || s.title.en;
      return '<button type="button" class="fb-chip" data-id="' + esc(s.id) + '" data-title="' + esc(t) + '" aria-pressed="false">' + esc(t) + '</button>';
    }).join('');
  }

  // ── behaviour ────────────────────────────────────────────
  function readFields() {
    var v = function (sel) { var el = $(sel); return el ? el.value : ''; };
    return { text: v('#fbText'), hardest: v('#fbHardest'), wanted: v('#fbWanted'), contact: v('#fbContact'), hp: v('.fb-hp input'), chips: chips.slice() };
  }

  // "Open an issue yourself" carries what was typed so far, so falling back after
  // an error does not mean typing it again.
  function syncAltLink() {
    var alt = $('.fb-alt');
    if (alt && mode) alt.href = prefillUrl(mode, readFields());
  }

  function showErrors(errors) {
    var map = { text: '#fbTextErr', hardest: '#fbHardestErr', wanted: '#fbWantedErr', contact: '#fbContactErr', form: '#fbFormErr' };
    Object.keys(map).forEach(function (k) {
      var el = $(map[k]);
      if (el) el.textContent = errors[k] ? L10N.err[errors[k]] : '';
    });
  }
  function formError(code) { var el = $('#fbFormErr'); if (el) el.textContent = code ? L10N.err[code] : ''; }
  function setBusy(b) {
    var btn = $('.fb-send');
    if (btn) { btn.disabled = b; btn.textContent = b ? L10N.sending : L10N.send; }
  }

  function showDone(number, url) {
    var form = $('.fb-form'), done = $('#fbDone');
    if (form) form.hidden = true;
    if (!done) return;
    var link = issueLink(url);
    done.innerHTML = '<p class="fb-done-title">' + esc(L10N.doneTitle) + '</p>' +
      '<p>' + esc(L10N.doneBody) + ' ' +
        (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">#' + esc(number) + '</a>' : '#' + esc(number)) + '</p>' +
      '<button type="button" class="btn-small fb-done-close">' + esc(L10N.close) + '</button>';
    done.hidden = false;
    var b = done.querySelector('.fb-done-close');
    if (b) b.focus();
  }

  function onSubmit(e) {
    e.preventDefault();
    var f = readFields();
    var errors = validate(mode, f);
    showErrors(errors);
    if (Object.keys(errors).length) return;
    var now = Date.now();
    if (now - openedAt < MIN_OPEN_MS) { formError('fast'); return; }
    var last = store.get(KEY_LAST);
    if (!last || typeof last !== 'object') last = {};
    if (last[mode] && now - last[mode] < COOLDOWN_MS) { formError('cooldown'); return; }
    if (navigator.onLine === false) { formError('offline'); return; }
    var kind = mode, openSeq = seq;
    var payload = buildPayload(kind, f, meta(), openedAt, now);
    setBusy(true);
    fetch(endpoint() + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) {
        return r.json().then(function (j) { return { status: r.status, body: j }; }, function () { return { status: r.status, body: null }; });
      })
      .then(function (res) {
        if (!res.body || !res.body.ok) throw new Error(res.body && res.body.error ? res.body.error : 'http-' + res.status);
        last[kind] = now;
        store.set(KEY_LAST, last);
        if (kind === 'survey') { surveyState = applySubmit(surveyState); store.set(KEY_SURVEY, surveyState); }
        track('feedback_submit', { mode: kind });
        if (current(openSeq)) showDone(res.body.number, res.body.url);
      })
      .catch(function (err) {
        track('feedback_fail', { mode: kind, code: str(err && err.message).slice(0, 40) });
        if (current(openSeq)) { formError('fail'); setBusy(false); }
      });
  }

  function build() {
    if (root) return root;
    root = document.createElement('div');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-labelledby', 'fbTitle');
    document.body.appendChild(root);
    root.addEventListener('submit', function (e) { if (e.target.classList.contains('fb-form')) onSubmit(e); });
    root.addEventListener('click', function (e) {
      if (e.target.closest('.fb-close') || e.target.closest('.fb-done-close')) { close('dismiss'); return; }
      if (mode === 'idea' && e.target === root) { close('dismiss'); return; }
      var chip = e.target.closest('.fb-chip');
      if (!chip) return;
      var id = chip.getAttribute('data-id'), title = chip.getAttribute('data-title');
      var on = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      chips = on ? chips.concat([id]) : chips.filter(function (c) { return c !== id; });
      var ta = $('#fbHardest');
      if (on && ta && ta.value.indexOf(title) === -1) {
        ta.value = title + ': ' + ta.value;
        ta.focus();
      }
      syncAltLink();
    });
    root.addEventListener('input', function (e) {
      var err = e.target.id ? $('#' + e.target.id + 'Err') : null;
      if (err) err.textContent = '';
      formError('');
      syncAltLink();
    });
    root.addEventListener('keydown', function (e) {
      // Stop Escape here: app.js closes the reagent panel on a document-level Escape.
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('dismiss'); return; }
      if (e.key !== 'Tab' || mode !== 'idea') return;          // only the modal traps focus
      var f = root.querySelectorAll('button:not([disabled]), a[href], .fb-form:not([hidden]) input:not([tabindex="-1"]), textarea');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return root;
  }

  // opts: {source: 'home' | 'header' | 'survey'}
  function open(kind, opts) {
    opts = opts || {};
    kind = kind === 'survey' ? 'survey' : 'idea';
    if (!enabled()) {
      // Feature flag off: GitHub's own forms. The header button also carries bug
      // reports, so it gets the template picker rather than the idea template.
      track('feedback_open', { mode: kind, source: opts.source || '', fallback: 1 });
      window.open(opts.source === 'header' ? REPO_URL + '/issues/new/choose' : prefillUrl(kind, {}), '_blank', 'noopener');
      return;
    }
    build();
    seq++;
    mode = kind;
    chips = [];
    openedAt = Date.now();
    root.className = 'fb-root' + (kind === 'survey' ? ' fb-survey' : '');
    root.setAttribute('aria-modal', kind === 'idea' ? 'true' : 'false');
    root.innerHTML = formHtml(kind);
    if (kind === 'survey') renderChips();
    lastFocus = document.activeElement;
    root.classList.add('is-open');
    if (kind === 'idea') {
      document.body.style.overflow = 'hidden';
      var first = $('#fbText');
      if (first) first.focus();
    }
    track('feedback_open', { mode: kind, source: opts.source || '' });
  }

  // reason: 'dismiss' (×, Esc, backdrop, or Close after success) | 'silent'
  function close(reason) {
    if (!root || !root.classList.contains('is-open')) return;
    var done = $('#fbDone');
    var submitted = !!(done && !done.hidden);
    var wasSurvey = mode === 'survey';
    var hadFocus = root.contains(document.activeElement);   // read before hiding blurs it
    root.classList.remove('is-open');
    if (!wasSurvey) document.body.style.overflow = '';
    if (wasSurvey && reason === 'dismiss' && !submitted) {
      surveyState = applyDismiss(surveyState, Date.now());
      store.set(KEY_SURVEY, surveyState);
      track('survey_dismiss', { n: window.ChemDBVisits ? window.ChemDBVisits.n : null });
    }
    mode = null;
    // The modal always hands focus back; the survey never took it, so only when
    // the visitor was working inside it.
    if (!wasSurvey || hadFocus) {
      var back = lastFocus && lastFocus !== document.body && document.contains(lastFocus) ? lastFocus : null;
      if (back && typeof back.focus === 'function') {
        try { back.focus({ preventScroll: true }); } catch (e) { /* element gone */ }
      }
    }
  }

  // Header feedback button: keep the <a> (no-JS fallback to GitHub), intercept the click.
  function wireHeader() {
    var links = document.querySelectorAll('.feedback-btn');
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute('aria-label', L10N.headerLabel);
      links[i].addEventListener('click', function (e) { e.preventDefault(); open('idea', { source: 'header' }); });
    }
  }

  // ── survey scheduler ─────────────────────────────────────
  // 60 s of visible time after the app is up, then one decision (design §Опрос).
  function scheduleSurvey() {
    var clock = visibleClock(SURVEY_DELAY_MS);
    var timer = null;
    clock.set(document.visibilityState === 'visible', Date.now());

    function ctxNow() {
      return {
        enabled: enabled(), storageOk: store.ok,
        companion: document.body.classList.contains('companion'),
        deepLink: arrivedWithHash,
        tutorialActive: !!document.querySelector('#tut-root.active'),
        visits: window.ChemDBVisits || null,
        homeOpen: !!(window.ChemDBHome && window.ChemDBHome.isOpen && window.ChemDBHome.isOpen()) || !!(root && root.classList.contains('is-open')),
        popupTaken: !!window.__chemdbPopup,
      };
    }
    function fire() {
      var now = Date.now();
      if (!clock.due(now)) { arm(); return; }
      document.removeEventListener('visibilitychange', onVis);
      var ctx = ctxNow();
      var d = surveyDecision(surveyState, ctx, now);
      if (d.skipVisit && ctx.visits) { surveyState = applySkip(surveyState, ctx.visits.n); store.set(KEY_SURVEY, surveyState); }
      if (!d.show) return;
      // Once per visit at most: a survey nobody answers or closes must not come
      // back on every reload.
      surveyState = applySkip(surveyState, ctx.visits.n);
      store.set(KEY_SURVEY, surveyState);
      window.__chemdbPopup = 'survey';
      open('survey', { source: 'survey' });
      track('survey_shown', { n: ctx.visits.n });
    }
    function arm() {
      clearTimeout(timer);
      if (document.visibilityState !== 'visible') return;
      timer = setTimeout(fire, Math.max(0, SURVEY_DELAY_MS - clock.elapsed(Date.now())));
    }
    function onVis() { clock.set(document.visibilityState === 'visible', Date.now()); arm(); }
    document.addEventListener('visibilitychange', onVis);
    arm();
  }

  // index.html: the survey waits for app.js, so a failed data load never ends
  // with a survey under the error overlay. library.html has no bootstrap.
  function whenAppReady(fn) {
    var overlay = document.getElementById('loadingOverlay');
    if (!overlay || overlay.classList.contains('hidden')) { fn(); return; }
    document.addEventListener('app:ready', fn, { once: true });
  }

  window.ChemDBFeedback = { open: open, close: function () { close('silent'); }, enabled: enabled };

  function boot() { wireHeader(); whenAppReady(scheduleSurvey); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

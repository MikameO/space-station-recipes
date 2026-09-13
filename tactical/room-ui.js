// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Officers' room panel shell: entry, knock, roster, staff controls, banners,
// chips, strip and shelf scaffolding, pick mode. Feature modules register
// themselves (tactical/room-draw.js, tactical/room-requests.js) with tabs,
// tools, chips, strip cards, map drawing and actions.
// Contract: docs/design/2026-09-13-tactical-tablet.md.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  var LANG = root.I18N_LANG === 'ru' ? 'ru' : 'en';
  var PREFIX = 'chemdb-tactical:';
  var CURRENT_KEY = PREFIX + 'room-current';
  var DEV_KEY = PREFIX + 'room-dev';
  var SITE = 'https://mikameo.github.io/space-station-recipes/tactical.html';
  var YM = 108585248;

  var L10N = {
    en: {
      toggleRoom: 'Room', toggleFire: 'Fire',
      entryTitle: 'Join a room', entryLabel: 'Code from the briefing sheet', entryHint: 'K7M4Q2 or K7M4Q2-SL4B',
      callsign: 'Callsign (optional)', post: 'Post', squad: 'Squad', join: 'Join',
      createTitle: 'Create a room (staff)', serverKey: 'Server key', createPost: 'Your post', create: 'Create',
      demoCreate: 'Create a demo room', demoNote: 'Demo: the room lives in this tab only; the other officers are scripted.',
      knockTitle: 'Waiting for confirmation',
      knockText: 'Say this word on the radio. Anyone already in the room confirms you. The word lasts 5 minutes.',
      cancel: 'Cancel', leave: 'Leave', leaveAsk: 'Leave for sure?', observerBadge: 'Observer',
      tabs: { roster: 'Roster' }, shelf: 'Roster {n}', knockBadge: 'knock {n}',
      confirm: 'Confirm', gone: 'Dropped', goneAsk: 'Drop for sure?', claim: 'Take over', knocking: 'waiting', wordsAsk: 'Word heard:',
      sheet: 'Briefing sheet', sheetAll: 'Whole sheet', sheetHead: 'Command tablet',
      sheetHint: 'Enter the post code as one line: ROOM-CODE.', roomCode: 'Room', copy: 'Copy', copied: 'Copied',
      observerLink: 'Moderator link', rotate: 'Change code', rotateAsk: 'Every session ends. Change?', rotated: 'New room code: {code}. Tell it on the radio.',
      silenceOn: 'Radio silence', silenceOff: 'End radio silence', extend: 'Extend by an hour',
      close: 'Close the room', closeAsk: 'Close for sure?', exportLog: 'Download log', continueRound: 'Continue this round',
      present: 'I am here', presentAsk: 'No actions from you for 8 minutes: the room drops you at 10.',
      newCode: 'New post code: {code}', pickHint: '{hint} · Esc cancels',
      levelNames: { staff: 'Staff', squad: 'Squads', service: 'Services', observer: 'Observers' },
      banners: {
        silence: 'Radio silence (staff). Data frozen since {t}.',
        stopped: 'The administration switched the tablet off. Data frozen since {t}.',
        budget: 'Room limit reached. Data frozen since {t}.',
        locked: 'Room locked after 8 minutes without actions. New round?',
        closed: 'The room is closed. The log is available for an hour.',
        expired: 'Your session ended: the code changed or you were dropped.',
        gone: 'This room no longer exists.', network: 'No connection, retrying…',
        warn: 'The room closes at {t}.', planet: 'The room is on {planet}. Pick that planet to see its objects.',
        storage: 'Browser storage is off: the room forgets you on reload.'
      },
      errors: {
        entry: 'Check the code: letters and digits from the sheet, one dash.', sanction: 'The server key does not fit this fork.',
        stopped: 'The administration switched the tablet off.', ceiling: 'Too many rooms right now. Try later.',
        daily: 'Daily room limit reached.', used: 'This post code is used. Ask for a new one.', full: 'All seats of this post are taken.',
        postCode: 'Unknown post code.', room: 'No room with this code.', locked: 'The room is locked.', closed: 'The room is closed.',
        silence: 'Radio silence.', budget: 'Room limit reached.', word: 'Wrong word.', expired: 'The word expired: they must join again.',
        rate: 'Too fast, wait a second.', layer: 'You cannot draw on that layer.', right: 'Your post cannot do that.',
        status: 'Someone changed it first.', transition: 'Not possible in this state.', network: 'No connection.',
        unconfirmed: 'Wait for confirmation.', creator: 'Only staff posts create rooms.', disabled: 'Rooms are switched off.',
        fallback: 'Error: {code}'
      }
    },
    ru: {
      toggleRoom: 'Комната', toggleFire: 'Огонь',
      entryTitle: 'Войти в комнату', entryLabel: 'Код с листа брифинга', entryHint: 'K7M4Q2 или K7M4Q2-SL4B',
      callsign: 'Позывной (необязательно)', post: 'Должность', squad: 'Отряд', join: 'Войти',
      createTitle: 'Создать комнату (штаб)', serverKey: 'Ключ сервера', createPost: 'Ваша должность', create: 'Создать',
      demoCreate: 'Создать демо-комнату', demoNote: 'Демо: комната живёт только в этой вкладке, остальные офицеры сыграны сценарием.',
      knockTitle: 'Ждём подтверждения',
      knockText: 'Назовите это слово по рации. Подтвердит любой участник, который уже в комнате. Слово действует 5 минут.',
      cancel: 'Отменить', leave: 'Выйти', leaveAsk: 'Точно выйти?', observerBadge: 'Наблюдатель',
      tabs: { roster: 'Реестр' }, shelf: 'Реестр {n}', knockBadge: 'стук {n}',
      confirm: 'Подтвердить', gone: 'Выбыл', goneAsk: 'Точно выбыл?', claim: 'Занять', knocking: 'ждёт', wordsAsk: 'Услышанное слово:',
      sheet: 'Лист брифинга', sheetAll: 'Весь лист', sheetHead: 'Командный планшет',
      sheetHint: 'Код должности вводится одной строкой: КОМНАТА-КОД.', roomCode: 'Комната', copy: 'Копировать', copied: 'Скопировано',
      observerLink: 'Ссылка для модератора', rotate: 'Сменить код', rotateAsk: 'Все сессии закроются. Сменить?', rotated: 'Новый код комнаты: {code}. Передайте по рации.',
      silenceOn: 'Радиомолчание', silenceOff: 'Снять радиомолчание', extend: 'Продлить на час',
      close: 'Закрыть комнату', closeAsk: 'Точно закрыть?', exportLog: 'Скачать журнал', continueRound: 'Продолжить раунд',
      present: 'На месте', presentAsk: 'От вас 8 минут нет действий: через 10 комната снимет вас с должности.',
      newCode: 'Новый код должности: {code}', pickHint: '{hint} · Esc — отмена',
      levelNames: { staff: 'Штаб', squad: 'Отряды', service: 'Службы', observer: 'Наблюдатели' },
      banners: {
        silence: 'Радиомолчание (штаб). Данные заморожены с {t}.',
        stopped: 'Администрация отключила планшет. Данные заморожены с {t}.',
        budget: 'Лимит комнаты исчерпан. Данные заморожены с {t}.',
        locked: 'Комната заблокирована: 8 минут без действий. Новый раунд?',
        closed: 'Комната закрыта. Журнал доступен ещё час.',
        expired: 'Сессия закрыта: код сменили или вас сняли с должности.',
        gone: 'Этой комнаты больше нет.', network: 'Нет связи, повторяем…',
        warn: 'Комната закроется в {t}.', planet: 'Комната на планете {planet}. Выберите её, чтобы видеть объекты.',
        storage: 'Хранилище браузера выключено: после перезагрузки комната вас не узнает.'
      },
      errors: {
        entry: 'Проверьте код: буквы и цифры с листа, одно тире.', sanction: 'Ключ сервера не подходит к этому форку.',
        stopped: 'Администрация отключила планшет.', ceiling: 'Сейчас слишком много комнат. Попробуйте позже.',
        daily: 'Суточный лимит комнат исчерпан.', used: 'Этот код должности уже использован. Попросите новый.', full: 'Все места этой должности заняты.',
        postCode: 'Неизвестный код должности.', room: 'Комнаты с таким кодом нет.', locked: 'Комната заблокирована.', closed: 'Комната закрыта.',
        silence: 'Радиомолчание.', budget: 'Лимит комнаты исчерпан.', word: 'Не то слово.', expired: 'Слово истекло: пусть войдёт заново.',
        rate: 'Слишком быстро, подождите секунду.', layer: 'На этом слое вам рисовать нельзя.', right: 'Ваша должность этого не может.',
        status: 'Кто-то изменил это раньше вас.', transition: 'В этом состоянии так нельзя.', network: 'Нет связи.',
        unconfirmed: 'Дождитесь подтверждения.', creator: 'Комнату создаёт только штаб.', disabled: 'Комнаты выключены.',
        fallback: 'Ошибка: {code}'
      }
    }
  };
  var DECOYS = { ru: ['МАЯК', 'КЕДР', 'ШТОРМ', 'ИРИС'], en: ['BEACON', 'CEDAR', 'STORM', 'IRIS'] };

  var T = L10N[LANG];
  var modules = [];
  var ui = {
    hooks: null, root: null, els: {}, storage: null, policies: {}, policy: null, client: null,
    forkKey: null, planetId: null, on: false, tab: null, shelf: false, pick: null, demo: false,
    pendingHash: {}, drafts: {}, confirming: null, sheetSquad: '', renderQueued: false,
    prevStatus: null, lastError: null, narrow: false, fixtureReady: null, toastEl: null, toastTimer: 0
  };

  // ── helpers ─────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] !== undefined ? vars[k] : m; });
  }
  function attrs(data) {
    var out = '';
    for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) out += ' data-' + k + '="' + esc(data[k]) + '"';
    return out;
  }
  function btn(action, label, data, cls) {
    return '<button type="button" class="btn-small tac-room-btn' + (cls ? ' ' + cls : '') + '" data-room-action="' + action + '"' + attrs(data || {}) + '>' + esc(label) + '</button>';
  }
  function banner(text, kind, actions) {
    return '<div class="tac-banner tac-room-banner' + (kind ? ' ' + kind : '') + '"><p>' + esc(text) + '</p>' + (actions || '') + '</div>';
  }
  function track(goal) {
    try { if (typeof root.ym === 'function') root.ym(YM, 'reachGoal', goal, { fork: ui.forkKey }); } catch (e) { /* never break */ }
  }
  function hhmm(serverMs) {
    var d = new Date(serverMs - (ui.client ? ui.client.offset : 0));
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function mmss(seconds) {
    var s = Math.max(0, Math.ceil(seconds));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function postName(id) {
    var d = ui.policy ? R.postDef(ui.policy, id) : null;
    return d ? (LANG === 'ru' ? d.nameRu : d.nameEn) : id;
  }
  function squadName(id) {
    var s = ui.policy && ui.policy.squads[id];
    return s ? (LANG === 'ru' ? s.nameRu : s.nameEn) : (id || '');
  }
  function fnName(id) {
    var f = ui.policy && ui.policy.functions.filter(function (x) { return x.id === id; })[0];
    return f ? f.nameRu : id;
  }
  function planetName(id) {
    var ctx = ui.hooks ? ui.hooks.getContext() : null;
    var p = ctx && ctx.fork ? ctx.fork.planets.filter(function (x) { return x.id === id; })[0] : null;
    return p ? p.name : (id || '');
  }
  function errorText(code) { return T.errors[code] || fmt(T.errors.fallback, { code: code }); }
  function offset() {
    var c = ui.client && ui.client.calibration();
    if (c) return c.offset;
    var ctx = ui.hooks.getContext();
    return ctx.calibration ? ctx.calibration.offset : null;
  }
  function gameText(x, y) {
    var o = offset();
    return o ? (x + o[0]) + ' ' + (y + o[1]) : x + ' ' + y + (LANG === 'ru' ? ' (мир)' : ' (world)');
  }
  function toWorld(gx, gy) {
    var o = offset();
    return o ? [gx - o[0], gy - o[1]] : null;
  }
  function me() { return ui.client ? ui.client.me : null; }
  function can(right, obj) { var m = me(); return !!(m && m.confirmed && ui.policy && R.hasRight(ui.policy, m, right, obj)); }
  function isStaff() { var m = me(); return !!(m && m.confirmed && R.isStaff(ui.policy, m)); }
  function myLayer() {
    var m = me();
    if (!m) return null;
    var level = R.levelOf(ui.policy, m.post);
    return level === 'staff' ? 'shared' : level === 'squad' ? 'squad:' + m.squad : level === 'service' ? 'service' : null;
  }
  function draft(form, name, fallback) {
    var k = form + '.' + name;
    return ui.drafts[k] === undefined ? fallback : ui.drafts[k];
  }
  function clearDrafts(form) {
    Object.keys(ui.drafts).forEach(function (k) { if (k.indexOf(form + '.') === 0) delete ui.drafts[k]; });
  }
  function copyText(text) {
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      return root.navigator.clipboard.writeText(text).then(function () { toast(T.copied); }, function () { fallbackCopy(text); });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(T.copied); } catch (e) { /* the text stays selectable in the sheet */ }
    ta.remove();
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function toast(text) {
    if (!ui.toastEl) return;
    ui.toastEl.textContent = text;
    ui.toastEl.classList.remove('tac-hide');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(function () { ui.toastEl.classList.add('tac-hide'); }, 3500);
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function parseHash(hash) {
    var room = /[#&]room=([A-Za-z0-9]+)/.exec(hash || '');
    var observe = /[#&]observe=([A-Za-z0-9]+\.[A-Za-z0-9_-]+)/.exec(hash || '');
    var client = /[#&]client=([A-Za-z0-9_-]{8,40})/.exec(hash || '');   // dev only: a second officer in the same browser
    return { room: room ? room[1] : null, observe: observe ? observe[1] : null, client: client ? client[1] : null };
  }

  // ── pick mode ────────────────────────────────────────────

  function setPick(mode, handler, hint, keep, onCancel) {
    ui.pick = { mode: mode, handler: handler, keep: !!keep, onCancel: onCancel || null };
    document.body.classList.add('tac-room-picking');
    if (hint) toast(fmt(T.pickHint, { hint: hint }));
    queueRender();
  }
  function cancelPick() {
    if (!ui.pick) return;
    var p = ui.pick;
    ui.pick = null;
    document.body.classList.remove('tac-room-picking');
    if (p.onCancel) p.onCancel();
    queueRender();
  }
  function consumePick(tile) {
    if (!ui.on || !ui.pick) return false;
    var p = ui.pick;
    if (!p.keep) cancelPick();
    p.handler(tile);
    return true;
  }

  // ── availability and client ────────────────────────────────────

  function devFlags() { return ui.storage.read(DEV_KEY); }
  function roomUrl() {
    var d = devFlags();
    return (d && d.url) || (ui.root && ui.root.ROOM_URL) || '';
  }
  function available(policy) {
    if (ui.demo) return !!policy;
    if (!policy || !roomUrl()) return false;
    return !!devFlags() || policy.sanction.some(function (s) { return s.status !== 'none'; });
  }
  function loadPolicy(forkKey) {
    if (ui.policies[forkKey] !== undefined) return Promise.resolve(ui.policies[forkKey]);
    var url = ui.demo ? 'tactical/policy/' + forkKey + '.json?v=1' : roomUrl() ? roomUrl() + '/policy/' + forkKey : null;
    if (!url) { ui.policies[forkKey] = null; return Promise.resolve(null); }
    return root.fetch(url).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
      .then(function (p) { ui.policies[forkKey] = p; return p; });
  }
  function ensureClient() {
    var ctx = ui.hooks.getContext();
    var transport = ui.demo
      ? new root.TacRoomFixture.FixtureTransport(ui.policy, { script: root.TacRoomFixture.demoScript(ui.policy) })
      : new ui.root.HttpTransport(roomUrl());
    ui.client = new ui.root.RoomClient({
      transport: transport, storage: ui.storage, policy: ui.policy, fork: ctx.fork.key,
      clientId: devFlags() && ui.clientHash ? ui.clientHash : undefined,
      planet: ctx.meta ? ctx.meta.id : null, h: ctx.meta ? ctx.meta.h : '', onUpdate: onClientUpdate
    });
  }
  function onClientUpdate(c) {
    if (c.status === 'in' && ui.prevStatus === 'knocking') track('room_confirm');
    ui.prevStatus = c.status;
    while (c.rejected.length) { var r = c.rejected.shift(); toast(errorText(r.error)); }
    if (c.error && c.error !== ui.lastError && c.error !== 'network') toast(errorText(c.error));
    ui.lastError = c.error;
    if (c.code && (c.status === 'in' || c.status === 'knocking' || c.status === 'observer')) {
      ui.storage.write(CURRENT_KEY + ':' + c.client, { fork: c.fork, code: c.code });
    }
    queueRender();
  }
  function switchFork(key) {
    ui.forkKey = key;
    if (ui.client) ui.client.stopLoop();
    ui.client = null;
    ui.policy = null;
    ui.fixtureReady.then(function () { return loadPolicy(key); }).then(function (policy) {
      if (ui.forkKey !== key) return;
      ui.policy = policy;
      var show = available(policy);
      ui.els.toggle.classList.toggle('tac-hide', !show);
      if (!show) { setOn(false); return; }
      ensureClient();
      var h = ui.pendingHash;
      ui.pendingHash = {};
      if (h.observe) {
        var parts = h.observe.split('.');
        ui.client.observe(parts[0], parts[1]).then(function () { ui.client.startLoop(); });
        setOn(true);
      } else {
        var cur = ui.storage.read(CURRENT_KEY + ':' + ui.client.client);
        if (!ui.demo && cur && cur.fork === key && ui.client.restore(cur.code)) ui.client.startLoop();
        if (h.room || ui.demo) { ui.drafts['join.entry'] = h.room && h.room !== 'demo' ? h.room : ''; setOn(true); }
      }
      queueRender();
    });
  }

  // ── rendering ────────────────────────────────────────────

  function queueRender() {
    if (ui.renderQueued) return;
    ui.renderQueued = true;
    (root.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(render);
  }

  function collect(part) {
    return modules.map(function (m) { return m[part] ? m[part](api) : ''; }).join('');
  }

  function tabs() {
    var list = [{ id: 'roster', label: T.tabs.roster, narrow: false }];
    modules.forEach(function (m) { if (m.tabs) list = list.concat(m.tabs(api)); });
    var narrow = list.filter(function (t) { return t.narrow; });
    return ui.narrow && narrow.length ? narrow : list;
  }

  function tabPanel(id) {
    if (id === 'roster') return rosterHtml();
    for (var i = 0; i < modules.length; i++) {
      var m = modules[i];
      if (m.tabs && m.tabs(api).some(function (t) { return t.id === id; })) return m.panel(id, api);
    }
    return '';
  }

  function inRoom() {
    return !!(ui.client && ['in', 'observer', 'closed'].indexOf(ui.client.status) >= 0);
  }

  function render() {
    ui.renderQueued = false;
    if (!ui.els.panel) return;
    var room = ui.on && inRoom();
    ui.els.chips.classList.toggle('tac-hide', !room);
    ui.els.strip.classList.toggle('tac-hide', !room);
    ui.els.shelf.classList.toggle('tac-hide', !(room && ui.shelf && ui.narrow));
    if (!ui.on) return;
    var focus = captureFocus(ui.els.panel);
    ui.els.panel.innerHTML = panelHtml(room);
    restoreFocus(ui.els.panel, focus);
    if (room) {
      ui.els.chips.innerHTML = chipsHtml();
      ui.els.strip.innerHTML = collect('strip');
      if (ui.shelf && ui.narrow) ui.els.shelf.innerHTML = shelfHtml();
    }
    updateCountdowns();
    ui.hooks.view.requestDraw();
  }

  function panelHtml(room) {
    if (!ui.policy || !ui.client) return '';
    var c = ui.client;
    if (!room) {
      var top = '';
      if (c.status === 'expired') top = banner(T.banners.expired, 'warn');
      if (c.status === 'gone') top = banner(T.banners.gone, 'warn');
      if (!ui.storage.ok) top += banner(T.banners.storage);
      return top + (c.status === 'knocking' ? knockHtml() : homeHtml());
    }
    var list = tabs();
    if (!ui.tab || !list.some(function (t) { return t.id === ui.tab; })) {
      ui.tab = list.some(function (t) { return t.id === 'requests'; }) ? 'requests' : list[0].id;
    }
    return bannersHtml() + headHtml() +
      (c.status === 'in' ? '<div class="tac-room-tools">' + collect('tools') + '</div>' : '') +
      '<div class="tac-room-tabs" role="tablist">' + list.map(function (t) {
        return '<button type="button" role="tab" class="tac-seg' + (t.id === ui.tab ? ' on' : '') + '" aria-selected="' + (t.id === ui.tab) + '" data-room-action="tab" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="tac-room-tab">' + tabPanel(ui.tab) + '</div>';
  }

  function selectHtml(form, name, label, options, value) {
    return '<label class="tac-input-label">' + esc(label) + '<select class="tac-select" name="' + name + '">' +
      options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === value ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
      '</select></label>';
  }

  function homeHtml() {
    var P = ui.policy, c = ui.client;
    var entry = draft('join', 'entry', '');
    var posts = P.posts.filter(function (p) { return p.level !== 'observer'; }).map(function (p) { return [p.id, postName(p.id)]; });
    var staff = P.posts.filter(function (p) { return p.level === 'staff'; }).map(function (p) { return [p.id, postName(p.id)]; });
    var squads = Object.keys(P.squads).map(function (s) { return [s, squadName(s)]; });
    var withPost = entry.indexOf('-') >= 0;
    var error = c.error && c.error !== 'network' ? '<p class="tac-msg error">' + esc(errorText(c.error)) + '</p>' : '';
    return '<section class="tac-section"><h2>' + esc(T.entryTitle) + '</h2>' +
      '<form data-room-form="join" class="tac-room-form">' +
      '<label class="tac-input-label">' + esc(T.entryLabel) +
      '<input class="tac-input tac-room-code" name="entry" autocomplete="off" spellcheck="false" value="' + esc(entry) + '" placeholder="' + esc(T.entryHint) + '"></label>' +
      '<div class="tac-room-postpick' + (withPost ? ' tac-hide' : '') + '">' +
      selectHtml('join', 'post', T.post, posts, draft('join', 'post', posts[0][0])) +
      (squads.length ? selectHtml('join', 'squad', T.squad, squads, draft('join', 'squad', squads[0][0])) : '') + '</div>' +
      '<label class="tac-input-label">' + esc(T.callsign) + '<input class="tac-input" name="callsign" maxlength="' + P.limits.callsign + '" value="' + esc(draft('join', 'callsign', '')) + '"></label>' +
      '<button type="submit" class="btn-small tac-room-btn">' + esc(T.join) + '</button>' + error +
      '</form></section>' +
      '<section class="tac-section"><details' + (ui.demo ? ' open' : '') + '><summary>' + esc(T.createTitle) + '</summary>' +
      '<form data-room-form="create" class="tac-room-form">' +
      (ui.demo ? '<p class="tac-muted">' + esc(T.demoNote) + '</p>'
        : '<label class="tac-input-label">' + esc(T.serverKey) + '<input class="tac-input" name="token" autocomplete="off" spellcheck="false" value="' +
          esc(draft('create', 'token', ui.storage.read(PREFIX + 'room-key:' + ui.forkKey) || '')) + '"></label>') +
      selectHtml('create', 'post', T.createPost, staff, draft('create', 'post', staff[0][0])) +
      '<label class="tac-input-label">' + esc(T.callsign) + '<input class="tac-input" name="callsign" maxlength="' + P.limits.callsign + '" value="' + esc(draft('create', 'callsign', '')) + '"></label>' +
      '<button type="submit" class="btn-small tac-room-btn">' + esc(ui.demo ? T.demoCreate : T.create) + '</button>' +
      '</form></details></section>';
  }

  function knockHtml() {
    return '<section class="tac-section"><h2>' + esc(T.knockTitle) + '</h2>' +
      '<div class="tac-room-word">' + esc(ui.client.word || '') + '</div>' +
      '<p>' + esc(T.knockText) + '</p>' + btn('leave', T.cancel) + '</section>';
  }

  function headHtml() {
    var c = ui.client, m = c.meta || {}, mine = c.me;
    var who = mine ? postName(mine.post) + (mine.squad ? ' · ' + squadName(mine.squad) : '') : (c.status === 'observer' ? T.observerBadge : '');
    return '<div class="tac-room-head"><span class="tac-room-code">' + esc(c.code) + '</span>' +
      '<span class="tac-muted">' + esc(planetName(m.planet)) + '</span>' +
      '<span class="tac-room-me">' + esc(who) + '</span>' +
      btn('leave', ui.confirming === 'leave' ? T.leaveAsk : T.leave) + '</div>';
  }

  function presenceDue(now) {
    var mine = me();
    if (!mine || !mine.confirmed) return false;
    var own = ui.client.lastOwnOpAt ? ui.client.lastOwnOpAt + ui.client.offset : 0;
    var last = Math.max(own, mine.presentAt || 0, mine.confirmedAt || 0, mine.at || 0);
    return now - last >= (ui.policy.ttl.memberIdleSec - 120) * 1000;
  }

  function canExtend() {
    var m = ui.client.meta;
    return !!(m && !m.extended && !m.closed && can('extend') && ui.client.serverNow() >= m.warnAt);
  }

  function bannersHtml() {
    var c = ui.client, m = c.meta || {}, now = c.serverNow(), out = [];
    var ctx = ui.hooks.getContext();
    if (!ui.storage.ok) out.push(banner(T.banners.storage));
    if (c.error === 'network') out.push(banner(T.banners.network, 'warn'));
    if (m.frozen) out.push(banner(fmt(T.banners[m.frozen.reason] || T.banners.silence, { t: hhmm(m.frozen.at) }), 'frozen'));
    if (m.locked && !m.closed) out.push(banner(T.banners.locked, 'warn', isStaff() ? btn('continueRound', T.continueRound) + btn('close', ui.confirming === 'close' ? T.closeAsk : T.close) : ''));
    if (m.closed) out.push(banner(T.banners.closed, 'warn', btn('exportLog', T.exportLog)));
    if (!m.closed && m.warnAt && now >= m.warnAt) out.push(banner(fmt(T.banners.warn, { t: hhmm(m.maxAt) }), 'warn', canExtend() ? btn('extend', T.extend) : ''));
    if (m.planet && ctx.meta && ctx.meta.id !== m.planet) out.push(banner(fmt(T.banners.planet, { planet: planetName(m.planet) })));
    if (c.status === 'in' && presenceDue(now)) out.push(banner(T.presentAsk, 'warn', btn('present', T.present)));
    return out.join('');
  }

  function rosterHtml() {
    var c = ui.client, P = ui.policy, now = c.serverNow();
    var members = c.members();
    var knocking = members.filter(function (m) { return !m.confirmed; });
    var groups = {};
    members.forEach(function (m) { var lv = R.levelOf(P, m.post) || 'observer'; (groups[lv] = groups[lv] || []).push(m); });
    var html = ['staff', 'squad', 'service'].map(function (lv) {
      if (!groups[lv]) return '';
      return '<h3>' + esc(T.levelNames[lv]) + '</h3>' + groups[lv].map(function (m) { return memberRow(m, knocking); }).join('');
    }).join('');
    if (isStaff()) html += staffHtml();
    return html;
  }

  function wordChoices(m, knocking) {
    var words = [m.word];
    knocking.forEach(function (k) { if (k.word && words.indexOf(k.word) < 0) words.push(k.word); });
    DECOYS[LANG].forEach(function (w) { if (words.length < 3 && words.indexOf(w) < 0) words.push(w); });
    words = words.slice(0, 3).sort();
    return '<span class="tac-muted">' + esc(T.wordsAsk) + '</span> ' + words.map(function (w) {
      return btn('confirm', w, { client: m.client, word: w }, 'big');
    }).join('');
  }

  function memberRow(m, knocking) {
    var c = ui.client, P = ui.policy, mine = me();
    var seen = c.presence[m.client];
    var faded = m.confirmed && !(typeof seen === 'number' && seen <= 90000);
    var name = postName(m.post) + (m.squad ? ' · ' + squadName(m.squad) : '') + (m.callsign ? ' «' + m.callsign + '»' : '');
    var tags = (m.functions || []).map(function (f) { return '<span class="tac-room-tag">' + esc(fnName(f)) + '</span>'; }).join('');
    var actions = '';
    var self = mine && mine.client === m.client;
    if (mine && mine.confirmed && !self) {
      if (!m.confirmed && can('confirmJoin')) actions += knocking.length >= 2 ? wordChoices(m, knocking) : btn('confirm', T.confirm, { client: m.client }, 'big');
      if (m.confirmed) {
        var ask = ui.confirming === 'release:' + m.client;
        actions += btn('release', ask ? T.goneAsk : T.gone, { client: m.client });
        if (isStaff() || (m.squad && mine.squad === m.squad)) actions += btn('reissue', T.claim, { client: m.client });
      }
    }
    if (can('assignLabel') && m.confirmed) {
      actions += P.functions.map(function (f) {
        var on = (m.functions || []).indexOf(f.id) >= 0;
        return btn('label', fnName(f.id), { client: m.client, fn: f.id }, on ? 'on' : '');
      }).join('');
    }
    var style = R.levelStyle(P, m);
    var waiting = m.confirmed ? '' : ' <em>' + esc(T.knocking) + (knocking.length < 2 && m.word ? ' · ' + esc(m.word) : '') + '</em>';
    return '<div class="tac-room-row' + (faded ? ' faded' : '') + (self ? ' me' : '') + '">' +
      '<span class="tac-room-sig tac-room-sig-' + style.level + '" style="--sig:' + esc(style.color) + '"></span>' +
      '<span class="tac-room-name">' + esc(name) + tags + waiting + '</span>' +
      '<span class="tac-room-actions">' + actions + '</span></div>';
  }

  function sheetMarkup(filter) {
    var c = ui.client, P = ui.policy;
    function lines(list) {
      var by = {};
      list.forEach(function (s) { (by[s.post] = by[s.post] || []).push(c.code + '-' + s.code); });
      return Object.keys(by).map(function (p) { return postName(p) + ': ' + by[p].join(', '); });
    }
    var out = ['[head=2]' + T.sheetHead + '[/head]', '[bold]' + T.roomCode + ':[/bold] ' + c.code, SITE.replace('https://', ''), T.sheetHint];
    if (!filter) {
      out.push('', '[head=3]' + T.levelNames.staff + ' / ' + T.levelNames.service + '[/head]');
      out = out.concat(lines(c.sheet.filter(function (s) { return !s.squad; })));
    }
    Object.keys(P.squads).forEach(function (sq) {
      if (filter && filter !== sq) return;
      out.push('', '[head=3]' + squadName(sq) + '[/head]');
      out = out.concat(lines(c.sheet.filter(function (s) { return s.squad === sq; })));
    });
    return out.join('\n');
  }

  function staffHtml() {
    var c = ui.client, m = c.meta || {};
    var silence = m.frozen && m.frozen.reason === 'silence';
    var sheet = c.sheet
      ? (Object.keys(ui.policy.squads).length
        ? '<select class="tac-select" data-room-change="sheetSquad"><option value="">' + esc(T.sheetAll) + '</option>' +
          Object.keys(ui.policy.squads).map(function (s) { return '<option value="' + s + '"' + (s === ui.sheetSquad ? ' selected' : '') + '>' + esc(squadName(s)) + '</option>'; }).join('') +
          '</select> '
        : '') +
        btn('sheetCopy', T.copy) + '<pre class="tac-room-sheet">' + esc(sheetMarkup(ui.sheetSquad)) + '</pre>'
      : '';
    return '<section class="tac-section"><h2>' + esc(T.sheet) + '</h2>' + sheet +
      '<div class="tac-room-staff">' +
      btn('observerLink', T.observerLink) +
      btn('rotate', ui.confirming === 'rotate' ? T.rotateAsk : T.rotate) +
      btn('silence', silence ? T.silenceOff : T.silenceOn, null, silence ? 'on' : '') +
      (canExtend() ? btn('extend', T.extend) : '') +
      btn('exportLog', T.exportLog) +
      btn('close', ui.confirming === 'close' ? T.closeAsk : T.close) +
      '</div></section>';
  }

  function chipsHtml() {
    var members = ui.client.members();
    var confirmed = members.filter(function (m) { return m.confirmed; }).length;
    var knocking = members.length - confirmed;
    var roster = ui.narrow
      ? '<button type="button" class="tac-room-chip' + (knocking ? ' busy' : '') + '" data-room-action="shelf">' +
        esc(fmt(T.shelf, { n: confirmed })) + (knocking ? ' · ' + esc(fmt(T.knockBadge, { n: knocking })) : '') + '</button>'
      : '';
    return roster + collect('chips');
  }

  function shelfHtml() {
    var layers = modules.filter(function (m) { return m.tabs && m.tabs(api).some(function (t) { return t.id === 'layers'; }); })[0];
    return '<div class="tac-room-shelf-inner">' + btn('shelf', '×', null, 'tac-room-close') + rosterHtml() +
      (layers ? layers.panel('layers', api) : '') + '</div>';
  }

  function updateCountdowns() {
    if (!ui.client) return;
    var now = ui.client.serverNow();
    [ui.els.panel, ui.els.strip, ui.els.chips, ui.els.shelf].forEach(function (box) {
      if (!box) return;
      var list = box.querySelectorAll('[data-deadline]');
      for (var i = 0; i < list.length; i++) list[i].textContent = mmss(R.countdown(+list[i].getAttribute('data-deadline'), now));
    });
  }

  function captureFocus(box) {
    var el = document.activeElement;
    if (!el || !box.contains(el) || !el.name) return null;
    return { name: el.name, form: el.form ? el.form.getAttribute('data-room-form') : '', start: el.selectionStart, end: el.selectionEnd };
  }
  function restoreFocus(box, f) {
    if (!f) return;
    var el = box.querySelector((f.form ? '[data-room-form="' + f.form + '"] ' : '') + '[name="' + f.name + '"]');
    if (!el) return;
    el.focus({ preventScroll: true });
    try { if (typeof f.start === 'number') el.setSelectionRange(f.start, f.end); } catch (e) { /* select elements */ }
  }

  function setOn(on) {
    ui.on = !!on;
    document.body.classList.toggle('tac-room-on', ui.on);
    ui.els.panel.classList.toggle('tac-hide', !ui.on);
    ui.els.toggle.setAttribute('aria-pressed', ui.on ? 'true' : 'false');
    ui.els.toggle.textContent = ui.on ? T.toggleFire : T.toggleRoom;
    if (!ui.on) { cancelPick(); ui.shelf = false; }
    render();
    ui.hooks.redraw();
  }

  // ── actions ────────────────────────────────────────────

  function adminThen(action, payload, done) {
    return ui.client.admin(action, payload).then(function (r) {
      if (r.status === 200 && done) done(r.body);
      queueRender();
    });
  }

  function twoStep(key, run) {
    if (ui.confirming === key) { ui.confirming = null; run(); } else { ui.confirming = key; queueRender(); }
  }

  var actions = {
    tab: function (el) { ui.tab = el.getAttribute('data-tab'); ui.shelf = false; queueRender(); },
    shelf: function () { ui.shelf = !ui.shelf; queueRender(); },
    leave: function () {
      var run = function () { ui.storage.remove(CURRENT_KEY + ':' + ui.client.client); ui.client.leave(); cancelPick(); queueRender(); ui.hooks.redraw(); };
      if (ui.client.status === 'knocking') run(); else twoStep('leave', run);
    },
    confirm: function (el) {
      var payload = { client: el.getAttribute('data-client') };
      if (el.getAttribute('data-word')) payload.word = el.getAttribute('data-word');
      adminThen('confirm', payload, function () { track('room_confirm'); });
    },
    release: function (el) {
      var client = el.getAttribute('data-client');
      twoStep('release:' + client, function () { adminThen('release', { client: client }); });
    },
    reissue: function (el) {
      adminThen('reissue', { client: el.getAttribute('data-client') }, function (b) {
        if (b.postCode) toast(fmt(T.newCode, { code: ui.client.code + '-' + b.postCode }));
      });
    },
    label: function (el) { adminThen('label', { client: el.getAttribute('data-client'), fn: el.getAttribute('data-fn') }); },
    sheetCopy: function () { copyText(sheetMarkup(ui.sheetSquad)); },
    observerLink: function () {
      var c = ui.client;
      function link(token) {
        var ctx = ui.hooks.getContext();
        return SITE + '#map=' + ui.forkKey + '/' + ((c.meta && c.meta.planet) || (ctx.meta && ctx.meta.id)) + '&observe=' + c.code + '.' + token;
      }
      if (c.observerToken) { copyText(link(c.observerToken)); return; }
      adminThen('observer', null, function (b) { c.observerToken = b.observerToken; c.persist(); copyText(link(b.observerToken)); });
    },
    rotate: function () {
      twoStep('rotate', function () { adminThen('rotate', null, function (b) { toast(fmt(T.rotated, { code: b.code })); }); });
    },
    silence: function () {
      var m = ui.client.meta || {};
      adminThen('silence', { on: !(m.frozen && m.frozen.reason === 'silence') });
    },
    extend: function () { adminThen('extend'); },
    close: function () { twoStep('close', function () { adminThen('close'); }); },
    continueRound: function () { adminThen('unlock'); },
    exportLog: function () {
      var c = ui.client;
      c.exportRoom().then(function (r) {
        if (r.status !== 200) { toast(errorText((r.body && r.body.error) || 'http-' + r.status)); return; }
        var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        download('room-' + c.code + '-' + stamp + '.json', JSON.stringify(r.body, null, 1));
        if (r.body.text) download('room-' + c.code + '-' + stamp + '.txt', r.body.text, 'text/plain;charset=utf-8');
        track('room_export');
      });
    },
    present: function () {
      var mine = me();
      if (mine) ui.client.queue({ op: 'patch', kind: 'member', id: mine.id, data: { presentAt: 1 } });
    }
  };

  var changes = {
    sheetSquad: function (el) { ui.sheetSquad = el.value; queueRender(); }
  };

  function findHandler(table, name) {
    if (table === 'actions' && actions[name]) return actions[name];
    if (table === 'changes' && changes[name]) return changes[name];
    for (var i = 0; i < modules.length; i++) {
      var t = modules[i][table];
      if (t && t[name]) return t[name];
    }
    return null;
  }

  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-room-action]') : null;
    if (!el) return;
    var fn = findHandler('actions', el.getAttribute('data-room-action'));
    if (!fn) return;
    e.preventDefault();
    if (el.getAttribute('data-room-action') !== 'leave' && ui.confirming && ui.confirming.indexOf(el.getAttribute('data-room-action')) !== 0) ui.confirming = null;
    fn(el, api, e);
  }

  function onChange(e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute('data-room-change')) {
      var fn = findHandler('changes', el.getAttribute('data-room-change'));
      if (fn) fn(el, api, e);
      return;
    }
    onInput(e);
  }

  function onInput(e) {
    var el = e.target;
    if (!el.name || !el.form) return;
    var form = el.form.getAttribute('data-room-form');
    ui.drafts[form + '.' + el.name] = el.type === 'checkbox' ? el.checked : el.value;
    if (form === 'join' && el.name === 'entry') {
      var pick = el.form.querySelector('.tac-room-postpick');
      if (pick) pick.classList.toggle('tac-hide', el.value.indexOf('-') >= 0);
    }
  }

  function tokenKeyId(token) {
    try {
      var part = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      part += '==='.slice((part.length + 3) % 4);
      var bin = atob(part), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes)).keyId || '';
    } catch (e) { return ''; }
  }

  function onSubmit(e) {
    var form = e.target;
    var name = form.getAttribute && form.getAttribute('data-room-form');
    if (!name) return;
    e.preventDefault();
    var f = form.elements, c = ui.client, ctx = ui.hooks.getContext();
    c.error = null;
    c.planet = ctx.meta ? ctx.meta.id : c.planet;
    c.h = ctx.meta ? ctx.meta.h : c.h;
    if (name === 'join') {
      c.join({ entry: f.entry.value, post: f.post.value, squad: f.squad ? f.squad.value : null, callsign: f.callsign.value }).then(function () {
        if (c.status === 'knocking' || c.status === 'in') { clearDrafts('join'); c.startLoop(); }
        queueRender();
      });
    } else if (name === 'create') {
      var token = ui.demo ? 'demo' : f.token.value.trim();
      if (!ui.demo) ui.storage.write(PREFIX + 'room-key:' + ui.forkKey, token);
      c.createRoom({ token: token, keyId: ui.demo ? 'demo' : tokenKeyId(token), post: f.post.value, callsign: f.callsign.value }).then(function () {
        if (c.status === 'in') { clearDrafts('create'); track('room_create'); c.startLoop(); ui.tab = null; }
        queueRender();
      });
    } else {
      var fn = findHandler('submits', name);
      if (fn) fn(form, api, e);
    }
  }

  // ── lifecycle ────────────────────────────────────────────

  function tick() {
    var ctx = ui.hooks.getContext();
    if (ctx.fork && ui.forkKey !== ctx.fork.key) { switchFork(ctx.fork.key); return; }
    var planet = ctx.meta ? ctx.meta.id : null;
    if (planet !== ui.planetId) { ui.planetId = planet; if (ui.on) queueRender(); }
    updateCountdowns();
    modules.forEach(function (m) { if (m.tick) m.tick(api); });
  }

  function mount(hooks, apiRoot) {
    ui.hooks = hooks;
    ui.root = apiRoot;
    ui.storage = apiRoot.makeStorage(root.localStorage);
    ui.els = { toggle: $('tacRoomToggle'), panel: $('tacRoom'), chips: $('tacRoomChips'), strip: $('tacRoomStrip'), shelf: $('tacRoomShelf'), draw: $('tacRoomDraw') };
    if (!ui.els.panel || !ui.els.toggle) return;
    if (root.top !== root.self) return;   // never run inside a frame: a foreign page cannot click «Подтвердить» for staff
    ui.pendingHash = parseHash(root.location.hash);
    ui.clientHash = ui.pendingHash.client;
    ui.demo = ui.pendingHash.room === 'demo';
    ui.fixtureReady = ui.demo ? loadScript('tactical/room-fixtures.js?v=1') : Promise.resolve();
    ui.els.toggle.textContent = T.toggleRoom;
    ui.els.toggle.addEventListener('click', function () { setOn(!ui.on); });
    [ui.els.panel, ui.els.chips, ui.els.strip, ui.els.shelf].forEach(function (box) {
      box.addEventListener('click', onClick);
      box.addEventListener('change', onChange);
      box.addEventListener('input', onInput);
      box.addEventListener('submit', onSubmit);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ui.pick) { cancelPick(); e.preventDefault(); e.stopPropagation(); }
    }, true);
    var mq = root.matchMedia ? root.matchMedia('(max-width: 1100px)') : null;
    ui.narrow = !!(mq && mq.matches);
    if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { ui.narrow = e.matches; if (!ui.narrow) ui.shelf = false; queueRender(); });
    ui.toastEl = document.createElement('div');
    ui.toastEl.className = 'tac-room-toast tac-hide';
    ui.toastEl.setAttribute('role', 'status');
    document.body.appendChild(ui.toastEl);
    hooks.view.addLayer(function drawRoom(ctx, v) {
      if (!ui.on || !inRoom()) return;
      modules.forEach(function (m) { if (m.draw) m.draw(ctx, v, api); });
    });
    modules.forEach(function (m) { if (m.mount) m.mount(api); });
    root.setInterval(tick, 1000);
    tick();
  }

  function notify(event, payload) {
    if (!ui.on || !inRoom()) return;
    modules.forEach(function (m) { if (m.notify) m.notify(event, payload, api); });
  }

  var api = {
    R: R, LANG: LANG, ui: ui,
    T: function () { return T; },
    esc: esc, fmt: fmt, btn: btn, banner: banner, render: queueRender, toast: toast, errorText: errorText,
    setPick: setPick, cancelPick: cancelPick, hhmm: hhmm, mmss: mmss,
    postName: postName, squadName: squadName, fnName: fnName, planetName: planetName,
    offset: offset, gameText: gameText, toWorld: toWorld, me: me, can: can, isStaff: isStaff, myLayer: myLayer,
    draft: draft, clearDrafts: clearDrafts, track: track, copyText: copyText, download: download
  };

  root.TacRoomUI = {
    api: api,
    register: function (module) {
      modules.push(module);
      if (module.l10n) {
        ['en', 'ru'].forEach(function (lang) {
          var src = module.l10n[lang] || {};
          Object.keys(src).forEach(function (k) {
            if (k === 'tabs') { Object.keys(src.tabs).forEach(function (t) { L10N[lang].tabs[t] = src.tabs[t]; }); }
            else if (k === 'errors') { Object.keys(src.errors).forEach(function (t) { L10N[lang].errors[t] = src.errors[t]; }); }
            else { L10N[lang][k] = src[k]; }
          });
        });
      }
    },
    mount: mount,
    notify: notify,
    consumePick: consumePick
  };
})(window);

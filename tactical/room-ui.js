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
  var KEY_PREFIX = PREFIX + 'room-key:';
  var DEMO_KEY = PREFIX + 'room-demo';   // sessionStorage: the demo survives a reload of this tab
  var CAL_KEEP_PREFIX = PREFIX + 'room-cal-keep:';   // sessionStorage per room code: the `at` of the room calibration kept aside
  var MAX_COORD = 4096;
  var PROD_SITE = 'https://mikameo.github.io/space-station-recipes/tactical.html';
  var SITE = siteUrl(root.location);
  var YM = 108585248;
  var EDIT_HOLD_MS = 4000;   // a text field without input this long no longer holds panel writes back

  // Links and the briefing sheet point at the page they were made on; a local preview never sends people to production.
  function siteUrl(loc) {
    if (!loc || !loc.hostname || loc.hostname === 'mikameo.github.io' || !loc.origin || loc.origin === 'null') return PROD_SITE;
    return loc.origin + (loc.pathname || '/tactical.html');
  }

  var L10N = {
    en: {
      toggleRoom: 'Room', toggleFire: 'Fire', entryAria: 'Fire panel or officers’ room',
      entryLead: 'Officers’ room: staff sends strike and position requests, the crew answers with statuses.',
      entryIn: 'You are in room {code} · {post}', entryKnock: 'Waiting to be let into room {code}',
      keyHelp: 'The server’s administration gives this key to the officers who open rooms. Joining needs no key, only the code from the briefing sheet.',
      keySavedHint: 'Leave the field empty to use the saved key.', keyEmpty: 'Paste the server key: a long line that starts with eyJ.',
      keyNotToken: 'This is not a server key. The key is a long line that starts with eyJ; a code from the briefing sheet goes into the join form above.',
      keyOtherFork: 'This key is for the {fork} fork, while the map shows {current}. Pick that fork above the map.',
      entryTitle: 'Join a room', entryLabel: 'Code from the briefing sheet', entryHint: 'K7M4Q2 or K7M4Q2-SK4B',
      callsign: 'Callsign (optional)', post: 'Post', squad: 'Squad', join: 'Join',
      createTitle: 'Create a room (staff)', serverKey: 'Server key', createPost: 'Your post', create: 'Create',
      keySaved: 'key saved', keyReplace: 'replace', keyForget: 'forget key', keyForgotten: 'The server key is forgotten.',
      demoCreate: 'Create a demo room', demoNote: 'Demo: the room lives in this tab only; the other officers are scripted.',
      knockTitle: 'Waiting for confirmation', resuming: 'Returning to the room…',
      knockText: 'Say this word on the radio. Anyone already in the room confirms you. The word lasts 5 minutes.',
      cancel: 'Cancel', leave: 'Leave', leaveAsk: 'Leave for sure?', observerBadge: 'Observer',
      tabs: { roster: 'Roster' }, shelf: 'Roster {n}', knockBadge: 'knock {n}',
      confirm: 'Confirm', gone: 'Dropped', goneAsk: 'Drop for sure?', claim: 'Take over', knocking: 'waiting', wordsAsk: 'Word heard:',
      knockWaiting: 'Waiting to join: {who}',
      sheet: 'Briefing sheet', sheetAll: 'Whole sheet', sheetHead: 'Command tablet',
      sheetHint: 'Enter the post code as one line: ROOM-CODE.', roomCode: 'Room', copy: 'Copy', copied: 'Copied',
      observerLink: 'Moderator link', observerFail: 'No moderator link yet: try again.',
      rotate: 'Change code', rotateAsk: 'Every session and the moderator link end. Change?', rotated: 'New room code: {code}. Tell it on the radio.',
      silenceOn: 'Radio silence', silenceOff: 'End radio silence', extend: 'Extend by an hour',
      close: 'Close the room', closeAsk: 'Close for sure?', exportLog: 'Download log', exportJson: 'Download JSON', continueRound: 'Continue this round',
      present: 'I am here', presentAsk: 'No actions from you for 8 minutes: the room drops you at 10.',
      newCode: 'New post code: {code}', pickHint: '{hint} · Esc cancels',
      roomCalBanner: 'Room calibration: {who}, {t}, offset {offset}', roomCalApply: 'Apply here', roomCalKeep: 'Keep mine',
      roomCalApplied: 'Room calibration applied', roomCalApplyFail: 'The room calibration could not be applied.',
      roomCalPublish: 'Publish my calibration', roomCalPublishHint: 'refine it with my own reading', roomCalPublished: 'Your calibration is now the room’s',
      rosterCalRoom: '✓ room calibration', rosterCalOwn: 'own calibration', rosterCalNone: 'no calibration',
      rosterPos: 'position {xy}', rosterPosAge: ' · {n} min',
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
        member: 'This post is already held. Rejoin from the same browser or ask for a reissue.', exists: 'That object already exists.',
        author: 'You cannot carry out your own request.', last: 'Cannot remove the last member who can confirm joins.',
        knocks: 'Too many people waiting, try again in a minute.', rotated: 'The room code was changed — ask staff for the new one.',
        json: 'The server could not read the request.', fields: 'Invalid fields in the change.', field: 'Invalid fields in the change.',
        deleted: 'That object was already removed.', fork: 'This key belongs to another server fork.', reset: 'The room was reset; the change was not sent.',
        early: 'Too early: the round can be extended in its last 20 minutes.', size: 'The change is too large to send.',
        session: 'Your session ended: join the room again.', code: 'Wrong room code.',
        observer: 'The moderator link only reads the room, or it has ended.', collision: 'No free room code came up: try again.',
        client: 'This browser sent a broken id: reload the page.', planet: 'Pick the planet on the map before creating a room.',
        missing: 'That object no longer exists.', extended: 'The round is already extended.', id: 'Invalid object id.',
        fallback: 'Error: {code}'
      }
    },
    ru: {
      toggleRoom: 'Комната', toggleFire: 'Огонь', entryAria: 'Панель огня или комната офицеров',
      entryLead: 'Комната офицеров: штаб отправляет запросы на удар и позицию, расчёт отвечает статусами.',
      entryIn: 'Вы в комнате {code} · {post}', entryKnock: 'Ждёте входа в комнату {code}',
      keyHelp: 'Этот ключ администрация сервера выдаёт офицерам, которые открывают комнаты. Чтобы войти в комнату, ключ не нужен — только код с листа брифинга.',
      keySavedHint: 'Оставьте поле пустым — будет использован сохранённый ключ.', keyEmpty: 'Вставьте ключ сервера: длинная строка, начинается с eyJ.',
      keyNotToken: 'Это не ключ сервера. Ключ — длинная строка, начинается с eyJ; код с листа брифинга вводится в форму входа выше.',
      keyOtherFork: 'Этот ключ выдан для форка {fork}, а на карте выбран {current}. Выберите этот форк над картой.',
      entryTitle: 'Войти в комнату', entryLabel: 'Код с листа брифинга', entryHint: 'K7M4Q2 или K7M4Q2-SK4B',
      callsign: 'Позывной (необязательно)', post: 'Должность', squad: 'Отряд', join: 'Войти',
      createTitle: 'Создать комнату (штаб)', serverKey: 'Ключ сервера', createPost: 'Ваша должность', create: 'Создать',
      keySaved: 'ключ сохранён', keyReplace: 'заменить', keyForget: 'забыть ключ', keyForgotten: 'Ключ сервера забыт.',
      demoCreate: 'Создать демо-комнату', demoNote: 'Демо: комната живёт только в этой вкладке, остальные офицеры сыграны сценарием.',
      knockTitle: 'Ждём подтверждения', resuming: 'Возвращаемся в комнату…',
      knockText: 'Назовите это слово по рации. Подтвердит любой участник, который уже в комнате. Слово действует 5 минут.',
      cancel: 'Отменить', leave: 'Выйти', leaveAsk: 'Точно выйти?', observerBadge: 'Наблюдатель',
      tabs: { roster: 'Реестр' }, shelf: 'Реестр {n}', knockBadge: 'стук {n}',
      confirm: 'Подтвердить', gone: 'Выбыл', goneAsk: 'Точно выбыл?', claim: 'Занять', knocking: 'ждёт', wordsAsk: 'Услышанное слово:',
      knockWaiting: 'Ждёт входа: {who}',
      sheet: 'Лист брифинга', sheetAll: 'Весь лист', sheetHead: 'Командный планшет',
      sheetHint: 'Код должности вводится одной строкой: КОМНАТА-КОД.', roomCode: 'Комната', copy: 'Копировать', copied: 'Скопировано',
      observerLink: 'Ссылка для модератора', observerFail: 'Ссылка для модератора не выдана: попробуйте ещё раз.',
      rotate: 'Сменить код', rotateAsk: 'Все сессии и ссылка для модератора закроются. Сменить?', rotated: 'Новый код комнаты: {code}. Передайте по рации.',
      silenceOn: 'Радиомолчание', silenceOff: 'Снять радиомолчание', extend: 'Продлить на час',
      close: 'Закрыть комнату', closeAsk: 'Точно закрыть?', exportLog: 'Скачать журнал', exportJson: 'Скачать JSON', continueRound: 'Продолжить раунд',
      present: 'На месте', presentAsk: 'От вас 8 минут нет действий: через 10 комната снимет вас с должности.',
      newCode: 'Новый код должности: {code}', pickHint: '{hint} · Esc — отмена',
      roomCalBanner: 'Привязка комнаты: {who}, {t}, сдвиг {offset}', roomCalApply: 'Применить у себя', roomCalKeep: 'Оставить свою',
      roomCalApplied: 'Привязка комнаты применена', roomCalApplyFail: 'Привязку комнаты не удалось применить.',
      roomCalPublish: 'Опубликовать мою привязку', roomCalPublishHint: 'уточнить своим замером', roomCalPublished: 'Ваша привязка теперь привязка комнаты',
      rosterCalRoom: '✓ привязка комнаты', rosterCalOwn: 'своя привязка', rosterCalNone: 'нет привязки',
      rosterPos: 'позиция {xy}', rosterPosAge: ' · {n} мин',
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
        member: 'Эта должность уже занята участником. Войдите с того же браузера или попросите «Занять».', exists: 'Такой объект уже есть — кто-то создал его раньше.',
        author: 'Свой запрос нельзя принять или выполнить.', last: 'Нельзя снять последнего, кто может впускать в комнату.',
        knocks: 'Слишком много ожидающих входа, попробуйте через минуту.', rotated: 'Код комнаты сменили — возьмите новый у штаба.',
        json: 'Сервер не понял запрос.', fields: 'Недопустимые поля в изменении.', field: 'Недопустимые поля в изменении.',
        deleted: 'Этот объект уже удалён.', fork: 'Этот ключ выдан для другого форка сервера.', reset: 'Комната перезапущена, изменение не отправлено.',
        early: 'Рано: продлить раунд можно в последние 20 минут.', size: 'Изменение слишком большое для отправки.',
        session: 'Сессия закрыта: войдите в комнату заново.', code: 'Неверный код комнаты.',
        observer: 'Ссылка для модератора только читает комнату или уже не действует.', collision: 'Не удалось подобрать новый код комнаты, попробуйте ещё раз.',
        client: 'Браузер прислал неверный идентификатор: перезагрузите страницу.', planet: 'Выберите планету на карте, прежде чем создавать комнату.',
        missing: 'Этого объекта уже нет.', extended: 'Раунд уже продлён.', id: 'Недопустимый идентификатор объекта.',
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
    pendingHash: {}, drafts: {}, confirming: null, sheetSquad: '', renderQueued: false, forceRender: false,
    html: {}, deferred: {}, keyReplace: false, errorForm: null, exporting: false,
    keyMessage: null, available: false, policyMissing: {}, policyFails: 0, retryAt: 0,
    editAt: 0, selectOpen: false, selectEl: null, deferTimer: 0,
    lastError: null, narrow: false, fixtureLoading: null, toastEl: null, toastTimer: 0,
    calKeep: {}, calSync: null   // «Оставить свою» per room code (memory copy of sessionStorage); the `cal` sync state
  };

  // ── helpers ─────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }
  function has(obj, key) { return !!obj && Object.prototype.hasOwnProperty.call(obj, key); }
  function cls(s) { return String(s === null || s === undefined ? '' : s).replace(/[^A-Za-z0-9_-]/g, ''); }
  function safeColor(c) { return /^#[0-9A-Fa-f]{3,8}$/.test(String(c)) ? c : '#ffffff'; }
  function warn(where, e) {
    try {
      if (!root.console || !root.console.warn) return;
      if (e === undefined) root.console.warn('room: ' + where); else root.console.warn('room: ' + where, e);
    } catch (x) { /* never break */ }
  }
  // Every module hook runs on its own: one throwing module never stops the others, the shell or Series T.
  function eachModule(part, run) {
    modules.forEach(function (m) {
      if (!m[part]) return;
      try { run(m); } catch (e) { warn(part + ' in ' + (m.id || 'module'), e); }
    });
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] !== undefined ? vars[k] : m; });
  }
  function attrs(data) {
    var out = '';
    for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) out += ' data-' + cls(k) + '="' + esc(data[k]) + '"';
    return out;
  }
  function classes(s) { return String(s || '').split(/\s+/).map(cls).filter(Boolean).join(' '); }
  function btn(action, label, data, extra) {
    return '<button type="button" class="btn-small tac-room-btn' + (extra ? ' ' + classes(extra) : '') + '" data-room-action="' + cls(action) + '"' + attrs(data || {}) + '>' + esc(label) + '</button>';
  }
  function banner(text, kind, actions) {
    return '<div class="tac-banner tac-room-banner' + (kind ? ' ' + classes(kind) : '') + '"><p>' + esc(text) + '</p>' + (actions || '') + '</div>';
  }
  function track(goal) {
    if (ui.demo) return;   // the demo never counts as a real room
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
    var s = ui.policy && has(ui.policy.squads, id) ? ui.policy.squads[id] : null;
    return s ? (LANG === 'ru' ? s.nameRu : s.nameEn) : (id || '');
  }
  function memberName(m) {
    return postName(m.post) + (m.squad ? ' · ' + squadName(m.squad) : '') + (m.callsign ? ' «' + m.callsign + '»' : '');
  }
  function fnName(id) {
    var f = ui.policy && ui.policy.functions.filter(function (x) { return x.id === id; })[0];
    return f ? (LANG === 'en' && f.nameEn ? f.nameEn : f.nameRu) : id;
  }
  function planetName(id) {
    var ctx = ui.hooks ? ui.hooks.getContext() : null;
    var p = ctx && ctx.fork ? ctx.fork.planets.filter(function (x) { return x.id === id; })[0] : null;
    return p ? p.name : (id || '');
  }
  function errorText(code) { return has(T.errors, code) ? T.errors[code] : fmt(T.errors.fallback, { code: code }); }
  // The client's error as the panel shows it: none for a session that ended, since the «expired» banner already says so.
  function shownError(c) {
    if (!c || !c.error || c.error === 'network') return null;
    return c.status === 'expired' && (c.error === 'session' || c.error === 'rotated') ? null : c.error;
  }
  function planetOk() {
    var m = ui.client && ui.client.meta;
    if (!m || !m.planet) return true;   // meta not loaded yet
    var ctx = ui.hooks ? ui.hooks.getContext() : null;
    return !!(ctx && ctx.meta && ctx.meta.id === m.planet);
  }
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

  // ── stage 2a: the room calibration (docs/design/2026-09-14-tactical-tablet-stage2a.md §3.4) ──

  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && Math.abs(v) <= MAX_COORD; }
  function isPair(v) { return Array.isArray(v) && v.length === 2 && isInt(v[0]) && isInt(v[1]); }
  function samePair(a, b) { return isPair(a) && isPair(b) && a[0] === b[0] && a[1] === b[1]; }
  function signed(n) { return n > 0 ? '+' + n : String(n); }   // as the Fire panel writes an offset
  // The Fire panel's calibration for the planet on the map, or null.
  function fireCal() {
    var ctx = ui.hooks ? ui.hooks.getContext() : null, c = ctx && ctx.calibration;
    return c && isPair(c.offset) ? c : null;
  }
  function roomCal() {
    var c = ui.client && typeof ui.client.calibration === 'function' ? ui.client.calibration() : null;
    return c && isPair(c.offset) ? c : null;
  }
  // «Орлов (Офицер штаба)»: the callsign lives on the member object; without one, or once that member is gone, the post alone.
  function publisherName(by) {
    if (!by) return '';
    var m = ui.client.members().filter(function (x) { return x.client === by.client; })[0];
    var post = postName((m && m.post) || by.post);
    return m && m.callsign ? m.callsign + ' (' + post + ')' : post;
  }
  // «Оставить свою» holds per room code until the room calibration's `at` changes; memory answers when sessionStorage throws.
  function calKept(code) {
    var k = CAL_KEEP_PREFIX + code;
    if (has(ui.calKeep, k)) return ui.calKeep[k];
    try { return root.sessionStorage.getItem(k); } catch (e) { return null; }
  }
  function keepCal(code, at) {
    var k = CAL_KEEP_PREFIX + code;
    ui.calKeep[k] = String(at);
    try { root.sessionStorage.setItem(k, String(at)); } catch (e) { /* memory keeps it for this page */ }
  }
  // Tile and reading travel only when they agree with the offset (offset = reading − tile), as the contract demands.
  function calPublishData(cal) {
    var data = { offset: cal.offset.slice() };
    if (isPair(cal.tile) && isPair(cal.reading) && samePair([cal.reading[0] - cal.tile[0], cal.reading[1] - cal.tile[1]], cal.offset)) {
      data.tile = cal.tile.slice();
      data.reading = cal.reading.slice();
    }
    return data;
  }
  function calKey(v) { return isPair(v) ? v[0] + ',' + v[1] : 'none'; }

  // The room calibration differs from mine, or I have none: apply it (the Fire panel hook, only with tile and reading) or keep mine.
  function calBannerHtml() {
    var c = ui.client, rc = roomCal(), mine = fireCal();
    if (c.status !== 'in' || !rc || !planetOk() || (mine && samePair(mine.offset, rc.offset))) return '';
    if (calKept(c.code) === String(rc.at)) return '';
    var text = fmt(T.roomCalBanner, { who: publisherName(rc.by), t: hhmm(rc.at), offset: signed(rc.offset[0]) + ' ' + signed(rc.offset[1]) });
    var apply = isPair(rc.tile) && isPair(rc.reading) && typeof ui.hooks.applyCalibration === 'function' ? btn('calApply', T.roomCalApply) : '';
    return banner(text, 'warn cal', apply + btn('calKeep', T.roomCalKeep, { at: rc.at }));
  }

  // «Опубликовать мою привязку» in the tools row: my calibration differs from the room's, or the room has none.
  function calToolsHtml() {
    var c = ui.client, mine = fireCal(), rc = roomCal();
    if (c.status !== 'in' || !mine || !can('publishCalibration') || !planetOk() || (rc && samePair(rc.offset, mine.offset))) return '';
    return '<button type="button" class="btn-small tac-room-btn tac-room-cal-publish" data-room-action="calPublish">' +
      esc(T.roomCalPublish) + '<small>' + esc(T.roomCalPublishHint) + '</small></button>';
  }

  // Roster marks of a confirmed member: which calibration they work by (nothing without the field) and their last position.
  function rosterMarks(m) {
    if (!m.confirmed) return '';
    var out = '';
    if (has(m, 'cal')) {
      var rc = roomCal();
      var kind = m.cal === null ? 'none' : rc && samePair(m.cal, rc.offset) ? 'room' : 'own';
      out += '<span class="tac-room-mark tac-room-mark-cal-' + kind + '">' +
        esc(kind === 'room' ? T.rosterCalRoom : kind === 'own' ? T.rosterCalOwn : T.rosterCalNone) + '</span>';
    }
    var p = m.pos;
    if (p && isInt(p.x) && isInt(p.y)) {
      var age = typeof m.posAt === 'number' ? fmt(T.rosterPosAge, { n: Math.max(0, Math.floor((ui.client.serverNow() - m.posAt) / 60000)) }) : '';
      out += '<span class="tac-room-mark tac-room-mark-pos">' + esc(fmt(T.rosterPos, { xy: gameText(p.x, p.y) }) + age) + '</span>';
    }
    return out ? '<span class="tac-room-marks">' + out + '</span>' : '';
  }

  // My Fire panel offset follows me into my member object, so the roster shows who works by which calibration.
  // One write per change and none while one is out. A write refused by a frozen or locked room (423) goes again once it
  // thaws; any other refusal waits for the next change. Nothing is sent while the room is frozen: radio silence refuses
  // a whole batch, and a heartbeat queued beside the patch would go down with it.
  function syncCal() {
    var c = ui.client, mine = me();
    if (!c || c.status !== 'in' || !mine || !mine.confirmed || !mine.id || !ui.policy) return;
    var s = ui.calSync;
    if (!s || s.client !== c || s.code !== c.code || s.member !== mine.id) {
      s = ui.calSync = { client: c, code: c.code, member: mine.id, sent: has(mine, 'cal') ? calKey(mine.cal) : '', busy: false, cid: null };
    }
    var meta = c.meta || {};
    if (s.busy || meta.frozen || meta.locked || meta.closed || !planetOk()) return;   // another planet on the map: not the room's calibration
    var cal = fireCal(), want = cal ? cal.offset.slice() : null, key = calKey(want);
    if (key === s.sent) return;
    var data = { cal: want };
    if (R.validateMemberPatch(ui.policy, mine, data)) { s.sent = key; return; }   // the observer level: the room would refuse it
    var op = { op: 'patch', kind: 'member', id: mine.id, data: data };
    s.busy = true;
    var answer = c.queue(op);
    s.cid = op.cid || null;
    Promise.resolve(answer).then(function (r) {
      s.busy = false;
      s.cid = null;
      if (!(r && !r.ok && (r.status === 423 || r.error === 'reset'))) s.sent = key;
    });
  }
  // The sync writes in the background: nobody clicked, so its refusals never toast.
  function quietOp(op) { return !!(op && ui.calSync && ui.calSync.cid && op.cid === ui.calSync.cid); }
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
    var url = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);   // revoking at once can cancel the download
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
    var client = /[#&]client=([A-Za-z0-9_-]{8,24})/.exec(hash || '');   // dev only: a second officer in the same browser
    var roomdev = /[#&]roomdev=([0-9]{2,5}|off)(?![A-Za-z0-9_-])/.exec(hash || '');   // dev only, local hosts: applyRoomDev
    return { room: room ? room[1] : null, observe: observe ? observe[1] : null, client: client ? client[1] : null, roomdev: roomdev ? roomdev[1] : null };
  }
  // The observer token is a secret: it leaves the address bar (and history) as soon as the panel has read it.
  // Series T's writeHash drops it only after the planet loads, never on a failed load or a same-planet hashchange.
  function stripObserve() {
    var loc = root.location, hist = root.history;
    if (!loc || !hist || !hist.replaceState || !/[#&]observe=/.test(loc.hash || '')) return;
    var rest = String(loc.hash).replace(/^#/, '').split('&').filter(function (p) { return p && p.indexOf('observe=') !== 0; }).join('&');
    try { hist.replaceState(hist.state, '', (loc.pathname || '') + (loc.search || '') + (rest ? '#' + rest : '')); } catch (e) { /* keep going */ }
  }
  // An observer link opened in a tab that already shows the map arrives as a hashchange: read it, strip it, follow it.
  function onHashChange() {
    try {
      var h = parseHash(root.location ? root.location.hash : '');
      stripObserve();
      if (applyRoomDev(h.roomdev) && ui.forkKey) { switchFork(ui.forkKey); return; }
      if (!h.observe) return;
      var ctx = ui.hooks.getContext();
      if (ui.policy && ui.client && !(ctx.fork && ctx.fork.key !== ui.forkKey)) startObserve(h.observe);
      else ui.pendingHash.observe = h.observe;   // switchFork follows it once the policy is loaded
    } catch (e) { warn('hashchange', e); }
  }

  // ── pick mode ────────────────────────────────────────────

  function setPick(mode, handler, hint, keep, onCancel) {
    ui.pick = { mode: mode, handler: handler, keep: !!keep, onCancel: onCancel || null };
    document.body.classList.add('tac-room-picking');
    if (hint) toast(fmt(T.pickHint, { hint: hint }));
    queueRender();
  }
  function clearPick() {
    var p = ui.pick;
    ui.pick = null;
    document.body.classList.remove('tac-room-picking');
    queueRender();
    return p;
  }
  function cancelPick() {
    if (!ui.pick) return;
    var p = clearPick();
    if (p.onCancel) { try { p.onCancel(); } catch (e) { warn('pick cancel', e); } }
  }
  // Series T offers every map click here first. A used pick is not a cancel, so onCancel stays silent.
  function consumePick(tile) {
    if (!ui.on || !ui.pick) return false;
    var p = ui.pick;
    if (!p.keep) clearPick();
    try { p.handler(tile); } catch (e) { warn('pick', e); }
    return true;
  }

  // ── availability and client ────────────────────────────────────

  function devFlags() { return ui.storage.read(DEV_KEY); }
  // Local development only: #roomdev=<port> on 127.0.0.1 or localhost remembers a room Worker on that port and
  // #roomdev=off forgets it, so each test browser needs one link instead of a console snippet. Other hosts ignore it.
  function applyRoomDev(value) {
    var host = root.location ? root.location.hostname : '';
    if (!value || ui.demo || !ui.storage || (host !== '127.0.0.1' && host !== 'localhost')) return false;
    if (value === 'off') ui.storage.remove(DEV_KEY); else ui.storage.write(DEV_KEY, { url: 'http://127.0.0.1:' + value });
    return true;
  }
  function roomUrl() {
    var d = devFlags();
    return (d && d.url) || (ui.root && ui.root.ROOM_URL) || '';
  }
  function available(policy) {
    if (ui.demo) return !!policy;
    if (!policy || !roomUrl()) return false;
    return !!devFlags() || policy.sanction.some(function (s) { return s.status !== 'none'; });
  }
  function validPolicy(p) {
    return !!(p && Array.isArray(p.posts) && Array.isArray(p.sanction) && Array.isArray(p.functions) && Array.isArray(p.assets) &&
      p.squads && p.levels && p.rights && p.limits && p.ttl && p.layers &&
      p.posts.some(function (x) { return x && x.level === 'staff'; }));
  }
  // Only a good policy is cached. A fork the Worker has no policy for (404) stays without a room; any other failure
  // is warned and retried from tick (retryPolicy), so one blip never hides the room entry until the next fork switch.
  function loadPolicy(forkKey) {
    if (has(ui.policies, forkKey)) return Promise.resolve(ui.policies[forkKey]);
    var url = ui.demo ? 'tactical/policy/' + forkKey + '.json?v=1' : roomUrl() ? roomUrl() + '/policy/' + forkKey : null;
    if (!url || typeof root.fetch !== 'function') return Promise.resolve(null);
    return new Promise(function (resolve) { resolve(root.fetch(url)); })
      .then(function (r) {
        if (r && r.status === 404) { ui.policyMissing[forkKey] = true; return null; }
        if (!r || !r.ok) { warn('policy ' + forkKey + ': HTTP ' + (r ? r.status : 'no response')); return null; }
        return r.json();
      })
      .then(function (p) {
        if (p === null) return null;
        if (!validPolicy(p)) { warn('policy ' + forkKey + ': not a room policy'); return null; }
        ui.policies[forkKey] = p;
        return p;
      }, function (e) { warn('policy ' + forkKey, e); return null; });
  }
  function fixtureReady() {
    if (!ui.demo || root.TacRoomFixture) return Promise.resolve();
    if (!ui.fixtureLoading) {
      ui.fixtureLoading = loadScript('tactical/room-fixtures.js?v=2').then(null, function (e) { ui.fixtureLoading = null; throw e; });
    }
    return ui.fixtureLoading;
  }
  // #room=demo starts the demo; a reload of the same tab keeps it (sessionStorage), a fresh visit does not.
  function demoMode(hash) {
    var ss = null, nav = '', kept = false;
    try { ss = root.sessionStorage || null; } catch (e) { ss = null; }
    try { var entry = root.performance.getEntriesByType('navigation')[0]; nav = entry ? entry.type : ''; } catch (e) { nav = ''; }
    try { kept = !!ss && ss.getItem(DEMO_KEY) === '1'; } catch (e) { kept = false; }
    var on = hash.room === 'demo' || (kept && !hash.room && !hash.observe && nav !== 'navigate');
    try { if (ss) { if (on) ss.setItem(DEMO_KEY, '1'); else ss.removeItem(DEMO_KEY); } } catch (e) { /* the demo then ends on reload */ }
    return on;
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
  // room_confirm is counted by the confirmer (actions.confirm), never again by the joiner.
  function onClientUpdate(c) {
    var shown = {};   // a refused batch (for example 423) must not stack one toast per op
    while (c.rejected.length) {
      var r = c.rejected.shift(), msg = errorText(r.error);
      if (!quietOp(r.op) && !shown[msg]) { shown[msg] = true; toast(msg); }
    }
    if (shownError(c) && c.error !== ui.lastError) toast(errorText(c.error));
    ui.lastError = c.error;
    syncTick();
    var current = CURRENT_KEY + ':' + c.client;
    if (c.status === 'expired' || c.status === 'gone') ui.storage.remove(current);   // a reload must not resume a dead session
    else if (c.code && (c.status === 'in' || c.status === 'knocking' || c.status === 'observer')) {
      ui.storage.write(current, { fork: c.fork, code: c.code });
    }
    queueRender();
  }
  // One path for an observer link, whether it came with the page load or a later hashchange.
  function startObserve(token) {
    var parts = String(token).split('.'), watcher = ui.client;
    watcher.stopLoop();
    watcher.observe(parts[0], parts[1]).then(function () { if (ui.client === watcher) watcher.startLoop(); });
    setOn(true);
  }
  function switchFork(key) {
    if (key !== ui.forkKey) { ui.policyFails = 0; ui.keyReplace = false; ui.keyMessage = null; }
    ui.retryAt = 0;
    ui.forkKey = key;
    // A key typed for one fork never rides into another fork's form: writeBox carries the field's value over.
    var typedKey = ui.els.panel && ui.els.panel.querySelector ? ui.els.panel.querySelector('input[name="token"]') : null;
    if (typedKey) typedKey.value = '';
    if (ui.client) ui.client.stopLoop();
    ui.client = null;
    ui.policy = null;
    fixtureReady().then(function () { return loadPolicy(key); }).then(function (policy) {
      if (ui.forkKey !== key) return;
      ui.policy = policy;
      var show = ui.available = available(policy);
      if (!show) {
        // No policy although a room server is set and the fork has one: a blip, so try again after a pause.
        if (!policy && roomUrl() && !ui.demo && !ui.policyMissing[key]) retryPolicy(key);
        setOn(false);
        return;
      }
      ui.policyFails = 0;
      ensureClient();
      var h = ui.pendingHash;
      ui.pendingHash = {};
      if (h.observe) {
        startObserve(h.observe);
      } else {
        var cur = ui.storage.read(CURRENT_KEY + ':' + ui.client.client);
        if (!ui.demo && cur && cur.fork === key && ui.client.restore(cur.code)) ui.client.startLoop();
        if (h.room || ui.demo) { ui.drafts['join.entry'] = h.room && h.room !== 'demo' ? h.room : ''; setOn(true); }
      }
      queueRender();
    }).then(null, function (e) {
      // A broken policy or fixture: no room entry, no half-drawn panel; tick tries again after a pause.
      if (ui.forkKey !== key) return;
      warn('fork ' + key, e);
      if (ui.client) ui.client.stopLoop();
      ui.client = null;
      ui.policy = null;
      ui.available = false;
      retryPolicy(key);
      setOn(false);
    });
  }
  // 5, 10, 20, 40 s, then once a minute while the fork stays: tick() calls switchFork again once retryAt passes.
  function retryPolicy(key) {
    ui.policyFails++;
    var delay = Math.min(60000, 5000 * Math.pow(2, ui.policyFails - 1));
    ui.retryAt = Date.now() + delay;
    warn('policy ' + key + ': retry in ' + Math.round(delay / 1000) + ' s');
  }

  // ── rendering ────────────────────────────────────────────

  // A frame or 100 ms, whichever comes first: a hidden or occluded window pauses frames, and the panel
  // must still follow the officer's clicks. `once` makes the loser a no-op.
  function queueRender(force) {
    if (force === true) ui.forceRender = true;
    if (ui.renderQueued) return;
    ui.renderQueued = true;
    var done = false;
    function once() { if (done) return; done = true; render(); }
    try { if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(once); } catch (e) { /* the timer renders */ }
    setTimeout(once, 100);   // the global timer: a bare window stub (Node module tests) has none of its own
  }

  // ── the room entry ─────────────────────────────────────────
  // The switch between the fire panel and the room heads the right-hand column. It replaced a toolbar toggle whose
  // label flipped between «Комната» and «Огонь», which officers read as a button that had vanished.
  function entryHtml() {
    var c = ui.client, inside = !!(c && c.code && (c.status === 'in' || c.status === 'knocking'));
    var pings = 0;
    eachModule('entryBadge', function (m) { pings += +m.entryBadge(api) || 0; });
    function seg(on, target, label, extra) {
      return '<button type="button" role="tab" class="tac-seg' + (on ? ' on' : '') + (extra ? ' ' + extra : '') + '" aria-selected="' + on +
        '" data-room-entry="' + target + '">' + label + '</button>';
    }
    var roomLabel = (pings && !ui.on ? '<span class="tac-room-entry-dot" aria-hidden="true">●</span>' : '') +
      esc(T.toggleRoom + (inside ? ' · ' + c.code : ''));
    var lead = '';
    if (!ui.on) {
      var text = !inside ? T.entryLead : c.status === 'knocking' ? fmt(T.entryKnock, { code: c.code })
        : fmt(T.entryIn, { code: c.code, post: c.me ? postName(c.me.post) : '' });
      lead = '<p class="tac-room-entry-lead">' + esc(text) + '</p>';
    }
    return '<div class="tac-room-switch" role="tablist" aria-label="' + esc(T.entryAria) + '">' +
      seg(!ui.on, 'fire', esc(T.toggleFire)) + seg(ui.on, 'room', roomLabel, 'tac-room-entry-room') + '</div>' + lead;
  }
  // Shown only where the room is available; the body class lets room.css retire Series T's beta notice there.
  function renderEntry() {
    var box = ui.els.entry, show = !!ui.available;
    if (!box) return;
    box.classList.toggle('tac-hide', !show);
    if (document.body && document.body.classList) document.body.classList.toggle('tac-room-available', show);
    var html = show ? entryHtml() : '';
    if (html !== ui.html.entry) { box.innerHTML = html; ui.html.entry = html; }
  }

  function collect(part) {
    var out = '';
    eachModule(part, function (m) { out += m[part](api) || ''; });
    return out;
  }

  function knockingMembers() {
    return ui.client ? ui.client.members().filter(function (m) { return !m.confirmed; }) : [];
  }

  function tabs() {
    var knocks = knockingMembers().length;
    var list = [{ id: 'roster', label: T.tabs.roster + (knocks ? ' · ' + fmt(T.knockBadge, { n: knocks }) : ''), narrow: false }];
    eachModule('tabs', function (m) { list = list.concat(m.tabs(api) || []); });
    var narrow = list.filter(function (t) { return t.narrow; });
    return ui.narrow && narrow.length ? narrow : list;
  }

  function tabPanel(id) {
    if (id === 'roster') return rosterHtml();
    for (var i = 0; i < modules.length; i++) {
      var m = modules[i];
      try {
        if (m.tabs && m.tabs(api).some(function (t) { return t.id === id; })) return m.panel(id, api);
      } catch (e) { warn('panel in ' + (m.id || 'module'), e); return ''; }
    }
    return '';
  }

  function inRoom() {
    return !!(ui.client && ['in', 'observer', 'closed'].indexOf(ui.client.status) >= 0);
  }

  function render() {
    ui.renderQueued = false;
    var force = ui.forceRender;
    ui.forceRender = false;
    if (!ui.els.panel) return;
    renderEntry();
    var room = ui.on && inRoom();
    ui.els.chips.classList.toggle('tac-hide', !room);
    ui.els.strip.classList.toggle('tac-hide', !room);
    ui.els.shelf.classList.toggle('tac-hide', !(room && ui.shelf && ui.narrow));
    if (!ui.on) return;
    writeBox('panel', panelHtml(room), force);
    if (room) {
      writeBox('chips', chipsHtml(), force);
      writeBox('strip', collect('strip'), force);
      if (ui.shelf && ui.narrow) writeBox('shelf', shelfHtml(), force);
    }
    updateCountdowns();
    ui.hooks.view.requestDraw();
  }

  // Writes only what changed, and never under an officer who is typing (a text field with input in the
  // last 4 s) or has a list open: that write waits for focusout, the next change event or the 4 s cap.
  // Checkboxes, radios and buttons never hold it back. Clicks and submits force it.
  function writeBox(name, html, force) {
    var box = ui.els[name];
    if (html === ui.html[name]) { ui.deferred[name] = false; return; }
    if (!force && editing(box)) { ui.deferred[name] = true; wakeDeferred(); return; }
    var focus = captureFocus(box);
    // The server key lives only in the field's value property, never in markup or drafts: carry it over by hand.
    var keyField = box.querySelector ? box.querySelector('input[name="token"]') : null;
    var key = keyField ? keyField.value : '';
    box.innerHTML = html;
    if (key) { var fresh = box.querySelector('input[name="token"]'); if (fresh) fresh.value = key; }
    ui.html[name] = html;
    ui.deferred[name] = false;
    restoreFocus(box, focus);
  }
  function editing(box) {
    var el = document.activeElement;
    if (!el || el === box || !box.contains(el) || Date.now() - ui.editAt >= EDIT_HOLD_MS) return false;
    var tag = el.tagName || '';
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') return /^(text|search|email|url|tel|password|number)?$/.test(String(el.type || '').toLowerCase());
    return tag === 'SELECT' && ui.selectOpen;
  }
  function wakeDeferred() {
    if (ui.deferTimer) return;
    ui.deferTimer = setTimeout(function () {
      ui.deferTimer = 0;
      if (anyDeferred()) queueRender();
    }, Math.max(50, EDIT_HOLD_MS - (Date.now() - ui.editAt) + 50));
  }
  function anyDeferred() {
    for (var k in ui.deferred) if (has(ui.deferred, k) && ui.deferred[k]) return true;
    return false;
  }

  function panelHtml(room) {
    if (!ui.policy || !ui.client) return '';
    var c = ui.client;
    if (!room) {
      var top = '';
      if (c.status === 'expired') top = banner(T.banners.expired, 'warn');
      if (c.status === 'gone') top = banner(T.banners.gone, 'warn');
      if (!ui.storage.ok && !ui.demo) top += banner(T.banners.storage);
      if (c.status === 'resuming') return top + resumingHtml();
      return top + (c.status === 'knocking' ? knockHtml() : homeHtml());
    }
    var list = tabs();
    if (!ui.tab || !list.some(function (t) { return t.id === ui.tab; })) {
      ui.tab = list.some(function (t) { return t.id === 'requests'; }) ? 'requests' : list[0].id;
    }
    return bannersHtml() + headHtml() +
      (c.status === 'in' ? '<div class="tac-room-tools">' + collect('tools') + calToolsHtml() + '</div>' : '') +
      '<div class="tac-room-tabs" role="tablist">' + list.map(function (t) {
        return '<button type="button" role="tab" class="tac-seg' + (t.id === ui.tab ? ' on' : '') + '" aria-selected="' + (t.id === ui.tab) + '" data-room-action="tab" data-tab="' + esc(t.id) + '">' + esc(t.label) + '</button>';
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
    var callsignMax = Math.max(1, Math.floor(+P.limits.callsign) || 20);
    var error = shownError(c) ? '<p class="tac-msg error">' + esc(errorText(c.error)) + '</p>' : '';
    var inCreate = ui.errorForm === 'create';   // the error shows inside the form that was sent
    // The server key never comes back into the page: a saved key is only named, and replacing it starts from an empty field.
    var savedKey = ui.demo ? null : ui.storage.read(KEY_PREFIX + ui.forkKey);
    var keyField = ui.demo ? '<p class="tac-muted">' + esc(T.demoNote) + '</p>'
      : savedKey && !ui.keyReplace
        ? '<p class="tac-muted tac-room-keyline">' + esc(T.keySaved) + ' · ' + btn('keyReplace', T.keyReplace) + ' ' + btn('keyForget', T.keyForget) + '</p>'
        : '<label class="tac-input-label">' + esc(T.serverKey) + '<input class="tac-input" type="password" name="token" autocomplete="new-password" spellcheck="false"></label>' +
          '<p class="tac-muted tac-room-keyline">' + esc(savedKey ? T.keySavedHint : T.keyHelp) + '</p>' +
          (savedKey ? '<p class="tac-muted tac-room-keyline">' + btn('keyForget', T.keyForget) + '</p>' : '');
    return '<section class="tac-section"><h2>' + esc(T.entryTitle) + '</h2>' +
      '<form data-room-form="join" class="tac-room-form">' +
      '<label class="tac-input-label">' + esc(T.entryLabel) +
      '<input class="tac-input tac-room-code" name="entry" autocomplete="off" spellcheck="false" value="' + esc(entry) + '" placeholder="' + esc(T.entryHint) + '"></label>' +
      '<div class="tac-room-postpick' + (withPost ? ' tac-hide' : '') + '">' +
      selectHtml('join', 'post', T.post, posts, draft('join', 'post', posts[0][0])) +
      (squads.length ? selectHtml('join', 'squad', T.squad, squads, draft('join', 'squad', squads[0][0])) : '') + '</div>' +
      '<label class="tac-input-label">' + esc(T.callsign) + '<input class="tac-input" name="callsign" maxlength="' + callsignMax + '" value="' + esc(draft('join', 'callsign', '')) + '"></label>' +
      '<button type="submit" class="btn-small tac-room-btn">' + esc(T.join) + '</button>' + (inCreate ? '' : error) +
      '</form></section>' +
      '<section class="tac-section"><details data-room-details="create"' + (draft('create', 'open', ui.demo) ? ' open' : '') + '><summary>' + esc(T.createTitle) + '</summary>' +
      '<form data-room-form="create" class="tac-room-form">' + keyField +
      selectHtml('create', 'post', T.createPost, staff, draft('create', 'post', staff[0][0])) +
      '<label class="tac-input-label">' + esc(T.callsign) + '<input class="tac-input" name="callsign" maxlength="' + callsignMax + '" value="' + esc(draft('create', 'callsign', '')) + '"></label>' +
      '<button type="submit" class="btn-small tac-room-btn">' + esc(ui.demo ? T.demoCreate : T.create) + '</button>' +
      (ui.keyMessage ? '<p class="tac-msg error">' + esc(ui.keyMessage) + '</p>' : inCreate ? error : '') +
      '</form></details></section>';
  }

  // A saved session is being checked: no join or create form, so nothing sent now can race the restore poll.
  function resumingHtml() {
    return (ui.client.error === 'network' ? banner(T.banners.network, 'warn') : '') +
      '<section class="tac-section"><p class="tac-muted">' + esc(T.resuming) + '</p>' +
      btn('leave', ui.confirming === 'leave' ? T.leaveAsk : T.leave) + '</section>';
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

  // The Worker exports to staff and the observer only: the crew never sees a button that would be refused.
  function canExport() { return !!ui.client && (ui.client.status === 'observer' || isStaff()); }
  function exportButtons() { return canExport() ? btn('exportLog', T.exportLog) + btn('exportJson', T.exportJson) : ''; }

  function bannersHtml() {
    var c = ui.client, m = c.meta || {}, now = c.serverNow(), out = [];
    if (!ui.storage.ok && !ui.demo) out.push(banner(T.banners.storage));
    if (c.error === 'network') out.push(banner(T.banners.network, 'warn'));
    if (m.frozen) out.push(banner(fmt(has(T.banners, m.frozen.reason) ? T.banners[m.frozen.reason] : T.banners.silence, { t: hhmm(m.frozen.at) }), 'frozen'));
    if (c.status === 'in' && can('confirmJoin')) {
      // The Roster tab is hidden on a narrow screen: the knock shows here at any width.
      var knocking = knockingMembers();
      knocking.forEach(function (k) {
        var who = memberName(k) + (knocking.length < 2 && k.word ? ' · ' + k.word : '');
        out.push(banner(fmt(T.knockWaiting, { who: who }), 'warn',
          knocking.length >= 2 ? wordChoices(k, knocking) : btn('confirm', T.confirm, { client: k.client }, 'big')));
      });
    }
    if (m.locked && !m.closed) out.push(banner(T.banners.locked, 'warn', isStaff() ? btn('continueRound', T.continueRound) + btn('close', ui.confirming === 'close' ? T.closeAsk : T.close) : ''));
    if (m.closed) out.push(banner(T.banners.closed, 'warn', exportButtons()));
    if (!m.closed && m.warnAt && now >= m.warnAt) out.push(banner(fmt(T.banners.warn, { t: hhmm(m.maxAt) }), 'warn', canExtend() ? btn('extend', T.extend) : ''));
    if (m.planet && !planetOk()) out.push(banner(fmt(T.banners.planet, { planet: planetName(m.planet) })));
    out.push(calBannerHtml());
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
    else if (c.status === 'observer') html += '<div class="tac-room-staff">' + exportButtons() + '</div>';
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
    var name = memberName(m);
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
      '<span class="tac-room-sig tac-room-sig-' + cls(style.level) + '" style="--sig:' + esc(safeColor(style.color)) + '"></span>' +
      '<span class="tac-room-name">' + esc(name) + tags + waiting + rosterMarks(m) + '</span>' +
      '<span class="tac-room-actions">' + actions + '</span></div>';
  }

  function sheetMarkup(filter) {
    var c = ui.client, P = ui.policy;
    function lines(list) {
      var by = {};
      list.forEach(function (s) { (by[s.post] = by[s.post] || []).push(c.code + '-' + s.code); });
      return Object.keys(by).map(function (p) { return postName(p) + ': ' + by[p].join(', '); });
    }
    var out = ['[head=2]' + T.sheetHead + '[/head]', '[bold]' + T.roomCode + ':[/bold] ' + c.code, SITE.replace(/^https?:\/\//, ''), T.sheetHint];
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
          Object.keys(ui.policy.squads).map(function (s) { return '<option value="' + esc(s) + '"' + (s === ui.sheetSquad ? ' selected' : '') + '>' + esc(squadName(s)) + '</option>'; }).join('') +
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
      exportButtons() +
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
    // tabPanel guards every module call: a throwing layers panel leaves the shelf with the roster only.
    return '<div class="tac-room-shelf-inner">' + btn('shelf', '×', null, 'tac-room-close') + rosterHtml() + tabPanel('layers') + '</div>';
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
    if (!ui.on) { cancelPick(); ui.shelf = false; }
    ui.forceRender = true;
    render();
    ui.hooks.redraw();
    syncTick();
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

  // One file per click: a browser blocks a second download started by the same click.
  function exportRoom(asJson) {
    var c = ui.client;
    if (!c || ui.exporting) return;
    ui.exporting = true;
    c.exportRoom().then(function (r) {
      ui.exporting = false;
      if (r.status !== 200 || !r.body) { toast(errorText((r.body && r.body.error) || 'http-' + r.status)); return; }
      var name = 'room-' + cls(c.code) + '-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      if (!asJson && r.body.text) download(name + '.txt', r.body.text, 'text/plain;charset=utf-8');
      else download(name + '.json', JSON.stringify(r.body, null, 1));
      track('room_export');
    }, function () { ui.exporting = false; toast(errorText('network')); });
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
      // The link is off until staff asks: room creation returns no observer token.
      adminThen('observer', null, function (b) {
        if (!b || !b.observerToken) { toast(T.observerFail); return; }
        c.observerToken = b.observerToken;
        c.persist();
        copyText(link(b.observerToken));
      });
    },
    rotate: function () {
      var c = ui.client;
      twoStep('rotate', function () {
        adminThen('rotate', null, function (b) {
          if (!b || !b.code) return;   // no new code came back: nothing changed, no toast
          c.observerToken = null;      // the new code ends the old moderator link
          c.persist();
          toast(fmt(T.rotated, { code: b.code }));
        });
      });
    },
    silence: function () {
      var m = ui.client.meta || {};
      adminThen('silence', { on: !(m.frozen && m.frozen.reason === 'silence') });
    },
    extend: function () { adminThen('extend'); },
    close: function () { twoStep('close', function () { adminThen('close'); }); },
    continueRound: function () { adminThen('unlock'); },
    exportLog: function () { exportRoom(false); },
    exportJson: function () { exportRoom(true); },
    keyReplace: function () { ui.keyReplace = true; ui.keyMessage = null; queueRender(); },
    keyForget: function () {
      ui.storage.remove(KEY_PREFIX + ui.forkKey);
      ui.keyReplace = false;
      ui.keyMessage = null;
      toast(T.keyForgotten);
      queueRender();
    },
    present: function () {
      var mine = me();
      if (mine) ui.client.queue({ op: 'patch', kind: 'member', id: mine.id, data: { presentAt: 1 } });
    },
    calApply: function () {
      var rc = roomCal(), ok = false;
      if (!rc || !isPair(rc.tile) || !isPair(rc.reading) || typeof ui.hooks.applyCalibration !== 'function') return;
      try {
        ok = planetOk() && ui.hooks.applyCalibration({ tile: rc.tile.slice(), reading: rc.reading.slice(), offset: rc.offset.slice() }) === true;
      } catch (e) { warn('applyCalibration hook', e); }
      toast(ok ? T.roomCalApplied : T.roomCalApplyFail);
      queueRender();
    },
    // The `at` shown on the banner, not the latest: a calibration published meanwhile is never kept unseen.
    calKeep: function (el) {
      if (!ui.client || !ui.client.code) return;
      keepCal(ui.client.code, el.getAttribute('data-at'));
      queueRender();
    },
    calPublish: function () {
      var c = ui.client, mine = fireCal();
      if (!c || c.status !== 'in' || !mine || !can('publishCalibration') || !planetOk()) return;
      c.queue({ op: 'put', kind: 'calibration', id: 'calibration', data: calPublishData(mine) }).then(function (r) {
        if (r && r.ok) toast(T.roomCalPublished);
        queueRender();
      });
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
    if (ui.renderQueued) ui.forceRender = true;   // the officer clicked: show the result even if a field keeps focus
  }

  // A change event closes the open list, so a waiting write is safe now.
  function onChange(e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute('data-room-change')) {
      var fn = findHandler('changes', el.getAttribute('data-room-change'));
      if (fn) fn(el, api, e);
    } else {
      onInput(e);
    }
    ui.selectOpen = false;
    if (ui.renderQueued || anyDeferred()) queueRender(true);
  }

  function onFocusOut() { ui.selectOpen = false; if (anyDeferred()) queueRender(); }

  // A native list has no "open" event: a press on a SELECT (or its keyboard opener) counts as open
  // until a change, focusout, a closing key, a second press or the 4 s cap.
  function onPointerDown(e) {
    var t = e.target, isSelect = !!(t && t.tagName === 'SELECT');
    ui.selectOpen = isSelect && !(ui.selectOpen && ui.selectEl === t);
    ui.selectEl = isSelect ? t : null;
    if (ui.selectOpen) ui.editAt = Date.now();
  }
  function onFieldKey(e) {
    var t = e.target;
    if (!t || t.tagName !== 'SELECT') return;
    if (e.key === ' ' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) { ui.selectOpen = true; ui.selectEl = t; ui.editAt = Date.now(); }
    else if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'Tab') { ui.selectOpen = false; if (anyDeferred()) queueRender(); }
  }

  function onToggle(e) {
    var el = e.target, name = el && el.getAttribute ? el.getAttribute('data-room-details') : null;
    if (name) ui.drafts[name + '.open'] = !!el.open;
  }

  function onInput(e) {
    var el = e.target;
    if (!el.name || !el.form) return;
    ui.editAt = Date.now();
    if (el.type === 'password') return;   // the server key never enters drafts, so never markup
    var form = el.form.getAttribute('data-room-form');
    ui.drafts[form + '.' + el.name] = el.type === 'checkbox' ? el.checked : el.value;
    if (form === 'join' && el.name === 'entry') {
      var pick = el.form.querySelector('.tac-room-postpick');
      if (pick) pick.classList.toggle('tac-hide', el.value.indexOf('-') >= 0);
    }
  }

  // The claims half of a server token (base64url JSON, a dot, the signature). The page never checks the signature,
  // only the shape and the fork, so a code from the briefing sheet or a key for another fork gets a plain answer.
  function tokenClaims(token) {
    try {
      var parts = String(token).split('.');
      if (parts.length !== 2 || !parts[1]) return null;
      var part = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      part += '==='.slice((part.length + 3) % 4);
      var bin = atob(part), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var claims = JSON.parse(new TextDecoder().decode(bytes));
      return claims && typeof claims.fork === 'string' && typeof claims.keyId === 'string' ? claims : null;
    } catch (e) { return null; }
  }
  function keyProblem(token, fork) {
    if (!token) return T.keyEmpty;
    var claims = tokenClaims(token);
    if (!claims) return T.keyNotToken;
    if (claims.fork === fork) return null;
    var ctx = ui.hooks.getContext();
    return fmt(T.keyOtherFork, { fork: claims.fork, current: ctx.fork && ctx.fork.label ? ctx.fork.label : fork });
  }

  function onSubmit(e) {
    var form = e.target;
    var name = form.getAttribute && form.getAttribute('data-room-form');
    if (!name) return;
    e.preventDefault();
    if (name !== 'join' && name !== 'create') {
      var fn = findHandler('submits', name);
      if (fn) fn(form, api, e);
      queueRender(true);
      return;
    }
    var f = form.elements, c = ui.client, ctx = ui.hooks.getContext();
    if (!c) return;
    c.error = null;
    ui.errorForm = name;
    c.planet = ctx.meta ? ctx.meta.id : c.planet;
    c.h = ctx.meta ? ctx.meta.h : c.h;
    if (name === 'join') {
      c.join({ entry: f.entry.value, post: f.post.value, squad: f.squad ? f.squad.value : null, callsign: f.callsign.value }).then(function () {
        if (c.status === 'knocking' || c.status === 'in') { clearDrafts('join'); c.startLoop(); }
        queueRender(true);
      });
    } else {
      var fork = ui.forkKey;
      var saved = ui.demo ? null : ui.storage.read(KEY_PREFIX + fork);
      var typed = !ui.demo && f.token ? String(f.token.value || '').trim() : '';
      var token = ui.demo ? 'demo' : typed || saved || '';
      ui.keyMessage = ui.demo ? null : keyProblem(token, fork);
      if (ui.keyMessage) { queueRender(true); return; }   // nothing leaves the page with a key that cannot fit
      var before = c.code;
      c.createRoom({ token: token, keyId: ui.demo ? 'demo' : tokenClaims(token).keyId, post: f.post.value, callsign: f.callsign.value }).then(function () {
        // A restore poll can turn the status to `in` meanwhile: only a new room code proves this create worked.
        // A network blip on the first poll after it does not undo a created room.
        if (c.code && c.code !== before && (!c.error || c.error === 'network')) {
          // Kept only once it has opened a room: a mistyped key never replaces a good one.
          if (typed && typed !== saved) ui.storage.write(KEY_PREFIX + fork, typed);
          ui.keyReplace = false;
          clearDrafts('create'); track('room_create'); c.startLoop(); ui.tab = null;
        }
        queueRender(true);
      });
    }
  }

  // ── lifecycle ────────────────────────────────────────────

  function tick() {
    try {
      var ctx = ui.hooks.getContext();
      if (ctx.fork && ui.forkKey !== ctx.fork.key) { switchFork(ctx.fork.key); syncTick(); return; }
      if (ui.retryAt && Date.now() >= ui.retryAt) { switchFork(ui.forkKey); syncTick(); return; }
      var planet = ctx.meta ? ctx.meta.id : null;
      if (planet !== ui.planetId) { ui.planetId = planet; if (ui.on) queueRender(); }
      updateCountdowns();
    } catch (e) { warn('tick', e); return; }
    try { syncCal(); } catch (e) { warn('cal sync', e); }
    eachModule('tick', function (m) { m.tick(api); });
    syncTick();
  }

  // The 1 s tick runs on the page's own timers for a visitor who is not in a room (a hidden page may doze, and
  // TacRoom.timers would start a worker for nothing), and on TacRoom.timers while the panel shows a room with a code,
  // so the request ping keeps its pace in a window behind the game. One interval at a time; the old one goes after the new starts.
  function syncTick() {
    if (!ui.hooks) return;
    var worker = ui.root && ui.root.timers;
    var room = ui.on && !!(ui.client && ui.client.code);
    var clock = room && worker && typeof worker.setInterval === 'function' && typeof worker.clearInterval === 'function' ? worker : root;
    var cur = ui.tickTimer;
    if (cur && cur.timers === clock) return;
    try {
      ui.tickTimer = { timers: clock, id: clock.setInterval(tick, 1000) };
    } catch (e) { warn('tick timer', e); return; }
    if (cur) { try { cur.timers.clearInterval(cur.id); } catch (e) { warn('tick timer', e); } }
  }

  function mount(hooks, apiRoot) {
    if (root.top !== root.self) return;   // never run inside a frame: a foreign page cannot click «Подтвердить» for staff
    if (ui.hooks) return;                 // attach runs once
    ui.hooks = hooks;
    ui.root = apiRoot;
    ui.els = { entry: $('tacRoomEntry'), panel: $('tacRoom'), chips: $('tacRoomChips'), strip: $('tacRoomStrip'), shelf: $('tacRoomShelf'), draw: $('tacRoomDraw') };
    if (!ui.els.panel || !ui.els.entry || !ui.els.chips || !ui.els.strip || !ui.els.shelf) return;
    ui.pendingHash = parseHash(root.location.hash);
    stripObserve();
    if (root.addEventListener) root.addEventListener('hashchange', onHashChange);
    ui.clientHash = ui.pendingHash.client;
    ui.demo = demoMode(ui.pendingHash);
    var ls = null;
    try { ls = root.localStorage; } catch (e) { ls = null; }   // the getter itself throws when site data is blocked
    ui.storage = apiRoot.makeStorage(ui.demo ? null : ls);    // the demo keeps everything in memory
    applyRoomDev(ui.pendingHash.roomdev);
    ui.els.entry.addEventListener('click', function (e) {
      var tab = e && e.target && e.target.closest ? e.target.closest('[data-room-entry]') : null;
      if (!tab) return;
      var want = tab.getAttribute('data-room-entry') === 'room';
      if (want !== ui.on) setOn(want);
    });
    [ui.els.panel, ui.els.chips, ui.els.strip, ui.els.shelf].forEach(function (box) {
      box.addEventListener('click', onClick);
      box.addEventListener('change', onChange);
      box.addEventListener('input', onInput);
      box.addEventListener('submit', onSubmit);
      box.addEventListener('focusout', onFocusOut);
      box.addEventListener('mousedown', onPointerDown);
      box.addEventListener('keydown', onFieldKey);
      box.addEventListener('toggle', onToggle, true);   // toggle does not bubble; capture still reaches the box
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
      if (!ui.on || !inRoom() || !planetOk()) return;   // room objects belong to the room's planet only
      eachModule('draw', function (m) {
        ctx.save();
        try { m.draw(ctx, v, api); } finally { ctx.restore(); }
      });
    });
    eachModule('mount', function (m) { m.mount(api); });
    // The tick runs for the page (leaving the room still needs fork switches); syncTick moves it between the page
    // timers and TacRoom.timers as the officer enters or leaves a room.
    syncTick();
    tick();
  }

  function notify(event, payload) {
    if (!ui.on || !inRoom()) return;
    eachModule('notify', function (m) { m.notify(event, payload, api); });
  }

  var api = {
    R: R, LANG: LANG, ui: ui,
    T: function () { return T; },
    esc: esc, fmt: fmt, btn: btn, banner: banner, render: queueRender, toast: toast, errorText: errorText,
    setPick: setPick, cancelPick: cancelPick, hhmm: hhmm, mmss: mmss,
    postName: postName, squadName: squadName, fnName: fnName, planetName: planetName,
    offset: offset, gameText: gameText, toWorld: toWorld, me: me, can: can, isStaff: isStaff, myLayer: myLayer, planetOk: planetOk,
    draft: draft, clearDrafts: clearDrafts, track: track, copyText: copyText, download: download
  };

  root.TacRoomUI = {
    api: api,
    register: function (module) {
      modules.push(module);
      if (!module.l10n) return;
      var clashes = [];
      function clash(key) { if (clashes.indexOf(key) < 0) clashes.push(key); }
      ['en', 'ru'].forEach(function (lang) {
        var src = module.l10n[lang] || {}, dst = L10N[lang];
        Object.keys(src).forEach(function (k) {
          if (k === 'tabs' || k === 'errors') {
            Object.keys(src[k]).forEach(function (t) { if (has(dst[k], t)) clash(k + '.' + t); dst[k][t] = src[k][t]; });
          } else {
            if (has(dst, k)) clash(k);
            dst[k] = src[k];
          }
        });
      });
      // A clash replaces the shell's own text: a module 'claim' once relabelled the destructive reissue button.
      if (clashes.length) warn('l10n keys of ' + (module.id || 'a module') + ' override existing keys: ' + clashes.join(', '));
    },
    mount: mount,
    notify: notify,
    consumePick: consumePick
  };
})(window);

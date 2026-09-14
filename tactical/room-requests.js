// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Officers' room — strike and support requests (form, cards, the Series T fire
// card inside a taken mortar request), the manual asset board with cooldown
// hints, chips over the map, the request strip, target rings and a ping for
// the asset crew that repeats until the request is handled or heard, and stays
// quiet while the room is frozen (radio silence), locked or closed.
// Registers into tactical/room-ui.js.
//
// Stage 1 offered mortar strikes and mortar position requests for the staff officer / mortar crew pair.
// Stage 2a (docs/design/2026-09-14-tactical-tablet-stage2a.md) adds tasks that may come without a map point,
// an addressee on new requests, «Share position» for every confirmed member and the mortar zone on the map.
//
// Every stored value is room data written by other officers: strings go through
// api.esc, numbers through fmtNum, table lookups through pick (own keys only).
// Pure helpers are exposed as module.helpers for scripts/test_room_requests.js.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  var PREFS_KEY = 'chemdb-tactical:room-prefs';
  var TYPES = ['mortar', 'position', 'task'];
  // State ids match the write whitelist /^[a-z_]{1,20}$/: no camelCase.
  var ASSET_STATES = {
    mortar: ['deployed', 'moving', 'destroyed'], ob: ['ready', 'loading', 'cooldown'],
    dropship: ['offline', 'ship', 'to_lz', 'on_lz', 'flyby', 'cooldown'], supply: ['ready', 'cooldown'], medevac: ['available', 'unavailable']
  };
  var STATE_CLASS = { deployed: 'ready', ready: 'ready', available: 'ready', on_lz: 'ready', ship: 'ready', moving: 'busy', loading: 'busy',
    to_lz: 'busy', flyby: 'busy', cooldown: 'cooldown', offline: 'down', destroyed: 'down', unavailable: 'down' };
  var TYPE_COLOUR = { mortar: '#ffb627', ob: '#ff3d5a', cas: '#00e5ff', supply: '#39ff85', medevac: '#c17aff', other: '#e8ecf4', position: '#00e5ff', task: '#9fb4ff' };
  var DEFAULT_COLOUR = '#e8ecf4';
  // Member positions fade once older than this. Mortar zone fills stay faint so the map reads through them.
  var POS_FADE_MS = 5 * 60000;
  var ZONE = { ring: 'rgba(57, 255, 133, 0.12)', ringLine: 'rgba(57, 255, 133, 0.7)', dead: 'rgba(255, 61, 90, 0.16)', deadLine: 'rgba(255, 61, 90, 0.75)' };
  var LABEL_FONT = '600 11px system-ui, sans-serif';
  var LABEL_HALO = 'rgba(6, 9, 15, 0.95)';
  var BIG_ACTIONS = ['take', 'place', 'accept', 'fire', 'load', 'done', 'deny', 'cancel', 'repeat'];
  // These hand a tile of the room's planet to this page or create a request on it.
  var PLANET_ACTIONS = ['take', 'place', 'repeat'];
  // Request ping. Peak gain per volume step (loud by default: it has to carry over a firefight); tone
  // frequencies in Hz (normal rises once, urgent rises over three tones and plays that rise twice); the
  // repeat interval per pattern; the tone envelope in seconds. Every oscillator stays inside 1.2–2 kHz.
  var HEARD_PREFIX = 'chemdb-tactical:room-heard:';
  var HEARD_MAX = 100;
  var VOLUMES = { quiet: 0.15, normal: 0.3, loud: 0.55 };
  var VOLUME_KEYS = ['quiet', 'normal', 'loud'];
  var DEFAULT_VOLUME = 'loud';
  var PATTERNS = { normal: [[1320, 1760]], urgent: [[1320, 1568, 1976], [1320, 1568, 1976]] };
  var PING_EVERY = { normal: 10000, urgent: 5000 };
  var PING_GAP_MS = 1000;   // the longest pattern lasts 0.84 s: a new one never starts over it
  var TONE = { length: 0.09, gap: 0.04, groupGap: 0.12, attack: 0.005, decay: 0.08, lead: 0.02, square: 0.3, lowpass: 2400 };
  var BADGE = '● ';
  var rq = { form: false, taken: null, target: null, denyAsk: null, seenAll: null, flash: {}, audio: null, makeAudio: null, mounted: false,
    ping: { lastAt: null, seen: [] }, pinging: [], blocked: false, heard: { key: null, ids: [] }, heardMem: {}, title: null };

  var l10n = {
    en: {
      tabs: { requests: 'Requests', assets: 'Assets' },
      toolRequest: 'Request', newRequest: 'New request', pickTarget: 'Pick on the map', coordsHint: 'or type X Y from the rangefinder',
      note: 'Note', urgent: 'Urgent', beacon: 'Beacon placed', send: 'Send', empty: 'No requests', min: 'min',
      needTarget: 'Pick a target first.', noCalibration: 'No calibration: pick the target on the map.',
      reqWrongPlanet: 'The map shows another planet — switch to the room\'s planet.',
      types: { mortar: 'Mortar', ob: 'OB', cas: 'CAS', supply: 'Supply drop', medevac: 'Medevac', other: 'Other', position: 'Position', task: 'Task' },
      statuses: { requested: 'requested', accepted: 'accepted', loaded: 'loaded', firing: 'firing', done: 'done', denied: 'denied' },
      firingBy: { mortar: 'shell in the air', ob: 'OB inbound', cas: 'fly-by', supply: 'crate inbound', medevac: 'en route', other: 'started' },
      actions: { accept: 'Accept', deny: 'Deny', cancel: 'Withdraw', take: 'Take target', load: 'Loaded', done: 'Done', repeat: 'Repeat', place: 'Set position',
        fire: { ob: 'Fire', cas: 'Fly-by', supply: 'Drop', medevac: 'En route', other: 'Started' } },
      doneBy: { position: 'Deployed' },
      placed: 'The Fire panel now has this mortar position.',
      denyReasons: ['no ammo', 'out of range', 'not allowed there', 'asset busy'], denyCancel: 'Back',
      withdrawn: 'withdrawn by the author', deniedByStaff: 'withdrawn by staff', impactIn: 'impact in', readyIn: 'ready in',
      fireCard: { distance: 'distance {d}', error: 'aim error ±{x} / ±{y}', noMortar: 'Place the mortar on the Fire panel first.',
        noCal: 'Calibrate the round on the Fire panel first.', shoot: 'Fire', calDiffers: 'The room calibration differs from yours: check the offset.',
        refused: { tooClose: 'too close', tooFar: 'too far', noArea: 'outside the map', landingZone: 'landing zone', covered: 'under a hive roof', noCas: 'no CAS in the area', noLasing: 'no lasing in the area' },
        warnings: { errorMayExceedMaxRange: 'the aim error may exceed the max range', errorMayUndercutMinRange: 'the aim error may undercut the min range', errorMayHitRefusedArea: 'the aim error box touches a refused area' } },
      assetNames: { mortar: 'Mortar {n}', ob: 'Orbital cannon', dropship: 'Dropship', supply: 'Supply drop', medevac: 'Medevac' },
      assetStates: {
        mortar: { deployed: 'deployed', moving: 'moving', destroyed: 'destroyed' }, ob: { ready: 'ready', loading: 'loading', cooldown: 'cooldown' },
        dropship: { offline: 'no pilot', ship: 'on the ship', to_lz: 'to LZ', on_lz: 'on LZ', flyby: 'fly-by', cooldown: 'cooldown' },
        supply: { ready: 'ready', cooldown: 'cooldown' }, medevac: { available: 'available', unavailable: 'unavailable' }
      },
      assetClaim: 'Crew', assetUnclaim: 'Release', shell: 'Shell', sounds: 'Sound for requests to my assets',
      chipMortar: 'Mortars', chipNames: { ob: 'OB', dropship: 'CAS', supply: 'Supply' }, chipRequests: 'Requests {n}',
      pingHeard: 'Heard', pingBlocked: 'Sound is blocked by the browser — click the panel',
      pingVolume: 'Volume', pingVolumes: { quiet: 'quiet', normal: 'normal', loud: 'loud' },
      reqTo: 'To', reqToAll: 'Everyone by type', reqToPick: '— pick —', reqToLeft: 'left the room',
      reqToNeed: 'Pick who the task is for.', reqToStale: 'That addressee is gone: pick again.',
      taskText: 'Task text', taskNeedText: 'Write the task text.', reqNoPoint: 'no point', reqPointOptional: 'no point (optional)',
      taskDenyReasons: ['busy', 'not possible', 'not my job'],
      posShare: 'Share position', posPickHint: 'Click the tile you stand on', posFromFire: 'From the Fire panel', posClear: 'Clear position',
      zoneToggle: 'Mortar zones'
    },
    ru: {
      tabs: { requests: 'Запросы', assets: 'Ресурсы' },
      toolRequest: 'Запрос', newRequest: 'Новый запрос', pickTarget: 'Указать на карте', coordsHint: 'или введите X Y с дальномера',
      note: 'Заметка', urgent: 'Срочно', beacon: 'Маяк поставлен', send: 'Отправить', empty: 'Запросов нет', min: 'мин',
      needTarget: 'Сначала укажите цель.', noCalibration: 'Нет калибровки: укажите цель на карте.',
      reqWrongPlanet: 'Карта другой планеты — переключитесь на планету комнаты.',
      types: { mortar: 'Миномёт', ob: 'ОБ', cas: 'КАС', supply: 'Поставка', medevac: 'Эвакуация', other: 'Прочее', position: 'Позиция', task: 'Задача' },
      statuses: { requested: 'запрошен', accepted: 'принят', loaded: 'заряжено', firing: 'огонь', done: 'выполнен', denied: 'отклонён' },
      firingBy: { mortar: 'снаряд в полёте', ob: 'ОБ летит', cas: 'облёт', supply: 'ящик летит', medevac: 'в пути', other: 'начато' },
      actions: { accept: 'Принять', deny: 'Отклонить', cancel: 'Снять', take: 'Взять цель', load: 'Заряжено', done: 'Выполнено', repeat: 'Повторить', place: 'Встать сюда',
        fire: { ob: 'Выстрел', cas: 'Облёт', supply: 'Сброс', medevac: 'В пути', other: 'Начато' } },
      doneBy: { position: 'Развёрнут' },
      placed: 'Позиция миномёта выставлена на панели «Огонь».',
      denyReasons: ['нет снарядов', 'вне дальности', 'там нельзя', 'ресурс занят'], denyCancel: 'Назад',
      withdrawn: 'снят автором', deniedByStaff: 'отозвано штабом', impactIn: 'удар через', readyIn: 'готово через',
      fireCard: { distance: 'дальность {d}', error: 'ошибка прицела ±{x} / ±{y}', noMortar: 'Сначала поставьте миномёт на панели «Огонь».',
        noCal: 'Сначала откалибруйте раунд на панели «Огонь».', shoot: 'Выстрел', calDiffers: 'Калибровка комнаты отличается от вашей: проверьте сдвиг.',
        refused: { tooClose: 'слишком близко', tooFar: 'слишком далеко', noArea: 'вне карты', landingZone: 'зона посадки', covered: 'под крышей улья', noCas: 'КАС в зоне нельзя', noLasing: 'лазер в зоне нельзя' },
        warnings: { errorMayExceedMaxRange: 'ошибка прицела может вывести за максимальную дальность', errorMayUndercutMinRange: 'ошибка прицела может дать недолёт до минимальной дальности', errorMayHitRefusedArea: 'коробка ошибки задевает запрещённую зону' } },
      assetNames: { mortar: 'Миномёт {n}', ob: 'Орудие ОБ', dropship: 'Десантный корабль', supply: 'Поставка', medevac: 'Эвакуация' },
      assetStates: {
        mortar: { deployed: 'развёрнут', moving: 'в пути', destroyed: 'уничтожен' }, ob: { ready: 'готов', loading: 'заряжается', cooldown: 'перезарядка' },
        dropship: { offline: 'нет пилота', ship: 'на корабле', to_lz: 'летит к LZ', on_lz: 'на LZ', flyby: 'облёт', cooldown: 'перезарядка' },
        supply: { ready: 'готова', cooldown: 'перезарядка' }, medevac: { available: 'доступна', unavailable: 'недоступна' }
      },
      assetClaim: 'Расчёт', assetUnclaim: 'Отпустить', shell: 'Снаряд', sounds: 'Звук на запросы к моим ресурсам',
      chipMortar: 'Миномёты', chipNames: { ob: 'ОБ', dropship: 'КАС', supply: 'Поставка' }, chipRequests: 'Запросы {n}',
      pingHeard: 'Услышал', pingBlocked: 'Звук заблокирован браузером — нажмите в панели',
      pingVolume: 'Громкость', pingVolumes: { quiet: 'тихо', normal: 'обычно', loud: 'громко' },
      reqTo: 'Кому', reqToAll: 'Всем по типу', reqToPick: '— выберите —', reqToLeft: 'вне комнаты',
      reqToNeed: 'Выберите, кому задача.', reqToStale: 'Этого адресата уже нет: выберите заново.',
      taskText: 'Текст задачи', taskNeedText: 'Напишите текст задачи.', reqNoPoint: 'без точки', reqPointOptional: 'без точки (необязательно)',
      taskDenyReasons: ['занят', 'невозможно', 'не моя задача'],
      posShare: 'Передать позицию', posPickHint: 'Кликните тайл, где вы стоите', posFromFire: 'Позиция из панели огня', posClear: 'Убрать позицию',
      zoneToggle: 'Зона миномётов'
    }
  };

  // ── pure helpers ─────────────────────────────────────────

  function own(table, key) { return !!table && typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key); }
  function pick(table, key, fallback) { return own(table, key) ? table[key] : fallback; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  // A number for markup, or nothing.
  function fmtNum(v) { return isNum(v) ? String(v) : ''; }
  function validTile(t) { return Array.isArray(t) && t.length === 2 && isNum(t[0]) && isNum(t[1]); }
  function disable(html) { return html.replace('<button ', '<button disabled '); }

  function hasTarget(req) { return !!(req && req.target && isNum(req.target.x) && isNum(req.target.y)); }
  // Requests that fail this are skipped everywhere: cards, strip, chips, rings, actions. A task may come
  // without a map point; every other type needs one, and a target that is there must be finite.
  function validReq(req) {
    if (!req || !own(R.REQUEST_FLOW, req.status)) return false;
    return hasTarget(req) || (req.type === 'task' && (req.target === undefined || req.target === null));
  }
  function denyReasons(T, req) { return req && req.type === 'task' ? T.taskDenyReasons : T.denyReasons; }

  // An addressee rebuilt from its own string keys only: {client}, {post} or {post, squad}; null otherwise.
  function cleanTo(to) {
    if (!to || typeof to !== 'object') return null;
    if (typeof to.client === 'string' && to.client) return { client: to.client };
    if (typeof to.post !== 'string' || !to.post) return null;
    return typeof to.squad === 'string' && to.squad ? { post: to.post, squad: to.squad } : { post: to.post };
  }
  function isOpen(r) { return r.status !== 'done' && r.status !== 'denied'; }
  // An object carrying a level shows only on that level; one without shows on every level.
  function levelOk(level, current) { return !isNum(level) || level === current; }

  // Staff withdrew a request the crew had already accepted.
  function recalled(policy, req) {
    return !!(req && req.status === 'denied' && req.acceptedBy && req.deniedBy &&
      req.deniedBy.client !== req.acceptedBy.client && R.levelOf(policy, req.deniedBy.post) === 'staff');
  }
  // How a denied request closed: 'recalled', 'withdrawn' (by its author), 'denied' (by the crew) or null.
  function denial(policy, req) {
    if (!req || req.status !== 'denied' || !req.deniedBy) return null;
    if (recalled(policy, req)) return 'recalled';
    if (req.by && req.deniedBy.client && req.deniedBy.client === req.by.client) return 'withdrawn';
    return 'denied';
  }

  // The mortar a «Deployed» moves: the one I crew, else the first one I may edit.
  function pickMortarRow(rows, me, editable) {
    var mortars = rows.filter(function (row) { return row.def.type === 'mortar' && editable(row); });
    var client = me && me.client;
    var mine = client ? mortars.filter(function (row) { return row.obj && row.obj.claimedBy === client; })[0] : null;
    return mine || mortars.filter(function (row) { return !(row.obj && row.obj.claimedBy); })[0] || null;
  }

  // Digit n picks the n-th request type while the form is open; null when the key is not ours.
  function typeForKey(e, active, status) {
    if (!e || status !== 'in' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return null;
    if (active && (active.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(String(active.tagName || '')))) return null;
    if (!/^[1-9]$/.test(String(e.key))) return null;
    var i = +e.key - 1;
    return i < TYPES.length ? TYPES[i] : null;
  }

  // A request aimed at me. With an addressee: only when I am it. Without one: aimed at an asset whose post
  // I hold or whose crew seat I claimed.
  function aimedAtMine(policy, objects, me, req) {
    if (!me || !req) return false;
    if (req.to !== undefined && req.to !== null) return typeof req.to === 'object' && !!R.isAddressee(req, me);
    var type = R.assetTypeOf(req);
    if (typeof type !== 'string') return false;
    if (R.assetOwnerPost(policy, type) === me.post) return true;
    return !!me.client && R.claimants(objects, req).indexOf(me.client) >= 0;
  }

  // The requests that ping for me: still requested, offered to me to accept, aimed at an asset I own or
  // crew, and not heard in this browser. The author, a second staff officer, an observer and a knocking
  // member never qualify: requestActions offers them no accept, or the asset is not theirs.
  function pingTargets(policy, me, list, objects, heard) {
    return (list || []).filter(function (r) {
      if (!validReq(r) || r.deleted || r.status !== 'requested' || (heard || []).indexOf(r.id) >= 0) return false;
      return R.requestActions(policy, me, r, { claimed: R.claimants(objects, r) }).indexOf('accept') >= 0 && aimedAtMine(policy, objects, me, r);
    });
  }

  // One schedule for every pending request: a request not pinged yet plays at once, then one pattern per
  // interval; an urgent one anywhere sets the urgent pattern and interval. Never two patterns inside
  // PING_GAP_MS; a clock that went back plays rather than falling silent. Null when nothing pings.
  function pingDue(state, now, targets) {
    if (!targets || !targets.length) return null;
    var kind = targets.some(function (r) { return r.priority === 'urgent'; }) ? 'urgent' : 'normal';
    var last = state && isNum(state.lastAt) ? state.lastAt : null, seen = state && Array.isArray(state.seen) ? state.seen : [];
    var fresh = targets.some(function (r) { return seen.indexOf(r.id) < 0; });
    var ping = last === null || now < last || (now - last >= PING_GAP_MS && (fresh || now - last >= PING_EVERY[kind]));
    return { ping: ping, pattern: kind, interval: PING_EVERY[kind] };
  }

  // The tab title with the ping badge on or off; a badge already there is never doubled.
  function titleWithBadge(base, on) {
    var b = String(base === null || base === undefined ? '' : base);
    while (b.indexOf(BADGE) === 0) b = b.slice(BADGE.length);
    return on ? BADGE + b : b;
  }

  // Tone pitches and start offsets (s) of a pattern.
  function patternTones(kind) {
    var out = [], t = 0;
    pick(PATTERNS, kind, PATTERNS.normal).forEach(function (group, g) {
      if (g) t += TONE.groupGap - TONE.gap;
      group.forEach(function (f) { out.push({ f: f, at: t }); t += TONE.length + TONE.gap; });
    });
    return out;
  }

  // One pattern on an AudioContext. Per tone a triangle and a quieter square at the same pitch under a 5 ms
  // attack and an 80 ms exponential decay, all through a low-pass that keeps the edge off the square.
  // `volume` is a key of VOLUMES; anything else plays loud.
  function playPattern(ac, kind, volume) {
    var peak = pick(VOLUMES, volume, VOLUMES[DEFAULT_VOLUME]), start = ac.currentTime + TONE.lead, out = ac.destination;
    if (typeof ac.createBiquadFilter === 'function') {
      out = ac.createBiquadFilter();
      out.type = 'lowpass';
      out.frequency.value = TONE.lowpass;
      out.connect(ac.destination);
    }
    patternTones(kind).forEach(function (tone) {
      var t = start + tone.at, env = ac.createGain(), mix = ac.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(peak, t + TONE.attack);
      env.gain.exponentialRampToValueAtTime(0.0001, t + TONE.attack + TONE.decay);
      mix.gain.value = TONE.square;
      env.connect(out);
      mix.connect(env);
      [['triangle', env], ['square', mix]].forEach(function (voice) {
        var o = ac.createOscillator();
        o.type = voice[0];
        o.frequency.value = tone.f;
        o.connect(voice[1]);
        o.start(t);
        o.stop(t + TONE.length);
      });
    });
  }

  // A Series T shot belongs to the taken request when its game target lies within a tile of the
  // request's target under one of the known calibration offsets. With no offset known, any shot counts.
  function shotMatches(req, offsets, shot) {
    if (!hasTarget(req)) return false;
    var games = (offsets || []).filter(validTile).map(function (o) { return [req.target.x + o[0], req.target.y + o[1]]; });
    if (!games.length) return true;
    var t = shot && shot.target;
    if (!validTile(t)) return false;
    return games.some(function (g) { return Math.abs(g[0] - t[0]) <= 1 && Math.abs(g[1] - t[1]) <= 1; });
  }

  // client.queue resolves {ok:true, seq} once the server acks the op and {ok:false, error} when it
  // refuses it; a network error keeps it pending. Anything else is unknown: act on nothing.
  function whenAcked(promise, onOk) {
    if (!promise || typeof promise.then !== 'function') return;
    promise.then(function (res) { if (res && res.ok === true) onOk(res); }, function () { /* stays pending */ });
  }

  // ── data ─────────────────────────────────────────────

  function claimsFor(api, req) { return { claimed: R.claimants(api.ui.client.merged().objects, req) }; }
  // Take and place hand a tile to the Fire panel: a request without a point never offers them.
  function actionsFor(api, req) {
    var acts = R.requestActions(api.ui.policy, api.me(), req, claimsFor(api, req));
    return hasTarget(req) ? acts : acts.filter(function (a) { return a !== 'take' && a !== 'place'; });
  }
  function constants(api) { var ctx = api.ui.hooks.getContext(); return ctx.fork ? ctx.fork.constants : null; }
  // The page shows the room's planet: the shell's api.planetOk, else the same comparison made here.
  function planetOk(api) {
    if (typeof api.planetOk === 'function') return !!api.planetOk();
    var m = api.ui.client && api.ui.client.meta;
    if (!m || !m.planet) return true;   // meta not loaded yet
    var ctx = api.ui.hooks ? api.ui.hooks.getContext() : null;
    return !!(ctx && ctx.meta && ctx.meta.id === m.planet);
  }
  // True (after a toast) when the page shows another planet than the room's.
  function offPlanet(api) {
    if (planetOk(api)) return false;
    api.toast(api.T().reqWrongPlanet);
    return true;
  }
  function calibrationOffsets(api) {
    var room = api.ui.client.calibration ? api.ui.client.calibration() : null, ctx = api.ui.hooks.getContext();
    return [room && room.offset, ctx.calibration && ctx.calibration.offset];
  }
  function requests(api) { return api.ui.client.requests().filter(validReq); }
  function objectOf(api, id) {
    var objects = api.ui.client.merged().objects;
    return own(objects, id) ? objects[id] : null;
  }
  function getReq(api, el) {
    var o = objectOf(api, el.getAttribute('data-id'));
    return o && o.kind === 'request' && !o.deleted && validReq(o) ? o : null;
  }
  function draftType(api) {
    var t = api.draft('request', 'type', TYPES[0]);
    return TYPES.indexOf(t) >= 0 ? t : TYPES[0];
  }
  function cancelRequestPick(api) {
    if (api.ui.pick && api.ui.pick.mode === 'request') api.cancelPick();
  }

  function deadlineOf(api, req) {
    var c = constants(api), d = null;
    if (req.status !== 'firing' || !isNum(req.firedAt) || !c) return null;
    if (req.type === 'mortar' && c.mortar) d = R.deadlines('mortar', req.firedAt, c, api.ui.policy).impactAt;
    else if (req.type === 'ob' && c.ob) d = R.deadlines('ob', req.firedAt, c, api.ui.policy).impactAt;
    else if (req.type === 'cas') d = R.deadlines('dropship', req.firedAt, c, api.ui.policy).readyAt;
    return isNum(d) ? d : null;
  }

  // The latest cooldown hint for an asset from its last fired request; hints never change states.
  function readyAt(api, assetType) {
    var c = constants(api), reqType = pick({ ob: 'ob', supply: 'supply', dropship: 'cas' }, assetType, null), best = null;
    if (!reqType || !c || (assetType === 'ob' && !c.ob)) return null;
    requests(api).forEach(function (r) {
      if (r.type !== reqType || !isNum(r.firedAt)) return;
      var d = R.deadlines(assetType, r.firedAt, c, api.ui.policy).readyAt;
      if (isNum(d) && (best === null || d > best)) best = d;
    });
    return best !== null && best > api.ui.client.serverNow() ? best : null;
  }

  function assetRows(api) {
    var objs = api.ui.client.merged().objects, rows = [];
    api.ui.policy.assets.forEach(function (def) {
      for (var n = 1; n <= (def.count || 1); n++) {
        var id = 'asset-' + def.type + '-' + n, o = own(objs, id) ? objs[id] : null;
        rows.push({ id: id, def: def, n: n, obj: o && !o.deleted ? o : null });
      }
    });
    return rows;
  }

  function canEdit(api, row) {
    var me = api.me(), P = api.ui.policy, o = row.obj || {};
    if (!me || !me.confirmed || api.ui.client.status !== 'in' || !R.layerWritable(P, me, 'assets')) return false;
    return row.def.owner === me.post || R.isStaff(P, me) || (!!me.client && o.claimedBy === me.client);
  }

  function mortarRadius(api) {
    var best = null;
    assetRows(api).forEach(function (row) {
      var o = row.obj;
      if (row.def.type === 'mortar' && o && isNum(o.radius) && o.radius > 0 && o.state === 'deployed') best = Math.max(best || 0, o.radius);
    });
    return best;
  }

  // A deployed mortar's level: its own, else that of a member position shared on its tile, else that of the
  // position request that put it there.
  function mortarLevel(api, o) {
    if (isNum(o.level)) return o.level;
    var shared = memberPositions(api).filter(function (e) { return e.pos.x === o.tile[0] && e.pos.y === o.tile[1] && isNum(e.pos.level); })[0];
    if (shared) return shared.pos.level;
    var src = requests(api).filter(function (r) {
      return r.type === 'position' && r.status === 'done' && hasTarget(r) && r.target.x === o.tile[0] && r.target.y === o.tile[1];
    }).pop();
    return src && isNum(src.level) ? src.level : null;
  }

  function roomMembers(api) {
    var c = api.ui.client;
    return c && typeof c.members === 'function' ? c.members() : [];
  }
  // «Callsign · Post · Squad» for a member; without a callsign the post leads.
  function memberLabel(api, m) {
    var post = api.postName(m.post) + (typeof m.squad === 'string' && m.squad ? ' · ' + api.squadName(m.squad) : '');
    return typeof m.callsign === 'string' && m.callsign ? m.callsign + ' · ' + post : post;
  }
  // Who an addressed request is for, as plain text for api.esc; '' without an addressee.
  function addresseeText(api, to) {
    if (!to || typeof to !== 'object') return '';
    if (typeof to.client === 'string' && to.client) {
      var m = typeof api.ui.client.member === 'function' ? api.ui.client.member(to.client) : null;
      return m ? memberLabel(api, m) : api.T().reqToLeft;
    }
    if (typeof to.post !== 'string' || !to.post) return '';
    return api.postName(to.post) + (typeof to.squad === 'string' && to.squad ? ' · ' + api.squadName(to.squad) : '');
  }

  // The «To» list for a request type: everyone by type (a task gets a «pick» placeholder instead), the posts
  // that may answer (no observer; a squad post also once per squad), then the confirmed members but me as
  // «callsign · post». A mortar strike goes only to the mortar's owner post and its members. The submit looks
  // the chosen value up here again, so a value is never parsed and a member who left is never addressed.
  function toOptions(api, type) {
    var T = api.T(), P = api.ui.policy, me = api.me(), out = [];
    var owner = type === 'mortar' ? R.assetOwnerPost(P, 'mortar') : null;
    var squads = P.squads && typeof P.squads === 'object' ? Object.keys(P.squads) : [];
    out.push({ value: '', label: type === 'task' ? T.reqToPick : T.reqToAll, to: null });
    P.posts.forEach(function (p) {
      if (!p || typeof p.id !== 'string' || !p.level || p.level === 'observer' || (type === 'mortar' && p.id !== owner)) return;
      out.push({ value: 'post:' + p.id, label: api.postName(p.id), to: { post: p.id } });
      if (p.level === 'squad' && p.perSquad) squads.forEach(function (s) {   // the contract takes a squad only for squad posts
        out.push({ value: 'squad:' + p.id + ':' + s, label: api.postName(p.id) + ' · ' + api.squadName(s), to: { post: p.id, squad: s } });
      });
    });
    roomMembers(api).forEach(function (m) {
      var level = m ? R.levelOf(P, m.post) : null;
      if (!m || !m.confirmed || typeof m.client !== 'string' || !m.client || (me && m.client === me.client)) return;
      if (!level || level === 'observer' || (type === 'mortar' && m.post !== owner)) return;
      out.push({ value: 'client:' + m.client, label: memberLabel(api, m), to: { client: m.client } });
    });
    return out;
  }

  // My member object as the page shows it: the merged copy carries a position not yet acked.
  function myMember(api) {
    var me = api.me();
    if (!me || typeof me.id !== 'string') return null;
    var o = objectOf(api, me.id);
    return o && o.kind === 'member' && !o.deleted ? o : me;
  }
  // Confirmed members still in the room with a position: [{member, pos, at, pending}]. The merged copy wins,
  // so my own position shows before the server has it; a member removed meanwhile shows nothing.
  function memberPositions(api) {
    var out = [];
    roomMembers(api).forEach(function (m) {
      if (!m || !m.confirmed || typeof m.id !== 'string') return;
      var o = objectOf(api, m.id) || m;
      if (o.kind !== 'member' || o.deleted) return;
      var p = o.pos;
      if (!p || typeof p !== 'object' || !isNum(p.x) || !isNum(p.y)) return;
      out.push({ member: o, pos: p, at: isNum(o.posAt) ? o.posAt : null, pending: !!o.pending });
    });
    return out;
  }
  // The mortar «Share position» moves: the one I claimed, else the first mortar of my post. None for anyone
  // else, or when my level may not write the assets layer.
  function ownMortarRow(rows, policy, me) {
    if (!me || !R.layerWritable(policy, me, 'assets')) return null;
    var mortars = rows.filter(function (row) { return row.def.type === 'mortar' && row.obj; });
    var claimed = me.client ? mortars.filter(function (row) { return row.obj.claimedBy === me.client; })[0] : null;
    // Without a claim of my own, the first mortar of my post that nobody else has claimed: never another crew's.
    return claimed || mortars.filter(function (row) { return row.def.owner === me.post && !row.obj.claimedBy; })[0] || null;
  }
  // Who serves a mortar: the member in its crew seat, else the first confirmed member of its owner post.
  function crewOf(api, row) {
    var c = api.ui.client, o = row.obj || {};
    var seat = typeof o.claimedBy === 'string' && o.claimedBy && typeof c.member === 'function' ? c.member(o.claimedBy) : null;
    return seat || roomMembers(api).filter(function (m) { return m && m.confirmed && m.post === row.def.owner; })[0] || null;
  }

  // My position on a tile of the room's planet and, for a mortar crew, my mortar deployed there: a member
  // patch and, queued right behind it, an asset patch. The server stamps posAt; a refusal (radio silence)
  // lands in client.rejected, which the shell toasts once.
  function sharePosition(api, tile, level) {
    var me = api.me(), c = api.ui.client;
    if (!me || !me.confirmed || typeof me.id !== 'string' || c.status !== 'in' || !validTile(tile) || offPlanet(api)) return false;
    var pos = { x: Math.floor(tile[0]), y: Math.floor(tile[1]), level: isNum(level) ? Math.floor(level) : 0 };
    c.queue({ op: 'patch', kind: 'member', id: me.id, data: { pos: pos } });
    var row = ownMortarRow(assetRows(api), api.ui.policy, me);
    if (row) c.queue({ op: 'patch', kind: 'asset', id: row.id, data: { tile: [pos.x, pos.y], state: 'deployed' } });
    return true;
  }

  // Request patches carry only status and, for a crew denial, reason.
  function patchStatus(api, req, status, reason) {
    var d = { status: status };
    if (typeof reason === 'string') d.reason = reason;
    return api.ui.client.queue({ op: 'patch', kind: 'request', id: req.id, expectedStatus: req.status, data: d });
  }

  // `where` = {level, h} of an existing request (repeat); a new request takes the page's. `target` is a tile
  // or null (a task without a point); `to` an addressee from toOptions or cleanTo, or null.
  function queueRequest(api, type, target, note, urgent, flags, where, to) {
    var ctx = api.ui.hooks.getContext(), limit = api.ui.policy.limits.note;
    var w = where || { level: ctx.level, h: ctx.meta ? ctx.meta.h : '' };
    var data = { type: type, note: String(note || '').slice(0, isNum(limit) ? limit : 80),
      priority: urgent ? 'urgent' : 'normal', flags: Array.isArray(flags) ? flags.slice(0, 8) : [],
      level: isNum(w.level) ? w.level : 0, h: typeof w.h === 'string' ? w.h : '' };
    if (validTile(target)) data.target = { x: target[0], y: target[1] };
    if (to) data.to = to;
    return api.ui.client.queue({ op: 'put', kind: 'request', id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), data: data });
  }

  // ── HTML ─────────────────────────────────────────────

  function actionButton(api, action, req) {
    var T = api.T();
    var label = action === 'fire' ? pick(T.actions.fire, req.type, T.actions.fire.other)
      : action === 'done' && own(T.doneBy, req.type) ? T.doneBy[req.type] : pick(T.actions, action, action);
    var html = api.btn('req-' + action, label, { id: req.id }, BIG_ACTIONS.indexOf(action) >= 0 ? 'big' : '');
    return PLANET_ACTIONS.indexOf(action) >= 0 && !planetOk(api) ? disable(html) : html;
  }

  function fireCardHtml(api, req) {
    var F = api.T().fireCard, ctx = api.ui.hooks.getContext(), L = root.TacticalLogic, esc = api.esc;
    if (!ctx.calibration) return '<div class="tac-room-fire"><p class="tac-msg warn">' + esc(F.noCal) + '</p></div>';
    if (!ctx.mortar) return '<div class="tac-room-fire"><p class="tac-msg warn">' + esc(F.noMortar) + '</p></div>';
    var tile = [req.target.x, req.target.y];
    var checks = L.mortarFireChecks(ctx.planet, ctx.mortar.tile, tile, ctx.fork.constants.mortar, ctx.mortar.mode);
    var game = L.worldToGame(ctx.calibration.offset, tile[0], tile[1]);
    var room = api.offset();
    var bounds = checks.bounds || [];
    var html = '<div class="tac-room-fire-coords">' + fmtNum(game[0]) + ' ' + fmtNum(game[1]) + '</div>' +
      '<div class="tac-muted">' + esc(api.fmt(F.distance, { d: isNum(checks.distance) ? checks.distance.toFixed(1) : '' })) + ' · ' +
      esc(api.fmt(F.error, { x: fmtNum(bounds[0]), y: fmtNum(bounds[1]) })) + '</div>' +
      (checks.reasons || []).map(function (r) { return '<p class="tac-msg error">' + esc(pick(F.refused, r, r)) + '</p>'; }).join('') +
      (checks.warnings || []).map(function (w) { return '<p class="tac-msg warn">' + esc(pick(F.warnings, w, w)) + '</p>'; }).join('') +
      (room && (room[0] !== ctx.calibration.offset[0] || room[1] !== ctx.calibration.offset[1]) ? '<p class="tac-msg warn">' + esc(F.calDiffers) + '</p>' : '');
    return '<div class="tac-room-fire">' + html + (checks.ok ? api.btn('reqShoot', F.shoot, { id: req.id }, 'big') : '') + '</div>';
  }

  function statusText(T, policy, req) {
    if (req.status === 'firing') return pick(T.firingBy, req.type, T.statuses.firing);
    var kind = denial(policy, req);
    if (kind === 'recalled') return T.deniedByStaff;
    if (kind === 'withdrawn') return T.withdrawn;
    return T.statuses[req.status];
  }

  function joinDot(parts) { return parts.filter(function (p) { return !!p; }).join(' · '); }

  function cardHtml(api, req, compact) {
    var T = api.T(), c = api.ui.client, esc = api.esc, P = api.ui.policy;
    var acts = c.status === 'in' ? actionsFor(api, req) : [];
    var by = req.by && typeof req.by === 'object' ? req.by : null;
    var who = by && typeof by.post === 'string' ? api.postName(by.post) + (typeof by.squad === 'string' && by.squad ? ' · ' + api.squadName(by.squad) : '') : '';
    var age = isNum(req.at) ? Math.max(0, Math.round((c.serverNow() - req.at) / 60000)) : null;
    var dl = deadlineOf(api, req);
    var to = addresseeText(api, req.to);
    var where = hasTarget(req) ? '<span class="tac-item-coords">' + esc(api.gameText(req.target.x, req.target.y)) + '</span>'
      : '<span class="tac-room-nopoint">' + esc(T.reqNoPoint) + '</span>';
    var head = '<b>' + esc(pick(T.types, req.type, req.type)) + '</b>' + (to ? ' <span class="tac-room-to">→ ' + esc(to) + '</span>' : '') + ' ' + where + ' · ' +
      '<span class="tac-room-status">' + esc(statusText(T, P, req)) + '</span>';
    var countdown = dl !== null ? esc(req.type === 'cas' ? T.readyIn : T.impactIn) + ' <span data-deadline="' + fmtNum(dl) + '"></span>' : '';
    var meta = joinDot([esc(who), age !== null ? fmtNum(age) + ' ' + esc(T.min) : '']);
    // A request pinging for me pulses and carries «Heard» on both cards.
    var ping = pingIds(api).indexOf(req.id) >= 0;
    if (compact) {
      // One row: two text lines on the left, the next step on the right. The countdown leads the second
      // line so the ellipsis trims the author, never the time. Withdraw and deny stay on the full card.
      var next = acts.filter(function (a) { return a !== 'cancel' && a !== 'deny'; })[0];
      var flash = own(rq.flash, req.id) && rq.flash[req.id] > Date.now() ? ' flash' : '';
      return '<div class="tac-room-card' + (req.priority === 'urgent' ? ' urgent' : '') + flash + (ping ? ' pinging' : '') + '" data-room-action="reqFocus" data-id="' + esc(req.id) + '">' +
        '<div class="tac-room-card-text"><div>' + head + '</div><div class="tac-muted">' + joinDot([countdown, meta]) + '</div></div>' +
        (ping ? api.btn('reqHeard', T.pingHeard, { id: req.id }, 'heard') : '') + (next ? actionButton(api, next, req) : '') + '</div>';
    }
    var details = joinDot([meta, req.note ? esc(req.note) : '',
      Array.isArray(req.flags) && req.flags.indexOf('beacon') >= 0 ? esc(T.beacon) : '',
      req.reason && denial(P, req) === 'denied' ? esc(req.reason) : '']);
    var heard = ping ? api.btn('reqHeard', T.pingHeard, { id: req.id }, 'big heard') : '';
    var actionsHtml = rq.denyAsk === req.id && acts.indexOf('deny') >= 0
      ? '<div class="tac-room-actions">' + denyReasons(T, req).map(function (r) { return api.btn('reqDenyReason', r, { id: req.id, reason: r }, 'big'); }).join('') +
        api.btn('reqDenyCancel', T.denyCancel) + heard + '</div>'
      : '<div class="tac-room-actions">' + acts.map(function (a) { return actionButton(api, a, req); }).join('') + heard + '</div>';
    // The fire card lives only while this officer may still take the target.
    var fire = rq.taken === req.id && acts.indexOf('take') >= 0 && hasTarget(req) ? fireCardHtml(api, req) : '';
    return '<div class="tac-room-req st-' + esc(req.status) + (req.priority === 'urgent' ? ' urgent' : '') + (req.pending ? ' faded' : '') + (ping ? ' pinging' : '') +
      '" style="--req:' + pick(TYPE_COLOUR, req.type, DEFAULT_COLOUR) + '">' +
      '<div>' + joinDot([head, countdown]) + '</div><div class="tac-muted">' + details + '</div>' + actionsHtml + fire + '</div>';
  }

  // The chosen «To» value: the draft while the list still offers it, else the first entry.
  function toChosen(api, options) {
    var v = api.draft('request', 'to', '');
    return options.some(function (o) { return o.value === v; }) ? v : '';
  }

  function formHtml(api) {
    var T = api.T(), esc = api.esc, type = draftType(api), task = type === 'task', t = rq.target, ok = planetOk(api);
    var pickBtn = api.btn('reqPick', T.pickTarget, null, 'big');
    var options = toOptions(api, type), chosen = toChosen(api, options);
    return '<section class="tac-section tac-room-reqform"><h2>' + esc(T.newRequest) + '</h2>' +
      '<div class="tac-room-types">' + TYPES.map(function (k, i) { return api.btn('reqType', (i + 1) + ' ' + T.types[k], { type: k }, k === type ? 'on' : ''); }).join('') + '</div>' +
      '<form data-room-form="request" class="tac-room-form">' +
      '<label class="tac-input-label">' + esc(T.reqTo) + '<select class="tac-select" name="to">' + options.map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (o.value === chosen ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('') + '</select></label>' +
      '<div class="tac-room-target">' + (ok ? pickBtn : disable(pickBtn)) +
      '<span class="tac-item-coords">' + (t ? esc(api.gameText(t[0], t[1])) : task ? esc(T.reqPointOptional) : '—') + '</span></div>' +
      '<label class="tac-input-label">' + esc(T.coordsHint) + '<input class="tac-input" name="coords" autocomplete="off" value="' + esc(api.draft('request', 'coords', '')) + '"></label>' +
      '<label class="tac-input-label">' + esc(task ? T.taskText : T.note) + '<input class="tac-input" name="note" maxlength="' + fmtNum(api.ui.policy.limits.note) + '" value="' + esc(api.draft('request', 'note', '')) + '"></label>' +
      '<label class="tac-room-check"><input type="checkbox" name="urgent"' + (api.draft('request', 'urgent', false) ? ' checked' : '') + '> ' + esc(T.urgent) + '</label>' +
      (type === 'supply' ? '<label class="tac-room-check"><input type="checkbox" name="beacon"' + (api.draft('request', 'beacon', false) ? ' checked' : '') + '> ' + esc(T.beacon) + '</label>' : '') +
      '<button type="submit" class="btn-small tac-room-btn big"' + (ok ? '' : ' disabled') + '>' + esc(T.send) + '</button></form></section>';
  }

  function requestsHtml(api) {
    var list = requests(api);
    return (rq.form && api.ui.client.status === 'in' ? formHtml(api) : '') +
      (list.length ? list.map(function (r) { return cardHtml(api, r, false); }).join('') : '<p class="tac-muted">' + api.esc(api.T().empty) + '</p>');
  }

  function stateLabel(T, type, state) {
    return typeof state === 'string' && state ? pick(pick(T.assetStates, type, null), state, state) : '—';
  }

  function assetsHtml(api) {
    var T = api.T(), ctx = api.ui.hooks.getContext(), me = api.me(), c = api.ui.client, P = api.ui.policy, esc = api.esc;
    var shells = (ctx.fork && ctx.fork.constants && ctx.fork.constants.shells) || [];
    var rows = assetRows(api).map(function (row) {
      var o = row.obj || {}, def = row.def, editable = canEdit(api, row), ready = readyAt(api, def.type);
      var stateButtons = editable ? pick(ASSET_STATES, def.type, []).map(function (s) {
        return api.btn('assetState', stateLabel(T, def.type, s), { id: row.id, state: s }, o.state === s ? 'on big' : 'big');
      }).join('') : '';
      var claim = '';
      if (def.claimable && me && me.confirmed && me.client && c.status === 'in') {
        if (o.claimedBy === me.client) claim = api.btn('assetClaim', T.assetUnclaim, { id: row.id, release: '1' });
        else if (!o.claimedBy && ((me.functions || []).indexOf('mortar') >= 0 || R.levelOf(P, me.post) !== 'squad')) claim = api.btn('assetClaim', T.assetClaim, { id: row.id });
      }
      var crew = typeof o.claimedBy === 'string' && o.claimedBy ? c.member(o.claimedBy) : null;
      var shellSelect = def.type === 'mortar' && editable && shells.length
        ? '<select class="tac-select" data-room-change="assetShell" data-id="' + esc(row.id) + '"><option value="">' + esc(T.shell) + '</option>' +
          shells.map(function (s) { return '<option value="' + esc(s.id) + '"' + (o.shell === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>'
        : '';
      return '<div class="tac-room-row"><span class="tac-room-name"><b>' + esc(api.fmt(pick(T.assetNames, def.type, def.type), { n: row.n })) + '</b> · ' +
        '<span class="tac-room-state ' + pick(STATE_CLASS, o.state, '') + '">' + esc(stateLabel(T, def.type, o.state)) + '</span>' +
        (ready !== null ? ' · ' + esc(T.readyIn) + ' <span data-deadline="' + fmtNum(ready) + '"></span>' : '') +
        (isNum(o.radius) ? ' <span class="tac-muted">· r ' + fmtNum(o.radius) + '</span>' : '') +
        (crew ? '<br><span class="tac-muted">' + esc(T.assetClaim) + ': ' + esc(api.postName(crew.post) + (crew.callsign ? ' «' + crew.callsign + '»' : '')) + '</span>' : '') +
        '</span><span class="tac-room-actions">' + stateButtons + claim + shellSelect + '</span></div>';
    }).join('');
    var p = prefs(api), vol = volumeOf(p);
    var zone = assetRows(api).some(function (row) { return row.def.type === 'mortar'; })
      ? '<label class="tac-room-check"><input type="checkbox" data-room-change="reqZone"' + (zoneOn(p) ? ' checked' : '') + '> ' + esc(T.zoneToggle) + '</label>' : '';
    return rows + zone + '<label class="tac-room-check"><input type="checkbox" data-room-change="reqSounds"' + (soundsOn(p) ? ' checked' : '') + '> ' + esc(T.sounds) + '</label>' +
      '<div class="tac-room-volume"><span class="tac-muted">' + esc(T.pingVolume) + '</span>' +
      VOLUME_KEYS.map(function (k) { return api.btn('reqVolume', T.pingVolumes[k], { volume: k }, k === vol ? 'on' : ''); }).join('') + '</div>';
  }

  function chipsHtml(api) {
    var T = api.T(), esc = api.esc, rows = assetRows(api), out = '';
    var mortars = rows.filter(function (r) { return r.def.type === 'mortar'; });
    if (mortars.length) {
      var up = mortars.filter(function (r) { return r.obj && r.obj.state === 'deployed'; }).length;
      out += '<button type="button" class="tac-room-chip ' + (up ? 'ready' : 'cooldown') + '" data-room-action="assetsTab">' + esc(T.chipMortar + ' ' + up + '/' + mortars.length) + '</button>';
    }
    ['ob', 'dropship', 'supply'].forEach(function (type) {
      var row = rows.filter(function (r) { return r.def.type === type; })[0];
      if (!row) return;
      var o = row.obj || {}, ready = readyAt(api, type);
      out += '<button type="button" class="tac-room-chip ' + pick(STATE_CLASS, o.state, '') + '" data-room-action="assetsTab">' +
        esc(pick(T.chipNames, type, type) + ' ' + stateLabel(T, type, o.state)) + (ready !== null ? ' <span data-deadline="' + fmtNum(ready) + '"></span>' : '') + '</button>';
    });
    var open = requests(api).filter(isOpen).length;
    return out + '<button type="button" class="tac-room-chip' + (open ? ' busy' : '') + (pingIds(api).length ? ' pinging' : '') + '" data-room-action="tab" data-tab="requests">' +
      esc(api.fmt(T.chipRequests, { n: open })) + '</button>';
  }

  // The notice while the browser holds the sound back; the button is itself a gesture that resumes it.
  function blockedHtml(api) {
    return rq.blocked ? api.btn('reqUnlock', api.T().pingBlocked, null, 'tac-room-ping-blocked') : '';
  }

  // «Share position» for every confirmed member who may write one (an observer post may not), «From the Fire
  // panel» while that panel has a mortar tile, «Clear position» while mine is on the map. Off the room's
  // planet the first two are disabled.
  function positionTools(api) {
    var T = api.T(), me = api.me(), level = me ? R.levelOf(api.ui.policy, me.post) : null, ok = planetOk(api);
    if (!level || level === 'observer') return '';
    var ctx = api.ui.hooks.getContext(), picking = !!(api.ui.pick && api.ui.pick.mode === 'position'), mine = myMember(api);
    var share = api.btn('posShare', T.posShare, null, picking ? 'on big' : 'big');
    var fire = ctx && ctx.mortar && validTile(ctx.mortar.tile) ? api.btn('posFromFire', T.posFromFire, null, 'big') : '';
    return (ok ? share : disable(share)) + (fire && !ok ? disable(fire) : fire) +
      (mine && mine.pos && typeof mine.pos === 'object' ? api.btn('posClear', T.posClear, null, 'big') : '');
  }

  function stripHtml(api) {
    var open = requests(api).filter(isOpen).slice(0, 6);
    return blockedHtml(api) + (open.length ? open.map(function (r) { return cardHtml(api, r, true); }).join('') : '<span class="tac-muted">' + api.esc(api.T().empty) + '</span>');
  }

  // ── map, sound, keyboard ────────────────────────────────────────

  function safeColour(c) { return typeof c === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(c) ? c : DEFAULT_COLOUR; }
  // Map text as Series T draws it: light on a dark halo, left-aligned beside a mark.
  function drawLabel(ctx, text, x, y) {
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = LABEL_HALO;
    ctx.fillStyle = DEFAULT_COLOUR;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  // Deployed mortars with a tile on the current level.
  function mapMortars(api, level) {
    return assetRows(api).filter(function (row) {
      var o = row.obj;
      return row.def.type === 'mortar' && !!o && validTile(o.tile) && o.state === 'deployed' && levelOk(mortarLevel(api, o), level);
    });
  }

  // Where each deployed mortar reaches: a faint green annulus between minRange and maxRange, a faint red disc
  // inside minRange, and both radii outlined. The «Mortar zones» switch hides all of it.
  function drawZones(ctx, v, api, mortars) {
    var mc = constants(api) ? constants(api).mortar : null;
    if (!mc || !zoneOn(prefs(api))) return;
    var min = isNum(mc.minRange) && mc.minRange > 0 ? mc.minRange * v.scale : null;
    var max = isNum(mc.maxRange) && mc.maxRange > 0 ? mc.maxRange * v.scale : null;
    mortars.forEach(function (row) {
      var m = v.worldToScreen(row.obj.tile[0] + 0.5, row.obj.tile[1] + 0.5);
      ctx.save();
      if (max !== null) {
        ctx.beginPath();
        ctx.arc(m[0], m[1], max, 0, Math.PI * 2);
        if (min !== null && min < max) { ctx.moveTo(m[0] + min, m[1]); ctx.arc(m[0], m[1], min, 0, Math.PI * 2, true); }
        ctx.fillStyle = ZONE.ring;
        ctx.fill('evenodd');
      }
      if (min !== null) {
        ctx.beginPath();
        ctx.arc(m[0], m[1], min, 0, Math.PI * 2);
        ctx.fillStyle = ZONE.dead;
        ctx.fill();
      }
      ctx.lineWidth = 1.5;
      [[max, ZONE.ringLine], [min, ZONE.deadLine]].forEach(function (edge) {
        if (edge[0] === null) return;
        ctx.strokeStyle = edge[1];
        ctx.beginPath();
        ctx.arc(m[0], m[1], edge[0], 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    });
  }

  // The mortar square with «Mortar N · callsign» (the crew post without a callsign); stays with the zones off.
  function drawMortars(ctx, v, api, mortars) {
    var T = api.T();
    mortars.forEach(function (row) {
      var o = row.obj, m = v.worldToScreen(o.tile[0] + 0.5, o.tile[1] + 0.5), s = Math.max(5, v.scale * 0.6), crew = crewOf(api, row);
      var name = api.fmt(pick(T.assetNames, 'mortar', 'Mortar {n}'), { n: row.n });
      if (crew) name += ' · ' + (typeof crew.callsign === 'string' && crew.callsign ? crew.callsign : api.postName(crew.post));
      ctx.save();
      ctx.fillStyle = TYPE_COLOUR.mortar;
      ctx.fillRect(m[0] - s, m[1] - s, s * 2, s * 2);
      drawLabel(ctx, name, m[0] + s + 4, m[1]);
      ctx.restore();
    });
  }

  // Member positions: a diamond in the level colour and «callsign · N min» (the post without a callsign),
  // faded once older than five minutes. My own position not yet acked counts as fresh.
  function drawMembers(ctx, v, api, level) {
    var T = api.T(), P = api.ui.policy, now = api.ui.client.serverNow();
    memberPositions(api).forEach(function (e) {
      if (!levelOk(e.pos.level, level)) return;
      var m = e.member, p = v.worldToScreen(e.pos.x + 0.5, e.pos.y + 0.5), s = Math.max(6, v.scale * 0.6);
      var age = e.pending ? 0 : e.at === null ? null : Math.max(0, now - e.at);
      var name = typeof m.callsign === 'string' && m.callsign ? m.callsign : api.postName(m.post);
      ctx.save();
      if (age !== null && age > POS_FADE_MS) ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1] - s);
      ctx.lineTo(p[0] + s, p[1]);
      ctx.lineTo(p[0], p[1] + s);
      ctx.lineTo(p[0] - s, p[1]);
      ctx.closePath();
      ctx.fillStyle = safeColour(R.levelStyle(P, m).color);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = LABEL_HALO;
      ctx.stroke();
      drawLabel(ctx, name + (age !== null ? ' · ' + Math.round(age / 60000) + ' ' + T.min : ''), p[0] + s + 4, p[1]);
      ctx.restore();
    });
  }

  function drawRings(ctx, v, api) {
    if (!planetOk(api)) return;   // room tiles belong to the room's planet, not the one on the page
    var level = api.ui.hooks.getContext().level || 0, radius = mortarRadius(api), mortars = mapMortars(api, level);
    drawZones(ctx, v, api, mortars);
    requests(api).forEach(function (r) {
      if (!isOpen(r) || !hasTarget(r) || !levelOk(r.level, level)) return;
      var p = v.worldToScreen(r.target.x + 0.5, r.target.y + 0.5), rad = Math.max(9, v.scale * 0.9);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = r.priority === 'urgent' ? 3 : 2;
      ctx.strokeStyle = pick(TYPE_COLOUR, r.type, DEFAULT_COLOUR);
      ctx.beginPath();
      if (r.type === 'position') ctx.rect(p[0] - rad, p[1] - rad, rad * 2, rad * 2); else ctx.arc(p[0], p[1], rad, 0, Math.PI * 2);
      ctx.stroke();
      if (r.type === 'mortar' && radius) {
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(p[0], p[1], radius * v.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });
    drawMortars(ctx, v, api, mortars);
    drawMembers(ctx, v, api, level);
    if (rq.target) {
      var q = v.worldToScreen(rq.target[0] + 0.5, rq.target[1] + 0.5);
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = DEFAULT_COLOUR;
      ctx.beginPath();
      ctx.arc(q[0], q[1], Math.max(9, v.scale * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── request ping ────────────────────────────────────────

  function prefs(api) {
    var p = api.ui.storage ? api.ui.storage.read(PREFS_KEY) : null;
    return p && typeof p === 'object' ? p : {};
  }
  function soundsOn(p) { return p.sounds !== false; }
  function zoneOn(p) { return p.zone !== false; }
  function volumeOf(p) { return own(VOLUMES, p.volume) ? p.volume : DEFAULT_VOLUME; }

  // «Heard» ids per room code and client in this tab's sessionStorage; memory when that is off.
  function heardKey(api) {
    var c = api.ui.client || {};
    return HEARD_PREFIX + String(c.code || '') + ':' + String(c.client || '');
  }
  function loadHeard(key) {
    try {
      var v = JSON.parse(root.sessionStorage.getItem(key) || 'null');
      if (Array.isArray(v)) return v.filter(function (id) { return typeof id === 'string'; }).slice(-HEARD_MAX);
    } catch (e) { /* storage off: memory only */ }
    return own(rq.heardMem, key) ? rq.heardMem[key].slice() : [];
  }
  function heardIds(api) {
    var key = heardKey(api);
    if (rq.heard.key !== key) rq.heard = { key: key, ids: loadHeard(key) };
    return rq.heard.ids;
  }
  function addHeard(api, id) {
    var ids = heardIds(api).concat([id]).slice(-HEARD_MAX);
    rq.heard.ids = ids;
    rq.heardMem[rq.heard.key] = ids.slice();
    try { root.sessionStorage.setItem(rq.heard.key, JSON.stringify(ids)); } catch (e) { /* memory keeps it for this page */ }
  }

  // Radio silence, a room the administration stopped or out of budget, a locked or a closed room: nothing
  // can be answered there, so nothing pings. The first tick after it ends pings at once (seen is cleared).
  function roomFrozen(c) {
    var m = c.meta;
    return !!(m && (m.frozen || m.locked || m.closed));
  }

  // The requests pinging for me now: none outside the room, in a frozen room or with the sound off.
  function pingList(api) {
    var c = api.ui.client;
    if (!c || c.status !== 'in' || roomFrozen(c) || !soundsOn(prefs(api))) return [];
    return pingTargets(api.ui.policy, api.me(), requests(api), c.merged().objects, heardIds(api));
  }
  function pingIds(api) { return pingList(api).map(function (r) { return r.id; }); }

  // One AudioContext for the page, made on first use (rq.makeAudio stands in for it under Node).
  function audioContext() {
    if (!rq.audio) {
      try {
        var AC = root.AudioContext || root.webkitAudioContext;
        rq.audio = rq.makeAudio ? rq.makeAudio() : AC ? new AC() : null;
      } catch (e) { rq.audio = null; }
    }
    return rq.audio || null;
  }
  // Callers play on a running context only: nodes scheduled on a suspended one would sound whenever it resumes.
  function play(api, ac, kind) {
    try { playPattern(ac, kind, volumeOf(prefs(api))); return true; } catch (e) { return false; }
  }
  // A due ping on a context the browser holds suspended raises the notice and asks for a resume.
  function soundPing(api, kind) {
    var ac = audioContext();
    if (!ac) return;
    if (ac.state === 'running') { play(api, ac, kind); return; }
    if (!rq.blocked) { rq.blocked = true; api.render(); }
    resumeAudio(api, ac);
  }
  // Once resumed the notice goes and what still pings plays at once, counted on the schedule; `then` runs
  // when nothing played. Two resumes answering together play once: the first clears rq.blocked.
  function resumeAudio(api, ac, then) {
    try {
      var p = typeof ac.resume === 'function' ? ac.resume() : null;
      if (!p || typeof p.then !== 'function') return;
      p.then(function () {
        if (ac.state !== 'running') return;
        var list = rq.blocked ? pingList(api) : [], played = false;
        if (rq.blocked) { rq.blocked = false; api.render(); }
        if (list.length) {
          rq.ping = { lastAt: Date.now(), seen: list.map(function (r) { return r.id; }) };
          played = play(api, ac, pingDue(null, Date.now(), list).pattern);
        }
        if (!played && then) then();
      }, function () { /* autoplay refused: the notice stays */ });
    } catch (e) { /* the notice stays */ }
  }
  // A click or key inside the room UI: the gesture a browser wants before a page may make sound.
  function unlockAudio(api) {
    var c = api.ui.client;
    if (!c || c.status !== 'in' || !soundsOn(prefs(api))) return;
    var ac = audioContext();
    if (ac && ac.state !== 'running') resumeAudio(api, ac);
  }

  // «● » before the tab title while something pings. A title the page writes meanwhile becomes the base;
  // the exact original comes back when the badge was the last thing written.
  function syncTitle(on) {
    var doc = typeof document !== 'undefined' ? document : null;
    if (!doc || typeof doc.title !== 'string') return;
    var t = rq.title, cur = doc.title;
    if (t && cur !== t.shown) t.base = titleWithBadge(cur, false);
    if (on) {
      if (!t) t = rq.title = { base: cur, shown: null };
      var want = titleWithBadge(t.base, true);
      if (cur !== want) doc.title = want;
      t.shown = doc.title;
    } else if (t) {
      rq.title = null;
      var back = cur === t.shown ? t.base : titleWithBadge(cur, false);
      if (back !== cur) doc.title = back;
    }
  }

  // Which requests ping for me, the title badge and the shared schedule. `sound` is false for a refresh
  // after a local change (heard, sound switch), which never plays.
  function pingTick(api, now, sound) {
    var list = pingList(api), ids = list.map(function (r) { return r.id; });
    var changed = ids.join('\n') !== rq.pinging.join('\n');
    rq.pinging = ids;
    syncTitle(ids.length > 0);
    if (!ids.length) {
      rq.ping.seen = [];
      if (rq.blocked) { rq.blocked = false; changed = true; }
    } else if (sound) {
      var due = pingDue(rq.ping, now, list);
      if (due.ping) { rq.ping = { lastAt: now, seen: ids }; soundPing(api, due.pattern); }
    }
    if (changed) api.render();
  }
  function stopPing(api) {
    var had = rq.pinging.length > 0 || rq.blocked;
    rq.pinging = [];
    rq.blocked = false;
    rq.ping = { lastAt: null, seen: [] };
    syncTitle(false);
    if (had) api.render();
  }

  // The shell calls this about once a second from mount on, whether the panel is open or not.
  function tick(api) {
    var c = api.ui.client, me = api.me(), now = Date.now();
    if (!c || c.status !== 'in' || !me) { rq.seenAll = null; rq.taken = null; stopPing(api); return; }
    var objects = c.merged().objects;
    if (rq.taken) {
      var taken = own(objects, rq.taken) ? objects[rq.taken] : null;
      if (!taken || taken.deleted || taken.status !== 'accepted') { rq.taken = null; api.render(); }
    }
    Object.keys(rq.flash).forEach(function (id) { if (rq.flash[id] <= now) delete rq.flash[id]; });
    var all = requests(api).filter(function (r) { return r.status === 'requested' && !(r.by && r.by.client === me.client); })
      .map(function (r) { return r.id; });
    if (rq.seenAll) {
      var fresh = all.filter(function (id) { return rq.seenAll.indexOf(id) < 0; });
      fresh.forEach(function (id) { rq.flash[id] = now + 3000; });
      if (fresh.length) api.render();
    }
    rq.seenAll = all;
    pingTick(api, now, true);
  }

  root.TacRoomUI.register({
    id: 'requests',
    l10n: l10n,
    helpers: {
      TYPES: TYPES, BIG_ACTIONS: BIG_ACTIONS, fmtNum: fmtNum, validReq: validReq, recalled: recalled, denial: denial, pickMortarRow: pickMortarRow,
      typeForKey: typeForKey, aimedAtMine: aimedAtMine, levelOk: levelOk, shotMatches: shotMatches, state: rq,
      pingTargets: pingTargets, pingDue: pingDue, titleWithBadge: titleWithBadge, playPattern: playPattern, unlockAudio: unlockAudio,
      hasTarget: hasTarget, cleanTo: cleanTo, toOptions: toOptions, addresseeText: addresseeText, ownMortarRow: ownMortarRow,
      memberPositions: memberPositions, sharePosition: sharePosition, POS_FADE_MS: POS_FADE_MS, ZONE: ZONE
    },
    // The dot on the room entry's «Комната» tab: a crew working the fire panel still sees a request arrive.
    entryBadge: function () { return rq.pinging.length; },
    tabs: function (api) {
      var T = api.T();
      return [{ id: 'requests', label: T.tabs.requests, narrow: true }, { id: 'assets', label: T.tabs.assets, narrow: true }];
    },
    // The sound notice leads the tools row, so it shows above every tab of the panel.
    tools: function (api) {
      var me = api.me();
      return blockedHtml(api) + (me && me.confirmed && api.ui.client.status === 'in'
        ? api.btn('reqNew', api.T().toolRequest, null, rq.form ? 'on big' : 'big') + positionTools(api) : '');
    },
    panel: function (id, api) { return id === 'assets' ? assetsHtml(api) : requestsHtml(api); },
    chips: chipsHtml,
    strip: stripHtml,
    draw: drawRings,
    tick: tick,
    notify: function (event, payload, api) {
      if (event !== 'shot' || !rq.taken) return;
      var r = objectOf(api, rq.taken);
      if (!r || r.kind !== 'request' || r.deleted || !validReq(r) || (r.status !== 'accepted' && r.status !== 'loaded')) { rq.taken = null; return; }
      // A shot on another planet or at another target leaves the request taken.
      if (!planetOk(api) || !shotMatches(r, calibrationOffsets(api), payload)) return;
      rq.taken = null;
      patchStatus(api, r, 'firing');
    },
    actions: {
      reqNew: function (el, api) {
        rq.form = !rq.form;
        if (!rq.form) cancelRequestPick(api);
        api.ui.tab = 'requests';
        api.ui.shelf = false;
        api.render();
      },
      reqType: function (el, api) {
        var type = el.getAttribute('data-type');
        if (TYPES.indexOf(type) >= 0) api.ui.drafts['request.type'] = type;
        api.render();
      },
      reqPick: function (el, api) {
        if (offPlanet(api)) return;
        api.setPick('request', function (tile) { rq.target = tile.slice(); api.render(); }, api.T().pickTarget);
      },
      'req-accept': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'accepted'); },
      'req-deny': function (el, api) { rq.denyAsk = el.getAttribute('data-id'); api.render(); },
      reqDenyReason: function (el, api) {
        var r = getReq(api, el), reason = el.getAttribute('data-reason');
        rq.denyAsk = null;
        if (r && denyReasons(api.T(), r).indexOf(reason) >= 0) patchStatus(api, r, 'denied', reason);
        api.render();
      },
      reqDenyCancel: function (el, api) { rq.denyAsk = null; api.render(); },
      // The author's withdrawal; on an accepted request it is the recall. No reason: the label comes from deniedBy.
      'req-cancel': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'denied'); },
      'req-take': function (el, api) {
        var r = getReq(api, el);
        if (!r || !hasTarget(r) || offPlanet(api)) return;
        rq.taken = r.id;
        api.ui.hooks.takeTarget([r.target.x, r.target.y]);
        api.ui.tab = 'requests';   // from the strip too: the fire card is on the Requests tab
        api.ui.shelf = false;
        api.render();
      },
      'req-load': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'loaded'); },
      'req-fire': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'firing'); },
      'req-place': function (el, api) {
        var r = getReq(api, el);
        if (!r || !hasTarget(r) || offPlanet(api)) return;
        api.ui.hooks.takePosition([r.target.x, r.target.y]);
        api.toast(api.T().placed);
      },
      'req-done': function (el, api) {
        var r = getReq(api, el);
        if (!r) return;
        var position = r.type === 'position' && hasTarget(r), tile = position ? [Math.floor(r.target.x), Math.floor(r.target.y)] : null;
        if (rq.taken === r.id) rq.taken = null;
        // The asset moves only once the server has the request done. A refusal lands in client.rejected,
        // which the shell toasts once; the mortar stays where it was.
        whenAcked(patchStatus(api, r, 'done'), function () {
          api.track('room_request_done');
          if (!position) return;
          var row = pickMortarRow(assetRows(api), api.me(), function (x) { return canEdit(api, x); });
          if (row) api.ui.client.queue({ op: 'patch', kind: 'asset', id: row.id, data: { tile: tile, state: 'deployed' } });
        });
      },
      // A repeat keeps the original request's level, map hash and addressee: the same place on the room's planet.
      'req-repeat': function (el, api) {
        var r = getReq(api, el);
        if (!r || offPlanet(api)) return;
        queueRequest(api, r.type, hasTarget(r) ? [r.target.x, r.target.y] : null, r.note, r.priority === 'urgent', r.flags, { level: r.level, h: r.h }, cleanTo(r.to));
      },
      reqShoot: function (el, api) {
        var r = getReq(api, el), ctx = api.ui.hooks.getContext();
        if (!r || !hasTarget(r) || rq.taken !== r.id || r.status !== 'accepted' || !ctx.calibration || !ctx.mortar || !planetOk(api)) return;
        if (api.ui.client.status !== 'in' || actionsFor(api, r).indexOf('take') < 0) return;
        var game = root.TacticalLogic.worldToGame(ctx.calibration.offset, r.target.x, r.target.y);
        api.ui.hooks.fire(game, [0, 0]);   // tactical.js records the shot and calls roomNotify('shot')
      },
      reqFocus: function (el, api) {
        var r = getReq(api, el), v = api.ui.hooks.view;
        if (!r) return;
        if (hasTarget(r)) v.centerOn(r.target.x + 0.5, r.target.y + 0.5, Math.max(v.scale, 8));
        api.ui.tab = 'requests';
        api.render();
      },
      // «Share position»: the next map click is my tile; a second press leaves pick mode.
      posShare: function (el, api) {
        if (api.ui.pick && api.ui.pick.mode === 'position') { api.cancelPick(); return; }
        if (offPlanet(api)) return;
        api.setPick('position', function (tile) { sharePosition(api, tile, api.ui.hooks.getContext().level); api.render(); }, api.T().posPickHint);
      },
      posFromFire: function (el, api) {
        var ctx = api.ui.hooks.getContext(), m = ctx.mortar;
        if (!m || !validTile(m.tile)) return;
        sharePosition(api, m.tile, isNum(m.level) ? m.level : ctx.level);
        api.render();
      },
      posClear: function (el, api) {
        var me = api.me();
        if (!me || !me.confirmed || typeof me.id !== 'string' || api.ui.client.status !== 'in') return;
        api.ui.client.queue({ op: 'patch', kind: 'member', id: me.id, data: { pos: null } });
        api.render();
      },
      assetState: function (el, api) {
        var id = el.getAttribute('data-id'), state = el.getAttribute('data-state');
        var row = assetRows(api).filter(function (x) { return x.id === id; })[0];
        if (!row || pick(ASSET_STATES, row.def.type, []).indexOf(state) < 0) return;
        api.ui.client.queue({ op: 'patch', kind: 'asset', id: id, data: { state: state } });
      },
      assetClaim: function (el, api) {
        var me = api.me();
        if (!me || !me.client) return;
        api.ui.client.queue({ op: 'patch', kind: 'asset', id: el.getAttribute('data-id'), data: { claimedBy: el.getAttribute('data-release') ? null : me.client } });
      },
      assetsTab: function (el, api) { api.ui.tab = 'assets'; api.ui.shelf = false; api.render(); },
      // «Heard»: silences that one request in this browser only; nothing goes to the room.
      reqHeard: function (el, api) {
        var id = el.getAttribute('data-id');
        if (pingIds(api).indexOf(id) < 0) return;
        addHeard(api, id);
        pingTick(api, Date.now(), false);
        api.render();
      },
      reqUnlock: function (el, api) { unlockAudio(api); },
      // A volume pick is a click: it may start the context, and the officer hears the level chosen.
      // The preview counts as a ping, so the schedule never plays over it.
      reqVolume: function (el, api) {
        var v = el.getAttribute('data-volume'), p = prefs(api);
        if (!own(VOLUMES, v)) return;
        p.volume = v;
        api.ui.storage.write(PREFS_KEY, p);
        var ac = soundsOn(p) ? audioContext() : null;
        var preview = function () { if (play(api, ac, 'normal')) rq.ping.lastAt = Date.now(); };
        if (ac && ac.state === 'running') preview();
        else if (ac) resumeAudio(api, ac, preview);
        api.render();
      }
    },
    changes: {
      assetShell: function (el, api) {
        var ctx = api.ui.hooks.getContext();
        var s = ((ctx.fork && ctx.fork.constants && ctx.fork.constants.shells) || []).filter(function (x) { return x.id === el.value; })[0];
        var shell = s && typeof s.id === 'string' && s.id.length <= 40 ? s.id : null;
        var radius = shell && isNum(s.radius) && s.radius > 0 && s.radius <= 100 ? s.radius : null;
        api.ui.client.queue({ op: 'patch', kind: 'asset', id: el.getAttribute('data-id'), data: { shell: shell, radius: radius } });
      },
      reqSounds: function (el, api) {
        var p = prefs(api);
        p.sounds = el.checked;
        api.ui.storage.write(PREFS_KEY, p);
        pingTick(api, Date.now(), false);
        api.render();
      },
      // «Mortar zones» off hides the zone fills and circles; the mortar square stays.
      reqZone: function (el, api) {
        var p = prefs(api), view = api.ui.hooks && api.ui.hooks.view;
        p.zone = !!el.checked;
        api.ui.storage.write(PREFS_KEY, p);
        if (view && typeof view.requestDraw === 'function') view.requestDraw();
        api.render();
      }
    },
    submits: {
      request: function (form, api) {
        if (offPlanet(api)) return;
        var T = api.T(), f = form.elements, target = rq.target;
        var typed = String(f.coords.value || '').trim().match(/^(-?\d+)[\s,;]+(-?\d+)$/);
        if (typed) {
          var w = api.toWorld(+typed[1], +typed[2]);
          if (!w) { api.toast(T.noCalibration); return; }
          target = w;
        }
        // A task needs its text and an addressee, not a point; every other type needs the point.
        var type = draftType(api), task = type === 'task', note = String((f.note && f.note.value) || '');
        if (!target && !task) { api.toast(T.needTarget); return; }
        if (task && !note.trim()) { api.toast(T.taskNeedText); return; }
        var chosen = f.to ? String(f.to.value || '') : '';
        var option = toOptions(api, type).filter(function (o) { return o.value === chosen; })[0];
        if (!option) { api.toast(T.reqToStale); return; }
        if (task && !option.to) { api.toast(T.reqToNeed); return; }
        queueRequest(api, type, target, note, !!(f.urgent && f.urgent.checked), type === 'supply' && f.beacon && f.beacon.checked ? ['beacon'] : [], null, option.to);
        rq.form = false;
        rq.target = null;
        cancelRequestPick(api);
        api.clearDrafts('request');
        api.render();
      }
    },
    mount: function (api) {
      if (rq.mounted) return;
      rq.mounted = true;
      document.addEventListener('keydown', function (e) {
        if (!api.ui.on || !rq.form || !api.ui.client) return;
        var type = typeForKey(e, document.activeElement, api.ui.client.status);
        if (!type) return;
        api.ui.drafts['request.type'] = type;
        api.render();
        e.preventDefault();
      });
      // Browsers hold audio back until a gesture: a click or key anywhere in the room UI resumes it.
      ['tacRoom', 'tacRoomStrip', 'tacRoomChips', 'tacRoomShelf', 'tacRoomEntry'].forEach(function (id) {
        var box = typeof document.getElementById === 'function' ? document.getElementById(id) : null;
        if (!box) return;
        ['click', 'keydown'].forEach(function (type) {
          box.addEventListener(type, function () { try { unlockAudio(api); } catch (e) { /* never break a click */ } });
        });
      });
    },
    // The shell has no unmount call yet: whoever removes the room gets the tab title back and silence.
    unmount: function (api) { stopPing(api); }
  });
})(window);

// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Officers' room — strike and support requests (form, cards, the Series T fire
// card inside a taken mortar request), the manual asset board with cooldown
// hints, chips over the map, the request strip, target rings and a one-time
// sound for the asset owner. Registers into tactical/room-ui.js.
//
// Stage 1: only two request types are offered, mortar strikes and mortar
// position requests, for the staff officer / mortar crew pair.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  var PREFS_KEY = 'chemdb-tactical:room-prefs';
  var TYPES = ['mortar', 'position'];
  var ASSET_STATES = {
    mortar: ['deployed', 'moving', 'destroyed'], ob: ['ready', 'loading', 'cooldown'],
    dropship: ['offline', 'ship', 'toLz', 'onLz', 'flyby', 'cooldown'], supply: ['ready', 'cooldown'], medevac: ['available', 'unavailable']
  };
  var STATE_CLASS = { deployed: 'ready', ready: 'ready', available: 'ready', onLz: 'ready', ship: 'ready', moving: 'busy', loading: 'busy',
    toLz: 'busy', flyby: 'busy', cooldown: 'cooldown', offline: 'down', destroyed: 'down', unavailable: 'down' };
  var TYPE_COLOUR = { mortar: '#ffb627', ob: '#ff3d5a', cas: '#00e5ff', supply: '#39ff85', medevac: '#c17aff', other: '#e8ecf4', position: '#00e5ff' };
  var rq = { form: false, taken: null, target: null, denyAsk: null, seenMine: null, seenAll: null, flash: {}, audio: null };

  var l10n = {
    en: {
      tabs: { requests: 'Requests', assets: 'Assets' },
      toolRequest: 'Request', newRequest: 'New request', pickTarget: 'Pick on the map', coordsHint: 'or type X Y from the rangefinder',
      note: 'Note', urgent: 'Urgent', beacon: 'Beacon placed', send: 'Send', empty: 'No requests', min: 'min',
      needTarget: 'Pick a target first.', noCalibration: 'No calibration: pick the target on the map.',
      types: { mortar: 'Mortar', ob: 'OB', cas: 'CAS', supply: 'Supply drop', medevac: 'Medevac', other: 'Other', position: 'Position' },
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
        dropship: { offline: 'no pilot', ship: 'on the ship', toLz: 'to LZ', onLz: 'on LZ', flyby: 'fly-by', cooldown: 'cooldown' },
        supply: { ready: 'ready', cooldown: 'cooldown' }, medevac: { available: 'available', unavailable: 'unavailable' }
      },
      claim: 'Crew', unclaim: 'Release', shell: 'Shell', sounds: 'Sound for requests to my assets',
      chipMortar: 'Mortars', chipNames: { ob: 'OB', dropship: 'CAS', supply: 'Supply' }, chipRequests: 'Requests {n}'
    },
    ru: {
      tabs: { requests: 'Запросы', assets: 'Ресурсы' },
      toolRequest: 'Запрос', newRequest: 'Новый запрос', pickTarget: 'Указать на карте', coordsHint: 'или введите X Y с дальномера',
      note: 'Заметка', urgent: 'Срочно', beacon: 'Маяк поставлен', send: 'Отправить', empty: 'Запросов нет', min: 'мин',
      needTarget: 'Сначала укажите цель.', noCalibration: 'Нет калибровки: укажите цель на карте.',
      types: { mortar: 'Миномёт', ob: 'ОБ', cas: 'КАС', supply: 'Поставка', medevac: 'Эвакуация', other: 'Прочее', position: 'Позиция' },
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
        dropship: { offline: 'нет пилота', ship: 'на корабле', toLz: 'летит к LZ', onLz: 'на LZ', flyby: 'облёт', cooldown: 'перезарядка' },
        supply: { ready: 'готова', cooldown: 'перезарядка' }, medevac: { available: 'доступна', unavailable: 'недоступна' }
      },
      claim: 'Расчёт', unclaim: 'Отпустить', shell: 'Снаряд', sounds: 'Звук на запросы к моим ресурсам',
      chipMortar: 'Миномёты', chipNames: { ob: 'ОБ', dropship: 'КАС', supply: 'Поставка' }, chipRequests: 'Запросы {n}'
    }
  };

  // ── data ─────────────────────────────────────────────

  function claimsFor(api, req) { return { claimed: R.claimants(api.ui.client.merged().objects, req) }; }
  function actionsFor(api, req) { return R.requestActions(api.ui.policy, api.me(), req, claimsFor(api, req)); }
  function constants(api) { var ctx = api.ui.hooks.getContext(); return ctx.fork ? ctx.fork.constants : null; }
  function getReq(api, el) { return api.ui.client.merged().objects[el.getAttribute('data-id')] || null; }
  function isOpen(r) { return r.status !== 'done' && r.status !== 'denied'; }

  function deadlineOf(api, req) {
    var c = constants(api);
    if (req.status !== 'firing' || !req.firedAt || !c) return null;
    if (req.type === 'mortar' || req.type === 'ob') return R.deadlines(req.type, req.firedAt, c, api.ui.policy).impactAt;
    if (req.type === 'cas') return R.deadlines('dropship', req.firedAt, c, api.ui.policy).readyAt;
    return null;
  }

  // The latest cooldown hint for an asset from its last fired request; hints never change states.
  function readyAt(api, assetType) {
    var c = constants(api), reqType = { ob: 'ob', supply: 'supply', dropship: 'cas' }[assetType], best = null;
    if (!reqType || !c) return null;
    api.ui.client.visible({ kinds: ['request'] }).forEach(function (r) {
      if (r.type !== reqType || !r.firedAt) return;
      var d = R.deadlines(assetType === 'dropship' ? 'dropship' : reqType, r.firedAt, c, api.ui.policy).readyAt;
      if (d && (!best || d > best)) best = d;
    });
    return best && best > api.ui.client.serverNow() ? best : null;
  }

  function assetRows(api) {
    var objs = api.ui.client.merged().objects, rows = [];
    api.ui.policy.assets.forEach(function (def) {
      for (var n = 1; n <= (def.count || 1); n++) {
        var id = 'asset-' + def.type + '-' + n, o = objs[id];
        rows.push({ id: id, def: def, n: n, obj: o && !o.deleted ? o : null });
      }
    });
    return rows;
  }

  function canEdit(api, row) {
    var me = api.me(), P = api.ui.policy, o = row.obj || {};
    if (!me || !me.confirmed || api.ui.client.status !== 'in' || !R.layerWritable(P, me, 'assets')) return false;
    return row.def.owner === me.post || R.isStaff(P, me) || o.claimedBy === me.client;
  }

  function mortarRadius(api) {
    var best = null;
    assetRows(api).forEach(function (row) {
      if (row.def.type === 'mortar' && row.obj && row.obj.radius && row.obj.state === 'deployed') best = Math.max(best || 0, row.obj.radius);
    });
    return best;
  }

  function patchStatus(api, req, status, data) {
    var d = { status: status };
    Object.keys(data || {}).forEach(function (k) { d[k] = data[k]; });
    return api.ui.client.queue({ op: 'patch', kind: 'request', id: req.id, expectedStatus: req.status, data: d });
  }

  function queueRequest(api, type, target, note, urgent, flags) {
    var ctx = api.ui.hooks.getContext();
    return api.ui.client.queue({
      op: 'put', kind: 'request', id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      data: { type: type, target: { x: target[0], y: target[1] }, note: note || '', priority: urgent ? 'urgent' : 'normal',
        flags: flags || [], level: ctx.level || 0, h: ctx.meta ? ctx.meta.h : '' }
    });
  }

  // ── HTML ─────────────────────────────────────────────

  function actionButton(api, action, req) {
    var T = api.T();
    var label = action === 'fire' ? (T.actions.fire[req.type] || T.actions.fire.other)
      : action === 'done' && T.doneBy[req.type] ? T.doneBy[req.type] : T.actions[action];
    var big = action === 'take' || action === 'place' || action === 'accept' || action === 'fire' || action === 'load';
    return api.btn('req-' + action, label, { id: req.id }, big ? 'big' : '');
  }

  function fireCardHtml(api, req) {
    var F = api.T().fireCard, ctx = api.ui.hooks.getContext(), L = root.TacticalLogic, esc = api.esc;
    if (!ctx.calibration) return '<div class="tac-room-fire"><p class="tac-msg warn">' + esc(F.noCal) + '</p></div>';
    if (!ctx.mortar) return '<div class="tac-room-fire"><p class="tac-msg warn">' + esc(F.noMortar) + '</p></div>';
    var tile = [req.target.x, req.target.y];
    var checks = L.mortarFireChecks(ctx.planet, ctx.mortar.tile, tile, ctx.fork.constants.mortar, ctx.mortar.mode);
    var game = L.worldToGame(ctx.calibration.offset, tile[0], tile[1]);
    var room = api.offset();
    var html = '<div class="tac-room-fire-coords">' + game[0] + ' ' + game[1] + '</div>' +
      '<div class="tac-muted">' + esc(api.fmt(F.distance, { d: checks.distance.toFixed(1) })) + ' · ' +
      esc(api.fmt(F.error, { x: checks.bounds[0], y: checks.bounds[1] })) + '</div>' +
      checks.reasons.map(function (r) { return '<p class="tac-msg error">' + esc(F.refused[r] || r) + '</p>'; }).join('') +
      checks.warnings.map(function (w) { return '<p class="tac-msg warn">' + esc(F.warnings[w] || w) + '</p>'; }).join('') +
      (room && (room[0] !== ctx.calibration.offset[0] || room[1] !== ctx.calibration.offset[1]) ? '<p class="tac-msg warn">' + esc(F.calDiffers) + '</p>' : '');
    return '<div class="tac-room-fire">' + html + (checks.ok ? api.btn('reqShoot', F.shoot, { id: req.id }, 'big') : '') + '</div>';
  }

  function cardHtml(api, req, compact) {
    var T = api.T(), c = api.ui.client, esc = api.esc, P = api.ui.policy;
    var acts = c.status === 'in' ? actionsFor(api, req) : [];
    var who = req.by ? api.postName(req.by.post) + (req.by.squad ? ' · ' + api.squadName(req.by.squad) : '') : '';
    var age = Math.max(0, Math.round((c.serverNow() - req.at) / 60000));
    var dl = deadlineOf(api, req);
    var byStaff = req.status === 'denied' && req.deniedBy && req.by && req.deniedBy.client !== req.by.client &&
      R.levelOf(P, req.deniedBy.post) === 'staff';
    var status = req.status === 'firing' ? (T.firingBy[req.type] || T.statuses.firing) : (byStaff ? T.deniedByStaff : T.statuses[req.status]);
    var head = '<b>' + esc(T.types[req.type]) + '</b> <span class="tac-item-coords">' + esc(api.gameText(req.target.x, req.target.y)) + '</span> · ' +
      '<span class="tac-room-status">' + esc(status) + '</span>' +
      (dl ? ' · ' + esc(req.type === 'cas' ? T.readyIn : T.impactIn) + ' <span data-deadline="' + dl + '"></span>' : '');
    var flash = rq.flash[req.id] && rq.flash[req.id] > Date.now() ? ' flash' : '';
    if (compact) {
      return '<div class="tac-room-card' + (req.priority === 'urgent' ? ' urgent' : '') + flash + '" data-room-action="reqFocus" data-id="' + esc(req.id) + '">' +
        head + '<div class="tac-muted">' + esc(who) + ' · ' + age + ' ' + esc(T.min) + '</div>' + (acts[0] ? actionButton(api, acts[0], req) : '') + '</div>';
    }
    var details = esc(who) + ' · ' + age + ' ' + esc(T.min) + (req.note ? ' · ' + esc(req.note) : '') +
      ((req.flags || []).indexOf('beacon') >= 0 ? ' · ' + esc(T.beacon) : '') + (req.reason && !byStaff ? ' · ' + esc(req.reason) : '');
    var actionsHtml = rq.denyAsk === req.id
      ? '<div class="tac-room-actions">' + T.denyReasons.map(function (r) { return api.btn('reqDenyReason', r, { id: req.id, reason: r }); }).join('') +
        api.btn('reqDenyCancel', T.denyCancel) + '</div>'
      : '<div class="tac-room-actions">' + acts.map(function (a) { return actionButton(api, a, req); }).join('') + '</div>';
    return '<div class="tac-room-req st-' + req.status + (req.priority === 'urgent' ? ' urgent' : '') + (req.pending ? ' faded' : '') + '" style="--req:' + TYPE_COLOUR[req.type] + '">' +
      '<div>' + head + '</div><div class="tac-muted">' + details + '</div>' + actionsHtml +
      (rq.taken === req.id ? fireCardHtml(api, req) : '') + '</div>';
  }

  function formHtml(api) {
    var T = api.T(), esc = api.esc, type = api.draft('request', 'type', 'mortar'), t = rq.target;
    return '<section class="tac-section tac-room-reqform"><h2>' + esc(T.newRequest) + '</h2>' +
      '<div class="tac-room-types">' + TYPES.map(function (k, i) { return api.btn('reqType', (i + 1) + ' ' + T.types[k], { type: k }, k === type ? 'on' : ''); }).join('') + '</div>' +
      '<form data-room-form="request" class="tac-room-form">' +
      '<div class="tac-room-target">' + api.btn('reqPick', T.pickTarget, null, 'big') +
      '<span class="tac-item-coords">' + (t ? esc(api.gameText(t[0], t[1])) : '—') + '</span></div>' +
      '<label class="tac-input-label">' + esc(T.coordsHint) + '<input class="tac-input" name="coords" autocomplete="off" value="' + esc(api.draft('request', 'coords', '')) + '"></label>' +
      '<label class="tac-input-label">' + esc(T.note) + '<input class="tac-input" name="note" maxlength="' + api.ui.policy.limits.note + '" value="' + esc(api.draft('request', 'note', '')) + '"></label>' +
      '<label class="tac-room-check"><input type="checkbox" name="urgent"' + (api.draft('request', 'urgent', false) ? ' checked' : '') + '> ' + esc(T.urgent) + '</label>' +
      (type === 'supply' ? '<label class="tac-room-check"><input type="checkbox" name="beacon"' + (api.draft('request', 'beacon', false) ? ' checked' : '') + '> ' + esc(T.beacon) + '</label>' : '') +
      '<button type="submit" class="btn-small tac-room-btn big">' + esc(T.send) + '</button></form></section>';
  }

  function requestsHtml(api) {
    var list = api.ui.client.requests();
    return (rq.form && api.ui.client.status === 'in' ? formHtml(api) : '') +
      (list.length ? list.map(function (r) { return cardHtml(api, r, false); }).join('') : '<p class="tac-muted">' + api.esc(api.T().empty) + '</p>');
  }

  function assetsHtml(api) {
    var T = api.T(), ctx = api.ui.hooks.getContext(), me = api.me(), c = api.ui.client, P = api.ui.policy, esc = api.esc;
    var shells = (ctx.fork && ctx.fork.constants.shells) || [];
    var rows = assetRows(api).map(function (row) {
      var o = row.obj || {}, def = row.def, editable = canEdit(api, row), ready = readyAt(api, def.type);
      var stateButtons = editable ? (ASSET_STATES[def.type] || []).map(function (s) {
        return api.btn('assetState', T.assetStates[def.type][s], { id: row.id, state: s }, o.state === s ? 'on' : '');
      }).join('') : '';
      var claim = '';
      if (def.claimable && me && me.confirmed && c.status === 'in') {
        if (o.claimedBy === me.client) claim = api.btn('assetClaim', T.unclaim, { id: row.id, release: '1' });
        else if (!o.claimedBy && ((me.functions || []).indexOf('mortar') >= 0 || R.levelOf(P, me.post) !== 'squad')) claim = api.btn('assetClaim', T.claim, { id: row.id });
      }
      var crew = o.claimedBy ? c.member(o.claimedBy) : null;
      var shellSelect = def.type === 'mortar' && editable && shells.length
        ? '<select class="tac-select" data-room-change="assetShell" data-id="' + row.id + '"><option value="">' + esc(T.shell) + '</option>' +
          shells.map(function (s) { return '<option value="' + esc(s.id) + '"' + (o.shell === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>'
        : '';
      return '<div class="tac-room-row"><span class="tac-room-name"><b>' + esc(api.fmt(T.assetNames[def.type], { n: row.n })) + '</b> · ' +
        '<span class="tac-room-state ' + (STATE_CLASS[o.state] || '') + '">' + esc(o.state ? T.assetStates[def.type][o.state] : '—') + '</span>' +
        (ready ? ' · ' + esc(T.readyIn) + ' <span data-deadline="' + ready + '"></span>' : '') +
        (o.radius ? ' <span class="tac-muted">· r ' + o.radius + '</span>' : '') +
        (crew ? '<br><span class="tac-muted">' + esc(T.claim) + ': ' + esc(api.postName(crew.post) + (crew.callsign ? ' «' + crew.callsign + '»' : '')) + '</span>' : '') +
        '</span><span class="tac-room-actions">' + stateButtons + claim + shellSelect + '</span></div>';
    }).join('');
    var p = api.ui.storage.read(PREFS_KEY) || {};
    return rows + '<label class="tac-room-check"><input type="checkbox" data-room-change="reqSounds"' + (p.sounds !== false ? ' checked' : '') + '> ' + esc(T.sounds) + '</label>';
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
      out += '<button type="button" class="tac-room-chip ' + (STATE_CLASS[o.state] || '') + '" data-room-action="assetsTab">' +
        esc(T.chipNames[type] + ' ' + (o.state ? T.assetStates[type][o.state] : '—')) + (ready ? ' <span data-deadline="' + ready + '"></span>' : '') + '</button>';
    });
    var open = api.ui.client.requests().filter(isOpen).length;
    return out + '<button type="button" class="tac-room-chip' + (open ? ' busy' : '') + '" data-room-action="tab" data-tab="requests">' + esc(api.fmt(T.chipRequests, { n: open })) + '</button>';
  }

  function stripHtml(api) {
    var open = api.ui.client.requests().filter(isOpen).slice(0, 6);
    return open.length ? open.map(function (r) { return cardHtml(api, r, true); }).join('') : '<span class="tac-muted">' + api.esc(api.T().empty) + '</span>';
  }

  // ── map, sound, keyboard ────────────────────────────────────────

  function drawRings(ctx, v, api) {
    var level = api.ui.hooks.getContext().level || 0, radius = mortarRadius(api);
    api.ui.client.requests().forEach(function (r) {
      if (!isOpen(r) || (r.level || 0) !== level) return;
      var p = v.worldToScreen(r.target.x + 0.5, r.target.y + 0.5), rad = Math.max(9, v.scale * 0.9);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = r.priority === 'urgent' ? 3 : 2;
      ctx.strokeStyle = TYPE_COLOUR[r.type];
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
    var consts = constants(api);
    assetRows(api).forEach(function (row) {
      var o = row.obj;
      if (row.def.type !== 'mortar' || !o || !o.tile || o.state !== 'deployed') return;
      var m = v.worldToScreen(o.tile[0] + 0.5, o.tile[1] + 0.5), s = Math.max(5, v.scale * 0.6);
      ctx.save();
      ctx.fillStyle = TYPE_COLOUR.mortar;
      ctx.fillRect(m[0] - s, m[1] - s, s * 2, s * 2);
      if (consts && consts.mortar) {
        ctx.setLineDash([6, 6]);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = TYPE_COLOUR.mortar;
        [consts.mortar.minRange, consts.mortar.maxRange].forEach(function (tiles) {
          ctx.beginPath();
          ctx.arc(m[0], m[1], tiles * v.scale, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
      ctx.restore();
    });
    if (rq.target) {
      var q = v.worldToScreen(rq.target[0] + 0.5, rq.target[1] + 0.5);
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#e8ecf4';
      ctx.beginPath();
      ctx.arc(q[0], q[1], Math.max(9, v.scale * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function beep(api) {
    var p = api.ui.storage.read(PREFS_KEY) || {};
    if (p.sounds === false) return;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      rq.audio = rq.audio || new AC();
      var o = rq.audio.createOscillator(), g = rq.audio.createGain();
      o.frequency.value = 660;
      g.gain.value = 0.06;
      o.connect(g);
      g.connect(rq.audio.destination);
      o.start();
      o.stop(rq.audio.currentTime + 0.15);
    } catch (e) { /* no audio device */ }
  }

  function tick(api) {
    var c = api.ui.client, me = api.me();
    if (!c || c.status !== 'in' || !me) { rq.seenMine = null; rq.seenAll = null; return; }
    var open = c.requests().filter(function (r) { return r.status === 'requested' && !(r.by && r.by.client === me.client); });
    var all = open.map(function (r) { return r.id; });
    var mine = open.filter(function (r) { return actionsFor(api, r).indexOf('accept') >= 0; }).map(function (r) { return r.id; });
    if (rq.seenAll) {
      var fresh = all.filter(function (id) { return rq.seenAll.indexOf(id) < 0; });
      fresh.forEach(function (id) { rq.flash[id] = Date.now() + 3000; });
      if (fresh.length) api.render();
    }
    if (rq.seenMine && mine.some(function (id) { return rq.seenMine.indexOf(id) < 0; })) beep(api);
    rq.seenAll = all;
    rq.seenMine = mine;
  }

  root.TacRoomUI.register({
    id: 'requests',
    l10n: l10n,
    tabs: function (api) {
      var T = api.T();
      return [{ id: 'requests', label: T.tabs.requests, narrow: true }, { id: 'assets', label: T.tabs.assets, narrow: true }];
    },
    tools: function (api) {
      var me = api.me();
      return me && me.confirmed && api.ui.client.status === 'in' ? api.btn('reqNew', api.T().toolRequest, null, rq.form ? 'on big' : 'big') : '';
    },
    panel: function (id, api) { return id === 'assets' ? assetsHtml(api) : requestsHtml(api); },
    chips: chipsHtml,
    strip: stripHtml,
    draw: drawRings,
    tick: tick,
    notify: function (event, payload, api) {
      if (event !== 'shot' || !rq.taken) return;
      var r = api.ui.client.merged().objects[rq.taken];
      if (r && (r.status === 'accepted' || r.status === 'loaded')) patchStatus(api, r, 'firing');
      rq.taken = null;
    },
    actions: {
      reqNew: function (el, api) { rq.form = !rq.form; api.ui.tab = 'requests'; api.ui.shelf = false; api.render(); },
      reqType: function (el, api) { api.ui.drafts['request.type'] = el.getAttribute('data-type'); api.render(); },
      reqPick: function (el, api) { api.setPick('request', function (tile) { rq.target = tile.slice(); api.render(); }, api.T().pickTarget); },
      'req-accept': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'accepted'); },
      'req-deny': function (el, api) { rq.denyAsk = el.getAttribute('data-id'); api.render(); },
      reqDenyReason: function (el, api) { var r = getReq(api, el); rq.denyAsk = null; if (r) patchStatus(api, r, 'denied', { reason: el.getAttribute('data-reason') }); },
      reqDenyCancel: function (el, api) { rq.denyAsk = null; api.render(); },
      'req-cancel': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'denied', { reason: api.T().withdrawn }); },
      'req-take': function (el, api) {
        var r = getReq(api, el);
        if (!r) return;
        rq.taken = r.id;
        api.ui.hooks.takeTarget([r.target.x, r.target.y]);
        api.render();
      },
      'req-load': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'loaded'); },
      'req-fire': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'firing'); },
      'req-place': function (el, api) {
        var r = getReq(api, el);
        if (!r) return;
        api.ui.hooks.takePosition([r.target.x, r.target.y]);
        api.toast(api.T().placed);
      },
      'req-done': function (el, api) {
        var r = getReq(api, el);
        if (!r) return;
        patchStatus(api, r, 'done');
        api.track('room_request_done');
        if (rq.taken === r.id) rq.taken = null;
        if (r.type === 'position') {
          var row = assetRows(api).filter(function (x) { return x.def.type === 'mortar' && canEdit(api, x); })[0];
          if (row) api.ui.client.queue({ op: 'patch', kind: 'asset', id: row.id, data: { tile: [r.target.x, r.target.y], state: 'deployed' } });
        }
      },
      'req-repeat': function (el, api) {
        var r = getReq(api, el);
        if (r) queueRequest(api, r.type, [r.target.x, r.target.y], r.note, r.priority === 'urgent', r.flags);
      },
      reqShoot: function (el, api) {
        var r = getReq(api, el), ctx = api.ui.hooks.getContext();
        if (!r || !ctx.calibration) return;
        var game = root.TacticalLogic.worldToGame(ctx.calibration.offset, r.target.x, r.target.y);
        api.ui.hooks.fire(game, [0, 0]);   // tactical.js records the shot and calls roomNotify('shot')
      },
      reqFocus: function (el, api) {
        var r = getReq(api, el), v = api.ui.hooks.view;
        if (!r) return;
        v.centerOn(r.target.x + 0.5, r.target.y + 0.5, Math.max(v.scale, 8));
        api.ui.tab = 'requests';
        api.render();
      },
      assetState: function (el, api) {
        api.ui.client.queue({ op: 'patch', kind: 'asset', id: el.getAttribute('data-id'), data: { state: el.getAttribute('data-state') } });
      },
      assetClaim: function (el, api) {
        var me = api.me();
        if (!me) return;
        api.ui.client.queue({ op: 'patch', kind: 'asset', id: el.getAttribute('data-id'), data: { claimedBy: el.getAttribute('data-release') ? null : me.client } });
      },
      assetsTab: function (el, api) { api.ui.tab = 'assets'; api.ui.shelf = false; api.render(); }
    },
    changes: {
      assetShell: function (el, api) {
        var ctx = api.ui.hooks.getContext();
        var s = ((ctx.fork && ctx.fork.constants.shells) || []).filter(function (x) { return x.id === el.value; })[0];
        api.ui.client.queue({ op: 'patch', kind: 'asset', id: el.getAttribute('data-id'),
          data: { shell: el.value || null, radius: s && typeof s.radius === 'number' ? s.radius : null } });
      },
      reqSounds: function (el, api) {
        var p = api.ui.storage.read(PREFS_KEY) || {};
        p.sounds = el.checked;
        api.ui.storage.write(PREFS_KEY, p);
      }
    },
    submits: {
      request: function (form, api) {
        var T = api.T(), f = form.elements, target = rq.target;
        var typed = String(f.coords.value || '').trim().match(/^(-?\d+)[\s,;]+(-?\d+)$/);
        if (typed) {
          var w = api.toWorld(+typed[1], +typed[2]);
          if (!w) { api.toast(T.noCalibration); return; }
          target = w;
        }
        if (!target) { api.toast(T.needTarget); return; }
        var type = api.draft('request', 'type', 'mortar');
        queueRequest(api, type, target, f.note.value, f.urgent.checked, type === 'supply' && f.beacon && f.beacon.checked ? ['beacon'] : []);
        rq.form = false;
        rq.target = null;
        api.clearDrafts('request');
        api.render();
      }
    },
    mount: function (api) {
      document.addEventListener('keydown', function (e) {
        if (!api.ui.on || !rq.form || !/^[1-6]$/.test(e.key)) return;
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        api.ui.drafts['request.type'] = TYPES[+e.key - 1];
        api.render();
        e.preventDefault();
      });
    }
  });
})(window);

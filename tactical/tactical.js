/*
  SPDX-License-Identifier: GPL-3.0-only
  Copyright (C) 2026 MikameO
  This file is part of Space Station Recipes.
  See LICENSE for details.
*/
// Tactical map page: data loading, fork and planet selection, the map view, the
// round calibration and the panel. Pure maths lives in tactical/logic.js
// (window.TacticalLogic), the canvas view in tactical/mapview.js.
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var Logic = window.TacticalLogic;
  var LANG = window.I18N_LANG === 'ru' ? 'ru' : 'en';
  var YM_COUNTER_ID = 108585248;
  var STORAGE_PREFIX = 'chemdb-tactical:';
  // Below this many CSS px per tile a calibration pick zooms in instead of
  // picking (decision 13): LV-624 fits at ~4 px per tile on a 1080p screen.
  var PICK_MIN_SCALE = 12;
  var PICK_ZOOM_SCALE = 20;
  var TICK_MS = 30 * 1000;           // calibration age and the idle question
  var RENDER_AFTER_INPUT_MS = 350;   // let the click that woke the page land first
  var MAX_COORD = 1000;              // MortarComponent.MaxTarget, the spin boxes stop there
  var DASHES = /[−‒–—﹣－]/g;

  var L10N = {
    en: {
      pageName: 'Tactical map',
      fork: 'Fork',
      planet: 'Planet',
      fit: 'Fit',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      loading: 'Loading the map…',
      loadFailed: 'Could not load the map data.',
      retry: 'Retry',
      staleData: 'The map data changed while the page was open — reload the page.',
      world: 'world tile',
      notGame: 'not in-game coordinates yet',
      game: 'in-game coordinates',
      noArea: 'no area',
      beta: 'Beta: every number follows the game code, but it has not been checked in a round yet. Compare a check tile with your rangefinder before firing.',
      source: 'Data: {fork} at {sha} ({date}).',
      hint: 'Wheel or buttons zoom, dragging pans, a click picks a tile. With the map focused, arrows pan and Enter picks the tile under the crosshair.',
      flags: { ob: 'OB', cas: 'CAS', mortarFire: 'Mortar fire', mortarPlace: 'Mortar deploy', supply: 'Supply drop', lz: 'Landing zone' },
      planetPlayers: '{n}+ players',
      noStorage: 'This browser blocks site storage: the calibration is lost when the page reloads.',
      calTitle: 'Calibration',
      calIntro: 'Aim the rangefinder at a floor tile or a wall corner in line of sight — not at a tree or a lamp, their sprites stand taller than their tile. Click the same tile on the map and type what the rangefinder shows.',
      calPickFirst: 'Click the lased tile on the map.',
      calPickZoomed: 'Zoomed in — now click the exact tile.',
      calTile: 'Picked tile: {tile} (world)',
      calPasteHint: 'Pasting works in either field: “-100 200”, “LONGITUDE -100 LATITUDE 200”, “Para-Cam (-100):(200)”.',
      calPreview: 'Round offset will be {x} {y}.',
      calSave: 'Save the round offset',
      calDone: 'Round offset {x} {y}',
      calFrom: 'calibrated {age} on {coords}',
      calAge: 'calibrated {age}',
      parse: {
        tooFew: 'Type two numbers: longitude (X), then latitude (Y).',
        tooMany: 'Too many numbers — keep only longitude (X) and latitude (Y).',
        outOfRange: 'In-game coordinates stay within ±1000.'
      },
      outOfVariance: 'This offset is beyond ±{v}, which the server never rolls. Check the order of the numbers (longitude first) and the planet.',
      age: { now: 'just now', min: '{m} min ago', hour: '{h} h {m} min ago' },
      checkTitle: 'Check tile',
      checkAsk: 'Aim the rangefinder at the tile marked in amber. It should show:',
      checkMatch: '✓ Matches',
      checkMismatch: '✗ Does not match',
      checkShow: 'Show on map',
      checkOk: '✓ Checked on a second tile.',
      checkBad: '✗ The check tile did not match. Usual causes:',
      checkCauses: [
        'longitude and latitude typed in swapped order;',
        'another planet or fork is selected;',
        'this part of the map was changed for the round;',
        'the rangefinder hit a neighbouring tile.'
      ],
      checkOther: 'Try another tile',
      checkNone: 'No open floor tile nearby to check against — check on another tile when you can.',
      recalibrate: 'Calibrate again',
      sameRoundTitle: 'Same round?',
      sameRoundAge: 'Calibrated {age}.',
      sameRoundReasons: {
        reload: 'The page was reloaded.',
        idle: 'Nobody touched the page for 20 minutes.',
        offPlanet: 'A typed point is off the planet with this offset.'
      },
      sameRoundYes: 'Yes, same round',
      sameRoundCheck: 'Check a tile',
      newRound: 'New round',
      newRoundHint: 'New round clears the calibration and shots; markers stay.',
      pointTitle: 'Point',
      pointNone: 'Click a tile to get its coordinates.',
      copy: 'Copy',
      copied: 'Copied: {coords}',
      copyFailed: 'The browser blocked copying — the numbers are selected, press Ctrl+C.',
      findTitle: 'Find in-game coordinates',
      find: 'Find',
      offPlanet: '{coords} is off this planet with the current calibration.',
      askNote: 'same round?',
      mismatchNote: 'check tile did not match'
    },
    ru: {
      pageName: 'Тактическая карта',
      fork: 'Форк',
      planet: 'Планета',
      fit: 'Вписать',
      zoomIn: 'Приблизить',
      zoomOut: 'Отдалить',
      loading: 'Загружаю карту…',
      loadFailed: 'Не удалось загрузить данные карты.',
      retry: 'Повторить',
      staleData: 'Данные карты обновились, пока страница была открыта, — перезагрузите страницу.',
      world: 'тайл мира',
      notGame: 'это ещё не игровые координаты',
      game: 'игровые координаты',
      noArea: 'зоны нет',
      beta: 'Бета: все числа повторяют код игры, но в раунде ещё не проверены. Перед огнём сверьте проверочный тайл с дальномером.',
      source: 'Данные: {fork}, коммит {sha} ({date}).',
      hint: 'Колесо или кнопки — масштаб, перетаскивание — перемещение, клик — выбор тайла. Когда карта в фокусе, стрелки двигают её, а Enter выбирает тайл под перекрестием.',
      flags: { ob: 'ОБ', cas: 'КАС', mortarFire: 'Огонь миномёта', mortarPlace: 'Развернуть миномёт', supply: 'Сброс поставки', lz: 'Зона посадки' },
      planetPlayers: 'от {n} игроков',
      noStorage: 'Браузер запрещает хранилище сайта: калибровка пропадёт после перезагрузки.',
      calTitle: 'Калибровка',
      calIntro: 'Наведите дальномер на тайл пола или угол стены в прямой видимости — не на дерево и не на фонарь: их спрайты выше своего тайла. Кликните этот же тайл на карте и введите числа с дальномера.',
      calPickFirst: 'Кликните на карте тайл, на который навели дальномер.',
      calPickZoomed: 'Карта приближена — теперь кликните точный тайл.',
      calTile: 'Выбран тайл: {tile} (мир)',
      calPasteHint: 'В любое поле можно вставить оба числа: «-100 200», «ДОЛГОТА -100 ШИРОТА 200», «Para-Cam (-100):(200)».',
      calPreview: 'Сдвиг раунда будет {x} {y}.',
      calSave: 'Сохранить сдвиг раунда',
      calDone: 'Сдвиг раунда {x} {y}',
      calFrom: 'калибровка {age} по тайлу {coords}',
      calAge: 'калибровка {age}',
      parse: {
        tooFew: 'Нужны два числа: сначала долгота (X), потом широта (Y).',
        tooMany: 'Слишком много чисел — оставьте долготу (X) и широту (Y).',
        outOfRange: 'Игровые координаты не выходят за ±1000.'
      },
      outOfVariance: 'Сдвиг больше ±{v} — сервер такого не выбрасывает. Проверьте порядок чисел (долгота первой) и планету.',
      age: { now: 'только что', min: '{m} мин назад', hour: '{h} ч {m} мин назад' },
      checkTitle: 'Сверка',
      checkAsk: 'Наведите дальномер на тайл, отмеченный жёлтым. Дальномер должен показать:',
      checkMatch: '✓ Совпало',
      checkMismatch: '✗ Не совпало',
      checkShow: 'Показать на карте',
      checkOk: '✓ Сверено по второму тайлу.',
      checkBad: '✗ Проверочный тайл не совпал. Обычные причины:',
      checkCauses: [
        'долгота и широта введены в обратном порядке;',
        'выбрана не та планета или не тот форк;',
        'этот участок карты изменён в раунде;',
        'дальномер попал в соседний тайл.'
      ],
      checkOther: 'Другой тайл',
      checkNone: 'Рядом нет открытого пола для сверки — сверьте по другому тайлу, когда получится.',
      recalibrate: 'Откалибровать заново',
      sameRoundTitle: 'Тот же раунд?',
      sameRoundAge: 'Калибровка {age}.',
      sameRoundReasons: {
        reload: 'Страница перезагружена.',
        idle: '20 минут на странице ничего не нажимали.',
        offPlanet: 'Введённая точка при этом сдвиге вне планеты.'
      },
      sameRoundYes: 'Да, тот же раунд',
      sameRoundCheck: 'Сверить тайлом',
      newRound: 'Новый раунд',
      newRoundHint: '«Новый раунд» сбрасывает калибровку и выстрелы; метки остаются.',
      pointTitle: 'Точка',
      pointNone: 'Кликните тайл, чтобы получить его координаты.',
      copy: 'Копировать',
      copied: 'Скопировано: {coords}',
      copyFailed: 'Браузер не дал скопировать — числа выделены, нажмите Ctrl+C.',
      findTitle: 'Найти по игровым координатам',
      find: 'Найти',
      offPlanet: '{coords} — вне планеты при текущей калибровке.',
      askNote: 'тот же раунд?',
      mismatchNote: 'сверка не совпала'
    }
  };
  var T = L10N[LANG];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(template, vars) {
    return template.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? '' : vars[k]; });
  }
  function signed(n) { return n > 0 ? '+' + n : String(n); }
  function now() { return Date.now(); }

  function track(goal, params) {
    try {
      if (typeof ym === 'function') ym(YM_COUNTER_ID, 'reachGoal', goal, params);
    } catch (e) { /* analytics must never break the page */ }
  }

  // Events carry the fork and planet only — never coordinates or marker text.
  function trackPlanet(goal) {
    track(goal, { fork: state.fork && state.fork.key, planet: state.meta && state.meta.id });
  }

  // ── storage ─────────────────────────────────────────────────────────────

  var storage = (function () {
    var ok = false, memory = {};
    try {
      var probe = STORAGE_PREFIX + 'probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      ok = true;
    } catch (e) { /* private mode or blocked storage: state lives in memory */ }
    return {
      ok: ok,
      read: function (key) {
        if (!ok) return memory[key] || null;
        try { return JSON.parse(window.localStorage.getItem(key)); } catch (e) { return null; }
      },
      write: function (key, value) {
        memory[key] = value;
        if (!ok) return;
        try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota: the memory copy stays */ }
      }
    };
  })();

  var els = {
    pageName: $('tacPageName'),
    forkLabel: $('tacForkLabel'),
    planetLabel: $('tacPlanetLabel'),
    fork: $('tacFork'),
    planet: $('tacPlanet'),
    zoomIn: $('tacZoomIn'),
    zoomOut: $('tacZoomOut'),
    fit: $('tacFit'),
    canvas: $('tacCanvas'),
    hover: $('tacHover'),
    status: $('tacStatus'),
    panel: $('tacPanel')
  };

  var state = {
    index: null,
    fork: null,       // index entry
    meta: null,       // planet entry in the index
    planet: null,     // Logic.preparePlanet(json)
    hoverTile: null,
    loadToken: 0,
    opened: false,
    storeKey: null,
    store: Logic.migrateStorage(null),        // {v, calibration, shots, markers} of this planet
    session: Logic.newSession(now(), false),  // whether this page load may trust the offset
    selected: null,   // world tile picked on the map
    draft: { x: '', y: '' },
    calMessage: null, // {text, kind} shown in the calibration form
    findDraft: '',
    findMessage: null,
    panelKey: ''
  };

  var view = new window.TacticalMapView(els.canvas);

  // ── static text ─────────────────────────────────────────────────────────

  function applyStaticText() {
    els.pageName.textContent = T.pageName;
    els.forkLabel.textContent = T.fork;
    els.planetLabel.textContent = T.planet;
    els.fit.textContent = T.fit;
    els.zoomIn.setAttribute('aria-label', T.zoomIn);
    els.zoomOut.setAttribute('aria-label', T.zoomOut);
    document.title = T.pageName + ' — NanoTrasen ChemDB';
  }

  // ── status line ─────────────────────────────────────────────────────────

  function setStatus(message, opts) {
    opts = opts || {};
    if (!message) {
      els.status.classList.add('tac-hide');
      els.status.innerHTML = '';
      return;
    }
    els.status.classList.remove('tac-hide');
    els.status.classList.toggle('error', !!opts.error);
    els.status.innerHTML = esc(message) + (opts.retry ? ' <button type="button" class="btn-small" id="tacRetry">' + esc(T.retry) + '</button>' : '');
    if (opts.retry) $('tacRetry').addEventListener('click', opts.retry);
  }

  // ── address bar ─────────────────────────────────────────────────────────

  function readHash() {
    var m = /(?:^|[#&])map=([\w-]+)\/([\w-]+)/.exec(location.hash);
    return m ? { fork: m[1], planet: m[2] } : null;
  }

  function writeHash() {
    if (!state.fork || !state.meta) return;
    var h = '#map=' + state.fork.key + '/' + state.meta.id;
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  // ── data ────────────────────────────────────────────────────────────────

  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
      return r.json();
    });
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error(url + ': image failed')); };
      img.src = url;
    });
  }

  function loadIndex() {
    setStatus(T.loading);
    return fetchJson('tactical/index.json').then(function (index) {
      if (index.schemaVersion !== 1) throw new Error('schemaVersion ' + index.schemaVersion);
      state.index = index;
      var wanted = readHash();
      var fork = (wanted && index.forks.filter(function (f) { return f.key === wanted.fork; })[0]) || index.forks[0];
      fillForks(fork.key);
      selectFork(fork, wanted && wanted.fork === fork.key ? wanted.planet : null);
    }).catch(function (err) {
      console.error(err);
      setStatus(T.loadFailed, { error: true, retry: loadIndex });
    });
  }

  function fillForks(selected) {
    els.fork.innerHTML = state.index.forks.map(function (f) {
      return '<option value="' + esc(f.key) + '"' + (f.key === selected ? ' selected' : '') + '>' + esc(f.label) + '</option>';
    }).join('');
  }

  function fillPlanets(fork, selected) {
    els.planet.innerHTML = fork.planets.map(function (p) {
      var extra = p.minPlayers ? ' · ' + fmt(T.planetPlayers, { n: p.minPlayers }) : '';
      return '<option value="' + esc(p.id) + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.name + extra) + '</option>';
    }).join('');
  }

  function selectFork(fork, planetId) {
    state.fork = fork;
    var meta = (planetId && fork.planets.filter(function (p) { return p.id === planetId; })[0]) || fork.planets[0];
    fillPlanets(fork, meta.id);
    loadPlanet(meta);
  }

  function loadPlanet(meta) {
    var token = ++state.loadToken;
    var fork = state.fork;
    setStatus(T.loading);
    var base = 'tactical/' + meta.file;
    Promise.all([fetchJson(base + '.json?h=' + meta.h), loadImage(base + '.png?h=' + meta.h)]).then(function (res) {
      if (token !== state.loadToken) return;
      var json = res[0], img = res[1];
      if (json.h !== meta.h) {
        setStatus(T.staleData, { error: true });
        return;
      }
      var planet = Logic.preparePlanet(json);
      if (img.naturalWidth !== planet.width || img.naturalHeight !== planet.height) {
        throw new Error('PNG ' + img.naturalWidth + 'x' + img.naturalHeight + ' does not match bounds ' + planet.width + 'x' + planet.height);
      }
      state.meta = meta;
      state.planet = planet;
      state.hoverTile = null;
      state.storeKey = STORAGE_PREFIX + fork.key + '/' + meta.id;
      state.store = Logic.migrateStorage(storage.read(state.storeKey));
      // An offset read back from storage may belong to an earlier round.
      state.session = Logic.newSession(now(), !!state.store.calibration);
      state.selected = null;
      state.draft = { x: '', y: '' };
      state.calMessage = null;
      state.findMessage = null;
      view.setImage(img, json.bounds);
      writeHash();
      renderAll();
      setStatus('');
      if (!state.opened) {
        state.opened = true;
        trackPlanet('tactical_open');
      }
    }).catch(function (err) {
      if (token !== state.loadToken) return;
      console.error(err);
      setStatus(T.loadFailed, { error: true, retry: function () { loadPlanet(meta); } });
    });
  }

  // ── calibration state ───────────────────────────────────────────────────

  function calibration() { return state.store.calibration; }
  function calState() { return Logic.calibrationState(calibration(), now(), state.session); }
  function toGame(tile) { return Logic.worldToGame(calibration().offset, tile[0], tile[1]); }
  function saveStore() { if (state.storeKey) storage.write(state.storeKey, state.store); }
  function terms() { return (state.fork && state.fork.terms) || {}; }
  function termX() { return terms().rangefinderLongitude || 'LONGITUDE'; }
  function termY() { return terms().rangefinderLatitude || 'LATITUDE'; }
  function maxCoord() { return (state.fork && state.fork.constants.mortar && state.fork.constants.mortar.maxTarget) || MAX_COORD; }

  function formatAge(ms) {
    var m = Math.floor(ms / 60000);
    if (m < 1) return T.age.now;
    if (m < 60) return fmt(T.age.min, { m: m });
    return fmt(T.age.hour, { h: Math.floor(m / 60), m: m % 60 });
  }

  function numbersIn(s) { return String(s).replace(DASHES, '-').match(/-?\d+/g) || []; }

  // The two form fields as one reading. Both numbers typed or pasted into one
  // field count too, the way a rangefinder line gets copied.
  function draftParse() {
    var nx = numbersIn(state.draft.x), ny = numbersIn(state.draft.y);
    if (nx.length >= 2 && !ny.length) return Logic.parseCoords(state.draft.x, maxCoord());
    if (ny.length >= 2 && !nx.length) return Logic.parseCoords(state.draft.y, maxCoord());
    if (!nx.length || !ny.length) return { ok: false, reason: 'tooFew' };
    if (nx.length > 1 || ny.length > 1) return { ok: false, reason: 'tooMany' };
    return Logic.parseCoords(nx[0] + ' ' + ny[0], maxCoord());
  }

  function calHelp() {
    if (state.calMessage) return state.calMessage;
    var p = draftParse();
    if (!p.ok) {
      var typed = state.draft.x.trim() && state.draft.y.trim();
      return typed ? { text: T.parse[p.reason], kind: 'warn' } : { text: '', kind: '' };
    }
    if (!state.selected) return { text: T.calPickFirst, kind: 'warn' };
    var off = Logic.offsetFrom(state.selected, [p.x, p.y]);
    var v = state.fork.constants.offsetVariance;
    if (Logic.calibrationIssues(off, v).length) return { text: fmt(T.outOfVariance, { v: v }), kind: 'warn' };
    return { text: fmt(T.calPreview, { x: signed(off[0]), y: signed(off[1]) }), kind: 'ok' };
  }

  function newCheck() {
    var c = calibration();
    var tried = c.check ? c.check.tried.concat([c.check.tile]) : [];
    var tile = Logic.pickCheckTile(state.planet, c.tile, tried);
    c.check = tile ? { tile: tile, expect: Logic.worldToGame(c.offset, tile[0], tile[1]), result: null, tried: tried } : null;
    saveStore();
    renderAll();
    if (tile) showTile(tile);
  }

  function showTile(tile) {
    view.centerOn(tile[0] + 0.5, tile[1] + 0.5, Math.max(view.scale, PICK_ZOOM_SCALE));
  }

  // ── map layers ──────────────────────────────────────────────────────────

  function drawText(ctx, text, x, y, size) {
    ctx.font = '600 ' + size + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(6, 9, 15, 0.95)';
    ctx.fillStyle = '#e8ecf4';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  // A tile outline where tiles are big enough to outline, a ring around the
  // tile centre where they are not. Returns the tile's top-left screen point.
  function markTile(ctx, v, tile, colour, width) {
    var p = v.worldToScreen(tile[0], tile[1] + 1), s = v.scale;
    ctx.strokeStyle = colour;
    if (s >= 5) {
      ctx.lineWidth = width;
      ctx.strokeRect(p[0] + width / 2, p[1] + width / 2, s - width, s - width);
    } else {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p[0] + s / 2, p[1] + s / 2, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    return p;
  }

  view.addLayer(function drawLabels(ctx, v) {
    if (!state.planet || v.scale < 2.5) return;
    var size = Math.max(11, Math.min(15, 9 + v.scale * 0.6));
    state.planet.json.labels.forEach(function (label) {
      var p = v.worldToScreen(label[1], label[2]);
      drawText(ctx, label[0], p[0], p[1], size);
    });
  });

  view.addLayer(function drawCalibration(ctx, v) {
    var c = state.planet && calibration();
    if (!c) return;
    markTile(ctx, v, c.tile, '#39ff85', 2);
    var k = c.check;
    if (!k || k.result === 'match') return;
    var p = markTile(ctx, v, k.tile, k.result === 'mismatch' ? '#ff3d5a' : '#ffb627', 2.5);
    if (k.result === null && v.scale >= 8) drawText(ctx, Logic.formatCoords(k.expect), p[0] + v.scale / 2, p[1] - 10, 13);
  });

  view.addLayer(function drawSelected(ctx, v) {
    if (state.planet && state.selected) markTile(ctx, v, state.selected, '#00e5ff', 2.5);
  });

  view.addLayer(function drawHoverTile(ctx, v) {
    var t = state.hoverTile;
    if (!t || v.scale < 3) return;
    var p = v.worldToScreen(t[0], t[1] + 1);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p[0] + 0.5, p[1] + 0.5, v.scale - 1, v.scale - 1);
  });

  function keyboardFocused() {
    try { return els.canvas.matches(':focus-visible'); } catch (e) { return document.activeElement === els.canvas; }
  }

  view.addLayer(function drawCrosshair(ctx, v) {
    if (!state.planet || !keyboardFocused()) return;
    var s = v.cssSize(), x = Math.round(s.w / 2) + 0.5, y = Math.round(s.h / 2) + 0.5;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    [[-12, 0, -4, 0], [4, 0, 12, 0], [0, -12, 0, -4], [0, 4, 0, 12]].forEach(function (l) {
      ctx.moveTo(x + l[0], y + l[1]);
      ctx.lineTo(x + l[2], y + l[3]);
    });
    ctx.stroke();
  });

  // ── hover readout ───────────────────────────────────────────────────────

  function chip(label, on) {
    return '<span class="tac-chip ' + (on ? 'yes' : 'no') + '">' + esc(label) + '</span>';
  }

  function areaHtml(tile) {
    var area = Logic.areaAt(state.planet, tile[0], tile[1]);
    if (!area) return '<div class="tac-hover-note">' + esc(T.noArea) + '</div>';
    var f = area[3], F = Logic.FLAGS;
    return '<div>' + esc(area[1]) + '</div><div class="tac-chips">' +
      chip(T.flags.mortarFire, (f & F.MORTAR_FIRE) && !(f & F.LANDING_ZONE)) +
      chip(T.flags.mortarPlace, f & F.MORTAR_PLACE) +
      chip(T.flags.ob, f & F.OB) +
      chip(T.flags.cas, f & F.CAS) +
      chip(T.flags.supply, f & F.SUPPLY) +
      ((f & F.LANDING_ZONE) ? '<span class="tac-chip warn">' + esc(T.flags.lz) + '</span>' : '') +
      '</div>';
  }

  function renderHover() {
    var t = state.hoverTile;
    if (!t || !state.planet) {
      els.hover.classList.add('tac-hide');
      return;
    }
    var cs = calState(), coords, note;
    if (cs.calibrated) {
      coords = Logic.formatCoords(toGame(t));
      note = T.game + ' · ' + fmt(T.calAge, { age: formatAge(cs.ageMs) });
      if (calibration().check && calibration().check.result === 'mismatch') note += ' · ✗ ' + T.mismatchNote;
      if (cs.askSameRound) note += ' · ' + T.askNote;
    } else {
      coords = Logic.formatCoords(t);
      note = T.world + ' · ' + T.notGame;
    }
    els.hover.innerHTML = '<div class="tac-hover-coords">' + esc(coords) + '</div>' +
      '<div class="tac-hover-note">' + esc(note) + '</div>' + areaHtml(t);
    els.hover.classList.remove('tac-hide');
  }

  view.onHover(function (tile) {
    state.hoverTile = tile;
    renderHover();
    view.requestDraw();
  });

  // ── panel ───────────────────────────────────────────────────────────────

  function button(action, label, cls, disabled) {
    return '<button type="button" class="' + (cls || 'btn-small') + '" data-action="' + action + '"' +
      (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
  }

  function msg(m, id) {
    return '<p class="tac-msg' + (m.kind ? ' ' + m.kind : '') + '"' + (id ? ' id="' + id + '" aria-live="polite"' : '') + '>' + esc(m.text) + '</p>';
  }

  function field(id, label, value) {
    return '<label class="tac-input-label" for="' + id + '">' + esc(label) +
      '<input id="' + id + '" class="tac-input" type="text" autocomplete="off" spellcheck="false" value="' + esc(value) + '"></label>';
  }

  function sameRoundHtml(cs) {
    return '<div class="tac-banner"><h2>' + esc(T.sameRoundTitle) + '</h2><p>' +
      esc(fmt(T.sameRoundAge, { age: formatAge(cs.ageMs) })) + ' ' +
      cs.reasons.map(function (r) { return esc(T.sameRoundReasons[r]); }).join(' ') + '</p>' +
      '<div class="tac-actions">' + button('sameRound', T.sameRoundYes, 'btn-primary') +
      button('sameRoundCheck', T.sameRoundCheck) + button('newRound', T.newRound) + '</div></div>';
  }

  function checkHtml(c) {
    var k = c.check;
    if (!k) return msg({ text: T.checkNone, kind: 'warn' });
    if (k.result === 'match') return msg({ text: T.checkOk, kind: 'ok' });
    if (k.result === 'mismatch') {
      return '<div class="tac-check bad"><p>' + esc(T.checkBad) + '</p><ul>' +
        T.checkCauses.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
        '<div class="tac-actions">' + button('recalibrate', T.recalibrate) + button('otherCheck', T.checkOther) + '</div></div>';
    }
    return '<div class="tac-check"><h3>' + esc(T.checkTitle) + '</h3><p>' + esc(T.checkAsk) + '</p>' +
      '<div class="tac-expect"><span>' + esc(termX()) + ' <b>' + esc(k.expect[0]) + '</b></span>' +
      '<span>' + esc(termY()) + ' <b>' + esc(k.expect[1]) + '</b></span></div>' +
      '<div class="tac-actions">' + button('checkMatch', T.checkMatch, 'btn-small ok') +
      button('checkMismatch', T.checkMismatch, 'btn-small bad') + button('showCheck', T.checkShow) + '</div></div>';
  }

  function calibrationHtml(cs) {
    var h = '<h2 id="tacCalTitle">' + esc(T.calTitle) + '</h2>';
    var c = calibration();
    if (!c) {
      var help = calHelp();
      return h + '<p class="tac-muted">' + esc(T.calIntro) + '</p>' +
        '<p class="tac-pick">' + esc(state.selected ? fmt(T.calTile, { tile: Logic.formatCoords(state.selected) }) : T.calPickFirst) + '</p>' +
        '<div class="tac-cal-form">' + field('tacCalX', termX() + ' · X', state.draft.x) + field('tacCalY', termY() + ' · Y', state.draft.y) + '</div>' +
        '<p class="tac-hint">' + esc(T.calPasteHint) + '</p>' +
        msg(help, 'tacCalHelp') +
        '<div class="tac-actions">' + button('saveCalibration', T.calSave, 'btn-primary', !(state.selected && draftParse().ok)) + '</div>';
    }
    var v = state.fork.constants.offsetVariance;
    h += '<div class="tac-offset">' + esc(fmt(T.calDone, { x: signed(c.offset[0]), y: signed(c.offset[1]) })) + '</div>' +
      '<p class="tac-muted">' + esc(fmt(T.calFrom, { age: formatAge(cs.ageMs), coords: Logic.formatCoords(c.reading) })) + '</p>';
    if (Logic.calibrationIssues(c.offset, v).length) h += msg({ text: fmt(T.outOfVariance, { v: v }), kind: 'warn' });
    return h + checkHtml(c) +
      '<div class="tac-actions">' + button('newRound', T.newRound) + button('recalibrate', T.recalibrate) + '</div>' +
      '<p class="tac-hint">' + esc(T.newRoundHint) + '</p>';
  }

  function pointHtml(cs) {
    var h = '<h2 id="tacPointTitle">' + esc(T.pointTitle) + '</h2>';
    var t = state.selected;
    if (!t) {
      h += '<p class="tac-muted">' + esc(T.pointNone) + '</p>';
    } else if (cs.calibrated) {
      h += '<div class="tac-coords-row"><output class="tac-big" id="tacPointCoords">' + esc(Logic.formatCoords(toGame(t))) + '</output>' +
        button('copyPoint', T.copy) + '</div>' +
        '<p class="tac-muted">' + esc(T.game + ' · ' + fmt(T.calAge, { age: formatAge(cs.ageMs) })) + '</p>' + areaHtml(t);
    } else {
      h += '<div class="tac-coords-row"><span class="tac-big dim">' + esc(Logic.formatCoords(t)) + '</span></div>' +
        '<p class="tac-muted">' + esc(T.world + ' · ' + T.notGame) + '</p>' + areaHtml(t);
    }
    if (cs.calibrated) {
      h += '<label class="tac-input-label tac-find" for="tacFind">' + esc(T.findTitle) +
        '<span class="tac-find-row"><input id="tacFind" class="tac-input" type="text" autocomplete="off" spellcheck="false" placeholder="-100 200" value="' + esc(state.findDraft) + '">' +
        button('find', T.find) + '</span></label>';
      if (state.findMessage) h += msg(state.findMessage);
    }
    return h;
  }

  function panelKey(cs) {
    return cs.calibrated ? formatAge(cs.ageMs) + '|' + cs.reasons.join(',') : '';
  }

  // Re-rendering replaces the panel's inputs: keep the focused one and its caret.
  function captureFocus() {
    var a = document.activeElement;
    if (!a || !a.id || !els.panel.contains(a)) return null;
    return { id: a.id, start: typeof a.selectionStart === 'number' ? a.selectionStart : null, end: a.selectionEnd };
  }

  function restoreFocus(f) {
    var el = f && $(f.id);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (f.start !== null) {
      try { el.setSelectionRange(f.start, f.end); } catch (e) { /* not a text field */ }
    }
  }

  function renderPanel() {
    if (!state.fork || !state.planet) return;
    var focus = captureFocus();
    var cs = calState(), f = state.fork;
    els.panel.innerHTML =
      '<div class="tac-beta">' + esc(T.beta) + '</div>' +
      (storage.ok ? '' : msg({ text: T.noStorage, kind: 'warn' })) +
      (cs.askSameRound ? sameRoundHtml(cs) : '') +
      '<section class="tac-section" aria-labelledby="tacCalTitle">' + calibrationHtml(cs) + '</section>' +
      '<section class="tac-section" aria-labelledby="tacPointTitle">' + pointHtml(cs) + '</section>' +
      '<p class="tac-muted tac-hint-block">' + esc(T.hint) + '</p>' +
      '<p class="tac-source">' + esc(fmt(T.source, { fork: f.label, sha: f.source.sha.slice(0, 9), date: f.source.date })) + '</p>';
    state.panelKey = panelKey(cs);
    restoreFocus(focus);
  }

  function renderAll() {
    renderPanel();
    renderHover();
    view.requestDraw();
  }

  // Typing must not re-render the form: update the hint and the button in place.
  function onCalInput() {
    state.draft = { x: $('tacCalX').value, y: $('tacCalY').value };
    state.calMessage = null;
    var help = calHelp(), el = $('tacCalHelp');
    if (el) {
      el.textContent = help.text;
      el.className = 'tac-msg' + (help.kind ? ' ' + help.kind : '');
    }
    var save = els.panel.querySelector('[data-action="saveCalibration"]');
    if (save) save.disabled = !(state.selected && draftParse().ok);
  }

  // ── actions ─────────────────────────────────────────────────────────────

  var actions = {
    saveCalibration: function () {
      var p = draftParse();
      if (!state.selected || !p.ok) {
        state.calMessage = { text: state.selected ? T.parse[p.reason] : T.calPickFirst, kind: 'error' };
        renderPanel();
        return;
      }
      var tile = state.selected.slice(), reading = [p.x, p.y];
      var offset = Logic.offsetFrom(tile, reading);
      var check = Logic.pickCheckTile(state.planet, tile, []);
      state.store.calibration = {
        tile: tile, reading: reading, offset: offset, at: now(),
        check: check ? { tile: check, expect: Logic.worldToGame(offset, check[0], check[1]), result: null, tried: [] } : null
      };
      Logic.confirmSameRound(state.session, now());
      state.draft = { x: '', y: '' };
      state.calMessage = null;
      saveStore();
      trackPlanet('tactical_calibrate');
      renderAll();
    },
    checkMatch: function () {
      calibration().check.result = 'match';
      Logic.confirmSameRound(state.session, now());   // a second tile agreeing proves the round
      saveStore();
      trackPlanet('tactical_check_match');
      renderAll();
    },
    checkMismatch: function () {
      calibration().check.result = 'mismatch';
      saveStore();
      trackPlanet('tactical_check_mismatch');
      renderAll();
    },
    otherCheck: newCheck,
    sameRoundCheck: newCheck,
    showCheck: function () { showTile(calibration().check.tile); },
    recalibrate: function () {
      state.selected = calibration().tile.slice();
      state.store.calibration = null;
      state.calMessage = null;
      saveStore();
      renderAll();
      var x = $('tacCalX');
      if (x) x.focus();
    },
    sameRound: function () {
      Logic.confirmSameRound(state.session, now());
      trackPlanet('tactical_same_round');
      renderAll();
    },
    newRound: function () {
      state.store.calibration = null;
      state.store.shots = [];
      state.session = Logic.newSession(now(), false);
      state.selected = null;
      state.draft = { x: '', y: '' };
      state.calMessage = null;
      state.findDraft = '';
      state.findMessage = null;
      saveStore();
      trackPlanet('tactical_new_round');
      renderAll();
    },
    copyPoint: function () {
      if (state.selected && calibration()) copyCoords(Logic.formatCoords(toGame(state.selected)), $('tacPointCoords'));
    },
    find: function () {
      var p = Logic.parseCoords(state.findDraft, maxCoord());
      if (!p.ok) {
        state.findMessage = { text: T.parse[p.reason], kind: 'error' };
        renderPanel();
        return;
      }
      var w = Logic.gameToWorld(calibration().offset, p.x, p.y);
      if (!Logic.areaAt(state.planet, w[0], w[1])) {
        state.session.offPlanet = true;   // a wrong planet or a stale offset looks exactly like this
        state.findMessage = { text: fmt(T.offPlanet, { coords: Logic.formatCoords([p.x, p.y]) }), kind: 'error' };
        renderAll();
        return;
      }
      state.selected = w;
      state.findMessage = null;
      view.centerOn(w[0] + 0.5, w[1] + 0.5, Math.max(view.scale, PICK_MIN_SCALE));
      renderAll();
    }
  };

  els.panel.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn || btn.disabled || !state.planet) return;
    var fn = actions[btn.getAttribute('data-action')];
    if (fn) fn();
  });

  els.panel.addEventListener('input', function (e) {
    var id = e.target.id;
    if (id === 'tacCalX' || id === 'tacCalY') onCalInput();
    else if (id === 'tacFind') state.findDraft = e.target.value;
  });

  // A pasted pair or rangefinder line lands split into both fields.
  els.panel.addEventListener('paste', function (e) {
    var id = e.target.id;
    if (id !== 'tacCalX' && id !== 'tacCalY') return;
    var text = (e.clipboardData || window.clipboardData).getData('text');
    if (numbersIn(text).length < 2) return;
    var p = Logic.parseCoords(text, maxCoord());
    if (!p.ok) return;
    e.preventDefault();
    $('tacCalX').value = String(p.x);
    $('tacCalY').value = String(p.y);
    onCalInput();
  });

  els.panel.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var id = e.target.id;
    if (id === 'tacCalX' || id === 'tacCalY') { actions.saveCalibration(); e.preventDefault(); }
    else if (id === 'tacFind') { actions.find(); e.preventDefault(); }
  });

  // ── copy ────────────────────────────────────────────────────────────────

  var toastEl = null, toastTimer = 0;
  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }

  // The Clipboard API refuses without focus or permission (a second monitor, an
  // embedded preview); the selection-based command still works from a click there.
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return copyByCommand(text); });
    }
    return copyByCommand(text);
  }

  function copyByCommand(text) {
    return new Promise(function (resolve, reject) {
      var active = document.activeElement;
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        if (document.execCommand('copy')) resolve(); else reject(new Error('execCommand copy refused'));
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
        if (active && active.focus) active.focus({ preventScroll: true });
      }
    });
  }

  // When the browser refuses both ways, leave the numbers selected for Ctrl+C.
  function copyCoords(text, selectEl) {
    copyText(text).then(function () {
      toast(fmt(T.copied, { coords: text }));
      trackPlanet('tactical_copy');
    }, function () {
      if (selectEl && window.getSelection) {
        var range = document.createRange();
        range.selectNodeContents(selectEl);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      }
      toast(T.copyFailed);
    });
  }

  // ── picking on the map ──────────────────────────────────────────────────

  function pick(tile, sx, sy, fromPointer) {
    if (!state.planet) return;
    if (!calibration() && view.scale < PICK_MIN_SCALE) {
      view.zoomAt(PICK_ZOOM_SCALE / view.scale, sx, sy);   // the tile stays under the cursor
      state.calMessage = { text: T.calPickZoomed, kind: 'info' };
      renderPanel();
      return;
    }
    state.selected = tile;
    state.calMessage = null;
    state.findMessage = null;
    renderAll();
    if (!calibration() && fromPointer) {
      var x = $('tacCalX');
      if (x && !x.value) x.focus({ preventScroll: true });
    }
  }

  view.onClick(function (tile, e) {
    var r = els.canvas.getBoundingClientRect();
    pick(tile, e.clientX - r.left, e.clientY - r.top, true);
  });

  // ── controls ────────────────────────────────────────────────────────────

  els.fork.addEventListener('change', function () {
    var fork = state.index.forks.filter(function (f) { return f.key === els.fork.value; })[0];
    var keep = state.meta && fork.planets.some(function (p) { return p.id === state.meta.id; }) ? state.meta.id : null;
    selectFork(fork, keep);
  });

  els.planet.addEventListener('change', function () {
    var meta = state.fork.planets.filter(function (p) { return p.id === els.planet.value; })[0];
    loadPlanet(meta);
  });

  els.zoomIn.addEventListener('click', function () { view.zoomBy(1.4); });
  els.zoomOut.addEventListener('click', function () { view.zoomBy(1 / 1.4); });
  els.fit.addEventListener('click', function () { view.fit(); });

  els.canvas.addEventListener('keydown', function (e) {
    if (e.key === '+' || e.key === '=') { view.zoomBy(1.4); e.preventDefault(); }
    else if (e.key === '-') { view.zoomBy(1 / 1.4); e.preventDefault(); }
    else if (e.key === '0') { view.fit(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { view.panBy(40, 0); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { view.panBy(-40, 0); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { view.panBy(0, 40); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { view.panBy(0, -40); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      var s = view.cssSize(), tile = view.tileAtScreen(s.w / 2, s.h / 2);
      if (tile) pick(tile, s.w / 2, s.h / 2, false);
      e.preventDefault();
    }
  });
  els.canvas.addEventListener('focus', function () { view.requestDraw(); });
  els.canvas.addEventListener('blur', function () { view.requestDraw(); });

  window.addEventListener('hashchange', function () {
    var wanted = readHash();
    if (!wanted || !state.index) return;
    if (state.fork && state.meta && wanted.fork === state.fork.key && wanted.planet === state.meta.id) return;
    var fork = state.index.forks.filter(function (f) { return f.key === wanted.fork; })[0];
    if (!fork) return;
    fillForks(fork.key);
    selectFork(fork, wanted.planet);
  });

  // ── round lifetime ──────────────────────────────────────────────────────

  var inputRenderTimer = 0;
  function onAnyInput() {
    if (!calibration()) {
      state.session.lastInput = now();
      return;
    }
    var before = calState().askSameRound;
    Logic.noteInput(state.session, now());
    if (calState().askSameRound !== before) {
      clearTimeout(inputRenderTimer);
      inputRenderTimer = setTimeout(renderAll, RENDER_AFTER_INPUT_MS);
    }
  }
  ['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach(function (type) {
    document.addEventListener(type, onAnyInput, { capture: true, passive: true });
  });

  function tick() {
    if (state.planet && calibration() && panelKey(calState()) !== state.panelKey) renderAll();
  }
  setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', tick);

  // Another tab of this page wrote the same planet: take its state. A calibration
  // made there just now is as fresh as one made here.
  window.addEventListener('storage', function (e) {
    if (!state.storeKey || e.key !== state.storeKey) return;
    var before = calibration() ? calibration().at : null;
    var raw = null;
    try { raw = JSON.parse(e.newValue); } catch (err) { raw = null; }
    state.store = Logic.migrateStorage(raw);
    var after = calibration() ? calibration().at : null;
    if (after && after !== before) Logic.confirmSameRound(state.session, now());
    renderAll();
  });

  applyStaticText();
  loadIndex();
})();

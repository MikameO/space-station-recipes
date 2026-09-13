/*
  SPDX-License-Identifier: GPL-3.0-only
  Copyright (C) 2026 MikameO
  This file is part of Space Station Recipes.
  See LICENSE for details.
*/
// Tactical map page: data loading, fork and planet selection, the map view, the
// round calibration, the mortar position and target, layers and the panel. Pure
// maths lives in tactical/logic.js (window.TacticalLogic), the canvas view in
// tactical/mapview.js.
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var Logic = window.TacticalLogic;
  var LANG = window.I18N_LANG === 'ru' ? 'ru' : 'en';
  var YM_COUNTER_ID = 108585248;
  var STORAGE_PREFIX = 'chemdb-tactical:';
  var PREFS_KEY = STORAGE_PREFIX + 'prefs';
  // Below this many CSS px per tile a calibration pick zooms in instead of
  // picking (decision 13): LV-624 fits at ~4 px per tile on a 1080p screen.
  var PICK_MIN_SCALE = 12;
  var PICK_ZOOM_SCALE = 20;
  var TICK_MS = 30 * 1000;           // calibration age and the idle question
  var RENDER_AFTER_INPUT_MS = 350;   // let the click that woke the page land first
  var MAX_COORD = 1000;              // MortarComponent.MaxTarget, the spin boxes stop there
  var MAX_RADIUS = 30;               // the radius field: a whole LZ, not a planet
  var DASHES = /[−‒–—﹣－]/g;
  var TINT_FIRE_REFUSED = [255, 61, 90, 96];     // --red-alert at ~0.38
  var TINT_DEPLOY_ALLOWED = [57, 255, 133, 70];  // --phosphor at ~0.27

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
      newRoundHint: 'New round clears the calibration, the mortar and shots; markers stay.',
      weaponTitle: 'Weapon',
      weapons: { mortar: 'Mortar', ob: 'OB', supply: 'Supply drop' },
      weaponSoon: 'in the next update',
      mortarTitle: 'Mortar position',
      mortarNone: 'Where is the mortar? Click its tile on the map or type the rangefinder reading of that tile.',
      mortarNeedsCal: 'Calibrate first — the position is entered in in-game coordinates.',
      mortarPickHint: 'Click the mortar tile on the map.',
      mortarPickMap: 'Pick on map',
      mortarPlace: 'Place',
      mortarMove: 'Move',
      mortarRemove: 'Remove',
      mortarAt: 'Mortar at',
      deployOk: '✓ Can be deployed here.',
      deployNo: '✗ Cannot deploy here — {reason}',
      deployNoArea: 'this tile has no area.',
      targetTitle: 'Target',
      targetNone: 'Click a tile to get its coordinates.',
      targetNoMortar: 'Place the mortar to see range and aim error.',
      dialLine: '{label} 0 0',
      distance: '{d} tiles from the mortar',
      fireOk: '✓ The mortar accepts this target.',
      fireNo: '✗ {reason}',
      reasons: {
        noCas: 'the laser needs a CAS-permitted area.',
        noLasing: 'this area cannot be lased.'
      },
      errorLine: 'Aim error up to ±{ex} / ±{ey} tiles, then ±1 jitter.',
      errorNone: 'No aim error here (within 20 tiles), only ±1 jitter.',
      warnings: {
        errorMayExceedMaxRange: 'With the aim error the shell may fly past the maximum range — the game then refuses to fire.',
        errorMayUndercutMinRange: 'With the aim error the shell may fall inside the minimum range — the game then refuses to fire.',
        errorMayHitRefusedArea: 'With the aim error the shell may land where the mortar is not allowed to hit (a landing zone or a covered area) — the game checks the point after the error and may refuse to fire.'
      },
      copy: 'Copy',
      copied: 'Copied: {coords}',
      copyFailed: 'The browser blocked copying — the numbers are selected, press Ctrl+C.',
      findTitle: 'Find in-game coordinates',
      find: 'Find',
      offPlanet: '{coords} is off this planet with the current calibration.',
      askNote: 'same round?',
      mismatchNote: 'check tile did not match',
      layersTitle: 'Layers and hit zone',
      layers: { fire: 'Where the mortar cannot hit (red)', deploy: 'Where it can be deployed (green)', rings: 'Range rings and the no-error square', zone: 'Hit zone at the cursor and the target' },
      shell: 'Shell',
      shellKinds: { he: 'High explosive', incendiary: 'Incendiary', flare: 'Flare / camera', other: '{name}' },
      radius: 'Radius, tiles',
      radiusDefault: 'By prototype: {r}',
      radiusReset: 'Reset',
      radiusFlare: 'A flare does no damage — only the landing box is drawn.',
      zoneHint: 'Solid circle: the blast around the aim point. Dashed outline: everywhere the shell can land with the aim error and jitter — plan for the whole outline, not the circle.',
      hoverDist: '{d} tiles',
      hoverErr: 'error ±{ex}/±{ey}',
      fire: 'Fire',
      undoShot: 'Undo last shot',
      keepTarget: 'Do not change the target — it is already {coords}: pressing «{set}» re-rolls the aim error.',
      fromShot: 'from shot №{n}',
      errKnown: 'aim error by impact: {e}',
      errUnknown: 'aim error unknown — mark where the last shell fell and the dial will include it',
      nowDial: '(the mortar holds {dial} now — set 0 0 first)',
      laserNote: 'Laser mode: no aim error, dial or jitter — the shell lands where the laser points; the target needs CAS and lasing permission.',
      modeLabel: 'Mode',
      modeCoords: 'Coordinates',
      modeLaser: 'Laser',
      shotsTitle: 'Shots',
      noShots: 'Press «Fire» on a card the moment the shell leaves — the timer and the previous-shot dial start from that.',
      timerFrom: 'Timer from',
      timerFire: 'the shot',
      timerLoad: 'loading',
      shotLine: '№{n} · {target}',
      shotDial: 'dial {dial}',
      inFlight: 'impact in {s} s',
      nextEvent: 'next: {event} in {s} s',
      events: { fired: 'the shot', travelSound: 'travel sound (≤15 tiles)', impactWarning: 'incoming warning (≤10 tiles)', impact: 'impact' },
      landed: 'landed {age}',
      impactHere: 'Landed here',
      impactPick: 'Click the tile where the shell fell.',
      impactAdd: 'Add',
      impactAt: 'fell at {coords}',
      impactErr: 'error {e}',
      implausible: 'does not look like this shot — the calibration may be stale',
      shardsNote: 'plus {n} shrapnel pieces well beyond the circle'
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
      newRoundHint: '«Новый раунд» сбрасывает калибровку, миномёт и выстрелы; метки остаются.',
      weaponTitle: 'Оружие',
      weapons: { mortar: 'Миномёт', ob: 'ОБ', supply: 'Поставка' },
      weaponSoon: 'в следующем обновлении',
      mortarTitle: 'Позиция миномёта',
      mortarNone: 'Где стоит миномёт? Кликните его тайл на карте или введите показания дальномера для этого тайла.',
      mortarNeedsCal: 'Сначала калибровка — позиция вводится в игровых координатах.',
      mortarPickHint: 'Кликните тайл миномёта на карте.',
      mortarPickMap: 'Указать на карте',
      mortarPlace: 'Поставить',
      mortarMove: 'Переставить',
      mortarRemove: 'Убрать',
      mortarAt: 'Миномёт на',
      deployOk: '✓ Здесь можно развернуть.',
      deployNo: '✗ Здесь не развернуть — {reason}',
      deployNoArea: 'у тайла нет зоны.',
      targetTitle: 'Цель',
      targetNone: 'Кликните тайл, чтобы получить его координаты.',
      targetNoMortar: 'Поставьте миномёт, чтобы видеть дальность и ошибку прицела.',
      dialLine: '{label} 0 0',
      distance: '{d} тайлов от миномёта',
      fireOk: '✓ Миномёт примет эту цель.',
      fireNo: '✗ {reason}',
      reasons: {
        noCas: 'лазеру нужна зона, где разрешён КАС.',
        noLasing: 'эту зону нельзя подсветить лазером.'
      },
      errorLine: 'Ошибка прицела до ±{ex} / ±{ey} тайла, плюс дрожание ±1.',
      errorNone: 'Ошибки прицела здесь нет (ближе 20 тайлов), только дрожание ±1.',
      warnings: {
        errorMayExceedMaxRange: 'С учётом ошибки снаряд может выйти за максимальную дальность — тогда игра откажет в выстреле.',
        errorMayUndercutMinRange: 'С учётом ошибки снаряд может лечь ближе минимальной дальности — тогда игра откажет в выстреле.',
        errorMayHitRefusedArea: 'С учётом ошибки снаряд может лечь туда, где миномёту бить нельзя (зона посадки или накрытая зона), — игра проверяет точку уже с ошибкой и может отказать в выстреле.'
      },
      copy: 'Копировать',
      copied: 'Скопировано: {coords}',
      copyFailed: 'Браузер не дал скопировать — числа выделены, нажмите Ctrl+C.',
      findTitle: 'Найти по игровым координатам',
      find: 'Найти',
      offPlanet: '{coords} — вне планеты при текущей калибровке.',
      askNote: 'тот же раунд?',
      mismatchNote: 'сверка не совпала',
      layersTitle: 'Слои и зона поражения',
      layers: { fire: 'Куда миномёт не бьёт (красным)', deploy: 'Где можно развернуть (зелёным)', rings: 'Кольца дальности и квадрат без ошибки', zone: 'Зона поражения у курсора и у цели' },
      shell: 'Снаряд',
      shellKinds: { he: 'Фугасный', incendiary: 'Зажигательный', flare: 'Осветительный / камера', other: '{name}' },
      radius: 'Радиус, тайлов',
      radiusDefault: 'По прототипу: {r}',
      radiusReset: 'Сбросить',
      radiusFlare: 'Осветительный не наносит урона — рисуется только контур прилёта.',
      zoneHint: 'Сплошной круг — взрыв вокруг точки прицела. Пунктирный контур — всё, куда снаряд может прилететь с ошибкой прицела и дрожанием: рассчитывайте на весь контур, а не на круг.',
      hoverDist: '{d} тайлов',
      hoverErr: 'ошибка ±{ex}/±{ey}',
      fire: 'Выстрел',
      undoShot: 'Отменить последний выстрел',
      keepTarget: 'Цель не менять — уже {coords}: нажатие «{set}» перевыберет ошибку прицела.',
      fromShot: 'от выстрела №{n}',
      errKnown: 'ошибка прицела по падению: {e}',
      errUnknown: 'ошибка прицела неизвестна — отметьте, куда упал последний снаряд, и смещение её учтёт',
      nowDial: '(в миномёте сейчас {dial} — сначала выставьте 0 0)',
      laserNote: 'Лазерный режим: ни ошибки прицела, ни смещения, ни дрожания — снаряд ложится в точку лазера; цели нужно разрешение КАС и подсветки.',
      modeLabel: 'Режим',
      modeCoords: 'Координаты',
      modeLaser: 'Лазер',
      shotsTitle: 'Выстрелы',
      noShots: 'Нажмите «Выстрел» на карточке в момент, когда снаряд ушёл, — от него пойдут таймер и смещение для следующего.',
      timerFrom: 'Таймер от',
      timerFire: 'выстрела',
      timerLoad: 'заряжания',
      shotLine: '№{n} · {target}',
      shotDial: 'смещение {dial}',
      inFlight: 'падение через {s} с',
      nextEvent: 'дальше: {event} через {s} с',
      events: { fired: 'выстрел', travelSound: 'звук полёта (≤15 тайлов)', impactWarning: 'предупреждение о прилёте (≤10 тайлов)', impact: 'падение' },
      landed: 'упал {age}',
      impactHere: 'Упало здесь',
      impactPick: 'Кликните тайл, куда упал снаряд.',
      impactAdd: 'Добавить',
      impactAt: 'упало на {coords}',
      impactErr: 'ошибка {e}',
      implausible: 'не похоже на этот выстрел — калибровка могла устареть',
      shardsNote: 'плюс {n} осколков далеко за пределами круга'
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
    tints: null,      // offscreen canvases: fire (refused), deploy (allowed)
    hoverTile: null,
    loadToken: 0,
    opened: false,
    storeKey: null,
    store: Logic.migrateStorage(null),        // {v, calibration, mortar, target, shots, markers} of this planet
    prefs: Logic.migratePrefs(storage.read(PREFS_KEY)),
    session: Logic.newSession(now(), false),  // whether this page load may trust the offset
    selected: null,   // world tile picked for calibration (before the offset exists)
    pickMode: null,   // 'calibrate' | 'mortar' | 'target'; null = by state
    draft: { x: '', y: '' },
    calMessage: null, // {text, kind} shown in the calibration form
    mortarDraft: '',
    mortarMessage: null,
    findDraft: '',
    findMessage: null,
    impactShotId: null,   // the shot a map click reports an impact for
    impactDraft: {},      // Para-Cam text typed per shot id
    impactMessage: {},    // per shot id: {text, kind}
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

  // One pixel per tile, like the planet PNG: red where the mortar may not hit,
  // green where it may be deployed. Drawn scaled over the map when a layer is on.
  function buildTints(planet) {
    var F = Logic.FLAGS, w = planet.width, h = planet.height;
    function make(paint) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
      for (var i = 0; i < w * h; i++) {
        var a = planet.grid[i];
        if (!a) continue;
        var col = paint(planet.json.areas[a - 1][3]);
        if (!col) continue;
        d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = col[3];
      }
      ctx.putImageData(img, 0, 0);
      return c;
    }
    return {
      fire: make(function (f) { return ((f & F.MORTAR_FIRE) && !(f & F.LANDING_ZONE)) ? null : TINT_FIRE_REFUSED; }),
      fireLaser: make(function (f) {
        return ((f & F.MORTAR_FIRE) && (f & F.CAS) && (f & F.LASING) && !(f & F.LANDING_ZONE)) ? null : TINT_FIRE_REFUSED;
      }),
      deploy: make(function (f) { return (f & F.MORTAR_PLACE) ? TINT_DEPLOY_ALLOWED : null; })
    };
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
      state.tints = buildTints(planet);
      state.hoverTile = null;
      state.storeKey = STORAGE_PREFIX + fork.key + '/' + meta.id;
      state.store = Logic.migrateStorage(storage.read(state.storeKey));
      // An offset read back from storage may belong to an earlier round.
      state.session = Logic.newSession(now(), !!state.store.calibration);
      state.selected = null;
      state.pickMode = null;
      state.impactShotId = null;
      state.impactDraft = {};
      state.impactMessage = {};
      state.draft = { x: '', y: '' };
      state.calMessage = null;
      state.mortarMessage = null;
      state.findMessage = null;
      view.setImage(img, json.bounds);
      writeHash();
      renderAll();
      if (state.store.shots.length) startShotTicker();
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

  // ── derived state ───────────────────────────────────────────────────────

  function calibration() { return state.store.calibration; }
  function calState() { return Logic.calibrationState(calibration(), now(), state.session); }
  function toGame(tile) { return Logic.worldToGame(calibration().offset, tile[0], tile[1]); }
  function saveStore() { if (state.storeKey) storage.write(state.storeKey, state.store); }
  function savePrefs() { storage.write(PREFS_KEY, state.prefs); }
  function terms() { return (state.fork && state.fork.terms) || {}; }
  function termX() { return terms().rangefinderLongitude || 'LONGITUDE'; }
  function termY() { return terms().rangefinderLatitude || 'LATITUDE'; }
  function mortarConstants() { return state.fork.constants.mortar; }
  function maxCoord() { return (state.fork && mortarConstants() && mortarConstants().maxTarget) || MAX_COORD; }
  function mortar() { return state.store.mortar; }
  function target() { return state.store.target; }
  function weapon() { return state.prefs.weapon; }
  function layerOn(k) { return !!state.prefs.layers[k]; }
  function mortarMode() { return mortar() ? mortar().mode : 'coordinates'; }
  function shots() { return state.store.shots; }
  function lastShot() { var s = shots(); return s.length ? s[s.length - 1] : null; }
  function shotById(id) { return shots().filter(function (s) { return s.id === id; })[0] || null; }
  function signedPair(p) { return signed(p[0]) + ' ' + signed(p[1]); }

  function pickMode() {
    if (state.pickMode) return state.pickMode;
    return calibration() ? 'target' : 'calibrate';
  }

  function shells() { return (state.fork && state.fork.constants.shells) || []; }

  // The player's pick, else the heaviest high-explosive shell (Stories also
  // ships a fragmentation one with a smaller blast), else whatever exists.
  function currentShell() {
    var list = shells();
    var picked = list.filter(function (s) { return s.id === state.prefs.shell; })[0];
    if (picked) return picked;
    var he = list.filter(function (s) { return s.kind === 'he'; }).sort(function (a, b) { return (b.radius || 0) - (a.radius || 0); });
    return he[0] || list[0] || null;
  }

  // The radius drawn around the aim point: the player's own number for this
  // shell, else the prototype's. null for a shell that leaves no crater.
  function hitRadius() {
    var s = currentShell();
    if (!s) return null;
    var own = state.prefs.hitRadius[s.id];
    if (typeof own === 'number') return own;
    return typeof s.radius === 'number' ? s.radius : null;
  }

  // Kind names read better than prototype names; when a fork ships two shells
  // of one kind (Stories: fragmentation and HE), the prototype name tells them apart.
  function shellLabel(s) {
    if (s.kind === 'other') return s.name;
    var twins = shells().filter(function (x) { return x.kind === s.kind; }).length > 1;
    return T.shellKinds[s.kind] + (twins ? ' · ' + s.name : '');
  }

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

  // Game refusal text for a check reason, in the fork's own words.
  function refusalText(reason) {
    var t = terms();
    var byReason = { tooFar: t.refuseTooFar, tooClose: t.refuseTooClose, covered: t.refuseCovered,
                     landingZone: t.refuseLandingZone, noArea: t.refuseNotArea };
    return byReason[reason] || T.reasons[reason] || reason;
  }

  // Fire checks for a world target from the placed mortar, or null without one.
  function fireInfo(tile) {
    var m = mortar();
    if (!m || !state.planet) return null;
    var checks = Logic.mortarFireChecks(state.planet, m.tile, tile, mortarConstants(), m.mode);
    var box = Logic.impactBox(m.tile, tile, mortarConstants(), m.mode);
    return { checks: checks, box: box };
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

  function roundedRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // The aim point is an integer world point — a tile corner, which is what the
  // rangefinder number names. Solid circle: the blast; dashed outline: the
  // landing box widened by the same radius.
  function drawHitZone(ctx, v, tile, box, radius, faint) {
    var s = v.scale, p = v.worldToScreen(tile[0], tile[1]);
    var alpha = faint ? 0.55 : 1;
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    if (radius) {
      ctx.strokeStyle = 'rgba(0, 229, 255, ' + alpha + ')';
      ctx.fillStyle = 'rgba(0, 229, 255, ' + (faint ? 0.06 : 0.12) + ')';
      ctx.beginPath();
      ctx.arc(p[0], p[1], radius * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 229, 255, ' + alpha + ')';
    ctx.fill();
    if (!box) return;
    var r = radius || 0.5;
    var tl = v.worldToScreen(box.minX - r, box.maxY + r);
    var w = (box.maxX - box.minX + 2 * r) * s, h = (box.maxY - box.minY + 2 * r) * s;
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 182, 39, ' + alpha + ')';
    ctx.fillStyle = 'rgba(255, 182, 39, ' + (faint ? 0.05 : 0.09) + ')';
    roundedRect(ctx, tl[0], tl[1], w, h, r * s);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  view.addLayer(function drawTints(ctx, v) {
    if (!state.tints || weapon() !== 'mortar') return;
    ctx.imageSmoothingEnabled = false;
    var w = v.tilesWide() * v.scale, h = v.tilesHigh() * v.scale;
    if (layerOn('fire')) ctx.drawImage(mortarMode() === 'laser' ? state.tints.fireLaser : state.tints.fire, v.ox, v.oy, w, h);
    if (layerOn('deploy')) ctx.drawImage(state.tints.deploy, v.ox, v.oy, w, h);
  });

  view.addLayer(function drawLabels(ctx, v) {
    if (!state.planet || v.scale < 2.5) return;
    var size = Math.max(11, Math.min(15, 9 + v.scale * 0.6));
    state.planet.json.labels.forEach(function (label) {
      var p = v.worldToScreen(label[1], label[2]);
      drawText(ctx, label[0], p[0], p[1], size);
    });
  });

  view.addLayer(function drawMortar(ctx, v) {
    var m = state.planet && weapon() === 'mortar' && mortar();
    if (!m) return;
    var c = mortarConstants(), s = v.scale;
    var centre = v.worldToScreen(m.tile[0] + 0.5, m.tile[1] + 0.5);
    if (layerOn('rings')) {
      // A dark underlay keeps the dashes readable over white walls and pale floors.
      var ring = function (radius, colour, label) {
        [['rgba(6, 9, 15, 0.85)', 5], [colour, 2.5]].forEach(function (pass) {
          ctx.setLineDash([10, 7]);
          ctx.lineWidth = pass[1];
          ctx.strokeStyle = pass[0];
          ctx.beginPath();
          ctx.arc(centre[0], centre[1], radius * s, 0, Math.PI * 2);
          ctx.stroke();
        });
        if (s >= 1.5) drawText(ctx, label, centre[0], centre[1] - radius * s - 9, 12);
      };
      ring(c.minRange, '#ff3d5a', String(c.minRange));
      ring(c.maxRange, '#39ff85', String(c.maxRange));
      var z = Logic.zeroErrorSpan(m.tile, c.tilesPerOffset);
      var tl = v.worldToScreen(z.minX, z.maxY + 1);
      [['rgba(6, 9, 15, 0.85)', 4], ['#00e5ff', 2]].forEach(function (pass) {
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = pass[1];
        ctx.strokeStyle = pass[0];
        ctx.strokeRect(tl[0], tl[1], (z.maxX - z.minX + 1) * s, (z.maxY - z.minY + 1) * s);
      });
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#ffb627';
    ctx.strokeStyle = 'rgba(6, 9, 15, 0.9)';
    ctx.lineWidth = 2;
    var r = Math.max(5, Math.min(s / 2, 10));
    ctx.beginPath();
    ctx.moveTo(centre[0], centre[1] - r);
    ctx.lineTo(centre[0] + r, centre[1]);
    ctx.lineTo(centre[0], centre[1] + r);
    ctx.lineTo(centre[0] - r, centre[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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
    if (state.planet && state.selected && !calibration()) markTile(ctx, v, state.selected, '#00e5ff', 2.5);
  });

  view.addLayer(function drawShots(ctx, v) {
    var list = state.planet && calibration() && weapon() === 'mortar' ? shots() : [];
    if (!list.length) return;
    var c = mortarConstants(), t = now(), off = calibration().offset;
    list.forEach(function (s, i) {
      var st = Logic.shotState(s, c, t);
      var aim = Logic.shotAim(s), w = Logic.gameToWorld(off, aim[0], aim[1]);
      if (!st.done) {
        var box = s.mode === 'laser' ? null : Logic.impactBox(s.mortarTile, w, c, s.mode);
        drawHitZone(ctx, v, w, box, s.radius, false);
        var p = v.worldToScreen(w[0], w[1]);
        drawText(ctx, st.remaining.toFixed(1), p[0], p[1] - (s.radius || 1) * v.scale - 10, 13);
      } else if (i === list.length - 1) {
        var q = v.worldToScreen(w[0], w[1]);
        ctx.strokeStyle = '#ffb627';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(q[0] - 6, q[1] - 6); ctx.lineTo(q[0] + 6, q[1] + 6);
        ctx.moveTo(q[0] + 6, q[1] - 6); ctx.lineTo(q[0] - 6, q[1] + 6);
        ctx.stroke();
        drawText(ctx, '№' + s.n, q[0], q[1] - 12, 11);
      }
      s.impacts.forEach(function (g) {
        var iw = Logic.gameToWorld(off, g[0], g[1]), r = v.worldToScreen(iw[0], iw[1]);
        ctx.strokeStyle = '#ff3d5a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r[0], r[1], 5, 0, Math.PI * 2);
        ctx.stroke();
      });
    });
  });

  view.addLayer(function drawTarget(ctx, v) {
    var t = state.planet && calibration() && target();
    if (!t) return;
    if (weapon() === 'mortar' && layerOn('zone')) {
      var info = fireInfo(t);
      drawHitZone(ctx, v, t, info && info.box, hitRadius(), false);
    }
    markTile(ctx, v, t, '#00e5ff', 2.5);
  });

  view.addLayer(function drawHoverZone(ctx, v) {
    var t = state.hoverTile;
    if (!t || !state.planet || !calibration() || weapon() !== 'mortar' || !layerOn('zone')) return;
    if (pickMode() !== 'target') return;
    var cur = target();
    if (cur && cur[0] === t[0] && cur[1] === t[1]) return;
    var info = fireInfo(t);
    drawHitZone(ctx, v, t, info && info.box, hitRadius(), true);
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
    var cs = calState(), coords, note, extra = '';
    if (cs.calibrated) {
      coords = Logic.formatCoords(toGame(t));
      note = T.game + ' · ' + fmt(T.calAge, { age: formatAge(cs.ageMs) });
      if (calibration().check && calibration().check.result === 'mismatch') note += ' · ✗ ' + T.mismatchNote;
      if (cs.askSameRound) note += ' · ' + T.askNote;
      var info = weapon() === 'mortar' ? fireInfo(t) : null;
      if (info) {
        var ok = info.checks.ok;
        extra = '<div class="tac-hover-fire ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓' : '✗') + ' ' +
          esc(fmt(T.hoverDist, { d: info.checks.distance.toFixed(1) })) + ' · ' +
          esc(fmt(T.hoverErr, { ex: info.box.error[0], ey: info.box.error[1] })) +
          (ok ? '' : ' · ' + esc(refusalText(info.checks.reasons[0]))) + '</div>';
      }
    } else {
      coords = Logic.formatCoords(t);
      note = T.world + ' · ' + T.notGame;
    }
    els.hover.innerHTML = '<div class="tac-hover-coords">' + esc(coords) + '</div>' +
      '<div class="tac-hover-note">' + esc(note) + '</div>' + extra + areaHtml(t);
    els.hover.classList.remove('tac-hide');
  }

  view.onHover(function (tile) {
    state.hoverTile = tile;
    renderHover();
    view.requestDraw();
  });

  // ── panel ───────────────────────────────────────────────────────────────

  function button(action, label, cls, disabled, title) {
    return '<button type="button" class="' + (cls || 'btn-small') + '" data-action="' + action + '"' +
      (disabled ? ' disabled' : '') + (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(label) + '</button>';
  }

  function msg(m, id) {
    return '<p class="tac-msg' + (m.kind ? ' ' + m.kind : '') + '"' + (id ? ' id="' + id + '" aria-live="polite"' : '') + '>' + esc(m.text) + '</p>';
  }

  function field(id, label, value) {
    return '<label class="tac-input-label" for="' + id + '">' + esc(label) +
      '<input id="' + id + '" class="tac-input" type="text" autocomplete="off" spellcheck="false" value="' + esc(value) + '"></label>';
  }

  function sameRoundHtml(cs) {
    return '<div class="tac-banner" role="alert"><h2>' + esc(T.sameRoundTitle) + '</h2><p>' +
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

  function weaponHtml() {
    var w = weapon();
    return '<div class="tac-segment" role="group" aria-label="' + esc(T.weaponTitle) + '">' +
      ['mortar', 'ob', 'supply'].map(function (k) {
        var soon = k !== 'mortar';
        return '<button type="button" class="tac-seg' + (w === k ? ' on' : '') + '" data-action="weapon" data-weapon="' + k + '"' +
          (soon ? ' disabled title="' + esc(T.weaponSoon) + '"' : '') + ' aria-pressed="' + (w === k) + '">' + esc(T.weapons[k]) + '</button>';
      }).join('') + '</div>';
  }

  function mortarHtml(cs) {
    var h = '<h2 id="tacMortarTitle">' + esc(T.mortarTitle) + '</h2>';
    var m = mortar();
    if (!cs.calibrated) return h + '<p class="tac-muted">' + esc(T.mortarNeedsCal) + '</p>';
    if (!m) {
      h += '<p class="tac-muted">' + esc(T.mortarNone) + '</p>';
      if (pickMode() === 'mortar') h += msg({ text: T.mortarPickHint, kind: 'info' });
      h += '<div class="tac-actions">' + button('pickMortar', T.mortarPickMap, pickMode() === 'mortar' ? 'btn-small on' : 'btn-small') + '</div>' +
        '<label class="tac-input-label tac-find" for="tacMortarCoords">' + esc(termX() + ' ' + termY()) +
        '<span class="tac-find-row"><input id="tacMortarCoords" class="tac-input" type="text" autocomplete="off" spellcheck="false" placeholder="-100 200" value="' + esc(state.mortarDraft) + '">' +
        button('placeMortar', T.mortarPlace) + '</span></label>';
      if (state.mortarMessage) h += msg(state.mortarMessage);
      return h;
    }
    var place = Logic.placementCheck(state.planet, m.tile);
    var area = Logic.areaAt(state.planet, m.tile[0], m.tile[1]);
    h += '<div class="tac-coords-row"><span class="tac-muted">' + esc(T.mortarAt) + '</span><output class="tac-big" id="tacMortarCoordsOut">' +
      esc(Logic.formatCoords(toGame(m.tile))) + '</output></div>' +
      (area ? '<p class="tac-muted">' + esc(area[1]) + '</p>' : '') +
      (place.ok ? msg({ text: T.deployOk, kind: 'ok' })
        : msg({ text: fmt(T.deployNo, { reason: place.reasons[0] === 'noArea' ? T.deployNoArea : (terms().refuseDeployIndoors || place.reasons[0]) }), kind: 'error' })) +
      '<div class="tac-actions">' + button('pickMortar', T.mortarMove, pickMode() === 'mortar' ? 'btn-small on' : 'btn-small') + button('removeMortar', T.mortarRemove) + '</div>';
    if (pickMode() === 'mortar') h += msg({ text: T.mortarPickHint, kind: 'info' });
    h += '<div class="tac-mode"><span class="tac-muted">' + esc(T.modeLabel) + '</span><div class="tac-segment small" role="group">' +
      [['coordinates', T.modeCoords], ['laser', T.modeLaser]].map(function (o) {
        return '<button type="button" class="tac-seg' + (m.mode === o[0] ? ' on' : '') + '" data-action="mortarMode" data-mode="' + o[0] + '" aria-pressed="' + (m.mode === o[0]) + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div></div>';
    if (m.mode === 'laser') h += '<p class="tac-hint">' + esc(T.laserNote) + '</p>';
    return h;
  }

  function targetHtml(cs) {
    var isMortar = weapon() === 'mortar' && !!mortar();
    var title = isMortar ? (terms().mortarTargetTitle || T.targetTitle) : T.targetTitle;
    var h = '<h2 id="tacTargetTitle">' + esc(title) + '</h2>';
    var t = cs.calibrated ? target() : state.selected;
    if (!t) {
      h += '<p class="tac-muted">' + esc(T.targetNone) + '</p>';
    } else if (cs.calibrated) {
      var g = toGame(t);
      h += '<div class="tac-target-fields">' +
        '<span class="tac-target-field"><span>' + esc(terms().mortarTargetX || termX()) + '</span><output class="tac-big" id="tacTargetX">' + esc(g[0]) + '</output></span>' +
        '<span class="tac-target-field"><span>' + esc(terms().mortarTargetY || termY()) + '</span><output class="tac-big" id="tacTargetY">' + esc(g[1]) + '</output></span>' +
        '<span class="tac-target-copy" id="tacTargetCoords">' + esc(Logic.formatCoords(g)) + '</span>' +
        button('copyTarget', T.copy) + '</div>';
      if (isMortar) {
        var info = fireInfo(t), c = info.checks, laser = mortarMode() === 'laser';
        var variants = Logic.fireVariants({ offset: calibration().offset, gameTarget: g, constants: mortarConstants(), planet: state.planet,
          mortarTile: mortar().tile, currentDial: Logic.currentDial(shots()), lastShot: lastShot(), mode: mortarMode() });
        if (!laser) {
          h += '<p class="tac-dial">' + esc(fmt(T.dialLine, { label: terms().mortarOffsetTitle || 'Dial' })) +
            (variants.newTarget.resetDial ? ' <span class="tac-warn-inline">' + esc(fmt(T.nowDial, { dial: signedPair(variants.newTarget.currentDial) })) + '</span>' : '') + '</p>';
        }
        h += '<p class="tac-muted">' + esc(fmt(T.distance, { d: c.distance.toFixed(1) })) + '</p>' +
          (c.ok ? msg({ text: T.fireOk, kind: 'ok' }) : msg({ text: fmt(T.fireNo, { reason: refusalText(c.reasons[0]) }), kind: 'error' }));
        if (!laser) {
          h += '<p class="tac-muted">' + esc(info.box.error[0] || info.box.error[1]
            ? fmt(T.errorLine, { ex: info.box.error[0], ey: info.box.error[1] }) : T.errorNone) + '</p>';
        }
        h += c.warnings.map(function (w) { return msg({ text: T.warnings[w] || w, kind: 'warn' }); }).join('') +
          '<div class="tac-actions">' + button('fireNew', T.fire, 'btn-primary', !c.ok) + '</div>';
        var d = variants.dial;
        if (d) {
          h += '<div class="tac-card tac-dial-card"><h3>' + esc(terms().mortarOffsetTitle || 'Dial') + ' · ' + esc(fmt(T.fromShot, { n: lastShot().n })) + '</h3>' +
            '<div class="tac-target-fields">' +
            '<span class="tac-target-field"><span>' + esc(terms().mortarOffsetX || 'X') + '</span><output class="tac-big">' + esc(signed(d.dial[0])) + '</output></span>' +
            '<span class="tac-target-field"><span>' + esc(terms().mortarOffsetY || 'Y') + '</span><output class="tac-big">' + esc(signed(d.dial[1])) + '</output></span>' +
            '<span class="tac-target-copy" id="tacDialCoords">' + esc(Logic.formatCoords(d.dial)) + '</span>' + button('copyDial', T.copy) + '</div>' +
            '<p class="tac-keep">' + esc(fmt(T.keepTarget, { coords: Logic.formatCoords(d.baseTarget), set: terms().mortarTargetSet || 'Set Target' })) + '</p>' +
            '<p class="tac-muted">' + esc(d.errorKnown ? fmt(T.errKnown, { e: signedPair(d.error) }) : T.errUnknown) + '</p>' +
            '<div class="tac-actions">' + button('fireDial', T.fire, 'btn-primary') + '</div></div>';
        }
      } else if (weapon() === 'mortar') {
        h += '<p class="tac-muted">' + esc(T.targetNoMortar) + '</p>';
      }
      h += '<p class="tac-muted">' + esc(fmt(T.calAge, { age: formatAge(cs.ageMs) })) + '</p>' + areaHtml(t);
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

  function layersHtml() {
    var h = '<h2 id="tacLayersTitle">' + esc(T.layersTitle) + '</h2><div class="tac-layers">';
    Logic.LAYER_KEYS.forEach(function (k) {
      h += '<label class="tac-check-label"><input type="checkbox" data-layer="' + k + '"' + (layerOn(k) ? ' checked' : '') + '> ' + esc(T.layers[k]) + '</label>';
    });
    h += '</div>';
    var list = shells(), s = currentShell();
    if (s) {
      var r = hitRadius(), own = typeof state.prefs.hitRadius[s.id] === 'number';
      h += '<div class="tac-shell-row"><label class="tac-input-label" for="tacShell">' + esc(T.shell) +
        '<select id="tacShell" class="tac-select">' + list.map(function (x) {
          return '<option value="' + esc(x.id) + '"' + (x.id === s.id ? ' selected' : '') + '>' + esc(fmt(shellLabel(x), { name: x.name })) + '</option>';
        }).join('') + '</select></label>' +
        '<label class="tac-input-label" for="tacRadius">' + esc(T.radius) +
        '<span class="tac-find-row"><input id="tacRadius" class="tac-input" type="number" min="0" max="' + MAX_RADIUS + '" step="0.5" value="' + (r == null ? '' : r) + '">' +
        (own ? button('resetRadius', T.radiusReset) : '') + '</span></label></div>' +
        '<p class="tac-hint">' + esc(s.kind === 'flare' && typeof s.radius !== 'number' ? T.radiusFlare : fmt(T.radiusDefault, { r: s.radius == null ? '—' : s.radius })) +
        (s.shards ? ' · ' + esc(fmt(T.shardsNote, { n: s.shards })) : '') + '</p>';
    }
    return h + '<p class="tac-hint">' + esc(T.zoneHint) + '</p>';
  }

  function eventName(ev) { return T.events[ev] || ev; }

  function shotsHtml() {
    var h = '<h2 id="tacShotsTitle">' + esc(T.shotsTitle) + '</h2>' +
      '<div class="tac-mode"><span class="tac-muted">' + esc(T.timerFrom) + '</span><div class="tac-segment small" role="group">' +
      [['fire', T.timerFire], ['load', T.timerLoad]].map(function (o) {
        var on = state.prefs.timerFrom === o[0];
        return '<button type="button" class="tac-seg' + (on ? ' on' : '') + '" data-action="timerFrom" data-from="' + o[0] + '" aria-pressed="' + on + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div></div>';
    var list = shots();
    if (!list.length) return h + '<p class="tac-muted">' + esc(T.noShots) + '</p>';
    var t = now(), c = mortarConstants();
    list.slice().reverse().slice(0, 6).forEach(function (s, i) {
      var st = Logic.shotState(s, c, t);
      var isLast = i === 0;
      h += '<div class="tac-shot' + (st.done ? '' : ' flying') + '" data-shot="' + esc(s.id) + '">' +
        '<div class="tac-shot-head"><b>' + esc(fmt(T.shotLine, { n: s.n, target: Logic.formatCoords(s.target) })) + '</b>' +
        (s.mode === 'laser' ? ' · ' + esc(T.modeLaser) : ' · ' + esc(fmt(T.shotDial, { dial: signedPair(s.dial) }))) + '</div>' +
        '<div class="tac-shot-timer" data-shot-timer="' + esc(s.id) + '">' + esc(shotTimerText(s, st)) + '</div>';
      s.impacts.forEach(function (p) {
        var e = [p[0] - s.target[0] - s.dial[0], p[1] - s.target[1] - s.dial[1]];
        h += '<div class="tac-impact">' + esc(fmt(T.impactAt, { coords: Logic.formatCoords(p) })) + ' · ' + esc(fmt(T.impactErr, { e: signedPair(e) })) + '</div>';
      });
      s.doubtful.forEach(function (p) {
        h += '<div class="tac-impact doubtful">' + esc(fmt(T.impactAt, { coords: Logic.formatCoords(p) })) + ' · ' + esc(T.implausible) + '</div>';
      });
      var m = state.impactMessage[s.id];
      if (m) h += msg(m);
      if (isLast) {
        h += (pickMode() === 'impact' && state.impactShotId === s.id ? msg({ text: T.impactPick, kind: 'info' }) : '') +
          '<div class="tac-actions">' + button('impactHere', T.impactHere, pickMode() === 'impact' && state.impactShotId === s.id ? 'btn-small on' : 'btn-small') +
          button('undoShot', T.undoShot) + '</div>' +
          '<span class="tac-find-row"><input id="tacImpact-' + esc(s.id) + '" class="tac-input" type="text" autocomplete="off" spellcheck="false" placeholder="Para-Cam (X):(Y)" value="' + esc(state.impactDraft[s.id] || '') + '">' +
          button('impactAdd', T.impactAdd) + '</span>';
      }
      h += '</div>';
    });
    return h;
  }

  function shotTimerText(s, st) {
    if (st.done) return fmt(T.landed, { age: formatAge(Math.max(0, (st.elapsed - st.timeline[st.timeline.length - 1].at) * 1000)) });
    var text = fmt(T.inFlight, { s: st.remaining.toFixed(1) });
    if (st.next && st.next.event !== 'impact') text += ' · ' + fmt(T.nextEvent, { event: eventName(st.next.event), s: (st.next.at - st.elapsed).toFixed(1) });
    return text;
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
      '<section class="tac-section tac-weapon">' + weaponHtml() + '</section>' +
      (weapon() === 'mortar' ? '<section class="tac-section" aria-labelledby="tacMortarTitle">' + mortarHtml(cs) + '</section>' : '') +
      '<section class="tac-section" aria-labelledby="tacTargetTitle">' + targetHtml(cs) + '</section>' +
      (weapon() === 'mortar' && cs.calibrated && mortar() ? '<section class="tac-section" aria-labelledby="tacShotsTitle">' + shotsHtml() + '</section>' : '') +
      (weapon() === 'mortar' ? '<section class="tac-section" aria-labelledby="tacLayersTitle">' + layersHtml() + '</section>' : '') +
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

  // The «same round?» banner sits at the top of the panel; a question raised by
  // a field at the bottom must scroll into view or nobody sees it.
  function revealBanner() {
    var b = els.panel.querySelector('.tac-banner');
    if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
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

  // A typed in-game pair as a world tile on this planet, or a message why not.
  function parseGamePoint(text) {
    var p = Logic.parseCoords(text, maxCoord());
    if (!p.ok) return { error: T.parse[p.reason] };
    var w = Logic.gameToWorld(calibration().offset, p.x, p.y);
    if (!Logic.areaAt(state.planet, w[0], w[1])) {
      state.session.offPlanet = true;   // a wrong planet or a stale offset looks exactly like this
      return { error: fmt(T.offPlanet, { coords: Logic.formatCoords([p.x, p.y]) }) };
    }
    return { tile: w };
  }

  function setMortar(tile) {
    state.store.mortar = { tile: tile.slice(), mode: (mortar() && mortar().mode) || 'coordinates' };
    state.pickMode = null;
    state.mortarMessage = null;
    saveStore();
    trackPlanet('tactical_mortar_place');
    renderAll();
  }

  function setTarget(tile) {
    state.store.target = tile.slice();
    state.findMessage = null;
    saveStore();
    if (mortar()) trackPlanet('tactical_target');
    renderAll();
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
      state.selected = null;
      state.pickMode = null;
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
      state.pickMode = null;
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
      state.store.mortar = null;
      state.store.target = null;
      state.store.shots = [];
      state.session = Logic.newSession(now(), false);
      state.selected = null;
      state.pickMode = null;
      state.draft = { x: '', y: '' };
      state.calMessage = null;
      state.mortarDraft = '';
      state.mortarMessage = null;
      state.findDraft = '';
      state.findMessage = null;
      state.impactShotId = null;
      state.impactDraft = {};
      state.impactMessage = {};
      saveStore();
      trackPlanet('tactical_new_round');
      renderAll();
    },
    weapon: function (btn) {
      var w = btn.getAttribute('data-weapon');
      if (w === state.prefs.weapon || btn.disabled) return;
      state.prefs.weapon = w;
      savePrefs();
      renderAll();
    },
    pickMortar: function () {
      state.pickMode = pickMode() === 'mortar' ? null : 'mortar';
      state.mortarMessage = null;
      renderPanel();
      els.canvas.focus({ preventScroll: true });
    },
    placeMortar: function () {
      var r = parseGamePoint(state.mortarDraft);
      if (r.error) {
        state.mortarMessage = { text: r.error, kind: 'error' };
        renderAll();
        revealBanner();
        return;
      }
      state.mortarDraft = '';
      setMortar(r.tile);
      showTile(r.tile);
    },
    removeMortar: function () {
      state.store.mortar = null;
      state.pickMode = null;
      saveStore();
      renderAll();
    },
    copyTarget: function () {
      if (target() && calibration()) copyCoords(Logic.formatCoords(toGame(target())), $('tacTargetCoords'));
    },
    find: function () {
      var r = parseGamePoint(state.findDraft);
      if (r.error) {
        state.findMessage = { text: r.error, kind: 'error' };
        renderAll();
        revealBanner();
        return;
      }
      setTarget(r.tile);
      view.centerOn(r.tile[0] + 0.5, r.tile[1] + 0.5, Math.max(view.scale, PICK_MIN_SCALE));
    },
    resetRadius: function () {
      var s = currentShell();
      if (s) delete state.prefs.hitRadius[s.id];
      savePrefs();
      renderAll();
    },
    mortarMode: function (btn) {
      var m = mortar(), mode = btn.getAttribute('data-mode');
      if (!m || m.mode === mode) return;
      m.mode = mode;
      saveStore();
      renderAll();
    },
    timerFrom: function (btn) {
      state.prefs.timerFrom = btn.getAttribute('data-from') === 'load' ? 'load' : 'fire';
      savePrefs();
      renderPanel();
    },
    fireNew: function () {
      if (target() && mortar()) recordShot(toGame(target()), [0, 0]);
    },
    fireDial: function () {
      var d = target() && mortar() && Logic.fireVariants({ offset: calibration().offset, gameTarget: toGame(target()), constants: mortarConstants(),
        planet: state.planet, mortarTile: mortar().tile, currentDial: Logic.currentDial(shots()), lastShot: lastShot(), mode: mortarMode() }).dial;
      if (d) recordShot(d.baseTarget, d.dial);
    },
    undoShot: function () {
      var s = shots();
      if (!s.length) return;
      var gone = s.pop();
      delete state.impactMessage[gone.id];
      delete state.impactDraft[gone.id];
      if (state.impactShotId === gone.id) { state.impactShotId = null; state.pickMode = null; }
      saveStore();
      trackPlanet('tactical_undo_shot');
      renderAll();
    },
    impactHere: function () {
      var s = lastShot();
      if (!s) return;
      var on = pickMode() === 'impact' && state.impactShotId === s.id;
      state.pickMode = on ? null : 'impact';
      state.impactShotId = on ? null : s.id;
      renderPanel();
      els.canvas.focus({ preventScroll: true });
    },
    impactAdd: function () {
      var s = lastShot();
      if (!s) return;
      var p = Logic.parseCoords(state.impactDraft[s.id] || '', maxCoord());
      if (!p.ok) {
        state.impactMessage[s.id] = { text: T.parse[p.reason], kind: 'error' };
        renderPanel();
        return;
      }
      state.impactDraft[s.id] = '';
      addImpact(s, [p.x, p.y]);
    },
    copyDial: function () {
      var el = $('tacDialCoords');
      if (el) copyCoords(el.textContent, el);
    }
  };

  // A shot as fired: the numbers entered in the mortar, the clock, the mortar
  // tile and the shell — everything a later dial or an impact report needs.
  function recordShot(targetGame, dial) {
    var list = shots();
    var n = list.length ? list[list.length - 1].n + 1 : 1;
    var s = currentShell();
    list.push({
      id: now() + '-' + n, n: n, target: targetGame.slice(), dial: dial.slice(), at: now(),
      fromLoad: state.prefs.timerFrom === 'load', mortarTile: mortar().tile.slice(), mode: mortarMode(),
      shell: s ? s.id : null, radius: hitRadius(), impacts: [], doubtful: []
    });
    state.pickMode = null;
    saveStore();
    trackPlanet('tactical_shot');
    renderAll();
    startShotTicker();
  }

  // The impact reported through «Landed here» or a Para-Cam name, in game
  // coordinates. Beyond the error bound plus jitter it cannot be this shot.
  function addImpact(shot, point) {
    var targetWorld = Logic.gameToWorld(calibration().offset, shot.target[0], shot.target[1]);
    var bounds = shot.mode === 'laser' ? [0, 0] : Logic.errorBounds(shot.mortarTile, targetWorld, mortarConstants().tilesPerOffset);
    if (Logic.impactPlausible(shot, point, bounds)) {
      shot.impacts.push(point.slice());
      delete state.impactMessage[shot.id];
    } else {
      shot.doubtful.push(point.slice());   // listed with its own note, so no extra message
      delete state.impactMessage[shot.id];
    }
    state.pickMode = null;
    state.impactShotId = null;
    saveStore();
    trackPlanet('tactical_impact');
    renderAll();
  }

  // While a shell is in the air the timer line and the map countdown tick;
  // the moment it lands the panel re-renders once.
  var shotTicker = 0;
  function startShotTicker() {
    if (shotTicker) return;
    shotTicker = setInterval(tickShots, 250);
  }

  function tickShots() {
    var c = mortarConstants(), t = now(), flying = false, landed = false;
    shots().forEach(function (s) {
      var st = Logic.shotState(s, c, t);
      var el = els.panel.querySelector('[data-shot-timer="' + s.id + '"]');
      if (el) {
        var text = shotTimerText(s, st);
        if (el.textContent !== text) el.textContent = text;
        var row = el.parentElement;
        if (row && st.done && row.classList.contains('flying')) { row.classList.remove('flying'); landed = true; }
      }
      if (!st.done) flying = true;
    });
    view.requestDraw();
    if (!flying) { clearInterval(shotTicker); shotTicker = 0; }
    if (landed) renderAll();
  }

  els.panel.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn || btn.disabled || !state.planet) return;
    var fn = actions[btn.getAttribute('data-action')];
    if (fn) fn(btn);
  });

  els.panel.addEventListener('input', function (e) {
    var el = e.target, id = el.id;
    if (id === 'tacCalX' || id === 'tacCalY') onCalInput();
    else if (id === 'tacFind') state.findDraft = el.value;
    else if (id === 'tacMortarCoords') state.mortarDraft = el.value;
    else if (id.indexOf('tacImpact-') === 0) state.impactDraft[id.slice(10)] = el.value;
    else if (id === 'tacRadius') {
      var s = currentShell(), r = parseFloat(String(el.value).replace(',', '.'));
      if (!s) return;
      if (isFinite(r) && r >= 0 && r <= MAX_RADIUS) state.prefs.hitRadius[s.id] = r;
      else if (el.value === '') delete state.prefs.hitRadius[s.id];
      savePrefs();
      view.requestDraw();
    }
  });

  els.panel.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'tacShell') {
      state.prefs.shell = el.value;
      savePrefs();
      renderAll();
    } else if (el.getAttribute && el.getAttribute('data-layer')) {
      state.prefs.layers[el.getAttribute('data-layer')] = !!el.checked;
      savePrefs();
      view.requestDraw();
    } else if (el.id === 'tacRadius') {
      renderPanel();   // the reset button appears once a value is the player's own
    }
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
    else if (id === 'tacMortarCoords') { actions.placeMortar(); e.preventDefault(); }
    else if (id.indexOf('tacImpact-') === 0) { actions.impactAdd(); e.preventDefault(); }
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
    var mode = pickMode();
    if (mode === 'calibrate') {
      if (view.scale < PICK_MIN_SCALE) {
        view.zoomAt(PICK_ZOOM_SCALE / view.scale, sx, sy);   // the tile stays under the cursor
        state.calMessage = { text: T.calPickZoomed, kind: 'info' };
        renderPanel();
        return;
      }
      state.selected = tile;
      state.calMessage = null;
      renderAll();
      if (fromPointer) {
        var x = $('tacCalX');
        if (x && !x.value) x.focus({ preventScroll: true });
      }
      return;
    }
    if (mode === 'mortar') {
      setMortar(tile);
      return;
    }
    if (mode === 'impact') {
      var shot = shotById(state.impactShotId);
      if (shot && calibration()) addImpact(shot, toGame(tile));
      else { state.pickMode = null; state.impactShotId = null; renderPanel(); }
      return;
    }
    setTarget(tile);
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
    else if (e.key === 'Escape' && state.pickMode) { state.pickMode = null; renderPanel(); e.preventDefault(); }
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
  document.addEventListener('visibilitychange', function () {
    tick();
    if (state.planet && shots().length) { tickShots(); renderAll(); }   // a hidden tab's timers catch up at once
  });

  // Another tab of this page wrote the same planet or the prefs: take its state.
  // A calibration made there just now is as fresh as one made here.
  window.addEventListener('storage', function (e) {
    if (e.key === PREFS_KEY) {
      var rawPrefs = null;
      try { rawPrefs = JSON.parse(e.newValue); } catch (err) { rawPrefs = null; }
      state.prefs = Logic.migratePrefs(rawPrefs);
      renderAll();
      return;
    }
    if (!state.storeKey || e.key !== state.storeKey) return;
    var before = calibration() ? calibration().at : null;
    var raw = null;
    try { raw = JSON.parse(e.newValue); } catch (err) { raw = null; }
    state.store = Logic.migrateStorage(raw);
    var after = calibration() ? calibration().at : null;
    if (after && after !== before) Logic.confirmSameRound(state.session, now());
    renderAll();
    if (shots().length) startShotTicker();
  });

  applyStaticText();
  loadIndex();
})();

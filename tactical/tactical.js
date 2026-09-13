/*
  SPDX-License-Identifier: GPL-3.0-only
  Copyright (C) 2026 MikameO
  This file is part of Space Station Recipes.
  See LICENSE for details.
*/
// Tactical map page: data loading, fork and planet selection, the map view and the
// panel. Pure maths lives in tactical/logic.js (window.TacticalLogic).
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var Logic = window.TacticalLogic;
  var LANG = window.I18N_LANG === 'ru' ? 'ru' : 'en';

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
      noArea: 'no area',
      beta: 'Beta: every number follows the game code, but it has not been checked in a round yet. Compare a check tile with your rangefinder before firing.',
      source: 'Data: {fork} at {sha} ({date}).',
      hint: 'Wheel or buttons to zoom, drag to pan. Hover a tile to see its area and what can strike it.',
      flags: { ob: 'OB', cas: 'CAS', mortarFire: 'Mortar fire', mortarPlace: 'Mortar deploy', supply: 'Supply drop', lz: 'Landing zone' },
      planetPlayers: '{n}+ players'
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
      noArea: 'зоны нет',
      beta: 'Бета: все числа повторяют код игры, но в раунде ещё не проверены. Перед огнём сверьте проверочный тайл с дальномером.',
      source: 'Данные: {fork}, коммит {sha} ({date}).',
      hint: 'Колесо или кнопки — масштаб, перетаскивание — перемещение. Наведите на тайл, чтобы увидеть зону и чем по нему можно бить.',
      flags: { ob: 'ОБ', cas: 'КАС', mortarFire: 'Огонь миномёта', mortarPlace: 'Развернуть миномёт', supply: 'Сброс поставки', lz: 'Зона посадки' },
      planetPlayers: 'от {n} игроков'
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
    loadToken: 0
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
      view.setImage(img, json.bounds);
      writeHash();
      renderHover();
      renderPanel();
      setStatus('');
    }).catch(function (err) {
      if (token !== state.loadToken) return;
      console.error(err);
      setStatus(T.loadFailed, { error: true, retry: function () { loadPlanet(meta); } });
    });
  }

  // ── map layers ──────────────────────────────────────────────────────────

  view.addLayer(function drawLabels(ctx, v) {
    if (!state.planet || v.scale < 2.5) return;
    var size = Math.max(11, Math.min(15, 9 + v.scale * 0.6));
    ctx.font = '600 ' + size + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(6, 9, 15, 0.95)';
    ctx.fillStyle = '#e8ecf4';
    state.planet.json.labels.forEach(function (label) {
      var p = v.worldToScreen(label[1], label[2]);
      ctx.strokeText(label[0], p[0], p[1]);
      ctx.fillText(label[0], p[0], p[1]);
    });
  });

  view.addLayer(function drawHoverTile(ctx, v) {
    var t = state.hoverTile;
    if (!t || v.scale < 3) return;
    var p = v.worldToScreen(t[0], t[1] + 1);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p[0] + 0.5, p[1] + 0.5, v.scale - 1, v.scale - 1);
  });

  // ── hover readout ───────────────────────────────────────────────────────

  function chip(label, on) {
    return '<span class="tac-chip ' + (on ? 'yes' : 'no') + '">' + esc(label) + '</span>';
  }

  function renderHover() {
    var t = state.hoverTile;
    if (!t || !state.planet) {
      els.hover.classList.add('tac-hide');
      return;
    }
    var area = Logic.areaAt(state.planet, t[0], t[1]);
    var F = Logic.FLAGS;
    var html = '<div class="tac-hover-coords">' + esc(Logic.formatCoords(t)) + '</div>' +
      '<div class="tac-hover-note">' + esc(T.world) + ' · ' + esc(T.notGame) + '</div>';
    if (area) {
      var f = area[3];
      html += '<div>' + esc(area[1]) + '</div><div class="tac-chips">' +
        chip(T.flags.mortarFire, (f & F.MORTAR_FIRE) && !(f & F.LANDING_ZONE)) +
        chip(T.flags.mortarPlace, f & F.MORTAR_PLACE) +
        chip(T.flags.ob, f & F.OB) +
        chip(T.flags.cas, f & F.CAS) +
        chip(T.flags.supply, f & F.SUPPLY) +
        ((f & F.LANDING_ZONE) ? '<span class="tac-chip warn">' + esc(T.flags.lz) + '</span>' : '') +
        '</div>';
    } else {
      html += '<div class="tac-hover-note">' + esc(T.noArea) + '</div>';
    }
    els.hover.innerHTML = html;
    els.hover.classList.remove('tac-hide');
  }

  view.onHover(function (tile) {
    state.hoverTile = tile;
    renderHover();
    view.requestDraw();
  });

  // ── panel ───────────────────────────────────────────────────────────────

  function renderPanel() {
    var f = state.fork;
    els.panel.innerHTML =
      '<div class="tac-beta">' + esc(T.beta) + '</div>' +
      '<p class="tac-muted">' + esc(T.hint) + '</p>' +
      '<p class="tac-source">' + esc(fmt(T.source, { fork: f.label, sha: f.source.sha.slice(0, 9), date: f.source.date })) + '</p>';
  }

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
  });

  window.addEventListener('hashchange', function () {
    var wanted = readHash();
    if (!wanted || !state.index) return;
    if (state.fork && state.meta && wanted.fork === state.fork.key && wanted.planet === state.meta.id) return;
    var fork = state.index.forks.filter(function (f) { return f.key === wanted.fork; })[0];
    if (!fork) return;
    fillForks(fork.key);
    selectFork(fork, wanted.planet);
  });

  applyStaticText();
  loadIndex();
})();

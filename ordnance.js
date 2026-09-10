/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2025 MikameO
 * This file is part of Space Station Recipes.
 *
 * Ordnance tab — casing mixture calculator (Series O).
 * Data: ordnance/<fork>.json, produced by ss14_ordnance.py.
 * Spec: docs/design/2026-09-10-ordnance-calculator.md
 *
 * The stats maths here is a straight port of compute_stats()/engine_params()
 * in ss14_ordnance.py, which in turn mirrors the server's
 * OrdnanceExplosionSystem. Keep the three in step.
 */
(function () {
  'use strict';

  const FORK = 'stories_cm';        // the only fork carrying an ordnance layer today
  const CASING_ORDER = ['RMCM40GrenadeCasing', 'RMCM15GrenadeCasing', 'RMCM20MineCasing',
    'RMCC4PlasticCasing', 'RMC88mmRocketWarhead', 'RMC80mmMortarWarhead'];
  const CASING_LABEL = {
    RMCM40GrenadeCasing: 'M40 grenade', RMCM15GrenadeCasing: 'M15 grenade',
    RMCM20MineCasing: 'M20 mine', RMCC4PlasticCasing: 'C4 charge',
    RMC88mmRocketWarhead: '84mm rocket warhead', RMC80mmMortarWarhead: '80mm mortar warhead',
    RMC80mmMortarCameraWarhead: '80mm mortar camera warhead',
  };
  const METRICS = {
    power: { label: 'Power', get: s => s.power },
    blastRadius: { label: 'Blast radius', get: s => s.hasBlast ? s.blastRadius : 0 },
    damage: { label: 'Peak damage', get: (s, d) => s.power * d },
    shards: { label: 'Shrapnel', get: s => s.shards },
    fireIntensity: { label: 'Fire intensity', get: s => s.fireIntensity },
    fireDuration: { label: 'Burn time', get: s => s.fireDuration },
    reach: { label: 'Fire reach', get: s => s.reach },
  };

  const NONE = '';                  // "leave the rest of the casing empty"
  const VIEW = { yaw: -0.7, pitch: 0.62, zoom: 1 };   // default camera

  const S = {
    inited: false, data: null, casing: null, mix: {}, dampener: false,
    chartMode: 'blend', sweepId: null, blendA: null, blendB: null,
    heatA: null, heatB: null, heatC: NONE,
    heatCMode: 'fill',              // 'fill' = takes the remainder, 'fixed' = set amount
    heatCAmount: 0,
    heatMetric: 'blastRadius', heatHeight: 'blastRadius',
    surfView: '3d', yaw: VIEW.yaw, pitch: VIEW.pitch, zoom: VIEW.zoom,
    // The pinned point is a MIXTURE, never a grid cell. Cell coordinates mean a
    // different mixture the moment an axis changes, so keeping those would move
    // the marker under the user; keeping the mixture lets them hold one point in
    // composition space and watch every other setting change around it.
    pick: null,                     // { mix } or null
    surfCells: [],                  // screen polygons of the last surface draw
    costBase: null,
    reqObjective: 'blastRadius', reqCostLimit: null,
    reqs: [{ metric: 'shards', min: 20 }],   // opens on a real, useful example
    reqLadder: false, reqResult: undefined,
    galleryRange: 0,
    masks: [], maskMode: 'off',
    costCache: new Map(),
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

  // app.js declares `let DATA` at classic-script top level, which lands in the
  // global lexical environment and is therefore readable here by bare name —
  // but never as window.DATA. Guard with typeof so a load failure degrades to ids.
  function chem() { return typeof DATA !== 'undefined' && DATA ? DATA : null; }

  function rname(id) {
    const D = chem();
    const r = D && D.reagents && D.reagents[id];
    return (r && r.name) || id;
  }

  // Strings built around numbers never match the DOM dictionary in i18n.js, so
  // this module carries its own small map for them. Static markup stays in
  // English in index.html and is translated by the observer as usual.
  const RU = {
    'tiles': 'клеток', 'power': 'мощность',
    'falloff': 'спад', 'fire': 'огонь',
    'shrapnel': 'осколки', 'via': 'через',
    'ceiling': 'потолок',
    'at casing ceiling': 'на потолке корпуса',
    'at floor': 'на нижнем пределе',
    'cap': 'предел',
    'at casing cap': 'на пределе корпуса',
    'star — rays': 'звезда — лучи',
    'diamond': 'ромб',
    'no blast': 'волны нет',
    'radius ≤ 1: shrapnel and fire still fire': 'радиус ≤ 1: осколки и огонь всё равно срабатывают',
    'blunt + burn at the centre': 'дробящий + ожоги в центре',
    'base': 'база', 'dampened': 'с гасителем',
    'Flame colour': 'Цвет пламени',
    'Radius peaks at': 'Радиус пикует на',
    'with': 'при', 'nothing': 'пусто',
    'Best': 'Лучшее', 'at': 'при',
    'blast radius': 'радиус волны',
    'peak damage': 'урон в эпицентре',
    'burn time': 'длительность горения',
    'fire intensity': 'интенсивность огня',
    'fire reach': 'охват огня',
    'is the same across every mixture here': 'одинаков для всех смесей здесь',
    'Colour': 'Цвет', 'Height': 'Высота',
    'Power': 'Мощность',
    'Blast radius': 'Радиус волны',
    'Peak damage': 'Урон в эпицентре',
    'Shrapnel': 'Осколки',
    'Fire intensity': 'Интенсивность огня',
    'Burn time': 'Длительность горения',
    'Fire reach': 'Охват огня',
    'same everywhere': 'одинаково везде',
    'at least': 'не менее',
    'Uses': 'Реагентов:',
    'cost': 'цена',
    'Lowest cost': 'Минимальная цена',
    'requirements not met': 'требования не выполнены',
    'Nothing in this casing can do that.': 'В этом корпусе такого не собрать.',
    'No requirements: the search just maximises.': 'Без требований поиск просто максимизирует.',
    'Masks': 'Маски',
    'Intersection of': 'Пересечение',
    'of': 'из',
    'mixtures clear every mask': 'смесей проходят все маски',
    'No mixture here clears every mask.': 'Здесь ни одна смесь не проходит все маски.',
    'Pinned': 'Закреплено',
    'For': 'Зачем', 'Kills': 'Убивает',
    'Fire': 'Огонь',
    'Reach': 'Дальнобой', 'Damage': 'Урон',
    'Burn time': 'Горение', 'Cheap': 'Дёшево',
    'destroyed': 'уничтожен', 'no effect': 'без эффекта',
    'Nothing baked for this casing.': 'Для этого корпуса готовых рецептов нет.',
    'Target': 'Цель', 'Mixture': 'Смесь',
    'Blast': 'Волна', 'Saved': 'Экономия',
    'These numbers come from': 'Цифры взяты из форка',
    'Switch the app to it': 'Переключить приложение на него',
    'over the casing volume': 'больше объёма корпуса',
    'casing not full': 'корпус не полон',
    'No masks yet. Add one to highlight where a metric clears a threshold.': 'Масок пока нет. Добавьте маску, чтобы подсветить области, где метрика перешагивает порог.',
  };
  const tr = s => (window.I18N_LANG === 'ru' && RU[s]) || s;
  const mlabel = key => tr(METRICS[key].label);

  function casingOf() { return S.data.casings[S.casing]; }
  function volUsed() { return Object.values(S.mix).reduce((a, b) => a + b, 0); }
  function volFree() { return Math.max(0, casingOf().vol - volUsed()); }

  // ── the formula (mirror of ss14_ordnance.compute_stats) ────────────────────
  function computeStats(mix, casing, dampener) {
    const F = S.data.formula;
    let power = 0, falloff = casing.base, intensity = 0, duration = 0, radius = 0;
    let shards = 0, penetrating = false;
    let cr = 0, cg = 0, cb = 0, cw = 0;

    for (const id in mix) {
      const qty = mix[id];
      if (!(qty > 0)) continue;
      const spec = S.data.reagents[id];
      if (!spec) continue;
      if (spec.explosive) { power += qty * spec.power; falloff += qty * spec.falloff; }
      intensity += qty * spec.i;
      duration += qty * spec.d;
      radius += qty * spec.r;
      if (spec.penetrating) penetrating = true;
      if (spec.color) {
        // ExecuteExplosion weights a colour by max(qty, 1) * burncolormod, so a
        // reagent that never set burncolormod contributes nothing at all.
        const w = Math.max(qty, 1) * (spec.colorWeight || 0);
        const rgb = hexToRgb(spec.color);
        if (rgb && w > 0) { cr += rgb[0] * w; cg += rgb[1] * w; cb += rgb[2] * w; cw += w; }
      }
      if (id === F.ironReagent) shards += Math.floor(qty * F.shardsPerUnit);
    }

    if (power <= 0) shards = 0;
    power = Math.min(power, casing.maxP);
    falloff = Math.max(falloff, casing.minF);
    if (dampener) falloff *= 2;
    shards = Math.min(shards, casing.shards);

    if (intensity > 0) {
      intensity = clamp(intensity, casing.fi[0], casing.fi[1]);
      duration = clamp(duration, casing.fd[0], casing.fd[1]);
      radius = clamp(radius, casing.fr[0], casing.fr[1]);
    } else { intensity = duration = radius = 0; }

    const eng = engineParams(power, falloff, F);
    const star = !!casing.star && intensity > F.starIntensity;
    const ray = star ? Math.min(Math.round(radius * 1.5), casing.fr[1]) : 0;
    return {
      power, falloff, shards, fireIntensity: intensity, fireDuration: duration,
      fireRadius: radius, firePenetrating: penetrating, star,
      reach: star ? ray : Math.floor(radius),
      blastRadius: eng.radius, hasBlast: eng.totalIntensity > 0,
      flame: cw > 0 ? rgbToHex(cr / cw, cg / cw, cb / cw) : null,
    };
  }

  function engineParams(power, falloff, F) {
    if (power <= 0 || falloff <= 0) return { totalIntensity: 0, radius: 0 };
    const maxIntensity = power / F.intensityDivisor;
    const slope = Math.max(falloff / F.intensityDivisor, F.minSlope);
    const radius = maxIntensity / slope;
    const calc = Math.max(0, radius - 1);
    return { totalIntensity: Math.PI / 3 * slope * calc ** 3, radius };
  }

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  function hexToRgb(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbToHex = (r, g, b) => '#' + [r, g, b]
    .map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

  // ── logistics cost, derived from the reaction graph in data.json ───────────
  // costOf(X) -> {baseReagent: units needed per 1 unit of X}. Catalysts are
  // skipped: they are not consumed, so they cost nothing per unit produced.
  function costOf(id, seen) {
    if (S.costCache.has(id)) return S.costCache.get(id);
    seen = seen || new Set();
    const D = chem();
    const r = D && D.reagents && D.reagents[id];
    let out;
    if (!r || r.isBase || !r.recipe || seen.has(id)) {
      out = { [id]: 1 };
    } else {
      const rec = r.recipe;
      const yield_ = (rec.products && rec.products[id]) || 1;
      out = {};
      seen.add(id);
      for (const rid in (rec.reactants || {})) {
        const spec = rec.reactants[rid];
        if (spec.catalyst) continue;
        const per = spec.amount / yield_;
        const sub = costOf(rid, seen);
        for (const b in sub) out[b] = (out[b] || 0) + sub[b] * per;
      }
      seen.delete(id);
      if (!Object.keys(out).length) out = { [id]: 1 };
    }
    S.costCache.set(id, out);
    return out;
  }

  function mixCost(mix, base) {
    let total = 0;
    for (const id in mix) {
      const c = costOf(id)[base];
      if (c) total += c * mix[id];
    }
    return total;
  }

  // Reagents that actually cost something in the chosen currency, sorted by how
  // scarce they make a mixture. Used to seed the cost-basis picker.
  function costBases() {
    const seen = new Map();
    for (const id in S.data.reagents) {
      const c = costOf(id);
      for (const b in c) if (c[b] > 0) seen.set(b, (seen.get(b) || 0) + 1);
    }
    const D = chem();
    return [...seen.keys()].filter(b => D && D.reagents[b]).sort();
  }

  // ── init ───────────────────────────────────────────────────────────────────
  async function init() {
    if (S.inited) return;
    S.inited = true;
    const status = $('ordStatus');
    status.textContent = 'Loading ordnance data…';
    try {
      const resp = await fetch('ordnance/' + FORK + '.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      S.data = await resp.json();
      status.textContent = '';
      setupControls();
      // Open on the M15: it is the workhorse casing and the one where the
      // radius-peaks-before-the-power-ceiling effect is most visible.
      S.casing = S.data.casings.RMCM15GrenadeCasing ? 'RMCM15GrenadeCasing'
        : (CASING_ORDER.find(c => S.data.casings[c]) || Object.keys(S.data.casings)[0]);
      S.costBase = costBases().includes('RMCPhoron') ? 'RMCPhoron' : costBases()[0];
      buildCasingSelect();
      buildAddSelect();
      buildCostSelect();
      renderReqList();
      loadMasks();
      renderMaskList();
      if (typeof activeSource !== 'undefined') window.ordnanceForkGate(activeSource);
      presetMix();
      renderAll();
    } catch (e) {
      status.innerHTML = 'Failed to load ordnance data. <button id="ordRetry">Retry</button>';
      const b = $('ordRetry');
      if (b) b.onclick = () => { S.inited = false; init(); };
    }
  }

  // Open on something that already shows the point of the tab rather than an
  // empty casing: the cheap M15 that outranges the maximum-power one.
  function presetMix() {
    const explosives = Object.keys(S.data.reagents).filter(id => S.data.reagents[id].explosive);
    if (explosives.includes('RMCANFO') && explosives.includes('RMCCyclonite')
        && S.casing === 'RMCM15GrenadeCasing') {
      S.mix = { RMCANFO: 144, RMCCyclonite: 36 };
    } else {
      const best = explosives.sort((a, b) => S.data.reagents[b].power - S.data.reagents[a].power)[0];
      if (best) S.mix = { [best]: casingOf().vol };
    }
  }

  function buildCasingSelect() {
    const sel = $('ordCasing');
    sel.innerHTML = '';
    // RMCCasingBase is the shared parent prototype rather than a buildable casing,
    // and the launch tube / mortar shell only hold propellant.
    const skip = new Set(['RMCCasingBase', 'RMC88mmRocketTube', 'RMC80mmMortarShell']);
    const ids = CASING_ORDER.filter(c => S.data.casings[c])
      .concat(Object.keys(S.data.casings).filter(c =>
        !CASING_ORDER.includes(c) && !skip.has(c) && S.data.casings[c].maxP));
    for (const id of ids) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = (CASING_LABEL[id] || id) + ' — ' + S.data.casings[id].vol + 'u';
      sel.appendChild(o);
    }
    sel.value = S.casing;
  }

  function reagentChoices() {
    return Object.keys(S.data.reagents)
      .filter(id => { const D = chem(); return D && D.reagents[id]; })
      .sort((a, b) => rname(a).localeCompare(rname(b)));
  }

  function buildAddSelect() {
    const sel = $('ordAdd');
    sel.innerHTML = '<option value="">Add a reagent…</option>';
    for (const id of reagentChoices()) {
      const o = document.createElement('option');
      o.value = id;
      const s = S.data.reagents[id];
      const tags = [];
      if (s.explosive) tags.push(tr('power') + ' ' + s.power);
      if (s.i) tags.push(tr('fire') + ' ' + (s.i > 0 ? '+' : '') + round(s.i, 2));
      if (id === S.data.formula.ironReagent) tags.push(tr('shrapnel'));
      o.textContent = rname(id) + (tags.length ? '  (' + tags.join(', ') + ')' : '');
      sel.appendChild(o);
    }
  }

  function buildCostSelect() {
    const sel = $('ordCostBase');
    sel.innerHTML = '';
    for (const b of costBases()) {
      const o = document.createElement('option');
      o.value = b;
      o.textContent = rname(b);
      sel.appendChild(o);
    }
    sel.value = S.costBase;
  }

  function setupControls() {
    $('ordCasing').onchange = e => {
      S.casing = e.target.value;
      const cap = casingOf().vol;
      // Re-fit the mixture instead of silently over-filling the new casing.
      const used = volUsed();
      if (used > cap) {
        const k = cap / used;
        for (const id in S.mix) S.mix[id] = Math.floor(S.mix[id] * k);
      }
      track('ordnance_casing', { casing: S.casing });
      renderAll();
    };
    $('ordDampener').onchange = e => { S.dampener = e.target.checked; renderAll(); };
    // Casing capacity and dampening both reshape every cell, so the grid key
    // covers them; nothing else here needs to touch the cache by hand.
    $('ordAdd').onchange = e => {
      const id = e.target.value;
      e.target.value = '';
      if (!id || S.mix[id] != null) return;
      S.mix[id] = Math.min(20, volFree());
      track('ordnance_add', { reagent: id });
      renderAll();
    };
    $('ordFill').onclick = () => {
      const ids = Object.keys(S.mix);
      if (!ids.length) return;
      const share = Math.floor(volFree() / ids.length);
      for (const id of ids) S.mix[id] += share;
      renderAll();
    };
    $('ordClear').onclick = () => { S.mix = {}; renderAll(); };
    $('ordChartMode').onchange = e => { S.chartMode = e.target.value; renderChart(); syncChartControls(); };
    $('ordSweep').onchange = e => { S.sweepId = e.target.value; renderChart(); };
    $('ordBlendA').onchange = e => { S.blendA = e.target.value; renderChart(); };
    $('ordBlendB').onchange = e => { S.blendB = e.target.value; renderChart(); };
    // The pin survives every one of these: it is a mixture, and the whole point
    // of pinning one is to watch the rest of the view change around it.
    const axis = (id, key) => {
      $(id).onchange = e => { S[key] = e.target.value; renderHeat(); };
    };
    axis('ordHeatA', 'heatA');
    axis('ordHeatB', 'heatB');
    // Picking a third reagent is what reveals the "supplied as" control, so this
    // one has to re-sync the control strip and not only redraw.
    $('ordHeatC').onchange = e => {
      S.heatC = e.target.value;
      syncChartControls();
      renderHeat();
    };
    $('ordHeatCMode').onchange = e => {
      S.heatCMode = e.target.value;
      syncChartControls();
      renderHeat();
    };
    $('ordHeatCAmount').oninput = e => {
      S.heatCAmount = +e.target.value;
      $('ordHeatCAmountOut').textContent = S.heatCAmount;
      renderHeat();
    };
    $('ordHeatHeight').onchange = e => { S.heatHeight = e.target.value; renderHeat(); };
    $('ordHeatMetric').onchange = e => { S.heatMetric = e.target.value; renderHeat(); };
    $('ordSurfView').onchange = e => {
      S.surfView = e.target.value;
      track('ordnance_surf_view', { view: S.surfView });
      syncChartControls();
      renderHeat();
    };
    $('ordSurfReset').onclick = () => {
      S.yaw = VIEW.yaw; S.pitch = VIEW.pitch; S.zoom = VIEW.zoom;
      renderHeat();
    };
    $('ordCostBase').onchange = e => { S.costBase = e.target.value; renderHeat(); renderReqResult(); };
    $('ordGalleryRange').onchange = e => {
      S.galleryRange = +e.target.value;
      track('ordnance_gallery_range', { range: S.galleryRange });
      renderGallery();
    };
    $('ordMaskMode').onchange = e => {
      S.maskMode = e.target.value; saveMasks(); renderHeat();
    };
    $('ordMaskAdd').onclick = () => { addMask(); track('ordnance_mask_add'); };
    $('ordMaskClear').onclick = () => {
      S.masks = []; S.maskMode = 'off'; saveMasks();
      $('ordMaskMode').value = 'off';
      renderMaskList(); renderHeat();
    };
    $('ordReqObjective').onchange = e => {
      S.reqObjective = e.target.value;
      // A ladder needs a metric to climb; "lowest cost" has no ceiling to divide.
      const box = $('ordReqLadder');
      box.disabled = S.reqObjective === 'lowestCost';
      if (box.disabled) { box.checked = false; S.reqLadder = false; }
    };
    $('ordReqLadder').onchange = e => { S.reqLadder = e.target.checked; };
    $('ordReqCost').oninput = e => {
      const v = e.target.value.trim();
      S.reqCostLimit = v === '' ? null : Math.max(0, +v);
    };
    $('ordReqAdd').onclick = () => {
      if (S.reqs.length >= 5) return;                 // more than this is unreadable
      S.reqs.push({ metric: 'blastRadius', min: 0 });
      renderReqList();
    };
    $('ordReqRun').onclick = () => {
      const btn = $('ordReqRun');
      btn.disabled = true;
      // One frame so the disabled state paints before the synchronous search.
      requestAnimationFrame(() => {
        S.reqResult = S.reqLadder ? reqLadderRows() : reqSearch(liveSpec());
        track('ordnance_req_search',
              { objective: S.reqObjective, reqs: S.reqs.length, ladder: S.reqLadder ? 1 : 0 });
        renderReqResult();
        btn.disabled = false;
      });
    };
    setupSurfaceInput();
  }

  function track(goal, params) {
    if (typeof window.track === 'function') window.track(goal, params);
  }

  // ── render ─────────────────────────────────────────────────────────────────
  function renderAll() {
    renderMix(); renderStats(); syncChartControls(); renderChart(); renderHeat();
    renderCatalogue(); renderGallery();
  }

  function renderMix() {
    const cap = casingOf().vol, used = volUsed();
    $('ordVolume').textContent = used + ' / ' + cap + 'u';
    $('ordVolume').classList.toggle('ord-over', used > cap);
    const bar = $('ordVolumeBar');
    bar.style.width = Math.min(100, used / cap * 100) + '%';

    const box = $('ordMix');
    const ids = Object.keys(S.mix);
    if (!ids.length) { box.innerHTML = '<p class="ord-empty">Empty casing. Add a reagent to begin.</p>'; return; }
    box.innerHTML = ids.map(id => {
      const s = S.data.reagents[id];
      const max = Math.min(cap, S.mix[id] + volFree());
      const note = [];
      if (s.explosive) note.push(tr('power') + ' ' + s.power + ', ' + tr('falloff') + ' ' + s.falloff);
      if (s.i || s.d || s.r) note.push(tr('fire') + ' ' + round(s.i, 2) + ' / ' + round(s.d, 2) + ' / ' + round(s.r, 3));
      if (s.via) note.push(tr('via') + ' ' + s.via.map(v => v.effect + ' ' + v.potency).join(', '));
      return `<div class="ord-row" data-id="${esc(id)}">
        <div class="ord-row-head">
          <span class="ord-row-name">${esc(rname(id))}</span>
          <input type="number" class="ord-qty" min="0" max="${max}" step="1" value="${S.mix[id]}" aria-label="${esc(rname(id))} amount">
          <button class="ord-del" aria-label="Remove ${esc(rname(id))}">×</button>
        </div>
        <input type="range" class="ord-slider" min="0" max="${max}" step="1" value="${S.mix[id]}" aria-label="${esc(rname(id))} slider">
        <div class="ord-row-note">${esc(note.join(' · '))}</div>
      </div>`;
    }).join('');

    box.querySelectorAll('.ord-row').forEach(row => {
      const id = row.dataset.id;
      const num = row.querySelector('.ord-qty');
      const rng = row.querySelector('.ord-slider');
      const set = v => {
        const cap2 = casingOf().vol;
        const other = volUsed() - S.mix[id];
        S.mix[id] = clamp(Math.round(v) || 0, 0, cap2 - other);
        num.value = S.mix[id]; rng.value = S.mix[id];
        renderStats(); renderChart(); renderHeat(); renderGallery();
        $('ordVolume').textContent = volUsed() + ' / ' + cap2 + 'u';
        $('ordVolumeBar').style.width = Math.min(100, volUsed() / cap2 * 100) + '%';
      };
      num.oninput = () => set(+num.value);
      rng.oninput = () => set(+rng.value);
      rng.onchange = () => renderMix();
      row.querySelector('.ord-del').onclick = () => { delete S.mix[id]; renderAll(); };
    });
  }

  function renderStats() {
    const c = casingOf();
    const st = computeStats(S.mix, c, S.dampener);
    const dmg = st.power * S.data.formula.damagePerIntensity / S.data.formula.intensityDivisor;
    const cards = [];
    const card = (label, value, note) =>
      `<div class="ord-card"><div class="ord-card-l">${esc(label)}</div>
       <div class="ord-card-v">${esc(value)}</div>
       <div class="ord-card-n">${note ? esc(note) : ''}</div></div>`;

    cards.push(card('Power', round(st.power, 1),
      (st.power >= c.maxP ? tr('at casing ceiling') : tr('ceiling')) + ' ' + c.maxP));
    cards.push(card('Falloff', round(st.falloff, 1),
      st.falloff <= c.minF ? tr('at floor') + ' ' + c.minF
        : tr('base') + ' ' + c.base + (S.dampener ? ', ' + tr('dampened') : '')));
    cards.push(card('Blast radius',
      st.hasBlast ? round(st.blastRadius, 2) + ' ' + tr('tiles') : tr('no blast'),
      st.hasBlast ? '' : tr('radius ≤ 1: shrapnel and fire still fire')));
    cards.push(card('Peak damage', round(dmg, 0), tr('blunt + burn at the centre')));
    cards.push(card('Shrapnel', st.shards,
      (st.shards >= c.shards ? tr('at casing cap') : tr('cap')) + ' ' + c.shards));
    cards.push(card('Fire', st.fireIntensity
      ? round(st.fireIntensity, 1) + ' / ' + st.reach + ' / ' + round(st.fireDuration, 0) + 's'
      : 'none',
      st.fireIntensity ? (st.star ? tr('star — rays') + ' ' + st.reach + ' ' + tr('tiles') : tr('diamond')) : ''));

    let flame = '';
    if (st.flame) {
      flame = `<span class="ord-flame" style="background:${esc(st.flame)}"></span>`;
    }
    $('ordStats').innerHTML = cards.join('');
    $('ordFlame').innerHTML = st.flame
      ? flame + '<span>' + tr('Flame colour') + ' ' + esc(st.flame) + '</span>'
      : '<span class="ord-card-n">No coloured flame</span>';

    const cost = mixCost(S.mix, S.costBase);
    $('ordCost').textContent = round(cost, 1) + ' ' + rname(S.costBase);
  }

  // ── charts (plain canvas — the app ships no charting dependency) ───────────
  function ctxOf(id) {
    const cv = $(id);
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 600, h = cv.clientHeight || 240;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  const cssVar = n => getComputedStyle(document.body).getPropertyValue(n).trim();

  function syncChartControls() {
    const ids = reagentChoices();
    const fill = (sel, cur, fallback) => {
      const el = $(sel);
      el.innerHTML = ids.map(id => `<option value="${esc(id)}">${esc(rname(id))}</option>`).join('');
      el.value = (cur && ids.includes(cur)) ? cur : (ids.includes(fallback) ? fallback : ids[0]);
      return el.value;
    };
    const inMix = Object.keys(S.mix);
    S.sweepId = fill('ordSweep', S.sweepId, inMix[0]);
    // Two reagents in the casing already answer "what does trading A for B buy",
    // so blend those; otherwise fall back to the cheap/strong pair.
    S.blendA = fill('ordBlendA', S.blendA, inMix.length > 1 ? inMix[0] : 'RMCANFO');
    S.blendB = fill('ordBlendB', S.blendB, inMix.length > 1 ? inMix[1] : 'RMCCyclonite');
    S.heatA = fill('ordHeatA', S.heatA, S.blendA);
    S.heatB = fill('ordHeatB', S.heatB, S.blendB);

    // The third reagent takes whatever the first two leave, so "none" is a real
    // choice: it turns the surface back into a two-reagent map with a part-empty
    // casing, which is what the flat view showed before this existed.
    const cSel = $('ordHeatC');
    cSel.innerHTML = '<option value="">Leave empty</option>'
      + ids.map(id => `<option value="${esc(id)}">${esc(rname(id))}</option>`).join('');
    if (S.heatC && !ids.includes(S.heatC)) S.heatC = NONE;
    cSel.value = S.heatC;

    const cap = casingOf().vol;
    const amt = $('ordHeatCAmount');
    amt.max = cap;
    if (S.heatCAmount > cap) S.heatCAmount = cap;
    amt.value = S.heatCAmount;
    $('ordHeatCAmountOut').textContent = S.heatCAmount;
    $('ordHeatCModeWrap').hidden = !S.heatC;
    $('ordHeatCAmountWrap').hidden = !S.heatC || S.heatCMode !== 'fixed';

    $('ordHeatHeight').value = S.heatHeight;
    $('ordHeatMetric').value = S.heatMetric;
    $('ordSurfView').value = S.surfView;
    $('ordHeightWrap').hidden = S.surfView !== '3d';
    $('ordSurfReset').hidden = S.surfView !== '3d';
    // Masks are a flat-map tool: stacking translucent regions on a shaded 3D
    // surface reads as mud, and the point is to compare regions, not relief.
    $('ordMaskBlock').hidden = S.surfView !== 'flat';
    $('ordMaskMode').value = S.maskMode;
    $('ordSweepWrap').hidden = S.chartMode !== 'sweep';
    $('ordBlendWrap').hidden = S.chartMode !== 'blend';
  }

  function chartSeries() {
    const c = casingOf(), cap = c.vol;
    const pts = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      let mix, x;
      if (S.chartMode === 'sweep') {
        const q = Math.round(cap * i / steps);
        mix = Object.assign({}, S.mix);
        delete mix[S.sweepId];
        const rest = Object.values(mix).reduce((a, b) => a + b, 0);
        mix[S.sweepId] = Math.max(0, Math.min(q, cap - rest));
        x = mix[S.sweepId];
      } else {
        const b = Math.round(cap * i / steps);
        mix = {};
        if (cap - b > 0) mix[S.blendA] = cap - b;
        if (b > 0) mix[S.blendB] = b;
        x = b;
      }
      const st = computeStats(mix, c, S.dampener);
      pts.push({ x, power: st.power, radius: st.hasBlast ? st.blastRadius : 0,
                 cost: mixCost(mix, S.costBase), mix });
    }
    return pts;
  }

  function renderChart() {
    if (!S.data) return;
    const { ctx, w, h } = ctxOf('ordChart');
    const pts = chartSeries();
    const pad = { l: 46, r: 46, t: 14, b: 30 };
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const maxX = Math.max(...pts.map(p => p.x)) || 1;
    const maxP = Math.max(...pts.map(p => p.power)) || 1;
    const maxR = Math.max(...pts.map(p => p.radius)) || 1;
    const ink = cssVar('--text-bright') || '#e8ecf4';
    const muted = cssVar('--text-ghost') || '#6b7a93';
    const line = cssVar('--border-subtle') || '#1a2540';
    const cPower = cssVar('--phosphor') || '#39ff85';
    const cRadius = cssVar('--amber') || '#ffb627';

    ctx.strokeStyle = line; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ih * i / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iw, y); ctx.stroke();
    }
    const X = v => pad.l + iw * v / maxX;
    S.chartGeom = { padL: pad.l, iw, maxX, pts };   // for click-to-inspect
    const Yp = v => pad.t + ih * (1 - v / maxP);
    const Yr = v => pad.t + ih * (1 - v / maxR);

    const draw = (get, colour, dash) => {
      ctx.beginPath(); ctx.setLineDash(dash || []); ctx.strokeStyle = colour; ctx.lineWidth = 2;
      pts.forEach((p, i) => { const x = X(p.x), y = get(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
    };
    draw(p => Yp(p.power), cPower);
    draw(p => Yr(p.radius), cRadius, [5, 4]);

    // Mark the radius peak — the whole reason this chart exists.
    const peak = pts.reduce((a, b) => b.radius > a.radius ? b : a, pts[0]);
    if (peak.radius > 0) {
      ctx.fillStyle = cRadius;
      ctx.beginPath(); ctx.arc(X(peak.x), Yr(peak.radius), 4, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = muted; ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ih * i / 4;
      ctx.fillText(round(maxP * (1 - i / 4), 0), pad.l - 6, y + 4);
    }
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ih * i / 4;
      ctx.fillText(round(maxR * (1 - i / 4), 1), pad.l + iw + 6, y + 4);
    }
    ctx.textAlign = 'center'; ctx.fillStyle = ink;
    ctx.fillText('0', pad.l, h - 10);
    ctx.fillText(String(maxX), pad.l + iw, h - 10);
    const xlabel = S.chartMode === 'sweep'
      ? rname(S.sweepId) + ', units'
      : rname(S.blendB) + ' share of a full casing, units';
    ctx.fillText(xlabel, pad.l + iw / 2, h - 10);

    const legend = [];
    legend.push('<span class="ord-key"><i style="background:' + cPower + '"></i>Power</span>');
    legend.push('<span class="ord-key"><i class="ord-dash" style="background:' + cRadius + '"></i>Blast radius</span>');
    if (peak.radius > 0) {
      legend.push('<span class="ord-key-note">' + tr('Radius peaks at') + ' ' + round(peak.radius, 2)
        + ' ' + tr('tiles') + ' ' + tr('with') + ' ' + esc(describeMix(peak.mix)) + ' — '
        + round(peak.power, 0) + ' ' + tr('power') + ', '
        + round(peak.cost, 1) + ' ' + esc(rname(S.costBase)) + '</span>');
    }
    $('ordChartLegend').innerHTML = legend.join('');
  }

  function describeMix(mix) {
    return Object.keys(mix).filter(id => mix[id] > 0)
      .map(id => mix[id] + ' ' + rname(id)).join(' + ') || tr('nothing');
  }

  // ── mixture surface ────────────────────────────────────────────────────────
  // Two reagents span the floor (x = across, y = up) and a third fills whatever
  // the pair leaves, so a three-part mixture is one point on a surface. The
  // domain is the triangle a + b <= capacity; outside it there is no mixture.
  // How much of the casing the floor axes may use. With the third reagent set to
  // a fixed amount it reserves its share up front, so the accessible triangle
  // shrinks as the slider rises — that shrinking IS the third dimension.
  function floorLimit(cap) {
    if (S.heatC && S.heatCMode === 'fixed') return Math.max(0, cap - S.heatCAmount);
    return cap;
  }

  function mixAt(a, b, cap) {
    const mix = {};
    if (a > 0) mix[S.heatA] = (mix[S.heatA] || 0) + a;
    if (b > 0) mix[S.heatB] = (mix[S.heatB] || 0) + b;
    if (S.heatC) {
      // Filling the remainder makes the amount a function of the floor position,
      // which is why it cannot also be the height: c = cap - a - b is a plane.
      const c = S.heatCMode === 'fixed' ? S.heatCAmount : cap - a - b;
      if (c > 0) mix[S.heatC] = (mix[S.heatC] || 0) + c;
    }
    return mix;
  }

  function surfaceGrid() {
    // Turning the camera does not change a single mixture, so the sampled grid
    // is cached against everything that would: rotation then costs a projection
    // and a sort instead of N*N runs of the formula.
    const key = [S.casing, S.dampener, S.heatA, S.heatB, S.heatC,
                 S.heatCMode, S.heatCAmount,
                 S.heatMetric, S.heatHeight, S.surfView].join('|');
    if (S.gridCache && S.gridCache.key === key) return S.gridCache.grid;
    const grid = buildGrid();
    S.gridCache = { key, grid };
    return grid;
  }

  function buildGrid() {
    const c = casingOf(), cap = c.vol;
    const F = S.data.formula;
    const dmgPer = F.damagePerIntensity / F.intensityDivisor;
    // The 3D mesh can afford a fine grid because it is cached; the staircase
    // along the a + b = capacity edge is what a square grid over a triangular
    // domain looks like, and it stops reading as one at this density.
    const N = S.surfView === '3d' ? 46 : 48;
    const colour = METRICS[S.heatMetric], height = METRICS[S.heatHeight];
    const cells = new Array(N * N).fill(null);
    const limit = floorLimit(cap);
    let cLo = Infinity, cHi = -Infinity, hLo = Infinity, hHi = -Infinity, best = null;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        // Sampled against the casing, not the limit, so the floor keeps a fixed
        // scale and a rising third reagent visibly eats into it.
        const a = Math.round(cap * i / (N - 1)), b = Math.round(cap * j / (N - 1));
        if (a + b > limit) continue;
        const mix = mixAt(a, b, cap);
        const st = computeStats(mix, c, S.dampener);
        const cv = colour.get(st, dmgPer), hv = height.get(st, dmgPer);
        cells[i * N + j] = { i, j, a, b, mix, st, cv, hv };
        if (cv < cLo) cLo = cv;
        if (cv > cHi) cHi = cv;
        if (hv < hLo) hLo = hv;
        if (hv > hHi) hHi = hv;
        if (!best || cv > best.cv) best = cells[i * N + j];
      }
    }
    // A metric that is identical everywhere carries no shape. Say so, rather than
    // normalising it to zero and painting the whole surface the darkest stop.
    const flatColour = !isFinite(cLo) || cHi === cLo;
    const flatHeight = !isFinite(hLo) || hHi === hLo;
    if (!isFinite(cLo)) { cLo = 0; cHi = 1; }
    if (cHi === cLo) cHi = cLo + 1;
    if (!isFinite(hLo)) { hLo = 0; hHi = 1; }
    if (hHi === hLo) hHi = hLo + 1;
    return { N, cells, cLo, cHi, hLo, hHi, cap, best, flatColour, flatHeight };
  }

  function renderHeat() {
    if (!S.data) return;
    const g = surfaceGrid();
    if (S.surfView === '3d') renderSurface3D(g); else renderFlat(g);
    renderMaskRanges(g);
    renderScale(g);
    renderHeatNote(g);
    renderPick();
  }

  // Camera: yaw turns the floor, pitch tilts it. Screen up is (0, sin p, cos p)
  // and depth runs along (0, cos p, -sin p), so quads sort back-to-front by
  // descending depth — a painter's pass, which is enough for a height field.
  // Fit the model's bounding box to the canvas for whatever the camera is doing
  // right now. A fixed scale looks right at the default angle and then runs off
  // the edge as soon as the surface is turned.
  function projector(w, h, zoom) {
    const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
    const cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    // Only three floor corners exist: a + b <= capacity rules the fourth out, and
    // including it would shrink the drawing for a region with no mixtures in it.
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5]]) {
      for (const z of [0, ZH]) {
        const px = x * cy - y * sy;
        const py = -((x * sy + y * cy) * sp + z * cp);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
    // Axis labels hang below the floor, so the bottom margin is the larger one.
    const padX = 30, padTop = 18, padBottom = 42;
    const boxH = h - padTop - padBottom;
    const s = Math.min((w - padX * 2) / Math.max(maxX - minX, 1e-3),
                       boxH / Math.max(maxY - minY, 1e-3)) * zoom;
    // project() computes screen y as cy + (-(ry*sp + z*cp)) * s, so the centring
    // term is subtracted here exactly as it is for x.
    return {
      cx: w / 2 - (minX + maxX) / 2 * s,
      cy: padTop + boxH / 2 - (minY + maxY) / 2 * s,
      s,
    };
  }
  function project(x, y, z, o) {
    const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
    const rx = x * cy - y * sy, ry = x * sy + y * cy;
    const cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
    return {
      x: o.cx + rx * o.s,
      y: o.cy - (ry * sp + z * cp) * o.s,
      depth: ry * cp - z * sp,
    };
  }

  const ZH = 0.55;   // surface height as a fraction of the floor span
  function modelOf(cell, g) {
    return {
      x: cell.a / g.cap - 0.5,
      y: cell.b / g.cap - 0.5,
      z: (cell.hv - g.hLo) / (g.hHi - g.hLo) * ZH,
    };
  }

  function renderSurface3D(g) {
    const { ctx, w, h } = ctxOf('ordHeat');
    const o = projector(w, h, S.zoom);
    const N = g.N;
    const muted = cssVar('--text-ghost') || '#6b7a93';
    const line = cssVar('--border-subtle') || '#1a2540';

    // Floor: the triangle the mixtures actually live on.
    const floor = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5]].map(pt => project(pt[0], pt[1], 0, o));
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(floor[0].x, floor[0].y);
    ctx.lineTo(floor[1].x, floor[1].y);
    ctx.lineTo(floor[2].x, floor[2].y);
    ctx.closePath(); ctx.stroke();

    const quads = [];
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < N - 1; j++) {
        const c00 = g.cells[i * N + j], c10 = g.cells[(i + 1) * N + j];
        const c11 = g.cells[(i + 1) * N + j + 1], c01 = g.cells[i * N + j + 1];
        if (!c00 || !c10 || !c11 || !c01) continue;
        const m = [c00, c10, c11, c01].map(c => modelOf(c, g));
        const pr = m.map(v => project(v.x, v.y, v.z, o));
        // Model-space normal for shading; the height axis is exaggerated by ZH
        // so the relief stays readable on shallow surfaces.
        const e1 = [m[1].x - m[0].x, m[1].y - m[0].y, m[1].z - m[0].z];
        const e2 = [m[3].x - m[0].x, m[3].y - m[0].y, m[3].z - m[0].z];
        let nx = e1[1] * e2[2] - e1[2] * e2[1];
        let ny = e1[2] * e2[0] - e1[0] * e2[2];
        let nz = e1[0] * e2[1] - e1[1] * e2[0];
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const lit = clamp(0.62 + 0.38 * (nx * -0.35 + ny * -0.45 + nz * 0.82), 0.5, 1.08);
        quads.push({
          pr,
          // All four corners in the same order as pr. A quad is a facet between
          // four mixtures, so a click has to resolve to the nearest of them; the
          // origin corner alone always lands on the low side of a rising slope,
          // which put every pick at the foot of a peak instead of its top.
          ij: [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]],
          depth: (pr[0].depth + pr[1].depth + pr[2].depth + pr[3].depth) / 4,
          cv: (c00.cv + c10.cv + c11.cv + c01.cv) / 4,
          lit,
        });
      }
    }
    quads.sort((a, b) => b.depth - a.depth);

    S.surfCells = quads;
    ctx.lineJoin = 'round';
    for (const q of quads) {
      const rgb = rampRGB(g.flatColour ? 0.62 : (q.cv - g.cLo) / (g.cHi - g.cLo));
      ctx.fillStyle = 'rgb(' + rgb.map(v => Math.round(v * q.lit)).join(',') + ')';
      ctx.beginPath();
      ctx.moveTo(q.pr[0].x, q.pr[0].y);
      for (let k = 1; k < 4; k++) ctx.lineTo(q.pr[k].x, q.pr[k].y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke();
    }

    if (g.best) markPoint3D(ctx, g.best, g, o, cssVar('--amber') || '#ffb627', false);
    const pinned = pickCell(g);
    if (pinned) {
      const cell = g.cells[pinned.i * g.N + pinned.j];
      if (cell) markPoint3D(ctx, cell, g, o, cssVar('--text-bright') || '#e8ecf4', true);
    }

    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    label3D(ctx, project(0.5, -0.5, 0, o), rname(S.heatA));
    label3D(ctx, project(-0.5, 0.5, 0, o), rname(S.heatB));
    if (S.heatC) label3D(ctx, project(-0.5, -0.5, 0, o), rname(S.heatC));
  }

  function label3D(ctx, p, text) {
    ctx.fillText(text, p.x, p.y + 14);
  }

  // A stem from the floor to the surface reads as a position in space far better
  // than a dot floating on the shell.
  function markPoint3D(ctx, cell, g, o, colour, big) {
    const m = modelOf(cell, g);
    const top = project(m.x, m.y, m.z, o);
    const base = project(m.x, m.y, 0, o);
    ctx.strokeStyle = colour; ctx.lineWidth = big ? 1.6 : 1;
    ctx.setLineDash(big ? [] : [3, 3]);
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.arc(top.x, top.y, big ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
  }

  function renderFlat(g) {
    const { ctx, w, h } = ctxOf('ordHeat');
    const N = g.N, pad = { l: 40, r: 12, t: 10, b: 28 };
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const cw = iw / N, ch = ih / N;
    S.surfCells = { pad, cw, ch, ih, N };
    const useMasks = masksLive();
    const ranges = useMasks ? maskRanges(g) : null;
    // Cells that qualify for nothing must stay a shade above the page, or in
    // intersection mode the domain vanishes and the surviving region floats with
    // no frame of reference.
    const miss = 'rgb(26,34,33)';
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const cell = g.cells[i * N + j];
        if (!cell) continue;
        let fill;
        if (useMasks) {
          const rgb = maskColourFor(cell, g, ranges);
          // Cells that qualify for nothing stay as a dim ghost, so the shape of
          // the domain is still legible around the highlighted regions.
          fill = rgb ? 'rgb(' + rgb.map(v => Math.round(v)).join(',') + ')' : miss;
        } else {
          fill = 'rgb(' + rampRGB(g.flatColour ? 0.62 : (cell.cv - g.cLo) / (g.cHi - g.cLo)).join(',') + ')';
        }
        ctx.fillStyle = fill;
        ctx.fillRect(pad.l + i * cw, pad.t + ih - (j + 1) * ch, cw + 0.5, ch + 0.5);
      }
    }
    const box = (cell, colour, lw) => {
      ctx.strokeStyle = colour; ctx.lineWidth = lw;
      ctx.strokeRect(pad.l + cell.i * cw - 1, pad.t + ih - (cell.j + 1) * ch - 1, cw + 2, ch + 2);
    };
    if (g.best) box(g.best, cssVar('--amber') || '#ffb627', 1.5);
    const pinned = pickCell(g);
    if (pinned) box({ i: pinned.i, j: pinned.j }, cssVar('--text-bright') || '#e8ecf4', 2);
    const muted = cssVar('--text-ghost') || '#6b7a93';
    ctx.fillStyle = muted; ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rname(S.heatA) + ' \u2192', pad.l + iw / 2, h - 8);
    ctx.save();
    ctx.translate(12, pad.t + ih / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
    ctx.fillText(rname(S.heatB) + ' \u2192', 0, 0);
    ctx.restore();
  }

  // ── value masks ────────────────────────────────────────────────────────────
  // A mask is a metric with a threshold. Each gets its own hue and is drawn at an
  // intensity proportional to how far past the threshold a cell sits, so a region
  // reads as "good" rather than merely "passing". Drawn additively, overlapping
  // masks brighten and blend, which is the picture of where several requirements
  // hold at once. Intersection mode hides every cell that fails any of them.
  const MASK_COLOURS = ['#39ff85', '#00e5ff', '#ffb627', '#c17aff', '#ff3d5a'];
  const MASK_STORE = 'chemdb-ord-masks';

  function loadMasks() {
    try {
      const raw = localStorage.getItem(MASK_STORE);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved.masks)) return;
      S.masks = saved.masks.filter(m => METRICS[m.metric]).slice(0, MASK_COLOURS.length);
      if (['off', 'overlay', 'intersect'].includes(saved.mode)) S.maskMode = saved.mode;
    } catch (e) { /* private mode, or a shape from an older build */ }
  }
  function saveMasks() {
    try {
      localStorage.setItem(MASK_STORE, JSON.stringify({ masks: S.masks, mode: S.maskMode }));
    } catch (e) { /* storage blocked; masks just will not survive a reload */ }
  }

  const activeMasks = () => S.masks.filter(m => m.on !== false);
  const masksLive = () => S.maskMode !== 'off' && S.surfView === 'flat' && activeMasks().length > 0;

  // Range of each masked metric across the current domain, so a threshold can be
  // read as a position between the worst and best mixture on screen.
  function maskRanges(g) {
    const F = S.data.formula;
    const dmgPer = F.damagePerIntensity / F.intensityDivisor;
    const out = {};
    for (const m of S.masks) {
      if (out[m.metric]) continue;
      let lo = Infinity, hi = -Infinity;
      for (const cell of g.cells) {
        if (!cell) continue;
        const v = METRICS[m.metric].get(cell.st, dmgPer);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      out[m.metric] = isFinite(lo) ? [lo, hi] : [0, 1];
    }
    return out;
  }

  // 0 when the cell fails the mask, otherwise 0.35..1 by how far past it sits.
  // The floor matters: a cell that only just qualifies still has to be visible.
  function maskIntensity(mask, value, range) {
    const [lo, hi] = range;
    if (mask.op === 'lte') {
      if (value > mask.value) return 0;
      const span = Math.max(mask.value - lo, 1e-6);
      return 0.35 + 0.65 * clamp((mask.value - value) / span, 0, 1);
    }
    if (value < mask.value) return 0;
    const span = Math.max(hi - mask.value, 1e-6);
    return 0.35 + 0.65 * clamp((value - mask.value) / span, 0, 1);
  }

  function maskColourFor(cell, g, ranges) {
    const F = S.data.formula;
    const dmgPer = F.damagePerIntensity / F.intensityDivisor;
    let r = 0, gr = 0, b = 0, hits = 0;
    for (const m of activeMasks()) {
      const v = METRICS[m.metric].get(cell.st, dmgPer);
      const k = maskIntensity(m, v, ranges[m.metric] || [0, 1]);
      if (k <= 0) {
        if (S.maskMode === 'intersect') return null;   // fails one, so it is out
        continue;
      }
      hits++;
      const rgb = hexToRgb(m.colour) || [255, 255, 255];
      r += rgb[0] * k; gr += rgb[1] * k; b += rgb[2] * k;
    }
    if (!hits) return null;
    return [Math.min(255, r), Math.min(255, gr), Math.min(255, b)];
  }

  function renderMaskList() {
    const box = $('ordMaskList');
    // Nothing but the add button until there is something to show: the header,
    // the mode picker and an empty-state paragraph were pure furniture.
    const any = S.masks.length > 0;
    $('ordMaskCap').hidden = !any;
    $('ordMaskMode').hidden = !any;
    $('ordMaskClear').hidden = !any;
    if (!S.masks.length) { box.innerHTML = ''; return; }
    const opts = sel => Object.keys(METRICS)
      .map(k => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(mlabel(k))}</option>`)
      .join('');
    box.innerHTML = S.masks.map((m, idx) => `<div class="ord-mask-row" data-idx="${idx}">
      <input type="checkbox" class="ord-mask-on"${m.on === false ? '' : ' checked'}
             aria-label="Enable mask">
      <span class="ord-mask-swatch" style="background:${esc(m.colour)}"></span>
      <select class="ord-mask-metric" aria-label="Mask metric">${opts(m.metric)}</select>
      <select class="ord-mask-op" aria-label="Mask comparison">
        <option value="gte"${m.op === 'gte' ? ' selected' : ''}>&ge;</option>
        <option value="lte"${m.op === 'lte' ? ' selected' : ''}>&le;</option>
      </select>
      <input type="number" class="ord-mask-value" step="0.1" value="${esc(m.value)}"
             aria-label="Mask threshold">
      <span class="ord-mask-range" data-metric="${esc(m.metric)}"></span>
      <button class="ord-mask-del" aria-label="Remove mask">&times;</button>
    </div>`).join('');

    box.querySelectorAll('.ord-mask-row').forEach(row => {
      const idx = +row.dataset.idx;
      const touch = () => { saveMasks(); renderHeat(); };
      row.querySelector('.ord-mask-on').onchange = e => { S.masks[idx].on = e.target.checked; touch(); };
      row.querySelector('.ord-mask-metric').onchange = e => {
        S.masks[idx].metric = e.target.value; touch(); renderMaskList();
      };
      row.querySelector('.ord-mask-op').onchange = e => { S.masks[idx].op = e.target.value; touch(); };
      row.querySelector('.ord-mask-value').oninput = e => {
        S.masks[idx].value = +e.target.value || 0; touch();
      };
      row.querySelector('.ord-mask-del').onclick = () => {
        S.masks.splice(idx, 1); saveMasks(); renderMaskList(); renderHeat();
      };
    });
  }

  // Fill in the observed range beside each threshold, once the grid is known.
  function renderMaskRanges(g) {
    if (!S.masks.length) return;
    const ranges = maskRanges(g);
    $('ordMaskList').querySelectorAll('.ord-mask-range').forEach(el => {
      const r = ranges[el.dataset.metric];
      el.textContent = r ? round(r[0], 2) + ' \u2026 ' + round(r[1], 2) : '';
    });
  }

  // A new mask opens at the midpoint of its metric's current range, which is a
  // threshold that actually shows something instead of an empty screen.
  function addMask() {
    if (S.masks.length >= MASK_COLOURS.length) return;
    const g = surfaceGrid();
    const metric = S.heatMetric;
    const ranges = maskRanges({ cells: g.cells });
    const F = S.data.formula;
    const dmgPer = F.damagePerIntensity / F.intensityDivisor;
    let lo = Infinity, hi = -Infinity;
    for (const cell of g.cells) {
      if (!cell) continue;
      const v = METRICS[metric].get(cell.st, dmgPer);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    S.masks.push({
      metric, op: 'gte', value: round(lo + (hi - lo) * 0.6, 2),
      colour: MASK_COLOURS[S.masks.length % MASK_COLOURS.length], on: true,
    });
    if (S.maskMode === 'off') S.maskMode = 'overlay';
    $('ordMaskMode').value = S.maskMode;
    saveMasks();
    renderMaskList();
    renderHeat();
  }

  // The ramp is normalised to whatever the current view spans, so the same green
  // can mean 0 in one view and 8 in the next. Without this strip the colours are
  // not readable as values at all.
  function renderScale(g) {
    const box = $('ordScale');
    const colour = METRICS[S.heatMetric];
    const swatch = k => 'rgb(' + rampRGB(k).join(',') + ')';

    if (masksLive()) {
      box.innerHTML = '<div class="ord-scale-row"><span class="ord-scale-cap">'
        + esc(tr(S.maskMode === 'intersect' ? 'Intersection of' : 'Masks')) + '</span></div>'
        + '<div class="ord-mask-legend">'
        + activeMasks().map(m => '<span class="ord-mask-key">'
            + '<i style="background:' + esc(m.colour) + '"></i>'
            + esc(mlabel(m.metric)) + ' ' + (m.op === 'lte' ? '\u2264' : '\u2265') + ' '
            + esc(round(m.value, 2)) + '</span>').join('')
        + '</div>';
      return;
    }

    if (g.flatColour) {
      box.innerHTML = '<div class="ord-scale-row">'
        + '<span class="ord-scale-cap">' + esc(tr('Colour')) + ' \u00b7 '
        + esc(mlabel(S.heatMetric)) + '</span>'
        + '<span class="ord-scale-flat" style="background:' + swatch(0.62) + '"></span>'
        + '<span class="ord-scale-const">' + esc(tr('same everywhere')) + ': '
        + esc(round(g.cLo, 2)) + '</span></div>' + heightRow(g);
      return;
    }
    const stops = [];
    for (let k = 0; k <= 8; k++) stops.push(swatch(k / 8) + ' ' + (k / 8 * 100).toFixed(0) + '%');
    const mid = (g.cLo + g.cHi) / 2;
    box.innerHTML = '<div class="ord-scale-row">'
      + '<span class="ord-scale-cap">' + esc(tr('Colour')) + ' \u00b7 '
      + esc(mlabel(S.heatMetric)) + '</span>'
      + '<span class="ord-scale-bar" style="background:linear-gradient(to right,'
      + stops.join(',') + ')"></span></div>'
      + '<div class="ord-scale-ticks"><span>' + esc(round(g.cLo, 2)) + '</span>'
      + '<span>' + esc(round(mid, 2)) + '</span>'
      + '<span>' + esc(round(g.cHi, 2)) + '</span></div>'
      + heightRow(g);
  }

  // In 3D the vertical axis is normalised the same way and deserves the same note.
  function heightRow(g) {
    if (S.surfView !== '3d') return '';
    const height = METRICS[S.heatHeight];
    return '<div class="ord-scale-row ord-scale-height">'
      + '<span class="ord-scale-cap">' + esc(tr('Height')) + ' \u00b7 '
      + esc(mlabel(S.heatHeight)) + '</span>'
      + '<span class="ord-scale-range">'
      + (g.flatHeight ? esc(tr('same everywhere')) + ': ' + esc(round(g.hLo, 2))
                      : esc(round(g.hLo, 2)) + ' \u2026 ' + esc(round(g.hHi, 2)))
      + '</span></div>';
  }

  function renderHeatNote(g) {
    // With masks up, the colour metric is not what is on screen, so reporting
    // its best would name a mixture nowhere near the highlighted region.
    if (masksLive()) { renderMaskNote(g); return; }
    const metric = METRICS[S.heatMetric];
    if (!g.best) { $('ordHeatNote').textContent = ''; return; }
    if (g.flatColour) {
      $('ordHeatNote').innerHTML = esc(mlabel(S.heatMetric)) + ' '
        + esc(tr('is the same across every mixture here')) + ': '
        + esc(round(g.best.cv, 2));
      return;
    }
    $('ordHeatNote').innerHTML = tr('Best') + ' ' + esc(tr(METRICS[S.heatMetric].label.toLowerCase())) + ': '
      + esc(round(g.best.cv, 2)) + ' ' + tr('at') + ' ' + esc(describeMix(g.best.mix))
      + ' <button class="ord-chip" id="ordHeatUse">Load this mix</button>';
    const btn = $('ordHeatUse');
    if (btn) btn.onclick = () => { S.mix = g.best.mix; track('ordnance_heat_use'); renderAll(); };
  }

  // How much of the domain survives, and the single best mixture inside it. The
  // ranking is the summed mask intensity, so the winner is the point that clears
  // every threshold by the widest margin rather than one that scrapes past.
  function renderMaskNote(g) {
    const F = S.data.formula;
    const dmgPer = F.damagePerIntensity / F.intensityDivisor;
    const ranges = maskRanges(g);
    const list = activeMasks();
    let total = 0, kept = 0, best = null, bestScore = -1;
    for (const cell of g.cells) {
      if (!cell) continue;
      total++;
      let score = 0, all = true;
      for (const m of list) {
        const k = maskIntensity(m, METRICS[m.metric].get(cell.st, dmgPer), ranges[m.metric] || [0, 1]);
        if (k <= 0) { all = false; break; }
        score += k;
      }
      if (!all) continue;
      kept++;
      if (score > bestScore) { bestScore = score; best = cell; }
    }
    const share = total ? Math.round(kept / total * 100) : 0;
    if (!kept) {
      $('ordHeatNote').innerHTML = '<span class="ord-key-note">'
        + esc(tr('No mixture here clears every mask.')) + '</span>';
      return;
    }
    $('ordHeatNote').innerHTML = '<span class="ord-key-note">'
      + esc(kept) + ' ' + esc(tr('of')) + ' ' + esc(total) + ' '
      + esc(tr('mixtures clear every mask')) + ' (' + share + '%)</span> '
      + esc(tr('Best')) + ': ' + esc(describeMix(best.mix))
      + ' <button class="ord-chip" id="ordHeatUse">Load this mix</button>';
    const btn = $('ordHeatUse');
    if (btn) btn.onclick = () => { S.mix = best.mix; track('ordnance_mask_use'); renderAll(); };
  }

  // ── click readout ──────────────────────────────────────────────────────────
  // The colour metric answers one question; a picked point should answer all of
  // them, so this lists every stat the detonation panel shows plus the cost.
  function renderPick() {
    const box = $('ordPick');
    if (!S.pick || !S.pick.mix) {
      box.innerHTML = '<p class="ord-empty">Click a point on the surface to inspect that mixture.</p>';
      return;
    }
    const mix = S.pick.mix;
    const c = casingOf();
    // Recomputed on every render, so the pinned mixture tracks the casing, the
    // dampener and the chosen metric instead of showing what it was when clicked.
    const st = computeStats(mix, c, S.dampener);
    const F = S.data.formula;
    const dmg = st.power * F.damagePerIntensity / F.intensityDivisor;
    const colourMetric = METRICS[S.heatMetric];
    const dmgPer = F.damagePerIntensity / F.intensityDivisor;
    const rows = [
      [tr('power'), round(st.power, 1) + (st.power >= c.maxP ? ' \u2022 ' + tr('at casing ceiling') : '')],
      [tr('falloff'), round(st.falloff, 1) + (st.falloff <= c.minF ? ' \u2022 ' + tr('at floor') : '')],
      [tr('blast radius'), st.hasBlast ? round(st.blastRadius, 2) + ' ' + tr('tiles') : tr('no blast')],
      [tr('peak damage'), round(dmg, 0)],
      [tr('shrapnel'), st.shards + (st.shards >= c.shards ? ' \u2022 ' + tr('at casing cap') : '')],
      [tr('fire intensity'), st.fireIntensity ? round(st.fireIntensity, 1) : '\u2014'],
      [tr('fire reach'), st.fireIntensity ? st.reach + ' ' + tr('tiles')
        + (st.star ? ' \u2022 ' + tr('star \u2014 rays') : ' \u2022 ' + tr('diamond')) : '\u2014'],
      [tr('burn time'), st.fireDuration ? round(st.fireDuration, 0) + 's' : '\u2014'],
      ['Logistics cost', round(mixCost(mix, S.costBase), 1) + ' ' + rname(S.costBase)],
    ];
    const flame = st.flame
      ? '<span class="ord-flame" style="background:' + esc(st.flame) + '"></span>' + esc(st.flame)
      : '\u2014';
    rows.push([tr('Flame colour'), flame]);

    const volume = Object.values(mix).reduce((a, b) => a + b, 0);
    const notes = [];
    if (volume > c.vol) notes.push(tr('over the casing volume'));
    else if (volume < c.vol) notes.push(tr('casing not full'));
    box.innerHTML = '<div class="ord-pick-bar"><span>' + esc(tr('Pinned')) + '</span>'
      + '<button class="ord-pick-clear" id="ordPickClear" aria-label="Clear pin">&times;</button></div>'
      + '<div class="ord-pick-head">' + esc(describeMix(mix)) + '</div>'
      + (notes.length ? '<div class="ord-pick-note">' + esc(notes.join(' \u00b7 ')) + '</div>' : '')
      + '<div class="ord-pick-lead"><span>' + esc(mlabel(S.heatMetric)) + '</span><strong>'
      + esc(round(colourMetric.get(st, dmgPer), 2)) + '</strong></div>'
      + '<table class="ord-pick-table"><tbody>'
      + rows.map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + r[1] + '</td></tr>').join('')
      + '</tbody></table>'
      + '<button class="ord-chip" id="ordPickUse">Load this mix</button>';
    const btn = $('ordPickUse');
    if (btn) btn.onclick = () => { S.mix = Object.assign({}, mix); track('ordnance_pick_use'); renderAll(); };
    const clr = $('ordPickClear');
    if (clr) clr.onclick = () => { S.pick = null; renderHeat(); };
  }

  function setPick(cell) {
    S.pick = cell ? { mix: Object.assign({}, cell.mix) } : null;
  }

  // Where the pinned mixture sits on the current axes, or null when it cannot be
  // drawn there: its reagents are off the current floor, or the third reagent no
  // longer supplies what this mixture holds.
  function pickCell(g) {
    if (!S.pick) return null;
    const mix = S.pick.mix;
    const ids = Object.keys(mix).filter(id => mix[id] > 0);
    const axes = new Set([S.heatA, S.heatB]);
    if (S.heatC) axes.add(S.heatC);
    if (ids.some(id => !axes.has(id))) return null;
    const a = mix[S.heatA] || 0;
    const b = S.heatB === S.heatA ? 0 : (mix[S.heatB] || 0);
    if (S.heatC && S.heatC !== S.heatA && S.heatC !== S.heatB) {
      const expect = S.heatCMode === 'fixed' ? S.heatCAmount : g.cap - a - b;
      if (Math.abs((mix[S.heatC] || 0) - expect) > 1.5) return null;
    }
    const i = Math.round(a / g.cap * (g.N - 1));
    const j = Math.round(b / g.cap * (g.N - 1));
    if (i < 0 || j < 0 || i >= g.N || j >= g.N) return null;
    return g.cells[i * g.N + j] ? { i, j } : null;
  }

  // ── surface interaction ────────────────────────────────────────────────────
  function pointInQuad(px, py, pr) {
    const sign = (ax, ay, bx, by, cx, cy) =>
      (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
    const tri = (a, b, c) => {
      const d1 = sign(px, py, a.x, a.y, b.x, b.y);
      const d2 = sign(px, py, b.x, b.y, c.x, c.y);
      const d3 = sign(px, py, c.x, c.y, a.x, a.y);
      const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      return !(neg && pos);
    };
    return tri(pr[0], pr[1], pr[2]) || tri(pr[0], pr[2], pr[3]);
  }

  function pickAt(px, py) {
    const g = surfaceGrid();
    if (S.surfView === 'flat') {
      const m = S.surfCells;
      if (!m || !m.pad) return null;
      const i = Math.floor((px - m.pad.l) / m.cw);
      const j = Math.floor((m.pad.t + m.ih - py) / m.ch);
      if (i < 0 || j < 0 || i >= m.N || j >= m.N) return null;
      return g.cells[i * m.N + j] || null;
    }
    // Nearest first: the draw order was far-to-near, so walk it backwards.
    const quads = S.surfCells;
    if (!Array.isArray(quads)) return null;
    for (let k = quads.length - 1; k >= 0; k--) {
      const q = quads[k];
      if (!pointInQuad(px, py, q.pr)) continue;
      let best = null, bestD = Infinity;
      for (let c = 0; c < 4; c++) {
        const d = (q.pr[c].x - px) ** 2 + (q.pr[c].y - py) ** 2;
        const cell = g.cells[q.ij[c][0] * g.N + q.ij[c][1]];
        if (cell && d < bestD) { bestD = d; best = cell; }
      }
      return best;
    }
    return null;
  }

  function setupSurfaceInput() {
    const cv = $('ordHeat');
    // `dragged` is the distance of the gesture that just ended. Keeping it
    // separate from the live counter means a click never inherits the travel of
    // an earlier rotation, which silently swallowed the next pick.
    let drag = null, moved = 0, dragged = 0;
    cv.addEventListener('pointerdown', e => {
      if (S.surfView !== '3d') return;
      drag = { x: e.clientX, y: e.clientY };
      moved = 0; dragged = 0;
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      S.yaw += dx * 0.01;
      // Stop just short of flat-on and straight-down: both make the surface
      // unreadable and the floor triangle degenerate.
      S.pitch = clamp(S.pitch + dy * 0.008, 0.08, 1.45);
      drag = { x: e.clientX, y: e.clientY };
      renderSurface3D(surfaceGrid());
    });
    const stop = () => { drag = null; dragged = moved; moved = 0; };
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('pointercancel', stop);
    cv.addEventListener('wheel', e => {
      if (S.surfView !== '3d') return;
      e.preventDefault();
      S.zoom = clamp(S.zoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.4, 3.5);
      renderSurface3D(surfaceGrid());
    }, { passive: false });
    cv.addEventListener('click', e => {
      const wasDrag = dragged > 6;
      dragged = 0;
      if (wasDrag) return;                    // that gesture was a rotation, not a pick
      const r = cv.getBoundingClientRect();
      const cell = pickAt(e.clientX - r.left, e.clientY - r.top);
      if (!cell) return;
      setPick(cell);
      track('ordnance_pick', { view: S.surfView });
      renderHeat();
    });
    cv.style.touchAction = 'none';

    // The curve is the third place a mixture is visible, so it reads out too.
    const chart = $('ordChart');
    chart.style.cursor = 'crosshair';
    chart.addEventListener('click', e => {
      const geom = S.chartGeom;
      if (!geom || !geom.pts.length) return;
      const r = chart.getBoundingClientRect();
      const value = (e.clientX - r.left - geom.padL) / geom.iw * geom.maxX;
      let nearest = geom.pts[0];
      for (const pt of geom.pts) {
        if (Math.abs(pt.x - value) < Math.abs(nearest.x - value)) nearest = pt;
      }
      S.pick = { mix: Object.assign({}, nearest.mix) };
      track('ordnance_pick', { view: 'curve' });
      renderHeat();
    });
  }

  // Single-hue sequential ramp on the app's phosphor green: hull dark for the
  // low end, full phosphor at the top. Drawn on opaque cells, so it never picks
  // up the page surface behind it.
  function rampRGB(t) {
    t = clamp(t, 0, 1);
    // The low stop has to stay clearly above the page background: on the 3D pass
    // it is multiplied by a lighting factor, and a near-black bottom end turns
    // whole facets into holes.
    const stops = [[30, 48, 46], [24, 88, 62], [32, 140, 80], [46, 205, 112], [57, 255, 133]];
    const p = t * (stops.length - 1), i = Math.min(Math.floor(p), stops.length - 2), f = p - i;
    const a = stops[i], b = stops[i + 1];
    return a.map((v, k) => Math.round(v + (b[k] - v) * f));
  }

  // ── build to a spec ────────────────────────────────────────────────────────
  // Every output of the formula is linear in the amounts (blast radius is a ratio
  // of two linear terms), so maximising ONE of them never needs more than two
  // reagents — the optimum sits on a vertex or an edge of the composition
  // simplex. Extra reagents only start paying once several outputs are required
  // at once, which is exactly what this searches.
  //
  // Method: multi-start hill climbing rather than a grid. A grid over four
  // components is both slow and coarse, while the landscape here is piecewise
  // linear and climbs cleanly. Infeasible starts are pulled toward the feasible
  // region by a penalty, so requirements can be met from anywhere.
  function reqPool() {
    const F = S.data.formula;
    return Object.keys(S.data.reagents).filter(id => {
      const r = S.data.reagents[id];
      // Only what a player can actually obtain. Tank napalms and research
      // variants have no reaction and no dispenser slot, so proposing one is
      // proposing a mixture nobody can build.
      if (!r.obtainable) return false;
      return r.explosive || r.i || r.d || r.r || id === F.ironReagent;
    });
  }

  // What one unit of a reagent contributes to a metric, read straight off the
  // data rather than by filling a casing with it. Judging a reagent alone is
  // exactly wrong for the ones that need a partner: iron alone yields no
  // shrapnel because nothing gives it power, and carbon alone yields no burn
  // time because nothing lights the fire.
  function perUnit(metricKey, id) {
    const r = S.data.reagents[id];
    if (!r) return 0;
    const F = S.data.formula;
    switch (metricKey) {
      case 'shards': return id === F.ironReagent ? F.shardsPerUnit : 0;
      case 'power': return r.explosive ? r.power : 0;
      case 'damage': return (r.explosive ? r.power : 0) * F.damagePerIntensity / F.intensityDivisor;
      case 'fireIntensity': return r.i;
      case 'fireDuration': return r.d;
      case 'reach': return r.r;
      // Blast radius is power over falloff, so what helps is power per unit and
      // falloff pushed down; rank by the two together.
      case 'blastRadius': return r.explosive ? r.power - r.falloff * 20 : 0;
      default: return 0;
    }
  }

  function bestReagentFor(metricKey, pool) {
    let best = null, bestV = 0;
    for (const id of pool) {
      const v = perUnit(metricKey, id);
      if (v > bestV) { bestV = v; best = id; }
    }
    return best;
  }

  // Build the mixture the way a person would: give each requirement just enough
  // of the reagent that serves it, light the fire if any fire requirement needs
  // it, and pour the remaining volume into whatever the objective wants. The
  // climb then refines it. This is the seed that finds the good answers.
  function constructiveSeed(pool, cap, spec) {
    const F = S.data.formula;
    const mix = {};
    let used = 0;
    let needsFire = false;
    for (const req of spec.reqs) {
      if (!req.metric || !(req.min > 0)) continue;
      if (req.metric === 'fireDuration' || req.metric === 'fireIntensity' || req.metric === 'reach') {
        needsFire = true;
      }
      const champ = bestReagentFor(req.metric, pool);
      const rate = champ ? perUnit(req.metric, champ) : 0;
      if (!champ || rate <= 0) continue;
      const want = Math.min(cap - used, Math.ceil(req.min / rate));
      if (want > 0) { mix[champ] = (mix[champ] || 0) + want; used += want; }
    }
    // Fire only runs at all when the summed intensity is above zero, so a burn
    // time requirement is worthless without an igniter in the casing.
    if (needsFire) {
      const igniter = bestReagentFor('fireIntensity', pool);
      const already = Object.keys(mix).reduce((a, id) => a + mix[id] * perUnit('fireIntensity', id), 0);
      if (igniter && already <= 0 && used < cap) { mix[igniter] = (mix[igniter] || 0) + 1; used += 1; }
    }
    const filler = bestReagentFor(spec.objective === 'lowestCost' ? 'power' : spec.objective, pool);
    if (filler && used < cap) mix[filler] = (mix[filler] || 0) + (cap - used);
    return mix;
  }

  // The spec is passed in rather than read off S, so the cost ladder can run the
  // same search under a different objective without mutating the live controls.
  function liveSpec() {
    return { objective: S.reqObjective, reqs: S.reqs, costLimit: S.reqCostLimit };
  }

  function reqEvaluate(mix, spec) {
    const c = casingOf();
    const st = computeStats(mix, c, S.dampener);
    const F = S.data.formula;
    const dmgPer = F.damagePerIntensity / F.intensityDivisor;
    const cost = mixCost(mix, S.costBase);

    // Normalised shortfall per requirement, so one badly-scaled metric cannot
    // dominate the penalty and stall the climb.
    let miss = 0;
    for (const req of spec.reqs) {
      if (!req.metric || !(req.min > 0)) continue;
      const have = METRICS[req.metric].get(st, dmgPer);
      if (have < req.min) miss += (req.min - have) / req.min;
    }
    if (spec.costLimit != null && cost > spec.costLimit) {
      miss += (cost - spec.costLimit) / Math.max(spec.costLimit, 1);
    }
    const objective = spec.objective === 'lowestCost'
      ? -cost
      : METRICS[spec.objective].get(st, dmgPer);
    return { st, cost, miss, objective, score: objective - miss * 1000 };
  }

  function reqClimb(start, pool, cap, spec) {
    let mix = Object.assign({}, start);
    let cur = reqEvaluate(mix, spec);
    for (let delta = Math.max(1, Math.round(cap / 8)); delta >= 1; delta = Math.floor(delta / 2)) {
      for (let step = 0; step < 26; step++) {
        let bestMix = null, bestEval = cur;
        const active = Object.keys(mix).filter(id => mix[id] > 0);
        const used = active.reduce((a, id) => a + mix[id], 0);
        const tryMix = candidate => {
          const ev = reqEvaluate(candidate, spec);
          if (ev.score > bestEval.score + 1e-9) { bestEval = ev; bestMix = candidate; }
        };
        for (const to of pool) {
          if (used + delta <= cap) {                       // grow into free space
            const m = Object.assign({}, mix);
            m[to] = (m[to] || 0) + delta;
            tryMix(m);
          }
          for (const from of active) {                     // trade one for another
            if (from === to || mix[from] < delta) continue;
            const m = Object.assign({}, mix);
            m[from] -= delta;
            if (m[from] <= 0) delete m[from];
            m[to] = (m[to] || 0) + delta;
            tryMix(m);
          }
        }
        for (const from of active) {                       // or simply use less
          const m = Object.assign({}, mix);
          m[from] -= delta;
          if (m[from] <= 0) delete m[from];
          tryMix(m);
        }
        // Whole-reagent swaps. Incremental moves cannot cross a valley: trading
        // 50 octogen for 1 phosphorus plus cyclonite is better at the far end
        // and worse everywhere in between, so it has to be reachable in one hop.
        for (const from of active) {
          for (const to of pool) {
            if (from === to) continue;
            const m = Object.assign({}, mix);
            m[to] = (m[to] || 0) + m[from];
            delete m[from];
            tryMix(m);
          }
        }
        if (!bestMix) break;
        mix = bestMix; cur = bestEval;
      }
    }
    return { mix, ev: cur };
  }

  function reqSearch(spec) {
    const cap = casingOf().vol;
    const pool = reqPool();
    if (!pool.length) return null;

    // A caller that already knows roughly where the answer lies can hand over
    // its own starting points and skip generating a hundred of them.
    if (spec.seeds) return climbFrom(spec.seeds, pool, cap, spec);

    // Seeds. Single reagents and pairs cover the faces a one-objective optimum
    // can sit on. On top of that, each requirement contributes the reagent that
    // serves it best per unit, because a requirement is often met by one
    // specific reagent and nothing else — fire duration needs a burn reagent,
    // shrapnel needs iron — and starting without it wastes the whole climb.
    const seeds = [{}];
    if (Object.keys(S.mix).length) seeds.push(Object.assign({}, S.mix));
    for (const id of pool) seeds.push({ [id]: cap });

    seeds.push(constructiveSeed(pool, cap, spec));

    const champions = [];
    for (const req of spec.reqs) {
      if (!req.metric || !(req.min > 0)) continue;
      champions.push(bestReagentFor(req.metric, pool));
    }
    champions.push(bestReagentFor(spec.objective === 'lowestCost' ? 'power' : spec.objective, pool));
    champions.push(bestReagentFor('fireIntensity', pool));
    const key = [...new Set(champions.filter(Boolean))];
    if (key.length > 1) {
      const share = Math.floor(cap / key.length);
      const even = {};
      for (const id of key) even[id] = (even[id] || 0) + share;
      seeds.push(even);
    }
    const shortlist = [...new Set(key.concat(pool))].slice(0, 10);
    for (let i = 0; i < shortlist.length; i++) {
      for (let j = i + 1; j < shortlist.length; j++) {
        seeds.push({ [shortlist[i]]: Math.round(cap / 2), [shortlist[j]]: Math.round(cap / 2) });
      }
    }
    for (const id of key) {
      for (const other of shortlist) {
        if (other === id) continue;
        seeds.push({ [id]: Math.round(cap / 4), [other]: Math.round(cap * 3 / 4) });
      }
    }

    return climbFrom(seeds, pool, cap, spec);
  }

  function climbFrom(seeds, pool, cap, spec) {
    let best = null;
    for (const seed of seeds) {
      const r = reqClimb(seed, pool, cap, spec);
      if (!Object.keys(r.mix).length) continue;
      if (!best) { best = r; continue; }
      // Feasibility first, then the objective, then cost as the tie-break.
      const a = r.ev, b = best.ev;
      const better = a.miss < b.miss - 1e-9
        || (Math.abs(a.miss - b.miss) < 1e-9 && a.objective > b.objective + 1e-9)
        || (Math.abs(a.miss - b.miss) < 1e-9 && Math.abs(a.objective - b.objective) < 1e-9
            && a.cost < b.cost - 1e-9);
      if (better) best = r;
    }
    return best;
  }

  // The cost ladder: how much of the ceiling each level of spending buys. This
  // replaces a separate pair-grid search that only ever considered two reagents
  // from the current mixture, and therefore never tried octogen — it reported
  // roughly double the true cost at every rung.
  const LADDER = [0.75, 0.85, 0.9, 0.95, 1];

  function reqLadderRows() {
    const metric = S.reqObjective;
    if (metric === 'lowestCost') return null;
    const F = S.data.formula;
    const dmgPer = F.damagePerIntensity / F.intensityDivisor;
    const base = liveSpec();

    const top = reqSearch(base);
    if (!top) return null;
    const ceiling = METRICS[metric].get(top.ev.st, dmgPer);
    if (!(ceiling > 0)) return null;

    // Walk down from the ceiling. Each rung is a relaxation of the one above, so
    // the previous answer is already in the right region and the climb only has
    // to shed a little cost. One full search plus five warm starts, instead of
    // six full searches.
    const rows = [];
    let previous = top.mix;
    for (const frac of [...LADDER].reverse()) {
      const spec = {
        objective: 'lowestCost',
        reqs: base.reqs.concat([{ metric, min: ceiling * frac }]),
        costLimit: base.costLimit,
        seeds: [previous, constructiveSeed(reqPool(), casingOf().vol,
                { objective: 'lowestCost', reqs: base.reqs.concat([{ metric, min: ceiling * frac }]) })],
      };
      const r = reqSearch(spec);
      if (!r) continue;
      previous = r.mix;
      rows.unshift({ frac, mix: r.mix, ev: r.ev, value: METRICS[metric].get(r.ev.st, dmgPer) });
    }
    if (!rows.length) return null;
    const full = rows[rows.length - 1].ev.cost;
    for (const row of rows) row.save = full > 0 ? 1 - row.ev.cost / full : 0;
    return { metric, ceiling, rows };
  }

  function renderLadder(box, ladder) {
    const unit = rname(S.costBase);
    box.innerHTML = `<table class="ord-table">
      <thead><tr>
        <th>${esc(tr('Target'))}</th><th>${esc(tr('Mixture'))}</th>
        <th class="num">${esc(mlabel(ladder.metric))}</th>
        <th class="num">${esc(tr('Blast'))}</th>
        <th class="num">${esc(unit)}</th><th class="num">${esc(tr('Saved'))}</th>
      </tr></thead><tbody>${ladder.rows.map(r => `<tr>
        <td>${Math.round(r.frac * 100)}%</td>
        <td class="ord-mix-cell">${esc(describeMix(r.mix))}</td>
        <td class="num">${esc(round(r.value, 1))}</td>
        <td class="num">${r.ev.st.hasBlast ? esc(round(r.ev.st.blastRadius, 2)) : '\u2014'}</td>
        <td class="num">${esc(round(r.ev.cost, 1))}</td>
        <td class="num">${r.save > 0.005 ? esc(Math.round(r.save * 100)) + '%' : '\u2014'}</td>
      </tr>`).join('')}</tbody></table>`;
    box.querySelectorAll('tbody tr').forEach((tr, i) => {
      tr.style.cursor = 'pointer';
      tr.onclick = () => {
        S.mix = Object.assign({}, ladder.rows[i].mix);
        track('ordnance_ladder_use');
        renderAll();
      };
    });
  }

  function renderReqList() {
    const box = $('ordReqList');
    const opts = sel => Object.keys(METRICS)
      .map(k => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(mlabel(k))}</option>`)
      .join('');
    box.innerHTML = S.reqs.map((req, idx) => `<div class="ord-req-row" data-idx="${idx}">
      <select class="ord-req-metric" aria-label="Required metric">${opts(req.metric)}</select>
      <span class="ord-req-op">${esc(tr('at least'))}</span>
      <input type="number" class="ord-req-min" min="0" step="1" value="${esc(req.min)}"
             aria-label="Required value">
      <button class="ord-req-del" aria-label="Remove requirement">&times;</button>
    </div>`).join('') || `<p class="ord-empty">${esc(tr('No requirements: the search just maximises.'))}</p>`;

    box.querySelectorAll('.ord-req-row').forEach(row => {
      const idx = +row.dataset.idx;
      row.querySelector('.ord-req-metric').onchange = e => { S.reqs[idx].metric = e.target.value; };
      row.querySelector('.ord-req-min').oninput = e => { S.reqs[idx].min = +e.target.value || 0; };
      row.querySelector('.ord-req-del').onclick = () => { S.reqs.splice(idx, 1); renderReqList(); };
    });
  }

  function renderReqResult() {
    const box = $('ordReqOut');
    if (S.reqResult === undefined) { box.innerHTML = ''; return; }
    if (S.reqResult && S.reqResult.rows) { renderLadder(box, S.reqResult); return; }
    if (!S.reqResult) {
      box.innerHTML = `<p class="ord-empty">${esc(tr('Nothing in this casing can do that.'))}</p>`;
      return;
    }
    const { mix, ev } = S.reqResult;
    const st = ev.st;
    const F = S.data.formula;
    const dmgPer = F.damagePerIntensity / F.intensityDivisor;
    const rows = S.reqs.filter(r => r.metric && r.min > 0).map(r => {
      const have = METRICS[r.metric].get(st, dmgPer);
      const ok = have >= r.min - 1e-9;
      return `<tr class="${ok ? 'ord-ok' : 'ord-bad'}"><td>${esc(mlabel(r.metric))}</td>
        <td>${esc(tr('at least'))} ${esc(round(r.min, 2))}</td>
        <td>${esc(round(have, 2))} ${ok ? '\u2713' : '\u2717'}</td></tr>`;
    }).join('');
    const objLabel = S.reqObjective === 'lowestCost'
      ? tr('Lowest cost') : mlabel(S.reqObjective);
    const objValue = S.reqObjective === 'lowestCost'
      ? round(ev.cost, 1) + ' ' + rname(S.costBase)
      : round(ev.objective, 2);

    box.innerHTML = `<div class="ord-req-card">
      <div class="ord-pick-lead"><span>${esc(objLabel)}</span><strong>${esc(objValue)}</strong></div>
      <div class="ord-pick-head">${esc(describeMix(mix))}</div>
      <div class="ord-req-sub">${esc(tr('Uses'))} ${Object.keys(mix).length} \u00b7
        ${esc(tr('cost'))} ${esc(round(ev.cost, 1))} ${esc(rname(S.costBase))}
        ${ev.miss > 1e-9 ? ' \u00b7 <b class="ord-bad">' + esc(tr('requirements not met')) + '</b>' : ''}</div>
      ${rows ? `<table class="ord-pick-table"><tbody>${rows}</tbody></table>` : ''}
      <button class="ord-chip" id="ordReqUse">Load this mix</button>
    </div>`;
    const btn = $('ordReqUse');
    if (btn) btn.onclick = () => {
      S.mix = Object.assign({}, mix);
      track('ordnance_req_use');
      renderAll();
    };
  }

  // ── ready recipes ──────────────────────────────────────────────────────────
  // Baked by ss14_ordnance.py with an exhaustive pair sweep, which is exact here:
  // every output is linear in the amounts and blast radius is a ratio of two
  // linear terms, so a single-objective optimum never needs a third reagent.
  function renderCatalogue() {
    const box = $('ordCatalogue');
    const rows = (S.data.recipes || []).filter(r => r.casing === S.casing);
    if (!rows.length) { box.innerHTML = '<p class="ord-empty">' + esc(tr('Nothing baked for this casing.')) + '</p>'; return; }
    const c = casingOf();
    const F = S.data.formula;
    const dmgPer = F.damagePerIntensity / F.intensityDivisor;
    const built = rows.map(r => {
      const st = computeStats(r.mix, c, S.dampener);
      return { r, st, cost: mixCost(r.mix, S.costBase),
               dmg: st.power * dmgPer, kills: killCount(st) };
    });
    box.innerHTML = `<table class="ord-table">
      <thead><tr>
        <th>${esc(tr('For'))}</th><th>${esc(tr('Mixture'))}</th>
        <th class="num">${esc(tr('Power'))}</th><th class="num">${esc(tr('Blast'))}</th>
        <th class="num">${esc(tr('Shrapnel'))}</th><th class="num">${esc(tr('Fire'))}</th>
        <th class="num">${esc(rname(S.costBase))}</th><th class="num">${esc(tr('Kills'))}</th>
      </tr></thead><tbody>${built.map(b => `<tr>
        <td>${esc(b.r.roles.map(k => tr(ROLE_LABEL[k] || k)).join(' + '))}</td>
        <td class="ord-mix-cell">${esc(describeMix(b.r.mix))}</td>
        <td class="num">${esc(round(b.st.power, 0))}</td>
        <td class="num">${b.st.hasBlast ? esc(round(b.st.blastRadius, 2)) : '\u2014'}</td>
        <td class="num">${b.st.shards || '\u2014'}</td>
        <td class="num">${b.st.fireIntensity ? esc(round(b.st.fireIntensity, 0)) + '/' + b.st.reach + '/' + esc(round(b.st.fireDuration, 0)) + 's' : '\u2014'}</td>
        <td class="num">${esc(round(b.cost, 1))}</td>
        <td class="num">${b.kills}/${(S.data.targets || []).length}</td>
      </tr>`).join('')}</tbody></table>`;
    box.querySelectorAll('tbody tr').forEach((tr_, i) => {
      tr_.style.cursor = 'pointer';
      tr_.onclick = () => {
        S.mix = Object.assign({}, built[i].r.mix);
        track('ordnance_recipe_use', { role: built[i].r.roles.join('+') });
        renderAll();
      };
    });
  }

  const ROLE_LABEL = {
    radius: 'Reach', damage: 'Damage', shrapnel: 'Shrapnel',
    fire: 'Fire', burn: 'Burn time', cheap: 'Cheap',
  };

  // ── what it does to them ───────────────────────────────────────────────────
  // Blast only. The engine floods an explosion across tiles and the in-game
  // simulator measures it by detonating a real one, so intensity is modelled as
  // linear from power / 5 at the centre to zero at the blast radius. Shrapnel and
  // fire are left out, which understates rather than flatters.
  function blastDamageAt(st, distance) {
    const F = S.data.formula;
    if (st.power <= 0 || st.falloff <= 0) return 0;
    const maxIntensity = st.power / F.intensityDivisor;
    const slope = Math.max(st.falloff / F.intensityDivisor, F.minSlope);
    return F.damagePerIntensity * Math.max(0, maxIntensity - slope * distance);
  }

  function targetOutcome(st, target, distance) {
    const dealt = blastDamageAt(st, distance) * target.coefficient;
    const state = dealt >= target.dead ? 'dead'
      : (target.hasCrit && dealt >= target.crit) ? 'crit' : 'alive';
    return {
      dealt,
      state,
      left: Math.max(0, target.dead - dealt),
      share: clamp(1 - dealt / target.dead, 0, 1),
      hits: dealt > 0 ? Math.ceil(target.dead / dealt) : null,
    };
  }

  function killCount(st) {
    return (S.data.targets || [])
      .filter(t => targetOutcome(st, t, 0).state === 'dead').length;
  }

  function renderGallery() {
    const box = $('ordGallery');
    const targets = S.data.targets || [];
    if (!targets.length) { box.innerHTML = ''; return; }
    const st = computeStats(S.mix, casingOf(), S.dampener);
    const range = S.galleryRange;
    box.innerHTML = targets.map(t => {
      const o = targetOutcome(st, t, range);
      const sprite = (t.sprites || {})[o.state === 'crit' ? 'crit' : o.state] || (t.sprites || {}).alive;
      const tier = t.tier ? 'T' + t.tier : '\u2014';
      return `<div class="ord-xeno ord-xeno-${o.state}">
        <div class="ord-xeno-art">
          ${sprite ? `<img src="sprites/xenos/${esc(sprite)}" alt="${esc(t.name)}" loading="lazy">` : ''}
          ${o.state === 'dead' ? '<span class="ord-xeno-skull">\u2620</span>' : ''}
        </div>
        <div class="ord-xeno-name">${esc(t.name)} <b>${esc(tier)}</b></div>
        <div class="ord-xeno-bar"><i style="width:${(o.share * 100).toFixed(1)}%"></i></div>
        <div class="ord-xeno-num">${o.state === 'dead'
          ? esc(tr('destroyed'))
          : esc(round(o.left, 0)) + ' / ' + esc(round(t.dead, 0))}</div>
        <div class="ord-xeno-hits">${o.hits ? esc(o.hits) + ' \u00d7' : esc(tr('no effect'))}</div>
      </div>`;
    }).join('');
  }

  // Only the fork that actually has an ordnance layer gets the tab.
  // The tab used to hide itself unless the Space Stories fork was selected, which
  // made it unreachable: nothing on the page told anyone that picking a fork in
  // the sidebar would reveal a whole tab. It is always in the bar now, and says
  // which fork the numbers come from when the rest of the app is set elsewhere.
  window.ordnanceForkGate = function (source) {
    const note = $('ordForkNote');
    if (!note || !S.data) return;
    if (source === FORK) { note.hidden = true; return; }
    const meta = (chem() && chem().meta && chem().meta.forks && chem().meta.forks[FORK]) || {};
    note.hidden = false;
    note.innerHTML = esc(tr('These numbers come from')) + ' <b>' + esc(meta.name || FORK)
      + '</b>. <button class="ord-chip" id="ordForkSwitch">'
      + esc(tr('Switch the app to it')) + '</button>';
    const btn = $('ordForkSwitch');
    if (btn) btn.onclick = () => {
      const radio = document.querySelector('input[name="source"][value="' + FORK + '"]');
      if (radio) radio.click();
    };
  };

  const tabBtn = document.getElementById('btn-ordnance');
  if (tabBtn) tabBtn.addEventListener('click', init);
})();

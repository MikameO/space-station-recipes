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

  const S = {
    inited: false, data: null, casing: null, mix: {}, dampener: false,
    chartMode: 'blend', sweepId: null, blendA: null, blendB: null,
    heatA: null, heatB: null, heatMetric: 'blastRadius',
    costBase: null, paretoMetric: 'power',
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
  };
  const tr = s => (window.I18N_LANG === 'ru' && RU[s]) || s;

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
    $('ordHeatA').onchange = e => { S.heatA = e.target.value; renderHeat(); };
    $('ordHeatB').onchange = e => { S.heatB = e.target.value; renderHeat(); };
    $('ordHeatMetric').onchange = e => { S.heatMetric = e.target.value; renderHeat(); };
    $('ordCostBase').onchange = e => { S.costBase = e.target.value; renderPareto(); };
    $('ordParetoMetric').onchange = e => { S.paretoMetric = e.target.value; renderPareto(); };
  }

  function track(goal, params) {
    if (typeof window.track === 'function') window.track(goal, params);
  }

  // ── render ─────────────────────────────────────────────────────────────────
  function renderAll() { renderMix(); renderStats(); syncChartControls(); renderChart(); renderHeat(); renderPareto(); }

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
        renderStats(); renderChart(); renderHeat(); renderPareto();
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

  function renderHeat() {
    if (!S.data) return;
    const { ctx, w, h } = ctxOf('ordHeat');
    const c = casingOf(), cap = c.vol;
    const N = 48, pad = { l: 40, r: 12, t: 10, b: 28 };
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const F = S.data.formula;
    const metric = METRICS[S.heatMetric];
    const grid = [];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N; i++) {
      grid[i] = [];
      for (let j = 0; j < N; j++) {
        const a = Math.round(cap * i / (N - 1)), b = Math.round(cap * j / (N - 1));
        let v = NaN;
        if (a + b <= cap) {
          const mix = {};
          if (a) mix[S.heatA] = a;
          if (b) mix[S.heatB] = b;
          v = metric.get(computeStats(mix, c, S.dampener), F.damagePerIntensity / F.intensityDivisor);
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        grid[i][j] = v;
      }
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi === lo) hi = lo + 1;
    const cw = iw / N, ch = ih / N;
    let best = null;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const v = grid[i][j];
      if (isNaN(v)) continue;
      const t = (v - lo) / (hi - lo);
      ctx.fillStyle = ramp(t);
      ctx.fillRect(pad.l + i * cw, pad.t + ih - (j + 1) * ch, cw + 0.5, ch + 0.5);
      if (!best || v > best.v) best = { v, i, j };
    }
    if (best) {
      ctx.strokeStyle = cssVar('--text-bright') || '#e8ecf4'; ctx.lineWidth = 1.5;
      ctx.strokeRect(pad.l + best.i * cw - 1, pad.t + ih - (best.j + 1) * ch - 1, cw + 2, ch + 2);
    }
    const muted = cssVar('--text-ghost') || '#6b7a93';
    ctx.fillStyle = muted; ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rname(S.heatA) + ' →', pad.l + iw / 2, h - 8);
    ctx.save();
    ctx.translate(12, pad.t + ih / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
    ctx.fillText(rname(S.heatB) + ' →', 0, 0);
    ctx.restore();

    if (best) {
      const a = Math.round(cap * best.i / (N - 1)), b = Math.round(cap * best.j / (N - 1));
      const mix = {}; if (a) mix[S.heatA] = a; if (b) mix[S.heatB] = b;
      $('ordHeatNote').innerHTML = tr('Best') + ' ' + esc(tr(metric.label.toLowerCase())) + ': '
        + esc(round(best.v, 2)) + ' ' + tr('at') + ' ' + esc(describeMix(mix))
        + ' <button class="ord-chip" id="ordHeatUse">Load this mix</button>';
      const btn = $('ordHeatUse');
      if (btn) btn.onclick = () => { S.mix = mix; track('ordnance_heat_use'); renderAll(); };
    } else {
      $('ordHeatNote').textContent = '';
    }
  }

  // Single-hue sequential ramp on the app's phosphor green: hull dark for the
  // low end, full phosphor at the top. Drawn on opaque cells, so it never picks
  // up the page surface behind it.
  function ramp(t) {
    t = clamp(t, 0, 1);
    const stops = [[12, 16, 24], [16, 58, 40], [26, 122, 66], [45, 200, 108], [57, 255, 133]];
    const p = t * (stops.length - 1), i = Math.min(Math.floor(p), stops.length - 2), f = p - i;
    const a = stops[i], b = stops[i + 1];
    return 'rgb(' + a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',') + ')';
  }

  // ── Pareto: cheapest mixture that still reaches X% of the casing ceiling ───
  function renderPareto() {
    if (!S.data) return;
    const c = casingOf(), cap = c.vol;
    const F = S.data.formula;
    const metric = METRICS[S.paretoMetric];
    const dmgPer = F.damagePerIntensity / F.intensityDivisor;
    // Search over pairs of the reagents currently in the mix, falling back to
    // every explosive when the casing is empty. Pairs keep the grid honest:
    // a full n-dimensional sweep would be slow and unreadable.
    let pool = Object.keys(S.mix);
    if (pool.length < 2) {
      pool = Object.keys(S.data.reagents).filter(id => S.data.reagents[id].explosive
        || S.data.reagents[id].i || id === F.ironReagent);
    }
    pool = pool.slice(0, 8);
    const rows = [];
    let bestVal = 0;
    const candidates = [];
    for (let ai = 0; ai < pool.length; ai++) {
      for (let bi = ai; bi < pool.length; bi++) {
        const A = pool[ai], B = pool[bi];
        const steps = 40;
        for (let k = 0; k <= steps; k++) {
          const b = Math.round(cap * k / steps);
          const mix = {};
          if (cap - b > 0) mix[A] = cap - b;
          if (b > 0) mix[B] = (mix[B] || 0) + b;
          if (A === B) { mix[A] = cap; }
          const st = computeStats(mix, c, S.dampener);
          const v = metric.get(st, dmgPer);
          const cost = mixCost(mix, S.costBase);
          candidates.push({ v, cost, mix, st });
          if (v > bestVal) bestVal = v;
          if (A === B) break;
        }
      }
    }
    if (!candidates.length || bestVal <= 0) {
      $('ordPareto').innerHTML = '<p class="ord-empty">Nothing to optimise for this metric.</p>';
      return;
    }
    const fullCost = Math.min(...candidates.filter(x => x.v >= bestVal - 1e-9).map(x => x.cost));
    for (const frac of [0.75, 0.85, 0.9, 0.95, 1]) {
      const target = bestVal * frac;
      const ok = candidates.filter(x => x.v >= target - 1e-9);
      if (!ok.length) continue;
      const win = ok.reduce((a, b) => b.cost < a.cost ? b : a);
      rows.push({ frac, ...win, save: fullCost > 0 ? 1 - win.cost / fullCost : 0 });
    }
    const unit = rname(S.costBase);
    $('ordPareto').innerHTML = `<table class="ord-table">
      <thead><tr>
        <th>Target</th><th>Mixture</th><th class="num">${esc(metric.label)}</th>
        <th class="num">Blast</th><th class="num">${esc(unit)}</th><th class="num">Saved</th>
      </tr></thead><tbody>${rows.map(r => `<tr>
        <td>${Math.round(r.frac * 100)}%</td>
        <td class="ord-mix-cell">${esc(describeMix(r.mix))}</td>
        <td class="num">${esc(round(r.v, 1))}</td>
        <td class="num">${r.st.hasBlast ? esc(round(r.st.blastRadius, 2)) : '—'}</td>
        <td class="num">${esc(round(r.cost, 1))}</td>
        <td class="num">${r.save > 0.005 ? esc(Math.round(r.save * 100)) + '%' : '—'}</td>
      </tr>`).join('')}</tbody></table>`;

    $('ordPareto').querySelectorAll('tr').forEach((tr, i) => {
      if (!i) return;
      tr.style.cursor = 'pointer';
      tr.onclick = () => { S.mix = Object.assign({}, rows[i - 1].mix); track('ordnance_pareto_use'); renderAll(); };
    });
  }

  // Only the fork that actually has an ordnance layer gets the tab.
  window.ordnanceForkGate = function (source) {
    const btn = document.querySelector('.tab-btn[data-tab="ordnance"]');
    if (!btn) return;
    const on = source === FORK;
    btn.style.display = on ? '' : 'none';
    if (!on && document.getElementById('btn-ordnance').classList.contains('active')) {
      const back = document.querySelector('.tab-btn[data-tab="reagents"]');
      if (back) back.click();
    }
  };

  const tabBtn = document.getElementById('btn-ordnance');
  if (tabBtn) tabBtn.addEventListener('click', init);
})();

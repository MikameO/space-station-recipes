// Mixes & pills (Series R16–R17): several medicines brewed apart and combined in
// one vessel or one press of pills, checked for reactions between them.
// Spec: docs/design/2026-09-13-mixture-planner.md
//
// Self-wired like vessels.js: it reads app.js globals (DATA, activeSource,
// planBrew, simulateBeaker, planName, planPlural, fmtU,
// planRu, esc, capName, safeColor, setupAutocomplete, renderPlanShopping,
// renderPlanWarnings, checkCalcWarnings, renderPlanSteps, loadSession,
// saveSession, track) and window.ChemDBVessels, and never writes them.
(function () {
  'use strict';

  const D = () => (typeof DATA !== 'undefined' ? DATA : window.DATA);
  const SRC = () => (typeof activeSource !== 'undefined' ? activeSource : 'all');
  const RU = () => typeof planRu === 'function' && planRu();
  const V = () => window.ChemDBVessels;
  const session = () => (typeof loadSession === 'function' ? loadSession() : {});
  const round2 = (n) => Math.round(n * 100) / 100;
  const escH = (s) => (typeof esc === 'function' ? esc(String(s)) : String(s));
  const u = (n) => `${typeof fmtU === 'function' ? fmtU(n) : n}u`;
  const nameOf = (id) => (typeof planName === 'function' ? planName(id) : id);
  const plural = (n, ruForms, enForms) => (typeof planPlural === 'function'
    ? planPlural(n, RU() ? ruForms : enForms) : `${n} ${enForms[n === 1 ? 0 : 1]}`);

  // RMC14 ChemMaster, read off chem_master.yml and SharedRMCChemMasterSystem
  // (2026-09-13): a 500u buffer, up to 8 pill bottles per press, a bottle's grid
  // holds 16 pills, and every pill gets buffer ÷ (bottles × pills per bottle).
  const BUFFER = 500;
  const PILLS_PER_BOTTLE = 16;
  const BOTTLES_PER_PRESS = 8;
  const CHEMMASTER = { key: 'chemmaster', en: 'ChemMaster buffer', ru: 'Буфер ChemMaster', ruGen: 'Буфера ChemMaster', ruAcc: 'Буфер ChemMaster', size: BUFFER, fits: false, n: 1 };

  // Canonical CM mixes come from RMC14 prototypes that ship pre-filled with more
  // than one medicine. General Cure and «Унга» are players' mixes the owner
  // described (not in any repository), so they say so. Oxycodone + Dylovene is not
  // here: RMC14 has no oxycodone yet (# TODO RMC14 oxycodone in auto_injectors.yml
  // and bottles.yml).
  const PRESETS = [
    { key: 'mera-bica', en: 'Meralyne + Bicaridine', ru: 'Мералин + Бикаридин',
      components: [['CMMeralyne', 1], ['CMBicaridine', 1]], mode: 'pills', bottles: 2, dose: 15,
      noteEn: 'RMCPillMeralyneBicaridine: 7.5u + 7.5u per pill', noteRu: 'RMCPillMeralyneBicaridine: 7.5u + 7.5u в таблетке' },
    { key: 'kelo-derma', en: 'Kelotane + Dermaline', ru: 'Келотан + Дермалин',
      components: [['CMKelotane', 1], ['CMDermaline', 1]], mode: 'pills', bottles: 2, dose: 15,
      noteEn: 'RMCPillKelotaneDermaline: 7.5u + 7.5u per pill', noteRu: 'RMCPillKelotaneDermaline: 7.5u + 7.5u в таблетке' },
    { key: 'bica-kelo', en: 'Bicaridine + Kelotane', ru: 'Бикаридин + Келотан',
      components: [['CMBicaridine', 1], ['CMKelotane', 1]], mode: 'volume', volume: 60,
      noteEn: 'CMEmergencyAutoInjector: 29u + 29u', noteRu: 'экстренный автоинъектор CMEmergencyAutoInjector: 29u + 29u' },
    { key: 'revival', en: 'Revival: Epinephrine + Inaprovaline + Tricordrazine', ru: 'Реанимация: Эпинефрин + Инапровалин + Трикордразин',
      components: [['CMEpinephrine', 1], ['CMInaprovaline', 1], ['CMTricordrazine', 1]], mode: 'volume', volume: 90,
      noteEn: 'RMCMedicAutoInjectorTricordrazineRevival15: 30u of each', noteRu: 'автоинъектор RMCMedicAutoInjectorTricordrazineRevival15: по 30u' },
    { key: 'general-cure', en: 'General Cure (GC)', ru: 'General Cure (GC)', community: true,
      components: [['CMBicaridine', 1], ['CMMeralyne', 1], ['CMKelotane', 1], ['CMDermaline', 1]], mode: 'volume', volume: 400,
      noteEn: 'as players make it — one part each; on CMU it turns into black sludge', noteRu: 'как варят игроки — по одной доле; на CMU смесь превращается в чёрную слизь' },
    { key: 'unga', en: 'Unga', ru: 'Унга', community: true,
      components: [['CMMeralyne', 1], ['CMBicaridine', 1], ['CMKelotane', 1], ['CMDermaline', 1], ['RMCSugar', 1], ['RMCIron', 1], ['CMDexalinPlus', 1]],
      mode: 'volume', volume: 1000,
      noteEn: 'as players make it — one part each by default, set your server\'s proportions', noteRu: 'как варят игроки — по умолчанию по одной доле, поправьте пропорции под свой сервер' },
  ];

  // What a reaction means to the people who meet it. CMU keeps CMUCreateSludgeGC
  // on purpose: try to brew General Cure there and the tank, or part of it, turns
  // into useless black sludge (owner, 2026-09-13). Unga carries the same four
  // medicines, so it falls into the same trap.
  const REACTION_NOTES = {
    CMUCreateSludgeGC: {
      en: 'CMU\'s trap against General Cure: the whole tank, or part of it, turns into useless black sludge',
      ru: 'ловушка CMU против General Cure: весь бак или его часть превращается в бесполезную чёрную слизь',
    },
  };

  // ── amounts (R16) ────────────────────────────────────────
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; };
  const lcm = (a, b) => a / gcd(a, b) * b;

  // Parts may carry two decimals; the ladder needs them as small integers.
  function integerParts(parts) {
    const scaled = parts.map(p => Math.round(Math.max(0, Number(p) || 0) * 100));
    const g = scaled.filter(Boolean).reduce((a, b) => gcd(a, b), 0) || 1;
    return scaled.map(p => p / g);
  }

  // The smallest total ≥ `total` at which every component lands on the pour step
  // (5u), then on whole units, never more than a quarter over — the same ladder
  // and slack quantizeOrder uses for a single recipe (R3). A component p_i of P
  // parts is a multiple of `unit` when the total is a multiple of
  // unit·P / gcd(unit·P, p_i), so the step is the lcm of those.
  function snapTotal(total, parts) {
    const p = integerParts(parts);
    const P = p.reduce((a, b) => a + b, 0);
    if (!P || !(total > 0)) return { total: 0, step: 0, mode: 'exact' };
    for (const [unit, mode] of [[5, 'pour'], [1, 'whole']]) {
      const step = p.reduce((acc, pi) => (pi ? lcm(acc, (unit * P) / gcd(unit * P, pi)) : acc), 1);
      const t = Math.ceil(total / step - 1e-9) * step;
      if (t - total <= Math.max(unit, total * 0.25) + 1e-9) return { total: t, step, mode };
    }
    return { total: round2(total), step: 0, mode: 'exact' };
  }

  // Pills: the ladder runs on one bottle's worth, so a dose that cannot keep every
  // part on 5u is nudged (15u of a seven-part Unga → 245u a bottle, 15.31u a
  // pill), and presses take as many bottles as fit the 500u buffer.
  function pillsLayout(bottles, dose, parts) {
    bottles = Math.max(1, Math.floor(Number(bottles) || 1));
    dose = Math.max(0.5, Number(dose) || 15);
    let perBottle = PILLS_PER_BOTTLE;
    if (perBottle * dose > BUFFER) perBottle = Math.max(1, Math.floor(BUFFER / dose));
    let snap = snapTotal(perBottle * dose, parts);
    while (snap.total > BUFFER && perBottle > 1) { perBottle--; snap = snapTotal(perBottle * dose, parts); }
    const bottleVolume = snap.total;
    const perPress = Math.max(1, Math.min(BOTTLES_PER_PRESS, Math.floor(BUFFER / bottleVolume + 1e-9)));
    const loads = [];
    for (let left = bottles; left > 0; left -= perPress) {
      const b = Math.min(perPress, left);
      loads.push({ bottles: b, pills: b * perBottle, volume: round2(b * bottleVolume) });
    }
    return { bottles, perBottle, bottleVolume, dose: bottleVolume / perBottle, askedDose: dose, total: round2(bottles * bottleVolume), loads, snap };
  }

  // The fork list a mix is checked against: every CM fork for the CM family (a
  // RuCM player still wants to know what RMC14 does), the fork itself otherwise.
  function checkForks(forkId) {
    const forks = (D() && D().meta && D().meta.forks) || {};
    const family = V() ? V().familyFor(forkId) : 'vanilla';
    const list = family === 'cm' ? ['rmc14', 'cmu', 'rucm', 'stories_cm'] : [forkId === 'all' ? 'vanilla' : forkId];
    return [...new Set([forkId, ...list])].filter(f => f === 'all' || forks[f]);
  }

  // Nothing may react once the components share a vessel. Checked on one load at
  // 293K, on the active fork and on every fork of its family.
  function compatibility(contents, forkId) {
    const run = (f) => {
      const r = typeof simulateBeaker === 'function' ? simulateBeaker(contents, 293, f) : { log: [] };
      return { fork: f, reactions: [...new Set(r.log.map(l => l.id))] };
    };
    const active = run(forkId);
    const others = checkForks(forkId).filter(f => f !== forkId).map(run);
    return { active, others };
  }

  function planMix(mix, forkId) {
    const byId = new Map();
    for (const c of mix.components || []) {
      const parts = Number(c.parts) || 0;
      if (!c.id || !D().reagents[c.id] || parts <= 0) continue;
      byId.set(c.id, (byId.get(c.id) || 0) + parts);
    }
    const comps = [...byId.entries()].map(([id, parts]) => ({ id, parts }));
    const parts = comps.map(c => c.parts);
    let layout = null;
    let snap;
    let total;
    if (mix.mode === 'pills') {
      layout = pillsLayout(mix.bottles, mix.dose, parts);
      snap = layout.snap;
      total = layout.total;
    } else {
      snap = snapTotal(Number(mix.volume) || 0, parts);
      total = snap.total;
    }
    const p = integerParts(parts);
    const P = p.reduce((a, b) => a + b, 0) || 1;
    const amounts = comps.map((c, i) => ({ id: c.id, parts: c.parts, amount: round2(total * p[i] / P) }));

    const plan = planBrew(amounts.map(a => ({ id: a.id, amount: a.amount })), 0);
    const brewed = {};
    for (const q of plan.quants) brewed[q.id] = round2((brewed[q.id] || 0) + q.ordered);

    const loads = layout ? layout.loads : null;
    const mixStep = {
      isMix: true, reagentId: '__mix', rxnId: null, depth: -1, amount: total,
      reactants: amounts.map(a => ({ id: a.id, amount: a.amount, catalyst: false })),
      mixer: [], minTemp: null, maxTemp: null, loadStep: snap.step || 5, loads,
    };
    const share = loads && loads.length ? loads[0].volume / (total || 1) : 1;
    const firstLoad = {};
    for (const a of amounts) firstLoad[a.id] = round2(a.amount * share);

    return {
      mix, forkId, amounts, total, snap, layout, brewed,
      plan, planWithMix: Object.assign({}, plan, { steps: plan.steps.concat([mixStep]) }),
      compat: amounts.length > 1 ? compatibility(firstLoad, forkId) : { active: { fork: forkId, reactions: [] }, others: [] },
    };
  }

  // ── rendering (R17) ──────────────────────────────────────
  const forkName = (f) => (f === 'all' ? (RU() ? '«Все»' : '«All»') : ((D().meta.forks[f] || {}).name || f));

  function reactionText(id) {
    const rx = D().reactions[id];
    if (!rx) return escH(id);
    const from = Object.keys(rx.reactants || {}).map(nameOf).join(' + ');
    const to = Object.keys(rx.products || {}).map(nameOf).join(' + ') || (RU() ? 'без продукта' : 'no product');
    const note = REACTION_NOTES[id] ? ` — ${escH(REACTION_NOTES[id][RU() ? 'ru' : 'en'])}` : '';
    return `${escH(from)} &rarr; ${escH(to)} <span class="mix-rx-id">${escH(id)}</span>${note}`;
  }

  function renderCompat(result) {
    const ru = RU();
    const { active, others } = result.compat;
    const bad = active.reactions.length > 0;
    const head = bad
      ? `<div class="mix-compat-title">&#9888; ${ru ? `Смешивать нельзя (${escH(forkName(active.fork))})` : `Do not mix (${escH(forkName(active.fork))})`}</div>
         ${active.reactions.map(id => `<div class="mix-compat-line">${reactionText(id)}</div>`).join('')}
         <div class="mix-compat-line">${ru ? 'Уберите из смеси один из компонентов этой реакции или делайте смеси раздельно.' : 'Drop one of that reaction\'s components from the mix, or make separate mixes.'}</div>`
      : `<div class="mix-compat-title">&#10003; ${ru ? `Компоненты не реагируют друг с другом (симулятор, ${escH(forkName(active.fork))})` : `The components do not react with each other (simulator, ${escH(forkName(active.fork))})`}</div>`;
    const reacting = others.filter(o => o.reactions.length);
    const calm = others.filter(o => !o.reactions.length);
    const elsewhere = [
      calm.length ? `<div class="mix-compat-line mix-compat-calm">${ru ? 'Так же спокойно' : 'Just as calm on'}: ${calm.map(o => escH(forkName(o.fork))).join(', ')}</div>` : '',
      ...reacting.map(o => `<div class="mix-compat-line mix-compat-warn">&#9888; ${ru ? 'На' : 'On'} ${escH(forkName(o.fork))}: ${o.reactions.map(reactionText).join('; ')}</div>`),
    ].join('');
    return `<div class="mix-compat ${bad ? 'mix-compat-bad' : 'mix-compat-ok'}">${head}${elsewhere}</div>`;
  }

  function renderNote(result) {
    const ru = RU();
    const { mix, snap, layout } = result;
    if (mix.mode === 'pills') {
      const nudged = Math.abs(layout.dose - layout.askedDose) > 0.001;
      if (!nudged && snap.mode !== 'exact') return '';
      const why = snap.mode === 'exact'
        ? (ru ? 'кратность 5u не подобрать без перерасхода больше четверти — части в дробях' : 'no 5u step within a quarter of overshoot — the parts stay fractional')
        : (ru ? `чтобы каждая часть в таблетнице была кратна ${snap.mode === 'pour' ? '5u' : '1u'}` : `so every part of a bottle lands on ${snap.mode === 'pour' ? '5u' : '1u'}`);
      return `<div class="plan-note"><div class="plan-note-title">${ru ? 'Доза пересчитана' : 'Dose adjusted'}</div><div class="plan-note-line">${u(layout.askedDose)} &rarr; <strong>${u(round2(layout.dose))}</strong> ${ru ? 'в таблетке' : 'a pill'} <span class="plan-note-why">(${why})</span></div></div>`;
    }
    const asked = Number(mix.volume) || 0;
    if (snap.mode !== 'exact' && Math.abs(snap.total - asked) < 0.001) return '';
    const why = snap.mode === 'exact'
      ? (ru ? 'кратность 5u не подобрать без перерасхода больше четверти — части в дробях' : 'no 5u step within a quarter of overshoot — the parts stay fractional')
      : (ru ? `кратно ${u(snap.step)} — каждая часть кратна ${snap.mode === 'pour' ? '5u' : '1u'}` : `in steps of ${u(snap.step)} — every part lands on ${snap.mode === 'pour' ? '5u' : '1u'}`);
    return `<div class="plan-note"><div class="plan-note-title">${ru ? 'Объём пересчитан' : 'Volume adjusted'}</div><div class="plan-note-line">${u(asked)} &rarr; <strong>${u(snap.total)}</strong> <span class="plan-note-why">(${why})</span></div></div>`;
  }

  function renderComposition(result) {
    const ru = RU();
    const rows = result.amounts.map(a => {
      const brewed = result.brewed[a.id] || a.amount;
      const left = round2(brewed - a.amount);
      return `<tr><td>${escH(nameOf(a.id))}</td><td class="mix-num">${a.parts}</td><td class="mix-num">${u(a.amount)}</td><td class="mix-num">${u(brewed)}</td><td class="mix-num">${left > 0.001 ? u(left) : '—'}</td></tr>`;
    }).join('');
    return `<div class="calc-section mix-composition">
      <h3>${ru ? 'Состав смеси' : 'Mix composition'}: ${u(result.total)}</h3>
      <div class="mix-table-wrap"><table class="mix-table">
        <thead><tr><th>${ru ? 'Компонент' : 'Component'}</th><th>${ru ? 'Доли' : 'Parts'}</th><th>${ru ? 'В смесь' : 'Into the mix'}</th><th>${ru ? 'Сварить' : 'Brew'}</th><th>${ru ? 'Останется' : 'Left over'}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }

  function renderPills(result) {
    if (result.mix.mode !== 'pills') return '';
    const ru = RU();
    const L = result.layout;
    const dose = u(round2(L.dose));
    const lines = L.loads.map((load, k) => `<div class="vplan-line">${ru ? 'Загрузка' : 'Press'} ${k + 1}: ${u(load.volume)} ${ru ? 'смеси в буфер' : 'of the mix into the buffer'} &rarr; ${ru ? 'выберите' : 'select'} ${plural(load.bottles, ['пустую таблетницу', 'пустые таблетницы', 'пустых таблетниц'], ['empty pill bottle', 'empty pill bottles'])}, ${ru ? 'по' : ''} ${plural(L.perBottle, ['таблетке', 'таблетки', 'таблеток'], ['pill each', 'pills each'])} &rarr; <strong>${plural(load.pills, ['таблетка', 'таблетки', 'таблеток'], ['pill', 'pills'])} ${ru ? 'по' : 'of'} ${dose}</strong></div>`).join('');
    const pills = L.loads.reduce((a, l) => a + l.pills, 0);
    return `<div class="calc-section mix-pills">
      <h3>${ru ? 'Таблетки в ChemMaster' : 'Pills in the ChemMaster'}</h3>
      ${lines}
      <div class="vessel-totals">${ru ? 'Итого' : 'Total'}: ${plural(pills, ['таблетка', 'таблетки', 'таблеток'], ['pill', 'pills'])} ${ru ? 'по' : 'of'} ${dose} ${ru ? 'в' : 'in'} ${plural(L.bottles, ['таблетнице', 'таблетницах', 'таблетницах'], ['bottle', 'bottles'])}</div>
    </div>`;
  }

  function renderSteps(result, instances) {
    const ru = RU();
    if (V() && instances && instances.length) {
      return V().renderSection(result.planWithMix, instances, { destination: result.mix.mode === 'pills' ? CHEMMASTER : null });
    }
    const brew = typeof renderPlanSteps === 'function' ? renderPlanSteps(result.plan.steps, 0) : '';
    const n = result.plan.steps.length + 1;
    const into = result.mix.mode === 'pills' ? (ru ? 'в буфер ChemMaster' : 'into the ChemMaster buffer') : (ru ? 'в одну ёмкость' : 'into one vessel');
    const last = `<div class="step-item"><span class="step-num">${n}.</span> ${ru ? 'Смешайте' : 'Mix'} ${into}: ${result.amounts.map(a => `${u(a.amount)} ${escH(nameOf(a.id))}`).join(' + ')}</div>`;
    return `<div class="calc-section"><h3>${ru ? 'Шаги' : 'Steps'} (${n})</h3>${brew}${last}</div>`;
  }

  function renderResults(result, instances) {
    const ru = RU();
    if (!result.amounts.length) return `<p class="mix-empty">${ru ? 'В смеси нет ни одного реагента с долей больше нуля.' : 'The mix has no reagent with a part above zero.'}</p>`;
    const inst = instances !== undefined ? instances : (V() ? V().expand(V().inventory(SRC())) : []);
    const warnings = (typeof checkCalcWarnings === 'function' ? checkCalcWarnings(result.plan.totalBase, result.plan.steps) : '')
      + (typeof renderPlanWarnings === 'function' ? renderPlanWarnings(result.plan) : '');
    return `${renderCompat(result)}${renderNote(result)}${warnings}${renderComposition(result)}
      <div class="calc-section">
        <h3>${ru ? 'Список закупки' : 'Shopping list'}</h3>
        ${typeof renderPlanShopping === 'function' ? renderPlanShopping(result.plan.totalBase, result.plan.catalystNeeds) : ''}
      </div>
      ${renderSteps(result, inst)}${renderPills(result)}`;
  }

  // ── section UI (R17) ─────────────────────────────────────
  const state = { components: [], mode: 'pills', bottles: 2, dose: 15, volume: 300 };

  function loadState() {
    const saved = session().mix;
    if (saved && Array.isArray(saved.components)) Object.assign(state, saved);
  }

  function saveState() {
    saveSession({ mix: { components: state.components, mode: state.mode, bottles: state.bottles, dose: state.dose, volume: state.volume } });
  }

  function renderPresets() {
    const bar = document.getElementById('mixPresetBar');
    if (!bar) return;
    const ru = RU();
    const family = V() ? V().familyFor(SRC()) : 'vanilla';
    if (family !== 'cm') {
      bar.innerHTML = `<p class="mix-empty">${ru
        ? 'Готовые смеси — для CM-серверов: выберите «CM» в панели посуды или форк RMC14. Свою смесь можно собрать из любых реагентов.'
        : 'Ready mixes are for CM servers: pick «CM» in the vessel panel or the RMC14 fork. You can build your own mix from any reagents.'}</p>`;
      return;
    }
    bar.innerHTML = PRESETS.map(p => `<button type="button" class="preset-chip" data-preset="${p.key}" title="${escH(ru ? p.noteRu : p.noteEn)}">${escH(ru ? p.ru : p.en)}${p.community
      ? `<span class="preset-tier-label">${ru ? 'со слов игроков' : 'player-made'}</span>` : ''}</button>`).join('');
  }

  function renderRows() {
    const host = document.getElementById('mixRows');
    if (!host) return;
    const ru = RU();
    host.innerHTML = state.components.length ? state.components.map((c, i) => {
      const r = D().reagents[c.id];
      return `<div class="mix-row" data-i="${i}">
        <span class="color-swatch" style="background:${typeof safeColor === 'function' ? safeColor(r && r.color) : '#888'}"></span>
        <span class="mix-name">${escH(nameOf(c.id))}</span>
        <label class="mix-parts">${ru ? 'доли' : 'parts'} <input type="number" min="0.5" max="100" step="0.5" value="${Number(c.parts)}" data-act="parts" aria-label="${ru ? 'Доли в смеси' : 'Parts in the mix'}"></label>
        <button type="button" class="vessel-remove" data-act="remove" aria-label="${ru ? 'Убрать из смеси' : 'Remove from the mix'}">&times;</button>
      </div>`;
    }).join('') : `<p class="mix-empty">${ru ? 'Добавьте лекарства ниже или выберите готовую смесь.' : 'Add medicines below or pick a ready mix.'}</p>`;
  }

  function renderOutput() {
    const host = document.getElementById('mixOutput');
    if (!host) return;
    const ru = RU();
    const pills = state.mode === 'pills';
    host.innerHTML = `
      <label class="mix-mode"><input type="radio" name="mixMode" value="pills" data-act="mode"${pills ? ' checked' : ''}> ${ru ? 'Таблетки' : 'Pills'}:</label>
      <span class="mix-fields">
        <input type="number" class="search-input mix-num-input" min="1" max="64" step="1" value="${Number(state.bottles)}" data-act="bottles"${pills ? '' : ' disabled'} aria-label="${ru ? 'Таблетниц' : 'Pill bottles'}">
        ${ru ? 'таблетниц по 16 таблеток, доза' : 'pill bottles of 16 pills, dose'}
        <input type="number" class="search-input mix-num-input" min="0.5" max="60" step="0.5" value="${Number(state.dose)}" data-act="dose"${pills ? '' : ' disabled'} aria-label="${ru ? 'Доза в таблетке, u' : 'Dose per pill, u'}">u
      </span>
      <label class="mix-mode"><input type="radio" name="mixMode" value="volume" data-act="mode"${pills ? '' : ' checked'}> ${ru ? 'Объём' : 'Volume'}:</label>
      <span class="mix-fields">
        <input type="number" class="search-input mix-num-input" min="5" max="9999" step="5" value="${Number(state.volume)}" data-act="volume"${pills ? ' disabled' : ''} aria-label="${ru ? 'Объём смеси, u' : 'Mix volume, u'}">u
      </span>`;
  }

  function plan() {
    const out = document.getElementById('mixResults');
    if (!out) return;
    if (!state.components.length) { out.innerHTML = ''; return; }
    const result = planMix(state, SRC());
    if (typeof track === 'function') track('mix_plan', { components: result.amounts.length, mode: state.mode, ok: result.compat.active.reactions.length ? 0 : 1 });
    out.innerHTML = renderResults(result);
  }

  function wire() {
    const rows = document.getElementById('mixRows');
    if (!rows) return;
    loadState();
    renderPresets();
    renderRows();
    renderOutput();

    const input = document.getElementById('mixInput');
    const suggestions = document.getElementById('mixSuggestions');
    const partsInput = document.getElementById('mixParts');
    let pendingId = null;
    if (typeof setupAutocomplete === 'function') {
      setupAutocomplete(input, suggestions, (id) => {
        pendingId = id;
        input.value = typeof capName === 'function' ? capName((D().reagents[id] || {}).name || id) : id;
        suggestions.classList.remove('open');
      });
    }
    document.getElementById('mixAddBtn').onclick = () => {
      if (!pendingId) return;
      const parts = Math.max(0.5, Number(partsInput.value) || 1);
      const existing = state.components.find(c => c.id === pendingId);
      if (existing) existing.parts = parts; else state.components.push({ id: pendingId, parts });
      pendingId = null;
      input.value = '';
      saveState();
      renderRows();
    };
    rows.onclick = (e) => {
      const btn = e.target.closest('button[data-act="remove"]');
      if (!btn) return;
      state.components.splice(Number(btn.closest('.mix-row').dataset.i), 1);
      saveState();
      renderRows();
    };
    rows.onchange = (e) => {
      const el = e.target.closest('input[data-act="parts"]');
      if (!el) return;
      state.components[Number(el.closest('.mix-row').dataset.i)].parts = Math.max(0.5, Number(el.value) || 1);
      saveState();
    };
    document.getElementById('mixOutput').onchange = (e) => {
      const el = e.target.closest('input[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      if (act === 'mode') state.mode = el.value;
      if (act === 'bottles') state.bottles = Math.max(1, Math.min(64, Math.round(Number(el.value) || 1)));
      if (act === 'dose') state.dose = Math.max(0.5, Math.min(60, Number(el.value) || 15));
      if (act === 'volume') state.volume = Math.max(5, Math.min(9999, Number(el.value) || 300));
      saveState();
      if (act === 'mode') renderOutput();
    };
    document.getElementById('mixPresetBar').onclick = (e) => {
      const btn = e.target.closest('button[data-preset]');
      if (!btn) return;
      const p = PRESETS.find(x => x.key === btn.dataset.preset);
      if (!p) return;
      state.components = p.components.map(([id, parts]) => ({ id, parts }));
      state.mode = p.mode;
      if (p.mode === 'pills') { state.bottles = p.bottles; state.dose = p.dose; } else state.volume = p.volume;
      if (typeof track === 'function') track('mix_preset', { key: p.key });
      saveState();
      renderRows();
      renderOutput();
      plan();
    };
    document.getElementById('mixPlanBtn').onclick = plan;
    const filters = document.getElementById('sourceFilters');
    if (filters) filters.addEventListener('change', () => { renderPresets(); renderRows(); });
    const vesselHost = document.getElementById('vesselPanelHost');
    if (vesselHost) vesselHost.addEventListener('click', (e) => { if (e.target.closest('[data-act="family"]')) setTimeout(renderPresets, 0); });
  }

  window.ChemDBMixes = { PRESETS, CHEMMASTER, REACTION_NOTES, integerParts, snapTotal, pillsLayout, checkForks, compatibility, planMix, renderResults };
  document.addEventListener('app:ready', wire);
})();

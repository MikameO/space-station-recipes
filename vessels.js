// Vessel planner (Series R9–R11): the beakers and tanks the player actually has,
// and which of them each step of a brew plan goes into.
// Spec: docs/design/2026-09-12-vessel-planner.md
//
// Self-wired like botany.js: it reads app.js globals (DATA, activeSource,
// planBatches, simulateBeaker, planName, fmtU, planRu, esc, loadSession,
// saveSession, track) and never writes them. app.js calls in through
// window.ChemDBVessels only to render the steps section of a plan.
(function () {
  'use strict';

  const D = () => (typeof DATA !== 'undefined' ? DATA : window.DATA);
  const SRC = () => (typeof activeSource !== 'undefined' ? activeSource : 'all');
  const RU = () => typeof planRu === 'function' && planRu();

  // heatable = the prototype carries FitsInDispenser, the hotplate's ItemPlacer
  // whitelist (and the electrolysis unit's slot). Read off RMC14, Space Stories
  // and vanilla prototypes on 2026-09-12: RMCJug has no FitsInDispenser, the
  // Stories reagent jug inherits the high-capacity beaker, the RMC reagent tank
  // is a wheeled structure with a fill/drain toggle, and vanilla storage tanks
  // are drain-only — so the vanilla family ships no tank.
  const PRESETS = {
    cm: [
      { key: 'cm-beaker', en: 'Beaker', ru: 'Мензурка', size: 60, heatable: true, count: 0 },
      { key: 'cm-large', en: 'Large beaker', ru: 'Большая мензурка', size: 120, heatable: true, count: 0 },
      { key: 'cm-highcap', en: 'High-capacity beaker', ru: 'Высокоёмкая мензурка', size: 300, heatable: true, count: 1 },
      { key: 'cm-minitank', en: 'MS-11 refill tank', ru: 'Мини-бак', size: 180, heatable: true, count: 0 },
      { key: 'cm-jug', en: 'Jug', ru: 'Канистра', size: 200, heatable: false, count: 0 },
      { key: 'cm-reagentjug', en: 'Reagent jug', ru: 'Большая канистра', size: 500, heatable: true, count: 0, onlyIn: 'stories_cm' },
      { key: 'cm-tank', en: 'Reagent tank', ru: 'Бак', size: 1000, heatable: false, count: 1 },
    ],
    vanilla: [
      { key: 'v-beaker', en: 'Beaker', ru: 'Мензурка', size: 60, heatable: true, count: 0 },
      { key: 'v-large', en: 'Large beaker', ru: 'Большая мензурка', size: 120, heatable: true, count: 1 },
      { key: 'v-jug', en: 'Jug', ru: 'Канистра', size: 240, heatable: false, count: 0 },
      { key: 'v-bluespace', en: 'Bluespace beaker', ru: 'Блюспейс-мензурка', size: 960, heatable: true, count: 0 },
    ],
  };

  function lineage(forkId) {
    const forks = (D() && D().meta && D().meta.forks) || {};
    const chain = [];
    for (let id = forkId; id && !chain.includes(id); id = forks[id] && forks[id].parent) chain.push(id);
    return chain;
  }

  function familyOf(forkId) {
    return lineage(forkId).includes('rmc14') ? 'cm' : 'vanilla';
  }

  function presetFor(forkId) {
    const chain = lineage(forkId);
    return PRESETS[familyOf(forkId)]
      .filter(r => !r.onlyIn || chain.includes(r.onlyIn))
      .map(r => ({ key: r.key, en: r.en, ru: r.ru, size: r.size, heatable: r.heatable, count: r.count, custom: false }));
  }

  function inventory(forkId) {
    const saved = (loadSession().vessels || {})[familyOf(forkId)];
    return Array.isArray(saved) && saved.length ? saved : presetFor(forkId);
  }

  function saveInventory(forkId, rows) {
    const all = Object.assign({}, loadSession().vessels || {});
    all[familyOf(forkId)] = rows;
    saveSession({ vessels: all });
  }

  // One instance per physical vessel, biggest first. At equal size the vessel
  // that does not heat goes first, so a cold step takes the tank and leaves the
  // beaker free for a step that needs the hotplate.
  function expand(rows) {
    const out = [];
    for (const r of rows || []) {
      const n = Math.max(0, Math.floor(Number(r.count) || 0));
      const size = Number(r.size) || 0;
      if (size <= 0) continue;
      for (let i = 1; i <= n; i++) {
        out.push({ key: r.key, label: RU() ? r.ru : r.en, size, heatable: !!r.heatable, n: i });
      }
    }
    return out.sort((a, b) => b.size - a.size || Number(a.heatable) - Number(b.heatable));
  }

  // ── assignment (R10) ─────────────────────────────────────
  const EPS = 0.001;
  const round2 = (n) => Math.round(n * 100) / 100;
  const volumeOf = (c) => round2(Object.values(c).reduce((a, b) => a + b, 0));
  const isHot = (s) => !!(s.minTemp || s.maxTemp);
  const isMixer = (s) => !!(s.mixer && s.mixer.length);
  const stepVolume = (s) => s.reactants.reduce((a, r) => a + r.amount, 0);

  function addTo(contents, id, amount) {
    const v = round2((contents[id] || 0) + amount);
    if (v <= EPS) delete contents[id]; else contents[id] = v;
  }

  function stepTemp(s) {
    if (s.minTemp && s.maxTemp) return (s.minTemp + s.maxTemp) / 2;
    if (s.minTemp) return s.minTemp + 1;
    if (s.maxTemp) return s.maxTemp - 1;
    return 293;
  }

  // The beaker simulator's verdict on these contents: exactly this step's
  // reaction, and the whole of its product. A hair is added to every amount
  // because simulateBeaker counts runs with Math.floor, and 90u of a
  // 0.9u-per-run reactant is 99.999… runs in floating point.
  function simulate(contents, step, cache) {
    if (typeof simulateBeaker !== 'function') return { ok: true, extra: [] };
    const key = cache && `${step.rxnId}|${stepTemp(step)}|${Object.keys(contents).sort().map(k => `${k}:${contents[k]}`).join(',')}`;
    if (cache && cache.has(key)) return cache.get(key);
    const padded = {};
    for (const [id, amt] of Object.entries(contents)) padded[id] = amt + 1e-6;
    const res = simulateBeaker(padded, stepTemp(step));
    const ids = res.log.map(l => l.id);
    const extra = [...new Set(ids.filter(id => id !== step.rxnId))];
    const made = (res.final[step.reagentId] || 0) - (contents[step.reagentId] || 0);
    const out = { ok: !extra.length && ids.includes(step.rxnId) && made + 0.01 >= step.amount, extra };
    if (cache) cache.set(key, out);
    return out;
  }

  // Lay plan.steps (leaves first, as planBrew sorts them) over the instances,
  // taking choose(stepIndex, options) at every step. Options come in base
  // order: fresh vessels that take the step in one wave (best fit), then chains,
  // then fresh vessels too small for one wave (largest first), then a missing
  // vessel only when nothing else exists. A chain never saves a mix when a free
  // vessel already takes the step in one wave, but it keeps a big vessel busy —
  // CMClonexadone's 150u step chained into the tank its 1065u step needed.
  function assignWith(plan, instances, choose, cache) {
    const vessels = (instances || []).map(inst => Object.assign({}, inst,
      { contents: {}, records: [], peak: 0, missing: null, virtual: false, mixer: false }));
    const extra = [];
    const transfers = [];
    const stock = {};
    const produced = new Set(plan.steps.map(s => s.reagentId));
    const needBy = {};
    for (const s of plan.steps) {
      for (const r of s.reactants) {
        if (!r.catalyst && produced.has(r.id)) (needBy[r.id] = needBy[r.id] || []).push({ step: s, amount: r.amount });
      }
    }

    const holds = (v) => Object.values(stock).some(list => list.some(e => e.v === v && e.amount > EPS));

    function take(id, amount, toV) {
      let left = amount;
      for (const e of (stock[id] || []).slice().sort((a, b) => b.amount - a.amount)) {
        if (left <= EPS) break;
        const part = round2(Math.min(e.amount, left));
        if (e.v !== toV) {
          transfers.push({ from: e.v, to: toV, reagentId: id, amount: part });
          addTo(e.v.contents, id, -part);
          addTo(toV.contents, id, part);
        }
        e.amount = round2(e.amount - part);
        left = round2(left - part);
      }
      stock[id] = (stock[id] || []).filter(e => e.amount > EPS);
    }

    function makeExtra(fields) {
      const v = Object.assign({ key: fields.mixer ? 'mixer' : 'missing', label: '', size: Infinity, heatable: true,
        n: extra.filter(x => !!x.mixer === !!fields.mixer).length + 1,
        contents: {}, records: [], peak: 0, missing: null, virtual: false, mixer: false }, fields);
      extra.push(v);
      return v;
    }

    function missingFor(step, eligible) {
      const kin = vessels.filter(eligible);
      if (kin.length) {
        return makeExtra({ label: kin[0].label, size: kin[0].size, heatable: kin[0].heatable, virtual: true,
          missing: { size: kin[0].size, heatable: kin[0].heatable, reason: 'busy' } });
      }
      const size = Math.ceil(stepVolume(step) / 5) * 5;
      return makeExtra({ size, heatable: isHot(step), virtual: true,
        missing: { size, heatable: isHot(step), reason: 'none' } });
    }

    function storeRemainder(id, amount, fromV) {
      const free = vessels.filter(v => v !== fromV && !holds(v));
      let to = free.filter(v => v.size + EPS >= amount).sort((a, b) => a.size - b.size)[0] || free[0];
      if (!to) to = makeExtra({ size: Math.ceil(amount / 5) * 5, heatable: false, virtual: true,
        missing: { size: Math.ceil(amount / 5) * 5, heatable: false, reason: 'store' } });
      to.contents = {};
      transfers.push({ from: fromV, to, reagentId: id, amount });
      addTo(fromV.contents, id, -amount);
      addTo(to.contents, id, amount);
      const e = stock[id].find(x => x.v === fromV);
      e.amount = round2(e.amount - amount);
      stock[id].push({ v: to, amount });
      to.records.push({ store: true, reagentId: id, amount });
      to.peak = Math.max(to.peak, volumeOf(to.contents));
    }

    // Volume this step adds to a vessel that already holds `chainedId`.
    function addedVolume(step, v, chainedId) {
      let vol = 0;
      for (const r of step.reactants) {
        if (r.catalyst) { vol += Math.max(0, r.amount - (v.contents[r.id] || 0)); continue; }
        if (r.id !== chainedId) vol += r.amount;
      }
      return vol;
    }

    function fill(step, v, chainedId) {
      const pours = [];
      for (const r of step.reactants) {
        if (r.catalyst) {
          const need = round2(r.amount - (v.contents[r.id] || 0));
          if (need > EPS) { addTo(v.contents, r.id, need); pours.push({ reagentId: r.id, amount: need, catalyst: true }); }
        } else if (r.id === chainedId) {
          // already in the vessel
        } else if (produced.has(r.id)) {
          take(r.id, r.amount, v);
        } else {
          addTo(v.contents, r.id, r.amount);
          pours.push({ reagentId: r.id, amount: r.amount, catalyst: false });
        }
      }
      return pours;
    }

    function react(step, v, chainedId) {
      for (const r of step.reactants) if (!r.catalyst) addTo(v.contents, r.id, -r.amount);
      if (chainedId) {
        const used = step.reactants.find(r => r.id === chainedId).amount;
        const e = (stock[chainedId] || []).find(x => x.v === v);
        if (e) e.amount = round2(e.amount - used);
        stock[chainedId] = (stock[chainedId] || []).filter(x => x.amount > EPS);
      }
      addTo(v.contents, step.reagentId, step.amount);
      (stock[step.reagentId] = stock[step.reagentId] || []).push({ v, amount: step.amount });
    }

    plan.steps.forEach((step, i) => {
      const hot = isHot(step);
      const eligible = (v) => !hot || v.heatable;
      const options = [];
      if (isMixer(step)) {
        options.push({ type: 'mixer' });
      } else {
        const chains = [];
        for (const r of step.reactants) {
          if (r.catalyst || !needBy[r.id] || !stock[r.id]) continue;
          const largest = needBy[r.id].reduce((a, b) => (b.amount > a.amount ? b : a));
          if (largest.step !== step) continue;
          for (const e of stock[r.id].slice().sort((a, b) => b.v.size - a.v.size)) {
            const v = e.v;
            if (v.mixer || v.virtual || !eligible(v)) continue;
            const remainder = round2(e.amount - r.amount);
            if (remainder < -EPS) continue;
            if (volumeOf(v.contents) - remainder + addedVolume(step, v, r.id) > v.size + EPS) continue;
            const hypo = Object.assign({}, v.contents);
            addTo(hypo, r.id, -remainder);
            for (const x of step.reactants) {
              if (x.id === r.id) continue;
              if (x.catalyst) hypo[x.id] = Math.max(hypo[x.id] || 0, x.amount);
              else addTo(hypo, x.id, x.amount);
            }
            const sim = simulate(hypo, step, cache);
            if (sim.ok) chains.push({ type: 'chain', v, via: r.id, remainder, sim });
          }
        }
        const vol = stepVolume(step);
        const fresh = vessels.filter(v => eligible(v) && !holds(v)).sort((a, b) => {
          const fa = a.size + EPS >= vol, fb = b.size + EPS >= vol;
          if (fa !== fb) return fa ? -1 : 1;
          if (!fa) return b.size - a.size;
          if (!hot && a.heatable !== b.heatable) return a.heatable ? 1 : -1;
          return a.size - b.size;
        });
        for (const v of fresh.filter(x => x.size + EPS >= vol)) options.push({ type: 'new', v });
        options.push(...chains);
        for (const v of fresh.filter(x => x.size + EPS < vol)) options.push({ type: 'new', v });
        if (!options.length) options.push({ type: 'missing' });
      }

      const opt = choose(i, options);
      let v;
      let chainedId = null;
      let sim = null;
      if (opt.type === 'mixer') {
        v = makeExtra({ mixer: true, mixerType: step.mixer.join(', ') });
      } else if (opt.type === 'chain') {
        v = opt.v; chainedId = opt.via; sim = opt.sim;
        if (opt.remainder > EPS) storeRemainder(opt.via, opt.remainder, v);
      } else {
        v = opt.type === 'new' ? opt.v : missingFor(step, eligible);
        v.contents = {};
      }

      const pours = fill(step, v, chainedId);
      v.peak = Math.max(v.peak, volumeOf(v.contents));
      if (!sim && !v.mixer) sim = simulate(v.contents, step, cache);
      let waves = 1;
      let batch = null;
      if (opt.type !== 'chain' && !v.mixer && typeof planBatches === 'function') {
        const b = planBatches(step, v.size);
        if (b && b.impossible) v.missing = v.missing || { size: Math.ceil(b.volPerRun / 5) * 5, heatable: hot, reason: 'run' };
        else if (b && b.batches > 1) { waves = b.batches; batch = b; }
      }
      react(step, v, chainedId);
      v.records.push({ index: i + 1, step, type: opt.type, chained: opt.type === 'chain', pours, sim, waves, batch });
    });

    const used = vessels.concat(extra).filter(v => v.records.length);
    const stepRecords = used.flatMap(v => v.records.filter(r => r.step));
    return {
      vessels: used,
      transfers,
      totals: {
        mixes: stepRecords.reduce((a, r) => a + r.waves, 0),
        vessels: used.filter(v => !v.mixer).length,
        transfers: transfers.length,
      },
      missing: used.filter(v => v.missing),
    };
  }

  // Fewest mixes, then fewest transfers, then fewest vessels.
  const better = (a, b) => a.totals.mixes - b.totals.mixes || a.totals.transfers - b.totals.transfers || a.totals.vessels - b.totals.vessels;

  // Plain greedy is myopic, and the brute-force oracle caught it: CMClonexadone
  // chained its 150u Cryoxadone step into the tank, which then was not free for
  // the 1065u step that followed (6 mixes where 4 were possible), and
  // CMImidazoline gave its 150u first step the 300u beaker the 450u second step
  // needed (5 instead of 4). So every step is a rollout: try each option, finish
  // the plan greedily, keep the best. The greedy option is always among those
  // tried, so this is never worse than greedy, and it stays polynomial.
  // opts.choose bypasses it — the oracle drives assignWith directly.
  function assign(plan, instances, opts) {
    const cache = new Map();
    if (opts && opts.choose) return assignWith(plan, instances, opts.choose, cache);
    const prefix = [];
    let best = null;
    for (let i = 0; i < plan.steps.length; i++) {
      let count = 1;
      best = null;
      for (let k = 0; k < count; k++) {
        const res = assignWith(plan, instances, (j, options) => {
          if (j === i) count = options.length;
          return options[j < i ? prefix[j] : (j === i ? k : 0)];
        }, cache);
        if (!best || better(res, best.res) < 0) best = { k, res };
      }
      prefix.push(best.k);
    }
    return best ? best.res : assignWith(plan, instances, (j, options) => options[0], cache);
  }

  // ── rendering and panel (R11) ────────────────────────────
  const escH = (s) => (typeof esc === 'function' ? esc(String(s)) : String(s));
  const u = (n) => `${typeof fmtU === 'function' ? fmtU(n) : n}u`;
  const nameOf = (id) => (typeof planName === 'function' ? planName(id) : id);
  const plural = (n, ruForms, enForms) => (typeof planPlural === 'function'
    ? planPlural(n, RU() ? ruForms : enForms) : `${n} ${enForms[n === 1 ? 0 : 1]}`);

  function vesselTitle(v) {
    const ru = RU();
    if (v.mixer) return `${ru ? 'Миксер' : 'Mixer'} · ${escH(v.mixerType)}`;
    const base = v.label || (ru ? 'Ёмкость' : 'Vessel');
    const heat = v.heatable ? (ru ? 'греется' : 'heats') : (ru ? 'не греется' : 'no heat');
    return `${escH(base)} ${u(v.size)} №${v.n} · ${heat}`;
  }

  function missingText(m) {
    const ru = RU();
    if (m.reason === 'busy') return ru ? `все такие ёмкости заняты — нужна ещё одна на ${u(m.size)}` : `every vessel of this kind is busy — bring one more of ${u(m.size)}`;
    if (m.reason === 'store') return ru ? `некуда отлить остаток — нужна ёмкость на ${u(m.size)}` : `nowhere to hold the remainder — bring a vessel of ${u(m.size)}`;
    if (m.reason === 'run') return ru ? `одна реакция не влезает — нужна ёмкость на ${u(m.size)}` : `a single run does not fit — bring a vessel of ${u(m.size)}`;
    return m.heatable
      ? (ru ? `в наборе нет греющейся ёмкости — нужна на ${u(m.size)}` : `the set has no vessel that heats — needs a vessel that heats, ${u(m.size)}`)
      : (ru ? `в наборе нет подходящей ёмкости — нужна на ${u(m.size)}` : `the set has no vessel for this — bring one of ${u(m.size)}`);
  }

  function renderRecord(rec) {
    const ru = RU();
    if (rec.store) {
      return `<div class="vessel-line vessel-store">${ru ? 'хранит' : 'holds'} ${u(rec.amount)} ${escH(nameOf(rec.reagentId))}</div>`;
    }
    const s = rec.step;
    const pours = rec.pours.map(p => `${u(p.amount)} ${nameOf(p.reagentId)}${p.catalyst ? (ru ? ' (кат)' : ' (cat)') : ''}`).join(' + ');
    const lead = rec.chained ? `&darr; ${ru ? 'долить' : 'pour in'} ` : '';
    const body = pours ? escH(pours) : (ru ? 'перелитое' : 'what was poured over');
    let tags = '';
    if (s.minTemp) tags += ` <span class="step-temp">[&gt;${s.minTemp}K]</span>`;
    if (s.maxTemp) tags += ` <span class="step-temp">[&lt;${s.maxTemp}K]</span>`;
    if (rec.sim && rec.sim.ok) {
      tags += ` <span class="vessel-sim-ok" title="${ru ? 'Симулятор стакана запускает ровно эту реакцию' : 'The beaker simulator runs exactly this reaction'}">&#10003; ${ru ? 'симулятор' : 'simulator'}</span>`;
    } else if (rec.sim) {
      tags += ` <span class="vessel-sim-bad">&#9888; ${ru ? 'симулятор' : 'simulator'}: ${escH(rec.sim.extra.join(', ') || (ru ? 'реакция не пошла' : 'no reaction'))}</span>`;
    }
    let waves = '';
    if (rec.waves > 1 && rec.batch) {
      const parts = rec.batch.full > 1 ? [`${rec.batch.full} &times; ${u(rec.batch.perVol)}`] : [u(rec.batch.perVol)];
      if (rec.batch.restVol) parts.push(u(rec.batch.restVol));
      waves = `<div class="step-batches">${plural(rec.waves, ['волна', 'волны', 'волн'], ['wave', 'waves'])}: ${parts.join(' + ')}</div>`;
    }
    return `<div class="vessel-line"><span class="step-num">${rec.index}.</span> ${lead}${body} &rarr; <strong>${u(s.amount)} ${escH(nameOf(s.reagentId))}</strong>${tags}${waves}</div>`;
  }

  function renderSection(plan, instances) {
    const ru = RU();
    const res = assign(plan, instances);
    if (typeof track === 'function') track('vessel_plan', { mixes: res.totals.mixes, vessels: res.totals.vessels, missing: res.missing.length });
    const catalysts = new Set(plan.steps.flatMap(s => s.reactants.filter(r => r.catalyst).map(r => r.id)));

    const cards = res.vessels.map(v => {
      const cls = ['vessel-card', v.missing ? 'vessel-card-missing' : '', v.mixer ? 'vessel-card-mixer' : ''].filter(Boolean).join(' ');
      const outs = res.transfers.filter(t => t.from === v).map(t =>
        `<div class="vessel-line vessel-transfer">&rarr; ${ru ? 'перелить' : 'pour'} ${u(t.amount)} ${escH(nameOf(t.reagentId))} ${ru ? 'в' : 'into'} ${vesselTitle(t.to)}</div>`).join('');
      const left = Object.entries(v.contents).filter(([id]) => catalysts.has(id)).map(([id, amt]) =>
        `<div class="vessel-line vessel-leftover">&#8505; ${u(amt)} ${escH(nameOf(id))} ${ru ? 'останется в ёмкости' : 'left in the vessel'}</div>`).join('');
      const miss = v.missing ? `<div class="vessel-line vessel-missing-text">${missingText(v.missing)}</div>` : '';
      return `<div class="${cls}"><div class="vessel-card-title">${vesselTitle(v)}</div>${miss}${v.records.map(renderRecord).join('')}${outs}${left}</div>`;
    }).join('');

    const warn = res.missing.length ? `<div class="warning-box"><div class="warning-box-title">${ru ? 'Не хватает посуды' : 'Not enough vessels'}</div>${
      res.missing.map(v => `<div class="warning-item"><span class="warning-icon">&#9888;</span> <span>${missingText(v.missing)}</span></div>`).join('')}</div>` : '';
    const totals = `<div class="vessel-totals">${ru ? 'Итог' : 'Total'}: ${[
      plural(res.totals.mixes, ['смешивание', 'смешивания', 'смешиваний'], ['mix', 'mixes']),
      plural(res.totals.vessels, ['ёмкость', 'ёмкости', 'ёмкостей'], ['vessel', 'vessels']),
      plural(res.totals.transfers, ['переливание', 'переливания', 'переливаний'], ['transfer', 'transfers']),
    ].join(' · ')}</div>`;

    return `<div class="calc-section vessel-section">
      <h3>${ru ? 'Шаги смешивания' : 'Mixing Steps'} (${plan.steps.length})</h3>
      ${warn}${cards}${totals}
    </div>`;
  }

  function panelSummary(rows) {
    const ru = RU();
    const items = rows.filter(r => Number(r.count) > 0).map(r => `${r.count}×${ru ? r.ru : r.en} ${u(r.size)}`);
    return items.length ? items.join(' · ') : (ru ? 'не задана — шаги без деления' : 'none — steps are not split');
  }

  // The panel is rebuilt from `rows` on every change; handlers are assigned as
  // properties so a remount on a fork change never stacks listeners.
  function mountPanel(host, onChange) {
    if (!host) return;
    const forkId = SRC();
    const ru = RU();
    let rows = inventory(forkId).map(r => Object.assign({}, r));

    function render() {
      const wasOpen = !!(host.querySelector('details') && host.querySelector('details').open);
      host.innerHTML = `<details class="vessel-panel"${wasOpen ? ' open' : ''}>
        <summary><span class="vessel-panel-title">${ru ? 'Посуда' : 'Vessels'}</span>: <span class="vessel-panel-summary">${escH(panelSummary(rows))}</span></summary>
        <div class="vessel-rows">${rows.map((r, i) => `<div class="vessel-row" data-i="${i}">
          <span class="vessel-name">${escH(ru ? r.ru : r.en)}</span>
          <label class="vessel-size"><input type="number" min="5" max="9999" step="5" value="${Number(r.size)}" data-act="size" aria-label="${ru ? 'Объём, u' : 'Volume, u'}">u</label>
          <label class="vessel-heat"><input type="checkbox" data-act="heat"${r.heatable ? ' checked' : ''}> ${ru ? 'греется' : 'heats'}</label>
          <span class="vessel-stepper"><button type="button" data-act="dec" aria-label="${ru ? 'Меньше' : 'Fewer'}">&minus;</button><span class="vessel-count">${Number(r.count)}</span><button type="button" data-act="inc" aria-label="${ru ? 'Больше' : 'More'}">+</button></span>
          ${r.custom ? `<button type="button" class="vessel-remove" data-act="remove" aria-label="${ru ? 'Убрать' : 'Remove'}">&times;</button>` : ''}
        </div>`).join('')}</div>
        <div class="vessel-panel-foot">
          <button type="button" class="btn-small" data-act="add">+ ${ru ? 'своя ёмкость' : 'custom vessel'}</button>
          <button type="button" class="btn-small" data-act="reset">${ru ? 'сбросить к пресету' : 'reset to preset'}</button>
          ${familyOf(forkId) === 'vanilla' ? `<span class="vessel-note">${ru
            ? 'В ванили резервуары только сливные — ёмкость без нагрева добавляйте, если на вашем сервере в неё можно наливать.'
            : 'Vanilla storage tanks are drain-only — add a vessel that does not heat only if your server lets you pour into it.'}</span>` : ''}
        </div>
      </details>`;
    }

    function commit(reason) {
      saveInventory(forkId, rows);
      if (typeof track === 'function') track('vessel_inventory_change', { family: familyOf(forkId), rows: rows.length, reason });
      render();
      if (onChange) onChange();
    }

    host.onclick = (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const rowEl = btn.closest('.vessel-row');
      const i = rowEl ? Number(rowEl.dataset.i) : -1;
      const act = btn.dataset.act;
      if (act === 'inc') rows[i].count = Math.min(99, Number(rows[i].count) + 1);
      else if (act === 'dec') rows[i].count = Math.max(0, Number(rows[i].count) - 1);
      else if (act === 'remove') rows.splice(i, 1);
      else if (act === 'add') rows.push({ key: `custom-${Date.now()}`, en: 'Custom vessel', ru: 'Своя ёмкость', size: 300, heatable: true, count: 1, custom: true });
      else if (act === 'reset') rows = presetFor(forkId);
      commit(act);
    };
    host.onchange = (e) => {
      const input = e.target.closest('input[data-act]');
      if (!input) return;
      const i = Number(input.closest('.vessel-row').dataset.i);
      if (input.dataset.act === 'size') rows[i].size = Math.max(5, Math.min(9999, Math.round(Number(input.value) || rows[i].size)));
      if (input.dataset.act === 'heat') rows[i].heatable = input.checked;
      commit(input.dataset.act);
    };
    render();
  }

  // A result already on screen is re-planned for the new vessel set. The two
  // planners clear each other's output, so at most one of them is showing.
  function replanShown() {
    const calcShown = !!(document.getElementById('calcResults') || {}).innerHTML;
    const batchShown = !!(document.getElementById('batchResults') || {}).innerHTML;
    if (calcShown) document.getElementById('calcBtn').click();
    else if (batchShown) document.getElementById('batchPlanBtn').click();
  }

  function wire() {
    const host = document.getElementById('vesselPanelHost');
    if (!host) return;
    mountPanel(host, replanShown);
    const filters = document.getElementById('sourceFilters');
    if (filters) filters.addEventListener('change', () => mountPanel(host, replanShown));
  }

  window.ChemDBVessels = {
    familyOf, presetFor, inventory, saveInventory, expand,
    assign: typeof assign === 'function' ? assign : undefined,
    renderSection: typeof renderSection === 'function' ? renderSection : undefined,
    mountPanel: typeof mountPanel === 'function' ? mountPanel : undefined,
  };
  if (typeof wire === 'function') document.addEventListener('app:ready', wire);
})();

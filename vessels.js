// Vessel planner (Series R9–R11, R14–R15): the beakers and tanks the player
// actually has, which of them each step of a brew plan goes into, and the order
// to do it in. Specs: docs/design/2026-09-12-vessel-planner.md,
// docs/design/2026-09-13-mixture-planner.md
//
// Self-wired like botany.js: it reads app.js globals (DATA, activeSource,
// planBatches, simulateBeaker, planName, planPlural, fmtU, planRu, esc,
// loadSession, saveSession, track) and never writes them. app.js calls in
// through window.ChemDBVessels to render the steps section of a plan; mixes.js
// appends a final mix step and, for pills, a ChemMaster buffer to mix into.
(function () {
  'use strict';

  const D = () => (typeof DATA !== 'undefined' ? DATA : window.DATA);
  const SRC = () => (typeof activeSource !== 'undefined' ? activeSource : 'all');
  const RU = () => typeof planRu === 'function' && planRu();
  const session = () => (typeof loadSession === 'function' ? loadSession() : {});

  // fits = the prototype carries FitsInDispenser. The dispenser slot, the
  // hotplate's ItemPlacer whitelist and the electrolysis unit's slot all take
  // exactly these. A vessel without it — the RMC reagent tank
  // (RMCToggleableSolutionTransfer, Input / Output), a jug — is filled only by
  // pouring from a beaker and emptied only into one (owner, 2026-09-13: «в них
  // можно заливать только из других мензурок»). Read off RMC14, Space Stories
  // and vanilla prototypes: RMCJug has no FitsInDispenser, the Stories reagent
  // jug inherits the high-capacity beaker, vanilla storage tanks are drain-only
  // — so the vanilla family ships no tank. ruGen / ruAcc are the «из …» and
  // «в …» forms the action list needs.
  const PRESETS = {
    cm: [
      { key: 'cm-beaker', en: 'Beaker', ru: 'Мензурка', ruGen: 'Мензурки', ruAcc: 'Мензурку', size: 60, fits: true, count: 0 },
      { key: 'cm-large', en: 'Large beaker', ru: 'Большая мензурка', ruGen: 'Большой мензурки', ruAcc: 'Большую мензурку', size: 120, fits: true, count: 0 },
      { key: 'cm-highcap', en: 'High-capacity beaker', ru: 'Высокоёмкая мензурка', ruGen: 'Высокоёмкой мензурки', ruAcc: 'Высокоёмкую мензурку', size: 300, fits: true, count: 1 },
      { key: 'cm-minitank', en: 'MS-11 refill tank', ru: 'Мини-бак', ruGen: 'Мини-бака', ruAcc: 'Мини-бак', size: 180, fits: true, count: 0 },
      { key: 'cm-jug', en: 'Jug', ru: 'Канистра', ruGen: 'Канистры', ruAcc: 'Канистру', size: 200, fits: false, count: 0 },
      { key: 'cm-reagentjug', en: 'Reagent jug', ru: 'Большая канистра', ruGen: 'Большой канистры', ruAcc: 'Большую канистру', size: 500, fits: true, count: 0, onlyIn: 'stories_cm' },
      { key: 'cm-tank', en: 'Reagent tank', ru: 'Бак', ruGen: 'Бака', ruAcc: 'Бак', size: 1000, fits: false, count: 1 },
    ],
    vanilla: [
      { key: 'v-beaker', en: 'Beaker', ru: 'Мензурка', ruGen: 'Мензурки', ruAcc: 'Мензурку', size: 60, fits: true, count: 0 },
      { key: 'v-large', en: 'Large beaker', ru: 'Большая мензурка', ruGen: 'Большой мензурки', ruAcc: 'Большую мензурку', size: 120, fits: true, count: 1 },
      { key: 'v-jug', en: 'Jug', ru: 'Канистра', ruGen: 'Канистры', ruAcc: 'Канистру', size: 240, fits: false, count: 0 },
      { key: 'v-bluespace', en: 'Bluespace beaker', ru: 'Блюспейс-мензурка', ruGen: 'Блюспейс-мензурки', ruAcc: 'Блюспейс-мензурку', size: 960, fits: true, count: 0 },
    ],
  };
  const CUSTOM = { en: 'Custom vessel', ru: 'Своя ёмкость', ruGen: 'Своей ёмкости', ruAcc: 'Свою ёмкость' };
  const KNOWN = {};
  for (const fam of Object.values(PRESETS)) for (const r of fam) KNOWN[r.key] = r;

  // Rows saved before R14 carry `heatable` and no case forms.
  function normalizeRow(r) {
    const base = KNOWN[r.key] || (r.custom ? CUSTOM : {});
    return {
      key: r.key,
      en: r.en || base.en || 'Vessel',
      ru: r.ru || base.ru || 'Ёмкость',
      ruGen: r.ruGen || base.ruGen || 'Ёмкости',
      ruAcc: r.ruAcc || base.ruAcc || 'Ёмкость',
      size: Number(r.size) || 0,
      fits: r.fits != null ? !!r.fits : !!r.heatable,
      count: Math.max(0, Math.floor(Number(r.count) || 0)),
      custom: !!r.custom,
    };
  }

  function lineage(forkId) {
    const forks = (D() && D().meta && D().meta.forks) || {};
    const chain = [];
    for (let id = forkId; id && !chain.includes(id); id = forks[id] && forks[id].parent) chain.push(id);
    return chain;
  }

  function familyOf(forkId) {
    return lineage(forkId).includes('rmc14') ? 'cm' : 'vanilla';
  }

  // «Все» names no server, so the panel asks. CM by default: tanks exist only
  // there, and a player who never picks a fork should still find them (owner,
  // 2026-09-13: «если не выбрать форк RMC, то не появляются баки»).
  function familyFor(forkId) {
    if (forkId !== 'all') return familyOf(forkId);
    return session().vesselFamilyAll === 'vanilla' ? 'vanilla' : 'cm';
  }

  function presetFor(forkId) {
    const chain = lineage(forkId);
    return PRESETS[familyFor(forkId)]
      .filter(r => !r.onlyIn || chain.includes(r.onlyIn))
      .map(r => normalizeRow(r));
  }

  function inventory(forkId) {
    const saved = (session().vessels || {})[familyFor(forkId)];
    return Array.isArray(saved) && saved.length ? saved.map(normalizeRow) : presetFor(forkId);
  }

  function saveInventory(forkId, rows) {
    const all = Object.assign({}, session().vessels || {});
    all[familyFor(forkId)] = rows;
    saveSession({ vessels: all });
  }

  // One instance per physical vessel, biggest first. At equal size the vessel
  // that does not fit the dispenser goes first, so a cold step takes the tank and
  // leaves the beaker free for measuring and for steps that need the hotplate.
  function expand(rows) {
    const out = [];
    for (const raw of rows || []) {
      const r = normalizeRow(raw);
      if (r.size <= 0) continue;
      for (let i = 1; i <= r.count; i++) {
        out.push({ key: r.key, en: r.en, ru: r.ru, ruGen: r.ruGen, ruAcc: r.ruAcc, label: RU() ? r.ru : r.en, size: r.size, fits: r.fits, n: i });
      }
    }
    return out.sort((a, b) => b.size - a.size || Number(a.fits) - Number(b.fits));
  }

  // ── assignment (R10, R14) ────────────────────────────────
  const EPS = 0.001;
  const round2 = (n) => Math.round(n * 100) / 100;
  const volumeOf = (c) => round2(Object.values(c).reduce((a, b) => a + b, 0));
  const isHot = (s) => !!(s.minTemp || s.maxTemp);
  const isMixer = (s) => !!(s.mixer && s.mixer.length);
  const stepVolume = (s) => s.reactants.reduce((a, r) => a + r.amount, 0);
  const tripsFor = (amount, size) => (amount <= EPS ? 0 : Math.ceil((amount - EPS) / size));

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

  // A mix is fine only if nothing reacts at all: medicines brewed apart must stay
  // what they are once they share a vessel (CMU's CMUCreateSludgeGC turns
  // Bicaridine + Meralyne + Kelotane + Dermaline into black sludge).
  function simulateMix(contents, cache) {
    if (typeof simulateBeaker !== 'function') return { ok: true, extra: [] };
    const key = cache && `mix|${Object.keys(contents).sort().map(k => `${k}:${round2(contents[k])}`).join(',')}`;
    if (cache && cache.has(key)) return cache.get(key);
    const res = simulateBeaker(contents, 293);
    const extra = [...new Set(res.log.map(l => l.id))];
    const out = { ok: !extra.length, extra };
    if (cache) cache.set(key, out);
    return out;
  }

  // Lay plan.steps (leaves first, as planBrew sorts them) over the instances,
  // taking choose(stepIndex, options) at every step. Options come in base order:
  // fresh vessels that take the step in one wave (best fit), then chains, then
  // fresh vessels too small for one wave (largest first), then a missing vessel
  // only when nothing else exists. A chain never saves a mix when a free vessel
  // already takes the step in one wave, but it keeps a big vessel busy —
  // CMClonexadone's 150u step chained into the tank its 1065u step needed.
  function assignWith(plan, instances, choose, cache, opts) {
    opts = opts || {};
    const vessels = (instances || []).map(inst => Object.assign({}, inst,
      { contents: {}, records: [], peak: 0, missing: null, virtual: false, mixer: false, machine: false, used: false }));
    const extra = [];
    const actions = [];
    const stock = {};
    const tally = { transfers: 0, trips: 0, tools: 0 };
    const produced = new Set(plan.steps.filter(s => !s.isMix).map(s => s.reagentId));
    const needBy = {};
    for (const s of plan.steps) {
      for (const r of s.reactants) {
        if (!r.catalyst && produced.has(r.id)) (needBy[r.id] = needBy[r.id] || []).push({ step: s, amount: r.amount });
      }
    }

    const holds = (v) => Object.values(stock).some(list => list.some(e => e.v === v && e.amount > EPS));
    // Take what sits in beakers before what sits in tanks: a beaker emptied by its
    // own pour is free to carry the tank's share next. Mixing Meralyne + Bicaridine
    // on one beaker and one tank found no carrier the other way round.
    const fromBeakersFirst = (reactants) => reactants.slice().sort((a, b) => {
      const rank = (r) => (produced.has(r.id) && (stock[r.id] || []).length && (stock[r.id] || []).every(e => e.v.fits) ? 0 : 1);
      return rank(a) - rank(b);
    });
    const largestFits = () => (vessels.filter(v => v.fits).sort((a, b) => b.size - a.size)[0] || { size: 120 }).size;

    // An empty vessel that fits the dispenser, to measure with or to carry in.
    function freeTool(except) {
      return vessels.filter(v => v.fits && !holds(v) && !except.includes(v))
        .sort((a, b) => b.size - a.size)[0] || null;
    }

    // Trips of a tool of `size` over the waves or loads the amount is split into.
    function spreadTrips(amount, size, shares) {
      if (!shares) return tripsFor(amount, size);
      return shares.reduce((a, share) => a + tripsFor(round2(amount * share), size), 0);
    }

    function carry(fromV, toV, id, amount, kind, shares) {
      let via = null;
      let trips = shares ? shares.length : 1;
      let toolMissing = null;
      if (!fromV.fits && !toV.fits) {
        via = freeTool([fromV, toV]);
        if (via) {
          via.used = true;
          trips = spreadTrips(amount, via.size, shares);
        } else {
          toolMissing = { reason: 'carry', size: largestFits() };
          tally.tools++;
          trips = 0;
        }
      }
      tally.transfers++;
      tally.trips += trips;
      fromV.used = true;
      toV.used = true;
      addTo(fromV.contents, id, -amount);
      addTo(toV.contents, id, amount);
      actions.push({ kind, from: fromV, to: toV, reagentId: id, amount, via, trips, toolMissing });
    }

    function take(id, amount, toV, shares) {
      let left = amount;
      for (const e of (stock[id] || []).slice().sort((a, b) => b.amount - a.amount)) {
        if (left <= EPS) break;
        const part = round2(Math.min(e.amount, left));
        if (e.v !== toV) carry(e.v, toV, id, part, 'transfer', shares);
        e.amount = round2(e.amount - part);
        left = round2(left - part);
      }
      stock[id] = (stock[id] || []).filter(e => e.amount > EPS);
    }

    // Reagents from the dispenser: straight in when the vessel fits the
    // dispenser, otherwise one reagent per trip of an empty beaker, so nothing
    // starts reacting in the measuring vessel.
    function dispense(v, items, chained, shares) {
      if (!items.length) return;
      let via = null;
      let toolMissing = null;
      if (!v.fits) {
        via = freeTool([v]);
        if (via) via.used = true;
        else { toolMissing = { reason: 'measure', size: largestFits() }; tally.tools++; }
      }
      for (const d of items) {
        d.trips = via ? spreadTrips(d.amount, via.size, d.catalyst ? null : shares) : 0;
        tally.trips += d.trips;
      }
      actions.push({ kind: 'dispense', to: v, items, via, toolMissing, chained, waves: shares ? shares.length : 1 });
    }

    function makeExtra(fields) {
      const key = fields.key || 'missing';
      const v = Object.assign({ key, en: 'Vessel', ru: 'Ёмкость', ruGen: 'Ёмкости', ruAcc: 'Ёмкость', size: Infinity, fits: true,
        n: extra.filter(x => x.key === key).length + 1,
        contents: {}, records: [], peak: 0, missing: null, virtual: false, mixer: false, machine: false, used: true }, fields);
      extra.push(v);
      return v;
    }

    function missingFor(step, eligible) {
      const kin = vessels.filter(eligible);
      if (kin.length) {
        return makeExtra({ en: kin[0].en, ru: kin[0].ru, ruGen: kin[0].ruGen, ruAcc: kin[0].ruAcc, size: kin[0].size, fits: kin[0].fits,
          virtual: true, missing: { size: kin[0].size, fits: kin[0].fits, reason: 'busy' } });
      }
      const size = Math.ceil(stepVolume(step) / 5) * 5;
      return makeExtra({ size, fits: true, virtual: true, missing: { size, fits: isHot(step), reason: 'none' } });
    }

    function storeRemainder(id, amount, fromV) {
      const free = vessels.filter(v => v !== fromV && !holds(v));
      let to = free.filter(v => v.size + EPS >= amount).sort((a, b) => a.size - b.size)[0] || free[0];
      if (!to) {
        const size = Math.ceil(amount / 5) * 5;
        to = makeExtra({ size, fits: true, virtual: true, missing: { size, fits: false, reason: 'store' } });
      }
      to.contents = {};
      carry(fromV, to, id, amount, 'store');
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

    function batchShares(batch) {
      if (!batch || batch.batches <= 1 || !batch.total) return null;
      const shares = [];
      for (let k = 0; k < batch.full; k++) shares.push(batch.perVol / batch.total);
      if (batch.restVol) shares.push(batch.restVol / batch.total);
      return shares;
    }

    function fill(step, v, chainedId, batch) {
      const items = [];
      for (const r of fromBeakersFirst(step.reactants)) {
        if (r.catalyst) {
          const need = round2(r.amount - (v.contents[r.id] || 0));
          if (need > EPS) { addTo(v.contents, r.id, need); items.push({ reagentId: r.id, amount: need, catalyst: true }); }
        } else if (r.id === chainedId) {
          // already in the vessel
        } else if (produced.has(r.id)) {
          take(r.id, r.amount, v);
        } else {
          addTo(v.contents, r.id, r.amount);
          items.push({ reagentId: r.id, amount: r.amount, catalyst: false });
        }
      }
      dispense(v, items, !!chainedId, batchShares(batch));
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

    // The final step of a mixture: every component out of the vessel it was
    // brewed in, exactly the amount the mix needs, into one empty vessel (or the
    // ChemMaster buffer, in loads) — no chains, the components stay apart until
    // here.
    function mixStep(step, i) {
      const options = [];
      if (opts.destination) {
        options.push({ type: 'machine' });
      } else {
        const fresh = vessels.filter(v => !holds(v)).sort((a, b) => {
          const fa = a.size + EPS >= step.amount, fb = b.size + EPS >= step.amount;
          if (fa !== fb) return fa ? -1 : 1;
          if (!fa) return b.size - a.size;
          if (a.fits !== b.fits) return a.fits ? 1 : -1;
          return a.size - b.size;
        });
        for (const v of fresh) options.push({ type: 'new', v });
        if (!options.length) options.push({ type: 'missing' });
      }
      const opt = choose(i, options);
      let v;
      if (opt.type === 'machine') {
        v = makeExtra(Object.assign({ machine: true }, opts.destination));
      } else if (opt.type === 'new') {
        v = opt.v;
      } else {
        const size = Math.ceil(step.amount / 5) * 5;
        v = makeExtra({ size, fits: false, virtual: true, missing: { size, fits: false, reason: 'mix' } });
      }
      v.contents = {};
      v.used = true;

      let loads;
      if (step.loads && opt.type === 'machine') {
        loads = step.loads.map(l => l.volume);
      } else {
        const q = step.loadStep || 5;
        const per = Math.max(q, Math.floor(v.size / q) * q);
        loads = [];
        for (let left = step.amount; left > EPS; left = round2(left - per)) loads.push(round2(Math.min(per, left)));
      }
      const shares = loads.length > 1 ? loads.map(vol => vol / step.amount) : null;

      const items = [];
      for (const r of fromBeakersFirst(step.reactants)) {
        if (produced.has(r.id)) take(r.id, r.amount, v, shares);
        else { addTo(v.contents, r.id, r.amount); items.push({ reagentId: r.id, amount: r.amount, catalyst: false }); }
      }
      dispense(v, items, false, shares);
      v.peak = Math.max(v.peak, loads[0]);

      const first = {};
      for (const [id, amt] of Object.entries(v.contents)) first[id] = round2(amt * loads[0] / step.amount);
      const sim = simulateMix(first, cache);
      const rec = { index: i + 1, step, type: opt.type, chained: false, mix: true, sim, waves: loads.length, loads, batch: null };
      v.records.push(rec);
      actions.push(Object.assign({ kind: 'react', v }, rec));
    }

    plan.steps.forEach((step, i) => {
      if (step.isMix) { mixStep(step, i); return; }
      const hot = isHot(step);
      const eligible = (v) => !hot || v.fits;
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
            if (v.mixer || v.virtual || v.machine || !eligible(v)) continue;
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
          if (!hot && a.fits !== b.fits) return a.fits ? 1 : -1;
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
        v = makeExtra({ key: 'mixer', en: 'Mixer', ru: 'Миксер', ruGen: 'Миксера', ruAcc: 'Миксер', mixer: true, mixerType: step.mixer.join(', '), fits: true });
      } else if (opt.type === 'chain') {
        v = opt.v; chainedId = opt.via; sim = opt.sim;
        if (opt.remainder > EPS) storeRemainder(opt.via, opt.remainder, v);
      } else {
        v = opt.type === 'new' ? opt.v : missingFor(step, eligible);
        v.contents = {};
      }
      v.used = true;

      let waves = 1;
      let batch = null;
      if (opt.type !== 'chain' && !v.mixer && isFinite(v.size) && typeof planBatches === 'function') {
        const b = planBatches(step, v.size);
        if (b && b.impossible) v.missing = v.missing || { size: Math.ceil(b.volPerRun / 5) * 5, fits: hot, reason: 'run' };
        else if (b && b.batches > 1) { waves = b.batches; batch = b; }
      }
      fill(step, v, chainedId, batch);
      v.peak = Math.max(v.peak, volumeOf(v.contents));
      if (!sim && !v.mixer) sim = simulate(v.contents, step, cache);
      react(step, v, chainedId);
      const rec = { index: i + 1, step, type: opt.type, chained: opt.type === 'chain', sim, waves, batch };
      v.records.push(rec);
      actions.push(Object.assign({ kind: 'react', v }, rec));
    });

    const all = vessels.concat(extra);
    const used = all.filter(v => v.used);
    const missingVessels = all.filter(v => v.missing);
    return {
      vessels: used,
      actions,
      transfers: actions.filter(a => a.kind === 'transfer' || a.kind === 'store')
        .map(a => ({ from: a.from, to: a.to, reagentId: a.reagentId, amount: a.amount, via: a.via, trips: a.trips })),
      totals: {
        mixes: actions.filter(a => a.kind === 'react').reduce((s, a) => s + (a.waves || 1), 0),
        vessels: used.filter(v => !v.virtual && !v.mixer && !v.machine).length,
        transfers: tally.transfers,
        trips: tally.trips,
        missing: missingVessels.length + tally.tools,
      },
      missing: missingVessels,
      toolMissing: actions.filter(a => a.toolMissing).map(a => a.toolMissing),
    };
  }

  // Fewest shortages first — a plan that lacks a measuring beaker must not win
  // over a complete one — then fewest mixes, transfers, beaker trips, vessels.
  const better = (a, b) => a.totals.missing - b.totals.missing || a.totals.mixes - b.totals.mixes
    || a.totals.transfers - b.totals.transfers || a.totals.trips - b.totals.trips || a.totals.vessels - b.totals.vessels;

  // Plain greedy is myopic, and the brute-force oracle caught it: CMClonexadone
  // chained its 150u Cryoxadone step into the tank, which then was not free for
  // the 1065u step that followed (6 mixes where 4 were possible), and
  // CMImidazoline gave its 150u first step the 300u beaker the 450u second step
  // needed (5 instead of 4). So every step is a rollout: try each option, finish
  // the plan greedily, keep the best. The greedy option is always among those
  // tried, so this is never worse than greedy, and it stays polynomial.
  // opts.choose bypasses it — the oracle drives assignWith directly.
  function assign(plan, instances, opts) {
    opts = opts || {};
    const cache = new Map();
    if (opts.choose) return assignWith(plan, instances, opts.choose, cache, opts);
    const prefix = [];
    let best = null;
    for (let i = 0; i < plan.steps.length; i++) {
      let count = 1;
      best = null;
      for (let k = 0; k < count; k++) {
        const res = assignWith(plan, instances, (j, options) => {
          if (j === i) count = options.length;
          return options[j < i ? prefix[j] : (j === i ? k : 0)];
        }, cache, opts);
        if (!best || better(res, best.res) < 0) best = { k, res };
      }
      prefix.push(best.k);
    }
    return best ? best.res : assignWith(plan, instances, (j, options) => options[0], cache, opts);
  }

  // ── rendering (R15) ──────────────────────────────────────
  const escH = (s) => (typeof esc === 'function' ? esc(String(s)) : String(s));
  const u = (n) => `${typeof fmtU === 'function' ? fmtU(n) : n}u`;
  const nameOf = (id) => (typeof planName === 'function' ? planName(id) : id);
  const plural = (n, ruForms, enForms) => (typeof planPlural === 'function'
    ? planPlural(n, RU() ? ruForms : enForms) : `${n} ${enForms[n === 1 ? 0 : 1]}`);

  // «Бак 1000u №1», «из Бака 1000u №1», «в Бак 1000u №1».
  function vName(v, form) {
    const ru = RU();
    const base = ru ? (form === 'gen' ? v.ruGen : form === 'acc' ? v.ruAcc : v.ru) : v.en;
    if (v.mixer) return `${base || (ru ? 'Миксер' : 'Mixer')} (${v.mixerType})`;
    const size = isFinite(v.size) ? ` ${u(v.size)}` : '';
    const num = v.machine ? '' : (ru ? ` №${v.n}` : ` #${v.n}`);
    return `${base || (ru ? 'Ёмкость' : 'Vessel')}${size}${num}`;
  }

  function tripsText(amount, size, trips, noSplit) {
    const head = plural(trips, ['заход', 'захода', 'заходов'], ['trip', 'trips']);
    if (trips <= 1 || noSplit) return head;
    const full = Math.floor((amount + EPS) / size);
    const rest = round2(amount - full * size);
    const parts = full > 1 ? [`${full} &times; ${u(size)}`] : (full === 1 ? [u(size)] : []);
    if (rest > EPS) parts.push(u(rest));
    return `${head}: ${parts.join(' + ')}`;
  }

  function toolText(t) {
    const ru = RU();
    return t.reason === 'carry'
      ? (ru ? `нужна пустая мензурка, чтобы перенести (до ${u(t.size)})` : `needs an empty beaker to carry it (up to ${u(t.size)})`)
      : (ru ? `нужна пустая мензурка, чтобы отмерить (до ${u(t.size)})` : `needs an empty beaker to measure with (up to ${u(t.size)})`);
  }

  function missingText(m) {
    const ru = RU();
    if (m.reason === 'busy') return ru ? `все такие ёмкости заняты — нужна ещё одна на ${u(m.size)}` : `every vessel of this kind is busy — bring one more of ${u(m.size)}`;
    if (m.reason === 'store') return ru ? `некуда отлить остаток — нужна ёмкость на ${u(m.size)}` : `nowhere to hold the remainder — bring a vessel of ${u(m.size)}`;
    if (m.reason === 'run') return ru ? `одна реакция не влезает — нужна ёмкость на ${u(m.size)}` : `a single run does not fit — bring a vessel of ${u(m.size)}`;
    if (m.reason === 'mix') return ru ? `некуда смешать — нужна пустая ёмкость на ${u(m.size)}` : `nowhere to mix — bring an empty vessel of ${u(m.size)}`;
    return m.fits
      ? (ru ? `в наборе нет ёмкости для раздатчика и плитки — нужна на ${u(m.size)}` : `the set has no vessel that fits the dispenser and hotplate — bring one of ${u(m.size)}`)
      : (ru ? `в наборе нет подходящей ёмкости — нужна на ${u(m.size)}` : `the set has no vessel for this — bring one of ${u(m.size)}`);
  }

  function lineTransfer(a) {
    const ru = RU();
    const verb = a.kind === 'store' ? (ru ? 'Отлейте' : 'Pour off') : (ru ? 'Перелейте' : 'Pour');
    let s = `${verb} ${u(a.amount)} ${escH(nameOf(a.reagentId))} ${ru ? 'из' : 'from'} ${escH(vName(a.from, 'gen'))} ${ru ? 'в' : 'into'} ${escH(vName(a.to, 'acc'))}`;
    if (a.via) s += ` ${ru ? 'через' : 'via'} ${escH(vName(a.via, 'acc'))} — ${tripsText(a.amount, a.via.size, a.trips, a.trips > 4)}`;
    if (a.toolMissing) s += ` <span class="vplan-bad">— ${toolText(a.toolMissing)}</span>`;
    return `<div class="vplan-line vplan-transfer">${s}</div>`;
  }

  function lineDispense(a) {
    const ru = RU();
    const item = d => `${u(d.amount)} ${escH(nameOf(d.reagentId))}${d.catalyst ? (ru ? ' (катализатор)' : ' (catalyst)') : ''}`;
    if (!a.via && !a.toolMissing) {
      return `<div class="vplan-line">${ru ? 'Из раздатчика в' : 'From the dispenser into'} ${escH(vName(a.to, 'acc'))}: ${a.items.map(item).join(' · ')}</div>`;
    }
    const verb = a.chained ? (ru ? 'Долейте в' : 'Top up') : (ru ? 'Налейте в' : 'Fill');
    if (a.toolMissing) {
      return `<div class="vplan-line">${verb} ${escH(vName(a.to, 'acc'))}: ${a.items.map(item).join(' · ')} <span class="vplan-bad">— ${toolText(a.toolMissing)}</span></div>`;
    }
    const rows = a.items.map(d => `<li>${item(d)} — ${tripsText(d.amount, a.via.size, d.trips, a.waves > 1 || d.trips > 4)}</li>`).join('');
    return `<div class="vplan-line">${verb} ${escH(vName(a.to, 'acc'))} ${ru ? 'через' : 'via'} ${escH(vName(a.via, 'acc'))}, ${ru ? 'по одному реагенту за заход' : 'one reagent per trip'}:<ul class="vplan-pours">${rows}</ul></div>`;
  }

  function lineHeat(step) {
    const ru = RU();
    const range = [step.minTemp ? `&gt;${step.minTemp}K` : '', step.maxTemp ? `&lt;${step.maxTemp}K` : ''].filter(Boolean).join(' ');
    return `<div class="vplan-line vplan-heat">${ru ? 'Нагрейте на плитке' : 'Heat on the hotplate'}: <span class="step-temp">${range}</span></div>`;
  }

  function lineResult(a) {
    const ru = RU();
    const s = a.step;
    if (a.mix) {
      const comps = s.reactants.map(r => `${u(r.amount)} ${escH(nameOf(r.id))}`).join(' + ');
      const sim = a.sim && a.sim.ok
        ? ` <span class="vessel-sim-ok" title="${ru ? 'Симулятор стакана не запускает ни одной реакции' : 'The beaker simulator fires no reaction'}">&#10003; ${ru ? 'не реагируют (симулятор)' : 'no reaction (simulator)'}</span>`
        : ` <span class="vplan-bad">&#9888; ${ru ? 'реагируют' : 'they react'}: ${escH((a.sim && a.sim.extra || []).join(', '))}</span>`;
      const loads = a.waves > 1 ? `<div class="step-batches">${plural(a.waves, ['загрузка', 'загрузки', 'загрузок'], ['load', 'loads'])}: ${a.loads.map(x => u(x)).join(' + ')}</div>` : '';
      return `<div class="vplan-line vplan-result">&rarr; ${ru ? 'смесь' : 'mix'} <strong>${u(s.amount)}</strong>: ${comps}${sim}${loads}</div>`;
    }
    let tags = '';
    if (a.sim && a.sim.ok) {
      tags += ` <span class="vessel-sim-ok" title="${ru ? 'Симулятор стакана запускает ровно эту реакцию' : 'The beaker simulator runs exactly this reaction'}">&#10003; ${ru ? 'симулятор' : 'simulator'}</span>`;
    } else if (a.sim) {
      tags += ` <span class="vessel-sim-bad">&#9888; ${ru ? 'симулятор' : 'simulator'}: ${escH(a.sim.extra.join(', ') || (ru ? 'реакция не пошла' : 'no reaction'))}</span>`;
    }
    let waves = '';
    if (a.waves > 1 && a.batch) {
      const parts = a.batch.full > 1 ? [`${a.batch.full} &times; ${u(a.batch.perVol)}`] : [u(a.batch.perVol)];
      if (a.batch.restVol) parts.push(u(a.batch.restVol));
      waves = `<div class="step-batches">${plural(a.waves, ['волна', 'волны', 'волн'], ['wave', 'waves'])}: ${parts.join(' + ')}</div>`;
    }
    return `<div class="vplan-line vplan-result">&rarr; <strong>${u(s.amount)} ${escH(nameOf(s.reagentId))}</strong>${tags}${waves}</div>`;
  }

  function renderSection(plan, instances, opts) {
    const ru = RU();
    const res = assign(plan, instances, opts);
    if (typeof track === 'function') track('vessel_plan', { mixes: res.totals.mixes, vessels: res.totals.vessels, missing: res.totals.missing });

    const blocks = [];
    let pending = [];
    for (const a of res.actions) {
      if (a.kind === 'react') { blocks.push({ pre: pending, react: a }); pending = []; } else pending.push(a);
    }
    if (pending.length && blocks.length) blocks[blocks.length - 1].post = pending;

    let prev = null;
    const body = blocks.map((b, k) => {
      const a = b.react;
      const changed = prev && prev !== a.v;
      prev = a.v;
      const head = `<div class="vplan-head"><span class="vplan-num">${k + 1}</span>${changed
        ? ` <span class="vplan-switch" title="${ru ? 'другая ёмкость' : 'another vessel'}">&#8618;</span>` : ''} <span class="vplan-vessel">${escH(vName(a.v, 'nom'))}</span>${a.v.missing
        ? ` <span class="vplan-bad">— ${missingText(a.v.missing)}</span>` : ''}</div>`;
      const lines = b.pre.map(x => (x.kind === 'dispense' ? lineDispense(x) : lineTransfer(x)));
      if (isHot(a.step) && !a.mix) lines.push(lineHeat(a.step));
      lines.push(lineResult(a));
      for (const x of b.post || []) lines.push(x.kind === 'dispense' ? lineDispense(x) : lineTransfer(x));
      const cls = ['vplan-step', a.v.missing ? 'vplan-step-missing' : '', a.v.mixer ? 'vplan-step-mixer' : '', a.mix ? 'vplan-step-mix' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}">${head}${lines.join('')}</div>`;
    }).join('');

    const stepVessels = new Set(blocks.map(b => b.react.v));
    const jump = stepVessels.size > 1 ? `<div class="vplan-note">${ru
      ? 'Шаги идут по разным ёмкостям — выполняйте строго по номерам; смена ёмкости отмечена ↪.'
      : 'Steps move between vessels — follow the numbers; ↪ marks a change of vessel.'}</div>` : '';

    const problems = [...new Set([...res.missing.map(v => missingText(v.missing)), ...res.toolMissing.map(toolText)])];
    const warn = problems.length ? `<div class="warning-box"><div class="warning-box-title">${ru ? 'Не хватает посуды — добавьте её в панели «Посуда» выше' : 'Not enough vessels — add them in the «Vessels» panel above'}</div>${
      problems.map(p => `<div class="warning-item"><span class="warning-icon">&#9888;</span> <span>${p}</span></div>`).join('')}</div>` : '';

    const totals = `<div class="vessel-totals">${ru ? 'Итог' : 'Total'}: ${[
      plural(res.totals.mixes, ['смешивание', 'смешивания', 'смешиваний'], ['mix', 'mixes']),
      plural(res.totals.vessels, ['ёмкость', 'ёмкости', 'ёмкостей'], ['vessel', 'vessels']),
      plural(res.totals.transfers, ['переливание', 'переливания', 'переливаний'], ['transfer', 'transfers']),
      plural(res.totals.trips, ['заход мензуркой', 'захода мензуркой', 'заходов мензуркой'], ['beaker trip', 'beaker trips']),
    ].join(' · ')}</div>`;

    const holding = res.vessels.filter(v => !v.mixer && Object.keys(v.contents).length);
    const end = holding.length ? `<div class="vplan-end"><span class="vplan-end-title">${ru ? 'В конце' : 'At the end'}:</span> ${
      holding.map(v => `${escH(vName(v, 'nom'))} — ${Object.entries(v.contents).map(([id, amt]) => `${u(amt)} ${escH(nameOf(id))}`).join(', ')}`).join('; ')}</div>` : '';

    return `<div class="calc-section vessel-section">
      <h3>${ru ? 'Порядок действий' : 'What to do'} (${plan.steps.length})</h3>
      ${warn}${jump}${body}${totals}${end}
    </div>`;
  }

  // ── panel (R9, R15) ──────────────────────────────────────
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
    const family = familyFor(forkId);
    let rows = inventory(forkId).map(r => Object.assign({}, r));

    function familySwitch() {
      if (forkId !== 'all') {
        const fork = D() && D().meta && D().meta.forks && D().meta.forks[forkId];
        const name = (fork && fork.name) || forkId;
        return `<div class="vessel-family-fixed">${family === 'cm'
          ? (ru ? `Посуда CM-серверов — по форку «${escH(name)}»` : `CM server vessels — from the «${escH(name)}» fork`)
          : (ru ? `Посуда станции SS14 — по форку «${escH(name)}»` : `SS14 station vessels — from the «${escH(name)}» fork`)}</div>`;
      }
      const chip = (fam, label) => `<button type="button" class="vessel-family-chip${family === fam ? ' active' : ''}" data-act="family" data-family="${fam}" aria-pressed="${family === fam}">${label}</button>`;
      return `<div class="vessel-family" role="group" aria-label="${ru ? 'Какой у вас сервер' : 'Which server you play on'}">
        ${chip('cm', ru ? 'CM-серверы: RMC14 · RuCM · CMU · Stories' : 'CM servers: RMC14 · RuCM · CMU · Stories')}
        ${chip('vanilla', ru ? 'Станция: ваниль и остальные форки' : 'Station: vanilla and the other forks')}
      </div>`;
    }

    function render() {
      const closed = !!session().vesselPanelClosed;
      host.innerHTML = `<details class="vessel-panel"${closed ? '' : ' open'}>
        <summary><span class="vessel-panel-title">${ru ? 'Посуда' : 'Vessels'}</span>: <span class="vessel-panel-summary">${escH(panelSummary(rows))}</span></summary>
        ${familySwitch()}
        <p class="vessel-howto">${ru
          ? 'Мензурки ставятся в раздатчик и на плитку. Баки и канистры — нет: в них наливают из мензурки и сливают в мензурку, план покажет каждый заход.'
          : 'Beakers go into the dispenser and onto the hotplate. Tanks and jugs do not: you fill them from a beaker and drain them into one, and the plan counts every trip.'}</p>
        ${family === 'cm' && forkId === 'all' ? `<p class="vessel-hint">${ru
          ? 'Рецепты сейчас считаются по «Все» — чтобы получить CM-лекарства, выберите RMC14 или RuCM в «Источнике» слева.'
          : 'Recipes are computed for «All» right now — pick RMC14 or RuCM in «Source» on the left to plan CM medicines.'}</p>` : ''}
        <div class="vessel-rows">${rows.map((r, i) => `<div class="vessel-row" data-i="${i}">
          <span class="vessel-name">${escH(ru ? r.ru : r.en)}</span>
          <label class="vessel-size"><input type="number" min="5" max="9999" step="5" value="${Number(r.size)}" data-act="size" aria-label="${ru ? 'Объём, u' : 'Volume, u'}">u</label>
          <label class="vessel-fits"><input type="checkbox" data-act="fits"${r.fits ? ' checked' : ''}> ${ru ? 'в раздатчик и на плитку' : 'fits dispenser & hotplate'}</label>
          <span class="vessel-stepper"><button type="button" data-act="dec" aria-label="${ru ? 'Меньше' : 'Fewer'}">&minus;</button><span class="vessel-count">${Number(r.count)}</span><button type="button" data-act="inc" aria-label="${ru ? 'Больше' : 'More'}">+</button></span>
          ${r.custom ? `<button type="button" class="vessel-remove" data-act="remove" aria-label="${ru ? 'Убрать' : 'Remove'}">&times;</button>` : ''}
        </div>`).join('')}</div>
        <div class="vessel-panel-foot">
          <button type="button" class="btn-small" data-act="add">+ ${ru ? 'своя ёмкость' : 'custom vessel'}</button>
          <button type="button" class="btn-small" data-act="reset">${ru ? 'сбросить к пресету' : 'reset to preset'}</button>
          ${family === 'vanilla' ? `<span class="vessel-note">${ru
            ? 'В ванили резервуары только сливные — ёмкость без раздатчика добавляйте, если на вашем сервере в неё можно наливать.'
            : 'Vanilla storage tanks are drain-only — add a vessel that does not fit the dispenser only if your server lets you pour into it.'}</span>` : ''}
        </div>
      </details>`;
      const details = host.querySelector && host.querySelector('details');
      if (details) details.ontoggle = () => saveSession({ vesselPanelClosed: !details.open });
    }

    function commit(reason) {
      saveInventory(forkId, rows);
      if (typeof track === 'function') track('vessel_inventory_change', { family, rows: rows.length, reason });
      render();
      if (onChange) onChange();
    }

    host.onclick = (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'family') {
        saveSession({ vesselFamilyAll: btn.dataset.family });
        if (typeof track === 'function') track('vessel_inventory_change', { family: btn.dataset.family, rows: 0, reason: 'family' });
        mountPanel(host, onChange);
        if (onChange) onChange();
        return;
      }
      const rowEl = btn.closest('.vessel-row');
      const i = rowEl ? Number(rowEl.dataset.i) : -1;
      if (act === 'inc') rows[i].count = Math.min(99, Number(rows[i].count) + 1);
      else if (act === 'dec') rows[i].count = Math.max(0, Number(rows[i].count) - 1);
      else if (act === 'remove') rows.splice(i, 1);
      else if (act === 'add') rows.push(normalizeRow({ key: `custom-${Date.now()}`, size: 300, fits: true, count: 1, custom: true }));
      else if (act === 'reset') rows = presetFor(forkId);
      commit(act);
    };
    host.onchange = (e) => {
      const input = e.target.closest('input[data-act]');
      if (!input) return;
      const i = Number(input.closest('.vessel-row').dataset.i);
      if (input.dataset.act === 'size') rows[i].size = Math.max(5, Math.min(9999, Math.round(Number(input.value) || rows[i].size)));
      if (input.dataset.act === 'fits') rows[i].fits = input.checked;
      commit(input.dataset.act);
    };
    render();
  }

  // Every planner result on screen is re-planned for the new vessel set. The
  // recipe and shift planners clear each other's output; the mix planner is
  // independent of both.
  function replanShown() {
    const shown = (id) => !!(document.getElementById(id) || {}).innerHTML;
    const click = (id) => { const b = document.getElementById(id); if (b) b.click(); };
    if (shown('calcResults')) click('calcBtn');
    else if (shown('batchResults')) click('batchPlanBtn');
    if (shown('mixResults')) click('mixPlanBtn');
  }

  function wire() {
    const host = document.getElementById('vesselPanelHost');
    if (!host) return;
    mountPanel(host, replanShown);
    const filters = document.getElementById('sourceFilters');
    if (filters) filters.addEventListener('change', () => mountPanel(host, replanShown));
  }

  window.ChemDBVessels = {
    familyOf, familyFor, presetFor, inventory, saveInventory, expand,
    assign, renderSection, mountPanel, simulateMix,
  };
  document.addEventListener('app:ready', wire);
})();

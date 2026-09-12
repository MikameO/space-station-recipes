// Botany tab — the random mutation table per fork (D6 data) and the curated
// engine limits (D7). Spec: docs/design/2026-09-12-botany-mutations.md
//
// Self-wired like maps.js and ordnance.js: it renders on `app:ready`, on the
// Botany tab opening, and whenever the Source filter moves — the app never
// calls in. Kept out of app.js because that file is already 168 KB and the
// Botany tab has a second session working in it.
(function () {
  'use strict';

  const D = () => (typeof DATA !== 'undefined' ? DATA : window.DATA);
  const SRC = () => (typeof activeSource !== 'undefined' ? activeSource : 'all');
  const esc2 = s => (typeof esc === 'function' ? esc(String(s))
    : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  // Stat and trait fields, normalised across both botany eras by the extractor.
  const TARGET_LABEL = {
    Potency: 'Potency', Yield: 'Yield', Lifespan: 'Lifespan', Maturation: 'Maturation',
    Production: 'Production', Endurance: 'Endurance (max health)',
    WaterConsumption: 'Water use', NutrientConsumption: 'Nutrient use',
    ToxinsTolerance: 'Toxin tolerance', PestTolerance: 'Pest tolerance',
    WeedTolerance: 'Weed tolerance', LowPressureTolerance: 'Low-pressure tolerance',
    HighPressureTolerance: 'High-pressure tolerance', LowHeatTolerance: 'Low-heat tolerance',
    HighHeatTolerance: 'High-heat tolerance', HeatTolerance: 'Heat tolerance',
    IdealHeat: 'Ideal temperature',
    Viable: 'Viable seed', Seedless: 'Seedless', Ligneous: 'Woody stem',
    TurnIntoKudzu: 'Turns into kudzu', CanScream: 'Screaming',
  };

  const EFFECT_LABEL = {
    MakeSentient: 'The plant wakes up as a ghost role',
    Slipify: 'Produce turns slippery',
    Glow: 'Produce glows',
    PlantMutateSpeciesChange: 'Jumps to another species',
    PlantMutateChemicals: 'Rolls an extra chemical into the produce',
    PlantMutateExudeGases: 'Changes the gas it breathes out',
    PlantMutateConsumeGases: 'Changes the gas it needs',
    PlantMutateHarvest: 'Upgrades harvest: once, then repeating, then self-harvesting',
  };

  const TRAIT_NOTE = {
    Viable: 'while it is off the plant dies of unviable genetics',
    Seedless: 'no seeds can be taken from the produce',
    Ligneous: 'needs a sharp tool to harvest',
    TurnIntoKudzu: 'the tray spawns kudzu once weeds build up',
  };

  const MODEL_LABEL = { ladder: 'ladder (pre-refactor)', range: 'range (current)' };

  // A dropped mutation is reported by family, and a family id is an internal
  // token wherever it is not simply the mutation's own name.
  const FAMILY_LABEL = { heat: 'Heat tolerance', kudzu: 'Kudzufication', ligneous: 'Lignification' };

  // Doses a botanist actually pours. One unit of a reagent is one 3-second
  // metabolism tick, and severity is what has piled up by the 15-second growth
  // cycle — so the column header is a dose, not an abstract multiplier.
  const DOSES = [1, 5, 25];

  function chance(odds, severity, model) {
    const p = (odds || 0) * severity;
    if (p <= 0) return '—';
    if (p < 1) return (p * 100).toFixed(p < 0.1 ? 1 : 0) + '%';
    // The old model rolls each mutation once per cycle, so odds past 1 are just
    // certainty; the new one keeps re-triggering while the odds allow.
    if (model !== 'range') return '100%';
    const n = Math.floor(p), rem = p - n;
    return '×' + n + (rem > 0.005 ? ' + ' + Math.round(rem * 100) + '%' : '');
  }

  function describe(rec) {
    if (rec.kind === 'stat') {
      const label = TARGET_LABEL[rec.target] || rec.target || '?';
      const lo = rec.range ? rec.range[0] : null, hi = rec.range ? rec.range[1] : null;
      return lo === null ? label : `${label} <span class="mut-range">${lo}…${hi}</span>`;
    }
    if (rec.kind === 'trait') {
      const label = TARGET_LABEL[rec.target] || rec.target || '?';
      const note = TRAIT_NOTE[rec.target];
      return `${label}${note ? ` <span class="mut-range">${esc2(note)}</span>` : ''}`;
    }
    return EFFECT_LABEL[rec.effect] || rec.effect || '?';
  }

  function step(rec, model) {
    if (!rec.step) return rec.kind === 'trait' ? 'flips' : '—';
    if (rec.step.model === 'ladder') {
      // Number and word are separate text nodes: the RU dictionary in i18n.js
      // matches whole nodes, and anything glued to a digit never matches.
      const rungs = (rec.step.steps || 0) + 1;
      return `${rungs} <span>rungs</span>`;
    }
    const up = rec.step.up, down = rec.step.down;
    return (up === null || up === undefined) ? '—'
      : `+${up} / ${down}`;
  }

  // A fork's table is its era's base minus what it dropped, plus what it added
  // or changed — the shape the extractor stores (see the spec, "Хранение").
  function tableFor(pm, forkId) {
    const f = pm.forks[forkId] || pm.forks.vanilla;
    if (!f) return null;
    const removed = new Set(f.remove || []);
    const rows = new Map();
    for (const r of pm.bases[f.model] || []) if (!removed.has(r.family)) rows.set(r.name, r);
    for (const r of f.add || []) rows.set(r.name, r);
    for (const r of Object.values(f.override || {})) rows.set(r.name, r);
    return {
      fork: f,
      model: f.model,
      rows: [...rows.values()].sort((a, b) => (b.odds - a.odds) || a.name.localeCompare(b.name)),
    };
  }

  function forkName(fid) {
    return D()?.meta?.forks?.[fid]?.name || fid;
  }

  // Reagents that push potency up at all. Vanilla has none — the only vanilla
  // PlantAdjustPotency is Sedin's -3 — so a fork carrying one is a real
  // difference in how far potency can go, and worth naming next to the table.
  function potencyReagents() {
    const out = {};
    for (const r of Object.values(D()?.reagents || {})) {
      for (const e of r.plantEffects || []) {
        if (e.kind === 'PlantAdjustPotency' && (e.amount || 0) > 0) {
          (out[r.source] = out[r.source] || []).push(r.name || r.id);
        }
      }
    }
    return out;
  }

  function renderMutations() {
    const host = document.getElementById('plantMutations');
    const pm = D()?.plantMutations;
    if (!host || !pm || !pm.forks) return;

    const src = SRC();
    const fid = pm.forks[src] ? src : 'vanilla';
    const t = tableFor(pm, fid);
    if (!t) return;

    const allNote = src === 'all'
      ? ' <span class="mut-note">Source is set to All, so this is vanilla — pick a fork to see its own table.</span>' : '';
    // Each translatable phrase is its own text node — see the note in step().
    const head = `<p class="reverse-desc">${t.rows.length} <span>mutations</span> · ${esc2(forkName(fid))} ·
      <span class="badge badge-model" title="Which botany rewrite this fork runs. It is read off the shape of its own mutation file, not from a list.">${esc2(MODEL_LABEL[t.model] || t.model)}</span>${allNote}</p>`;

    const rows = t.rows.map(r => `<tr>
      <td class="mut-name">${esc2(r.name)}${r.appliesToProduce === false ? ' <span class="mut-flag" title="Plant only — the produce does not carry it">plant only</span>' : ''}</td>
      <td>${describe(r)}</td>
      <td class="mut-num">${step(r, t.model)}</td>
      <td class="mut-num">${r.reversible ? '<span title="The effect is a toggle: rolling it again takes it back off">yes</span>' : '—'}</td>
      ${DOSES.map(dose => `<td class="mut-num">${esc2(chance(r.odds, dose, t.model))}</td>`).join('')}
    </tr>`).join('');

    const table = `<div class="mut-table-wrap"><table class="mut-table">
      <thead><tr>
        <th>Mutation</th><th>What it changes</th><th>Step</th><th>Reversible</th>
        ${DOSES.map(d => `<th title="Chance per 15-second growth cycle with ${d}u of mutagen sitting in the tray">${d}u</th>`).join('')}
      </tr></thead><tbody>${rows}</tbody></table></div>`;

    host.innerHTML = head + table;
    renderForkSummary(pm, fid);
  }

  function renderForkSummary(pm, activeFid) {
    const host = document.getElementById('mutationForks');
    if (!host) return;
    const pot = potencyReagents();
    const order = Object.keys(pm.forks);
    const rows = order.map(fid => {
      const f = pm.forks[fid];
      const diff = [];
      for (const fam of f.remove || []) diff.push('−' + (FAMILY_LABEL[fam] || fam));
      for (const r of f.add || []) diff.push('+' + r.name);
      const potNote = (pot[fid] || []).length
        ? `<span class="mut-flag" title="Raises potency with no upper limit — vanilla has no such reagent">${esc2((pot[fid] || []).join(', '))}</span>` : '';
      return `<tr${fid === activeFid ? ' class="mut-row-active"' : ''}>
        <td>${esc2(forkName(fid))}</td>
        <td>${esc2(MODEL_LABEL[f.model] || f.model || '?')}</td>
        <td class="mut-num">${f.count}</td>
        <td>${diff.length ? esc2(diff.join(', ')) : '—'} ${potNote}</td>
      </tr>`;
    }).join('');

    host.innerHTML = `<p class="reverse-desc">Names that only differ by era are matched up first, so what is listed here is a real difference in content, not a rename.</p>
      <div class="mut-table-wrap"><table class="mut-table">
        <thead><tr><th>Fork</th><th>Model</th><th>Mutations</th><th>Differences from its era's baseline</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  function renderMechanics() {
    const host = document.getElementById('botanyMechanics');
    const data = D();
    const mech = data?.botanyMechanics;
    if (!host || !mech) return;
    const src = SRC();
    const pm = data.plantMutations || { forks: {} };
    const model = (pm.forks[src] || pm.forks.vanilla || {}).model;

    host.innerHTML = `<div class="guide-card">
      <div class="guide-head">${esc2(mech.title)}
        <span class="badge badge-community" title="Read off upstream C# by hand — these constants are in code, not in extractable YAML. See sources for the files and the date.">Community knowledge</span>
      </div>
      ${mech.sections.map(s => {
        const extra = s.byModel && model ? s.byModel[model] : null;
        return `<div class="guide-section"><b>${esc2(s.h)}</b><p>${esc2(s.body)}</p>${
          extra ? `<p class="mut-era-note">${esc2(extra)}</p>` : ''}</div>`;
      }).join('')}
    </div>`;
  }

  function render() {
    if (!D()) return;
    renderMutations();
    renderMechanics();
  }

  // Both sections live in the markup, so app.js wires their collapse handlers
  // at setup and only the inner hosts are swapped here.
  function wire() {
    document.getElementById('btn-botany')?.addEventListener('click', render);
    document.getElementById('sourceFilters')?.addEventListener('change', () => {
      if (document.getElementById('tab-botany')?.classList.contains('active')) render();
    });
    render();
  }

  document.addEventListener('app:ready', wire);
})();

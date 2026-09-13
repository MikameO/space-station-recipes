// Mixes & pills: the parts ladder, ChemMaster presses, the reaction check between
// components, the presets and the plan laid over vessels. Runs app.js, vessels.js
// and mixes.js in one vm context against the real data.json.
// Run: node scripts/test_mix_plan.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));

const noop = () => {};
const stubEl = { addEventListener: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  style: {}, querySelectorAll: () => [], querySelector: () => null, insertAdjacentHTML: noop, setAttribute: noop, innerHTML: '' };
const ctx = {
  document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: stubEl, documentElement: stubEl },
  window: {}, navigator: { language: 'en' }, location: { hash: '', search: '', href: '' },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  console, setTimeout, clearTimeout,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ctx, { filename: 'app.js' });
ctx.__data = data;
vm.runInContext('DATA = __data;', ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'vessels.js'), 'utf8'), ctx, { filename: 'vessels.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'mixes.js'), 'utf8'), ctx, { filename: 'mixes.js' });

const g = (name) => vm.runInContext(name, ctx);
const setSource = (s) => vm.runInContext(`activeSource = ${JSON.stringify(s)}; recipeStepsCache.clear();`, ctx);
const V = ctx.window.ChemDBVessels;
const M = ctx.window.ChemDBMixes;
if (!V || !M) { console.log('FAIL vessels.js or mixes.js did not load'); process.exit(1); }

const round2 = (n) => Math.round(n * 100) / 100;
const sim = g('simulateBeaker');
const row = (key, size, fits, count) => ({ key, en: key, ru: key, ruGen: key, ruAcc: key, size, fits, count });
const TANK = (n = 1) => row('tank', 1000, false, n);
const HIGHCAP = (n = 1) => row('highcap', 300, true, n);
const pickSnap = (s) => ({ total: s.total, step: s.step, mode: s.mode });
const pickLayout = (L) => ({ bottleVolume: L.bottleVolume, dose: L.dose, total: L.total, loads: L.loads });
const mixOf = (preset) => ({ components: preset.components.map(([id, parts]) => ({ id, parts })), mode: preset.mode, bottles: preset.bottles, dose: preset.dose, volume: preset.volume });
const preset = (key) => M.PRESETS.find(p => p.key === key);
const UNGA = { CMMeralyne: 145, CMBicaridine: 145, CMKelotane: 145, CMDermaline: 145, RMCSugar: 145, RMCIron: 145, CMDexalinPlus: 145 };
const SLUDGE = { CMBicaridine: 16, CMMeralyne: 16, CMKelotane: 16, CMDermaline: 16 };

const cases = [
  // ── the parts ladder: every component on the 5u step, never more than a quarter over ──
  ['seven equal parts of 1000u become 1015u, 145u each', { total: 1015, step: 35, mode: 'pour' }, pickSnap(M.snapTotal(1000, [1, 1, 1, 1, 1, 1, 1]))],
  ['1:1 of 240u stays 240u', 240, M.snapTotal(240, [1, 1]).total],
  ['a 58u injector of 1:1 becomes 60u', 60, M.snapTotal(58, [1, 1]).total],
  ['1:2 of 100u becomes 105u', 105, M.snapTotal(100, [1, 2]).total],
  ['half parts behave like whole ones', M.snapTotal(100, [1, 2]).total, M.snapTotal(100, [0.5, 1]).total],
  ['a 3u 1:1:1 mix falls back to whole units rather than growing to 15u', { total: 3, step: 3, mode: 'whole' }, pickSnap(M.snapTotal(3, [1, 1, 1]))],

  // ── ChemMaster presses: 500u buffer, 16 pills a bottle, up to 8 bottles ──
  ['two bottles of 15u Mera-Bica pills: 240u a bottle, one 480u press',
    { bottleVolume: 240, dose: 15, total: 480, loads: [{ bottles: 2, pills: 32, volume: 480 }] }, pickLayout(M.pillsLayout(2, 15, [1, 1]))],
  ['seven-part Unga at 15u a pill: 245u a bottle, 15.31u a pill', [245, 15.31], (() => { const L = M.pillsLayout(2, 15, [1, 1, 1, 1, 1, 1, 1]); return [L.bottleVolume, round2(L.dose)]; })()],
  ['eight bottles press two at a time', [2, 2, 2, 2], M.pillsLayout(8, 15, [1, 1]).loads.map(l => l.bottles)],
  ['a 40u dose keeps a bottle inside the buffer: 12 pills, 480u', [12, 480], (() => { const L = M.pillsLayout(1, 40, [1, 1]); return [L.perBottle, L.bottleVolume]; })()],

  // ── reactions between components ──
  ['a CM mix is checked on all four CM forks', ['rmc14', 'cmu', 'rucm', 'stories_cm'], M.checkForks('rmc14')],
  ['Unga does not react on RMC14', [], M.compatibility(UNGA, 'rmc14').active.reactions],
  // CMU's trap against General Cure: its four medicines together turn into black sludge.
  ['the simulator fires the General Cure trap on CMU and RuCM, not on RMC14 or Stories', ['cmu', 'rucm'],
    M.checkForks('rmc14').filter(f => sim(SLUDGE, 293, f).log.some(l => l.id === 'CMUCreateSludgeGC'))],
  ['Unga carries the same four medicines, so on CMU it falls into the trap', ['CMUCreateSludgeGC'], M.compatibility(UNGA, 'cmu').active.reactions],
  ['…and on RuCM, which inherits CMU', ['CMUCreateSludgeGC'], M.compatibility(UNGA, 'rucm').active.reactions],
  ['Inaprovaline and Dylovene do react — into Tricordrazine', ['CMTricordrazine'], M.compatibility({ CMInaprovaline: 100, CMDylovene: 100 }, 'rmc14').active.reactions],
  ['simulateBeaker without a fork still follows the Source filter', ['PotassiumExplosion'], (() => { setSource('vanilla'); return sim({ Water: 50, Potassium: 50 }, 293).log.map(l => l.id); })()],

  // ── presets ──
  ['every preset component exists and is visible on RMC14', [],
    M.PRESETS.flatMap(p => p.components.map(([id]) => id)).filter(id => !data.reagents[id] || !g('reagentInFork')(data.reagents[id], 'rmc14'))],
  ['General Cure and Unga are marked as players\' mixes', ['general-cure', 'unga'], M.PRESETS.filter(p => p.community).map(p => p.key)],
  ['General Cure is the four medicines of the CMU trap', ['CMBicaridine', 'CMDermaline', 'CMKelotane', 'CMMeralyne'],
    preset('general-cure').components.map(([id]) => id).sort()],
  ['every canonical preset names the prototype it comes from', true, M.PRESETS.filter(p => !p.community).every(p => /RMC|CM[A-Z]/.test(p.noteEn))],
];

// ── the plan: brew apart, then mix ──────────────────────────────────────────
setSource('rmc14');
const meraBica = M.planMix(mixOf(preset('mera-bica')), 'rmc14');
const meraBicaLaid = V.assign(meraBica.planWithMix, V.expand([TANK(3), HIGHCAP()]), { destination: M.CHEMMASTER });
const mixRecord = meraBicaLaid.vessels.flatMap(v => v.records.filter(r => r.mix))[0];
const meraHtml = M.renderResults(meraBica, V.expand([TANK(3), HIGHCAP()]));
const meraFlat = M.renderResults(meraBica, []);

// Meralyne is brewed from Bicaridine and R3 rounds 240u of it up to 270u: on the
// default CM set (one 300u beaker, one tank) the 30u surplus keeps the only beaker
// busy, so the tank's Bicaridine has nothing to ride to the ChemMaster in — a
// second beaker is the honest fix, and the plan says so.
const meraDefault = V.assign(meraBica.planWithMix, V.expand(V.presetFor('rmc14')), { destination: M.CHEMMASTER });
const meraTwoBeakers = V.assign(meraBica.planWithMix, V.expand([TANK(), HIGHCAP(2)]), { destination: M.CHEMMASTER });

const unga = M.planMix(mixOf(preset('unga')), 'rmc14');
const ungaLaid = V.assign(unga.planWithMix, V.expand([TANK(8), HIGHCAP(2)]));
const ungaMix = ungaLaid.vessels.flatMap(v => v.records.filter(r => r.mix).map(r => ({ v, r })))[0];

setSource('rucm');
const ungaRucm = M.planMix(mixOf(preset('unga')), 'rucm');
setSource('rmc14');
const bad = M.planMix({ components: [{ id: 'CMInaprovaline', parts: 1 }, { id: 'CMDylovene', parts: 1 }], mode: 'volume', volume: 200 }, 'rmc14');
const badHtml = M.renderResults(bad, []);

cases.push(
  ['two bottles of Mera-Bica need 240u of each', [240, 240], meraBica.amounts.map(a => a.amount)],
  ['…the plan ends with the mix step', true, meraBica.planWithMix.steps[meraBica.planWithMix.steps.length - 1].isMix === true],
  ['…pressed in one 480u load', [480], meraBica.planWithMix.steps[meraBica.planWithMix.steps.length - 1].loads.map(l => l.volume)],
  ['…laid over three tanks and a beaker with nothing missing', 0, meraBicaLaid.totals.missing],
  ['…mixed in the ChemMaster buffer', 'chemmaster', mixRecord && ctx.window.ChemDBVessels && meraBicaLaid.vessels.find(v => v.records.includes(mixRecord)).key],
  ['…where the simulator sees no reaction', true, mixRecord && mixRecord.sim.ok],
  ['…and every brewed component covers its share', true, meraBica.amounts.every(a => (meraBica.brewed[a.id] || 0) >= a.amount)],
  ['the result says the components do not react', true, /The components do not react with each other/.test(meraHtml)],
  ['…lists the composition', true, /Mix composition: 480u/.test(meraHtml)],
  ['…and how to press it: 32 pills of 15u', true, /32 pills of 15u/.test(meraHtml)],
  ['…with the numbered steps ending in the ChemMaster buffer', true, /ChemMaster buffer 500u/.test(meraHtml) && /vplan-step-mix/.test(meraHtml)],
  ['with no vessels the steps stay a flat list ending in the mix', true, /class="step-item"/.test(meraFlat) && /Mix into the ChemMaster buffer/.test(meraFlat)],
  ['on the default CM set the Meralyne surplus keeps the only beaker busy', ['carry'], meraDefault.toolMissing.map(t => t.reason)],
  ['…and a second beaker clears it', 0, meraTwoBeakers.totals.missing],

  ['Unga at 1000u is 145u of each of seven parts', [145, 145, 145, 145, 145, 145, 145], unga.amounts.map(a => a.amount)],
  ['…sugar and iron poured, not brewed', true, unga.planWithMix.steps.every(s => s.isMix || !['RMCSugar', 'RMCIron'].includes(s.reagentId))],
  ['…laid over eight tanks and two beakers with nothing missing', 0, ungaLaid.totals.missing],
  ['…mixed in a tank', 'tank', ungaMix && ungaMix.v.key],
  ['…calm on RMC14, with CMU and RuCM flagged', { active: [], flagged: ['cmu', 'rucm'] },
    { active: unga.compat.active.reactions, flagged: unga.compat.others.filter(o => o.reactions.length).map(o => o.fork) }],
  ['…and refused on RuCM, saying what the trap does', true,
    ungaRucm.compat.active.reactions.includes('CMUCreateSludgeGC') && /trap against General Cure/.test(M.renderResults(ungaRucm, []))],
  ['General Cure at 400u is 100u of each of four parts', [100, 100, 100, 100], M.planMix(mixOf(preset('general-cure')), 'rmc14').amounts.map(a => a.amount)],

  ['a reacting pair is refused', ['CMTricordrazine'], bad.compat.active.reactions],
  ['…in red, with the reaction spelled out', true, /mix-compat-bad/.test(badHtml) && /Do not mix/.test(badHtml) && /Tricordrazine/.test(badHtml)],
);

let failed = 0;
for (const [name, expected, actual] of cases) {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) { console.log('ok   ' + name); continue; }
  failed++;
  console.log('FAIL ' + name + '\n  expected: ' + JSON.stringify(expected) + '\n  got:      ' + JSON.stringify(actual));
}
console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);

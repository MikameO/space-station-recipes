// The vessel planner: presets per fork family, the inventory, and how a brew plan
// is laid out over beakers and tanks. Runs app.js then vessels.js in one vm
// context against the real data.json. Run: node scripts/test_vessel_plan.js
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

const g = (name) => vm.runInContext(name, ctx);
const setSource = (s) => vm.runInContext(`activeSource = ${JSON.stringify(s)}; recipeStepsCache.clear();`, ctx);
const V = ctx.window.ChemDBVessels;
if (!V) { console.log('FAIL vessels.js did not expose window.ChemDBVessels'); process.exit(1); }

const keys = (rows) => rows.map(r => r.key);
const counted = (rows) => rows.filter(r => r.count > 0).map(r => `${r.count}x${r.size}`);

const cases = [
  // ── families come from the meta.forks parent chain ──
  ['rmc14 is the CM family', 'cm', V.familyOf('rmc14')],
  ['cmu inherits rmc14', 'cm', V.familyOf('cmu')],
  ['rucm reaches rmc14 through cmu', 'cm', V.familyOf('rucm')],
  ['stories_cm is CM', 'cm', V.familyOf('stories_cm')],
  ['goob is vanilla-family', 'vanilla', V.familyOf('goob')],
  ['"All" is vanilla-family', 'vanilla', V.familyOf('all')],

  // ── presets, read off the prototypes ──
  ['CM preset without Space Stories has no 500u jug', false, keys(V.presetFor('rmc14')).includes('cm-reagentjug')],
  ['Space Stories adds the 500u reagent jug', true, keys(V.presetFor('stories_cm')).includes('cm-reagentjug')],
  ['…which heats (it inherits the high-capacity beaker)', true, V.presetFor('stories_cm').find(r => r.key === 'cm-reagentjug').heatable],
  ['the 200u RMC jug does not heat (no FitsInDispenser)', false, V.presetFor('rmc14').find(r => r.key === 'cm-jug').heatable],
  ['the reagent tank holds 1000u and does not heat', '1000/false', (() => { const t = V.presetFor('rmc14').find(r => r.key === 'cm-tank'); return `${t.size}/${t.heatable}`; })()],
  ['CM default set: one 300u beaker and one tank', ['1x300', '1x1000'], counted(V.presetFor('rmc14'))],
  ['vanilla default set: one large beaker, no tank', ['1x120'], counted(V.presetFor('vanilla'))],
  ['an empty session falls back to the preset', counted(V.presetFor('rucm')), counted(V.inventory('rucm'))],

  // ── instances ──
  ['expand makes one instance per vessel, biggest first', ['1000', '300'], V.expand(V.presetFor('rmc14')).map(i => String(i.size))],
  ['at equal size the vessel that does not heat comes first', [false, true],
    V.expand([{ key: 'a', en: 'a', ru: 'a', size: 200, heatable: true, count: 1 }, { key: 'b', en: 'b', ru: 'b', size: 200, heatable: false, count: 1 }]).map(i => i.heatable)],
  ['zero counts and zero sizes make no instances', 0,
    V.expand([{ key: 'a', en: 'a', ru: 'a', size: 300, heatable: true, count: 0 }, { key: 'b', en: 'b', ru: 'b', size: 0, heatable: true, count: 2 }]).length],
  ['three beakers of one row are numbered 1..3', [1, 2, 3],
    V.expand([{ key: 'a', en: 'a', ru: 'a', size: 60, heatable: true, count: 3 }]).map(i => i.n)],
];

// ── R10: laying a plan out over vessels ─────────────────────────────────────
const planBrew = g('planBrew');
const row = (key, size, heatable, count) => ({ key, en: key, ru: key, size, heatable, count });
const TANK = (n = 1) => row('tank', 1000, false, n);
const HIGHCAP = (n = 1) => row('highcap', 300, true, n);
const LARGE = (n = 1) => row('large', 120, true, n);
const recordOf = (res, reagentId) => res.vessels.flatMap(v => v.records.filter(r => r.step && r.step.reagentId === reagentId).map(r => ({ v, r })))[0];

setSource('vanilla');
const cryo = V.assign(planBrew([{ id: 'Cryoxadone', amount: 540 }], 0), V.expand([TANK()]));
const fersiliciteBeaker = V.assign(planBrew([{ id: 'Fersilicite', amount: 150 }], 0), V.expand([TANK(), LARGE()]));
const fersiliciteTankOnly = V.assign(planBrew([{ id: 'Fersilicite', amount: 150 }], 0), V.expand([TANK()]));
const fanout = V.assign(planBrew([{ id: 'Tricordrazine', amount: 300 }, { id: 'Bicaridine', amount: 720 }], 0), V.expand([TANK(), HIGHCAP(2)]));
const waves = V.assign(planBrew([{ id: 'Cryoxadone', amount: 3000 }], 0), V.expand([TANK()]));
const mixerTarget = Object.keys(data.reagents).find(id => {
  const s = g('calculateIngredients')(id, 100).steps;
  return s.length && s.some(x => x.mixer && x.mixer.length);
});
const mixerRes = mixerTarget ? V.assign(planBrew([{ id: mixerTarget, amount: 100 }], 0), V.expand([TANK(), HIGHCAP()])) : null;

// A side reaction the simulator reports on the Dexalin + water mix must stop the chain.
vm.runInContext(`__realSim = simulateBeaker;
  simulateBeaker = function (c, t) { const r = __realSim(c, t); if (c.Dexalin && c.Water) r.log.push({ id: 'PotassiumExplosion' }); return r; };`, ctx);
const sideReaction = V.assign(planBrew([{ id: 'Cryoxadone', amount: 540 }], 0), V.expand([TANK(2)]));
vm.runInContext('simulateBeaker = __realSim;', ctx);

cases.push(
  // ── the owner's workflow: brew in the tank, pour the next step on top ──
  ['540u Cryoxadone in one tank is two mixes', 2, cryo.totals.mixes],
  ['…in one vessel', 1, cryo.totals.vessels],
  ['…with nothing poured between vessels', 0, cryo.totals.transfers],
  ['…the second step chained onto the Dexalin', true, recordOf(cryo, 'Cryoxadone').r.chained],
  ['…confirmed by the simulator', true, recordOf(cryo, 'Cryoxadone').r.sim.ok],
  ['…the tank peaking at 600u', 600, cryo.vessels[0].peak],
  ['…and 60u of plasma left in it', 60, cryo.vessels[0].contents.Plasma],

  // ── a hot step never goes into something the hotplate will not take ──
  ['Fersilicite (>310K) goes into the beaker, not the free tank', true, recordOf(fersiliciteBeaker, 'Fersilicite').v.heatable],
  ['…in two waves of a 120u beaker', 2, recordOf(fersiliciteBeaker, 'Fersilicite').r.waves],
  ['with only a tank the hot step is reported missing', 'none', (fersiliciteTankOnly.missing[0] || {}).missing && fersiliciteTankOnly.missing[0].missing.reason],
  ['…and the missing vessel must heat', true, fersiliciteTankOnly.missing[0] && fersiliciteTankOnly.missing[0].missing.heatable],

  // ── mixer steps live outside the vessel set ──
  ['a mixer step gets its own mixer card', mixerTarget ? true : 'no mixer step in vanilla data',
    mixerRes ? mixerRes.vessels.some(v => v.mixer && v.records.some(r => r.type === 'mixer')) : 'no mixer step in vanilla data'],

  // ── the simulator vetoes a chain ──
  ['a side reaction in the simulator stops the chain', false, recordOf(sideReaction, 'Cryoxadone').r.chained],
  ['…so the Dexalin is poured over into the second tank', 1, sideReaction.totals.transfers],

  // ── fan-out: Inaprovaline feeds Bicaridine (360u) and Tricordrazine (150u) ──
  ['Bicaridine, the bigger consumer, chains onto the Inaprovaline', true, recordOf(fanout, 'Bicaridine').r.chained],
  ['…and 150u of Inaprovaline is poured out for Tricordrazine', true,
    fanout.transfers.some(t => t.reagentId === 'Inaprovaline' && t.amount === 150)],
  ['…four mixes for the whole shift plan', 4, fanout.totals.mixes],

  // ── waves and shortage ──
  ['1005u of Dexalin in a 1000u tank is two waves', 2, recordOf(waves, 'Dexalin').r.waves],
  ['…990u and 15u, whole and on the 5u step', [990, 15], (() => { const b = recordOf(waves, 'Dexalin').r.batch; return [b.perVol, b.restVol]; })()],
  ['…and the Cryoxadone, with the only tank busy, is reported missing', 'busy',
    (waves.missing.find(v => v.records.some(r => r.step && r.step.reagentId === 'Cryoxadone')) || { missing: {} }).missing.reason],
  ['…while the plan still covers every step', 2, waves.vessels.reduce((a, v) => a + v.records.filter(r => r.step).length, 0)],
);

// ── ORACLE: greedy vs every choice sequence, on every RMC14 target ──
function bruteForceMixes(plan, instances) {
  let best = Infinity;
  const walk = (path) => {
    const counts = [];
    const res = V.assign(plan, instances, { choose: (i, options) => { counts[i] = options.length; return options[path[i] || 0]; } });
    if (path.length >= plan.steps.length) { best = Math.min(best, res.totals.mixes); return; }
    for (let k = 0; k < (counts[path.length] || 1); k++) walk(path.concat(k));
  };
  walk([]);
  return best;
}
setSource('rmc14');
const oracleSets = { '1x300+tank': [HIGHCAP(), TANK()], '2x120': [LARGE(2)], '120+300': [LARGE(), HIGHCAP()] };
const mismatches = [];
let oracleRuns = 0;
for (const [id, r] of Object.entries(data.reagents)) {
  if (!g('reagentInActiveFork')(r)) continue;
  const plan = planBrew([{ id, amount: 300 }], 0);
  if (!plan.steps.length) continue;
  for (const [name, rows] of Object.entries(oracleSets)) {
    const inst = V.expand(rows);
    const greedy = V.assign(plan, inst).totals.mixes;
    const best = bruteForceMixes(plan, inst);
    oracleRuns++;
    if (greedy !== best) mismatches.push(`${id} @ ${name}: greedy ${greedy}, best ${best}`);
  }
}
setSource('vanilla');
cases.push(
  ['the oracle ran on every RMC14 target and vessel set', true, oracleRuns >= 83 * 3],
  ['greedy matches brute force on all of them', [], mismatches],
);

// ── R11: what the player reads ──────────────────────────────────────────────
setSource('vanilla');
const cryoPlan = planBrew([{ id: 'Cryoxadone', amount: 540 }], 0);
const cryoHtml = V.renderSection ? V.renderSection(cryoPlan, V.expand([TANK()])) : '';
const hotHtml = V.renderSection ? V.renderSection(planBrew([{ id: 'Fersilicite', amount: 150 }], 0), V.expand([TANK()])) : '';
const section = g('renderPlanStepsSection');
const realInventory = V.inventory;
V.inventory = () => [row('highcap', 300, true, 0)];
const flatHtml = section(cryoPlan, 'none');
V.inventory = realInventory;

cases.push(
  ['the steps are grouped into vessel cards', true, /class="vessel-card/.test(cryoHtml)],
  ['a chained step reads «pour in»', true, /&darr; pour in/.test(cryoHtml)],
  ['…with the simulator tick', true, /&#10003; simulator/.test(cryoHtml)],
  ['the leftover catalyst is named', true, /Plasma/.test(cryoHtml) && /left in the vessel/.test(cryoHtml)],
  ['the totals line counts mixes, vessels and transfers', true, /2 mixes · 1 vessel · 0 transfers/.test(cryoHtml)],
  ['a vessel the plan lacks gets a red card', true, /vessel-card-missing/.test(hotHtml)],
  ['…and a warning naming what to bring', true, /needs a vessel that heats/.test(hotHtml)],
  ['an empty vessel set keeps the flat list of R1–R3', true, /class="step-item"/.test(flatHtml) && !/vessel-card/.test(flatHtml)],
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

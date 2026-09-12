// The brew plan: whole units, a 5u pour step, container batches, honest leaves.
// Runs app.js in a vm against the real data.json, the way
// scripts/test_recipe_ranking.js does. Run: node scripts/test_brew_plan.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(process.env.APP_JS || path.join(root, 'app.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));

// app.js only touches the DOM inside functions and on DOMContentLoaded.
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
vm.runInContext(src, ctx, { filename: 'app.js' });
ctx.__data = data;
vm.runInContext('DATA = __data;', ctx);

const g = (name) => vm.runInContext(name, ctx);
const setSource = (s) => vm.runInContext(`activeSource = ${JSON.stringify(s)}; recipeStepsCache.clear();`, ctx);
setSource('vanilla');

const fmtU = g('fmtU');
const planQuantumCu = g('planQuantumCu');
const quantizeOrder = g('quantizeOrder');
const planBatches = g('planBatches');
const planLeafAccess = g('planLeafAccess');
const planBrew = g('planBrew');
const renderPlanSteps = g('renderPlanSteps');
const calculateIngredients = g('calculateIngredients');

// Every number a plan shows, and every number it asks you to dispense.
const planNumbers = (plan) => [
  ...Object.values(plan.totalBase),
  ...plan.steps.map(s => s.amount),
  ...plan.steps.flatMap(s => s.reactants.map(r => r.amount)),
];
const allWhole = (nums) => nums.every(n => Math.abs(n - Math.round(n)) < 1e-9);
const allOn5 = (nums) => nums.every(n => Math.abs(n / 5 - Math.round(n / 5)) < 1e-9);

// The batch the user reported, scaled the way the screenshot was.
const reported = [
  { id: 'Cryoxadone', amount: 500 }, { id: 'Tricordrazine', amount: 300 },
  { id: 'Bicaridine', amount: 700 }, { id: 'Leporazine', amount: 300 },
];
const reportedPlan = planBrew(reported, 120);
const dexalinStep = (cap) => {
  const plan = planBrew([{ id: 'Dexalin', amount: 540 }], cap);
  return plan.steps.find(s => s.reagentId === 'Dexalin');
};
// Only two reactions in the data mix more than 60u in a single run:
// AntidoteBottleConversion (120u, but it has no products, so it is never a step)
// and CMUCreateSludgeGC — 4 × 16u → 64u of CMUBlackSludge, which simply cannot
// be brewed in a 60u beaker.
const sludge = (cap) => {
  setSource('cmu');
  const step = planBrew([{ id: 'CMUBlackSludge', amount: 64 }], cap)
    .steps.find(s => s.reagentId === 'CMUBlackSludge');
  setSource('vanilla');
  return step && step.batchPlan;
};
// OilGhee is a Delta-V reaction, so the butter question only exists under a
// filter that includes it — the report came from a player browsing "All".
const gheePlan = (() => {
  setSource('all');
  const plan = planBrew([{ id: 'OilGhee', amount: 100 }], 120);
  setSource('vanilla');
  return plan;
})();

const cases = [
  // ── the float tail from the report: "85.17999999999999u Plasma" ──
  ['fmtU drops the float tail', '166.67', fmtU(166.67000000000002)],
  ['fmtU keeps whole numbers whole', '180', fmtU(180)],
  ['fmtU keeps a real fraction', '0.5', fmtU(0.5)],
  ['fmtU survives nonsense', '0', fmtU(NaN)],

  // ── the quantum, worked by hand in the decision record ──
  ['a dispenser leaf is whole units', 100, planQuantumCu('Oxygen')],
  ['Dexalin brews in 3u steps (2 O2 + 1 Plasma → 3)', 300, planQuantumCu('Dexalin')],
  ['Cryoxadone brews in 9u steps (needs whole Dexalin)', 900, planQuantumCu('Cryoxadone')],
  ['Tricordrazine brews in 6u steps', 600, planQuantumCu('Tricordrazine')],

  // ── the order the user is offered ──
  ['500u Cryoxadone becomes 540u', 540, quantizeOrder('Cryoxadone', 500).ordered],
  ['…on the 5u pour step', 'pour', quantizeOrder('Cryoxadone', 500).mode],
  ['…in steps of 45u', 45, quantizeOrder('Cryoxadone', 500).quantum],
  ['an order already on the quantum is left alone', 0, quantizeOrder('Cryoxadone', 540).overshoot],
  ['a base chemical needs no rounding', 30, quantizeOrder('Oxygen', 30).ordered],
  ['the guard refuses to inflate a small order by more than a quarter', true,
    (() => { const q = quantizeOrder('Cryoxadone', 30); return q.overshoot <= Math.max(5, 30 * 0.25) + 1e-9; })()],

  // ── the whole tree, not just the target ──
  ['the reported batch comes out in whole units', true, allWhole(planNumbers(reportedPlan))],
  ['…and every number of it lands on the 5u pour step', true, allOn5(planNumbers(reportedPlan))],
  ['…with no float tail in the rendered steps', false, /\.\d{3,}/.test(renderPlanSteps(reportedPlan.steps, 120))],
  ['the unquantized plan still had fractions (the bug)', false,
    allWhole(Object.values(calculateIngredients('Cryoxadone', 500).baseNeeds))],
  ['a 40-target sweep stays whole', true, (() => {
    const ids = Object.keys(data.reagents).filter(id => data.reagents[id].recipe).slice(0, 40);
    return ids.every(id => {
      const q = quantizeOrder(id, 100);
      if (q.mode === 'exact') return true; // opted out on purpose
      return allWhole(planNumbers(planBrew([{ id, amount: 100 }], 0)));
    });
  })()],

  // ── containers: 183 + 183 + 183 does not go into a beaker ──
  ['540u Dexalin fits one 960u bluespace beaker', 1, dexalinStep(960).batchPlan.batches],
  ['…and needs five mixes in a 120u beaker (4 full + 60u)', 5, dexalinStep(120).batchPlan.batches],
  ['…each full mix filling the vessel exactly', 120, dexalinStep(120).batchPlan.perVol],
  ['…the batches adding up to the whole step', true,
    (() => { const b = dexalinStep(120).batchPlan; return Math.abs(b.full * b.perVol + b.restVol - b.total) < 1e-9; })()],
  ['…and every batch poured in multiples of 5u', true,
    (() => { const b = dexalinStep(120).batchPlan; return allOn5([b.perVol, b.restVol].filter(Boolean)); })()],
  ['no capacity means no splitting at all', null, dexalinStep(0).batchPlan],
  ['a 64u run is impossible in a 60u beaker, not split into halves', true, sludge(60).impossible],
  ['…and the message can name the volume that does not fit', 64, sludge(60).volPerRun],
  ['…while a 120u vessel takes it in one mix', 1, sludge(120).batches],

  // ── the catalyst: needed per mix, never consumed (audit B8) ──
  ['plasma shows up as a catalyst need', true, 'Plasma' in planBrew([{ id: 'Dexalin', amount: 540 }], 120).catalystNeeds],
  ['…asking for one mix worth, not the plan total', 40,
    planBrew([{ id: 'Dexalin', amount: 540 }], 120).catalystNeeds.Plasma],
  ['…and the whole dose when it all fits one vessel', 180,
    planBrew([{ id: 'Dexalin', amount: 540 }], 960).catalystNeeds.Plasma],
  ['a catalyst is never billed to the shopping list', false, 'Plasma' in planBrew([{ id: 'Dexalin', amount: 540 }], 120).totalBase],

  // ── honest leaves: "масло как будто в раздатчике есть" ──
  ['a dispenser chemical carries no tag', null, planLeafAccess('Oxygen')],
  ['butter is not in the dispenser', 'another dept.', planLeafAccess('Butter').label],
  ['…but it is obtainable, so it does not block the plan', false, planLeafAccess('Butter').blocking],
  ['…and the tag says where from', true, /ChefVend/.test(planLeafAccess('Butter').hint)],
  ['ghee asks for butter and says so', true,
    'Butter' in gheePlan.totalBase && !!planLeafAccess('Butter')],
  ['…and the warning box names it as fetched elsewhere', true,
    (() => { const w = g('renderPlanWarnings')(gheePlan); return /Butter/.test(w) && /not in the dispenser/.test(w); })()],
  ['an order the ladder refuses is left exact, not tripled', 'exact',
    (() => { setSource('cmu'); const m = quantizeOrder('CMUBlackSludge', 64).mode; setSource('vanilla'); return m; })()],
  ['…and the note says what would brew clean', true,
    (() => { setSource('cmu'); const q = quantizeOrder('CMUBlackSludge', 64); setSource('vanilla'); return q.cleanAt > 64; })()],

  // ── the dispenser really stocks twenty jugs, not twenty-five ──
  ['one of the twenty jugs carries no tag', null, planLeafAccess('Oxygen')],
  ['oil is flagged a dispenser chemical by our data', true, !!data.reagents.Oil.isDispenser],
  ['…but upstream has no oil jug, so the plan says brew it', 'brew it', planLeafAccess('Oil').label],
  ['…and marks it as our own mislabel, not a fetch-elsewhere', true, planLeafAccess('Oil').mislabelled],
  ['water is not in the fill but a jug exists', 'jug from storage', planLeafAccess('Water').label],
  ['welding fuel too', 'jug from storage', planLeafAccess('WeldingFuel').label],
  ['a jug of water gets a tag but no warning in the box', true, (() => {
    const plan = planBrew([{ id: 'Cryoxadone', amount: 500 }], 120);
    return 'Water' in plan.totalBase && !/Water/.test(g('renderPlanWarnings')(plan));
  })()],
  ['the medic preset warns about the oil it asks for', true, (() => {
    const plan = planBrew([{ id: 'Bicaridine', amount: 90 }, { id: 'Kelotane', amount: 90 },
      { id: 'Dylovene', amount: 90 }, { id: 'Epinephrine', amount: 30 }], 120);
    const w = g('renderPlanWarnings')(plan);
    return 'Oil' in plan.totalBase && /does not stock this/.test(w);
  })()],

  // ── a fork's own dispenser: RMC14 stocks RMCOxygen, and the twenty are vanilla's ──
  ['a fork dispenser chemical carries no tag', null, planLeafAccess('RMCOxygen')],
  ['…nor one that also has a recipe (RMCHydrogen from water)', null, planLeafAccess('RMCHydrogen')],
  ['the CMU Sleen plan does not call its RMC ingredients missing', false, (() => {
    setSource('cmu');
    const plan = planBrew([{ id: 'CMUSleen', amount: 1270 }], 500);
    const w = g('renderPlanWarnings')(plan);
    setSource('vanilla');
    return 'RMCOxygen' in plan.totalBase && /does not stock this|not in the dispenser/.test(w);
  })()],

  // ── names, not prototype ids ──
  ['the steps print display names, not ids', true, (() => {
    const plan = planBrew([{ id: 'SodiumCarbonate', amount: 50 }], 120);
    const html = renderPlanSteps(plan.steps, 120);
    return /Table salt/i.test(html) && !/TableSalt/.test(html);
  })()],
];

let failed = 0;
for (const [name, expected, actual] of cases) {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) { console.log('ok   ' + name); continue; }
  failed++;
  console.log('FAIL ' + name + '\n  expected: ' + JSON.stringify(expected) + '\n  got:      ' + JSON.stringify(actual));
}
console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);

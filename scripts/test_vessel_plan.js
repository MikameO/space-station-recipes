// The vessel planner: presets per fork family, the inventory, how a brew plan is
// laid out over beakers and tanks, and the numbered order it is printed in.
// Runs app.js then vessels.js in one vm context against the real data.json.
// Run: node scripts/test_vessel_plan.js
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
  ['"All" has no lineage of its own', 'vanilla', V.familyOf('all')],
  // R15: «Все» names no server, so tanks are shown by default — the owner found none without picking RMC.
  ['"All" shows the CM vessels until the player picks the station', 'cm', V.familyFor('all')],
  ['…so the default set for "All" has the tank', ['1x300', '1x1000'], counted(V.presetFor('all'))],

  // ── presets, read off the prototypes ──
  ['CM preset without Space Stories has no 500u jug', false, keys(V.presetFor('rmc14')).includes('cm-reagentjug')],
  ['Space Stories adds the 500u reagent jug', true, keys(V.presetFor('stories_cm')).includes('cm-reagentjug')],
  ['…which fits the dispenser (it inherits the high-capacity beaker)', true, V.presetFor('stories_cm').find(r => r.key === 'cm-reagentjug').fits],
  ['the 200u RMC jug does not fit the dispenser', false, V.presetFor('rmc14').find(r => r.key === 'cm-jug').fits],
  ['the reagent tank holds 1000u and does not fit the dispenser', '1000/false', (() => { const t = V.presetFor('rmc14').find(r => r.key === 'cm-tank'); return `${t.size}/${t.fits}`; })()],
  ['every preset vessel knows its «из» and «в» forms', true, V.presetFor('rmc14').every(r => r.ruGen && r.ruAcc)],
  ['CM default set: one 300u beaker and one tank', ['1x300', '1x1000'], counted(V.presetFor('rmc14'))],
  ['vanilla default set: one large beaker, no tank', ['1x120'], counted(V.presetFor('vanilla'))],
  ['an empty session falls back to the preset', counted(V.presetFor('rucm')), counted(V.inventory('rucm'))],

  // ── instances ──
  ['expand makes one instance per vessel, biggest first', ['1000', '300'], V.expand(V.presetFor('rmc14')).map(i => String(i.size))],
  ['at equal size the vessel that does not fit the dispenser comes first', [false, true],
    V.expand([{ key: 'a', en: 'a', ru: 'a', size: 200, fits: true, count: 1 }, { key: 'b', en: 'b', ru: 'b', size: 200, fits: false, count: 1 }]).map(i => i.fits)],
  ['a set saved before R14 (heatable) still reads as fits', true, V.expand([{ key: 'old', size: 100, heatable: true, count: 1 }])[0].fits],
  ['zero counts and zero sizes make no instances', 0,
    V.expand([{ key: 'a', en: 'a', ru: 'a', size: 300, fits: true, count: 0 }, { key: 'b', en: 'b', ru: 'b', size: 0, fits: true, count: 2 }]).length],
  ['three beakers of one row are numbered 1..3', [1, 2, 3],
    V.expand([{ key: 'a', en: 'a', ru: 'a', size: 60, fits: true, count: 3 }]).map(i => i.n)],
];

// ── R10 + R14: laying a plan out over vessels ───────────────────────────────
const planBrew = g('planBrew');
const row = (key, size, fits, count) => ({ key, en: key, ru: key, ruGen: key, ruAcc: key, size, fits, count });
const TANK = (n = 1) => row('tank', 1000, false, n);
const HIGHCAP = (n = 1) => row('highcap', 300, true, n);
const LARGE = (n = 1) => row('large', 120, true, n);
const recordOf = (res, reagentId) => res.vessels.flatMap(v => v.records.filter(r => r.step && r.step.reagentId === reagentId).map(r => ({ v, r })))[0];

setSource('vanilla');
const cryo = V.assign(planBrew([{ id: 'Cryoxadone', amount: 540 }], 0), V.expand([TANK(), HIGHCAP()]));
const cryoTankOnly = V.assign(planBrew([{ id: 'Cryoxadone', amount: 540 }], 0), V.expand([TANK()]));
const fersiliciteBeaker = V.assign(planBrew([{ id: 'Fersilicite', amount: 150 }], 0), V.expand([TANK(), LARGE()]));
const fersiliciteTankOnly = V.assign(planBrew([{ id: 'Fersilicite', amount: 150 }], 0), V.expand([TANK()]));
const fanoutPlan = planBrew([{ id: 'Tricordrazine', amount: 300 }, { id: 'Bicaridine', amount: 720 }], 0);
const fanout = V.assign(fanoutPlan, V.expand([TANK(), HIGHCAP(2)]));
const waves = V.assign(planBrew([{ id: 'Cryoxadone', amount: 3000 }], 0), V.expand([TANK()]));
const mixerTarget = Object.keys(data.reagents).find(id => {
  const s = g('calculateIngredients')(id, 100).steps;
  return s.length && s.some(x => x.mixer && x.mixer.length);
});
const mixerRes = mixerTarget ? V.assign(planBrew([{ id: mixerTarget, amount: 100 }], 0), V.expand([TANK(), HIGHCAP()])) : null;

// A side reaction the simulator reports on the Dexalin + water mix must stop the chain.
vm.runInContext(`__realSim = simulateBeaker;
  simulateBeaker = function (c, t, f) { const r = __realSim(c, t, f); if (c.Dexalin && c.Water) r.log.push({ id: 'PotassiumExplosion' }); return r; };`, ctx);
const sideReaction = V.assign(planBrew([{ id: 'Cryoxadone', amount: 540 }], 0), V.expand([TANK(2)]));
// Tank to tank with a beaker on the table: force both steps into tanks and watch the carry.
const tankFirst = (i, options) => options.find(o => o.v && o.v.key === 'tank') || options[0];
const carried = V.assign(planBrew([{ id: 'Cryoxadone', amount: 540 }], 0), V.expand([TANK(2), HIGHCAP()]), { choose: tankFirst });
vm.runInContext('simulateBeaker = __realSim;', ctx);
const carry = carried.transfers.find(t => t.reagentId === 'Dexalin');

cases.push(
  // ── the owner's workflow: brew in the tank, the next step poured on top ──
  ['540u Cryoxadone in a tank with a 300u beaker is two mixes', 2, cryo.totals.mixes],
  ['…with no product poured between vessels', 0, cryo.totals.transfers],
  ['…the beaker measuring everything into the tank in four trips', 4, cryo.totals.trips],
  ['…two vessels: the tank and the measuring beaker', 2, cryo.totals.vessels],
  ['…nothing missing', 0, cryo.totals.missing],
  ['…the second step chained onto the Dexalin', true, recordOf(cryo, 'Cryoxadone').r.chained],
  ['…confirmed by the simulator', true, recordOf(cryo, 'Cryoxadone').r.sim.ok],
  ['…the tank peaking at 600u', 600, cryo.vessels[0].peak],
  ['…and 60u of plasma left in it', 60, cryo.vessels[0].contents.Plasma],

  // ── R14: a tank takes nothing straight from the dispenser ──
  ['a tank alone cannot be filled: the measuring beaker is missing', 'measure', (cryoTankOnly.toolMissing[0] || {}).reason],
  ['…and that counts as a shortage', true, cryoTankOnly.totals.missing >= 1],
  ['a shortage loses to a complete plan even with the same mixes', true, cryo.totals.missing < cryoTankOnly.totals.missing],

  // ── a hot step never goes into something the hotplate will not take ──
  ['Fersilicite (>310K) goes into the beaker, not the free tank', true, recordOf(fersiliciteBeaker, 'Fersilicite').v.fits],
  ['…in two waves of a 120u beaker', 2, recordOf(fersiliciteBeaker, 'Fersilicite').r.waves],
  ['with only a tank the hot step is reported missing', 'none', (fersiliciteTankOnly.missing[0] || {}).missing && fersiliciteTankOnly.missing[0].missing.reason],
  ['…and the missing vessel must fit the dispenser', true, fersiliciteTankOnly.missing[0] && fersiliciteTankOnly.missing[0].missing.fits],

  // ── mixer steps live outside the vessel set ──
  ['a mixer step gets its own mixer card', mixerTarget ? true : 'no mixer step in vanilla data',
    mixerRes ? mixerRes.vessels.some(v => v.mixer && v.records.some(r => r.type === 'mixer')) : 'no mixer step in vanilla data'],

  // ── the simulator vetoes a chain ──
  ['a side reaction in the simulator stops the chain', false, recordOf(sideReaction, 'Cryoxadone').r.chained],
  ['…so the Dexalin is poured over into the second tank', 1, sideReaction.totals.transfers],
  ['…which, with no beaker, has nothing to carry it in', true, sideReaction.toolMissing.some(t => t.reason === 'carry')],
  ['tank to tank goes through the empty beaker', 'highcap', carry && carry.via && carry.via.key],
  ['…180u in one 300u trip', 1, carry && carry.trips],

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

// ── ORACLE: rollout vs every choice sequence, on every RMC14 target ──
// Compared on (shortages, mixes): the rollout must never keep a shortage a
// complete layout avoids, nor spend a mix brute force saves.
function bruteForceBest(plan, instances) {
  let best = null;
  const walk = (pathSoFar) => {
    const counts = [];
    const res = V.assign(plan, instances, { choose: (i, options) => { counts[i] = options.length; return options[pathSoFar[i] || 0]; } });
    if (pathSoFar.length >= plan.steps.length) {
      const t = [res.totals.missing, res.totals.mixes];
      if (!best || t[0] < best[0] || (t[0] === best[0] && t[1] < best[1])) best = t;
      return;
    }
    for (let k = 0; k < (counts[pathSoFar.length] || 1); k++) walk(pathSoFar.concat(k));
  };
  walk([]);
  return best;
}
setSource('rmc14');
const oracleSets = { '1x300+tank': [HIGHCAP(), TANK()], '2x120': [LARGE(2)], '120+300': [LARGE(), HIGHCAP()] };
const mismatches = [];
let oracleRuns = 0;
let oracleTargets = 0;
for (const [id, r] of Object.entries(data.reagents)) {
  if (!g('reagentInActiveFork')(r)) continue;
  const plan = planBrew([{ id, amount: 300 }], 0);
  if (!plan.steps.length) continue;
  oracleTargets++;
  for (const [name, rows] of Object.entries(oracleSets)) {
    const inst = V.expand(rows);
    const got = V.assign(plan, inst).totals;
    const best = bruteForceBest(plan, inst);
    oracleRuns++;
    if (got.missing !== best[0] || got.mixes !== best[1]) mismatches.push(`${id} @ ${name}: rollout ${got.missing}/${got.mixes}, best ${best[0]}/${best[1]}`);
  }
}
setSource('vanilla');
cases.push(
  // The target count follows data.json (a regen adds or drops RMC14 recipes), so
  // the check is that every target met every vessel set, not a fixed number.
  ['the oracle ran on every RMC14 target and vessel set', true,
    oracleTargets > 0 && oracleRuns === oracleTargets * Object.keys(oracleSets).length],
  [`oracle coverage: ${oracleTargets} RMC14 targets × ${Object.keys(oracleSets).length} vessel sets`, true, oracleTargets > 0],
  ['rollout matches brute force on (shortages, mixes) for all of them', [], mismatches],
);

// ── R15: what the player reads ──────────────────────────────────────────────
setSource('vanilla');
const cryoPlan = planBrew([{ id: 'Cryoxadone', amount: 540 }], 0);
const cryoHtml = V.renderSection(cryoPlan, V.expand([TANK(), HIGHCAP()]));
const hotHtml = V.renderSection(planBrew([{ id: 'Fersilicite', amount: 150 }], 0), V.expand([TANK()]));
const fanoutHtml = V.renderSection(fanoutPlan, V.expand([TANK(), HIGHCAP(2)]));
const section = g('renderPlanStepsSection');
const realInventory = V.inventory;
V.inventory = () => [row('highcap', 300, true, 0)];
const flatHtml = section(cryoPlan, 'none');
V.inventory = realInventory;

const panelHost = () => ({ innerHTML: '', querySelector: () => null });
setSource('all');
const allHost = panelHost(); V.mountPanel(allHost);
setSource('rmc14');
const forkHost = panelHost(); V.mountPanel(forkHost);
setSource('vanilla');

cases.push(
  ['the steps are numbered blocks in the order to do them', true, /class="vplan-step/.test(cryoHtml) && /class="vplan-num">1</.test(cryoHtml)],
  ['a tank is filled through the beaker, one reagent per trip', true, /Fill tank 1000u #1 via highcap 300u #1, one reagent per trip/.test(cryoHtml)],
  ['the chained step tops up the same tank', true, /Top up tank 1000u #1 via highcap 300u #1/.test(cryoHtml)],
  ['every pour says how many trips it takes', true, /— 1 trip</.test(cryoHtml)],
  ['…with the simulator tick', true, /&#10003; simulator/.test(cryoHtml)],
  ['the totals count beaker trips', true, /2 mixes · 2 vessels · 0 transfers · 4 beaker trips/.test(cryoHtml)],
  ['the end state names the plasma left in the tank', true, /At the end/.test(cryoHtml) && /60u Plasma/.test(cryoHtml)],
  ['one vessel throughout: no follow-the-numbers note', false, /follow the numbers/.test(cryoHtml)],
  ['a hot step with only a tank gets a red block', true, /vplan-step-missing/.test(hotHtml)],
  ['…naming the vessel it needs', true, /fits the dispenser and hotplate/.test(hotHtml)],
  ['steps across vessels carry the follow-the-numbers note', true, /follow the numbers/.test(fanoutHtml)],
  ['…and mark every change of vessel', true, /vplan-switch/.test(fanoutHtml)],
  ['a transfer names the reagent and both vessels', true, /Pour( off)? 150u Inaprovaline from tank 1000u #1 into highcap 300u #\d/.test(fanoutHtml)],
  ['an empty vessel set keeps the flat list of R1–R3', true, /class="step-item"/.test(flatHtml) && !/vplan-step/.test(flatHtml)],
  ['with source "All" the panel asks which server', true, /data-family="cm"/.test(allHost.innerHTML) && /data-family="vanilla"/.test(allHost.innerHTML)],
  ['…with CM pressed by default', true, /data-family="cm" aria-pressed="true"/.test(allHost.innerHTML)],
  ['…and a nudge to pick RMC14 or RuCM for CM recipes', true, /pick RMC14 or RuCM/.test(allHost.innerHTML)],
  ['a specific fork decides the family itself: no switch', true, !/data-family=/.test(forkHost.innerHTML) && /vessel-family-fixed/.test(forkHost.innerHTML)],
  ['the panel explains beakers, tanks and trips', true, /Tanks and jugs do not/.test(forkHost.innerHTML)],
  ['the fits flag reads «fits dispenser & hotplate»', true, /fits dispenser &amp; hotplate|fits dispenser & hotplate/.test(forkHost.innerHTML)],
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

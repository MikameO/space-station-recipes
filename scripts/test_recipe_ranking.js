// Which reaction the app calls "the recipe" for a reagent: getFilteredReactions
// ranks the producers and rxns[0] feeds the calculator, the batch plan, the
// craft trees, "Fewest Steps" and the detail panel. This runs app.js in a vm
// against the real data.json. Run: node scripts/test_recipe_ranking.js
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
  document: { addEventListener: noop, getElementById: () => stubEl, querySelector: () => null, querySelectorAll: () => [], body: stubEl, documentElement: stubEl },
  window: {}, navigator: { language: 'en' }, location: { hash: '', search: '', href: '' },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  console, setTimeout, clearTimeout,
};
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'app.js' });
ctx.__data = data;
vm.runInContext('DATA = __data;', ctx);

const g = name => vm.runInContext(name, ctx);
const setSource = s => vm.runInContext(`activeSource = ${JSON.stringify(s)}; recipeStepsCache.clear();`, ctx);
const getFilteredReactions = g('getFilteredReactions');
const calculateIngredients = g('calculateIngredients');
let pickRecipe = null;
try { pickRecipe = g('pickRecipe'); } catch (e) { /* not there yet */ }

const first = (mode, id) => { setSource(mode); const rx = getFilteredReactions(id)[0]; return rx ? rx.id : null; };
const steps = (mode, id, amount) => { setSource(mode); return calculateIngredients(id, amount).steps.length; };
const modes = ['all', 'vanilla', ...Object.keys(data.meta.forks).filter(f => f !== 'vanilla')];

// [name, expected, actual]
const cases = [
  // The Discord report (2026-07-31): 30u Diphenhydramine under All was 62 steps.
  ['All: Diphenhydramine is made by its own reaction, not the ADT centrifuge breakdown', 'Diphenhydramine', first('all', 'Diphenhydramine')],
  ['All: 30u Diphenhydramine is 4 steps', 4, steps('all', 'Diphenhydramine', 30)],
  ['All: Tricordrazine is made by its own reaction, not Monolith FentanylSolidification', 'Tricordrazine', first('all', 'Tricordrazine')],
  ['All: 120u Tricordrazine is 3 steps', 3, steps('all', 'Tricordrazine', 120)],
  ['All: 10u Siderlac is 1 step (audit D1)', 1, steps('all', 'Siderlac', 10)],
  // Rule 1: a reaction that consumes as much of the target as it makes is not a recipe for it — in any mode.
  ['Every mode: FentanylSolidification is never offered as a Tricordrazine recipe', [],
    modes.filter(m => { setSource(m); return getFilteredReactions('Tricordrazine').some(rx => rx.id === 'FentanylSolidification'); })],
  ['Monolith: Tricordrazine still has its vanilla recipe first', 'Tricordrazine', first('monolith', 'Tricordrazine')],
  ['Monolith: 120u Tricordrazine is 3 steps', 3, steps('monolith', 'Tricordrazine', 120)],
  // Rule 2: byproducts and breakdowns lose to a reaction named after the target or with a sole product, even against lineage.
  ['ADT: Diphenhydramine is not made by centrifuging Omnizine', 'Diphenhydramine', first('adt', 'Diphenhydramine')],
  ['Goob: SpaceGlue is not a byproduct of the Goob Fentanyl reaction', 'SpaceGlue', first('goob', 'SpaceGlue')],
  ['Goob: Fentanyl keeps its own multi-product reaction (id match)', 'Fentanyl', first('goob', 'Fentanyl')],
  // Rule 3: lineage still wins between two real recipes.
  ['RMC14: Vodka uses the RMC recipe', 'RMCVodka', first('rmc14', 'Vodka')],
  ['All: Vodka uses the vanilla recipe', 'Vodka', first('all', 'Vodka')],
  ['All: TableSalt uses the vanilla recipe', 'TableSalt', first('all', 'TableSalt')],
  // Rule 2 beats the extractor: r.recipe for Protein is BloodBreakdown (a byproduct pick), the recipe is cooking.
  ['Vanilla: Protein is cooked from animal proteins, not a blood breakdown', 'ProteinCooking', first('vanilla', 'Protein')],
  // Rule 4: among equal recipes, the one the extractor chose as r.recipe — so the panel keeps showing what it always did.
  ['Vanilla: Mayo keeps the vinegar recipe (r.recipe), not the first in data order', 'CookingMayoVinegar', first('vanilla', 'Mayo')],
  ['Vanilla: Razorium keeps r.recipe among seven equal recipes', 'CaninaseFelinaseReaction', first('vanilla', 'Razorium')],
  // The step carries its source so the mixing list can badge a fork recipe.
  ['RMC14: the Vodka step knows it came from rmc14', 'rmc14', (() => { setSource('rmc14'); const s = calculateIngredients('Vodka', 30).steps; return s.length ? s[s.length - 1].source : null; })()],
  ['All: the Vodka step is vanilla, no badge', 'vanilla', (() => { setSource('all'); const s = calculateIngredients('Vodka', 30).steps; return s.length ? s[s.length - 1].source : null; })()],
  // The reagent cards ask the same question too (they used to print r.recipe whatever the fork).
  ['RMC14: the Vodka card chips show the RMC recipe', true, (() => { setSource('rmc14'); const h = g('reagentCardHTML')(data.reagents.Vodka); return /reagent-recipe[^<]*Enzyme/.test(h) && !/reagent-recipe[^<]*Ethanol/.test(h); })()],
  ['All: the Vodka card chips show the vanilla recipe', true, (() => { setSource('all'); const h = g('reagentCardHTML')(data.reagents.Vodka); return /reagent-recipe[^<]*Ethanol/.test(h); })()],
  ['RMC14: the botany card for Vodka shows the RMC recipe', true, (() => { setSource('rmc14'); const h = g('botanyCardHTML')(data.reagents.Vodka); return /Enzyme/.test(h) && !/Ethanol/.test(h); })()],
  ['All: a base chemical card keeps its r.recipe chip unchanged (Water: 20x Blood)', true, (() => { setSource('all'); return /<div class="reagent-recipe">20x Blood<\/div>/.test(g('reagentCardHTML')(data.reagents.Water)); })()],
  // The detail panel asks the same question.
  ['pickRecipe exists', true, typeof pickRecipe === 'function'],
  ['RMC14: pickRecipe(Vodka) is the RMC recipe', 'RMCVodka', pickRecipe ? (setSource('rmc14'), pickRecipe('Vodka') && pickRecipe('Vodka').id) : null],
  ['All: pickRecipe(Tricordrazine) is the vanilla recipe', 'Tricordrazine', pickRecipe ? (setSource('all'), pickRecipe('Tricordrazine') && pickRecipe('Tricordrazine').id) : null],
  ['pickRecipe of a base chemical is null', null, pickRecipe ? (setSource('all'), pickRecipe('Water_NoSuchReagent')) : 'missing'],
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

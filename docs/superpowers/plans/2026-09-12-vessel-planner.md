# Vessel Planner (Series R9–R11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The brew planner lays every step of a plan out over the beakers and tanks the player actually has — hot and mixer steps in vessels that fit the hotplate, cold steps in the biggest free vessel, next steps poured on top of an intermediate when the beaker simulator confirms it — per [docs/design/2026-09-12-vessel-planner.md](../../design/2026-09-12-vessel-planner.md).

**Architecture:** A new self-wired browser module `vessels.js` (IIFE, like `botany.js`) owns presets, the inventory panel, the assignment algorithm and the per-vessel rendering; it reads `app.js` globals (`DATA`, `activeSource`, `planBatches`, `simulateBeaker`, `planName`, `fmtU`, `planRu`, `esc`, `loadSession`, `saveSession`, `track`) read-only. `app.js` loses the R4 container select and asks `window.ChemDBVessels` to render the steps section when a vessel set is non-empty. Pure logic is exercised by `scripts/test_vessel_plan.js`, which loads `app.js` then `vessels.js` into one `vm` context against the real `data.json`.

**Tech Stack:** Vanilla browser JS (no build step), Node 24 `vm` for tests, Python 3 for the hunk-staging helper, GitHub Pages deploy (`.github/workflows/deploy.yml`).

**Code blocks marked `file=… part=N`** are concatenated in part order into that file by `scripts/…`-free extraction (see Conventions); every other code block is shown for the edit it describes.

---

## Conventions the whole plan relies on

- **A parallel session edits `app.js`, `index.html`, `sw.js`, `config.py`, `data.json`, `scripts/test_brew_plan.js`.** Before editing a shared file: `git status --short` and re-read the exact lines. Before committing a shared file: `git diff -- <file>` and read every hunk. Stage only your own hunks with the helper below; a hunk that mixes both sessions' lines (a version number both bumped) is staged whole and named in the commit message. Never `git add -A`, never rewrite history.
- **Hunk-staging helper** (scratchpad, not committed): `python stage_mine.py <file> <marker> [<marker> …]` stages every hunk of `git diff -- <file>` that contains at least one `+`/`-` line with one of the markers.

```python
# stage_mine.py — stage only the hunks of a shared file that carry my markers.
import subprocess, sys, tempfile, os
path, markers = sys.argv[1], sys.argv[2:]
diff = subprocess.run(['git', 'diff', '-U3', '--', path], capture_output=True, text=True, encoding='utf-8').stdout
head, hunks, cur = [], [], None
for line in diff.splitlines(keepends=True):
    if line.startswith('@@'):
        cur = [line]; hunks.append(cur)
    elif cur is None:
        head.append(line)
    else:
        cur.append(line)
keep = [h for h in hunks if any((l[:1] in '+-') and any(m in l for m in markers) for l in h[1:])]
if not keep:
    sys.exit(f'no hunk of {path} carries {markers}')
fd, tmp = tempfile.mkstemp(suffix='.patch')
with os.fdopen(fd, 'w', encoding='utf-8', newline='') as f:
    f.write(''.join(head) + ''.join(''.join(h) for h in keep))
subprocess.run(['git', 'apply', '--cached', '--recount', tmp], check=True)
print(f'staged {len(keep)} of {len(hunks)} hunks of {path}')
```

- **Cache-bust (ROADMAP §0.2):** whenever `app.js`, `style.css` or `vessels.js` change, bump their `?v=` in `index.html` (and `style.css` in `library.html`) and in `PRECACHE` in `sw.js`, and bump `CACHE`. Read the current numbers at that moment — the other session moves them.
- **No `[hidden]` for elements with an author `display` rule:** the panel is a native `<details>`; row visibility is never toggled.
- **i18n:** every panel and step string is built in `vessels.js` through `RU()` — they carry numbers the `i18n.js` dictionary cannot match (Decision 5, Series R).
- **Analytics:** new goals `vessel_inventory_change`, `vessel_plan` go into `GOALS` in `scripts/create_metrika_goals.py` in the same task; the script is not run.
- **Commits:** conventional, English, end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`; commit after each task's verification.
- **Test runner:** `node scripts/test_vessel_plan.js` prints `ok <name>` per case and exits 1 on any `FAIL`, like `scripts/test_brew_plan.js`.
- **Materialising `file=… part=N` blocks:** `python extract_plan.py docs/superpowers/plans/2026-09-12-vessel-planner.md` (scratchpad) writes each file from its parts in order.

## File structure

| Path | Responsibility | Task |
|---|---|---|
| `vessels.js` | Presets, family detection, inventory (session), expansion into instances (part 1); assignment algorithm (part 2); per-vessel rendering and the panel (part 3); wiring (part 4) | 2, 4, 6 |
| `scripts/test_vessel_plan.js` | vm harness + cases for parts 1–2, oracle | 1, 3 |
| `app.js` | Drop R4 select (`BREW_CONTAINERS`, `BREW_DEFAULT_CAP`, `brewCapacity`, `brewCapacityLabel`, `setupContainerSelect`, init call); plans built with `cap = 0`; steps section via `renderPlanStepsSection` | 7 |
| `index.html` | Remove the «Container» group, add `<div id="vesselPanelHost">`, script tag `vessels.js?v=1`, version bumps | 7 |
| `style.css` | `.vessel-*` block; drop `.calc-container-custom` rules | 8 |
| `i18n.js` | Drop the three R4 entries | 8 |
| `sw.js`, `.github/workflows/deploy.yml` | `vessels.js` in PRECACHE and cp-list, CACHE bump | 8 |
| `scripts/create_metrika_goals.py` | two goals | 8 |
| `docs/design/2026-09-12-vessel-planner.md` | Mixer finding, presets live in `vessels.js` | 0 |
| `ROADMAP.md`, `CHANGELOG.md`, decision record | R9–R11, release note, addendum | 10 |

---

### Task 0: Amend the spec with what recon settled

**Files:** Modify `docs/design/2026-09-12-vessel-planner.md`

- [ ] **Step 1: Replace the mixer assumption with the finding**

In «Риски и допущения» replace the bullet starting `- **Миксер на CM:**` with:

```markdown
- **Миксеры проверены (2026-09-12):** электролизёр (`BaseTabletopChemicalMachine`,
  `ItemSlots.whitelist: FitsInDispenser`) берёт мензурки, а центрифуга —
  только `CentrifugeCompatible` (пробирки). Поэтому миксерный шаг не
  распределяется по набору посуды вовсе: отдельная карточка «в миксер», без
  цепочек, одно смешивание; его продукт переливается в ёмкость потребителя.
```

In «Алгоритм распределения», step 1, replace `горячий или миксерный шаг — только` `heatable`, with `горячий шаг — только` `heatable`; `миксерный — карточка «в миксер» вне набора`,.

- [ ] **Step 2: Presets live in `vessels.js`**

In «Модуль `vessels.js`» replace the sentence ending `` `BREW_CONTAINERS` (app.js:2298) остаётся источником ванильных объёмов пресета.`` with `` `BREW_CONTAINERS` и `BREW_DEFAULT_CAP` уходят вместе с селектором: пресеты обоих семейств — таблица `PRESETS` в `vessels.js`.``

- [ ] **Step 3: Commit**

```bash
git add docs/design/2026-09-12-vessel-planner.md
git commit -m "docs(design): vessel planner — mixers checked, presets live in vessels.js" -- docs/design/2026-09-12-vessel-planner.md
```

---

## Increment R9 — vessel model

### Task 1: Failing tests for presets, families, inventory, expansion

**Files:** Create `scripts/test_vessel_plan.js`

- [ ] **Step 1: Write the harness and the R9 cases**

```js file=scripts/test_vessel_plan.js part=1
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
```

- [ ] **Step 2: Add the runner at the end (part 9, always last)**

```js file=scripts/test_vessel_plan.js part=9
let failed = 0;
for (const [name, expected, actual] of cases) {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) { console.log('ok   ' + name); continue; }
  failed++;
  console.log('FAIL ' + name + '\n  expected: ' + JSON.stringify(expected) + '\n  got:      ' + JSON.stringify(actual));
}
console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Run to see it fail**

Run: `node scripts/test_vessel_plan.js`
Expected: exits 1 — `ENOENT … vessels.js` (the module does not exist yet).

### Task 2: `vessels.js` part 1 — presets, families, inventory, instances

**Files:** Create `vessels.js`

- [ ] **Step 1: Write part 1**

```js file=vessels.js part=1
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
```

- [ ] **Step 2: Close the IIFE with the exports (part 4, always last)**

```js file=vessels.js part=4
  window.ChemDBVessels = {
    familyOf, presetFor, inventory, saveInventory, expand,
    assign: typeof assign === 'function' ? assign : undefined,
    renderSection: typeof renderSection === 'function' ? renderSection : undefined,
    mountPanel: typeof mountPanel === 'function' ? mountPanel : undefined,
  };
  if (typeof wire === 'function') document.addEventListener('app:ready', wire);
})();
```

- [ ] **Step 3: Run the tests**

Run: `node scripts/test_vessel_plan.js`
Expected: every R9 case `ok`, `all 18 passed`.

- [ ] **Step 4: Commit**

```bash
git add vessels.js scripts/test_vessel_plan.js
git commit -m "feat(calc): vessel presets per fork family, read off the prototypes" -- vessels.js scripts/test_vessel_plan.js
```

---

## Increment R10 — assignment

### Task 3: Failing tests for the assignment and the oracle

**Files:** Modify `scripts/test_vessel_plan.js` (add part 2)

- [ ] **Step 1: Write the R10 cases**

```js file=scripts/test_vessel_plan.js part=2
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
let oracleTargets = 0;
for (const [id, r] of Object.entries(data.reagents)) {
  if (!g('reagentInActiveFork')(r)) continue;
  const plan = planBrew([{ id, amount: 300 }], 0);
  if (!plan.steps.length) continue;
  oracleTargets++;
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
  // The target count follows data.json (a regen adds or drops RMC14 recipes), so
  // the check is that every target met every vessel set, not a fixed number.
  ['the oracle ran on every RMC14 target and vessel set', true,
    oracleTargets > 0 && oracleRuns === oracleTargets * Object.keys(oracleSets).length],
  [`oracle coverage: ${oracleTargets} RMC14 targets × ${Object.keys(oracleSets).length} vessel sets`, true, oracleTargets > 0],
  ['greedy matches brute force on all of them', [], mismatches],
);
```

- [ ] **Step 2: Run to see the R10 cases fail**

Run: `node scripts/test_vessel_plan.js`
Expected: exits 1 — `TypeError: V.assign is not a function` (part 2 of `vessels.js` does not exist yet).

### Task 4: `vessels.js` part 2 — the assignment

**Files:** Modify `vessels.js` (add part 2), `docs/design/2026-09-12-vessel-planner.md`

- [ ] **Step 1: Amend the spec — best fit, not biggest**

In «Алгоритм распределения», step 4, replace «Без цепочки шаг занимает самую большую свободную допустимую ёмкость.» with:

```markdown
4. **Новая ёмкость — по лучшему попаданию.** Без цепочки шаг занимает самую
   маленькую свободную допустимую ёмкость, в которую он входит одной волной;
   для холодного шага среди подходящих сначала те, что не греются (баки,
   канистры), чтобы мензурки оставались под горячие шаги; если одной волной не
   входит никуда — самую большую. «Самая большая» проигрывала: холодный шаг на
   100u занимал 300-ю мензурку, и горячий шаг на 250u уходил в 120-ю тремя
   волнами вместо двух смешиваний.
```

- [ ] **Step 2: Write part 2**

```js file=vessels.js part=2
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
```

- [ ] **Step 3: Run the tests**

Run: `node scripts/test_vessel_plan.js`
Expected: all R9 and R10 cases `ok`, including `greedy matches brute force on all of them` with `[]`. A non-empty mismatch list is a real finding: read the named target's plan, fix the ordering rule (not the test), re-run.

- [ ] **Step 4: Regression**

Run: `node scripts/test_brew_plan.js && node scripts/test_recipe_ranking.js`
Expected: both `all … passed` (part 2 touches no app.js code).

- [ ] **Step 5: Commit**

```bash
git add vessels.js scripts/test_vessel_plan.js
git commit -m "feat(calc): lay a brew plan over beakers and tanks, chaining steps in one vessel" -- vessels.js scripts/test_vessel_plan.js docs/design/2026-09-12-vessel-planner.md
```

---

## Increment R11 — output, panel, wiring

### Task 5: Failing tests for the rendering and the app hook

**Files:** Modify `scripts/test_vessel_plan.js` (add part 3)

- [ ] **Step 1: Write the R11 cases**

```js file=scripts/test_vessel_plan.js part=3
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
```

- [ ] **Step 2: Run to see them fail**

Run: `node scripts/test_vessel_plan.js`
Expected: exits 1 — `renderPlanStepsSection is not defined` and the rendering cases `FAIL` (no part 3 yet).

### Task 6: `vessels.js` part 3 — rendering, panel, wiring

**Files:** Modify `vessels.js` (add part 3)

- [ ] **Step 1: Write part 3**

```js file=vessels.js part=3
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
```

- [ ] **Step 2: Run the module tests (the app hook still fails)**

Run: `node scripts/test_vessel_plan.js`
Expected: rendering cases `ok`; `an empty vessel set keeps the flat list` still `FAIL` (`renderPlanStepsSection` lands in Task 7).

### Task 7: `app.js` and `index.html` — drop the R4 select, call the module

**Files:** Modify `app.js`, `index.html`

- [ ] **Step 1: `app.js` — replace the container constants**

Replace the block from `// Capacities verified against upstream Resources/Prototypes/Entities/Objects/` through `const BREW_DEFAULT_CAP = 120;` with:

```js
// Vessel capacities and presets live in vessels.js (Series R9–R11): the R4
// single-container select gave way to the player's own set of beakers and tanks.
```

- [ ] **Step 2: `app.js` — replace `brewCapacity`, `brewCapacityLabel`, `setupContainerSelect`**

Replace the three functions (from `// The capacity both planners obey. 0 = no limit.` through the closing `}` of `setupContainerSelect`) with:

```js
// R9–R11: with vessels on the table the steps are laid out per vessel by
// vessels.js; with an empty set (or before the module loads) the flat list of
// R1–R3 stays, unsplit.
function renderPlanStepsSection(plan, emptyText) {
  const ru = planRu();
  const V = window.ChemDBVessels;
  const instances = V ? V.expand(V.inventory(activeSource)) : [];
  if (V && V.renderSection && instances.length && plan.steps.length) return V.renderSection(plan, instances);
  return `<div class="calc-section">
      <h3>${ru ? 'Шаги смешивания' : 'Mixing Steps'} (${plan.steps.length})</h3>
      ${renderPlanSteps(plan.steps, 0) || `<p style="color:var(--text-dim)">${emptyText}</p>`}
    </div>`;
}
```

- [ ] **Step 3: `app.js` — callers**

1. In `init`, delete the line `  setupContainerSelect(); // R4: vessel for both planners`.
2. In `setupCalculator`'s click handler replace
   `const cap = brewCapacity();` / `track('calc_run', { target: selectedCalcId, amount, cap });` / `const plan = planBrew([{ id: selectedCalcId, amount }], cap);`
   with `track('calc_run', { target: selectedCalcId, amount });` / `const plan = planBrew([{ id: selectedCalcId, amount }], 0);`.
3. In `planBatch` replace `return planBrew(targets, brewCapacity());` with `return planBrew(targets, 0);`.
4. In `renderCalcResults` replace the whole second `<div class="calc-section">…Mixing Steps…</div>` with
   `${renderPlanStepsSection(plan, ru ? 'Смешивать нечего' : 'No mixing needed')}`.
5. In `renderBatchResults` replace its `Mixing Steps` section with
   `${renderPlanStepsSection(plan, ru ? 'Все цели — базовые реагенты' : 'All targets are base chemicals')}`.

- [ ] **Step 4: `index.html` — markup and script**

1. Delete the R4 comment and its `<div class="calc-input-group">` holding `calcContainer` / `calcContainerCustom`.
2. Right after the closing `</div>` of `.calc-controls` (before `<div class="calc-results" id="calcResults">`) insert
   `<div id="vesselPanelHost" class="vessel-panel-host"></div>`.
3. After `<script src="botany.js?v=1" defer></script>` insert `<script src="vessels.js?v=1" defer></script>`.
4. Bump `app.js?v=N` → `N+1` (read N now).

- [ ] **Step 5: Run everything**

Run: `node --check app.js && node --check vessels.js && node scripts/test_vessel_plan.js && node scripts/test_brew_plan.js && node scripts/test_recipe_ranking.js`
Expected: syntax clean, all three suites `all … passed`.

### Task 8: Styles, dictionary, service worker, deploy list, goals

**Files:** Modify `style.css`, `i18n.js`, `sw.js`, `.github/workflows/deploy.yml`, `scripts/create_metrika_goals.py`, `index.html`, `library.html`

- [ ] **Step 1: `style.css`** — delete `.calc-section-cap { … }`, `.calc-container-custom { margin-top: 6px; }` and `.calc-container-custom[hidden] { display: none !important; }` with their comments; after `.step-batches-bad { … }` insert:

```css
/* ── VESSEL PLANNER (Series R9–R11): the vessel set and per-vessel steps ── */
.vessel-panel-host { margin: -8px 0 16px; }
.vessel-panel { border: 1px solid var(--border-subtle); background: var(--hull); padding: 6px 10px; font-size: 0.72rem; }
.vessel-panel > summary { cursor: pointer; color: var(--text-dim); }
.vessel-panel-title { font-family: 'Oxanium', sans-serif; font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--phosphor); }
.vessel-rows { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
.vessel-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.vessel-name { min-width: 170px; }
.vessel-size input { width: 70px; margin-right: 2px; background: var(--hull-plate); border: 1px solid var(--border-subtle); color: inherit; padding: 2px 4px; }
.vessel-heat { color: var(--text-ghost); }
.vessel-stepper { display: inline-flex; align-items: center; gap: 6px; }
.vessel-stepper button, .vessel-remove { min-width: 26px; height: 24px; background: none; border: 1px solid var(--border-subtle); border-radius: 2px; color: var(--text-dim); cursor: pointer; }
.vessel-stepper button:hover, .vessel-remove:hover { border-color: var(--phosphor-dim); color: var(--phosphor); }
.vessel-count { min-width: 18px; text-align: center; color: var(--phosphor); font-weight: bold; }
.vessel-panel-foot { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.vessel-note { color: var(--text-ghost); font-size: 0.64rem; }
.vessel-card { border: 1px solid var(--border-subtle); padding: 8px 10px; margin-bottom: 8px; }
.vessel-card-title { font-size: 0.68rem; color: var(--cyan); margin-bottom: 4px; }
.vessel-card-missing { border-color: var(--red-alert); }
.vessel-card-missing .vessel-card-title, .vessel-missing-text { color: var(--red-alert); }
.vessel-card-mixer .vessel-card-title { color: var(--violet); }
.vessel-line { padding: 4px 0; font-size: 0.73rem; }
.vessel-store, .vessel-transfer, .vessel-leftover { color: var(--text-ghost); font-size: 0.68rem; }
.vessel-sim-ok { color: var(--phosphor); font-size: 0.62rem; }
.vessel-sim-bad { color: var(--amber); font-size: 0.62rem; }
.vessel-totals { margin-top: 6px; color: var(--amber); font-size: 0.7rem; }
@media (max-width: 768px) {
  .vessel-name { min-width: 0; flex: 1 1 100%; }
  .vessel-stepper button, .vessel-remove { min-width: 44px; height: 44px; }
}
```

- [ ] **Step 2: `i18n.js`** — delete the R4 comment and the entries `'Container'`, `'Mixing container'`, `'Custom container capacity in units'`.
- [ ] **Step 3: `sw.js`** — after `'./botany.js?v=1',` add `'./vessels.js?v=1',`; bump `app.js` and `style.css` versions to match `index.html`; bump `CACHE`. Bump `style.css?v=` in `index.html` and `library.html` to the same number.
- [ ] **Step 4: `deploy.yml`** — in the first `cp` line insert `vessels.js` after `botany.js`.
- [ ] **Step 5: goals** — after `("brew_container", …)` in `scripts/create_metrika_goals.py` add
  `("vessel_inventory_change", "Калькулятор: изменён набор посуды"),` and `("vessel_plan", "Калькулятор: план разложен по посуде"),`.
- [ ] **Step 6: Consistency check**

Run: `grep -o "style.css?v=[0-9]*\|app.js?v=[0-9]*\|vessels.js?v=[0-9]*" index.html library.html sw.js | sort -u && grep -n "vessels.js" .github/workflows/deploy.yml`
Expected: one version per file across all three, and the cp line lists `vessels.js`.

### Task 9: Browser verification, then commit R9–R11 code

- [ ] **Step 1: Fresh preview** — `preview_start {name: "ss14-chem"}`; in the page unregister service workers and delete caches; navigate to `/?lang=ru&t=<unique>#tab=calculator`; confirm `[...document.scripts].map(s=>s.src)` has `vessels.js?v=1` and the bumped `app.js`.
- [ ] **Step 2: CM set** — click the `rmc14` source radio via `el.click()`; open the panel; expect rows 60/120/300/180/200/1000, counts `1×300` and `1×1000`, summary «1×Высокоёмкая мензурка 300u · 1×Бак 1000u».
- [ ] **Step 3: Plan** — find a multi-step rmc14 target in the page (`calculateIngredients(id, 300).steps.length >= 2`), run it through the calculator; expect vessel cards, «↓ долить» on a chained step, «✓ симулятор», the totals line; toggle the tank count to 0 and expect a red card + «Не хватает посуды»; set it back.
- [ ] **Step 4: Empty set** — set every count to 0; expect the flat numbered list and no `.vessel-card`.
- [ ] **Step 5: Mobile** — viewport 375×812; `document.documentElement.scrollWidth <= 375`; stepper buttons `getBoundingClientRect().height >= 44`.
- [ ] **Step 6: EN and console** — `?lang=en` shows «Vessels», «pour in», «Total: … mixes»; `read_console_messages {onlyErrors: true}` empty. Screenshot.
- [ ] **Step 7: Commit only this session's hunks**

```bash
git add vessels.js scripts/test_vessel_plan.js style.css i18n.js library.html .github/workflows/deploy.yml scripts/create_metrika_goals.py
python stage_mine.py app.js renderPlanStepsSection "planBrew(targets, 0)" "planBrew([{ id: selectedCalcId, amount }], 0)" "Vessel capacities and presets live in vessels.js" "setupContainerSelect(); // R4"
python stage_mine.py index.html vesselPanelHost vessels.js calcContainer "app.js?v="
python stage_mine.py sw.js vessels.js "CACHE =" "app.js?v=" "style.css?v="
git diff --cached --stat
git commit -m "feat(calc): brew plans laid out over your own beakers and tanks"
```

Expected: `--cached --stat` lists only this plan's files; any hunk that also carries the other session's version bump is named in the commit body.

---

### Task 10: Roadmap, changelog, decision addendum

**Files:** Modify `ROADMAP.md`, `CHANGELOG.md`, `docs/decisions/2026-09-12_brew-plan-quantization.md`

- [ ] **Step 1: ROADMAP** — after the R8 entry add `### R9. Модель посуды и панель \`[x]\``, `### R10. Распределение по ёмкостям, цепочки, волны, оракул \`[x]\``, `### R11. Вывод по ёмкостям, итог, RU, мобиль \`[x]\`` (HAE 3h / 5h / 3h, «запрос пользователя», R10 **зависит от R9**, R11 **зависит от R10**), each with its **Шаги** (the tasks above in one line each) and **DoD** carrying the values printed by Task 9 and by `node scripts/test_vessel_plan.js` (case count, oracle runs, mismatches); add a revision row 2.8 to «Ревизии».
- [ ] **Step 2: CHANGELOG** — a `## Series R9–R11 — 2026-09-12 (brewing in the vessels you have)` entry above Series R: the owner's workflow in one sentence, the prototype facts (300u beaker, 200u jug that does not heat, 500u Stories jug, 1000u tank with a fill/drain toggle, hotplate whitelist, drain-only vanilla tanks, centrifuge needs `CentrifugeCompatible`), best fit and why, the simulator veto, the oracle result, cache-bust numbers.
- [ ] **Step 3: Decision addendum** — append to Decision 2 a paragraph: R4's single capacity is superseded by the vessel set of `docs/design/2026-09-12-vessel-planner.md`; `planBatches` survives as the wave calculator for one vessel.
- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/decisions/2026-09-12_brew-plan-quantization.md
python stage_mine.py ROADMAP.md "R9." "R10." "R11." "| 2.8 |"
git commit -m "docs(roadmap): R9-R11 — brewing in the vessels you have"
```

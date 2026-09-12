/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2025 MikameO
 * This file is part of Space Station Recipes.
 * See LICENSE for details.
 *
 * SS14 Chemistry Database — Interactive Frontend
 */

let DATA = null;
let searchIndex = [];
let activeTab = 'reagents';
let activeSource = 'all';
let activeBaseType = 'all'; // 'all' | 'base' | 'crafted'
let activeCategories = new Set();
let activeEffectTags = new Set();
let selectedReagentId = null;
let detailHistory = []; // stack for back navigation
let antagMode = false;
let activeSort = 'name-asc'; // 'name-asc' | 'name-desc' | 'category' | 'used-in' | 'antag-desc'
let activeTaste = 'all'; // 'all' | 'has-taste' | 'tasteless'

// ─────────────────────────────────────────────
// Working state that survives a reload
// ─────────────────────────────────────────────
// A refresh used to drop the open tab, the craft-tree target and amount, and
// every tick on the gathering checklist. None of that is worth losing to a
// stray F5 halfway through a shopping run. It is kept in localStorage rather
// than the URL because the hash is only written when Share is clicked, and it
// expires twelve hours after the last use so tomorrow's shift starts clean.
const SESSION_KEY = 'ss14_session';
const SESSION_TTL = 12 * 60 * 60 * 1000;

function loadSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!raw || !raw.at || Date.now() - raw.at > SESSION_TTL) return {};
    return raw.data || {};
  } catch (e) {
    return {};                                   // private mode, or corrupt
  }
}

function saveSession(patch) {
  try {
    const data = Object.assign(loadSession(), patch);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch (e) { /* private mode: the app just forgets, which is the old behaviour */ }
}

// Increment D — antag strategy filters (all default 'all').
// Persisted in URL as af_d / af_s / af_v / af_m.
// Increment K: difficulty & method are multi-select Sets. Empty Set = no
// filter applied (= show all). Stealth & verification stay single-valued
// because they only have 3-4 distinct options — chip-clutter with no payoff.
let antagFilterDifficulties = new Set(); // subset of {trivial, easy, medium, hard, expert, impossible}
let antagFilterStealth      = 'all';     // 'all'|'low'|'medium'|'high'
let antagFilterVerification = 'all';     // 'all'|'all-verified'|'partial'|'lore-only'
let antagFilterMethods      = new Set(); // subset of {inject, ingest, drink, food, area, grenade, splash, foam, smoke}

// ─────────────────────────────────────────────
// Analytics — Yandex.Metrika goal events
// ─────────────────────────────────────────────
// Thin wrapper: no-ops when the counter is blocked (adblock) or absent
// (file:// dev), and must never break the app. Goal ids below have to be
// registered in Metrika as "JavaScript event" goals with the same id;
// params surface in the visit-params report.
//
// Goal ids sent from this file (registry of record:
// scripts/create_metrika_goals.py — run it after adding an id here,
// otherwise Metrika silently drops the new event):
//   tab_<id>                                 — tab opened, dynamic for every
//                                              tab except default 'reagents'
//   reagent_open {reagent, tab}              — detail panel opened
//   fork_select {fork}                       — source filter changed
//   search_used {q, tab, results}            — settled query with results
//   search_zero {q, tab}                     — settled query, 0 results
//   calc_run {target, amount}                — single recipe calculated
//   batch_plan {targets}                     — batch planner run
//   reverse_used {ingredient}                — reverse lookup ingredient added
//   tree_built {reagent}                     — craft tree built
//   tree_checklist_used {reagent}            — first checklist tick on a tree
//   share_click {tab, antag}                 — share link copied
//   antag_on                                 — antag mode enabled
//   preset_to_batch {preset}                 — shift-start preset loaded
//   whatheals_type {type} / _species {species} — medbay filters
//   beaker_sim {n, tempK}                    — beaker simulator run
//   forkdiff_view {from, to}                 — fork diff pair viewed
//   pip_open {api}                           — PiP / popup companion opened
//   companion_filters {open} / companion_collapse {collapsed}
//   pin_callout_shown / pin_callout_dismiss {reason}
// tutorial.js additionally sends: tutorial_start {auto} / tutorial_done /
//   tutorial_skip {step}; maps.js sends: maps_map_select / maps_search /
//   maps_sell_list / maps_multi_show; ordnance.js sends: ordnance_casing /
//   ordnance_add / ordnance_heat_use / ordnance_surf_view / ordnance_pick /
//   ordnance_pick_use / ordnance_req_search / ordnance_req_use /
//   ordnance_ladder_use / ordnance_mask_add / ordnance_mask_use

const YM_COUNTER_ID = 108585248;
function track(goal, params) {
  try {
    if (typeof ym === 'function') ym(YM_COUNTER_ID, 'reachGoal', goal, params);
  } catch (e) { /* analytics must never break the app */ }
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

async function loadData(attempt = 1) {
  try {
    const resp = await fetch('data.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise(r => setTimeout(r, 600 * attempt));
    return loadData(attempt + 1);
  }
}

async function init() {
  // B2: offline PWA + companion (second-screen / PiP) compact layout
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (new URLSearchParams(location.search).get('mode') === 'companion') {
    document.body.classList.add('companion');
  }
  try {
    // No cache-buster: SW serves cached data.json instantly (stale-while-
    // revalidate) and refreshes it in the background; Pages ETag covers the
    // no-SW case. Three attempts with backoff — one flaky mobile moment
    // must not strand the user on an error screen (user-reported).
    DATA = await loadData();
    // L10n-RU: swap nameRu/descRu into the primary fields BEFORE any index
    // or renderer touches DATA — the whole app picks Russian up for free.
    if (window.applyRussianData) window.applyRussianData(DATA);
  } catch (e) {
    document.getElementById('loadingOverlay').innerHTML =
      '<div style="color:#ef4444;padding:20px;text-align:center;">' +
      'Failed to load data.json after 3 attempts<br>' +
      '<small>Check the connection — the app works offline only after one successful visit.</small><br>' +
      '<button class="btn-primary" style="margin-top:12px" onclick="location.reload()">Retry</button></div>';
    return;
  }

  // Validate data structure
  if (!DATA.reagents || !DATA.reactions || !DATA.baseChemicals || !DATA.edges || !DATA.categories) {
    document.getElementById('loadingOverlay').innerHTML =
      '<div style="color:#ef4444;padding:20px;text-align:center;">Invalid data.json structure — missing required fields</div>';
    return;
  }

  buildSearchIndex();
  buildSidebar();
  setupEffectFilters();
  setupTabs();
  setupLogoHome();
  setupSearch();
  setupDetailPanel();
  setupCalculator();
  setupCraftTrees();
  setupReverseLookup();
  setupBatchPlanner();
  renderPresetBar(); // A2: shift-start preset chips
  setupForkDiff(); // B1
  setupBeakerSim(); // C2
  setupShareButton();
  setupPipButton(); // B3
  setupPinCallout();
  setupCompanionBar(); // C3
  setupDisclaimer();
  setupAntagMode();
  setupAntagFilters();
  setupBotanyFilters();
  setupSortSelect();
  decodeURLState();
  restoreSession();

  renderReagents();

  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('headerMeta').textContent =
    `${Object.keys(DATA.reagents).length} reagents | ${Object.keys(DATA.reactions).length} reactions`;

  document.dispatchEvent(new CustomEvent('app:ready'));
}

// ─────────────────────────────────────────────
// Search Index
// ─────────────────────────────────────────────

let usedInLookup = {}; // reagentId -> count of reactions using it

function buildSearchIndex() {
  searchIndex = [];
  usedInLookup = {};
  // Build used-in counts
  for (const rxn of Object.values(DATA.reactions)) {
    for (const reactId of Object.keys(rxn.reactants)) {
      usedInLookup[reactId] = (usedInLookup[reactId] || 0) + 1;
    }
  }
  for (const [id, r] of Object.entries(DATA.reagents)) {
    searchIndex.push({
      id,
      // nameEn exists only in RU mode (set by applyRussianData) — keeps the
      // English name searchable alongside the displayed Russian one.
      text: [r.name, r.nameEn, r.id, r.group, r.category, r.effects, r.desc, r.flavor, r.physicalDesc]
        .filter(Boolean).join(' ').toLowerCase(),
      reagent: r,
    });
  }
}

// Fork ancestry: forkId -> [self, parent, grandparent, ...]. A derivative
// fork ships its parents' custom content too (Funky runs Goob chems, RuCM
// runs RMC14 chems), so the source filter treats ancestor content as native.
function forkChain(forkId) {
  const chain = [];
  let cur = forkId;
  while (cur && cur !== 'vanilla' && !chain.includes(cur)) {
    chain.push(cur);
    cur = DATA.meta?.forks?.[cur]?.parent;
  }
  return chain;
}

// Shared fork-lineage visibility: is this entity (reagent or reaction)
// native-or-inherited under forkId and not blocked by it?
function forkVisible(entity, forkId) {
  if (entity.source !== 'vanilla' && !forkChain(forkId).includes(entity.source)) return false;
  if (entity.forkStatus && entity.forkStatus[forkId] === 'blocked') return false;
  return true;
}

function filterReagents(query) {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter(Boolean);

  return searchIndex.filter(entry => {
    const r = entry.reagent;
    // Source filter: fork mode shows fork-lineage + vanilla (minus blocked).
    // Shared with the medbay mode — see reagentInActiveFork/forkVisible.
    if (!reagentInActiveFork(r)) return false;
    if (activeBaseType === 'base' && !r.isBase) return false;
    if (activeBaseType === 'crafted' && r.isBase) return false;
    if (activeTaste === 'tasteless' && r.flavor) return false;
    if (activeTaste === 'has-taste' && !r.flavor) return false;
    // Botany also matches the secondary tag — see botanyTagged().
    if (activeCategories.size > 0 && !activeCategories.has(r.category) &&
        !(activeCategories.has('Botany') && botanyTagged(r))) return false;
    if (activeEffectTags.size > 0 && !(r.effectTags || []).some(t => activeEffectTags.has(t))) return false;
    if (tokens.length > 0) {
      return tokens.every(t => entry.text.includes(t));
    }
    return true;
  });
}

// Bounded Levenshtein distance — returns max+1 once the running cost
// exceeds max, so zero-result fallback stays O(n * k) with tiny k.
function levenshtein(a, b, max) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;

  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

// Returns up to `limit` reagents whose *name* is within Levenshtein
// distance 2 (or 3 for queries ≥ 6 chars) of the query. Ignores the
// current source/category/taste filters — we want to rescue the user
// from a typo, not honor filters that likely caused the zero-result.
function findSimilarReagents(query, limit = 3) {
  const q = query.toLowerCase().trim();
  if (!q || q.length < 3) return [];
  const max = q.length >= 6 ? 3 : 2;
  const scored = [];
  for (const entry of searchIndex) {
    const name = (entry.reagent.name || entry.reagent.id).toLowerCase();
    const d = levenshtein(q, name, max);
    if (d <= max) scored.push({ entry, d });
  }
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, limit).map(s => s.entry);
}

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────

function buildSidebar() {
  const catDiv = document.getElementById('categoryFilters');
  const counts = {};
  for (const r of Object.values(DATA.reagents)) {
    counts[r.category] = (counts[r.category] || 0) + 1;
    // Plant-affecting chemicals count toward Botany too, matching what the
    // filter actually returns.
    if (r.category !== 'Botany' && botanyTagged(r)) counts.Botany = (counts.Botany || 0) + 1;
  }

  // Use getCatColor() instead of static map — it handles fork categories dynamically

  let html = '';
  for (const cat of DATA.categories) {
    const color = getCatColor(cat);
    const count = counts[cat] || 0;
    html += `<label class="cat-label">
      <input type="checkbox" value="${cat}">
      <span class="cat-dot" style="background:${color}"></span>
      ${cat}
      <span class="cat-count">${count}</span>
    </label>`;
  }
  catDiv.innerHTML = html;

  // Source filter — dynamic from DATA.meta.forks
  buildSourceFilters();

  // Base/Crafted filter
  document.querySelectorAll('input[name="basetype"]').forEach(radio => {
    radio.addEventListener('change', () => {
      activeBaseType = radio.value;
      renderCurrentTab();
    });
  });

  // Category filter
  catDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      activeCategories = new Set(
        [...catDiv.querySelectorAll('input:checked')].map(c => c.value)
      );
      renderCurrentTab();
    });
  });

  // Clear
  document.getElementById('clearCats').addEventListener('click', () => {
    catDiv.querySelectorAll('input').forEach(cb => cb.checked = false);
    activeCategories.clear();
    renderCurrentTab();
  });

  // Taste filter
  document.querySelectorAll('input[name="taste"]').forEach(radio => {
    radio.addEventListener('change', () => {
      activeTaste = radio.value;
      renderCurrentTab();
    });
  });

  // Collapsible sections — sidebar filters + Calculator subsections
  // Sections with data-collapse-key persist state in sessionStorage.
  document.querySelectorAll('[data-collapsible]').forEach(section => {
    const h3 = section.querySelector('h3');
    if (!h3) return;
    const key = section.dataset.collapseKey;
    const stored = key ? sessionStorage.getItem('collapse:' + key) : null;
    if (stored === '1') section.classList.add('collapsed');
    else if (stored === '0') section.classList.remove('collapsed');
    h3.addEventListener('click', (e) => {
      // Don't collapse when clicking nested controls
      if (e.target.closest('.btn-small, .hint-chip')) return;
      section.classList.toggle('collapsed');
      if (key) {
        sessionStorage.setItem('collapse:' + key, section.classList.contains('collapsed') ? '1' : '0');
      }
    });
  });

  // Sidebar collapse (desktop) — button is outside sidebar, toggle both
  const collapseBtn = document.getElementById('sidebarCollapse');
  collapseBtn.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    collapseBtn.classList.toggle('collapsed');
  });

  // Sidebar toggle (mobile)
  const sidebarToggleBtn = document.getElementById('sidebarToggle');
  sidebarToggleBtn.addEventListener('click', () => {
    document.getElementById('sidebarContent').classList.toggle('open');
  });

  // Mobile-only: auto-collapse sidebar at <=480px on first paint so
  // reagent grid claims the screen. Toggle button still visible.
  if (matchMedia('(max-width: 480px)').matches) {
    document.getElementById('sidebarContent').classList.remove('open');
  }

  // Active-filter count badge on the toggle button (reflects sidebar state).
  function updateFilterCountBadge() {
    let n = 0;
    if (typeof activeSource !== 'undefined' && activeSource !== 'all') n++;
    if (typeof activeBaseType !== 'undefined' && activeBaseType !== 'all') n++;
    if (typeof activeTaste !== 'undefined' && activeTaste !== 'all') n++;
    if (typeof activeCategories !== 'undefined') n += activeCategories.size;
    if (typeof activeEffectTags !== 'undefined') n += activeEffectTags.size;
    sidebarToggleBtn.textContent = n > 0 ? `Filters (${n})` : 'Filters';
  }
  updateFilterCountBadge();
  // Catch every radio/checkbox change inside the sidebar to refresh the badge.
  document.getElementById('sidebar').addEventListener('change', updateFilterCountBadge);
}

// ─────────────────────────────────────────────
// Dynamic Source Filters
// ─────────────────────────────────────────────

function buildSourceFilters() {
  const container = document.getElementById('sourceFilters');
  if (!container) return;

  let html = '<label class="radio-label"><input type="radio" name="source" value="all" checked> All</label>';
  html += '<label class="radio-label"><input type="radio" name="source" value="vanilla"> Vanilla SS14</label>';

  if (DATA.meta?.forks) {
    for (const [forkId, meta] of Object.entries(DATA.meta.forks)) {
      if (forkId === 'vanilla') continue;
      html += `<label class="radio-label">
        <input type="radio" name="source" value="${forkId}">
        <span class="fork-dot" style="background:${meta.color}"></span>
        ${meta.name}
      </label>`;
    }
  }

  container.innerHTML = html;

  // Disclaimer div
  container.insertAdjacentHTML('afterend',
    '<div id="forkDisclaimer" class="fork-disclaimer" style="display:none"></div>');

  // Bind change events
  container.querySelectorAll('input[name="source"]').forEach(radio => {
    radio.addEventListener('change', () => {
      activeSource = radio.value;
      if (radio.value !== 'all') track('fork_select', { fork: radio.value });
      updateForkDisclaimer(radio.value);
      // Series O: the Ordnance tab only exists for the fork that ships one.
      if (window.ordnanceForkGate) window.ordnanceForkGate(radio.value);
      renderCurrentTab();
      rebuildTree(); // re-filter Trees tab if a tree is displayed
      // Re-render open detail panel with new fork context
      if (selectedReagentId && document.getElementById('detailPanel').classList.contains('open')) {
        openDetail(selectedReagentId, false);
      }
    });
  });

  // Restore active source if already set
  if (activeSource !== 'all') {
    const radio = container.querySelector(`input[value="${activeSource}"]`);
    if (radio) radio.checked = true;
  }
}

// ─────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────

// Fork source note. Total-conversion forks (D5: RMC-14 renames base reagents)
// get a stronger warning — most vanilla recipes are blocked as unavailable.
function updateForkDisclaimer(forkVal) {
  const disc = document.getElementById('forkDisclaimer');
  if (!disc) return;
  const meta = DATA.meta?.forks?.[forkVal];
  if (forkVal === 'all' || forkVal === 'vanilla' || !meta) {
    disc.style.display = 'none';
    disc.classList.remove('fork-disclaimer-strong');
    return;
  }
  if (meta.totalConversion) {
    disc.innerHTML = `&#9888; <b>${esc(meta.name)} is a total conversion</b> — it renames ${meta.renamedReagents} base reagents (e.g. Fluorine&rarr;RMCFluorine). Most vanilla recipes don't work here and are hidden as unavailable; its own chemistry uses the renamed reagents.`;
    disc.classList.add('fork-disclaimer-strong');
  } else {
    disc.textContent = `${meta.name}: showing vanilla + fork-exclusive chemistry. Blocked reactions filtered out.`;
    disc.classList.remove('fork-disclaimer-strong');
  }
  disc.style.display = 'block';
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById('tab-' + tab).classList.add('active');
      activeTab = tab;
      saveSession({ tab });
      if (tab !== 'reagents') track('tab_' + tab); // reagents is the default view
      renderCurrentTab();
    });
  });
}

function setupLogoHome() {
  const h1 = document.getElementById('logoHome');
  if (!h1) return;
  const goHome = () => {
    const btn = document.getElementById('btn-reagents');
    if (btn) btn.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  h1.addEventListener('click', goHome);
  h1.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goHome();
    }
  });
}

function renderCurrentTab() {
  const query = document.getElementById('searchInput').value;
  if (activeTab === 'reagents') renderReagents(query);
  else if (activeTab === 'medbay') renderMedbay();
  else if (activeTab === 'forkdiff') renderForkDiff();
  else if (activeTab === 'botany') renderBotany(query);
  else if (activeTab === 'antag') { renderAntagStrategies(); renderDeliveryMechanisms(); }
  // calculator and trees tabs have their own autocomplete — no re-render needed on filter change
}

// ─────────────────────────────────────────────
// Botany Tab — chemicals with plantMetabolism effects
// ─────────────────────────────────────────────
// Reuses filterReagents so search / source-lineage / category filters all
// apply; then narrows to reagents carrying plantEffects and (optionally)
// to the selected effect groups.

let botanyFilterGroups = new Set();
// Nearly every drink/food inherits a small PlantAdjustWater/Nutrition from
// the base drink prototype — technically true (you CAN water a plant with
// cola) but it buries real fertilizers. Hidden by default, toggleable.
let botanyHideGeneric = true;
const GENERIC_PLANT_KINDS = new Set(['PlantAdjustWater', 'PlantAdjustNutrition']);
const GENERIC_PLANT_CATS = new Set(['Drinks (Alcoholic)', 'Drinks (Non-Alc)', 'Food & Condiments', 'Biological']);

function isGenericHydration(r) {
  return GENERIC_PLANT_CATS.has(r.category) &&
    r.plantEffects.every(pe => GENERIC_PLANT_KINDS.has(pe.kind));
}

// Secondary "Botany" membership for the Categories filter.
// A reagent's category mirrors the game's own `group` field, so UnstableMutagen
// is a Toxin and Radium an Element even though both are standard hydroponics
// tools — only 18 of the 221 plant-affecting chemicals actually sit in the
// Botany category. Rather than lie about the category, Botany matches a second
// way: anything this tab would show. One rule, two surfaces, no drift.
function botanyTagged(r) {
  return !!(r.plantEffects && r.plantEffects.length) && !isGenericHydration(r);
}

// ── Value ranges ──
// The group chips answer "does it mutate?"; these rows answer "does it mutate
// by at least 1 while leaving the plant alive?". Only kinds carrying a numeric
// `amount` get a row — the eight flag-only kinds (RobustHarvest,
// PlantRemoveKudzu, ...) have nothing to range over and stay chip-only.
// Order is the reading order of the question, not the data's frequency.
const BOTANY_RANGE_KINDS = [
  'PlantAdjustMutationLevel', 'PlantAdjustHealth', 'PlantAdjustNutrition',
  'PlantAdjustWater', 'PlantAdjustToxins', 'PlantAdjustWeeds',
  'PlantAdjustPests', 'PlantAdjustMutationMod', 'PlantAdjustPotency',
  'PlantAffectGrowth',
];
// kind -> {min, max, label}, computed over the reagents the Source filter lets
// through: a vanilla-only view should not offer a bound that only exists in a
// fork. Recomputed when the source changes and at no other time — the bounds
// must not shift while the user is narrowing a search within one fork.
let botanyRangeBounds = {};
// kind -> {min, max}, where null on a side means that inequality is off.
// This stores what the user asked for, NOT resolved numbers: a stored bound has
// to survive a source switch without being mistaken for a leftover of the
// previous dataset. Engaged rows only; rows AND together (and with the chips).
let botanyRanges = {};
// Which source botanyRangeBounds was built from, so the refresh is idempotent.
let botanyRangeBoundsSource = null;

function computeBotanyRangeBounds() {
  const acc = {};
  for (const r of Object.values(DATA.reagents)) {
    if (!reagentInActiveFork(r)) continue;
    for (const pe of r.plantEffects || []) {
      const amt = Number(pe.amount);
      if (!Number.isFinite(amt)) continue;
      const b = acc[pe.kind] || (acc[pe.kind] = { min: amt, max: amt, label: pe.label });
      if (amt < b.min) b.min = amt;
      if (amt > b.max) b.max = amt;
    }
  }
  botanyRangeBounds = acc;
  // A kind this fork has none of loses its row. Dropping the constraint with it
  // keeps the grid honest: otherwise it would filter on a control nobody can
  // see and the result would sit at zero with no way back.
  for (const kind in botanyRanges) if (!acc[kind]) delete botanyRanges[kind];
}

// Rebuild bounds and rows when the Source filter has moved. Called from
// renderBotany so every route in — a radio click, a shared ?src= URL, a restored
// session — lands on bounds that match the fork on screen.
function ensureBotanyRangeBounds() {
  if (botanyRangeBoundsSource === activeSource) return;
  botanyRangeBoundsSource = activeSource;
  computeBotanyRangeBounds();
  const host = document.getElementById('botanyRangeRows');
  if (host) host.innerHTML = botanyRangeRowsHTML();
}

function botanyRangeRowsHTML() {
  return BOTANY_RANGE_KINDS.filter(k => botanyRangeBounds[k]).map(kind => {
    const b = botanyRangeBounds[kind];
    const on = botanyRanges[kind];
    const absent = !!(on && on.absent);
    // A kind with one distinct value (PlantAffectGrowth is always +1) has no
    // range to pick — the tick alone still means "must have this effect".
    const fixed = b.min === b.max;
    // Empty unless the user typed something. The bound lives in the placeholder,
    // so grey reads as "this side is open" and black as "you set this" — and a
    // source switch can refresh the grey half without touching the black one.
    const lo = on && on.min !== null ? on.min : '';
    const hi = on && on.max !== null ? on.max : '';
    return `<div class="brange-row${on ? ' active' : ''}" data-kind="${kind}">
      <label class="brange-toggle">
        <input type="checkbox" class="brange-on"${on ? ' checked' : ''}>
        <span class="brange-label">${esc(b.label)}</span>
      </label>
      ${fixed
        ? `<span class="brange-fixed">= ${b.min}</span>`
        : `<span class="brange-inputs">
            <span class="brange-cap brange-cap-min">≥</span>
            <input type="number" class="brange-min" value="${lo}" step="any" placeholder="${b.min}" aria-label="${esc(b.label)} minimum">
            <span class="brange-cap brange-cap-max">≤</span>
            <input type="number" class="brange-max" value="${hi}" step="any" placeholder="${b.max}" aria-label="${esc(b.label)} maximum">
          </span>`}
      <span class="brange-bounds" title="Range present in the data for the selected source">${b.min} \u2026 ${b.max}</span>
      <button type="button" class="brange-absent${absent ? ' active' : ''}" aria-pressed="${absent}" title="Also keep chemicals that carry no effect of this kind at all — how you ask for a mutagen that simply leaves the plant alone">+ none</button>
    </div>`;
  }).join('');
}

// Read one side of a row; null means that inequality is off. An empty field is
// the off state rather than a zero: Number('') is 0, not NaN, so the obvious
// `Number.isFinite(Number(el.value))` check silently turned a cleared max into
// "<= 0". A half-typed value reads as empty too (a number input reports '' for
// anything it cannot parse), so the grid never blanks out mid-keystroke.
function readBotanyBound(el) {
  if (!el) return null;
  const raw = el.value.trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function syncBotanyRangeRow(row) {
  const kind = row.dataset.kind;
  const on = row.querySelector('.brange-on').checked;
  row.classList.toggle('active', on);
  if (!on) {
    row.classList.remove('no-min', 'no-max');
    delete botanyRanges[kind];
    return;
  }
  const minEl = row.querySelector('.brange-min');
  const maxEl = row.querySelector('.brange-max');
  // Dim the glyph whose side is no longer constraining, so a cleared field
  // reads as "this inequality is off" and not as a value you forgot to type.
  row.classList.toggle('no-min', !!minEl && minEl.value.trim() === '');
  row.classList.toggle('no-max', !!maxEl && maxEl.value.trim() === '');
  const absentBtn = row.querySelector('.brange-absent');
  botanyRanges[kind] = {
    min: readBotanyBound(minEl),
    max: readBotanyBound(maxEl),
    absent: !!(absentBtn && absentBtn.classList.contains('active')),
  };
}

function matchesBotanyRanges(r) {
  for (const kind in botanyRanges) {
    const cfg = botanyRanges[kind];
    const lo = cfg.min === null ? -Infinity : cfg.min;
    const hi = cfg.max === null ? Infinity : cfg.max;
    const own = (r.plantEffects || []).filter(pe => pe.kind === kind);
    // Carrying none of this kind fails the row unless it opted absence in.
    // Treating absence as an implicit zero instead looked elegant and was
    // wrong in practice: any range spanning zero — "pests 0..2", "weeds
    // 0..10" — then matched every chemical that has no such effect at all,
    // so ticking those rows appeared to filter nothing.
    if (!own.length) {
      if (!cfg.absent) return false;
      continue;
    }
    const amounts = own.map(pe => Number(pe.amount)).filter(Number.isFinite);
    // Carries it but unquantified (a flag-only entry): no number to judge.
    if (!amounts.length) continue;
    if (!amounts.some(a => a >= lo && a <= hi)) return false;
  }
  return true;
}

function setupBotanyRanges() {
  const host = document.getElementById('botanyRangeRows');
  if (!host) return;
  ensureBotanyRangeBounds();

  const rerender = () => renderBotany(document.getElementById('searchInput').value);
  // Bound captions are ≥ / ≤ rather than words: unambiguous in every
  // language, so they need no dictionary entry, and narrower on a phone.
  // Checkbox on `change`, number fields on `input` — disjoint guards, so a
  // single edit never fires the render twice.
  host.addEventListener('change', (e) => {
    if (!e.target.matches('.brange-on')) return;
    syncBotanyRangeRow(e.target.closest('.brange-row'));
    rerender();
  });
  host.addEventListener('input', (e) => {
    if (!e.target.matches('.brange-min, .brange-max')) return;
    const row = e.target.closest('.brange-row');
    // Typing a bound is intent to use the row — tick it for the user. Clearing
    // one is the opposite intent (drop that inequality), so it must never tick
    // a row on: judge the field that was just edited, not the row as a whole,
    // or clearing the first of two fields still switches the row on.
    const cb = row.querySelector('.brange-on');
    if (!cb.checked && e.target.value.trim() !== '') cb.checked = true;
    syncBotanyRangeRow(row);
    rerender();
  });

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('.brange-absent');
    if (!btn) return;
    const row = btn.closest('.brange-row');
    btn.classList.toggle('active');
    btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');
    // Opting absence in is intent to use the row, same as typing a bound.
    const cb = row.querySelector('.brange-on');
    if (!cb.checked) cb.checked = true;
    syncBotanyRangeRow(row);
    rerender();
  });

  const reset = document.getElementById('botanyRangeReset');
  if (reset) reset.addEventListener('click', () => {
    botanyRanges = {};
    host.innerHTML = botanyRangeRowsHTML();
    rerender();
  });
}

function setupBotanyFilters() {
  setupBotanyRanges();
  const bar = document.getElementById('botanyFilterChips');
  if (!bar) return;
  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.diff-chip');
    if (!chip) return;
    if (chip.id === 'botanyGenericToggle') {
      botanyHideGeneric = !botanyHideGeneric;
    } else {
      const group = chip.dataset.group;
      if (botanyFilterGroups.has(group)) botanyFilterGroups.delete(group);
      else botanyFilterGroups.add(group);
    }
    chip.classList.toggle('active');
    chip.setAttribute('aria-pressed', chip.classList.contains('active') ? 'true' : 'false');
    renderBotany(document.getElementById('searchInput').value);
  });
}

function plantEffectChipsHTML(effects) {
  return effects.map(pe =>
    `<span class="plant-chip plant-${pe.tone}" title="${esc(pe.label)}">${esc(pe.text)}</span>`
  ).join('');
}

function botanyCardHTML(r) {
  const accent = safeColor(r.color);
  const obtain = r.isBase
    ? (r.isDispenser ? 'Chemical Dispenser' : (r.obtainSources || []).join(' | '))
    : ((pickRecipe(r.id) || r.recipe) ? Object.entries((pickRecipe(r.id) || r.recipe).reactants).map(([id, info]) => `${info.amount}x ${id}`).join(' + ') : '');
  return `<div class="reagent-card" data-id="${r.id}" tabindex="0" role="button" aria-label="${esc(capName(r.name || r.id))}" style="--card-accent:${accent}; border-top-color:${accent}">
    <div class="reagent-card-header">
      <span class="color-swatch" style="background:${accent}; box-shadow:0 0 6px ${accent}"></span>
      <span class="reagent-name">${esc(capName(r.name || r.id))}</span>
      <span class="reagent-id">${esc(r.id)}</span>
    </div>
    <div class="reagent-badges">
      ${r.isBase ? `<span class="badge badge-base">${r.isDispenser ? 'DISPENSER' : 'BASE'}</span>` : ''}
      ${r.source !== 'vanilla' && DATA.meta?.forks?.[r.source] ? `<span class="badge badge-fork" style="border-color:${DATA.meta.forks[r.source].color}">${DATA.meta.forks[r.source].name}</span>` : ''}
    </div>
    <div class="plant-effects">${plantEffectChipsHTML(r.plantEffects)}</div>
    ${obtain ? `<div class="reagent-recipe">${esc(obtain)}</div>` : ''}
  </div>`;
}

// D1: plant evolution forest — mutation chains rendered with the
// craft-tree list styles. Arrows are YAML-extracted (green tier).
function plantVisibleInFork(p) {
  if (activeSource === 'all') return true;
  if (activeSource === 'vanilla') return p.source === 'vanilla';
  return p.source === 'vanilla' || forkChain(activeSource).includes(p.source);
}

function plantNodeHTML(id, visited) {
  const p = DATA.plants[id];
  if (!p) return '';
  const loop = visited.has(id);
  const next = new Set(visited);
  next.add(id);
  const forkBadge = p.source !== 'vanilla' && DATA.meta?.forks?.[p.source]
    ? `<span class="badge badge-fork" style="border-color:${DATA.meta.forks[p.source].color}">${esc(DATA.meta.forks[p.source].name)}</span>` : '';
  const chems = Object.entries(p.chemicals || {})
    .filter(([rid]) => !['Nutriment', 'Vitamin', 'Water'].includes(rid)).slice(0, 3)
    .map(([rid, s]) => `<span class="badge plant-chem-chip" title="${esc(rid)}: ${s.min}–${s.max}u${s.potencyDivisor ? ' (scales with potency/' + s.potencyDivisor + ')' : ''}">${esc(DATA.reagents[rid]?.name ? capName(DATA.reagents[rid].name) : rid)}</span>`).join('');
  const g = p.growth || {};
  const tip = `potency ${g.potency ?? '?'} | yield ${g.yield ?? '?'} | matures ${g.maturation ?? '?'} | lifespan ${g.lifespan ?? '?'}`;
  const kids = loop ? [] : (p.mutations || []).filter(m => DATA.plants[m] && plantVisibleInFork(DATA.plants[m]));
  return `<li>
    <div class="tree-node" title="${esc(tip)}">
      <span class="node-name">${esc(capName(p.name))}</span>
      ${loop ? '<span class="node-badge badge-c">LOOP</span>' : ''}
      ${forkBadge} ${chems}
    </div>
    ${kids.length ? `<ul class="tree-children">${kids.map(m => plantNodeHTML(m, next)).join('')}</ul>` : ''}
  </li>`;
}

function renderPlantEvolution() {
  const host = document.getElementById('plantEvolution');
  if (!host) return;
  const all = Object.values(DATA.plants || {}).filter(plantVisibleInFork);
  const mutatedInto = new Set();
  for (const p of all) for (const m of p.mutations || []) mutatedInto.add(m);
  const roots = all
    .filter(p => (p.mutations || []).length && !mutatedInto.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!roots.length) {
    host.innerHTML = '<p class="reverse-desc">No mutation chains under the current Source filter.</p>';
    return;
  }
  host.innerHTML = `<p class="reverse-desc">${roots.length} chains, ${all.filter(p => (p.mutations || []).length).length} plants with mutation targets (of ${all.length} in view)</p>`
    + roots.map(r => `<ul class="craft-tree plant-tree">${plantNodeHTML(r.id, new Set())}</ul>`).join('');
}

function renderSwabGuide() {
  const host = document.getElementById('swabGuide');
  const guide = DATA.botanyGuide;
  if (!host || !guide) return;
  host.innerHTML = `<div class="guide-card">
    <div class="guide-head">${esc(guide.title)}
      <span class="badge badge-community" title="Curated from playtime — the mechanics live in C# code, not extractable YAML. PRs welcome.">Community knowledge</span>
    </div>
    ${guide.sections.map(s => `<div class="guide-section"><b>${esc(s.h)}</b><p>${esc(s.body)}</p></div>`).join('')}
  </div>`;
}

// Zero results with several value rows ticked is almost always the rows, not
// the search box: each one demands its effect be present, so ticking three
// asks for a chemical carrying all three. Say so, and point at the way out.
function botanyRangeHelpHTML() {
  const n = Object.keys(botanyRanges).length;
  if (!n) return '<span>Clear the search, effect chips, or sidebar filters.</span>';
  const strict = Object.keys(botanyRanges).some(k => !botanyRanges[k].absent);
  return `<span>${n} value condition${n === 1 ? '' : 's'} active, and every one must match.</span>`
    + (strict ? ' <span>A chemical carrying no effect of a kind fails that row — press "+ none" on it to let those through.</span>' : '')
    + ' <span>Or clear the search, chips, or sidebar filters.</span>';
}

function renderBotany(query = '') {
  // Bounds belong to the fork on screen; this is a no-op unless it moved.
  ensureBotanyRangeBounds();
  renderPlantEvolution();
  renderSwabGuide();
  const grid = document.getElementById('botanyGrid');
  let entries = filterReagents(query).filter(e => e.reagent.plantEffects && e.reagent.plantEffects.length);
  if (botanyHideGeneric) {
    entries = entries.filter(e => !isGenericHydration(e.reagent));
  }
  if (botanyFilterGroups.size > 0) {
    entries = entries.filter(e => e.reagent.plantEffects.some(pe => botanyFilterGroups.has(pe.group)));
  }
  entries = entries.filter(e => matchesBotanyRanges(e.reagent));
  entries.sort((a, b) => (a.reagent.name || a.reagent.id).localeCompare(b.reagent.name || b.reagent.id));
  document.getElementById('resultCount').textContent = `${entries.length} botany chemicals`;

  if (entries.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-glyph">&#127793;</div>
      <div class="empty-state-headline">No plant-affecting chemicals match the current filters</div>
      <div class="empty-state-help">${botanyRangeHelpHTML()}</div>
    </div>`;
    return;
  }

  grid.innerHTML = entries.map(e => botanyCardHTML(e.reagent)).join('');
  grid.querySelectorAll('.reagent-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(card.dataset.id); }
    });
  });
}

// ─────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────

function setupSearch() {
  let timer;
  let trackTimer;
  const input = document.getElementById('searchInput');
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => renderCurrentTab(), 150);
    // Longer debounce for analytics — capture settled queries, not keystrokes
    clearTimeout(trackTimer);
    trackTimer = setTimeout(() => {
      const q = input.value.trim();
      if (q.length < 2) return;
      const results = filterReagents(q).length;
      track(results === 0 ? 'search_zero' : 'search_used', { q: q.slice(0, 100), tab: activeTab, results });
    }, 1400);
  });
}

// ─────────────────────────────────────────────
// Reagent Cards
// ─────────────────────────────────────────────

function getCatColor(cat) {
  const map = {
    'Medicine': '#a855f7', 'Toxins': '#ef4444', 'Elements': '#64748b',
    'Chemicals': '#3b82f6', 'Drinks (Alcoholic)': '#f59e0b', 'Drinks (Non-Alc)': '#eab308',
    'Food & Condiments': '#22c55e', 'Pyrotechnic': '#f97316', 'Gases': '#8b5cf6',
    'Botany': '#10b981', 'Biological': '#ec4899', 'Cleaning': '#14b8a6',
    'Fun': '#f472b6', 'Narcotics': '#fb923c', 'Materials': '#6b7280',
  };
  if (map[cat]) return map[cat];
  return '#64748b';
}

// A5: recipe complexity = number of distinct reactions in the fork-aware craft closure.
// base/dispenser = 0; catalysts add no steps (mirrors buildCraftTree); no recipe → Infinity (sorts last).
// v1 is a pure step counter — "hard to obtain" weighting deliberately deferred.
const recipeStepsCache = new Map();
function recipeSteps(reagentId) {
  const key = activeSource + ':' + reagentId;
  if (recipeStepsCache.has(key)) return recipeStepsCache.get(key);
  let steps;
  if (DATA.baseChemicals.includes(reagentId)) {
    steps = 0;
  } else if (getFilteredReactions(reagentId).length === 0) {
    steps = Infinity;
  } else {
    const reactions = new Set();
    (function walk(id, visiting) {
      if (DATA.baseChemicals.includes(id) || visiting.has(id)) return;
      const rxns = getFilteredReactions(id);
      if (!rxns.length) return;
      const rxn = rxns[0];
      if (reactions.has(rxn.id)) return;
      reactions.add(rxn.id);
      const next = new Set(visiting);
      next.add(id);
      for (const [rid, info] of Object.entries(rxn.reactants)) {
        if (!info.catalyst) walk(rid, next);
      }
    })(reagentId, new Set());
    steps = reactions.size;
  }
  recipeStepsCache.set(key, steps);
  return steps;
}

function sortResults(results) {
  const getName = e => (e.reagent.name || e.reagent.id).toLowerCase();
  switch (activeSort) {
    case 'name-asc':  return results.sort((a, b) => getName(a).localeCompare(getName(b)));
    case 'name-desc': return results.sort((a, b) => getName(b).localeCompare(getName(a)));
    case 'category':  return results.sort((a, b) =>
      a.reagent.category.localeCompare(b.reagent.category) || getName(a).localeCompare(getName(b)));
    case 'used-in':   return results.sort((a, b) =>
      (usedInLookup[b.reagent.id] || 0) - (usedInLookup[a.reagent.id] || 0) || getName(a).localeCompare(getName(b)));
    case 'steps-asc': { // A5
      const sv = e => { const s = recipeSteps(e.reagent.id); return Number.isFinite(s) ? s : 1e9; };
      return results.sort((a, b) => sv(a) - sv(b) || getName(a).localeCompare(getName(b)));
    }
    case 'antag-desc': return results.sort((a, b) =>
      (b.reagent.antagScore || 0) - (a.reagent.antagScore || 0) || getName(a).localeCompare(getName(b)));
    default: return results;
  }
}

function setupSortSelect() {
  const sel = document.getElementById('sortSelect');
  if (!sel) return;
  sel.addEventListener('change', () => {
    activeSort = sel.value;
    renderCurrentTab();
  });
}

function renderReagents(query = '') {
  const results = filterReagents(query);
  sortResults(results);
  const grid = document.getElementById('reagentGrid');
  document.getElementById('resultCount').textContent = `${results.length} results`;

  if (results.length === 0) {
    renderEmptyReagentState(query, grid);
    return;
  }

  const BATCH = 80;
  let showCount = BATCH;

  function renderBatch() {
    const showing = results.slice(0, showCount);
    grid.innerHTML = showing.map(e => reagentCardHTML(e.reagent)).join('');
    if (showCount < results.length) {
      grid.innerHTML += `<div class="load-more-row" style="grid-column:1/-1;text-align:center;padding:14px">
        <button class="btn-primary" id="loadMoreBtn">Load More (${results.length - showCount} remaining)</button>
      </div>`;
      document.getElementById('loadMoreBtn').addEventListener('click', () => {
        showCount += BATCH;
        renderBatch();
      });
    }
    grid.querySelectorAll('.reagent-card').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(card.dataset.id); }
      });
    });
  }
  renderBatch();
}

function renderEmptyReagentState(query, grid) {
  const q = query.trim();
  const suggestions = q ? findSimilarReagents(q, 3) : [];
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let html = `<div class="empty-state" style="grid-column:1/-1">
    <div class="empty-state-glyph">&#9888;</div>
    <div class="empty-state-headline">No reagents match ${q ? `"${escapeHtml(q)}"` : 'the current filters'}</div>`;

  if (suggestions.length) {
    html += `<div class="empty-state-help">Did you mean:</div>
      <div class="empty-state-chips">
        ${suggestions.map(s =>
          `<button class="empty-state-chip" data-name="${escapeHtml(s.reagent.name || s.reagent.id)}">${escapeHtml(s.reagent.name || s.reagent.id)}</button>`
        ).join('')}
      </div>`;
  } else if (q) {
    html += `<div class="empty-state-help">Try a different spelling, clear filters, or open the tutorial for a quick orientation.</div>`;
  } else {
    html += `<div class="empty-state-help">Try removing some filters from the sidebar.</div>`;
  }

  html += `<div class="empty-state-actions">
      ${q ? `<button class="btn-small" id="emptyClearSearch">Clear search</button>` : ''}
      <button class="btn-small" id="emptyOpenHelp">Open tutorial</button>
    </div>
  </div>`;

  grid.innerHTML = html;

  grid.querySelectorAll('.empty-state-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const input = document.getElementById('searchInput');
      input.value = chip.dataset.name;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  const clearBtn = document.getElementById('emptyClearSearch');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    const input = document.getElementById('searchInput');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const helpBtn = document.getElementById('emptyOpenHelp');
  if (helpBtn) helpBtn.addEventListener('click', () => {
    document.getElementById('helpBtn').click();
  });
}

// The secondary Botany badge appears only while the Botany category filter is
// on. It exists to answer "why is a Toxin in this list?", and that question is
// only asked there — ~81 sodas carry a -0.1 plant-health tick, so showing it
// unconditionally would paint the whole grid green for no information.
function reagentCardHTML(r) {
  // The chip line answers the Source filter like the panel and the calculator
  // do; a base chemical keeps the extractor's r.recipe (a breakdown, if any).
  const rx = r.isBase ? r.recipe : (pickRecipe(r.id) || r.recipe);
  const recipe = rx
    ? Object.entries(rx.reactants).map(([id, info]) =>
        `${info.amount}x ${id}${info.catalyst ? ' (cat)' : ''}`).join(' + ')
    : '';
  const catColor = getCatColor(r.category);

  const accent = safeColor(r.color);
  return `<div class="reagent-card" data-id="${r.id}" tabindex="0" role="button" aria-label="${esc(capName(r.name || r.id))}" style="--card-accent:${accent}; border-top-color:${accent}">
    <div class="reagent-card-header">
      <span class="color-swatch" style="background:${accent}; box-shadow:0 0 6px ${accent}"></span>
      <span class="reagent-name">${esc(capName(r.name || r.id))}</span>
      <span class="reagent-id">${esc(r.id)}</span>
    </div>
    <div class="reagent-badges">
      <span class="badge badge-cat" style="border-left-color:${catColor}">${esc(r.category)}</span>
      ${activeCategories.has('Botany') && r.category !== 'Botany' && botanyTagged(r) ? `<span class="badge badge-cat badge-botany-tag" style="border-left-color:${getCatColor('Botany')}" title="Affects plants in a hydroponics tray \u2014 also matches the Botany category filter">Botany</span>` : ''}
      ${r.isBase ? `<span class="badge badge-base">${r.isDispenser ? 'DISPENSER' : 'BASE'}</span>` : ''}
      ${(!r.recipe && (!r.obtainSources || r.obtainSources.length === 0) && !r.isDispenser) ? `<span class="badge badge-unobtainable" title="No recipe, no plant, no dispenser source \u2014 unobtainable in vanilla play">UNOBTAINABLE</span>` : ''}
      ${r.overdose ? `<span class="badge badge-od">OD ${r.overdose}u</span>` : ''}
      ${activeSort === 'steps-asc' && Number.isFinite(recipeSteps(r.id)) ? `<span class="badge badge-steps">&#9879; ${recipeSteps(r.id)} step${recipeSteps(r.id) === 1 ? '' : 's'}</span>` : ''}
      ${r.source !== 'vanilla' && DATA.meta?.forks?.[r.source] ? `<span class="badge badge-fork" style="border-color:${DATA.meta.forks[r.source].color}">${DATA.meta.forks[r.source].name}</span>` : ''}
      ${antagMode && r.antagScore ? `<span class="badge badge-antag">${'\u2620'} ${r.antagScore}/10</span>` : ''}
      ${antagMode && r.antagTags ? r.antagTags.map(t => `<span class="badge badge-antag-tag">${esc(t)}</span>`).join('') : ''}
    </div>
    ${recipe ? `<div class="reagent-recipe">${esc(recipe)}</div>` : ''}
    ${!recipe && r.obtainSources && r.obtainSources.length ? `<div class="reagent-sources">${r.obtainSources.map(s => esc(s)).join(' | ')}</div>` : ''}
    ${r.effects ? `<div class="reagent-effects">${renderEffectsHTML(r.effects, true)}</div>` : ''}
    ${usedInLookup[r.id] ? `<div class="reagent-used-in">Used in ${usedInLookup[r.id]} recipe${usedInLookup[r.id] > 1 ? 's' : ''}</div>` : ''}
  </div>`;
}

// ─────────────────────────────────────────────
// Human-readable Effects Renderer
// ─────────────────────────────────────────────
// Two layers:
//   1. parseEffectPart  — splits "[Path] body (if cond) @N%" into structured data
//   2. humanizeBody / humanizeCondition — turn raw tokens into plain English
// Compact mode → single-line chips for reagent cards (space-constrained)
// Verbose mode → grouped rows with wrapped text for the detail panel

function renderEffectsHTML(effectsStr, compact = false) {
  if (!effectsStr) return '';
  const parsed = effectsStr.split('; ').flatMap(parseEffectPart);
  return compact ? renderEffectsCompact(parsed) : renderEffectsVerbose(parsed);
}

function parseEffectPart(part) {
  const pathMatch = part.match(/^\[([^\]]+)\]\s*/);
  const path = pathMatch ? pathMatch[1] : '';
  let rest = pathMatch ? part.slice(pathMatch[0].length) : part;

  const probMatch = rest.match(/\s*@(\d+)%\s*$/);
  const prob = probMatch ? parseInt(probMatch[1], 10) : null;
  if (probMatch) rest = rest.slice(0, probMatch.index).trimEnd();

  const condMatch = rest.match(/\s*\(if ([^)]+)\)\s*$/);
  const conds = condMatch ? condMatch[1].split(/,\s*/).filter(Boolean) : [];
  if (condMatch) rest = rest.slice(0, condMatch.index).trimEnd();

  // Python extractor concatenates multi-direction HealthChange into one body
  // (e.g. "Deals Cold 0.01 Heals Heat 3"). Split back into separate entries
  // so each gets its own row, but share the same path / conds / prob.
  const healthTokens = rest.match(/(?:Heals|Deals)\s+\S+\s+[\d.]+(?:\s*\(even\))?/gi);
  if (healthTokens && healthTokens.length > 1) {
    return healthTokens.map(body => ({ path, body: body.trim(), conds, prob }));
  }

  return [{ path, body: rest, conds, prob }];
}

function humanizeBody(body, opts = {}) {
  const short = !!opts.short;
  let m;

  if (m = body.match(/^Heals\s+(\S+)\s+([\d.]+)(.*)$/i)) {
    const even = /\beven\b/i.test(m[3]) ? ' (all limbs)' : '';
    return { kind: 'heal', text: short ? `+${m[2]} ${m[1]}` : `Heals ${m[2]} ${m[1].toLowerCase()} damage${even}` };
  }
  if (m = body.match(/^Deals\s+(\S+)\s+([\d.]+)(.*)$/i)) {
    const even = /\beven\b/i.test(m[3]) ? ' (all limbs)' : '';
    return { kind: 'damage', text: short ? `-${m[2]} ${m[1]}` : `Deals ${m[2]} ${m[1].toLowerCase()} damage${even}` };
  }
  if (m = body.match(/^Speed\s+walk=([\d.]+)\s+sprint=([\d.]+)/i)) {
    const walk = parseFloat(m[1]), sprint = parseFloat(m[2]);
    if (walk === 0 && sprint === 0) {
      return { kind: 'speed', text: short ? 'Paralyzed' : 'Fully paralyzes movement (cannot walk or run)' };
    }
    if (walk === sprint) {
      if (walk < 1) {
        const pct = Math.round((1 - walk) * 100);
        return { kind: 'speed', text: short ? `Slow ${pct}%` : `Slows movement by ${pct}% (walk & run \u00d7${walk})` };
      }
      if (walk > 1) {
        const pct = Math.round((walk - 1) * 100);
        return { kind: 'speed', text: short ? `Fast +${pct}%` : `Speeds up movement by ${pct}% (walk & run \u00d7${walk})` };
      }
      return { kind: 'speed', text: 'Normal speed' };
    }
    return { kind: 'speed', text: short ? `W\u00d7${walk} R\u00d7${sprint}` : `Walk \u00d7${walk}, run \u00d7${sprint}` };
  }
  if (m = body.match(/^Temp\s+(-?[\d.]+)/i)) {
    const delta = parseFloat(m[1]);
    if (delta < 0) return { kind: 'temperature', text: short ? `Cool ${Math.abs(delta)}K` : `Cools body by ${Math.abs(delta).toLocaleString()} K` };
    return { kind: 'temperature', text: short ? `Warm ${delta}K` : `Warms body by ${delta.toLocaleString()} K` };
  }
  if (/^Message\s*popup$/i.test(body) || /^Popup$/i.test(body)) {
    return { kind: 'message', text: short ? 'Popup msg' : 'Shows a popup message to the victim' };
  }
  if (m = body.match(/^Popup\s*\(([^)]+)\):\s*(.+)$/i)) {
    return { kind: 'message', text: short ? 'Popup msg' : `Popup (${m[1]}): ${m[2]}` };
  }
  if (m = body.match(/^Popup\s*message:\s*(.+)$/i)) {
    return { kind: 'message', text: short ? 'Popup msg' : `Popup: ${m[1]}` };
  }
  if (m = body.match(/^Status:?\s*(.+)$/i)) {
    const raw = m[1].replace(/ModifyStatusEffect|GenericStatusEffect/gi, '').trim();
    if (!raw) {
      return { kind: 'status', text: short ? 'Status fx' : 'Applies a status effect' };
    }
    return { kind: 'status', text: short ? raw : `Applies status: ${raw}` };
  }
  if (m = body.match(/^StatusEffect\s*(.*)$/i)) {
    const label = m[1].trim();
    return { kind: 'status', text: short ? (label || 'Status') : (label ? `Applies status: ${label}` : 'Applies a status effect') };
  }
  if (/^Jitter$/i.test(body)) return { kind: 'status', text: short ? 'Jitter' : 'Causes jittering' };
  if (/^Stutter$/i.test(body)) return { kind: 'status', text: short ? 'Stutter' : 'Causes stuttering speech' };
  if (/^Drunk$/i.test(body)) return { kind: 'status', text: short ? 'Drunk' : 'Causes drunkenness' };
  if (/^Adrenaline$/i.test(body)) return { kind: 'status', text: short ? 'Adrenaline' : 'Triggers an adrenaline surge' };
  if (/^Vomit$/i.test(body)) return { kind: 'damage', text: short ? 'Vomit' : 'Causes vomiting' };
  if (/^Paralyze$/i.test(body)) return { kind: 'damage', text: short ? 'Paralyze' : 'Paralyzes the target' };
  if (/^Electrocut/i.test(body)) return { kind: 'damage', text: short ? 'Shock' : 'Electrocutes the target' };
  if (/^Flammable/i.test(body)) return { kind: 'damage', text: short ? 'Flammable' : 'Makes target flammable' };
  if (/^Explosion/i.test(body)) return { kind: 'damage', text: short ? 'Boom' : 'Triggers an explosion' };
  if (/^Foam/i.test(body)) return { kind: 'damage', text: short ? 'Foam' : 'Creates foam' };
  if (/^Smoke/i.test(body)) return { kind: 'damage', text: short ? 'Smoke' : 'Creates smoke cloud' };
  if (/^Resets\s*narcolepsy$/i.test(body)) return { kind: 'heal', text: short ? 'Cure narcolepsy' : 'Cures narcolepsy' };
  if (/^Cures?\s*disease/i.test(body)) return { kind: 'heal', text: short ? 'Cure disease' : 'Cures diseases' };
  if (/^Oxygenates?\s*blood/i.test(body)) return { kind: 'heal', text: short ? 'Oxygenate' : 'Oxygenates blood' };
  if (m = body.match(/^Thirst\s*x([\d.]+)/i)) return { kind: 'other', text: short ? `Thirst \u00d7${m[1]}` : `Satiates thirst (\u00d7${m[1]})` };
  if (m = body.match(/^Hunger\s*x([\d.]+)/i)) return { kind: 'other', text: short ? `Hunger \u00d7${m[1]}` : `Satiates hunger (\u00d7${m[1]})` };
  if (m = body.match(/^Adds\s+([\d.]+)u?\s+(\S+)/i)) return { kind: 'status', text: short ? `+${m[1]}u ${m[2]}` : `Adds ${m[1]}u of ${m[2]}` };
  if (m = body.match(/^Removes\s+([\d.]+)u?\s+(\S+)/i)) return { kind: 'status', text: short ? `-${m[1]}u ${m[2]}` : `Removes ${m[1]}u of ${m[2]}` };
  if (m = body.match(/^Blood\s*level\s*(.+)$/i)) return { kind: 'status', text: short ? 'Blood lvl' : `Changes blood level: ${m[1]}` };
  if (m = body.match(/^Bleed\s+(.+)$/i)) return { kind: 'damage', text: short ? `Bleed ${m[1]}` : `Modifies bleeding (${m[1]})` };
  if (/^EvenHealthChange$|^HealthChange$/i.test(body)) return { kind: 'other', text: short ? 'Health change' : 'Generic health change' };
  if (m = body.match(/^Emote:\s*(.+)$/i)) return { kind: 'status', text: short ? `Emote ${m[1]}` : `Forces emote: ${m[1]}` };
  if (m = body.match(/^Creates?\s+gas:\s*(.+)$/i)) return { kind: 'damage', text: short ? `Gas ${m[1]}` : `Creates gas: ${m[1]}` };
  if (m = body.match(/^Spawns:\s*(.+)$/i)) return { kind: 'other', text: short ? `Spawn ${m[1]}` : `Spawns entity: ${m[1]}` };
  if (/^Plant\s*effect/i.test(body)) return { kind: 'other', text: short ? 'Plant fx' : 'Affects the plant' };
  return { kind: 'other', text: body };
}

function humanizeCondition(cond) {
  const c = cond.trim();
  let m;
  // Rich form from updated extractor: "self > 0u", "self in range 0..5u", "self present"
  if (m = c.match(/^(\S+)\s+in range\s+([\d.]+)\.\.([\d.]+)u$/i)) {
    return `${m[1] === 'self' ? 'reagent' : m[1]} in body: ${m[2]}\u2013${m[3]}u`;
  }
  if (m = c.match(/^(\S+)\s*>\s*([\d.]+)u$/i)) {
    return `${m[1] === 'self' ? 'reagent' : m[1]} in body above ${m[2]}u`;
  }
  if (m = c.match(/^(\S+)\s*<\s*([\d.]+)u$/i)) {
    return `${m[1] === 'self' ? 'reagent' : m[1]} in body below ${m[2]}u`;
  }
  if (m = c.match(/^(\S+)\s+present$/i)) {
    return `${m[1] === 'self' ? 'reagent' : m[1]} is active in body`;
  }
  if (m = c.match(/^body\s*temp\s+([\d.]+)\.\.([\d.]+)K$/i)) {
    return `body temperature ${m[1]}\u2013${m[2]} K`;
  }
  if (m = c.match(/^body\s*temp\s*>\s*([\d.]+)K$/i)) {
    return `body temperature above ${m[1]} K`;
  }
  if (m = c.match(/^body\s*temp\s*<\s*([\d.]+)K$/i)) {
    return `body temperature below ${m[1]} K`;
  }
  if (/^temperature-dependent$/i.test(c)) return 'depends on body temperature';
  if (/^organ:/i.test(c)) return c.replace(/^organ:\s*/i, 'only in organ: ');
  if (/^mob state:/i.test(c)) return c.replace(/^mob state:\s*/i, 'only when target is ');
  if (/^has tag/i.test(c)) return c;
  // Legacy fallbacks from unpatched data.json
  if (/^ReagentCondition$|^ReagentThreshold$/i.test(c)) return 'while reagent is active in body';
  if (/^temp\s*cond$/i.test(c) || /^Temperature$/i.test(c)) return 'under a body-temperature trigger';
  if (m = c.match(/^>\s*([\d.]+)u?$/)) return `amount above ${m[1]}u`;
  if (m = c.match(/^<\s*([\d.]+)u?$/)) return `amount below ${m[1]}u`;
  return c;
}

function prettyPathLabel(path) {
  const map = {
    'Bloodstream': 'Bloodstream (when metabolized)',
    'Touch': 'Skin contact',
    'Ingestion': 'Stomach (when ingested)',
    'Inhalation': 'Lungs (when inhaled)',
    'Tile': 'Spilled tile',
    'Reactive': 'Reactive surface',
    'Injection': 'Injection site',
    'Food': 'Food metabolism',
    'Drink': 'Drink metabolism',
    'Medicine': 'Medicine metabolism',
    'Plant': 'Plant metabolism',
  };
  return map[path] || path;
}

// Fixed category order for predictable scanning across reagents.
// Unknown kinds fall after the listed ones (sort index = Infinity).
const EFFECT_KIND_ORDER = ['heal', 'damage', 'speed', 'temperature', 'status', 'message', 'other'];
const EFFECT_KIND_LABELS = {
  heal: 'Healing',
  damage: 'Damage',
  speed: 'Movement',
  temperature: 'Temperature',
  status: 'Status effects',
  message: 'Messages',
  other: 'Other',
};
function kindOrderIndex(kind) {
  const i = EFFECT_KIND_ORDER.indexOf(kind);
  return i === -1 ? EFFECT_KIND_ORDER.length : i;
}

function renderEffectsCompact(parsed) {
  // Sort the same way as the verbose view so cards and detail stay consistent
  const sorted = parsed
    .map(p => ({ ...p, _h: humanizeBody(p.body, { short: true }) }))
    .sort((a, b) => kindOrderIndex(a._h.kind) - kindOrderIndex(b._h.kind));
  const chips = sorted.map(p => {
    let text = p._h.text;
    if (p.prob != null && p.prob < 100) text += ` ${p.prob}%`;
    if (text.length > 38) text = text.slice(0, 35) + '\u2026';
    return `<span class="effect-chip effect-${p._h.kind}">${esc(text)}</span>`;
  });
  return `<div class="effects-wrap">${chips.join('')}</div>`;
}

function renderEffectsVerbose(parsed) {
  // Level 1: group by metabolism path (preserves insertion order of paths)
  const byPath = new Map();
  for (const p of parsed) {
    const key = p.path || '';
    if (!byPath.has(key)) byPath.set(key, []);
    byPath.get(key).push(p);
  }

  const sections = [];
  for (const [path, items] of byPath) {
    // Humanize once so we know each row's kind for grouping + sorting
    const humanized = items.map(p => ({ ...p, _h: humanizeBody(p.body) }));

    // Level 2: bucket by kind in fixed EFFECT_KIND_ORDER
    const byKind = new Map();
    for (const row of humanized) {
      const k = row._h.kind;
      if (!byKind.has(k)) byKind.set(k, []);
      byKind.get(k).push(row);
    }
    const sortedKinds = [...byKind.keys()].sort((a, b) => kindOrderIndex(a) - kindOrderIndex(b));

    // Show category subheaders only when the path mixes multiple categories,
    // so simple single-category reagents don't get visual overhead.
    const showCategoryHeads = sortedKinds.length > 1;

    const subsections = sortedKinds.map(kind => {
      const rowsHTML = byKind.get(kind).map(row => {
        const condText = row.conds.map(humanizeCondition).filter(Boolean).join(' \u00b7 ');
        const meta = [];
        if (condText) meta.push(condText);
        if (row.prob != null && row.prob < 100) meta.push(`${row.prob}% chance per tick`);
        const metaHTML = meta.length
          ? `<div class="effect-row__meta">${esc(meta.join(' \u00b7 '))}</div>`
          : '';
        return `<div class="effect-row effect-row--${kind}">
          <div class="effect-row__text">${esc(row._h.text)}</div>
          ${metaHTML}
        </div>`;
      }).join('');
      const catHead = showCategoryHeads
        ? `<div class="effect-category__head effect-category__head--${kind}">${esc(EFFECT_KIND_LABELS[kind] || kind)}</div>`
        : '';
      return `<div class="effect-category">${catHead}${rowsHTML}</div>`;
    }).join('');

    const pathHead = path
      ? `<div class="effect-group__head">${esc(prettyPathLabel(path))}</div>`
      : '';
    sections.push(`<div class="effect-group">${pathHead}${subsections}</div>`);
  }
  return `<div class="effects-verbose">${sections.join('')}</div>`;
}

// ─────────────────────────────────────────────
// Detail Panel
// ─────────────────────────────────────────────

function setupDetailPanel() {
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });
}

function openDetail(reagentId, pushHistory = true) {
  const r = DATA.reagents[reagentId];
  if (!r) return;
  if (pushHistory && selectedReagentId && selectedReagentId !== reagentId) {
    detailHistory.push(selectedReagentId);
  }
  // pushHistory=false means a programmatic re-render (back nav, fork switch) — don't double-count
  if (pushHistory) track('reagent_open', { reagent: reagentId, tab: activeTab });
  selectedReagentId = reagentId;

  const panel = document.getElementById('detailPanel');
  const content = document.getElementById('detailContent');

  let recipeHTML = '<p style="color:var(--text-dim)">Base chemical (no recipe)</p>';
  const recipe = pickRecipe(reagentId) || r.recipe;   // fork-ranked; r.recipe only when the fork hides every producer
  if (recipe) {
    recipeHTML = '<div>' + Object.entries(recipe.reactants).map(([id, info]) =>
      `<div class="detail-recipe-item">
        <span class="detail-recipe-amount">${info.amount}x</span>
        <span class="detail-recipe-name" onclick="openDetail('${id}')">${esc(DATA.reagents[id]?.name || id)}</span>
        ${info.catalyst ? '<span class="badge badge-c" style="font-size:0.6rem">CATALYST</span>' : ''}
      </div>`
    ).join('') + '</div>';

    const tempParts = [];
    if (recipe.minTemp) tempParts.push(`Min: ${recipe.minTemp}K`);
    if (recipe.maxTemp) tempParts.push(`Max: ${recipe.maxTemp}K`);
    if (tempParts.length) recipeHTML += `<div style="margin-top:6px;font-size:0.72rem;color:var(--accent-cyan)">${tempParts.join(' | ')}</div>`;
    if (recipe.mixer && recipe.mixer.length) recipeHTML += `<div style="font-size:0.72rem;color:var(--accent-purple)">Mixer: ${recipe.mixer.join(', ')}</div>`;

    const products = Object.entries(recipe.products).map(([id, amt]) => `${amt}x ${DATA.reagents[id]?.name || id}`).join(', ');
    recipeHTML += `<div style="margin-top:6px;font-size:0.72rem;color:var(--accent-green)">Produces: ${products}</div>`;
  }

  // Build mini craft tree with quantity input
  let treeHTML = '';
  if (!r.isBase) {
    const tree = buildCraftTree(reagentId, 1);
    treeHTML = `<div class="tree-amount-row">
      <label for="detailTreeAmount">Target</label>
      <input type="number" id="detailTreeAmount" class="tree-amount-input"
        value="1" min="1" max="9999" step="1" oninput="rebuildDetailTree()"
        title="Target amount (units)">
      <span class="tree-amount-unit">u</span>
    </div>
    <div id="detailTreeOutput">${renderTreeHTML(tree)}</div>`;
  }

  // Find all reactions where this reagent is used as an ingredient
  const usedIn = Object.values(DATA.reactions).filter(rxn =>
    rxn.reactants[reagentId] !== undefined
  );
  let usedInHTML = '';
  if (usedIn.length > 0) {
    usedInHTML = '<div class="used-in-list">' + usedIn.map(rxn => {
      const productIds = Object.keys(rxn.products);
      const productNames = productIds.map(pid => {
        const pr = DATA.reagents[pid];
        return pr ? (pr.name || pid) : pid;
      });
      const isCat = rxn.reactants[reagentId]?.catalyst;
      const amt = rxn.reactants[reagentId]?.amount || 1;
      return `<div class="used-in-item" onclick="openDetail('${productIds[0]}')">
        <span class="used-in-amount">${amt}x</span>
        <span class="used-in-arrow">&rarr;</span>
        <span class="used-in-product">${productNames.map(n => esc(n)).join(', ')}</span>
        ${isCat ? '<span class="node-badge badge-c">CAT</span>' : ''}
        ${rxn.source !== 'vanilla' && DATA.meta?.forks?.[rxn.source] ? '<span class="badge badge-fork" style="margin-left:auto;border-color:' + DATA.meta.forks[rxn.source].color + '">' + esc(DATA.meta.forks[rxn.source].name) + '</span>' : ''}
      </div>`;
    }).join('') + '</div>';
  }

  const backBtn = detailHistory.length > 0
    ? `<button class="detail-back" onclick="goBackDetail()" title="Back to ${esc(DATA.reagents[detailHistory[detailHistory.length-1]]?.name || '')}">&larr; Back</button>`
    : '';

  content.innerHTML = `
    ${backBtn}
    <div class="detail-name">
      <span class="color-swatch" style="background:${safeColor(r.color)};width:20px;height:20px"></span>
      ${esc(capName(r.name || r.id))}
    </div>
    <div class="detail-id">${esc(r.id)} | ${esc(r.category)} | ${r.source !== 'vanilla' && DATA.meta?.forks?.[r.source] ? esc(DATA.meta.forks[r.source].name) : 'Vanilla'}</div>
    ${(!r.recipe && (!r.obtainSources || r.obtainSources.length === 0) && !r.isDispenser) ? `<div class="detail-unobtainable-warn"><span class="badge badge-unobtainable">UNOBTAINABLE</span> No recipe, no plant, no dispenser source \u2014 not available in normal vanilla play. Check fork filter for alternative sources.</div>` : ''}
    ${r.desc ? `<div class="detail-desc">${esc(r.desc)}</div>` : ''}

    <div class="detail-section">
      <h4>Recipe${(() => {
        const altCount = getFilteredReactions(reagentId).length;
        return stepForkBadge(recipe) + (altCount > 1 ? ` <span style="color:var(--amber);font-size:0.55rem;font-weight:400">(+${altCount - 1} alt recipe${altCount > 2 ? 's' : ''})</span>` : '');
      })()}</h4>
      ${recipeHTML}
    </div>

    ${r.effects ? `<div class="detail-section"><h4>Effects</h4>${renderEffectsHTML(r.effects)}</div>` : ''}
    ${r.plantEffects && r.plantEffects.length ? `<div class="detail-section"><h4>Plant Effects (Botany)</h4><div class="plant-effects">${plantEffectChipsHTML(r.plantEffects)}</div></div>` : ''}

    ${r.overdose ? `<div class="detail-section"><h4>Overdose</h4><p class="overdose-warn">${r.overdose}u${r.criticalOverdose ? ' | Critical: ' + r.criticalOverdose + 'u' : ''}</p></div>` : ''}

    ${r.obtainSources && r.obtainSources.length ? `<div class="detail-section"><h4>How to Obtain</h4><div class="obtain-list">${r.obtainSources.map(s => `<span class="obtain-tag">${esc(s)}</span>`).join('')}</div></div>` : ''}

    ${getWarningsHTML(reagentId)}

    ${antagMode ? getAntagIntelHTML(r) : ''}

    ${usedIn.length > 0 ? `<div class="detail-section"><h4>Used In (${usedIn.length} recipes)</h4>${usedInHTML}</div>` : ''}

    ${r.physicalDesc ? `<div class="detail-section"><h4>Physical</h4><p>${esc(r.physicalDesc)}${r.flavor ? ' | Flavor: ' + esc(r.flavor) : ''}</p></div>` : ''}

    ${treeHTML ? `<div class="detail-section"><h4>Craft Tree</h4>${treeHTML}</div>` : ''}
  `;

  panel.classList.add('open');
}

function closeDetail() {
  document.getElementById('detailPanel').classList.remove('open');
  detailHistory = [];
}

function goBackDetail() {
  if (detailHistory.length === 0) return;
  const prevId = detailHistory.pop();
  openDetail(prevId, false); // false = don't push to history
}

function rebuildDetailTree() {
  if (!selectedReagentId) return;
  const r = DATA.reagents[selectedReagentId];
  if (!r || r.isBase) return;
  const input = document.getElementById('detailTreeAmount');
  if (!input) return;
  const amount = Math.max(1, parseFloat(input.value) || 1);
  const tree = buildCraftTree(selectedReagentId, amount);
  const output = document.getElementById('detailTreeOutput');
  if (output) output.innerHTML = renderTreeHTML(tree);
}

// ─────────────────────────────────────────────
// Fork Diff — "moved servers, what changed?" (B1)
// Membership diffs come from the same fork-visibility rules as the filters;
// recipe-change notes are the build-time comparator's forkNotes strings.
// ─────────────────────────────────────────────

function setupForkDiff() {
  const fromSel = document.getElementById('forkDiffFrom');
  const toSel = document.getElementById('forkDiffTo');
  if (!fromSel || !toSel) return;
  // meta.forks already lists vanilla first — no need to prepend it
  const opts = Object.entries(DATA.meta?.forks || {}).map(([id, f]) => [id, f.name || id]);
  for (const [id, name] of opts) {
    fromSel.add(new Option(name, id));
    toSel.add(new Option(name, id));
  }
  const firstFork = opts.find(([id]) => id !== 'vanilla');
  fromSel.value = 'vanilla';
  toSel.value = firstFork ? firstFork[0] : 'vanilla';
  fromSel.addEventListener('change', renderForkDiff);
  toSel.addEventListener('change', renderForkDiff);
}

function renderForkDiff() {
  const el = document.getElementById('forkDiffResults');
  const from = document.getElementById('forkDiffFrom')?.value;
  const to = document.getElementById('forkDiffTo')?.value;
  if (!el || !from || !to) return;
  if (from === to) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-headline">Pick two different forks to compare.</div></div>';
    return;
  }
  track('forkdiff_view', { from, to });

  const addedR = [], removedR = [];
  for (const r of Object.values(DATA.reagents)) {
    const inF = reagentInFork(r, from), inT = reagentInFork(r, to);
    if (!inF && inT) addedR.push(r);
    else if (inF && !inT) removedR.push(r);
  }
  const addedX = [], removedX = [], modX = [];
  for (const rx of Object.values(DATA.reactions)) {
    const inF = reactionInFork(rx, from), inT = reactionInFork(rx, to);
    if (!inF && inT) addedX.push(rx);
    else if (inF && !inT) removedX.push(rx);
    else if (inF && inT) {
      const noteF = rx.forkNotes?.[from] || '';
      const noteT = rx.forkNotes?.[to] || '';
      if (noteF !== noteT) modX.push({ rx, noteF, noteT });
    }
  }
  const byName = arr => arr.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  byName(addedR); byName(removedR);
  const byId = arr => arr.sort((a, b) => (a.rx ? a.rx.id : a.id).localeCompare(b.rx ? b.rx.id : b.id));
  byId(addedX); byId(removedX); byId(modX);

  const chip = r => `<button class="diff-chip" onclick="openDetail('${esc(r.id)}')">${esc(capName(r.name || r.id))}</button>`;
  const rxRow = rx => `<span class="diff-chip diff-chip-static">${esc(rx.id)}</span>`;
  const section = (title, cls, items, renderer) => items.length
    ? `<div class="diff-section">
        <h3 class="diff-h ${cls}">${title} <span class="diff-count">${items.length}</span></h3>
        <div class="diff-body">${items.map(renderer).join('')}</div>
      </div>`
    : '';
  const modRow = m => `<div class="diff-mod">
      <span class="diff-mod-id">${esc(m.rx.id)}</span>
      <span class="diff-mod-note">${esc(m.noteF || 'vanilla recipe')} &#8594; ${esc(m.noteT || 'vanilla recipe')}</span>
    </div>`;

  const total = addedR.length + removedR.length + addedX.length + removedX.length + modX.length;
  el.innerHTML = total === 0
    ? '<div class="empty-state"><div class="empty-state-headline">No differences — these forks share the same chemistry.</div></div>'
    : section('Reagents you gain', 'diff-added', addedR, chip)
    + section('Reagents you lose', 'diff-removed', removedR, chip)
    + section('Reactions you gain', 'diff-added', addedX, rxRow)
    + section('Reactions you lose', 'diff-removed', removedX, rxRow)
    + section('Recipes that differ', 'diff-modified', modX, modRow);
}

// ─────────────────────────────────────────────
// Beaker Simulator (C2) — replays SS14's reaction pass over a mixture.
// Per engine rules: the highest-priority eligible reaction fires first
// (priority serialized since schema 3.4.3; e.g. Smoke/Foam are -10 so real
// recipes win their reagents), consumes at the largest integer multiple,
// then the pass repeats until nothing can react. Mixer-gated reactions
// (Stir/Shake) never auto-fire in a plain beaker.
// ─────────────────────────────────────────────

function simulateBeaker(contents, tempK) {
  const state = {};
  for (const [id, amt] of Object.entries(contents)) state[id] = amt;
  const log = [];
  const MAX_STEPS = 30;

  for (let step = 1; step <= MAX_STEPS; step++) {
    let best = null;
    for (const rx of Object.values(DATA.reactions)) {
      if (!reactionInFork(rx, activeSource === 'all' ? 'all' : activeSource)) continue;
      if (rx.mixer && rx.mixer.length) continue; // needs Stir/Shake — not a beaker pour
      if (rx.minTemp && tempK < rx.minTemp) continue;
      if (rx.maxTemp && tempK > rx.maxTemp) continue;
      let mult = Infinity;
      let ok = true;
      for (const [rid, info] of Object.entries(rx.reactants)) {
        const have = state[rid] || 0;
        if (have < info.amount) { ok = false; break; }
        if (!info.catalyst) mult = Math.min(mult, Math.floor(have / info.amount));
      }
      if (!ok || !isFinite(mult) || mult < 1) continue;
      const pri = rx.priority ?? 0;
      if (!best || pri > best.pri) best = { rx, mult, pri };
    }
    if (!best) break;

    const { rx, mult } = best;
    const consumed = [];
    for (const [rid, info] of Object.entries(rx.reactants)) {
      if (info.catalyst) { consumed.push(`${info.amount}u ${rid} (cat, kept)`); continue; }
      state[rid] = +(state[rid] - info.amount * mult).toFixed(2);
      consumed.push(`${info.amount * mult}u ${rid}`);
      if (state[rid] <= 0.001) delete state[rid];
    }
    const produced = [];
    for (const [pid, amt] of Object.entries(rx.products || {})) {
      state[pid] = +((state[pid] || 0) + amt * mult).toFixed(2);
      produced.push(`${+(amt * mult).toFixed(2)}u ${pid}`);
    }
    log.push({ step, id: rx.id, consumed, produced, effects: rx.effects || '', impact: rx.impact || '', priority: rx.priority });
  }
  return { final: state, log, truncated: log.length >= MAX_STEPS };
}

const beakerContents = {}; // reagentId -> units

function renderBeakerChips() {
  const el = document.getElementById('beakerChips');
  el.innerHTML = Object.entries(beakerContents).map(([id, amt]) =>
    `<span class="reverse-chip">
      <span class="color-swatch" style="background:${safeColor(DATA.reagents[id]?.color)};width:8px;height:8px"></span>
      ${esc(capName(DATA.reagents[id]?.name || id))} ${amt}u
      <span class="reverse-chip-remove" data-id="${esc(id)}">&times;</span>
    </span>`).join('');
  el.querySelectorAll('.reverse-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      delete beakerContents[btn.dataset.id];
      renderBeakerChips();
    });
  });
}

function setupBeakerSim() {
  const input = document.getElementById('beakerInput');
  const suggestions = document.getElementById('beakerSuggestions');
  if (!input) return;
  let pendingId = null;
  setupAutocomplete(input, suggestions, (id) => {
    pendingId = id;
    input.value = capName(DATA.reagents[id]?.name || id);
    suggestions.classList.remove('open');
  });
  document.getElementById('beakerAddBtn').addEventListener('click', () => {
    if (!pendingId) return;
    const amt = Math.max(0.5, parseFloat(document.getElementById('beakerAmount').value) || 30);
    beakerContents[pendingId] = (beakerContents[pendingId] || 0) + amt;
    pendingId = null;
    input.value = '';
    renderBeakerChips();
  });
  document.getElementById('beakerSimBtn').addEventListener('click', () => {
    if (!Object.keys(beakerContents).length) return;
    const tempK = parseFloat(document.getElementById('beakerTemp').value) || 293;
    track('beaker_sim', { n: Object.keys(beakerContents).length, tempK });
    const { final, log, truncated } = simulateBeaker(beakerContents, tempK);
    // Same-name reagents from different forks have different ids and never
    // cross-react — the #1 reason a "known" recipe silently does nothing.
    const sources = new Set(Object.keys(beakerContents).map(id => DATA.reagents[id]?.source || 'vanilla'));
    renderBeakerLog(final, log, truncated, sources.size > 1);
  });
}

function renderBeakerLog(final, log, truncated, mixedSources) {
  const el = document.getElementById('beakerLog');
  const dangerRe = /explosion|explode|ignite|flash|emp|smoke|foam|flammable/i;
  const stepsHTML = log.length
    ? log.map(s => {
        const danger = dangerRe.test(s.effects) || dangerRe.test(s.impact) || dangerRe.test(s.id);
        return `<div class="beaker-step ${danger ? 'beaker-danger' : ''}">
          <span class="beaker-step-n">${s.step}</span>
          <span class="beaker-step-body">
            <b>${esc(s.id)}</b>${s.priority != null ? ` <span class="beaker-pri" title="reaction priority">p${s.priority}</span>` : ''}:
            ${esc(s.consumed.join(' + '))} &#8594; ${s.produced.length ? esc(s.produced.join(' + ')) : '<i>no products</i>'}
            ${danger ? ' <span class="beaker-warn">&#9888; ' + esc(s.impact || 'hazardous effect') + '</span>' : ''}
            ${!danger && s.impact ? ` <span class="beaker-note">${esc(s.impact)}</span>` : ''}
          </span>
        </div>`;
      }).join('')
    : `<div class="beaker-step"><i>Nothing reacts at this temperature.</i>${mixedSources
        ? ' <span class="beaker-note">&#9888; Your beaker mixes reagents from different forks — same-name chemicals from different forks are separate substances and never react with each other. Check the fork tags in the ingredient picker.</span>'
        : ''}</div>`;
  const finalHTML = Object.keys(final).length
    ? Object.entries(final).map(([id, amt]) =>
        `<span class="reverse-chip">
          <span class="color-swatch" style="background:${safeColor(DATA.reagents[id]?.color)};width:8px;height:8px"></span>
          ${esc(capName(DATA.reagents[id]?.name || id))} ${amt}u
        </span>`).join('')
    : '<i>Empty beaker — everything was consumed.</i>';
  el.innerHTML = `
    <div class="beaker-log-title">Reaction cascade${truncated ? ' (stopped at 30 steps)' : ''}</div>
    ${stepsHTML}
    <div class="beaker-log-title" style="margin-top:10px">Final beaker</div>
    <div class="reverse-chips">${finalHTML}</div>`;
}

// ─────────────────────────────────────────────
// What Heals? — medical mode (A3)
// Damage-type chips are built from live heals:* effectTags, so fork-added
// damage types appear without code changes.
// ─────────────────────────────────────────────

let activeHealType = null;
let activeSpecies = null; // D2: null = all species

// Same source-visibility rules as filterReagents, minus sidebar filters —
// the medbay mode stands alone.
function reagentInFork(r, forkId) {
  if (forkId === 'vanilla') return r.source === 'vanilla';
  if (forkId === 'all') return true;
  if (!forkVisible(r, forkId)) return false;
  // Vanilla/ancestor reagent: hide when its recipe is blocked on this fork
  if (r.source !== forkId) {
    const rxn = r.recipe ? Object.values(DATA.reactions).find(rx => rx.products[r.id]) : null;
    if (rxn && rxn.forkStatus && rxn.forkStatus[forkId] === 'blocked') return false;
  }
  return true;
}

function reagentInActiveFork(r) { return reagentInFork(r, activeSource); }

function reactionInFork(rx, forkId) {
  if (forkId === 'vanilla') return rx.source === 'vanilla';
  if (forkId === 'all') return true;
  return forkVisible(rx, forkId);
}

// Parse "Heals <Type> <N>" out of the effects clause list for one heal tag.
// Prefers unconditional clauses; a conditional-only match is flagged for the UI.
function healPerUnit(r, healLabel) {
  const clauses = (r.effects || '').split(';');
  const re = new RegExp('Heals\\s+' + healLabel + '\\s+([\\d.]+)', 'i');
  let best = null;
  for (const cl of clauses) {
    const m = cl.match(re);
    if (!m) continue;
    const conditional = /\(if\s/.test(cl);
    const val = parseFloat(m[1]);
    if (!best || (best.conditional && !conditional) ||
        (conditional === best.conditional && val > best.val)) {
      best = { val, conditional };
    }
  }
  return best;
}

function renderMedbay() {
  const chipsEl = document.getElementById('healTypeChips');
  if (!chipsEl) return;

  // Available heal types under the active fork filter
  const counts = {};
  for (const r of Object.values(DATA.reagents)) {
    if (!reagentInActiveFork(r)) continue;
    for (const t of r.effectTags || []) {
      if (t.startsWith('heals:')) {
        const type = t.slice(6);
        counts[type] = (counts[type] || 0) + 1;
      }
    }
  }
  const types = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  if (activeHealType && !counts[activeHealType]) activeHealType = null;
  if (!activeHealType && types.length) activeHealType = types[0];

  chipsEl.innerHTML = types.map(t =>
    `<button class="heal-chip ${t === activeHealType ? 'active' : ''}" data-type="${esc(t)}">
      ${esc(capName(t))} <span class="heal-chip-count">${counts[t]}</span>
    </button>`).join('');
  chipsEl.querySelectorAll('.heal-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeHealType = btn.dataset.type;
      track('whatheals_type', { type: activeHealType });
      renderMedbay();
    });
  });

  renderSpeciesChips();
  renderSpeciesInfo();
  renderHealResults();
}

// D2: species context. Physiology facts are curated (amber tier); the
// per-medicine ☠/ℹ badges come from YAML-extracted organ conditions.
function renderSpeciesChips() {
  const host = document.getElementById('speciesChips');
  if (!host) return;
  const phys = DATA.species?.physiology || {};
  // Union: curated species + any species found in extracted organ
  // conditions (fork races like Goblin/Thaven appear automatically).
  const found = new Set(Object.keys(phys));
  for (const r of Object.values(DATA.reagents)) {
    for (const s of Object.keys(r.speciesEffects || {})) found.add(s);
  }
  const items = [['', 'All species'],
    ...[...found].sort((a, b) => a.localeCompare(b)).map(k => [k, phys[k]?.name || k])];
  host.innerHTML = items.map(([id, label]) =>
    `<button class="heal-chip species-chip ${(activeSpecies || '') === id ? 'active' : ''}" data-species="${esc(id)}">${esc(capName(label))}</button>`).join('');
  host.querySelectorAll('.species-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSpecies = btn.dataset.species || null;
      track('whatheals_species', { species: activeSpecies || 'all' });
      renderMedbay();
    });
  });
}

function renderSpeciesInfo() {
  const host = document.getElementById('speciesInfo');
  if (!host) return;
  const p = activeSpecies ? DATA.species?.physiology?.[activeSpecies] : null;
  if (!p) { host.innerHTML = ''; return; }
  const tox = p.toxicGas
    ? ` — <b class="species-tox">&#9760; ${esc(p.toxicGas)} is TOXIC to them</b>` : '';
  host.innerHTML = `<div class="guide-card species-card">
    <div class="guide-head">${esc(p.name)} physiology
      <span class="badge badge-community" title="Physiology facts are curated from playtime (species prototypes are not extracted yet). The per-medicine ☠/ℹ notes in the table ARE extracted from reagent YAML.">Community knowledge</span>
    </div>
    <p class="species-line">Breathes <b>${esc(p.breathes)}</b>${tox}. ${esc(p.note)}</p>
  </div>`;
}

function renderHealResults() {
  const el = document.getElementById('healResults');
  if (!el) return;
  if (!activeHealType) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-headline">No healing data under the current fork filter.</div></div>';
    return;
  }

  const rows = [];
  for (const r of Object.values(DATA.reagents)) {
    if (!reagentInActiveFork(r)) continue;
    if (!(r.effectTags || []).includes('heals:' + activeHealType)) continue;
    const heal = healPerUnit(r, activeHealType);
    // D4: metabolismRate = units consumed per ~1s tick (default 0.5). The effect
    // amount is applied PER TICK, so total healing one unit delivers before it is
    // fully metabolized = perTick / rate. This is the true "per unit" number;
    // the raw effect is the per-second rate.
    const rate = r.metabolismRate ?? 0.5;
    const totalPerU = heal ? Math.round((heal.val / rate) * 10) / 10 : null;
    rows.push({ r, heal, rate, totalPerU });
  }
  rows.sort((a, b) => {
    const av = a.totalPerU ?? -1;
    const bv = b.totalPerU ?? -1;
    return bv - av ||
      ((a.r.accessibility?.weight ?? 9) - (b.r.accessibility?.weight ?? 9)) ||
      (a.r.name || a.r.id).localeCompare(b.r.name || b.r.id);
  });

  el.innerHTML = `<table class="data-table heal-table">
    <thead><tr>
      <th>Medicine</th>
      <th title="Total healing one unit delivers before it fully metabolizes (per-tick effect ÷ metabolism rate)">Heal / u</th>
      <th title="Healing applied each ~1s metabolism tick while the reagent is in the body">/ sec</th>
      <th>Overdose</th><th>Access</th><th>Source</th>
    </tr></thead>
    <tbody>${rows.map(({ r, heal, rate, totalPerU }) => {
      const healCell = totalPerU != null
        ? `${totalPerU}${heal.conditional ? ' <span class="heal-cond" title="Conditional healing — open details">*</span>' : ''}`
        : '—';
      let secCell = '—';
      if (heal) {
        const dur = Math.round((1 / rate) * 10) / 10;
        const slow = rate !== 0.5
          ? ` <span class="heal-rate" title="Metabolizes ${rate} u/s — 1u lasts ~${dur}s">@${rate}u/s</span>` : '';
        secCell = `${heal.val}/s${slow}`;
      }
      const acc = r.accessibility;
      const accBadge = acc
        ? `<span class="badge badge-access" title="${esc(acc.reason || '')}">${esc(acc.tier)}</span>` : '—';
      const forkBadge = r.source !== 'vanilla' && DATA.meta?.forks?.[r.source]
        ? `<span class="badge badge-fork" style="border-color:${DATA.meta.forks[r.source].color}">${esc(DATA.meta.forks[r.source].name)}</span>`
        : 'vanilla';
      let speciesBadge = '';
      if (activeSpecies && r.speciesEffects && r.speciesEffects[activeSpecies]) {
        const clauses = r.speciesEffects[activeSpecies];
        const harmful = clauses.some(c => /Deals|Vomit|Toxin/i.test(c));
        speciesBadge = ` <span class="badge ${harmful ? 'species-bad' : 'species-note'}" title="${esc(clauses.join(' | '))}">${harmful ? '&#9760;' : '&#8505;'} ${esc(activeSpecies)}</span>`;
      }
      return `<tr class="heal-row" onclick="openDetail('${esc(r.id)}')" tabindex="0">
        <td><span class="color-swatch" style="background:${safeColor(r.color)}"></span> ${esc(capName(r.name || r.id))}${speciesBadge}</td>
        <td class="heal-num">${healCell}</td>
        <td class="heal-num">${secCell}</td>
        <td>${r.overdose ? r.overdose + 'u' : '—'}</td>
        <td>${accBadge}</td>
        <td>${forkBadge}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

// ─────────────────────────────────────────────
// Craft Trees
// ─────────────────────────────────────────────

// Producers of reagentId visible under activeSource, best first. rxns[0] is
// what the calculator, the batch plan, the craft trees, "Fewest Steps" and the
// detail panel call "the recipe", so this order is the product decision
// (Discord report 2026-07-31, audit 2026-09-11 D1/C2, ROADMAP Q2):
//   1. a reaction that eats as much of the target as it makes is not a recipe
//      for it (Monolith FentanylSolidification: 1 Tricordrazine in, 1 out) —
//      dropped, not demoted, so no mode ever plans 120 runs of it;
//   2. a reaction named after the target, or whose only product is the target,
//      beats one where the target is a byproduct or a centrifuge breakdown
//      (ADT Omnizine → 4 chems, Goob Fentanyl → SpaceGlue) — ahead of lineage,
//      because a fork's side effect is still not that fork's recipe;
//   3. closest lineage: the fork on screen, its parents, then vanilla; under
//      "All" the reagent's own fork, then vanilla, then everyone else. The old
//      "All" branch returned data order, i.e. alphabetical id, which is why
//      ADT… and Fentanyl… beat Diphenhydramine and Tricordrazine;
//   4. the reaction the extractor picked as r.recipe, so the panel's Recipe
//      and the tree under it agree;
//   5. fewer reactants. Ties keep data order (sort is stable).
function getFilteredReactions(reagentId) {
  const r = DATA.reagents[reagentId];
  const mode = activeSource;
  const chain = (mode === 'all' || mode === 'vanilla') ? null : forkChain(mode);
  const rxns = [];
  for (const rx of Object.values(DATA.reactions)) {
    const out = rx.products[reagentId];
    if (!out) continue;
    if (mode === 'vanilla' ? rx.source !== 'vanilla' : (chain && !forkVisible(rx, mode))) continue;
    const back = rx.reactants[reagentId];
    if (back && !back.catalyst && back.amount >= out) continue;                        // 1
    rxns.push(rx);
  }
  const lineage = rx => {
    if (chain) return rx.source === 'vanilla' ? chain.length : chain.indexOf(rx.source);
    if (mode === 'all') return rx.source === (r && r.source) ? 0 : rx.source === 'vanilla' ? 1 : 2;
    return 0;
  };
  const key = rx => [
    (rx.id === reagentId || Object.keys(rx.products).length === 1) ? 0 : 1,          // 2
    lineage(rx),                                                                      // 3
    (r && r.recipe && sameRecipe(rx, r.recipe)) ? 0 : 1,                              // 4
    Object.keys(rx.reactants).length,                                                 // 5
  ];
  return rxns
    .map(rx => ({ rx, k: key(rx) }))
    .sort((a, b) => { for (let i = 0; i < a.k.length; i++) { if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]; } return 0; })
    .map(x => x.rx);
}

// The extractor's r.recipe is a copy of one reaction's reactants and products;
// equal on both means it is that reaction.
function sameRecipe(rx, recipe) {
  const same = (a, b, eq) => {
    const ka = Object.keys(a || {}), kb = Object.keys(b || {});
    return ka.length === kb.length && ka.every(k => k in b && eq(a[k], b[k]));
  };
  return same(rx.reactants, recipe.reactants, (x, y) => x.amount === y.amount && !!x.catalyst === !!y.catalyst)
      && same(rx.products, recipe.products, (x, y) => x === y);
}

// The one reaction the app treats as the recipe under the current source, or
// null. The detail panel shows this; the tree under it is built from it.
function pickRecipe(reagentId) {
  return getFilteredReactions(reagentId)[0] || null;
}

// A mixing step (or the panel's recipe) built from a fork's reaction says so —
// the report that started Q2 was a chemist unable to tell a Monolith recipe
// from a vanilla one.
function stepForkBadge(step) {
  const meta = step && step.source && step.source !== 'vanilla' ? DATA.meta?.forks?.[step.source] : null;
  return meta ? ` <span class="badge badge-fork" style="border-color:${meta.color}">${esc(meta.name)}</span>` : '';
}

function buildCraftTree(reagentId, amount, visited = new Set()) {
  const isBase = DATA.baseChemicals.includes(reagentId);

  if (isBase || visited.has(reagentId)) {
    return { id: reagentId, amount, isBase: true, loop: visited.has(reagentId), children: [] };
  }

  // Find reaction that produces this, filtered by active fork
  const rxns = getFilteredReactions(reagentId);
  if (rxns.length === 0) {
    return { id: reagentId, amount, isBase: true, children: [] };
  }

  const rxn = rxns[0];
  const produced = rxn.products[reagentId];
  const mult = amount / produced;

  visited = new Set(visited);
  visited.add(reagentId);

  const children = Object.entries(rxn.reactants).map(([reactId, info]) => {
    if (info.catalyst) {
      return { id: reactId, amount: info.amount, catalyst: true, isBase: false, children: [] };
    }
    return buildCraftTree(reactId, info.amount * mult, visited);
  });

  return {
    id: reagentId, amount, isBase: false, produced, reaction: rxn, children,
    minTemp: rxn.minTemp, maxTemp: rxn.maxTemp, mixer: rxn.mixer,
  };
}

function renderTreeHTML(node, depth = 0, path = '0') {
  const r = DATA.reagents[node.id];
  const color = safeColor(r ? r.color : '');
  const name = r ? (r.name || r.id) : node.id;

  let badges = '';
  if (node.isBase) badges += '<span class="node-badge badge-b">BASE</span>';
  if (node.catalyst) badges += '<span class="node-badge badge-c">CAT</span>';
  if (node.loop) badges += '<span class="node-badge badge-c">LOOP</span>';
  if (node.minTemp) badges += `<span class="node-badge badge-temp">&gt;${node.minTemp}K</span>`;
  if (node.mixer && node.mixer.length) badges += `<span class="node-badge badge-temp">${node.mixer.join(',')}</span>`;

  const cls = [
    'tree-node',
    node.isBase ? 'is-base' : '',
    node.catalyst ? 'is-catalyst' : '',
  ].filter(Boolean).join(' ');

  const amt = node.amount !== 1 ? `${Math.round(node.amount * 10) / 10}x` : '1x';

  // A4: checklist — gathering ("collected it") and brewing ("already added it") aid
  let html = `<li>
    <div class="${cls}">
      <input type="checkbox" class="tree-check" data-path="${path}" aria-label="Mark ${esc(name)} as collected/added">
      <span class="node-swatch" style="background:${color}"></span>
      <span class="node-amount">${amt}</span>
      <span class="node-name clickable" onclick="openDetail('${node.id}')">${esc(name)}</span>
      ${badges}
      ${node.children.length > 0 ? `<button class="tree-toggle" data-path="${path}" aria-label="Collapse or expand">-</button>` : ''}
    </div>`;

  if (node.children.length > 0) {
    html += `<ul class="tree-children" data-path="${path}">`;
    node.children.forEach((child, i) => {
      html += renderTreeHTML(child, depth + 1, `${path}.${i}`);
    });
    html += `</ul>`;
  }

  html += `</li>`;
  return depth === 0 ? `<ul class="craft-tree">${html}</ul>` : html;
}

let currentTreeReagentId = null;

// A4: checked node paths — survives amount changes (same structure), resets on new reagent
let treeChecks = new Set();
// Folded branches, by the same path key. Changing the amount re-renders the
// whole tree, and without this every branch sprang open again on each keystroke.
let treeCollapsed = new Set();

function saveTreeSession() {
  saveSession({
    treeTarget: currentTreeReagentId,
    treeAmount: document.getElementById('treeAmount')?.value || '1',
    treeChecks: [...treeChecks],
    treeCollapsed: [...treeCollapsed],
  });
}

function updateTreeProgress() {
  const total = document.querySelectorAll('#treeOutput .tree-check').length;
  const done = document.querySelectorAll('#treeOutput .tree-check:checked').length;
  const label = document.getElementById('treeProgress');
  const reset = document.getElementById('treeResetChecks');
  if (label) label.textContent = total ? `Collected ${done} / ${total}` : '';
  if (reset) reset.style.display = total ? '' : 'none';
}

function rebuildTree() {
  if (!currentTreeReagentId) return;
  const amountInput = document.getElementById('treeAmount');
  const amount = Math.max(1, parseFloat(amountInput.value) || 1);
  const tree = buildCraftTree(currentTreeReagentId, amount);
  document.getElementById('treeOutput').innerHTML = renderTreeHTML(tree);
  // A4: restore checklist state after re-render
  document.querySelectorAll('#treeOutput .tree-check').forEach(box => {
    if (treeChecks.has(box.dataset.path)) {
      box.checked = true;
      box.closest('.tree-node').classList.add('checked');
    }
  });
  // And the folds, for the same reason: typing an amount rebuilds the tree, and
  // a branch you deliberately closed should stay closed while you do it.
  document.querySelectorAll('#treeOutput .tree-children').forEach(ul => {
    if (treeCollapsed.has(ul.dataset.path)) ul.classList.add('collapsed');
  });
  updateTreeProgress();
}

function setupCraftTrees() {
  const input = document.getElementById('treeTarget');
  const suggestions = document.getElementById('treeSuggestions');
  const amountInput = document.getElementById('treeAmount');

  setupAutocomplete(input, suggestions, (id) => {
    input.value = DATA.reagents[id]?.name || id;
    suggestions.classList.remove('open');
    currentTreeReagentId = id;
    treeChecks = new Set(); // A4: new tree = fresh checklist
    treeCollapsed = new Set();
    track('tree_built', { reagent: id });
    rebuildTree();
    saveTreeSession();
  });

  // Amount input — rebuild tree when changed
  amountInput.addEventListener('input', () => { rebuildTree(); saveTreeSession(); });

  // Put the tree back the way it was left, ticks and all. Called from
  // restoreSession so it runs once the data and the autocomplete both exist.
  window.restoreTreeSession = (saved) => {
    if (!saved.treeTarget || !DATA.reagents[saved.treeTarget]) return;
    currentTreeReagentId = saved.treeTarget;
    input.value = DATA.reagents[saved.treeTarget].name || saved.treeTarget;
    amountInput.value = saved.treeAmount || '1';
    treeChecks = new Set(saved.treeChecks || []);
    treeCollapsed = new Set(saved.treeCollapsed || []);
    rebuildTree();
  };

  // Folding is delegated for the same reason as the checklist: the tree HTML is
  // thrown away and rebuilt on every amount change.
  document.getElementById('treeOutput').addEventListener('click', e => {
    const btn = e.target.closest('.tree-toggle');
    if (!btn) return;
    const ul = btn.parentElement.nextElementSibling;
    if (!ul) return;
    const folded = ul.classList.toggle('collapsed');
    if (folded) treeCollapsed.add(btn.dataset.path);
    else treeCollapsed.delete(btn.dataset.path);
    saveTreeSession();
  });

  // A4: checklist wiring (delegated — tree HTML re-renders often)
  document.getElementById('treeOutput').addEventListener('change', e => {
    if (!e.target.classList.contains('tree-check')) return;
    const path = e.target.dataset.path;
    if (e.target.checked) {
      treeChecks.add(path);
      if (treeChecks.size === 1) track('tree_checklist_used', { reagent: currentTreeReagentId });
    } else {
      treeChecks.delete(path);
    }
    e.target.closest('.tree-node').classList.toggle('checked', e.target.checked);
    updateTreeProgress();
    saveTreeSession();
  });
  document.getElementById('treeResetChecks')?.addEventListener('click', () => {
    treeChecks = new Set();
    document.querySelectorAll('#treeOutput .tree-check').forEach(box => {
      box.checked = false;
      box.closest('.tree-node').classList.remove('checked');
    });
    updateTreeProgress();
    saveTreeSession();
  });
}

// ─────────────────────────────────────────────
// Calculator
// ─────────────────────────────────────────────

function setupCalculator() {
  const input = document.getElementById('calcTarget');
  const suggestions = document.getElementById('calcSuggestions');
  let selectedCalcId = null;

  setupAutocomplete(input, suggestions, (id) => {
    selectedCalcId = id;
    input.value = DATA.reagents[id]?.name || id;
    suggestions.classList.remove('open');
  });

  document.getElementById('calcBtn').addEventListener('click', () => {
    if (!selectedCalcId) return;
    const amount = parseFloat(document.getElementById('calcAmount').value) || 30;
    track('calc_run', { target: selectedCalcId, amount });
    const plan = planBrew([{ id: selectedCalcId, amount }], 0);
    document.getElementById('batchResults').innerHTML = '';
    document.getElementById('batchWarnings').innerHTML = '';
    renderCalcResults(selectedCalcId, plan);
  });
}

// ─────────────────────────────────────────────
// Brew plan (Серия R) — whole units, container batches, honest ingredients.
// Decision: docs/decisions/2026-09-12_brew-plan-quantization.md
// Player report 15.08.2026: «при плановой варке у тебя рецепты на доли идут и
// на английском языке», «183 реагента A + 183 B + 183 C, а мензурка на 100/200
// только — разделить бы», «масло как будто в раздатчике есть, хотя его варить
// надо».
// ─────────────────────────────────────────────

// Amounts in data.json carry at most two decimals (97 reactions have fractional
// reactants — BZ 2.1, UE 0.1, Lithium 0.9), so every quantum computation runs on
// integer centiunits and no float tail reaches the DOM.
const PLAN_CU = 100;
const planCu = (n) => Math.round(n * PLAN_CU);
// A dispenser pours in 5u clicks and SolutionTransfer cycles 5/10/25/50/100, so
// a plan snapped to 5u is one you can actually pour between beakers.
const PLAN_POUR_CU = 5 * PLAN_CU;
// Past this the ladder stops being a plan anyone would follow — print exact
// amounts instead of a quantum nobody can hold.
const PLAN_QUANTUM_MAX_CU = 100000 * PLAN_CU;

// Vessel capacities and presets live in vessels.js (Series R9–R11): the R4
// single-container select gave way to the player's own set of beakers and tanks.

const planRu = () => window.I18N_LANG === 'ru';

// 166.67000000000002 → "166.67", 180 → "180". mergeSteps adds up amounts that
// were already rounded to two decimals, and that is where the float tails in the
// user's screenshot came from.
function fmtU(n) {
  if (!isFinite(n)) return '0';
  return String(Number((Math.round(n * PLAN_CU) / PLAN_CU).toFixed(2)));
}

function planGcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
function planLcm(a, b) { return a / planGcd(a, b) * b; }

// The smallest whole amount of `reagentId`, in centiunits, whose entire subtree
// comes out in whole units under whole reaction runs:
//
//   q(leaf) = 1u                                  — a dispenser gives whole units
//   q(x)    = lcm( produced · lcm_i( q_i / gcd(a_i, q_i) ),  1u )
//
// Returns null when the ladder explodes past PLAN_QUANTUM_MAX_CU (fractional
// recipes can do that) — the caller then falls back to exact amounts.
function planQuantumCu(reagentId, memo, stack) {
  memo = memo || new Map();
  stack = stack || new Set();
  if (memo.has(reagentId)) return memo.get(reagentId);
  if (stack.has(reagentId)) return PLAN_CU; // cycle: calculateIngredients treats it as a leaf
  const rxns = DATA.baseChemicals.includes(reagentId) ? [] : getFilteredReactions(reagentId);
  if (!rxns.length) return PLAN_CU;
  const rxn = rxns[0];
  const producedCu = planCu(rxn.products[reagentId]);
  if (!producedCu) return null;

  stack.add(reagentId);
  let runMult = 1;
  for (const [childId, info] of Object.entries(rxn.reactants)) {
    const childQ = planQuantumCu(childId, memo, stack);
    const aCu = planCu(info.amount);
    if (childQ === null) { stack.delete(reagentId); return null; }
    if (!aCu) continue;
    runMult = planLcm(runMult, childQ / planGcd(aCu, childQ));
    if (runMult * producedCu > PLAN_QUANTUM_MAX_CU) { stack.delete(reagentId); return null; }
  }
  stack.delete(reagentId);

  const q = planLcm(producedCu * runMult, PLAN_CU);
  memo.set(reagentId, q > PLAN_QUANTUM_MAX_CU ? null : q);
  return memo.get(reagentId);
}

// Round the order up to an amount the whole tree can produce without leftovers.
// Ladder: the 5u pour step first, then whole units, then exact math — with a
// guard so a small order is never inflated by more than a quarter.
function quantizeOrder(reagentId, requested) {
  const reqCu = planCu(requested);
  const qCu = reqCu > 0 ? planQuantumCu(reagentId) : null;
  if (!qCu) return { ordered: requested, requested, quantum: 0, overshoot: 0, mode: 'exact' };

  const pick = (stepCu, mode) => {
    const orderedCu = Math.ceil(reqCu / stepCu) * stepCu;
    return {
      ordered: orderedCu / PLAN_CU, requested,
      quantum: stepCu / PLAN_CU, overshoot: (orderedCu - reqCu) / PLAN_CU, mode,
    };
  };
  // Never inflate an order by more than a quarter to buy round numbers: some
  // trees (a fork drug made of four other fork drugs) only come out whole at
  // three times the order, and multiplying what a medic asked for is worse than
  // printing a fraction. The note then says what to order for clean numbers.
  const fits = (q) => planCu(q.overshoot) <= Math.max(PLAN_POUR_CU, reqCu * 0.25);
  const pour = pick(planLcm(qCu, PLAN_POUR_CU), 'pour');
  if (fits(pour)) return pour;
  const whole = pick(qCu, 'whole');
  if (fits(whole)) return whole;
  return { ordered: requested, requested, quantum: 0, overshoot: 0, mode: 'exact', cleanAt: whole.ordered };
}

// How a step is actually poured: one mix when it fits the vessel, otherwise N
// batches of whole runs, kept on the 5u pour step where the recipe allows it.
// The catalyst counts towards the volume — it sits in the beaker — but it is not
// consumed, so the same dose carries from batch to batch.
function planBatches(step, cap) {
  const rxn = DATA.reactions && DATA.reactions[step.rxnId];
  if (!rxn || !cap || !rxn.products || !rxn.products[step.reagentId]) return null;
  const runs = step.amount / rxn.products[step.reagentId];
  const entries = Object.entries(rxn.reactants || {});
  const volPerRun = entries.reduce((s, [, i]) => s + i.amount, 0);
  if (!volPerRun || !runs) return null;

  const total = volPerRun * runs;
  if (planCu(total) <= planCu(cap)) return { batches: 1, total, volPerRun };

  const fit = Math.floor(planCu(cap) / planCu(volPerRun)); // whole runs per vessel
  if (fit < 1) return { impossible: true, volPerRun, total };

  let mult = 1; // keep every batch's reactant amounts on the pour step
  for (const [, i] of entries) {
    const aCu = planCu(i.amount);
    if (aCu) mult = planLcm(mult, PLAN_POUR_CU / planGcd(aCu, PLAN_POUR_CU));
  }
  const per = Math.floor(fit / mult) * mult || fit;
  const full = Math.floor(runs / per);
  const rest = Math.round((runs - full * per) * PLAN_CU) / PLAN_CU;
  return {
    batches: full + (rest > 0 ? 1 : 0), full,
    perVol: per * volPerRun, restVol: rest * volPerRun, total, volPerRun,
  };
}

// What the shopping list owes the player beyond a name and a number: 513 of the
// 561 "base" chemicals are not in any dispenser (identify_base_chemicals calls
// everything without a producing reaction base), and the data already knows how
// each one is really obtained.
const PLAN_TIER_LABEL = {
  'dispenser':     { en: 'dispenser',       ru: 'раздатчик' },
  'cross-botany':  { en: 'grow it',         ru: 'через ботанику' },
  'cross-service': { en: 'another dept.',   ru: 'другой отдел' },
  'mob-drop':      { en: 'from a mob',      ru: 'с моба' },
  'antag-only':    { en: 'antag only',      ru: 'только антаг' },
  'unobtainable':  { en: 'no known source', ru: 'нет источника' },
};

// What the ChemDispenser actually spawns with: 20 jugs, verified against upstream
// Entities/Structures/Dispensers/chem.yml (EntityTableContainerFill, 2026-09-12).
const DISPENSER_JUGS = new Set([
  'Aluminium', 'Carbon', 'Chlorine', 'Copper', 'Ethanol', 'Fluorine', 'Sugar',
  'Hydrogen', 'Iodine', 'Iron', 'Lithium', 'Mercury', 'Nitrogen', 'Oxygen',
  'Phosphorus', 'Potassium', 'Radium', 'Silicon', 'Sodium', 'Sulfur',
]);
// Not in that fill, but a jug entity exists, so chem storage can hand you one.
const FETCHED_JUGS = new Set(['Water', 'Silver', 'WeldingFuel']);
// BASE_DISPENSER_CHEMICALS in config.py adds Plasma, Silver, Water, WeldingFuel
// and Oil to the 20 above. Upstream has no jug for Plasma or Oil at all — which
// is why the plan asked for 4u of oil as if the dispenser had it («масло как
// будто в раздатчике есть, хотя его варить надо»). The data fix is R6/R8; until
// the regen the planner tells the truth from here.
function planLeafAccess(id) {
  const r = DATA.reagents[id];
  if (!r) return null;
  if (DISPENSER_JUGS.has(id)) return null; // one of the twenty — nothing to say
  // The twenty are vanilla's dispenser. A fork reagent flagged isDispenser got
  // the flag from that fork's own dispenser list (RMC14's RMCOxygen, RMCSugar…),
  // so the data is the authority there: judging it by the vanilla twenty tagged
  // every CM ingredient «в раздатчике этого нет» (CMUSleen plan, 2026-09-12).
  if (r.isDispenser && r.source && r.source !== 'vanilla') return null;
  const ru = planRu();
  const sources = (r.obtainSources || []).join(' | ');
  if (FETCHED_JUGS.has(id)) {
    return {
      tier: 'jug', blocking: false, mislabelled: false,
      label: ru ? 'канистра со склада' : 'jug from storage',
      hint: sources || (ru ? 'Есть канистра, но не в стартовой заправке раздатчика' : 'A jug exists, but not in the dispenser it spawns with'),
    };
  }
  if (r.isDispenser) {
    const brewed = getFilteredReactions(id).length > 0;
    return {
      tier: 'not-a-jug', blocking: false, mislabelled: true,
      label: brewed ? (ru ? 'варится' : 'brew it') : (ru ? 'не в раздатчике' : 'not in the dispenser'),
      hint: sources,
    };
  }
  const tier = r.accessibility && r.accessibility.tier;
  const label = PLAN_TIER_LABEL[tier];
  return {
    tier: tier || null,
    label: label ? (ru ? label.ru : label.en) : (ru ? 'не в раздатчике' : 'not in the dispenser'),
    hint: sources || (r.accessibility && r.accessibility.reason) || '',
    blocking: !sources,
    mislabelled: false,
  };
}

function planName(id) {
  const r = DATA.reagents[id];
  return capName((r && r.name) || id);
}

// "5 порций" — Russian needs three forms and the planner counts batches out
// loud, so it cannot dodge them. forms: [one, few, many] / [one, other].
function planPlural(n, forms) {
  const abs = Math.abs(Math.round(n));
  if (forms.length < 3) return `${n} ${forms[abs === 1 ? 0 : 1]}`;
  const mod10 = abs % 10, mod100 = abs % 100;
  const form = (mod10 === 1 && mod100 !== 11) ? 0
    : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) ? 1 : 2;
  return `${n} ${forms[form]}`;
}

// One plan: the order quantized, the steps resolved, the catalysts accounted for
// separately (a catalyst is needed per mix but never consumed, so the list asks
// for the largest single dose, not the sum — audit B8).
function planBrew(targets, cap) {
  const totalBase = {};
  const catalystNeeds = {};
  const rawSteps = [];
  const quants = [];

  for (const { id, amount } of targets) {
    const q = quantizeOrder(id, amount);
    quants.push({ id, ...q });
    const res = calculateIngredients(id, q.ordered);
    for (const [rid, amt] of Object.entries(res.baseNeeds)) {
      totalBase[rid] = (totalBase[rid] || 0) + amt;
    }
    rawSteps.push(...res.steps);
  }

  const steps = mergeSteps(rawSteps);
  steps.sort((a, b) => b.depth - a.depth);

  for (const step of steps) {
    const b = planBatches(step, cap);
    step.batchPlan = b;
    for (const r of step.reactants) {
      if (!r.catalyst) continue;
      // Per mix, not per plan: one dose catalyses every batch, so the list needs
      // the largest single batch. perVol/total is runsPerBatch/totalRuns.
      const share = b && b.batches > 1 && !b.impossible && b.total ? b.perVol / b.total : 1;
      catalystNeeds[r.id] = Math.max(catalystNeeds[r.id] || 0, r.amount * share);
    }
  }

  return { totalBase, catalystNeeds, steps, quants, cap, targets };
}

function renderPlanNote(quants) {
  const ru = planRu();
  const changed = quants.filter(q => planCu(q.overshoot) > 0);
  // An order the ladder refused to round: say what a clean one would cost, so
  // the fraction is a choice rather than a surprise.
  const exact = quants.filter(q => q.mode === 'exact' && q.cleanAt);
  if (!changed.length && !exact.length) return '';
  const exactLines = exact.map(q => `<div class="plan-note-line">${fmtU(q.requested)}u ${esc(planName(q.id))} ${ru
    ? `<span class="plan-note-why">(в дробях: ближайший целый объём — ${fmtU(q.cleanAt)}u)</span>`
    : `<span class="plan-note-why">(kept fractional: the nearest amount that brews clean is ${fmtU(q.cleanAt)}u)</span>`}</div>`).join('');
  const lines = changed.map(q => {
    const head = `${fmtU(q.requested)}u &rarr; <strong>${fmtU(q.ordered)}u</strong> ${esc(planName(q.id))}`;
    const why = q.mode === 'pour'
      ? (ru ? `кратно ${fmtU(q.quantum)}u — весь план в целых, всё кратно 5u`
            : `in steps of ${fmtU(q.quantum)}u — whole numbers all the way down, every pour a multiple of 5u`)
      : (ru ? `кратно ${fmtU(q.quantum)}u — весь план в целых`
            : `in steps of ${fmtU(q.quantum)}u — whole numbers all the way down`);
    return `<div class="plan-note-line">${head} <span class="plan-note-why">(${why})</span></div>`;
  }).join('');
  return `<div class="plan-note">
    <div class="plan-note-title">${changed.length
      ? (ru ? 'Округлено вверх до варимого объёма' : 'Rounded up to an amount that brews clean')
      : (ru ? 'Целого объёма рядом нет' : 'No clean amount nearby')}</div>
    ${lines}${exactLines}
  </div>`;
}

function renderPlanShopping(baseNeeds, catalystNeeds) {
  const ru = planRu();
  const byName = (a, b) => planName(a[0]).localeCompare(planName(b[0]));
  const rows = Object.entries(baseNeeds).sort(byName).map(([id, amt]) => {
    const acc = planLeafAccess(id);
    const tag = acc
      ? ` <span class="shop-tag${acc.blocking ? ' shop-tag-bad' : ''}" title="${esc(acc.hint)}">${esc(acc.label)}</span>`
      : '';
    return `<div class="shopping-item">
      <span>${esc(planName(id))}${tag}</span>
      <span class="shopping-amount">${fmtU(amt)}u</span>
    </div>`;
  }).join('');
  const cats = Object.entries(catalystNeeds || {}).sort(byName).map(([id, amt]) =>
    `<div class="shopping-item shopping-item-cat">
      <span>${esc(planName(id))} <span class="shop-tag" title="${ru ? 'Катализатор нужен в стакане для каждой порции, но не расходуется — одна доза работает на весь план' : 'A catalyst has to be in the beaker for every batch but is never consumed — one dose serves the whole plan'}">${ru ? 'катализатор' : 'catalyst'}</span></span>
      <span class="shopping-amount">${fmtU(amt)}u</span>
    </div>`).join('');
  return rows + cats;
}

function renderPlanSteps(steps, cap) {
  const ru = planRu();
  return steps.map((step, i) => {
    const reactants = step.reactants.map(r =>
      `${fmtU(r.amount)}u ${planName(r.id)}${r.catalyst ? (ru ? ' (кат)' : ' (cat)') : ''}`).join(' + ');
    let extra = '';
    if (step.minTemp) extra += `<span class="step-temp"> [&gt;${step.minTemp}K]</span>`;
    if (step.maxTemp) extra += `<span class="step-temp"> [&lt;${step.maxTemp}K]</span>`;
    if (step.mixer && step.mixer.length) extra += `<span class="step-mixer"> [${esc(step.mixer.join(','))}]</span>`;
    extra += stepForkBadge(step);

    const b = step.batchPlan;
    let batches = '';
    if (b && b.impossible) {
      batches = `<div class="step-batches step-batches-bad">${ru
        ? `одна реакция занимает ${fmtU(b.volPerRun)}u — в ${fmtU(cap)}u не влезает`
        : `a single run takes ${fmtU(b.volPerRun)}u — it does not fit ${fmtU(cap)}u`}</div>`;
    } else if (b && b.batches > 1) {
      const parts = b.full > 1 ? [`${b.full} &times; ${fmtU(b.perVol)}u`] : [`${fmtU(b.perVol)}u`];
      if (b.restVol) parts.push(`${fmtU(b.restVol)}u`);
      batches = `<div class="step-batches">${planPlural(b.batches, ru ? ['порция', 'порции', 'порций'] : ['batch', 'batches'])}: ${parts.join(' + ')} <span class="step-batches-total">(${ru ? 'всего' : 'total'} ${fmtU(b.total)}u)</span></div>`;
    }

    return `<div class="step-item">
      <span class="step-num">${i + 1}.</span>
      ${esc(reactants)} &rarr; <strong>${fmtU(step.amount)}u ${esc(planName(step.reagentId))}</strong>${extra}
      ${batches}
    </div>`;
  }).join('');
}

// Leaves the plan cannot buy anywhere, and steps that do not fit the vessel.
function renderPlanWarnings(plan) {
  const ru = planRu();
  const blocked = Object.keys(plan.totalBase)
    .map(id => ({ id, acc: planLeafAccess(id) }))
    .filter(x => x.acc && x.acc.blocking);
  // A jug of water or welding fuel is a walk to chem storage, and water is in
  // half the recipes in the game — the tag on the row says enough, a warning on
  // every plan would just train the player to ignore the box.
  const offsite = Object.keys(plan.totalBase)
    .map(id => ({ id, acc: planLeafAccess(id) }))
    .filter(x => x.acc && !x.acc.blocking && !x.acc.mislabelled && x.acc.tier !== 'jug');
  // Leaves our own data calls dispenser chemicals while upstream has no jug for
  // them: the plan stops there, so it owes the player an explicit note.
  const notAJug = Object.keys(plan.totalBase)
    .map(id => ({ id, acc: planLeafAccess(id) }))
    .filter(x => x.acc && x.acc.mislabelled);
  const tooBig = plan.steps.filter(s => s.batchPlan && s.batchPlan.impossible);
  if (!blocked.length && !offsite.length && !notAJug.length && !tooBig.length) return '';

  const items = [];
  if (blocked.length) {
    items.push(`<div class="warning-item"><span class="warning-icon">&#9888;</span> <span><strong>${esc(blocked.map(x => planName(x.id)).join(', '))}</strong>: ${ru
      ? 'нет известного способа получить — план не сварить целиком'
      : 'no known source — this plan cannot be completed as it stands'}</span></div>`);
  }
  if (offsite.length) {
    items.push(`<div class="warning-item"><span class="warning-icon">&#8505;</span> <span><strong>${esc(offsite.map(x => planName(x.id)).join(', '))}</strong>: ${ru
      ? 'нет в раздатчике — придётся добыть отдельно (наведите на метку в списке)'
      : 'not in the dispenser — fetch it separately (hover the tag in the list)'}</span></div>`);
  }
  if (notAJug.length) {
    items.push(`<div class="warning-item"><span class="warning-icon">&#9888;</span> <span><strong>${esc(notAJug.map(x => planName(x.id)).join(', '))}</strong>: ${ru
      ? 'в раздатчике этого нет — придётся сварить или добыть отдельно, план этот шаг не раскрывает'
      : 'the dispenser does not stock this — brew or fetch it separately; the plan does not expand that step'}</span></div>`);
  }
  if (tooBig.length) {
    items.push(`<div class="warning-item"><span class="warning-icon">&#9888;</span> <span><strong>${esc(tooBig.map(s => planName(s.reagentId)).join(', '))}</strong>: ${ru
      ? `одна реакция не влезает в выбранную ёмкость (${fmtU(plan.cap)}u) — возьмите больше`
      : `a single run does not fit the chosen container (${fmtU(plan.cap)}u) — take a bigger one`}</span></div>`);
  }
  return `<div class="warning-box" style="grid-column:1/-1">
    <div class="warning-box-title">${ru ? 'Что учесть' : 'Worth knowing'}</div>
    ${items.join('')}
  </div>`;
}

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

function mergeSteps(steps) {
  const stepMap = new Map();
  for (const step of steps) {
    if (stepMap.has(step.reagentId)) {
      const existing = stepMap.get(step.reagentId);
      existing.amount += step.amount;
      existing.depth = Math.max(existing.depth, step.depth);
      for (let i = 0; i < existing.reactants.length; i++) {
        existing.reactants[i].amount += step.reactants[i].amount;
      }
    } else {
      stepMap.set(step.reagentId, {
        ...step,
        reactants: step.reactants.map(r => ({ ...r })),
      });
    }
  }
  return [...stepMap.values()];
}

function calculateIngredients(targetId, targetAmount) {
  const baseNeeds = {};
  const steps = [];
  const cycleGuard = new Set(); // only for infinite loop prevention

  function resolve(reagentId, amount, depth) {
    if (DATA.baseChemicals.includes(reagentId)) {
      baseNeeds[reagentId] = (baseNeeds[reagentId] || 0) + amount;
      return;
    }
    if (cycleGuard.has(reagentId)) {
      // Circular dependency — treat as base to avoid infinite loop
      baseNeeds[reagentId] = (baseNeeds[reagentId] || 0) + amount;
      return;
    }

    const rxns = getFilteredReactions(reagentId);
    if (rxns.length === 0) {
      baseNeeds[reagentId] = (baseNeeds[reagentId] || 0) + amount;
      return;
    }

    const rxn = rxns[0];
    const produced = rxn.products[reagentId];
    const runs = amount / produced;

    cycleGuard.add(reagentId);

    steps.push({
      depth, reagentId, amount,
      reactants: Object.entries(rxn.reactants).map(([id, info]) => ({
        id, amount: Math.round(info.amount * runs * 100) / 100, catalyst: info.catalyst || false,
      })),
      minTemp: rxn.minTemp, maxTemp: rxn.maxTemp, mixer: rxn.mixer,
      source: rxn.source, rxnId: rxn.id,
    });

    for (const [reactId, info] of Object.entries(rxn.reactants)) {
      if (!info.catalyst) {
        resolve(reactId, info.amount * runs, depth + 1);
      }
    }

    cycleGuard.delete(reagentId);
  }

  resolve(targetId, targetAmount, 0);
  const merged = mergeSteps(steps);
  merged.sort((a, b) => b.depth - a.depth);
  return { baseNeeds, steps: merged };
}

// R1-R4: names come from the localized data, amounts through fmtU, volumes split
// by the chosen vessel. Every heading here interpolates a number, so none of it
// can be reached by the i18n dictionary — the strings are picked here.
function renderCalcResults(targetId, plan) {
  const div = document.getElementById('calcResults');
  const ru = planRu();
  const ordered = plan.quants[0] ? plan.quants[0].ordered : 0;

  div.innerHTML = `
    ${checkCalcWarnings(plan.totalBase, plan.steps)}
    ${renderPlanWarnings(plan)}
    ${renderPlanNote(plan.quants)}
    <div class="calc-section">
      <h3>${ru ? 'Список закупки' : 'Shopping List for'}${ru ? ': ' : ' '}${fmtU(ordered)}u ${esc(planName(targetId))}</h3>
      ${renderPlanShopping(plan.totalBase, plan.catalystNeeds) || `<p style="color:var(--text-dim)">${ru ? 'Это базовый реагент' : 'This is a base chemical'}</p>`}
    </div>
    ${renderPlanStepsSection(plan, ru ? 'Смешивать нечего' : 'No mixing needed')}
  `;
}

// ─────────────────────────────────────────────
// Autocomplete Helper
// ─────────────────────────────────────────────

function setupAutocomplete(input, suggestionsDiv, onSelect) {
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = input.value.toLowerCase().trim();
      if (q.length < 1) { suggestionsDiv.classList.remove('open'); return; }

      // Rank by where the query hits: exact name > name prefix > name
      // substring > effects/desc text (the old flat .includes() let "oxygen"
      // surface Dexalin before Oxygen itself). The sidebar Source filter
      // applies here too, and vanilla wins ties between same-name fork twins.
      const scored = [];
      for (const e of searchIndex) {
        if (!e.text.includes(q)) continue;
        if (!reagentInActiveFork(e.reagent)) continue;
        const name = (e.reagent.name || e.id).toLowerCase();
        const tier = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3;
        scored.push({ e, tier, name, van: e.reagent.source === 'vanilla' ? 0 : 1 });
      }
      scored.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name) || a.van - b.van);
      const matches = scored.slice(0, 15);

      if (matches.length === 0) { suggestionsDiv.classList.remove('open'); return; }

      suggestionsDiv.innerHTML = matches.map(({ e }) => {
        const r = e.reagent;
        // Same-name reagents exist across forks with different ids (vanilla
        // Hydrogen vs RMCHydrogen) and never cross-react — tag non-vanilla
        // entries with their fork so the pick is informed.
        const fork = r.source !== 'vanilla' ? DATA.meta?.forks?.[r.source] : null;
        const forkTag = fork
          ? `<span class="suggestion-fork" style="color:${safeColor(fork.color)};border-color:${safeColor(fork.color)}">${esc(fork.name || r.source)}</span>`
          : '';
        return `<div class="suggestion-item" data-id="${r.id}">
          <span class="color-swatch" style="background:${safeColor(r.color)};width:10px;height:10px"></span>
          ${esc(capName(r.name || r.id))}
          ${forkTag}
          <span style="margin-left:auto;font-size:0.65rem;color:var(--text-dim)">${r.category}</span>
        </div>`;
      }).join('');

      suggestionsDiv.classList.add('open');

      suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => onSelect(item.dataset.id));
      });
    }, 100);
  });

  // Close on outside click — register once via shared handler
  if (!setupAutocomplete._registered) {
    setupAutocomplete._registered = [];
    document.addEventListener('click', (e) => {
      for (const {input: inp, div} of setupAutocomplete._registered) {
        if (!inp.contains(e.target) && !div.contains(e.target)) {
          div.classList.remove('open');
        }
      }
    });
  }
  setupAutocomplete._registered.push({input, div: suggestionsDiv});
}

// ─────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function capName(name) {
  if (!name) return '';
  return name.replace(/^./, c => c.toUpperCase());
}

function safeColor(c) {
  if (!c) return '#3d4a5e';
  return /^#[0-9A-Fa-f]{3,8}$/.test(c) ? c : '#3d4a5e';
}

// ─────────────────────────────────────────────
// Effect Tag Filters
// ─────────────────────────────────────────────

// Effect chips are grouped into 5 collapsible collections by valence
// (see docs/design/2026-07-12-effect-collections.md). Display order fixed.
const EFFECT_COLLECTIONS = [
  { id: 'healing', label: 'Healing' },
  { id: 'damage',  label: 'Damage' },
  { id: 'buffs',   label: 'Buffs' },
  { id: 'debuffs', label: 'Debuffs' },
  { id: 'other',   label: 'Other' },
];

const _COLL_DAMAGE_EXTRA = new Set(['explosion', 'flammable', 'bleed']);
const _COLL_BUFFS = new Set([
  'adrenaline', 'stamina', 'pressure-immune', 'shock-immune',
  'rad-protection', 'anesthesia', 'numbness', 'centered',
]);
const _COLL_DEBUFFS = new Set([
  'jitter', 'vomit', 'drunk', 'stutter', 'hallucinating', 'drowsy', 'knockdown',
  'sleep', 'blind', 'mute', 'unconscious', 'stun', 'pacified', 'dementia',
  'dna-scramble', 'claw-suppression', 'ratvarian', 'vulgar',
]);
const _COLL_OTHER = new Set(['thirst', 'hunger', 'emote', 'blood', 'temperature', 'speed']);

// Map an effectTag to its collection id. Prefixes cover the damage-type tags;
// explicit sets cover the rest. Unknown tags fall back to 'other' so new
// upstream tags still surface somewhere instead of vanishing.
function effectCollection(tag) {
  if (tag.startsWith('heals:') || tag === 'cure') return 'healing';
  if (tag.startsWith('deals:') || _COLL_DAMAGE_EXTRA.has(tag)) return 'damage';
  if (_COLL_BUFFS.has(tag)) return 'buffs';
  if (_COLL_DEBUFFS.has(tag)) return 'debuffs';
  return 'other';
}

function setupEffectFilters() {
  const div = document.getElementById('effectFilters');
  // Collect all tags with counts
  const tagCounts = {};
  for (const r of Object.values(DATA.reagents)) {
    for (const tag of (r.effectTags || [])) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  // Bucket tags into collections; sort each bucket by reagent count desc.
  const buckets = {};
  for (const c of EFFECT_COLLECTIONS) buckets[c.id] = [];
  for (const [tag, count] of Object.entries(tagCounts)) {
    buckets[effectCollection(tag)].push([tag, count]);
  }
  for (const id in buckets) buckets[id].sort((a, b) => b[1] - a[1]);

  const chipHtml = (tag, count) => {
    const cls = tag.startsWith('heals:') ? 'heals' : tag.startsWith('deals:') ? 'deals' : '';
    const label = tag.replace('heals:', '\u2764 ').replace('deals:', '\u2620 ');
    const active = activeEffectTags.has(tag) ? ' active' : '';
    return `<button class="effect-tag-btn ${cls}${active}" data-tag="${tag}" title="${count} reagents">${label}</button>`;
  };

  // Render one collapsible section per non-empty collection, in fixed order.
  div.innerHTML = EFFECT_COLLECTIONS.filter(c => buckets[c.id].length).map(c => {
    const collapsed = sessionStorage.getItem('effcoll:' + c.id) !== '0'; // default collapsed
    const chips = buckets[c.id].map(([tag, count]) => chipHtml(tag, count)).join('');
    return `<div class="effect-collection coll-${c.id}${collapsed ? ' collapsed' : ''}" data-coll="${c.id}">
      <div class="effect-collection__head" role="button" tabindex="0" aria-expanded="${!collapsed}">
        <span class="effect-collection__chev">\u25b8</span>
        <span class="effect-collection__label">${c.label}</span>
        <span class="effect-collection__count">${buckets[c.id].length}</span>
      </div>
      <div class="effect-collection__body">${chips}</div>
    </div>`;
  }).join('');

  // Chip toggle \u2014 add/remove the tag from the active filter set.
  div.querySelectorAll('.effect-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (activeEffectTags.has(tag)) {
        activeEffectTags.delete(tag);
        btn.classList.remove('active');
      } else {
        activeEffectTags.add(tag);
        btn.classList.add('active');
      }
      renderCurrentTab();
    });
  });

  // Collection collapse/expand \u2014 persisted per collection in sessionStorage.
  div.querySelectorAll('.effect-collection__head').forEach(head => {
    const toggle = () => {
      const coll = head.closest('.effect-collection');
      coll.classList.toggle('collapsed');
      const isCollapsed = coll.classList.contains('collapsed');
      head.setAttribute('aria-expanded', String(!isCollapsed));
      sessionStorage.setItem('effcoll:' + coll.dataset.coll, isCollapsed ? '1' : '0');
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  document.getElementById('clearEffects').addEventListener('click', () => {
    activeEffectTags.clear();
    div.querySelectorAll('.effect-tag-btn').forEach(b => b.classList.remove('active'));
    renderCurrentTab();
  });
}

// ─────────────────────────────────────────────
// Reverse Ingredient Lookup
// ─────────────────────────────────────────────

function setupReverseLookup() {
  const input = document.getElementById('reverseInput');
  const suggestions = document.getElementById('reverseSuggestions');
  const chipsDiv = document.getElementById('reverseChips');
  const resultsDiv = document.getElementById('reverseResults');
  const selectedIngredients = new Set();

  function renderChips() {
    chipsDiv.innerHTML = [...selectedIngredients].map(id => {
      const r = DATA.reagents[id];
      const name = r ? (r.name || id) : id;
      return `<span class="reverse-chip">
        <span class="color-swatch" style="background:${safeColor(r?.color)};width:8px;height:8px"></span>
        ${esc(name)}
        <span class="reverse-chip-remove" data-id="${id}">&times;</span>
      </span>`;
    }).join('');

    chipsDiv.querySelectorAll('.reverse-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedIngredients.delete(btn.dataset.id);
        renderChips();
        renderReverseResults();
      });
    });
  }

  function renderReverseResults() {
    if (selectedIngredients.size === 0) {
      resultsDiv.innerHTML = '<p style="color:var(--text-ghost);font-size:0.72rem">Add ingredients above to find craftable recipes</p>';
      return;
    }

    const available = selectedIngredients;
    const craftable = Object.values(DATA.reactions).filter(rxn => {
      return Object.entries(rxn.reactants).every(([id, info]) =>
        info.catalyst || available.has(id)
      );
    });

    if (craftable.length === 0) {
      resultsDiv.innerHTML = '<p style="color:var(--text-ghost);font-size:0.72rem">No recipes found with these ingredients</p>';
      return;
    }

    resultsDiv.innerHTML = `<div style="font-size:0.68rem;color:var(--phosphor);margin-bottom:8px">${craftable.length} recipe${craftable.length > 1 ? 's' : ''} found</div>` +
      craftable.map(rxn => {
        const products = Object.entries(rxn.products).map(([id, amt]) => {
          const pr = DATA.reagents[id];
          return `<strong>${amt}x ${esc(pr?.name || id)}</strong>`;
        }).join(', ');
        const reactants = Object.entries(rxn.reactants).map(([id, info]) => {
          return `${info.amount}x ${esc(id)}${info.catalyst ? ' (cat)' : ''}`;
        }).join(' + ');
        return `<div class="step-item" style="cursor:pointer" onclick="openDetail('${Object.keys(rxn.products)[0]}')">
          ${products} <span style="color:var(--text-ghost)">&larr; ${esc(reactants)}</span>
        </div>`;
      }).join('');
  }

  setupAutocomplete(input, suggestions, (id) => {
    selectedIngredients.add(id);
    track('reverse_used', { ingredient: id });
    input.value = '';
    suggestions.classList.remove('open');
    renderChips();
    renderReverseResults();
  });

  renderReverseResults();
}

// ─────────────────────────────────────────────
// Interaction Warnings
// ─────────────────────────────────────────────

function getWarningsForReagent(reagentId) {
  if (!DATA.warnings) return [];
  return DATA.warnings.filter(w => w.reagents.includes(reagentId));
}

function getWarningsHTML(reagentId) {
  const warnings = getWarningsForReagent(reagentId);
  if (warnings.length === 0) return '';
  return `<div class="detail-section"><h4>Warnings</h4>
    <div class="warning-box">
      ${warnings.map(w => {
        const others = w.reagents.filter(r => r !== reagentId).map(r => esc(capName(DATA.reagents[r]?.name || r))).join(' + ');
        const sevCls = w.severity === 'lethal' ? 'warning-severity-lethal' : 'warning-severity-dangerous';
        return `<div class="warning-item">
          <span class="warning-icon">${w.severity === 'lethal' ? '\u2620' : '\u26a0'}</span>
          <span><strong class="${sevCls}">${esc(w.type.toUpperCase())}</strong> with ${others}: ${esc(w.desc)}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function checkCalcWarnings(baseNeeds, steps) {
  if (!DATA.warnings) return '';
  const allReagents = new Set([...Object.keys(baseNeeds), ...steps.map(s => s.reagentId)]);
  for (const step of steps) {
    for (const r of step.reactants) allReagents.add(r.id);
  }
  const triggered = [];
  for (const w of DATA.warnings) {
    if (w.reagents.every(r => allReagents.has(r))) {
      triggered.push(w);
    }
  }
  if (triggered.length === 0) return '';
  // R1: the reagents of a warning are prototype ids in the data \u2014 print the
  // names the rest of the plan uses. The prose stays as curated (English).
  return `<div class="warning-box" style="grid-column:1/-1">
    <div class="warning-box-title">\u26a0 ${planRu() ? '\u041e\u043f\u0430\u0441\u043d\u044b\u0435 \u0441\u043e\u0447\u0435\u0442\u0430\u043d\u0438\u044f' : 'Danger Warnings'}</div>
    ${triggered.map(w => `<div class="warning-item">
      <span class="warning-icon">${w.severity === 'lethal' ? '\u2620' : '\u26a0'}</span>
      <span><strong>${esc(w.reagents.map(planName).join(' + '))}</strong>: ${esc(w.desc)}</span>
    </div>`).join('')}
  </div>`;
}

// ─────────────────────────────────────────────
// Batch Planner
// ─────────────────────────────────────────────

function setupBatchPlanner() {
  const input = document.getElementById('batchInput');
  const suggestions = document.getElementById('batchSuggestions');
  const amountInput = document.getElementById('batchAmount');
  const chipsDiv = document.getElementById('batchChips');
  const resultsDiv = document.getElementById('batchResults');
  const warningsDiv = document.getElementById('batchWarnings');
  const batchTargets = []; // [{id, amount, name}]
  let pendingId = null;

  setupAutocomplete(input, suggestions, (id) => {
    pendingId = id;
    input.value = capName(DATA.reagents[id]?.name || id);
    suggestions.classList.remove('open');
  });

  document.getElementById('batchAddBtn').addEventListener('click', () => {
    if (!pendingId) return;
    const amount = parseFloat(amountInput.value) || 30;
    const r = DATA.reagents[pendingId];
    batchTargets.push({ id: pendingId, amount, name: capName(r?.name || pendingId) });
    pendingId = null;
    input.value = '';
    renderBatchChips();
  });

  function renderBatchChips() {
    chipsDiv.innerHTML = batchTargets.map((t, i) =>
      `<span class="reverse-chip">
        <span class="color-swatch" style="background:${safeColor(DATA.reagents[t.id]?.color)};width:8px;height:8px"></span>
        ${esc(t.name)} ${t.amount}u
        <span class="reverse-chip-remove" data-idx="${i}">&times;</span>
      </span>`
    ).join('');
    chipsDiv.querySelectorAll('.reverse-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        batchTargets.splice(parseInt(btn.dataset.idx), 1);
        renderBatchChips();
      });
    });
  }

  document.getElementById('batchPlanBtn').addEventListener('click', () => {
    if (batchTargets.length === 0) return;
    track('batch_plan', { targets: batchTargets.length });
    document.getElementById('calcResults').innerHTML = '';
    const result = planBatch(batchTargets);
    renderBatchResults(result, resultsDiv, warningsDiv);
  });

  // Expose external API for strategy/preset→batch integration
  window.addBatchTargetExternal = function(id, amount) {
    const r = DATA.reagents[id];
    if (!r) return;
    // Avoid duplicates
    if (batchTargets.find(t => t.id === id)) return;
    batchTargets.push({ id, amount, name: capName(r.name || id) });
    renderBatchChips();
  };
  // A2: real state reset — clearing chip DOM alone left batchTargets populated,
  // so consecutive strategy/preset loads silently merged into one batch.
  window.clearBatchTargetsExternal = function() {
    batchTargets.length = 0;
    renderBatchChips();
  };
}

// The shift plan runs through the same engine as the single recipe: each target
// is quantized on its own, then the steps merge, so a merged step is still whole.
function planBatch(targets) {
  return planBrew(targets, 0);
}

function renderBatchResults(plan, div, warningsDiv) {
  const ru = planRu();
  const targetList = plan.quants
    .map(q => `${fmtU(q.ordered)}u ${esc(planName(q.id))}`).join(', ');

  warningsDiv.innerHTML = checkCalcWarnings(plan.totalBase, plan.steps) + renderPlanWarnings(plan);

  div.innerHTML = `
    ${renderPlanNote(plan.quants)}
    <div class="calc-section">
      <h3>${ru ? 'Общий список закупки: ' : 'Total Shopping List for: '}${targetList}</h3>
      ${renderPlanShopping(plan.totalBase, plan.catalystNeeds)}
    </div>
    ${renderPlanStepsSection(plan, ru ? 'Все цели — базовые реагенты' : 'All targets are base chemicals')}
  `;
}

// ─────────────────────────────────────────────
// Antag Mode
// ─────────────────────────────────────────────

function setupAntagMode() {
  const btn = document.getElementById('antagToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    antagMode = !antagMode;
    if (antagMode) track('antag_on');
    document.body.classList.toggle('antag-active', antagMode);
    // Auto-switch sort when toggling antag mode
    const sortSel = document.getElementById('sortSelect');
    if (antagMode) {
      activeSort = 'antag-desc';
      if (sortSel) sortSel.value = 'antag-desc';
    } else if (activeSort === 'antag-desc') {
      activeSort = 'name-asc';
      if (sortSel) sortSel.value = 'name-asc';
    }
    // Show/hide Antag tab button
    const antagTabBtn = document.querySelector('.tab-btn-antag');
    if (antagTabBtn) {
      antagTabBtn.style.display = antagMode ? '' : 'none';
      if (antagMode) {
        antagTabBtn.classList.add('pulse');
        setTimeout(() => antagTabBtn.classList.remove('pulse'), 2000);
      } else if (activeTab === 'antag') {
        // Switch away from antag tab when disabling antag mode
        const reagentsBtn = document.querySelector('.tab-btn[data-tab="reagents"]');
        if (reagentsBtn) reagentsBtn.click();
        return; // click triggers renderCurrentTab already
      }
    }
    renderCurrentTab();
  });
}

function activateAntagMode() {
  if (antagMode) return;
  antagMode = true;
  document.body.classList.add('antag-active');
  // Show the Antag tab button
  const antagTabBtn = document.querySelector('.tab-btn-antag');
  if (antagTabBtn) antagTabBtn.style.display = '';
}

// Increment G — render a source-attribution pill row.
// `refs` is an array where each element is either a string ID (resolved via
// DATA.sources[id]) or an inline {type,note,...} object.
const _AUTHORITY_WEIGHTS_JS = {
  'code': 10, 'maintainer-test': 9, 'forum-consensus': 7, 'wiki': 5,
  'forum-post': 4, 'video': 4, 'maintainer-knowledge': 2, 'speculation': 1,
};
function _sourcePillClass(weight) {
  if (weight >= 9) return 'source-code';
  if (weight >= 5) return 'source-community';
  if (weight >= 2) return 'source-claim';
  return 'source-speculation';
}
function _sourceIcon(type) {
  switch (type) {
    case 'code': return '\u2329/\u232A';   // angle brackets
    case 'maintainer-test': return '\u2713';
    case 'forum-consensus':
    case 'forum-post': return '\u{1F4AC}';  // speech bubble
    case 'video': return '\u25B6';           // play triangle
    case 'wiki': return '\u{1F4D6}';         // book
    case 'maintainer-knowledge': return '\u266A';  // note (hand-written lore)
    case 'speculation': return '?';
    default: return '\u2022';
  }
}
function renderSources(refs, ownerId) {
  const catalog = DATA.sources || {};
  const list = Array.isArray(refs) ? refs : [];

  // Attribution-needed state
  if (!list.length) {
    const ownerParam = ownerId ? `&entry_id=${encodeURIComponent(ownerId)}` : '';
    return `<div class="sources-row sources-empty">
      <span class="badge badge-needs-attribution" title="No source cited for this entry — consider contributing a YAML/forum/video link via GitHub issue.">\u26A0 needs attribution</span>
      <a class="attribution-link"
         href="https://github.com/MikameO/space-station-recipes/issues/new?template=attribution.yml${ownerParam}"
         target="_blank" rel="noopener noreferrer"
         title="Open a pre-filled GitHub issue suggesting a source">Suggest a source</a>
    </div>`;
  }

  const pills = list.map(ref => {
    const src = typeof ref === 'string' ? catalog[ref] : ref;
    if (!src) return '';
    const weight = _AUTHORITY_WEIGHTS_JS[src.type] ?? 0;
    const cls = _sourcePillClass(weight);
    const icon = _sourceIcon(src.type);
    const parts = [src.type];
    if (src.author) parts.push(src.author);
    if (src.date) parts.push(src.date);
    const header = parts.join(' \u00B7 ');
    const title = `${header}${src.note ? '\n' + src.note : ''}${src.quote ? '\n\n\u201C' + src.quote + '\u201D' : ''}`;
    const label = src.title || src.type;
    const clickable = src.url && src.type !== 'maintainer-knowledge';
    return clickable
      ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer"
            class="source-pill ${cls}" title="${esc(title)}">
           <span class="source-icon">${icon}</span><span class="source-label">${esc(label)}</span>
         </a>`
      : `<span class="source-pill ${cls}" title="${esc(title)}">
           <span class="source-icon">${icon}</span><span class="source-label">${esc(label)}</span>
         </span>`;
  }).join('');
  return `<div class="sources-row">${pills}</div>`;
}

// Tag-driven delivery suggestions — structured replacement for the old
// text-mining heuristic (which produced false positives when tips contained
// negations or multi-word context).
const _TAG_TO_DELIVERY = {
  'stealth-poison':    ['Drink', 'Food', 'Syringe'],
  'debilitating':      ['Syringe', 'Hypospray'],
  'lethal':            ['Syringe', 'Hypospray', 'Drink'],
  'area-denial':       ['FoamGrenade', 'SmokeBomb'],
  'explosive':         ['Beaker', 'LargeBeaker'],
  'delivery-mechanism':['FoamGrenade', 'SmokeBomb'],
  'utility':           ['Beaker', 'LargeBeaker'],
};

function _pickDeliverySuggestions(tags) {
  const out = new Set();
  (tags || []).forEach(t => (_TAG_TO_DELIVERY[t] || []).forEach(d => out.add(d)));
  if (!out.size) { out.add('Syringe'); out.add('Drink'); }
  return Array.from(out);
}

function getAntagIntelHTML(r) {
  const score = r.antagScore || 0;
  // Even without antagScore, still show verifiedMechanics if the reagent has any
  // non-trivial YAML-extracted claims — they are the source-of-truth layer.
  const verifiedMechanics = r.verifiedMechanics || [];
  const hasVerified = verifiedMechanics.length > 0;
  if (!score && !hasVerified) return '';

  const tags = r.antagTags || [];
  const tips = r.antagTips || '';
  const pct = Math.round(score * 10);

  // Tag-based delivery suggestions (no more text-mining tips).
  const deliveryData = DATA.deliveryMechanisms || {};
  const suggestions = _pickDeliverySuggestions(tags);
  const deliverySuggestHTML = suggestions.map(key => {
    const d = deliveryData[key];
    if (!d) return `<span class="badge badge-method">${esc(key)}</span>`;
    return `<span class="badge badge-method" title="${esc(d.desc)}">${esc(key)}${d.capacity ? ' (' + d.capacity + 'u)' : ''}</span>`;
  }).join(' ');

  // Verified mechanics (from YAML) — authoritative, green ✓.
  const verifiedHTML = hasVerified ? `
      <div class="verified-mechanics">
        <h5>\u2713 Verified in SS14 code</h5>
        <ul class="verified-list">
          ${verifiedMechanics.map(m => `<li>${esc(m)}</li>`).join('')}
        </ul>
      </div>` : '';

  // Community knowledge (curator's antagTips) — not cross-checked against YAML.
  // Visually distinct (dashed border, tooltip) so readers know to treat with skepticism.
  // Increment G: attribution pills show where the tip comes from (code/forum/mk).
  const communityHTML = tips ? `
      <div class="community-lore" title="Curator's playtime notes. Not automatically cross-checked against YAML — may include SS13 legacy or unverified community claims.">
        <h5>\u24d8 Community knowledge (unverified)</h5>
        <div class="antag-tips">${esc(tips)}</div>
        ${renderSources(r.antagTipsSources, r.id)}
      </div>` : '';

  const scoreHTML = score ? `
      <div class="antag-score-bar">
        <span class="score-label">${score}/10</span>
        <div class="score-track">
          <div class="score-fill" style="width:${pct}%"></div>
        </div>
      </div>` : '';

  return `
    <div class="antag-intel">
      <h4>\u2620 Antag Intel <span class="game-label">(SS14 gameplay)</span></h4>
      ${scoreHTML}
      ${tags.length ? `<div class="antag-tags">${tags.map(t => `<span class="badge badge-antag-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${verifiedHTML}
      ${communityHTML}
      <div class="antag-delivery-suggest">
        <h5>In-game Delivery</h5>
        ${deliverySuggestHTML}
      </div>
    </div>
  `;
}

// Increment I — resolve the effective per-fork difficulty for a strategy.
// Layering (first match wins):
//   1. If a fork is selected AND the extractor emitted byFork for it → use it.
//      This is the honest per-server answer (e.g. a strategy using a DeltaV-
//      blocked reagent reads `impossible` only on DeltaV).
//   2. Otherwise fall back to top-level computedDifficulty (optimistic-max
//      across forks) — preserves behavior for the 'all' filter and for old
//      data.json files generated before Increment I shipped.
//   3. Final fallback: authored `difficulty` string (legacy entries).
// The returned object is the same shape as computedDifficulty so existing
// rendering code works unchanged.
function resolveEffectiveDifficulty(strat) {
  const cd = strat.computedDifficulty || {};
  const byFork = cd.byFork;
  if (byFork && activeSource && activeSource !== 'all' && byFork[activeSource]) {
    return { ...byFork[activeSource], _forkScoped: activeSource };
  }
  if (cd.tier) return cd;
  // Synthesize a minimal shape from authored difficulty only.
  return { tier: strat.difficulty, authoredTier: strat.difficulty, mismatch: false, effortScore: null };
}

// Increment D — filter antag strategies by user-selected criteria.
// Reuses the source-visibility pattern from filterReagents. The `activeSource` global
// fork filter also applies here (Steelclaw's "which fork?" critique).
function filterStrategies() {
  const list = DATA.antagStrategies || [];
  return list.filter(s => {
    const effective = resolveEffectiveDifficulty(s);
    const computedTier = effective.tier || s.difficulty;

    // Difficulty filter — multi-select: pass if Set is empty OR contains tier.
    if (antagFilterDifficulties.size > 0 && !antagFilterDifficulties.has(computedTier)) return false;

    // Stealth filter
    if (antagFilterStealth !== 'all' && s.stealth !== antagFilterStealth) return false;

    // Verification filter
    if (antagFilterVerification !== 'all' && s.verificationStatus !== antagFilterVerification) return false;

    // Method filter — multi-select, keyword-based. Pass if any selected
    // keyword appears in the authored method string. Empty Set = no filter.
    if (antagFilterMethods.size > 0) {
      const m = (s.method || '').toLowerCase();
      let hit = false;
      for (const kw of antagFilterMethods) {
        if (m.includes(kw)) { hit = true; break; }
      }
      if (!hit) return false;
    }

    return true;
  });
}

// Increment D / K — wire up filter-bar UI (index.html #antagFilterBar).
// Two input types live in the same toolbar:
//   - <select data-filter="..."> for single-valued filters (stealth, verification)
//   - <div class="antag-filter-chips" data-filter="..."> with <button> chips
//     for multi-valued filters (difficulty, method). Delegated click handler
//     toggles `active` + aria-pressed and syncs the backing Set.
// Called once during init() after DOM ready.
function setupAntagFilters() {
  const bar = document.getElementById('antagFilterBar');
  if (!bar) return;

  // Single-valued selects
  bar.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'SELECT') return;
    const name = t.getAttribute('data-filter');
    const val = t.value;
    if (name === 'stealth')           antagFilterStealth = val;
    else if (name === 'verification') antagFilterVerification = val;
    renderAntagStrategies();
  });

  // Multi-valued chip groups (delegated click)
  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.diff-chip');
    if (!chip) return;
    const group = chip.closest('.antag-filter-chips');
    if (!group) return;
    const filter = group.getAttribute('data-filter');
    const val = chip.getAttribute('data-value');
    const set = (filter === 'difficulty') ? antagFilterDifficulties
              : (filter === 'method')     ? antagFilterMethods
              : null;
    if (!set) return;
    if (set.has(val)) {
      set.delete(val);
      chip.classList.remove('active');
      chip.setAttribute('aria-pressed', 'false');
    } else {
      set.add(val);
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
    }
    renderAntagStrategies();
  });

  const resetBtn = document.getElementById('antagFilterReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      antagFilterDifficulties.clear();
      antagFilterMethods.clear();
      antagFilterStealth = 'all';
      antagFilterVerification = 'all';
      bar.querySelectorAll('select').forEach(sel => sel.value = 'all');
      bar.querySelectorAll('.diff-chip.active').forEach(chip => {
        chip.classList.remove('active');
        chip.setAttribute('aria-pressed', 'false');
      });
      renderAntagStrategies();
    });
  }
}

function renderAntagStrategies() {
  const el = document.getElementById('antagStrategies');
  if (!el || !DATA.antagStrategies) return;

  const filtered = filterStrategies();
  const total = DATA.antagStrategies.length;

  const cards = filtered.map(strat => {
    const reagentChips = strat.reagents.map(r =>
      `<span class="strategy-reagent-chip" onclick="event.stopPropagation(); openDetail('${esc(r.id)}')">${r.amount}u ${esc(r.id)}</span>`
    ).join('');

    // Primary difficulty = per-fork computed if activeSource is set, else global.
    // Increment I: the tier visible on the badge tracks which server the user
    // filtered to — matching the Steelclaw critique "which fork supports this?".
    const cd = strat.computedDifficulty || {};
    const effective = resolveEffectiveDifficulty(strat);
    const primaryTier = effective.tier || strat.difficulty;
    const authoredTier = effective.authoredTier || cd.authoredTier || strat.difficulty;
    const mismatch = effective.mismatch;
    const forkScope = effective._forkScoped;
    const forkMeta = forkScope && DATA.meta?.forks?.[forkScope];
    const forkLabel = forkMeta?.name || forkScope || 'global (all forks)';
    // Optional variance hint: if the same strategy reads differently across forks
    // we tell the user so they know switching the fork radio will change the tier.
    const varies = cd.tierVariesAcrossForks;
    const varianceLine = (varies && !forkScope)
      ? `\nTier varies across forks — pick a server radio to see the exact tier.`
      : '';
    const scopeLine = forkScope
      ? `\nScope: ${forkLabel} (per-fork computed)`
      : `\nScope: optimistic-max across all forks`;
    const tooltip = mismatch
      ? `Computed: ${primaryTier} (effort ${effective.effortScore ?? '?'})\nCurator says: ${authoredTier}\n${effective.mismatchReason || ''}${scopeLine}${varianceLine}`
      : `Computed difficulty (matches curator's authored tier: ${authoredTier})${scopeLine}${varianceLine}`;

    // Verification badge
    const vStatus = strat.verificationStatus || 'partial';
    const vBadge = {
      'all-verified': '<span class="badge badge-verified" title="Every ingredient has YAML-extracted mechanics; method matches a known delivery mechanism">\u2713 verified</span>',
      'partial':      '<span class="badge badge-partial" title="Some ingredients have verified mechanics; other details come from curator\'s notes">\u25d1 partial</span>',
      'lore-only':    '<span class="badge badge-lore-only" title="No ingredient has YAML-verified mechanics — relies entirely on curator\'s community knowledge">\u24d8 lore-only</span>',
    }[vStatus] || '';

    return `<div class="strategy-card" data-tier="${esc(primaryTier)}" data-status="${esc(vStatus)}">
      <div class="strategy-name">${esc(strat.name)}</div>
      <div class="strategy-desc">${esc(strat.desc)}</div>
      <div class="strategy-meta">
        <span class="badge badge-stealth-${esc(strat.stealth)}">\u{1F441} ${esc(strat.stealth)}</span>
        <span class="badge badge-difficulty badge-tier-${esc(primaryTier)}" title="${esc(tooltip)}">${esc(primaryTier)}${mismatch ? ' <small>\u24d8</small>' : ''}</span>
        <span class="badge badge-method">${esc(strat.method)}</span>
        ${vBadge}
      </div>
      <div class="strategy-reagents">${reagentChips}</div>
      ${renderSources(strat.sources, strat.id)}
      <div class="strategy-actions">
        <a class="strategy-report-btn"
           title="Report an inaccuracy in this strategy (opens GitHub issue)"
           onclick="event.stopPropagation();"
           href="https://github.com/MikameO/space-station-recipes/issues/new?template=strategy-inaccuracy.yml&title=${encodeURIComponent('Strategy \'' + strat.id + '\' inaccuracy')}&strategy_id=${encodeURIComponent(strat.id)}&fork=${encodeURIComponent(activeSource)}"
           target="_blank"
           rel="noopener noreferrer">&#9888; Report inaccuracy</a>
      </div>
    </div>`;
  }).join('');

  const counterHTML = (filtered.length === total)
    ? `<span class="strategy-count">${total} strategies</span>`
    : `<span class="strategy-count">${filtered.length} of ${total} match filters</span>`;
  const emptyHTML = filtered.length === 0
    ? '<div class="strategy-empty">No strategies match the active filters. <button class="link-button" onclick="document.getElementById(\'antagFilterReset\').click()">Reset filters</button></div>'
    : '';

  el.innerHTML = `<h3>\u2620 Antag Strategies <span class="game-label">(SS14 gameplay)</span> ${counterHTML}</h3>${emptyHTML}${cards}`;
}

function renderDeliveryMechanisms() {
  const el = document.getElementById('antagDelivery');
  if (!el) return;
  const mechanisms = DATA.deliveryMechanisms || {};
  const syndicateItems = DATA.syndicateItems || {};

  let cards = '';
  for (const [key, item] of Object.entries(mechanisms)) {
    const spriteImg = item.sprite
      ? `<img class="sprite-icon" src="sprites/${item.sprite}.png" alt="${esc(key)}" onerror="this.style.display='none'">`
      : '';
    cards += `<div class="delivery-card">
      ${spriteImg}
      <div class="delivery-info">
        <div class="delivery-name">${esc(key)}</div>
        <div class="delivery-desc">${esc(item.desc)}</div>
        <div class="delivery-meta">
          <span class="badge badge-method">${esc(item.method)}</span>
          ${item.capacity ? `<span class="badge badge-capacity">${item.capacity}u</span>` : ''}
          <span class="badge badge-stealth-${item.stealth}">${esc(item.stealth)}</span>
        </div>
      </div>
    </div>`;
  }

  // Syndicate items
  let synCards = '';
  for (const [key, item] of Object.entries(syndicateItems)) {
    const spriteImg = item.sprite
      ? `<img class="sprite-icon" src="sprites/${item.sprite}.png" alt="${esc(key)}" onerror="this.style.display='none'">`
      : '';
    synCards += `<div class="delivery-card" style="border-left:2px solid var(--red-alert)">
      ${spriteImg}
      <div class="delivery-info">
        <div class="delivery-name">${esc(key)}</div>
        <div class="delivery-desc">${esc(item.desc)}</div>
        <div class="delivery-meta">
          <span class="badge badge-tc">${esc(item.cost)}</span>
          ${item.capacity ? `<span class="badge badge-capacity">${item.capacity}u</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  el.innerHTML = `
    <h3>\u2620 In-game Delivery Mechanisms <span class="game-label">(SS14 gameplay)</span></h3>
    <div class="delivery-grid">${cards}</div>
    ${synCards ? `<h3 style="margin-top:12px">\u2620 Syndicate Items <span class="game-label">(SS14 gameplay)</span></h3><div class="delivery-grid">${synCards}</div>` : ''}
  `;
}

// Shared loader: fills the Batch Planner with a reagent set and runs the plan.
// Used by shift presets (A2).
function loadReagentSetIntoBatch(reagents, label) {
  // Switch to calculator tab
  const calcTab = document.querySelector('.tab-btn[data-tab="calculator"]');
  if (calcTab) calcTab.click();

  setTimeout(() => {
    // Clear existing batch targets (state reset, not just chip DOM — see A2 bugfix)
    if (typeof window.clearBatchTargetsExternal === 'function') {
      window.clearBatchTargetsExternal();
    }

    // Use the exposed addBatchTarget if available, or simulate
    if (typeof window.addBatchTargetExternal === 'function') {
      for (const r of reagents) {
        window.addBatchTargetExternal(r.id, r.amount);
      }
      // Auto-trigger plan
      const planBtn = document.getElementById('batchPlanBtn');
      if (planBtn) planBtn.click();
    } else {
      showToast(`${label} — switch to Calculator tab manually.`);
    }
  }, 200);
}

// A2: shift-start presets
const PRESET_ROLE_ICONS = { chemist: '⚗', botanist: '\u{1F331}', bartender: '\u{1F378}' };

function loadPresetIntoBatch(presetId) {
  const preset = (DATA.shiftPresets || []).find(p => p.id === presetId);
  if (!preset) return;
  track('preset_to_batch', { preset: presetId });
  loadReagentSetIntoBatch(preset.reagents, `Preset: ${preset.name}`);
}

function renderPresetBar() {
  const bar = document.getElementById('presetBar');
  const presets = DATA.shiftPresets || [];
  if (!bar || !presets.length) return;
  bar.innerHTML = presets.map(p => {
    const icon = PRESET_ROLE_ICONS[p.role] || '⚙';
    const items = p.reagents.map(r => `${r.amount}u ${r.id}`).join(', ');
    return `<button class="preset-chip preset-tier-${esc(p.tier)}"
      onclick="loadPresetIntoBatch('${esc(p.id)}')"
      title="${esc(p.desc)}\n${esc(items)}">
      ${icon} ${esc(p.name)}<span class="preset-tier-label">${esc(p.tier)}</span>
    </button>`;
  }).join('');
}

// ─────────────────────────────────────────────
// Shareable URLs
// ─────────────────────────────────────────────

function encodeURLState() {
  const params = new URLSearchParams();
  if (activeTab !== 'reagents') params.set('tab', activeTab);
  if (selectedReagentId) params.set('r', selectedReagentId);
  if (activeSource !== 'all') params.set('src', activeSource);
  if (activeBaseType !== 'all') params.set('bt', activeBaseType);
  if (activeTaste !== 'all') params.set('taste', activeTaste);
  if (antagMode) params.set('antag', '1');
  if (activeSort !== 'name-asc') params.set('sort', activeSort);
  if (activeCategories.size) params.set('cats', [...activeCategories].join(','));
  if (activeEffectTags.size) params.set('fx', [...activeEffectTags].join(','));
  // Increment D / K — antag strategy filters. Multi-valued filters
  // (difficulty, method) serialize as CSV so shareable URLs like
  //   #antag=1&af_d=easy,medium&af_m=inject,drink
  // round-trip without escape hell. Sort for URL stability across toggles.
  if (antagFilterDifficulties.size) params.set('af_d', [...antagFilterDifficulties].sort().join(','));
  if (antagFilterStealth      !== 'all') params.set('af_s', antagFilterStealth);
  if (antagFilterVerification !== 'all') params.set('af_v', antagFilterVerification);
  if (antagFilterMethods.size) params.set('af_m', [...antagFilterMethods].sort().join(','));
  const q = document.getElementById('searchInput')?.value;
  if (q) params.set('q', q);
  if (window.mapsURLState) for (const [k, v] of Object.entries(window.mapsURLState())) params.set(k, v);
  return params.toString() ? '#' + params.toString() : '';
}

function decodeURLState() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  const params = new URLSearchParams(hash);

  // Antag mode (must be decoded BEFORE tab, so the Antag tab button is visible)
  if (params.get('antag') === '1') {
    activateAntagMode();
  }

  // Tab (whitelist)
  const tab = params.get('tab');
  const validTabs = ['reagents','calculator','medbay','forkdiff','trees','antag','maps','ordnance'];
  if (tab && validTabs.includes(tab)) {
    const btn = document.querySelector(`.tab-btn[data-tab="${CSS.escape(tab)}"]`);
    if (btn) btn.click();
  }

  // Source (whitelist: 'all' + fork keys)
  const src = params.get('src');
  const validSources = ['all', ...Object.keys(DATA.meta?.forks || {})];
  if (src && validSources.includes(src)) {
    const radio = document.querySelector(`input[name="source"][value="${CSS.escape(src)}"]`);
    if (radio) {
      radio.checked = true; activeSource = src; updateForkDisclaimer(src);
      // Runs after the tab whitelist above, so a ?tab=ordnance deep link keeps
      // the panel when src matches and is bounced back to Reagents when it does not.
      if (window.ordnanceForkGate) window.ordnanceForkGate(src);
    }
  }

  // Base type (whitelist)
  const bt = params.get('bt');
  const validBt = ['all','base','crafted'];
  if (bt && validBt.includes(bt)) {
    const radio = document.querySelector(`input[name="basetype"][value="${CSS.escape(bt)}"]`);
    if (radio) { radio.checked = true; activeBaseType = bt; }
  }

  // Taste filter (whitelist)
  const taste = params.get('taste');
  const validTaste = ['all','has-taste','tasteless'];
  if (taste && validTaste.includes(taste)) {
    const radio = document.querySelector(`input[name="taste"][value="${CSS.escape(taste)}"]`);
    if (radio) { radio.checked = true; activeTaste = taste; }
  }

  // Sort (whitelist)
  const sortVal = params.get('sort');
  const validSort = ['name-asc','name-desc','category','used-in','antag-desc'];
  if (sortVal && validSort.includes(sortVal)) {
    activeSort = sortVal;
    const sortSel = document.getElementById('sortSelect');
    if (sortSel) sortSel.value = sortVal;
  }

  // Increment D / K — antag strategy filters (whitelisted).
  // Multi-valued: parse CSV into the backing Set, whitelist each token,
  // and visually mark the corresponding chip active. Order of params
  // doesn't matter — chips are toggled by data-value lookup.
  const validDiffValues = new Set(['trivial','easy','medium','hard','expert','impossible']);
  const validMethodValues = new Set(['inject','ingest','area','grenade','splash','foam','smoke','food','drink']);
  const validStealth = ['all','low','medium','high'];
  const validVerification = ['all','all-verified','partial','lore-only'];

  const applyChipCsv = (csv, whitelist, backingSet, filterName) => {
    if (!csv) return;
    const wanted = csv.split(',').map(v => v.trim()).filter(v => whitelist.has(v));
    for (const val of wanted) {
      backingSet.add(val);
      const chip = document.querySelector(
        `#antagFilterBar .antag-filter-chips[data-filter="${CSS.escape(filterName)}"] .diff-chip[data-value="${CSS.escape(val)}"]`
      );
      if (chip) {
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
      }
    }
  };
  applyChipCsv(params.get('af_d'), validDiffValues,   antagFilterDifficulties, 'difficulty');
  applyChipCsv(params.get('af_m'), validMethodValues, antagFilterMethods,      'method');

  // Single-valued selects
  const afSingleMap = {
    'af_s': [validStealth, 'stealth',      (v) => antagFilterStealth = v],
    'af_v': [validVerification, 'verification', (v) => antagFilterVerification = v],
  };
  for (const [key, [validSet, dataAttr, setter]] of Object.entries(afSingleMap)) {
    const val = params.get(key);
    if (val && validSet.includes(val)) {
      setter(val);
      const sel = document.querySelector(`#antagFilterBar select[data-filter="${CSS.escape(dataAttr)}"]`);
      if (sel) sel.value = val;
    }
  }

  // Categories (CSS.escape each value)
  const cats = params.get('cats');
  if (cats) {
    cats.split(',').forEach(cat => {
      const cb = document.querySelector(`#categoryFilters input[value="${CSS.escape(cat)}"]`);
      if (cb) { cb.checked = true; activeCategories.add(cat); }
    });
  }

  // Effect tags (CSS.escape each value)
  const fx = params.get('fx');
  if (fx) {
    fx.split(',').forEach(tag => {
      const btn = document.querySelector(`.effect-tag-btn[data-tag="${CSS.escape(tag)}"]`);
      if (btn) { btn.classList.add('active'); activeEffectTags.add(tag); }
    });
  }

  // Search
  const q = params.get('q');
  if (q) document.getElementById('searchInput').value = q;

  // Open reagent detail
  const rid = params.get('r');
  if (rid) setTimeout(() => openDetail(rid), 100);

  renderCurrentTab();
}

// Runs after decodeURLState, and defers to it: a link someone shared names the
// tab explicitly and must not be overruled by what this browser was doing last.
function restoreSession() {
  const saved = loadSession();
  const hash = new URLSearchParams(location.hash.slice(1));
  if (saved.tab && !hash.get('tab')) {
    const btn = document.querySelector(`.tab-btn[data-tab="${CSS.escape(saved.tab)}"]`);
    // A hidden tab button means that panel is gated off right now; leave it.
    if (btn && btn.offsetParent !== null) btn.click();
  }
  if (window.restoreTreeSession) window.restoreTreeSession(saved);
}

function setupShareButton() {
  document.getElementById('shareBtn').addEventListener('click', () => {
    track('share_click', { tab: activeTab, antag: antagMode ? 1 : 0 });
    const hash = encodeURLState();
    const url = location.origin + location.pathname + hash;
    navigator.clipboard.writeText(url)
      .then(() => showToast('Link copied!'))
      .catch(() => showToast('Copy failed — grab the URL from the address bar'));
  });
}

// C3: companion top bar — search proxy + collapse-to-slim-bar so the
// floating window stops covering the game between lookups.
function setupCompanionBar() {
  if (!document.body.classList.contains('companion')) return;
  const search = document.getElementById('companionSearch');
  const mainSearch = document.getElementById('searchInput');
  search.addEventListener('input', () => {
    mainSearch.value = search.value;
    mainSearch.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // C3.2: filters drawer — the sidebar is chrome-hidden in companion mode,
  // but people filter by category/effect/fork there too.
  const filtersBtn = document.getElementById('companionFilters');
  filtersBtn.addEventListener('click', () => {
    const open = document.body.classList.toggle('companion-filters-open');
    filtersBtn.classList.toggle('active', open);
    track('companion_filters', { open: open ? 1 : 0 });
  });

  const btn = document.getElementById('companionCollapse');
  btn.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('companion-collapsed');
    btn.innerHTML = collapsed ? '&#9635;' : '&#9601;';
    btn.title = collapsed ? 'Expand' : 'Collapse to a slim bar';
    track('companion_collapse', { collapsed: collapsed ? 1 : 0 });
    // Physically shrink the floating window where the platform allows it
    // (PiP/popup windows honor resizeTo on a user gesture); if it refuses,
    // the CSS collapse still reduces the content to the slim bar.
    try {
      const w = window.top;
      if (collapsed) {
        window.__companionSize = [w.outerWidth, w.outerHeight];
        w.resizeTo(Math.max(280, w.outerWidth), 64);
      } else if (window.__companionSize) {
        w.resizeTo(window.__companionSize[0], Math.max(420, window.__companionSize[1]));
      }
    } catch (e) { /* cross-origin top or platform refusal — CSS path is enough */ }
  });
}

// B3: pin-over-game companion window. Document Picture-in-Picture gives a
// true always-on-top window (Chromium 116+); everywhere else we fall back
// to a small popup the user can pin with OS tools (PowerToys Win+Ctrl+T).
function setupPipButton() {
  const btn = document.getElementById('pipBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    track('pip_open', { api: 'documentPictureInPicture' in window ? 'pip' : 'popup' });
    const url = './?mode=companion';
    if ('documentPictureInPicture' in window) {
      try {
        const pip = await documentPictureInPicture.requestWindow({ width: 430, height: 640 });
        pip.document.body.style.margin = '0';
        const frame = pip.document.createElement('iframe');
        frame.src = url;
        frame.style.cssText = 'border:0;width:100vw;height:100vh;display:block';
        pip.document.body.append(frame);
        return;
      } catch (e) { /* user denied or transient-activation lost — use popup */ }
    }
    window.open(url, 'chemdb-companion', 'width=430,height=640,popup=yes');
  });
}

// One-time discovery callout for the pin button. Shown to every visitor —
// its z-index sits above the tutorial overlay, so first-timers mid-tutorial
// see it too. Dismissing it (or using the pin button) silences it for good.
function setupPinCallout() {
  const SEEN_KEY = 'ss14_pin_callout_seen';
  const btn = document.getElementById('pipBtn');
  if (!btn || document.body.classList.contains('companion')) return;
  try { if (localStorage.getItem(SEEN_KEY)) return; } catch (e) { /* private mode — show every visit */ }

  const el = document.createElement('div');
  el.className = 'pin-callout';
  el.setAttribute('role', 'status');
  el.innerHTML =
    '<button type="button" class="pin-callout-close" aria-label="Dismiss">&times;</button>' +
    '<div class="pin-callout-title">&#128204; Pin over your game</div>' +
    '<div class="pin-callout-body">This button opens a floating always-on-top recipe window &mdash; keep ChemDB visible while you play.</div>';
  document.body.appendChild(el);

  const position = () => {
    const r = btn.getBoundingClientRect();
    const w = el.offsetWidth;
    // Right-align under the button, clamped to the viewport.
    let left = Math.min(r.right - w, window.innerWidth - w - 8);
    if (left < 8) left = 8;
    el.style.left = left + 'px';
    el.style.top = (r.bottom + 12) + 'px';
    el.style.setProperty('--arrow-x', (r.left + r.width / 2 - left) + 'px');
  };

  const dismiss = (reason) => {
    if (!el.isConnected) return;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* private mode */ }
    el.classList.remove('show');
    window.removeEventListener('resize', position);
    setTimeout(() => el.remove(), 300);
    track('pin_callout_dismiss', { reason });
  };

  el.querySelector('.pin-callout-close').addEventListener('click', () => dismiss('close'));
  btn.addEventListener('click', () => dismiss('pin_used'));

  window.addEventListener('resize', position);
  setTimeout(() => {
    position();
    el.classList.add('show');
    track('pin_callout_shown');
  }, 1200);
}

function setupDisclaimer() {
  const toggle = document.getElementById('disclaimerToggle');
  const panel = document.getElementById('disclaimerPanel');
  if (!toggle || !panel) return;
  toggle.addEventListener('click', () => {
    const open = !panel.hidden;
    panel.hidden = open;
    toggle.setAttribute('aria-expanded', !open);
    toggle.closest('.disclaimer-bar').classList.toggle('open', !open);
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

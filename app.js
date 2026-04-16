/* SS14 Chemistry Database — Interactive Frontend */

let DATA = null;
let searchIndex = [];
let activeTab = 'reagents';
let activeSource = 'all';
let activeBaseType = 'all'; // 'all' | 'base' | 'crafted'
let activeCategories = new Set();
let activeEffectTags = new Set();
let graphNetwork = null;
let graphPhysicsOn = true;
let selectedReagentId = null;
let detailHistory = []; // stack for back navigation
let antagMode = false;
let activeSort = 'name-asc'; // 'name-asc' | 'name-desc' | 'category' | 'used-in' | 'antag-desc'
let activeTaste = 'all'; // 'all' | 'has-taste' | 'tasteless'

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

async function init() {
  try {
    const resp = await fetch('data.json?v=' + Date.now());
    DATA = await resp.json();
  } catch (e) {
    // Fallback for file:// — try embedded
    if (typeof EMBEDDED_DATA !== 'undefined') {
      DATA = EMBEDDED_DATA;
    } else {
      document.getElementById('loadingOverlay').innerHTML =
        '<div style="color:#ef4444;padding:20px;text-align:center;">' +
        'Failed to load data.json<br><small>If using file://, try a local server: python -m http.server</small></div>';
      return;
    }
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
  setupSearch();
  setupDetailPanel();
  setupCalculator();
  setupCraftTrees();
  setupReverseLookup();
  setupBatchPlanner();
  setupShareButton();
  setupAntagMode();
  setupSortSelect();
  decodeURLState();

  renderReagents();
  updateStats();

  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('headerMeta').textContent =
    `${Object.keys(DATA.reagents).length} reagents | ${Object.keys(DATA.reactions).length} reactions`;
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
      text: [r.name, r.id, r.group, r.category, r.effects, r.desc, r.flavor, r.physicalDesc]
        .filter(Boolean).join(' ').toLowerCase(),
      reagent: r,
    });
  }
}

function filterReagents(query) {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter(Boolean);

  return searchIndex.filter(entry => {
    const r = entry.reagent;
    // Source filter: fork mode shows fork-native + vanilla (minus blocked)
    if (activeSource !== 'all' && activeSource !== 'vanilla') {
      const forkId = activeSource;
      if (r.source === 'vanilla') {
        const rxn = r.recipe ? Object.values(DATA.reactions).find(rx => rx.products[r.id]) : null;
        if (rxn && rxn.forkStatus && rxn.forkStatus[forkId] === 'blocked') return false;
        // Backward compat: check rmcStatus for rmc14 if forkStatus missing
        if (forkId === 'rmc14' && rxn && !rxn.forkStatus && rxn.rmcStatus === 'blocked') return false;
      } else if (r.source !== forkId) {
        return false; // reagent from a different fork — hide
      }
    } else if (activeSource === 'vanilla') {
      if (r.source !== 'vanilla') return false;
    }
    if (activeBaseType === 'base' && !r.isBase) return false;
    if (activeBaseType === 'crafted' && r.isBase) return false;
    if (activeTaste === 'tasteless' && r.flavor) return false;
    if (activeTaste === 'has-taste' && !r.flavor) return false;
    if (activeCategories.size > 0 && !activeCategories.has(r.category)) return false;
    if (activeEffectTags.size > 0 && !(r.effectTags || []).some(t => activeEffectTags.has(t))) return false;
    if (tokens.length > 0) {
      return tokens.every(t => entry.text.includes(t));
    }
    return true;
  });
}

function filterReactions(query) {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter(Boolean);

  return Object.values(DATA.reactions).filter(rxn => {
    // Source filter: fork mode hides blocked vanilla + other-fork reactions
    if (activeSource !== 'all' && activeSource !== 'vanilla') {
      const forkId = activeSource;
      if (rxn.source === 'vanilla') {
        if (rxn.forkStatus && rxn.forkStatus[forkId] === 'blocked') return false;
        if (forkId === 'rmc14' && !rxn.forkStatus && rxn.rmcStatus === 'blocked') return false;
      } else if (rxn.source !== forkId) {
        return false; // reaction from a different fork
      }
    } else if (activeSource === 'vanilla') {
      if (rxn.source !== 'vanilla') return false;
    }
    // Category filter: check if any product belongs to a selected category
    if (activeCategories.size > 0) {
      const productIds = Object.keys(rxn.products);
      const matchesCat = productIds.some(pid => {
        const r = DATA.reagents[pid];
        return r && activeCategories.has(r.category);
      });
      if (!matchesCat) return false;
    }
    const text = [rxn.id, ...Object.keys(rxn.reactants), ...Object.keys(rxn.products), rxn.effects]
      .filter(Boolean).join(' ').toLowerCase();
    if (tokens.length > 0) {
      return tokens.every(t => text.includes(t));
    }
    return true;
  });
}

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────

function buildSidebar() {
  const catDiv = document.getElementById('categoryFilters');
  const counts = {};
  for (const r of Object.values(DATA.reagents)) {
    counts[r.category] = (counts[r.category] || 0) + 1;
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

  // Collapsible filter sections
  document.querySelectorAll('.filter-section[data-collapsible]').forEach(section => {
    const h3 = section.querySelector('h3');
    h3.addEventListener('click', (e) => {
      // Don't collapse when clicking Clear buttons
      if (e.target.classList.contains('btn-small')) return;
      section.classList.toggle('collapsed');
    });
  });

  // Sidebar collapse (desktop) — button is outside sidebar, toggle both
  const collapseBtn = document.getElementById('sidebarCollapse');
  collapseBtn.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    collapseBtn.classList.toggle('collapsed');
  });

  // Sidebar toggle (mobile)
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebarContent').classList.toggle('open');
  });
}

function updateStats() {
  const panel = document.getElementById('statsPanel');
  let statsHTML = '';
  if (DATA.meta?.forks) {
    for (const [fid, meta] of Object.entries(DATA.meta.forks)) {
      statsHTML += `<span class="fork-dot" style="background:${meta.color}"></span>${meta.name}: ${meta.reagentCount}<br>`;
    }
  }
  const base = DATA.baseChemicals.length;
  statsHTML += `Base chemicals: ${base}<br>Reactions: ${Object.keys(DATA.reactions).length}<br>Graph edges: ${DATA.edges.length}`;
  panel.innerHTML = statsHTML;
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
      // Show disclaimer for forks with blocked reactions
      const disc = document.getElementById('forkDisclaimer');
      if (disc) {
        if (radio.value !== 'all' && radio.value !== 'vanilla' && DATA.meta?.forks?.[radio.value]) {
          const forkMeta = DATA.meta.forks[radio.value];
          disc.textContent = `${forkMeta.name}: showing vanilla + fork-exclusive chemistry. Blocked reactions filtered out.`;
          disc.style.display = 'block';
        } else {
          disc.style.display = 'none';
        }
      }
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

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const tab = btn.dataset.tab;
      document.getElementById('tab-' + tab).classList.add('active');
      activeTab = tab;
      renderCurrentTab();
    });
  });
}

function renderCurrentTab() {
  const query = document.getElementById('searchInput').value;
  if (activeTab === 'reagents') renderReagents(query);
  else if (activeTab === 'reactions') renderReactions(query);
  else if (activeTab === 'graph') renderGraph();
  else if (activeTab === 'stats') renderStatsTab();
  else if (activeTab === 'antag') { renderAntagStrategies(); renderDeliveryMechanisms(); }
  // calculator and trees tabs have their own autocomplete — no re-render needed on filter change
}

// ─────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────

function setupSearch() {
  let timer;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => renderCurrentTab(), 150);
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
  // Dynamic: check if category starts with a fork name → use fork color
  if (DATA?.meta?.forks) {
    for (const [fid, meta] of Object.entries(DATA.meta.forks)) {
      if (cat.startsWith(meta.name)) return meta.color;
    }
  }
  return '#64748b';
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
    });
  }
  renderBatch();
}

function reagentCardHTML(r) {
  const recipe = r.recipe
    ? Object.entries(r.recipe.reactants).map(([id, info]) =>
        `${info.amount}x ${id}${info.catalyst ? ' (cat)' : ''}`).join(' + ')
    : '';
  const catColor = getCatColor(r.category);

  const accent = safeColor(r.color);
  return `<div class="reagent-card" data-id="${r.id}" style="--card-accent:${accent}; border-top-color:${accent}">
    <div class="reagent-card-header">
      <span class="color-swatch" style="background:${accent}; box-shadow:0 0 6px ${accent}"></span>
      <span class="reagent-name">${esc(capName(r.name || r.id))}</span>
      <span class="reagent-id">${esc(r.id)}</span>
    </div>
    <div class="reagent-badges">
      <span class="badge badge-cat" style="border-left-color:${catColor}">${esc(r.category)}</span>
      ${r.isBase ? `<span class="badge badge-base">${r.isDispenser ? 'DISPENSER' : 'BASE'}</span>` : ''}
      ${r.overdose ? `<span class="badge badge-od">OD ${r.overdose}u</span>` : ''}
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

function renderEffectsHTML(effectsStr, compact = false) {
  if (!effectsStr) return '';
  const parts = effectsStr.split('; ');
  const chips = parts.map(part => {
    // Strip [Path] prefix — e.g. "[Bloodstream] Heals Brute 1.5"
    const pathMatch = part.match(/^\[([^\]]+)\]\s*/);
    const body = pathMatch ? part.slice(pathMatch[0].length) : part;

    let cls = 'effect-other';
    let icon = '';
    let text = body;

    if (/^Heals\s/i.test(body)) {
      cls = 'effect-heal';
      icon = '+';
      // "Heals Brute 1.5 (even)" → "+1.5 Brute (even)"
      const m = body.match(/^Heals\s+(\S+)\s+([\d.]+)(.*)$/);
      if (m) text = `${icon}${m[2]} ${m[1]}${m[3]}`;
      else text = body;
    } else if (/^Deals\s/i.test(body)) {
      cls = 'effect-damage';
      icon = '-';
      const m = body.match(/^Deals\s+(\S+)\s+([\d.]+)(.*)$/);
      if (m) text = `${icon}${m[2]} ${m[1]}${m[3]}`;
      else text = body;
    } else if (/^Status:|StatusEffect|Emote:/i.test(body)) {
      cls = 'effect-status';
      // Clean up "Status: ModifyStatusEffect" → "Status: ..."
      text = body.replace(/^Status:\s*/, '').replace('ModifyStatusEffect', 'Status Effect');
    } else if (/^Speed\s/i.test(body)) {
      cls = 'effect-speed';
      const m = body.match(/walk=([\d.]+)\s*sprint=([\d.]+)/);
      if (m) text = `Speed ${m[1]}/${m[2]}`;
    } else if (/^Thirst|^Hunger/i.test(body)) {
      cls = 'effect-other';
    } else if (/^Message|popup/i.test(body)) {
      cls = 'effect-status';
      text = body.replace(/\s*@\d+%/, '');
    } else if (/^Adds\s/i.test(body)) {
      cls = 'effect-status';
    } else if (/^Removes\s/i.test(body)) {
      cls = 'effect-status';
    } else if (/Flammable|Foam|Smoke|Explosion/i.test(body)) {
      cls = 'effect-damage';
    } else if (/^EvenHealthChange$|^HealthChange$/i.test(body)) {
      cls = 'effect-other';
    }

    // Compact mode: truncate long effects for cards
    if (compact && text.length > 35) text = text.slice(0, 32) + '...';

    return `<span class="effect-chip ${cls}">${esc(text)}</span>`;
  });
  return `<div class="effects-wrap">${chips.join('')}</div>`;
}

// ─────────────────────────────────────────────
// Reactions Table
// ─────────────────────────────────────────────

function renderReactions(query = '') {
  const results = filterReactions(query);
  const tbody = document.getElementById('reactionsBody');

  const rows = results.slice(0, 500).map(rxn => {
    const reactants = Object.entries(rxn.reactants)
      .map(([id, info]) => `${info.amount}x ${id}${info.catalyst ? ' (cat)' : ''}`).join(' + ');
    const products = Object.entries(rxn.products).map(([id, amt]) => `${amt}x ${id}`).join(', ');
    const temp = [rxn.minTemp ? `>${rxn.minTemp}K` : '', rxn.maxTemp ? `<${rxn.maxTemp}K` : ''].filter(Boolean).join(', ');
    const mixer = (rxn.mixer || []).join(', ');

    return `<tr>
      <td>${esc(rxn.id)}</td>
      <td>${esc(reactants)}</td>
      <td>${esc(products)}</td>
      <td>${esc(temp)}</td>
      <td>${esc(mixer)}</td>
      <td>${rxn.source !== 'vanilla' && DATA.meta?.forks?.[rxn.source] ? '<span class="badge badge-fork" style="border-color:' + DATA.meta.forks[rxn.source].color + '">' + esc(DATA.meta.forks[rxn.source].name) + '</span>' : 'Vanilla'}${(() => { const fs = rxn.forkStatus || {}; const fn = rxn.forkNotes || {}; const mods = Object.entries(fs).filter(([,s]) => s === 'modified'); return mods.length ? ' <span class="badge badge-modified" title="' + mods.map(([f]) => esc((DATA.meta.forks?.[f]?.name || f) + ': ' + (fn[f] || 'Modified'))).join('; ') + '">MOD</span>' : ''; })()}</td>
    </tr>`;
  });

  tbody.innerHTML = rows.join('');
  document.getElementById('resultCount').textContent = `${results.length} reactions`;
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
  selectedReagentId = reagentId;

  const panel = document.getElementById('detailPanel');
  const content = document.getElementById('detailContent');

  let recipeHTML = '<p style="color:var(--text-dim)">Base chemical (no recipe)</p>';
  if (r.recipe) {
    recipeHTML = '<div>' + Object.entries(r.recipe.reactants).map(([id, info]) =>
      `<div class="detail-recipe-item">
        <span class="detail-recipe-amount">${info.amount}x</span>
        <span class="detail-recipe-name" onclick="openDetail('${id}')">${esc(id)}</span>
        ${info.catalyst ? '<span class="badge badge-c" style="font-size:0.6rem">CATALYST</span>' : ''}
      </div>`
    ).join('') + '</div>';

    const tempParts = [];
    if (r.recipe.minTemp) tempParts.push(`Min: ${r.recipe.minTemp}K`);
    if (r.recipe.maxTemp) tempParts.push(`Max: ${r.recipe.maxTemp}K`);
    if (tempParts.length) recipeHTML += `<div style="margin-top:6px;font-size:0.72rem;color:var(--accent-cyan)">${tempParts.join(' | ')}</div>`;
    if (r.recipe.mixer && r.recipe.mixer.length) recipeHTML += `<div style="font-size:0.72rem;color:var(--accent-purple)">Mixer: ${r.recipe.mixer.join(', ')}</div>`;

    const products = Object.entries(r.recipe.products).map(([id, amt]) => `${amt}x ${id}`).join(', ');
    recipeHTML += `<div style="margin-top:6px;font-size:0.72rem;color:var(--accent-green)">Produces: ${products}</div>`;
  }

  // Build mini craft tree with quantity input
  let treeHTML = '';
  if (!r.isBase) {
    const tree = buildCraftTree(reagentId, 1);
    treeHTML = `<input type="number" id="detailTreeAmount" class="tree-amount-input"
      value="1" min="1" max="9999" step="1" oninput="rebuildDetailTree()"
      title="Target amount (units)">
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
    ${r.desc ? `<div class="detail-desc">${esc(r.desc)}</div>` : ''}

    <div class="detail-section">
      <h4>Recipe${(() => {
        const altCount = Object.values(DATA.reactions).filter(rx => rx.products[reagentId]).length;
        return altCount > 1 ? ` <span style="color:var(--amber);font-size:0.55rem;font-weight:400">(+${altCount - 1} alt recipe${altCount > 2 ? 's' : ''})</span>` : '';
      })()}</h4>
      ${recipeHTML}
    </div>

    ${r.effects ? `<div class="detail-section"><h4>Effects</h4>${renderEffectsHTML(r.effects)}</div>` : ''}

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
// Craft Trees
// ─────────────────────────────────────────────

// Returns reactions producing reagentId, filtered by activeSource.
// Fork-specific reactions are sorted first so rxns[0] picks the best match.
function getFilteredReactions(reagentId) {
  let rxns = Object.values(DATA.reactions).filter(rx => rx.products[reagentId]);
  if (activeSource === 'all') return rxns;

  if (activeSource === 'vanilla') {
    return rxns.filter(rx => rx.source === 'vanilla');
  }

  const forkId = activeSource;
  rxns = rxns.filter(rx => {
    if (rx.source === 'vanilla') {
      if (rx.forkStatus && rx.forkStatus[forkId] === 'blocked') return false;
      if (forkId === 'rmc14' && !rx.forkStatus && rx.rmcStatus === 'blocked') return false;
      return true;
    }
    return rx.source === forkId;
  });
  // Prefer fork-specific reactions over vanilla
  rxns.sort((a, b) => (b.source === forkId ? 1 : 0) - (a.source === forkId ? 1 : 0));
  return rxns;
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

function renderTreeHTML(node, depth = 0) {
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

  let html = `<li>
    <div class="${cls}">
      <span class="node-swatch" style="background:${color}"></span>
      <span class="node-amount">${amt}</span>
      <span class="node-name clickable" onclick="openDetail('${node.id}')">${esc(name)}</span>
      ${badges}
      ${node.children.length > 0 ? `<button class="tree-toggle" onclick="this.parentElement.nextElementSibling.classList.toggle('collapsed')">-</button>` : ''}
    </div>`;

  if (node.children.length > 0) {
    html += `<ul class="tree-children">`;
    for (const child of node.children) {
      html += renderTreeHTML(child, depth + 1);
    }
    html += `</ul>`;
  }

  html += `</li>`;
  return depth === 0 ? `<ul class="craft-tree">${html}</ul>` : html;
}

let currentTreeReagentId = null;

function rebuildTree() {
  if (!currentTreeReagentId) return;
  const amountInput = document.getElementById('treeAmount');
  const amount = Math.max(1, parseFloat(amountInput.value) || 1);
  const tree = buildCraftTree(currentTreeReagentId, amount);
  document.getElementById('treeOutput').innerHTML = renderTreeHTML(tree);
}

function setupCraftTrees() {
  const input = document.getElementById('treeTarget');
  const suggestions = document.getElementById('treeSuggestions');
  const amountInput = document.getElementById('treeAmount');

  setupAutocomplete(input, suggestions, (id) => {
    input.value = DATA.reagents[id]?.name || id;
    suggestions.classList.remove('open');
    currentTreeReagentId = id;
    rebuildTree();
  });

  // Amount input — rebuild tree when changed
  amountInput.addEventListener('input', rebuildTree);
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
    const result = calculateIngredients(selectedCalcId, amount);
    renderCalcResults(selectedCalcId, amount, result);
  });
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
    });

    for (const [reactId, info] of Object.entries(rxn.reactants)) {
      if (!info.catalyst) {
        resolve(reactId, info.amount * runs, depth + 1);
      }
    }

    cycleGuard.delete(reagentId);
  }

  resolve(targetId, targetAmount, 0);
  steps.sort((a, b) => b.depth - a.depth);
  return { baseNeeds, steps };
}

function renderCalcResults(targetId, amount, result) {
  const div = document.getElementById('calcResults');
  const r = DATA.reagents[targetId];

  const shoppingItems = Object.entries(result.baseNeeds)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, amt]) => `<div class="shopping-item">
      <span>${esc(id)}</span>
      <span class="shopping-amount">${Math.round(amt * 100) / 100}u</span>
    </div>`).join('');

  const stepItems = result.steps.map((step, i) => {
    const reactants = step.reactants.map(r =>
      `${r.amount}u ${r.id}${r.catalyst ? ' (cat)' : ''}`).join(' + ');
    let extra = '';
    if (step.minTemp) extra += `<span class="step-temp"> [&gt;${step.minTemp}K]</span>`;
    if (step.maxTemp) extra += `<span class="step-temp"> [&lt;${step.maxTemp}K]</span>`;
    if (step.mixer && step.mixer.length) extra += `<span class="step-mixer"> [${step.mixer.join(',')}]</span>`;

    return `<div class="step-item">
      <span class="step-num">${i + 1}.</span>
      ${esc(reactants)} &rarr; <strong>${Math.round(step.amount * 100) / 100}u ${esc(step.reagentId)}</strong>
      ${extra}
    </div>`;
  }).join('');

  div.innerHTML = `
    ${checkCalcWarnings(result.baseNeeds, result.steps)}
    <div class="calc-section">
      <h3>Shopping List for ${Math.round(amount * 100) / 100}u ${esc(r?.name || targetId)}</h3>
      ${shoppingItems || '<p style="color:var(--text-dim)">This is a base chemical</p>'}
    </div>
    <div class="calc-section">
      <h3>Mixing Steps (${result.steps.length})</h3>
      ${stepItems || '<p style="color:var(--text-dim)">No mixing needed</p>'}
    </div>
  `;
}

// ─────────────────────────────────────────────
// Network Graph
// ─────────────────────────────────────────────

let lastGraphHash = '';
function renderGraph() {
  const container = document.getElementById('graphContainer');
  const info = document.getElementById('graphInfo');

  // Get filtered reagent IDs
  const filtered = filterReagents(document.getElementById('searchInput').value);
  const ids = new Set(filtered.map(e => e.id));

  // Cache check — don't recreate if same filter set
  const hash = [...ids].sort().join(',');
  if (hash === lastGraphHash && graphNetwork) { return; }
  lastGraphHash = hash;

  // Build vis.js data
  const nodes = [];
  const edges = [];

  for (const id of ids) {
    const r = DATA.reagents[id];
    if (!r) continue;
    nodes.push({
      id,
      label: r.name || r.id,
      color: {
        background: safeColor(r.color),
        border: r.isBase ? '#22c55e' : '#1e3a5f',
        highlight: { background: '#fbbf24', border: '#f59e0b' },
      },
      shape: r.isBase ? 'diamond' : 'dot',
      size: r.isBase ? 10 : 7,
      title: `${r.name || r.id}\n${r.category}\n${r.effects || ''}`.slice(0, 300),
      font: { color: '#94a3b8', size: 9 },
    });
  }

  for (const edge of DATA.edges) {
    if (ids.has(edge.from) && ids.has(edge.to)) {
      edges.push({
        from: edge.from,
        to: edge.to,
        arrows: 'to',
        color: { color: edge.catalyst ? '#f59e0b' : '#1e3a5f', highlight: '#3b82f6' },
        dashes: edge.catalyst,
        width: 0.5,
      });
    }
  }

  info.textContent = `${nodes.length} nodes, ${edges.length} edges`;

  if (nodes.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-dim)">No reagents match filters. Adjust filters or clear search.</div>';
    return;
  }

  if (nodes.length > 400) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-dim)">
      ${nodes.length} nodes — select a category filter to reduce graph size for better performance.
      <br><button class="btn-primary" style="margin-top:12px" id="forceGraph">Show Anyway</button>
    </div>`;
    document.getElementById('forceGraph').addEventListener('click', () => initGraph(container, nodes, edges));
    return;
  }

  initGraph(container, nodes, edges);
}

function initGraph(container, nodes, edges) {
  const data = {
    nodes: new vis.DataSet(nodes),
    edges: new vis.DataSet(edges),
  };

  const options = {
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -30,
        centralGravity: 0.005,
        springLength: 80,
        springConstant: 0.08,
        damping: 0.4,
      },
      stabilization: { iterations: 120 },
    },
    interaction: { hover: true, tooltipDelay: 100, navigationButtons: true },
    layout: { improvedLayout: true },
  };

  graphNetwork = new vis.Network(container, data, options);
  graphPhysicsOn = true;

  graphNetwork.on('stabilizationIterationsDone', () => {
    graphNetwork.setOptions({ physics: false });
    graphPhysicsOn = false;
  });

  graphNetwork.on('click', (params) => {
    if (params.nodes.length > 0) {
      openDetail(params.nodes[0]);
    }
  });
}

// Graph controls
document.getElementById('graphReset')?.addEventListener('click', () => {
  if (graphNetwork) graphNetwork.fit();
});

document.getElementById('graphPhysics')?.addEventListener('click', () => {
  if (!graphNetwork) return;
  graphPhysicsOn = !graphPhysicsOn;
  graphNetwork.setOptions({ physics: graphPhysicsOn });
});

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

      const matches = searchIndex
        .filter(e => e.text.includes(q))
        .slice(0, 15);

      if (matches.length === 0) { suggestionsDiv.classList.remove('open'); return; }

      suggestionsDiv.innerHTML = matches.map(e => {
        const r = e.reagent;
        return `<div class="suggestion-item" data-id="${r.id}">
          <span class="color-swatch" style="background:${safeColor(r.color)};width:10px;height:10px"></span>
          ${esc(capName(r.name || r.id))}
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

function setupEffectFilters() {
  const div = document.getElementById('effectFilters');
  // Collect all tags with counts
  const tagCounts = {};
  for (const r of Object.values(DATA.reagents)) {
    for (const tag of (r.effectTags || [])) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  // Sort: heals first, then deals, then others
  const sorted = Object.entries(tagCounts).sort((a, b) => {
    const pa = a[0].startsWith('heals:') ? 0 : a[0].startsWith('deals:') ? 1 : 2;
    const pb = b[0].startsWith('heals:') ? 0 : b[0].startsWith('deals:') ? 1 : 2;
    return pa - pb || b[1] - a[1];
  });

  div.innerHTML = sorted.map(([tag, count]) => {
    const cls = tag.startsWith('heals:') ? 'heals' : tag.startsWith('deals:') ? 'deals' : '';
    const label = tag.replace('heals:', '\u2764 ').replace('deals:', '\u2620 ');
    return `<button class="effect-tag-btn ${cls}" data-tag="${tag}" title="${count} reagents">${label}</button>`;
  }).join('');

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
  return `<div class="warning-box" style="grid-column:1/-1">
    <div class="warning-box-title">\u26a0 Danger Warnings</div>
    ${triggered.map(w => `<div class="warning-item">
      <span class="warning-icon">${w.severity === 'lethal' ? '\u2620' : '\u26a0'}</span>
      <span><strong>${esc(w.reagents.join(' + '))}</strong>: ${esc(w.desc)}</span>
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
    const result = planBatch(batchTargets);
    renderBatchResults(result, resultsDiv, warningsDiv);
  });

  // Expose external API for strategy→batch integration
  window.addBatchTargetExternal = function(id, amount) {
    const r = DATA.reagents[id];
    if (!r) return;
    // Avoid duplicates
    if (batchTargets.find(t => t.id === id)) return;
    batchTargets.push({ id, amount, name: capName(r.name || id) });
    renderBatchChips();
  };
}

function planBatch(targets) {
  const totalBase = {};
  const stepMap = new Map(); // reagentId -> step with accumulated amount

  for (const { id, amount } of targets) {
    const result = calculateIngredients(id, amount);
    for (const [reagentId, amt] of Object.entries(result.baseNeeds)) {
      totalBase[reagentId] = (totalBase[reagentId] || 0) + amt;
    }
    for (const step of result.steps) {
      if (stepMap.has(step.reagentId)) {
        stepMap.get(step.reagentId).amount += step.amount;
        // Recalculate reactant amounts
        const ratio = step.amount / (stepMap.get(step.reagentId).amount - step.amount + step.amount);
        // Keep the step, amounts already accumulated
      } else {
        stepMap.set(step.reagentId, { ...step, reactants: step.reactants.map(r => ({ ...r })) });
      }
    }
  }

  const allSteps = [...stepMap.values()].sort((a, b) => b.depth - a.depth);
  return { totalBase, allSteps, targets };
}

function renderBatchResults(result, div, warningsDiv) {
  const shoppingItems = Object.entries(result.totalBase)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, amt]) => `<div class="shopping-item">
      <span>${esc(capName(DATA.reagents[id]?.name || id))}</span>
      <span class="shopping-amount">${Math.round(amt * 100) / 100}u</span>
    </div>`).join('');

  const stepItems = result.allSteps.map((step, i) => {
    const reactants = step.reactants.map(r => `${r.amount}u ${esc(r.id)}${r.catalyst ? ' (cat)' : ''}`).join(' + ');
    let extra = '';
    if (step.minTemp) extra += `<span class="step-temp"> [&gt;${step.minTemp}K]</span>`;
    if (step.mixer?.length) extra += `<span class="step-mixer"> [${step.mixer.join(',')}]</span>`;
    return `<div class="step-item">
      <span class="step-num">${i + 1}.</span>
      ${esc(reactants)} &rarr; <strong>${Math.round(step.amount * 100) / 100}u ${esc(step.reagentId)}</strong>${extra}
    </div>`;
  }).join('');

  const targetList = result.targets.map(t => `${t.amount}u ${esc(t.name)}`).join(', ');

  // Check warnings
  warningsDiv.innerHTML = checkCalcWarnings(result.totalBase, result.allSteps);

  div.innerHTML = `
    <div class="calc-section">
      <h3>Total Shopping List for: ${targetList}</h3>
      ${shoppingItems}
    </div>
    <div class="calc-section">
      <h3>Mixing Steps (${result.allSteps.length})</h3>
      ${stepItems || '<p style="color:var(--text-ghost)">All targets are base chemicals</p>'}
    </div>
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

function getAntagIntelHTML(r) {
  const score = r.antagScore || 0;
  if (!score) return '';
  const tags = r.antagTags || [];
  const tips = r.antagTips || '';
  const pct = Math.round(score * 10);

  // Suggest delivery methods based on category/effects
  const deliveryData = DATA.deliveryMechanisms || {};
  const suggestions = [];
  if (tips.toLowerCase().includes('syringe') || tips.toLowerCase().includes('inject')) {
    suggestions.push('Syringe', 'Hypospray');
  }
  if (tips.toLowerCase().includes('drink') || tips.toLowerCase().includes('food') || tips.toLowerCase().includes('ingest')) {
    suggestions.push('Food', 'Drink');
  }
  if (tips.toLowerCase().includes('foam')) {
    suggestions.push('FoamGrenade');
  }
  if (tips.toLowerCase().includes('smoke')) {
    suggestions.push('SmokeBomb');
  }
  if (suggestions.length === 0) suggestions.push('Syringe', 'Drink');

  const deliverySuggestHTML = suggestions.map(key => {
    const d = deliveryData[key];
    if (!d) return `<span class="badge badge-method">${esc(key)}</span>`;
    return `<span class="badge badge-method" title="${esc(d.desc)}">${esc(key)}${d.capacity ? ' (' + d.capacity + 'u)' : ''}</span>`;
  }).join(' ');

  return `
    <div class="antag-intel">
      <h4>\u2620 Antag Intel</h4>
      <div class="antag-score-bar">
        <span class="score-label">${score}/10</span>
        <div class="score-track">
          <div class="score-fill" style="width:${pct}%"></div>
        </div>
      </div>
      ${tags.length ? `<div class="antag-tags">${tags.map(t => `<span class="badge badge-antag-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${tips ? `<div class="antag-tips">${esc(tips)}</div>` : ''}
      <div class="antag-delivery-suggest">
        <h5>Suggested Delivery</h5>
        ${deliverySuggestHTML}
      </div>
    </div>
  `;
}

function renderAntagStrategies() {
  const el = document.getElementById('antagStrategies');
  if (!el || !DATA.antagStrategies) return;

  const cards = DATA.antagStrategies.map(strat => {
    const reagentChips = strat.reagents.map(r =>
      `<span class="strategy-reagent-chip" onclick="event.stopPropagation(); openDetail('${esc(r.id)}')">${r.amount}u ${esc(r.id)}</span>`
    ).join('');

    return `<div class="strategy-card">
      <div class="strategy-name">${esc(strat.name)}</div>
      <div class="strategy-desc">${esc(strat.desc)}</div>
      <div class="strategy-meta">
        <span class="badge badge-stealth-${strat.stealth}">\u{1F441} ${esc(strat.stealth)}</span>
        <span class="badge badge-difficulty">${esc(strat.difficulty)}</span>
        <span class="badge badge-method">${esc(strat.method)}</span>
      </div>
      <div class="strategy-reagents">${reagentChips}</div>
      <button class="strategy-calc-btn" onclick="event.stopPropagation(); loadStrategyIntoBatch('${esc(strat.id)}')">Calculate in Batch Planner</button>
    </div>`;
  }).join('');

  el.innerHTML = `<h3>\u2620 Antag Strategies</h3>${cards}`;
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
    <h3>\u2620 Delivery Mechanisms</h3>
    <div class="delivery-grid">${cards}</div>
    ${synCards ? `<h3 style="margin-top:12px">\u2620 Syndicate Items</h3><div class="delivery-grid">${synCards}</div>` : ''}
  `;
}

function loadStrategyIntoBatch(strategyId) {
  const strat = (DATA.antagStrategies || []).find(s => s.id === strategyId);
  if (!strat) return;

  // Switch to calculator tab
  const calcTab = document.querySelector('.tab-btn[data-tab="calculator"]');
  if (calcTab) calcTab.click();

  // Add each strategy reagent to batch planner
  setTimeout(() => {
    // Clear existing batch targets
    const batchChips = document.getElementById('batchChips');
    if (batchChips) batchChips.innerHTML = '';

    // Use the exposed addBatchTarget if available, or simulate
    if (typeof window.addBatchTargetExternal === 'function') {
      for (const r of strat.reagents) {
        window.addBatchTargetExternal(r.id, r.amount);
      }
      // Auto-trigger plan
      const planBtn = document.getElementById('batchPlanBtn');
      if (planBtn) planBtn.click();
    } else {
      showToast(`Strategy: ${strat.name} — switch to Calculator tab manually.`);
    }
  }, 200);
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
  const q = document.getElementById('searchInput')?.value;
  if (q) params.set('q', q);
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

  // Tab
  const tab = params.get('tab');
  if (tab) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (btn) btn.click();
  }

  // Source
  const src = params.get('src');
  if (src) {
    const radio = document.querySelector(`input[name="source"][value="${src}"]`);
    if (radio) { radio.checked = true; activeSource = src; }
  }

  // Base type
  const bt = params.get('bt');
  if (bt) {
    const radio = document.querySelector(`input[name="basetype"][value="${bt}"]`);
    if (radio) { radio.checked = true; activeBaseType = bt; }
  }

  // Taste filter
  const taste = params.get('taste');
  if (taste) {
    const radio = document.querySelector(`input[name="taste"][value="${taste}"]`);
    if (radio) { radio.checked = true; activeTaste = taste; }
  }

  // Sort
  const sortVal = params.get('sort');
  if (sortVal) {
    activeSort = sortVal;
    const sortSel = document.getElementById('sortSelect');
    if (sortSel) sortSel.value = sortVal;
  }

  // Categories
  const cats = params.get('cats');
  if (cats) {
    cats.split(',').forEach(cat => {
      const cb = document.querySelector(`#categoryFilters input[value="${cat}"]`);
      if (cb) { cb.checked = true; activeCategories.add(cat); }
    });
  }

  // Effect tags
  const fx = params.get('fx');
  if (fx) {
    fx.split(',').forEach(tag => {
      const btn = document.querySelector(`.effect-tag-btn[data-tag="${tag}"]`);
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

function setupShareButton() {
  document.getElementById('shareBtn').addEventListener('click', () => {
    const hash = encodeURLState();
    const url = location.origin + location.pathname + hash;
    navigator.clipboard.writeText(url).then(() => showToast('Link copied!')).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      showToast('Link copied!');
    });
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ─────────────────────────────────────────────
// Stats Tab
// ─────────────────────────────────────────────

let statsRendered = false;

function computeTreeDepth(reagentId, visited = new Set()) {
  if (DATA.baseChemicals.includes(reagentId) || visited.has(reagentId)) return 0;
  const rxns = Object.values(DATA.reactions).filter(rx => rx.products[reagentId]);
  if (rxns.length === 0) return 0;
  const rxn = rxns[0];
  visited = new Set(visited);
  visited.add(reagentId);
  let maxChild = 0;
  for (const [reactId, info] of Object.entries(rxn.reactants)) {
    if (info.catalyst) continue;
    const d = computeTreeDepth(reactId, visited);
    if (d > maxChild) maxChild = d;
  }
  return maxChild + 1;
}

function renderStatsTab() {
  if (statsRendered) return;
  statsRendered = true;

  const container = document.getElementById('statsTabContent');
  const reagents = DATA.reagents;
  const reactions = DATA.reactions;
  const forks = DATA.meta?.forks || {};

  const totalReagents = Object.keys(reagents).length;
  const totalReactions = Object.keys(reactions).length;
  const totalBase = DATA.baseChemicals.length;
  const totalForks = Object.keys(forks).length;
  const totalEdges = DATA.edges.length;

  // --- Overview Cards ---
  let html = `<div class="stats-overview">
    <div class="stats-card"><div class="stats-card-value">${totalReagents}</div><div class="stats-card-label">Reagents</div></div>
    <div class="stats-card"><div class="stats-card-value">${totalReactions}</div><div class="stats-card-label">Reactions</div></div>
    <div class="stats-card"><div class="stats-card-value">${totalBase}</div><div class="stats-card-label">Base Chemicals</div></div>
    <div class="stats-card"><div class="stats-card-value">${totalEdges}</div><div class="stats-card-label">Graph Edges</div></div>
    <div class="stats-card"><div class="stats-card-value">${totalForks}</div><div class="stats-card-label">Forks</div></div>
  </div>`;

  // --- Fork Comparison ---
  const maxForkReagents = Math.max(...Object.values(forks).map(f => f.reagentCount || 0));
  html += `<div class="stats-section"><h3 class="stats-section-title">Fork Comparison</h3><div class="stats-bars">`;
  for (const [fid, meta] of Object.entries(forks)) {
    const pct = maxForkReagents > 0 ? (meta.reagentCount / maxForkReagents * 100) : 0;
    const rxCount = meta.reactionCount || 0;
    html += `<div class="stats-bar-row">
      <span class="stats-bar-label">${esc(meta.name)}</span>
      <div class="stats-bar-track">
        <div class="stats-bar-fill" style="width:${pct}%;background:${meta.color}"></div>
      </div>
      <span class="stats-bar-value">${meta.reagentCount} <span class="stats-bar-sub">(${rxCount} rxn)</span></span>
    </div>`;
  }
  html += `</div></div>`;

  // --- Category Distribution ---
  const catCounts = {};
  for (const r of Object.values(reagents)) {
    const cat = r.category || 'Uncategorized';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  }
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const maxCat = sortedCats.length > 0 ? sortedCats[0][1] : 1;

  html += `<div class="stats-section"><h3 class="stats-section-title">Top Categories</h3><div class="stats-bars">`;
  for (const [cat, count] of sortedCats) {
    const pct = (count / maxCat * 100);
    html += `<div class="stats-bar-row">
      <span class="stats-bar-label">${esc(cat)}</span>
      <div class="stats-bar-track">
        <div class="stats-bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="stats-bar-value">${count}</span>
    </div>`;
  }
  html += `</div></div>`;

  // --- Most Used Base Chemicals ---
  const baseCounts = {};
  for (const rxn of Object.values(reactions)) {
    for (const reactId of Object.keys(rxn.reactants)) {
      if (DATA.baseChemicals.includes(reactId)) {
        baseCounts[reactId] = (baseCounts[reactId] || 0) + 1;
      }
    }
  }
  const sortedBases = Object.entries(baseCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxBase = sortedBases.length > 0 ? sortedBases[0][1] : 1;

  html += `<div class="stats-section"><h3 class="stats-section-title">Most Used Base Chemicals</h3><div class="stats-bars">`;
  for (const [id, count] of sortedBases) {
    const r = reagents[id];
    const name = r ? (r.name || id) : id;
    const pct = (count / maxBase * 100);
    html += `<div class="stats-bar-row">
      <span class="stats-bar-label clickable" onclick="openDetail('${id}')">${esc(name)}</span>
      <div class="stats-bar-track">
        <div class="stats-bar-fill stats-bar-base" style="width:${pct}%"></div>
      </div>
      <span class="stats-bar-value">${count} rxn</span>
    </div>`;
  }
  html += `</div></div>`;

  // --- Most Complex Recipes (deepest craft trees) ---
  const depths = [];
  for (const [id, r] of Object.entries(reagents)) {
    if (DATA.baseChemicals.includes(id)) continue;
    const d = computeTreeDepth(id);
    if (d >= 3) depths.push({ id, name: r.name || id, depth: d });
  }
  depths.sort((a, b) => b.depth - a.depth);
  const top10 = depths.slice(0, 10);

  if (top10.length > 0) {
    const maxDepth = top10[0].depth;
    html += `<div class="stats-section"><h3 class="stats-section-title">Most Complex Recipes</h3><div class="stats-bars">`;
    for (const item of top10) {
      const pct = (item.depth / maxDepth * 100);
      html += `<div class="stats-bar-row">
        <span class="stats-bar-label clickable" onclick="openDetail('${item.id}')">${esc(item.name)}</span>
        <div class="stats-bar-track">
          <div class="stats-bar-fill stats-bar-depth" style="width:${pct}%"></div>
        </div>
        <span class="stats-bar-value">${item.depth} steps</span>
      </div>`;
    }
    html += `</div></div>`;
  }

  // --- Generated timestamp ---
  if (DATA.meta?.generated) {
    html += `<div class="stats-footer">Data generated: ${esc(DATA.meta.generated)}</div>`;
  }

  container.innerHTML = html;
}

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

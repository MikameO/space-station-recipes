// Maps tab — station map item finder. Data: maps/index.json + maps/<fork>/<Id>.{json,png}
// Spec: docs/design/2026-07-12-map-item-finder.md. Loaded lazily on first tab open.
(function () {
  'use strict';
  const S = {
    index: null, mapMeta: null, mapData: null, img: null,
    scale: 1, ox: 0, oy: 0,        // canvas transform
    selectedProto: null, inited: false,
  };
  window.mapsURLState = () => {
    const out = {};
    if (S.mapMeta) out.map = S.mapMeta.file;
    if (S.selectedProto) out.item = S.selectedProto;
    return out;
  };
  async function init() {
    if (S.inited) return;
    S.inited = true;
    const status = document.getElementById('mapsStatus');
    status.textContent = 'Loading map index…';
    try {
      const r = await fetch('maps/index.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      S.index = await r.json();
      status.textContent = '';
      if (!S._navSetup) { S._navSetup = true; setupCanvasNav(); }
      buildMapSelect();
    } catch (e) {
      status.innerHTML = 'Failed to load maps index. <button id="mapsRetry">Retry</button>';
      document.getElementById('mapsRetry').onclick = () => { S.inited = false; init(); };
    }
  }
  function buildMapSelect() {
    const sel = document.getElementById('mapsMapSelect');
    sel.innerHTML = '';
    const allFiles = [];
    for (const fork of S.index.forks) {
      const og = document.createElement('optgroup');
      og.label = fork.label;
      const maps = [...fork.maps].sort((a, b) => (b.inPool - a.inPool) || a.name.localeCompare(b.name));
      for (const m of maps) {
        const o = document.createElement('option');
        o.value = m.file;
        o.textContent = m.name + (m.inPool ? '' : ' (off-rotation)');
        og.appendChild(o);
        allFiles.push(m.file);
      }
      sel.appendChild(og);
    }
    sel.onchange = () => loadMap(sel.value);
    // honor deep-link ?map= if it names a real map, else default to first option
    const wanted = new URLSearchParams(location.hash.slice(1)).get('map');
    const initial = (wanted && allFiles.includes(wanted)) ? wanted : sel.value;
    sel.value = initial;
    loadMap(initial);
  }

  async function loadMap(file) {
    const status = document.getElementById('mapsStatus');
    status.textContent = 'Loading ' + file + '…';
    S.mapData = null; S.selectedProto = null;
    try {
      const [jr, img] = await Promise.all([
        fetch('maps/' + file + '.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
        new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'maps/' + file + '.png'; }),
      ]);
      S.mapData = jr; S.img = img;
      S.mapMeta = S.index.forks.flatMap(f => f.maps).find(m => m.file === file);
      status.textContent = '';
      document.getElementById('mapsSearch').disabled = false;
      buildSearchIndex();          // Task 12
      zoomFit();
      renderLocations(null);       // Task 13
      if (typeof track === 'function') track('maps_map_select');
    } catch (e) {
      status.innerHTML = 'Failed to load map. <button id="mapsRetryMap">Retry</button>';
      document.getElementById('mapsRetryMap').onclick = () => loadMap(file);
    }
  }

  function canvasSize() {
    const c = document.getElementById('mapsCanvas');
    const wrap = c.parentElement;
    const dpr = window.devicePixelRatio || 1;
    c.width = wrap.clientWidth * dpr; c.height = wrap.clientHeight * dpr;
    c.style.width = wrap.clientWidth + 'px'; c.style.height = wrap.clientHeight + 'px';
    return { w: c.width, h: c.height };
  }

  function zoomFit() {
    const { w, h } = canvasSize();
    S.scale = Math.min(w / S.img.width, h / S.img.height) * 0.95;
    S.ox = (w - S.img.width * S.scale) / 2;
    S.oy = (h - S.img.height * S.scale) / 2;
    draw();
  }

  function draw() {
    const c = document.getElementById('mapsCanvas');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(S.img, S.ox, S.oy, S.img.width * S.scale, S.img.height * S.scale);
    drawBeacons(ctx);   // Task 12
    drawMarkers(ctx);   // Task 12
  }
  const KIND_COLOR = { 0: '#39ff85', 1: '#ffb627', 2: '#c17aff', 4: '#ff3d5a' };
  function tileToScreen(x, y) {
    const b = S.mapData.bounds;
    return [(Math.floor(x) - b.minX + 0.5) * S.scale + S.ox,
            (b.maxY - Math.floor(y) + 0.5) * S.scale + S.oy];
  }
  function drawBeacons(ctx) {
    if (!S.mapData || S.scale < 1.2) return;   // labels only when zoomed in enough
    ctx.font = `${Math.max(10, Math.min(13, S.scale * 3))}px 'Share Tech Mono', monospace`;
    ctx.textAlign = 'center'; ctx.fillStyle = '#00e5ff'; ctx.globalAlpha = 0.85;
    for (const [name, x, y] of S.mapData.beacons) {
      const [sx, sy] = tileToScreen(x, y);
      ctx.fillText(name, sx, sy);
    }
    ctx.globalAlpha = 1;
  }
  function drawMarkers(ctx) {
    if (!S.selectedProto || !S.mapData) return;
    const rec = S.mapData.items[S.selectedProto];
    if (!rec) return;
    const r = Math.max(3, Math.min(8, S.scale * 1.2));
    for (const p of rec.p) {
      if (p[2] === 3) continue;              // off-grid: list only
      const [sx, sy] = tileToScreen(p[0], p[1]);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = KIND_COLOR[p[2]] || '#39ff85';
      ctx.fill();
      ctx.strokeStyle = '#06090f'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  let searchIdx = [];
  function buildSearchIndex() {
    searchIdx = Object.entries(S.mapData.items)
      .map(([pid, r]) => ({ pid, name: r.n || pid, count: r.p.length, cat: r.c }))
      .sort((a, b) => b.count - a.count);
    const inp = document.getElementById('mapsSearch');
    inp.value = ''; S.selectedProto = null;
    inp.oninput = () => suggest(inp.value.trim().toLowerCase());
    inp.onkeydown = e => {
      if (e.key === 'Enter') {
        const first = document.querySelector('#mapsSuggest [data-pid]');
        if (first) pick(first.dataset.pid);
      }
    };
  }
  function suggest(q) {
    const box = document.getElementById('mapsSuggest');
    if (!q) { box.hidden = true; return; }
    const hits = searchIdx.filter(e => e.name.toLowerCase().includes(q) || e.pid.toLowerCase().includes(q)).slice(0, 12);
    box.innerHTML = hits.map(h =>
      `<button data-pid="${h.pid}"><span>${h.name}</span><small>${h.pid} · ${h.count}</small></button>`).join('') ||
      '<div class="maps-nohit">not found on this map</div>';
    box.hidden = false;
    box.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => pick(b.dataset.pid));
  }
  function pick(pid) {
    S.selectedProto = pid;
    const rec = S.mapData.items[pid];
    document.getElementById('mapsSearch').value = rec.n || pid;
    document.getElementById('mapsSuggest').hidden = true;
    draw(); renderLocations(pid);
    if (typeof track === 'function') track('maps_search');
  }
  function nearestBeacon(x, y) {
    let best = null, bd = Infinity;
    for (const [name, bx, by] of S.mapData.beacons) {
      const d = (bx - x) ** 2 + (by - y) ** 2;
      if (d < bd) { bd = d; best = name; }
    }
    return best || 'no beacon';
  }
  const KIND_LABEL = { 0: 'on the floor', 1: 'in', 2: 'vend', 4: 'vend (contraband)' };
  function renderLocations(pid) {
    const el = document.getElementById('mapsLocations');
    if (!pid) { el.innerHTML = '<p class="maps-hint">Pick an item to see where it lives.</p>'; return; }
    const rec = S.mapData.items[pid];
    const groups = new Map();   // key -> [...positions]
    for (const p of rec.p) {
      const key = p[2] === 3 ? '☄ ' + (p[3] || 'off-grid') : nearestBeacon(p[0], p[1]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const rows = entries.map(([label, ps], gi) => {
      const bits = ps.map(p => {
        const badge = `<i class="maps-dot" style="background:${KIND_COLOR[p[2]] || '#8a99b3'}"></i>`;
        if (p[2] === 0) return badge + ' ' + KIND_LABEL[0];
        if (p[2] === 1) return badge + ` in ${p[3]}` + (p[4] ? (p[4] < 1 ? ` (~${Math.round(p[4] * 100)}%)` : ` ×${p[4]}`) : '');
        if (p[2] === 2 || p[2] === 4) return badge + ` ${KIND_LABEL[p[2]]} ${p[3]}` + (p[4] ? ` ×${p[4]}` : '');
        return badge + ' ' + label;
      });
      return `<button class="maps-loc" data-gi="${gi}"><b>${label}</b><span>${ps.length}</span><small>${[...new Set(bits)].join(' · ')}</small></button>`;
    });
    el.innerHTML = rows.join('');
    el.querySelectorAll('.maps-loc').forEach(btn => btn.onclick = () => {
      const ps = entries[+btn.dataset.gi][1].filter(p => p[2] !== 3);
      if (!ps.length) return;
      const cx = ps.reduce((s, p) => s + p[0], 0) / ps.length;
      const cy = ps.reduce((s, p) => s + p[1], 0) / ps.length;
      const c = document.getElementById('mapsCanvas');
      S.scale = Math.max(S.scale, 4);
      const b = S.mapData.bounds;
      S.ox = c.width / 2 - (Math.floor(cx) - b.minX + 0.5) * S.scale;
      S.oy = c.height / 2 - (b.maxY - Math.floor(cy) + 0.5) * S.scale;
      draw();
    });
  }
  window.addEventListener('resize', () => { if (S.img && document.getElementById('tab-maps').classList.contains('active')) zoomFit(); });

  function zoomAt(cx, cy, factor) {
    const ns = Math.min(Math.max(S.scale * factor, 0.2), 40);
    S.ox = cx - (cx - S.ox) * (ns / S.scale);
    S.oy = cy - (cy - S.oy) * (ns / S.scale);
    S.scale = ns; draw();
  }
  function setupCanvasNav() {
    const c = document.getElementById('mapsCanvas');
    const dpr = () => window.devicePixelRatio || 1;
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      zoomAt((e.clientX - r.left) * dpr(), (e.clientY - r.top) * dpr(), e.deltaY < 0 ? 1.25 : 0.8);
    }, { passive: false });
    let drag = null;
    c.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      if (!drag) return;
      S.ox += (e.clientX - drag.x) * dpr(); S.oy += (e.clientY - drag.y) * dpr();
      drag = { x: e.clientX, y: e.clientY }; draw();
    });
    c.addEventListener('pointerup', () => { drag = null; });
    document.getElementById('mapsZoomIn').onclick = () => zoomAt(c.width / 2, c.height / 2, 1.4);
    document.getElementById('mapsZoomOut').onclick = () => zoomAt(c.width / 2, c.height / 2, 0.7);
    document.getElementById('mapsZoomFit').onclick = zoomFit;
  }

  document.getElementById('btn-maps').addEventListener('click', init);
})();

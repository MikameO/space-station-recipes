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
  function drawBeacons() {}        // replaced in Task 12
  function drawMarkers() {}        // replaced in Task 12
  function buildSearchIndex() {}   // replaced in Task 12
  function renderLocations() {}    // replaced in Task 13
  window.addEventListener('resize', () => { if (S.img && document.getElementById('tab-maps').classList.contains('active')) zoomFit(); });

  document.getElementById('btn-maps').addEventListener('click', init);
})();

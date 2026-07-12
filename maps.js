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
  function buildMapSelect() { /* Task 10 */ }
  document.getElementById('btn-maps').addEventListener('click', init);
})();

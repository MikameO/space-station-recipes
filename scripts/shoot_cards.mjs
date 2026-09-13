// scripts/shoot_cards.mjs — shoots the card backgrounds for sections.json.
// Usage: node scripts/shoot_cards.mjs http://127.0.0.1:8090
// Needs Chrome installed (path below) and puppeteer-core: npx -y puppeteer-core is
// resolved automatically by `npx`, or `npm i -g puppeteer-core`.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://127.0.0.1:8090';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve('promo/cards-src');
fs.mkdirSync(OUT, { recursive: true });

// id → [url, prep]. prep runs in the page after the app is ready.
//
// Deviations from the plan's literal table (both required by how the app
// actually wires these controls — see the task report for detail):
//   - botany: '#tab=botany' is not in decodeURLState's tab whitelist (known
//     bug, not to be fixed here), so the hash silently no-ops and the app
//     stays on Reagents. Reach Botany the way a user does: click its tab
//     button directly.
//   - calculator: calcBtn's click handler reads a closure variable
//     (selectedCalcId) that is set only by clicking an autocomplete
//     suggestion item — not by reading calcTarget.value. Setting .value
//     directly (as in the plan's literal snippet) leaves selectedCalcId
//     null, so calcBtn's handler returns early and nothing renders.
//     Reproduce the real user flow instead: type (dispatch a real 'input'
//     event so the debounced suggestion search runs), click the top
//     suggestion (which is what sets selectedCalcId), then click calcBtn.
const SHOTS = {
  reagents:   ['/', null],
  calculator: ['/#tab=calculator', async () => {
    const input = document.getElementById('calcTarget');
    input.value = 'Bicaridine';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500)); // clear the 100ms suggestion debounce
    const item = document.querySelector('#calcSuggestions .suggestion-item');
    if (item) item.click();
    document.getElementById('calcBtn').click();
  }],
  medbay:     ['/#tab=medbay', null],
  botany:     ['/#tab=botany', () => { document.querySelector('.tab-btn[data-tab="botany"]').click(); }],
  maps:       ['/#tab=maps', null],
  ordnance:   ['/#tab=ordnance&src=stories_cm', null],
  forkdiff:   ['/#tab=forkdiff', null],
  library:    ['/library.html', null],
  antag:      ['/#antag=1&tab=antag', null],
  // tactical: a calibrated LV-624 with the mortar placed and a target picked — the
  // page keeps that in localStorage per planet, so it is seeded before load (below)
  // and the prep only zooms towards the target with wheel events, as a hand would.
  tactical:   ['/tactical.html#map=rmc14/lv624', async () => {
    const same = document.querySelector('.tac-banner [data-action="sameRound"]');   // seeded state counts as a reload
    if (same) { same.click(); await new Promise(r => setTimeout(r, 100)); }
    const c = document.getElementById('tacCanvas'), r = c.getBoundingClientRect();
    const b = { minX: -87, maxX: 87, minY: -109, maxY: 112 };
    const w = c.clientWidth, h = c.clientHeight, tw = b.maxX - b.minX + 1, th = b.maxY - b.minY + 1;
    const s = Math.max(0.5, Math.min(64, Math.min(w / tw, h / th) * 0.96));
    const ox = (w - tw * s) / 2, oy = (h - th * s) / 2;
    const x = r.left + ox + (45 + 0.5 - b.minX) * s, y = r.top + oy + (b.maxY + 1 - (-70 + 0.5)) * s;
    for (let i = 0; i < 6; i++) c.dispatchEvent(new WheelEvent('wheel', { clientX: x, clientY: y, deltaY: -100, bubbles: true, cancelable: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: x + 40, clientY: y - 30, bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }],
};

// Per-shot localStorage seeds, applied before the page loads.
const SEEDS = {
  tactical: {
    'chemdb-tactical:rmc14/lv624': JSON.stringify({ v: 1,
      calibration: { tile: [31, -78], reading: [243, -226], offset: [212, -148], at: Date.now(), check: { tile: [29, -79], expect: [241, -227], result: 'match', tried: [] } },
      mortar: { tile: [20, -98], mode: 'coordinates' }, target: [45, -70], shots: [], markers: [] }),
  },
};

// Optional ids after the base URL shoot only those cards (the others keep their files).
const ONLY = new Set(process.argv.slice(3));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1800, height: 915 } });
try {
  for (const [id, [url, prep]] of Object.entries(SHOTS)) {
    if (ONLY.size && !ONLY.has(id)) continue;
    const page = await browser.newPage();
    const seed = SEEDS[id] || {};
    await page.evaluateOnNewDocument((entries) => {
      for (const [k, v] of entries) localStorage.setItem(k, v);
    }, Object.entries(seed));
    // Tutorial auto-starts on a fresh profile; the home menu must not auto-show either.
    // ss14_pin_callout_seen is a third one found by visual review: setupPinCallout()
    // (app.js) shows a "Pin over your game" discovery bubble to every visitor, on
    // every tab, until dismissed once — not covered by the plan's original two keys,
    // and it was overlapping the top-right corner of every shot.
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('ss14_tutorial_seen', '1');
      localStorage.setItem('chemdb-home', JSON.stringify({ seen: {}, autoShow: false, lastAutoShown: null, introShown: true }));
      localStorage.setItem('ss14_pin_callout_seen', '1');
    });
    await page.goto(BASE + url, { waitUntil: 'networkidle2', timeout: 60000 });
    if (url.startsWith('/library')) await page.waitForSelector('#libList');
    else if (url.startsWith('/tactical')) await page.waitForSelector('#tacPanel .tac-offset', { timeout: 60000 });
    else await page.waitForSelector('#loadingOverlay.hidden', { timeout: 60000 });
    if (prep) { await page.evaluate(prep); }
    await new Promise(r => setTimeout(r, 1500)); // let the tab render / map paint
    const file = path.join(OUT, id + '.png');
    await page.screenshot({ path: file, type: 'png' });
    console.log('shot', id, '->', path.relative(process.cwd(), file));
    await page.close();
  }
} finally {
  await browser.close();
}

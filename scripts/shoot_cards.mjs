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
  trees:      ['/#tab=trees', () => { window.restoreTreeSession({ treeTarget: 'Bicaridine', treeAmount: '30' }); }],
  botany:     ['/#tab=botany', () => { document.querySelector('.tab-btn[data-tab="botany"]').click(); }],
  maps:       ['/#tab=maps', null],
  ordnance:   ['/#tab=ordnance&src=stories_cm', null],
  forkdiff:   ['/#tab=forkdiff', null],
  library:    ['/library.html', null],
  antag:      ['/#antag=1&tab=antag', null],
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1800, height: 915 } });
try {
  for (const [id, [url, prep]] of Object.entries(SHOTS)) {
    const page = await browser.newPage();
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

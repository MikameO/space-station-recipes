// scripts/test_room_seam.js — the seam between Series T and the officers' room stays small.
// Run: node scripts/test_room_seam.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('tactical.html');
const js = read('tactical/tactical.js');
const mv = read('tactical/mapview.js');
const count = (s, needle) => s.split(needle).length - 1;

// Scripts: logic before the client, the client before the panel, all before tactical.js.
const order = ['tactical/room-logic.js', 'tactical/room.js', 'tactical/room-ui.js', 'tactical/room-requests.js', 'tactical/tactical.js'];
const at = order.map(src => html.indexOf('src="' + src));
at.forEach((i, k) => assert.ok(i > 0, order[k] + ' is loaded'));
for (let k = 1; k < at.length; k++) assert.ok(at[k - 1] < at[k], order[k - 1] + ' loads before ' + order[k]);
assert.ok(html.includes('href="tactical/room.css?v='), 'room.css is linked');

// Room elements exist, and the room panel is a sibling after the empty #tacPanel.
['tacRoom', 'tacRoomToggle', 'tacRoomChips', 'tacRoomStrip', 'tacRoomShelf', 'tacRoomDraw'].forEach(id =>
  assert.strictEqual(count(html, 'id="' + id + '"'), 1, id));
const panelTag = '<aside class="tac-panel" id="tacPanel" aria-label="Tactical panel"></aside>';
assert.ok(html.includes(panelTag), '#tacPanel is untouched and empty');
assert.ok(html.indexOf('id="tacRoom"') > html.indexOf(panelTag), '#tacRoom sits after #tacPanel');

// tactical.js: one attach, one consumePick, five notifications, nothing in renderPanel.
assert.strictEqual(count(js, 'window.TacRoom.attach('), 1);
assert.strictEqual(count(js, 'window.TacRoom.consumePick(tile)'), 1);
const events = [...js.matchAll(/roomNotify\('(\w+)'/g)].map(m => m[1]).sort();
assert.deepStrictEqual(events, ['delete', 'marker', 'shape', 'shot', 'target']);
const renderPanel = js.slice(js.indexOf('function renderPanel()'), js.indexOf('function renderAll()'));
assert.ok(renderPanel.length > 0 && !/TacRoom|roomNotify/.test(renderPanel), 'renderPanel knows nothing of the room');

// The end of a {…} block that starts at or after `from` (quotes and // comments skipped).
function blockEnd(src, from) {
  let depth = 0, quote = null;
  for (let i = src.indexOf('{', from); i >= 0 && i < src.length; i++) {
    const ch = src[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i + 1;
  }
  return -1;
}
const guardBlocks = [];
for (let at = js.indexOf('if (window.TacRoom) {'); at >= 0; at = js.indexOf('if (window.TacRoom) {', at + 1)) {
  guardBlocks.push({ start: at, end: blockEnd(js, at) });
}

// Every seam call goes through window.TacRoom and is guarded: inside if (window.TacRoom) { … } or behind window.TacRoom &&.
const seamCalls = [...js.matchAll(/TacRoom\.(\w+)\(/g)];
assert.deepStrictEqual([...new Set(seamCalls.map(m => m[1]))].sort(), ['attach', 'consumePick', 'notify']);
seamCalls.forEach(m => {
  const i = m.index;
  const line = js.slice(js.lastIndexOf('\n', i) + 1, i);
  assert.strictEqual(js.slice(i - 7, i), 'window.', 'TacRoom.' + m[1] + ' is reached through window');
  const inBlock = guardBlocks.some(b => b.start < i && i < b.end);
  assert.ok(inBlock || /if \(window\.TacRoom && window\.$/.test(line), 'TacRoom.' + m[1] + ' is guarded by window.TacRoom');
});

// attach runs inside try/catch (a throwing room never stops applyStaticText/loadIndex) and hands over every hook.
const attachAt = js.indexOf('window.TacRoom.attach(');
const attachBlock = guardBlocks.find(b => b.start < attachAt && attachAt < b.end);
assert.ok(attachBlock, 'attach sits inside if (window.TacRoom) { … }');
const attachText = js.slice(attachBlock.start, attachBlock.end);
assert.ok(/try\s*\{\s*window\.TacRoom\.attach\(/.test(attachText), 'attach runs inside try');
assert.ok(/\}\s*catch\s*\(\s*\w+\s*\)/.test(attachText), 'attach failures are caught');
['view', 'getContext', 'takeTarget', 'takePosition', 'fire', 'redraw'].forEach(h =>
  assert.ok(new RegExp('\\b' + h + ':\\s').test(attachText), 'attach hands over ' + h));
assert.ok(js.indexOf('applyStaticText();', attachBlock.end) > 0 && js.indexOf('loadIndex();', attachBlock.end) > 0, 'the map starts after attach');

// roomNotify hands the room a copy and catches what it throws.
const notifyAt = js.indexOf('function roomNotify(');
const notifyText = js.slice(notifyAt, blockEnd(js, notifyAt));
assert.ok(/JSON\.parse\(JSON\.stringify\(/.test(notifyText), 'roomNotify passes a copy');
assert.ok(/try\s*\{/.test(notifyText) && /catch\s*\(/.test(notifyText), 'roomNotify catches');

// Executed: the attach block and the two start lines of tactical.js, with a throwing room, with no room, and the hooks it hands over.
const startBlock = js.slice(attachBlock.start, js.indexOf('loadIndex();', attachBlock.end) + 'loadIndex();'.length);
const seamNames = ['window', 'console', 'view', 'state', 'calibration', 'mortar', 'currentShell', 'hitRadius', 'LANG', 'weapon',
  'savePrefs', 'setTarget', 'setMortar', 'recordShot', 'lastShot', 'renderAll', 'applyStaticText', 'loadIndex'];
function runStart(TacRoom) {
  const calls = [];
  const win = { TacRoom, console: { warn: () => calls.push('warn') } };
  new Function(...seamNames, startBlock)(win, win.console, {}, { prefs: {} }, () => null, () => null, () => null, () => 0, 'ru',
    () => 'mortar', () => calls.push('savePrefs'), t => calls.push('setTarget ' + t), t => calls.push('setMortar ' + t),
    () => calls.push('recordShot'), () => null, () => calls.push('renderAll'),
    () => calls.push('applyStaticText'), () => calls.push('loadIndex'));
  return calls;
}
assert.deepStrictEqual(runStart({ attach() { throw new Error('room'); } }), ['warn', 'applyStaticText', 'loadIndex'], 'a throwing attach never stops the map');
assert.deepStrictEqual(runStart(undefined), ['applyStaticText', 'loadIndex'], 'without room scripts the map starts as before');
let handed = null;
const started = runStart({ attach(h) { handed = h; } });
assert.deepStrictEqual(started, ['applyStaticText', 'loadIndex']);
handed.takePosition([3, 4]);
handed.takeTarget([5, 6]);
assert.ok(started.includes('setMortar 3,4') && started.includes('setTarget 5,6'), 'takePosition and takeTarget reach the Fire panel');

// Executed: roomNotify hands over a copy and swallows what the room throws.
const roomNotify = new Function('window', 'console', notifyText + '\nreturn roomNotify;')(
  { TacRoom: { notify(e, p) { p.tile[0] = 99; throw new Error('room'); } }, console: { warn() {} } }, { warn() {} });
const shotPayload = { id: 's1', tile: [1, 2] };
assert.doesNotThrow(() => roomNotify('shot', shotPayload), 'a throwing room stays out of Series T');
assert.deepStrictEqual(shotPayload.tile, [1, 2], 'the room changed a copy, not Series T data');

// Room scripts are deferred; the demo fixture is loaded on demand only.
order.slice(0, 4).forEach(src => {
  const tag = (html.match(new RegExp('<script[^>]*src="' + src.replace(/\./g, '\\.') + '[^"]*"[^>]*>')) || [''])[0];
  assert.ok(/\sdefer[\s>=]/.test(tag), src + ' has defer');
});
assert.ok(!html.includes('room-fixtures.js'), 'room-fixtures.js is not on the page');

// MapView: layers are created once and drawn every frame — the survive-redraw contract.
assert.strictEqual((mv.match(/this\.layers\s*=/g) || []).length, 1, 'layers assigned only in the constructor');
assert.ok(/for \(var i = 0; i < this\.layers\.length; i\+\+\)/.test(mv), 'draw() walks every layer each frame');
assert.ok(/MapView\.prototype\.addLayer = function \(fn\) \{ this\.layers\.push\(fn\)/.test(mv), 'addLayer only appends');

console.log('OK seam');

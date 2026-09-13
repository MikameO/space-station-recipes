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
const order = ['tactical/room-logic.js', 'tactical/room.js', 'tactical/room-ui.js', 'tactical/tactical.js'];
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

// MapView: layers are created once and drawn every frame — the survive-redraw contract.
assert.strictEqual((mv.match(/this\.layers\s*=/g) || []).length, 1, 'layers assigned only in the constructor');
assert.ok(/for \(var i = 0; i < this\.layers\.length; i\+\+\)/.test(mv), 'draw() walks every layer each frame');
assert.ok(/MapView\.prototype\.addLayer = function \(fn\) \{ this\.layers\.push\(fn\)/.test(mv), 'addLayer only appends');

console.log('OK seam');

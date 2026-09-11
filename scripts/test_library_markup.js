// Renders SS14 paper markup through library.js outside the browser and checks
// the cases the document library relies on. Run: node scripts/test_library_markup.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'library.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const render = ctx.window.LibraryMarkup.render;

const cases = [
  ['plain text is escaped', 'a <b> & "q"', 'a &lt;b&gt; &amp; &quot;q&quot;'],
  ['bold', 'a [bold]b[/bold] c', 'a <span class="lib-b">b</span> c'],
  ['italic + bolditalic + mono', '[italic]i[/italic][bolditalic]bi[/bolditalic][mono]m[/mono]',
    '<span class="lib-i">i</span><span class="lib-bi">bi</span><span class="lib-mono">m</span>'],
  ['hex colour', '[color=#1b67a5]x[/color]', '<span style="color:#1b67a5">x</span>'],
  ['named colour', '[color=CornflowerBlue]x[/color]', '<span style="color:CornflowerBlue">x</span>'],
  ['bad colour stays text', '[color=url(x)]x[/color]', '[color=url(x)]x[/color]'],
  ['heading levels', '[head=2]T[/head][head]U[/head]', '<span class="lib-h2">T</span><span class="lib-h1">U</span>'],
  ['heading out of range stays text', '[head=9]x[/head]', '[head=9]x[/head]'],
  ['bullet', '[bullet]item', '• item'],
  ['font tag is transparent', '[font=Fancy]x[/font]', '<span>x</span>'],
  ['unknown tag stays text', '[unknown]x[/unknown]', '[unknown]x[/unknown]'],
  ['stray close stays text', 'x[/bold]', 'x[/bold]'],
  ['unclosed tag is closed at the end', '[bold]open', '<span class="lib-b">open</span>'],
  ['misnested close keeps both styles', '[color=#AAAAAA][italic] x[/color][/italic]',
    '<span style="color:#AAAAAA"><span class="lib-i"> x</span></span><span class="lib-i"></span>'],
  ['newlines and spaces survive', '  a\n   b', '  a\n   b'],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  const got = render(input);
  if (got === expected) { console.log('ok   ' + name); continue; }
  failed++;
  console.log('FAIL ' + name + '\n  expected: ' + JSON.stringify(expected) + '\n  got:      ' + JSON.stringify(got));
}

// The real document must render without leaving any tag visible as text.
const doc = fs.readFileSync(path.join(__dirname, '..', 'library', 'rucm-staff-officer-doctrine.paper.txt'), 'utf8');
const html = render(doc);
const leftover = html.match(/\[\/?(color|bold|italic|head)[^\]]*\]/g);
if (leftover) { failed++; console.log('FAIL doctrine: tags left as text: ' + leftover.slice(0, 5).join(' ')); }
else console.log('ok   doctrine renders every tag (' + doc.length + ' chars)');

console.log(failed ? failed + ' failing' : 'all passed');
process.exit(failed ? 1 : 0);

# UX-R2 — Round 2, кросс-проверка сверенного UX-списка (AUDIT_part1_ux.md)

Агент: фасилитатор UX cross-challenge. Дата 2026-09-11. Цель ре-тестов: `http://localhost:8090/` (идентично prod), собственная вкладка `tab-1`, уникальный `?fresh=` на каждый переход, `ss14_tutorial_seen=1`, видимость только через `getComputedStyle`/геометрию. Репозиторий — read-only, цитаты `file:line` из `D:/Space Station Recipes`.
Финальная очистка выполнена: `localStorage.clear()` + `ss14_tutorial_seen=1`, `resize_window preset desktop`, `tabs_close tab-1`. Вкладка `seed` не трогалась.

## Round 2 — challenges

**CHALLENGE: A36** (U1-039, U3-004, ср. T4 10.7) — строка помечена FUNCTIONAL «таб виден на всех форках с плашкой „переключить“ (по дизайну)». U1 и U3 проверили только *чужой* форк. На форке-владельце плашка не прячется: `ordnance.js:2288` делает `note.hidden = true`, а `style.css:3107` задаёт `.ord-fork-note { display: flex }` — ровно ловушка «[hidden] проигрывает авторскому display» (инвариант №5 в MANIFEST). — **Что проверил:** `#tab=ordnance&src=stories_cm` на чистой загрузке → `hidden=true`, `display:flex`, пустой бокс высотой 16 px; затем переключение на vanilla (плашка 42 px, текст верный) и обратно на stories_cm → `hidden=true`, **`display:flex`, height 42 px, текст «These numbers come from Space Stories — Marine Corps Core. Switch the app to it» и живая кнопка, переключающая на форк, который уже выбран**. — **Verdict: split** — A36 оставить для чужого форка, добавить PARTIAL-строку **P2**: «Ordnance fork note не скрывается на своём форке (`[hidden]` vs `display:flex`), кнопка-пустышка; фикс — `.ord-fork-note[hidden]{display:none}`».

**CHALLENGE: A49** (U2-055 UNCERTAIN, U4-025 OK/MEDIUM) — строка сведена в FUNCTIONAL, хотя оба источника прямо писали, что конечное состояние transition не наблюдаемо. — **Что проверил:** снял transition на живой странице (`panel.style.transition='none'`) при layout-viewport 375. Положительная половина подтвердилась: панель действительно доезжает до `right: 0px`, `visibility:visible` — неопределённость U2-055 снята. Но: **computed `width: 515px`, rect 0…515, кнопка закрытия 44×44 на x=449 — за экраном**, `body{overflow-x:hidden}` и `scrollX` остаётся 0 после `scrollTo(400,0)`. Причина — цепочка от B38: принудительный `overflow:hidden` на `.header-right` схлопывает `documentElement.scrollWidth` 515→375 **и одновременно** ширину фиксированной панели 515→375, кнопка возвращается на x=309. Оговорка: `innerWidth=515` при `clientWidth=375` и `visualViewport=375` — задокументированный артефакт панели (U4 §3), поэтому расширяется ли ICB так же на реальном телефоне, не проверено. — **Verdict: regrade to PARTIAL / UNCERTAIN, MEDIUM, P2** + явная перекрёстная ссылка на B38/D14 (второе следствие того же корня).

**CHALLENGE: B56** (U2-042, T4 3.1) — сведение потеряло приоритет. Step 0 самого оркестратора разрешает «i18n aria-labels» как **PARTIAL P1 [2/2, static+runtime]**, но в списке эта находка растворена в B56 «Язык частей» **P2**, где речь про `lang` на частях и нелокализованный `title` — это другая находка (U2-043). — **Что проверил:** `?lang=ru#tab=ordnance&src=stories_cm` → `documentElement.lang='ru'`, видимые подписи русские («КОРПУС»), при этом **24 значения `aria-label`/`title` внутри `#tab-ordnance` — латиница** (`ordAdd :: Add a reagent`, `ordReqObjective :: Objective`, `ordCostBase :: Cost basis`, `ord-req-metric :: Required metric`, `ordChartMode :: Chart mode`, `ordSweep :: Swept reagent`, …). — **Verdict: split** — отдельная строка **P1** «RU: 24–28 доступных имён остаются английскими (i18n.js уже гоняет `aria-label`/`title` через ATTRS, нужны только словарные записи)», B56 остаётся P2 про `lang` на частях.

**CHALLENGE: C17** (U3-010) + **пропавший U3-008** — C17 верна, но покрывает половину класса дефектов: whitelists энкодера и декодера расходятся дважды. `app.js:3073` `validTabs` — 8 значений при 9 `data-tab`; `app.js:3110` `validSort = ['name-asc','name-desc','category','used-in','antag-desc']` — без `steps-asc`, который Share пишет (`app.js:3043`, опция есть в `index.html:209`). Step 0 разрешил U3-008 как PARTIAL P2 [3/3], но в UX-списке (B59 «Deep-links — граничные») его нет. — **Что проверил:** `#tab=botany&sort=steps-asc` → видимая панель `tab-reagents`, `sortSelect.value='name-asc'`, текст «Name A→Z». — **Verdict: merge with C17** — переформулировать: «encode/decode whitelists рассинхронизированы: `tab=botany` и `sort=steps-asc` отбрасываются; фикс — строить оба списка из DOM (`.tab-btn`, `#sortSelect option`)».

**CHALLENGE: B31** (U4-001, U4-002, U4-013) — цифры в строке (LCP 11.3 с, старт data.json 14.0 с, конец 24.4 с, «нет preload») поданы как измеренный факт prod, но методология U4 (§4) фиксирует: на машине работает the local antivirus c HTTPS-MITM, который **сам по себе добавляет render-blocking запись в 8.6 с** и пересобирает index.html. В трассе `fonts.googleapis.com/css2` не *запрашивается* до **8 604 мс** — та же 8.6 с. То есть и LCP, и «savings −4 299 мс» посчитаны на загрязнённой трассе. — **Что проверил:** структурные утверждения подтверждаются кодом и стоят независимо от трассы: `style.css:13` — `@import url('https://fonts.googleapis.com/css2?...')` (глубина 3); `grep -n "preload\|preconnect\|dns-prefetch" index.html` → **пусто**; `app.js:3346` вешает `init` на DOMContentLoaded, а `index.html:760-762` грузит `tutorial.js`/`maps.js`/`ordnance.js` с `defer`. — **Verdict: keep P1, reword** — «порядок величины: десятки секунд до первой сетки на 3G; абсолютные значения трассы загрязнены локальным AV-прокси, требуется перезамер на чистой машине». Причины (цепочка `@import`, отсутствие preload, data.json за DCL) — code_verified, не оспариваются.

**CHALLENGE: C21** (U3-041, T2 D24) — BROKEN P2. Маска с `metric:'__proto__'` попадает в `chemdb-ord-masks` только если её туда записали руками (devtools) — приложение такой ключ не создаёт, XSS на сайте нет (U3-016: 9 полей + `#q=`, 0 сработавших payload'ов), localStorage не кросс-пользовательский. Ни одна из P1/P2-квалификаций рубрики («когорта заблокирована», «неверное число в „проверенном“ калькуляторе», «класс тихих отказов, который уже сработал») не выполняется. То же относится к CSS-инъекции цвета маски внутри B77 (U3-042 сам помечен «self-inflicted»). — **Verdict: regrade P2 → P3** (классификация BROKEN остаётся; фикс — одна строка `Object.hasOwn` в `ordnance.js:1147`). Замечание: `#r=__proto__` и `#tab=maps&item=__proto__` в B59 **остаются P2** — они доставляются чужой ссылкой, в отличие от масок.

**CHALLENGE: B62 / C19** (U3-032, T2 D20) — одна и та же гонка выбора карты внесена дважды: как B62 (PARTIAL, P1) и как C19 (BROKEN, P1). Строка попадает в две взаимоисключающие таблицы классификации и удваивает счётчики. — **Что проверил:** обе строки ссылаются на `maps.js:71-105` и на одно и то же воспроизведение U3. — **Verdict: merge** — оставить C19 (BROKEN P1), B62 заменить указателем «см. C19» либо удалить.

**CHALLENGE: A46** (U2-017 vs U2-018) — формулировка «фокус-кольца 14.3:1 **везде** (переопределяют `outline:none`)» опровергается собственным источником: `style.css:1116-1119` (`.hint-chip:hover, .hint-chip:focus-visible { outline: none }`) и `style.css:2764-2769` (`.empty-state-chip`) убивают кольцо именно на `:focus-visible`; это же зафиксировано в B76 как P3. — **Verdict: reword** — «…кроме `.hint-chip` и `.empty-state-chip`, где `outline:none` стоит и на `:focus-visible` (см. B76)».

**CHALLENGE: A42** (U3-002/005/007/015) — строка называется «Deep-links» и стоит в таблице ПОЛНОСТЬЮ ФУНКЦИОНАЛЬНО, при том что два P1-BROKEN (C16, C17) и один P2 (B59) — тоже deep-links. Проверенное свойство — устойчивость к мусорным значениям, а не работоспособность deep-link'ов. — **Verdict: reword** — «Deep-links: устойчивость к мусорным и враждебным значениям (обработка корректных значений — см. C16/C17/B59)».

**CHALLENGE: A31** (U1-026) — сведение превратило оговорку в достоинство: «галочки переживают смену количества и перезагрузку» подано как плюс, тогда как U1-026 отдельно отметил семантическую проблему — галочка, поставленная на 10u кислорода, остаётся отмеченной, когда требование стало 15u. — **Verdict: keep FUNCTIONAL + добавить оговорку** (или строка P3 в B78): «отметки не сбрасываются и не помечаются при росте требуемого количества».

**CHALLENGE: B50 / D12** (U1-051, U1-053) — приоритет P1 у «нет обратного пути из companion» опирается на сценарий «PiP-кнопка заводит в companion», а он — артефакт харнесса: U1 сам пишет, что в панели `requestWindow()` не открыл окно и вкладка ушла в `?mode=companion`; в настоящем Chrome/Edge Document PiP открывает отдельное окно, а fallback — `window.open(..., 'popup=yes')`, то есть отдельное окно, а не замена текущей страницы. Остаётся реальная, но узкая дыра: `window.open` может вернуть `null` при блокировке попапов, и это не проверяется (`app.js:3258-3271`, code_verified). — **Verdict: regrade P1 → P2** для B50/D12 (обратная ссылка + проверка `null` с тостом), с пометкой «нужен прогон в реальном Chrome».

**CHALLENGE: B53** (U4-024) — «5 из 9 табов начинаются за экраном» фактически неверно. — **Что проверил:** при 375 px `left` табов: Reagents 16, Calculator 102, What Heals? 202, **Craft Trees 307**, Botany 410, Maps 481, Ordnance 538, Fork Diff 626; `.tab-bar` 728/375. То есть **4 таба начинаются за экраном, пятый (Craft Trees) обрезан справа**. — **Verdict: reword** (сам дефект — отсутствие fade/стрелки — подтверждён, P2 остаётся).

**CHALLENGE (усиление, не понижение): B32** (U4-003, U4-010, T2 F3) — строка верна и на второй машине/источнике. — **Что проверил:** localhost:8090, desktop без throttling, EN, Source=All: первый `steps-asc` = **2 737 мс** заблокированного потока, тёплый = 50 мс, переключение форка на Goob **при активном steps-asc = 708 мс** (U4 мерил 74.8 мс при name-asc — то самое взаимное усиление), повторная сортировка после смены форка = 270 мс. — **Verdict: keep P1, HIGH**; в текст добавить, что стоимость смены форка зависит от активной сортировки (×10 на десктопе).

## Confirmations

Согласен без изменений (проверял по сырым отчётам, а где указано — ещё и в рантайме): **A25, A26, A27, A28, A29, A30, A32, A33, A34, A35, A37, A38, A39, A40, A41, A43, A44, A45, A47, A48, A50, A51** (с оговорками к A31/A36/A42/A46/A49 выше); **B33, B34, B35, B36, B37, B38, B39, B40, B41, B42, B43, B44, B45, B46, B47, B48, B49, B51, B52, B54, B55, B57, B58, B60, B61, B63, B64, B65, B66, B67, B68, B69, B70, B71, B72, B73, B74, B75, B76, B77, B78**; **C16, C18, C20**; **D11, D13, D14, D15, D16, D17, D18**.
Отдельно перепроверены в рантайме и подтверждены: **C16** (`#q=bicaridine` → поле заполнено, «1387 results», первая карточка 24 Volt Energy), **C17** (`#tab=botany` → Reagents), **B47** (после `closeDetail()` следующий реагент получает «← Back» с `title="Back to bicaridine"`; `app.js:1307-1309` действительно чистит только `detailHistory`, `selectedReagentId` выставляется на `app.js:1201`), **B38** (505/355, `flex-wrap:nowrap`, `helpBtn 386-430`, `shareBtn 436-472`, `pipBtn 478-515` за экраном, `langToggle 345-380` обрезан, `scrollX=0` после панорамирования), **B36** (единственный скроллер — активная панель `569/10451`, `body{height:812px; overflow:hidden}`, `grep -c "dvh\|svh" style.css` → **0**).

## New / dropped findings

1. **NEW-1 — Ordnance fork note не скрывается на своём форке** (`ordnance.js:2288` + `style.css:3107`, runtime_verified). Подробности в CHALLENGE A36. **PARTIAL P2**, HIGH. Подтверждает T4 10.7 со стороны UX — раньше строки консенсуса не было, а UX-список утверждал обратное.
2. **NEW-2 — Мобильная панель деталей шире вьюпорта, крестик за экраном** (runtime_verified, MEDIUM — возможен вклад артефакта эмуляции). При 375 px `position:fixed` панель считает `width:515px`, `.detail-close` 44×44 на x=449; следствие переполнения `.header-right`. Ещё один аргумент, что B38/D14 — корневой дефект, а не косметика шапки. **PARTIAL P2**, требует проверки на живом телефоне.
3. **DROPPED-1 — U3-008 `sort=steps-asc` выпадает из decode-whitelist** (`app.js:3110` vs `app.js:3043`). Разрешён в Step 0 как P2 [3/3], но ни в одной UX-строке не оказался. Сливать с C17.
4. **DROPPED-2 — U2-042: 24–28 английских доступных имён в RU-режиме** понижен с P1 (Step 0) до растворения в B56 (P2). Ре-проверено в рантайме (24 значения только в `#tab-ordnance`).
5. **DROPPED-3 — U4-023: дублирующий проход `filterReagents` через 1 400 мс после каждого устоявшегося запроса** ради счётчика для цели Metrika `search_used`/`search_zero` (`app.js:708-724`). Полное сканирование корпуса, которое можно заменить сохранённым `lastResultCount`. **P3**, в списке отсутствует.
6. **DROPPED-4 — U4-026: спрайты `app.js:2938, 2958` без `loading`/`decoding`/`width`/`height`** (в галерее ксеносов `loading="lazy"` есть, здесь нет). Вместе с замечанием U4-012: если такие `<img>` когда-нибудь окажутся выше сгиба, идеальный CLS 0.00 (A50) регрессирует. **P3**.
7. **DROPPED-5 — U3-012: id предметов в map-deep-link чувствительны к регистру** (`item=crowbar` ≠ `Crowbar`) — ссылка молча игнорируется. Тот же класс, что C16/C17 (ссылка обещает состояние, которого не будет). **P3**.
8. **DROPPED-6 — U3-024: пустое состояние «0 результатов из-за фильтров» не предлагает сбросить фильтры** (единственное действие — «Open tutorial»), поэтому формулировка A45 «все с текстом и **действием**» слегка переоценивает. **P3**.
9. **COVERAGE-CHECK — U3-001 (404)**: в UX-таблицах строки нет (Step 0 разрешил как MISSING **P2** вместе с T3 1.8). Нужно убедиться, что она уехала в техническую часть, иначе находка потеряна.

## Re-tests performed

| # | Row / finding | What was re-run | Result |
|---|---|---|---|
| 1 | C16 (U3-009) | `?fresh=r2-q1#tab=reagents&q=bicaridine`, чтение `#searchInput`, `#resultCount`, сетки | Подтверждено: поле «bicaridine», счётчик «1387 results», 80 карточек, первая — 24 Volt Energy |
| 2 | C17 (U3-010) + DROPPED-1 (U3-008) | `?fresh=r2-q2#tab=botany&sort=steps-asc` | Подтверждено дважды: видимая панель `tab-reagents`; `sortSelect` = `name-asc` («Name A→Z») |
| 3 | B47 (U1-013) | `openDetail(Bicaridine)` → `closeDetail()` → `openDetail(CMInaprovaline)`, чтение `.detail-back` | Подтверждено: «← Back», `title="Back to bicaridine"`; у первого реагента кнопки Back нет (корректно) |
| 4 | A36 (U1-039 / T4 10.7) | `#tab=ordnance&src=stories_cm`; затем vanilla → stories_cm, `getComputedStyle(#ordForkNote)` | Дефект: `hidden=true`, `display:flex`, height 42 px, текст и кнопка «Switch the app to it» на уже выбранном форке |
| 5 | B56 / U2-042 | `?lang=ru#tab=ordnance&src=stories_cm`, скан `[aria-label],[title]` на латиницу | 24 английских доступных имени при `lang="ru"` и русских видимых подписях |
| 6 | B32 (U4-003, U4-010) | localhost, desktop, EN, Source=All: `steps-asc` холодный/тёплый, переключение форка при активном `steps-asc` | 2 737 мс / 50 мс / 708 мс (форк) / 270 мс (повторная сортировка) — порядок величины U4 подтверждён |
| 7 | B38 + A49 (U4-004, U2-055) | 375×812: геометрия `.header-right` и 7 контролов, `scrollTo(400,0)`; панель деталей с `transition:none`; эксперимент с `overflow:hidden` на `.header-right` | Шапка: 505/355, три кнопки за экраном, `scrollX=0`. Панель: `right:0` (доезжает), но `width:515px`, крестик на x=449; при погашенном переполнении шапки — 375 px и x=309 |
| 8 | B36 + B53 (U4-009, U4-024) | 375×812: инвентарь скроллеров, `body` height/overflow, геометрия таб-бара и 9 табов | Единственный скроллер — активная панель (569/10451), `body{height:812px;overflow:hidden}`, `dvh/svh` в CSS — 0 совпадений; таб-бар 728/375, за экраном начинаются 4 таба, пятый обрезан |

## Reclassification deltas for the reconciled list

| Row id | Source ids | Was | Should be | Reason |
|---|---|---|---|---|
| A36 | U1-039, U3-004, T4 10.7 | FUNCTIONAL | **SPLIT**: A36 (FUNCTIONAL, чужой форк) + новая PARTIAL **P2** | Плашка не скрывается на stories_cm (`[hidden]` vs `display:flex`), кнопка-пустышка — runtime |
| A49 | U2-055, U4-025 | FUNCTIONAL, MEDIUM | **PARTIAL / UNCERTAIN, MEDIUM, P2** | Панель доезжает, но при 375 px шириной 515 px, крестик за экраном; следствие B38 |
| A46 | U2-017, U2-018 | FUNCTIONAL («кольца везде») | FUNCTIONAL с исключениями (reword) | `outline:none` на `:focus-visible` у `.hint-chip` и `.empty-state-chip` |
| A42 | U3-002/005/007/015 | FUNCTIONAL «Deep-links» | reword: «устойчивость к мусорным значениям» | Корректные deep-link'и сломаны (C16/C17) |
| A31 | U1-026 | FUNCTIONAL | FUNCTIONAL + оговорка (P3 в B78) | Отметки не сбрасываются при росте требуемого количества |
| B31 | U4-001/002/013 | PARTIAL P1 (точные числа) | PARTIAL **P1**, числа → «порядок величины, трасса загрязнена AV-прокси» | the local antivirus MITM даёт свою render-blocking запись 8.6 с; причины code_verified |
| B50 / D12 | U1-051, U1-053 | P1 (MISSING back) | **P2** | Сценарий попадания в companion — артефакт панели; реальный риск — непроверенный `window.open === null` |
| B53 | U4-024 | «5 из 9 табов за экраном» | «4 начинаются за экраном, 5-й обрезан» (P2 остаётся) | Измерено при 375 px |
| B56 | U2-042, U2-043, T4 3.1 | P2 (одна строка) | **SPLIT**: RU aria-labels **P1** + `lang` на частях P2 | Step 0 сам разрешил aria-labels как P1 [2/2] |
| B62 | U3-032, T2 D20 | PARTIAL P1 | merge → **C19** (BROKEN P1) | Одна находка в двух таблицах классификации |
| C17 | U3-010 (+ U3-008) | BROKEN P1 (только botany) | BROKEN P1, расширить на `sort=steps-asc` | Оба whitelist'а рассинхронизированы с DOM |
| C21 | U3-041, T2 D24 | BROKEN P2 | BROKEN **P3** | Достижимо только ручной правкой localStorage; XSS нет, кросс-вектора нет |
| — | U4-023 | отсутствует | добавить PARTIAL **P3** | Дублирующий полный проход поиска ради цели Metrika |
| — | U4-026 | отсутствует | добавить PARTIAL **P3** | Спрайты без `loading`/размеров — риск для CLS 0.00 |
| — | U3-012 | отсутствует | добавить PARTIAL **P3** | Регистрозависимые item-deep-link'и молча игнорируются |

## Runtime UX coverage table

| Page/flow | Tested by | Status | Row ids |
|---|---|---|---|
| Reagents grid + search | U1, U2, U3, U4 | PARTIAL (функционально ок, перф и релевантность — нет) | A27, A45, B32, B33, B64 |
| Detail panel | U1, U2 (+R2) | PARTIAL | A28, B39, B47, B73, A49(new) |
| Sidebar filters | U1, U2, U4 | PARTIAL | A29, B41, B43, B68, B32 |
| Calculator (single) | U1, U2, U3 | PARTIAL (с клавиатуры — BROKEN) | A30, B37, B60 |
| Batch + presets | U1, U3 | PARTIAL | A30, B63, B60 |
| Beaker simulator | U1, U3 | PARTIAL | A30, B74, B60 |
| Reverse lookup | U1, U3 | BROKEN | C18, B37 |
| What heals? | U1, U2, U4 | PARTIAL | A32, B48, B65, B52 |
| Craft trees | U1, U3 | PARTIAL | A31, B67, B37 |
| Botany | U1, U3 | PARTIAL | A33, B66, C17 |
| Maps | U1, U3, U4 | BROKEN (гонка) + PARTIAL (мобайл, форк) | A34, B35, B61, B70, C19 |
| Sell list | U1, U2, U4 | PARTIAL | A35, B42, B35 |
| Ordnance | U1, U2, U3, U4 (+R2) | PARTIAL | A36(challenged), B52, B69, C21 |
| Fork diff | U1, U3, U4 | PARTIAL | A37, C20, B52 |
| Antag | U1, U2 | FUNCTIONAL с контрастом P1 | A38, B40, B59 |
| Tutorial | U1, U2, U4 | PARTIAL | A26, B49, B54 |
| Companion mode | U1, U3 | PARTIAL | A40, B50, D12 |
| PiP | U1 (только харнесс) | UNCERTAIN — нужен реальный Chrome | B50, D12 |
| RU mode | U1, U2, U3 (+R2) | PARTIAL | A39, B56(+split P1), B75 |
| Share | U1, U3 | BROKEN (ссылки не воспроизводят состояние) | A41, B46, C16, C17 |
| Header controls | U1, U2, U4 (+R2) | BROKEN на телефонах | B38, B40, B51 |
| Deep links | U3, U1 (+R2) | BROKEN (корректные) / FUNCTIONAL (мусорные) | A42, C16, C17, B59 |
| Storage corruption | U3 | FUNCTIONAL + P3-харденинг | A44, B77, C21 |
| SW / offline | U3 (офлайн — только код) | PARTIAL | A51, B71, B77 |
| 404 | U3 (curl + local) | MISSING — строки в UX-части нет | — (см. COVERAGE-CHECK) |
| Mobile 375 | U2, U4 (+R2) | BROKEN | B38, B35, B51, B52, B53, C20, A49 |
| Tablet 768 | U2 | FUNCTIONAL | A48, B53 |
| Cold 3G load | U4 (prod-трасса, загрязнена AV) | PARTIAL | B31, B34, B71, D16 |

## Not tested / needs a real device

- **Реальный телефон** (Chrome Android / iOS Safari): ширина ICB и крестик панели деталей (NEW-2 / A49); поведение `100vh` при показанной адресной строке (B36) — эмуляция URL-бара невозможна; pinch и вертикальный свайп на `#mapsCanvas`/`#ordHeat` (B35, B58); реальный FPS при вращении 3D-поверхности (панель скрыта → rAF не тикает).
- **Реальный Chrome/Edge**: Document PiP (открывается ли окно; поведение при заблокированных попапах) — B50/D12.
- **Чистая машина без HTTPS-MITM антивируса**: перезамер холодной 3G-трассы prod (B31) и Lighthouse Performance.
- **Офлайн-режим**: харнесс не умеет обрывать сеть — A51/B71 в части офлайн-фолбэка остаются code_analysis_only.
- **Реальные скринридеры** (NVDA/JAWS/VoiceOver) и `prefers-reduced-motion` в рантайме (A48 — код), Windows High Contrast.
- **Все 21 форк и 114 карт**: выборка — vanilla/goob/fish/stories_cm, Bagel/Box/Marathon.

## Summary

Сверенный список в целом устоял: из ~60 строк оспорены 13, из них только две меняют классификацию в худшую сторону (A36 → split с новой P2, A49 → PARTIAL/UNCERTAIN P2), а три — в лучшую (C21 P2→P3, B50/D12 P1→P2, числа B31 из «факта» в «порядок величины»). Все P1-строки, которые я перепроверил в рантайме на 8090 (C16, C17, B32, B38, B47, B36), воспроизвелись один в один, а B32 даже усилилась: смена форка при активной сортировке «Fewest Steps» стоит 708 мс на десктопе вместо 75 мс. Главные правки для списка — вернуть P1 отсутствию русских `aria-label` (24 значения, Step 0 сам их так и оценил), слить дубль B62/C19, расширить C17 на потерянный `sort=steps-asc` и переформулировать три FUNCTIONAL-строки (A36, A42, A46), которые сейчас читаются шире, чем то, что было проверено.

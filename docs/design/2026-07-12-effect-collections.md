# Дизайн: коллекции фильтров эффектов + антаг-веса

- **Дата:** 2026-07-12
- **Статус:** одобрено, готов к реализации
- **Затрагивает:** `app.js` (рендер сайдбара), `style.css` (стили коллекций), `ss14_chem_extractor.py` (антаг-веса)

## Проблема

Сайдбар «Effects» рендерит все 74 тега эффектов плоским flex-списком
(`setupEffectFilters`, `app.js`), отсортированным `heals: → deals: → прочее`.
При 74 тегах список длинный и плохо сканируется. Цветовая семантика есть
только у `heals` (зелёный) и `deals` (красный).

Существующая таксономия `EFFECT_KIND_ORDER` (heal/damage/speed/temperature/
status/message/other, `app.js:974`) используется только в detail-view карточки
и **не разделяет баффы/дебаффы** — всё сваливается в «status».

Нужна новая ось — **валентность** (польза/вред для потребителя) — и группировка
чипов в сворачиваемые коллекции.

## Схема группировки: 5 коллекций

Порядок отображения: Healing → Damage → Buffs → Debuffs → Other.
Цветовая кодировка по валентности: Healing=зелёный, Damage=красный,
Buffs=синий, Debuffs=янтарный, Other=серый.

### Классификация всех 74 тегов

**Healing (21):** все `heals:*` (`heals:brute, heals:burn, heals:poison,
heals:airloss, heals:heat, heals:cold, heals:toxin, heals:shock,
heals:radiation, heals:bloodloss, heals:asphyxiation, heals:blunt,
heals:piercing, heals:slash, heals:caustic, heals:cellular, heals:genetic,
heals:metaphysical, heals:mangleness, heals:holy`) + `cure`.

**Damage (21):** все `deals:*` (`deals:poison, deals:asphyxiation, deals:caustic,
deals:blunt, deals:cold, deals:cellular, deals:heat, deals:radiation,
deals:bloodloss, deals:brute, deals:slash, deals:piercing, deals:toxin,
deals:airloss, deals:burn, deals:shock, deals:genetic, deals:mangleness`)
+ `explosion, flammable, bleed`.

**Buffs (8):** `adrenaline, stamina, pressure-immune, shock-immune,
rad-protection, anesthesia, numbness, centered`.

**Debuffs (18):** `jitter, vomit, drunk, stutter, hallucinating, drowsy,
knockdown, sleep, blind, mute, unconscious, stun, pacified, dementia,
dna-scramble, claw-suppression, ratvarian, vulgar`.

**Other (6):** `thirst, hunger, emote, blood, temperature, speed`.

### Спорные назначения (зафиксированные решения)

- `bleed` → **Damage**. `ModifyBleedAmount` может как усиливать, так и
  останавливать кровотечение; по умолчанию читается как урон. Пересмотреть,
  если пользователи ожидают его в Healing.
- `speed` → **Other**. Один тег покрывает и ускорение, и замедление —
  валентность неоднозначна, поэтому нейтральная группа.
- `anesthesia` / `numbness` → **Buffs**. Обезболивание полезно потребителю,
  хотя механически это «выключение» ощущений.

## Механика

Классификация `тег → коллекция` живёт в **JS** (`app.js`), не в данных:
группировка — презентационная логика, регенерация `data.json` не нужна.

- Структура `EFFECT_COLLECTIONS` — упорядоченный список `{id, label, cls}`.
- `effectCollection(tag)`:
  - `heals:*` → `healing`; `deals:*` → `damage` (по префиксу, как сейчас);
  - явные `Set` для `damage`-extra (`explosion/flammable/bleed`), `buffs`,
    `debuffs`, `other`;
  - fallback: неизвестный тег → `other` (защита от новых тегов из upstream).
- `setupEffectFilters` переписывается: `tagCounts` группируются по коллекции;
  рендерятся 5 сворачиваемых секций в фиксированном порядке; внутри секции —
  сортировка по числу реагентов (desc). Сохраняется label-замена
  `heals: → ❤`, `deals: → ☠` и классы `.heals`/`.deals`.
- Сворачивание переиспользует существующий collapsible-паттерн сайдбара.
  Счётчик тегов на заголовке. По умолчанию секции свёрнуты.

## Антаг-веса

В `_ANTAG_TAG_WEIGHTS` (`ss14_chem_extractor.py:1762`) добавляются веса для
новых CC-дебаффов (существующие боевые: `paralyze=3, stun=2, sleep=3, blind=2,
mute=2, explosion=3, flammable=2, bleed=2`):

| Тег | Вес | Обоснование |
|---|---|---|
| `unconscious` | 3 | полный вырубон (как sleep) |
| `knockdown` | 2 | сбивает с ног (как stun) |
| `pacified` | 2 | цель не может атаковать |
| `hallucinating` | 1 | дезориентация |
| `drowsy` | 1 | прелюдия ко сну |
| `dementia` | 1 | дизориентация |
| `dna-scramble` | 1 | помеха/мутация |

Баффы и косметика (`stutter, adrenaline, stamina, …`) остаются с весом 0.
`compute_antag_score` уже подхватывает точные и префиксные совпадения.

## Не-цели (YAGNI)

- Не разделяем `speed` на ускорение/замедление (один тег остаётся).
- Не добавляем поле коллекции в `data.json` — классификация только в JS.
- Не трогаем detail-view таксономию `EFFECT_KIND`.
- Не назначаем антаг-веса баффам/косметике.

## План реализации (высокоуровнево)

1. Антаг-веса в `_ANTAG_TAG_WEIGHTS` (независимый, быстрый инкремент).
2. `EFFECT_COLLECTIONS` + `effectCollection(tag)` в `app.js`.
3. Переписать `setupEffectFilters` на рендер 5 сворачиваемых групп.
4. CSS коллекций в `style.css` (заголовки, цвета валентности, сворачивание).
5. Верификация в браузере: 5 групп, счётчики, фильтрация, отсутствие
   «потерянных» тегов (каждый тег попал ровно в одну коллекцию).

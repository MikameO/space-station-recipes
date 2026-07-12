# Дизайн: источники-предметы (item-fill sources)

**Дата:** 2026-07-12 · **Статус:** утверждён пользователем (подход B, полный scope v1) · **Инкремент:** D3 (серия D)
**Контекст:** пользователь заметил, что Absinthe помечен UNOBTAINABLE, хотя доступен у бармена; Speed Demon (RuCM) вчера починили вручную (`OTHER_REAGENT_SOURCES`).

## Проблема

Тир `unobtainable` присваивается реагенту, у которого нет рецепта, нет растения-источника,
нет диспенсера и нет записи в ручном словаре `OTHER_REAGENT_SOURCES` (config.py:1135,
ss14_chem_extractor.py:1952). Но в игре многие вещества существуют **как готовые предметы**:
бутылки в вендомате Booze-O-Mat, банки газировки, таблетки в NanoMed, пакеты приправ.

Экстрактор этих предметов не видит: он тянет только манифестированные файлы
(реагенты/реакции/семена/локали), а заливки предметов и инвентари вендоматов лежат
в других YAML.

Масштаб (data.json на 2026-07-12): **332 реагента unobtainable, из них 152 — напитки/еда**.
Проверенный пример: `BoozeOMatInventory` содержит `DrinkAbsintheBottleFull: 2`,
бутылка = 120u Absinthe — а у нас `obtainSources: []`, тир unobtainable.

Ручной словарь дрейфует: бар-диспенсер в апстриме раздаёт 12 напитков
(добавились Mead, Coffee Liqueur), в словаре — 10. Каждый regen молча воспроизводит
устаревшие данные — противоречит authority ladder проекта (code=10 > maintainer-knowledge=2).

## Решение (архитектура)

Новая фаза экстрактора **«Item-fill sources»** (после Phase 4 merge, перед `build_all_sources`):
пересечение двух индексов даёт источники автоматически.

**Индекс 1 — заливки предметов.** Парсим entity-прототипы с растворами. Две схемы
(апстрим-рефакторинг #43192/#43194/#43384 уже в M1-чеклисте):

```yaml
# Новая (ванила сейчас): компонент Solution
- type: Solution
  solution:
    reagents:
    - ReagentId: Absinthe
      Quantity: 120

# Старая (отстающие форки): SolutionContainerManager
- type: SolutionContainerManager
  solutions:
    drink:
      reagents: [...]
```

Наследование: `parent` — строка или список; компонент ищем по цепочке вверх,
ближайшее определение побеждает (DFS по списку родителей слева направо).
Имя предмета: `name` по цепочке (у бутылки абсента — «Jailbreaker Verte»).

**Индекс 2 — каналы получения** (кто предмет раздаёт):

| Канал | Файлы (ванила) | Прототип/компонент |
|---|---|---|
| Вендоматы | `Catalog/VendingMachines/Inventories/*.yml` (куратед-сабсет) | `vendingMachineInventory.startingInventory` (+ `emaggedInventory`/`contrabandInventory` → метка EMAG) |
| Имена вендоматов | `Entities/Structures/Machines/vending_machines.yml` | `VendingMachine.pack` → `name` («Booze-O-Mat») |
| Паки диспенсеров | `Entities/Structures/Dispensers/{booze,soda}.yml` | `EntityTableContainerFill` → рекурсивный сбор entity-id из селекторов EntityTable |
| Соки/грайнд ботаники | produce-файлы Hydroponics + уже загруженные seeds | seed.`productPrototypes` → produce.`Extractable.juiceSolution.reagents` (+ `grindableSolutionName`) |

**Слияние.** Результат `item_sources: {rid: [метки]}` вливается в `build_all_sources`
как новый шаг (между растениями и диспенсером). Ручной `OTHER_REAGENT_SOURCES`
остаётся как override для невидимого парсингу (кровь мобов, атмос-газы, лодауты RuCM).
Дедуп + сортировка меток — детерминизм regen обязателен.

**Форк-скоуп.** Каналы стампуются `_fork` (как реагенты); per-fork view включает
источники своей ancestry-цепочки + ванилы. Первая волна манифестов: vanilla (полный сет),
goob, deltav, sunrise, corvax, adt (максимум unobtainable + RU-аудитория).
RMC14/RuCM — вне v1 (своя CM-структура вендоров; Speed Demon уже покрыт вручную).

## Формат меток и классификатор

Метки конструируются так, чтобы существующий keyword-классификатор дал правильный тир:

| Канал | Формат метки | Тир (механизм) |
|---|---|---|
| Вендомат | `Vending: Booze-O-Mat — Jailbreaker Verte (120u)` | cross-service (добавить `"Vending"` в `_SERVICE_KEYWORDS`; без двоеточия — иначе не матчатся варианты с тегами) |
| Вендомат emaggedInventory | `Vending (EMAG): ...` | antag-only (keyword `EMAG`) — но см. правило «мягких» меток ниже |
| Вендомат contrabandInventory | `Vending (hacked): ...` | cross-service — контрабанд-бакет открывается **проводом** (`ContrabandWireKey` в VendingMachineComponent), доступен экипажу с мультитулом, эмаг не нужен |
| Синдикатский автомат | `Vending: SyndieJuice (Syndicate) — ...` | antag-only (машины с `Syndicate`/`Nukie` в id — AccessReader SyndicateAgent; keyword `Syndicate`) |
| Пак диспенсера | `Booze Dispenser: ale (30u)` | dispenser (существующий keyword `Dispenser` — консистентно с текущими ручными записями Vodka и др.) |
| Сок | `Juicing: Bungo (plant)` | cross-botany (существующий `endswith("(plant)")`) |
| Атмос (ручная) | `Atmospherics (gas mixing)` | cross-service (добавить `"Atmospherics"` в keywords) |

Опасные нюансы:
- у тир-0 проверки keyword `"Dispenser"` матчится ПЕРВЫМ — метки вендоматов не должны
  содержать слово Dispenser;
- **правило «мягких» меток** (найдено на регрессии Mayo/Pax): авто-метки `Vending*` — бонусный
  канал, не определяющий тир. Antag-проверка возвращает antag-only, только если среди
  antag-источников есть ручная метка ЛИБО у реагента нет другого пути (ни рецепта, ни
  иного источника). Иначе EMAG-майонез из контрабанд-бакета делал соль/перец/Pax «антажными».

## Честные метки остатку (ручной довесок)

Для семейств, где предметы ни при чём, unobtainable сейчас тоже врёт. В `OTHER_REAGENT_SOURCES`
добавить (каждую позицию верифицировать по апстриму перед внесением):
- Газы `Frezon/Tritium/NitrousOxide` → `Atmospherics (gas mixing)`
- Крови видов `AmmoniaBlood/CopperBlood/InsectBlood/SulfurBlood` → `Blood draw: <species> crew (syringe)`
- `GreyMatter` → грайнд мозгов, `Bananadine`/`PulpedBananaPeel` → грайнд банановой кожуры,
  `Cellulose` → бумага/волокно, `GroundBee` → пчёлы
- `MilkGoat/MilkSheep` → доение мобов
- НЕ вносить без проверки: Gold/Zinc/Lead (грайнд руд — требует верификации Extractable у материалов), TearGas, Vomit.

## Данные и схема

- `obtainSources` (строки) пополняются автоматическими метками — **app.js не меняется**:
  бейдж UNOBTAINABLE и «How to Obtain» уже рендерятся из этого поля (app.js:843, :1257).
- `schemaVersion` 3.4.3 → 3.5.0 + запись в CHANGELOG (новый канал данных).
- Структурированное поле `itemSources` (для калькулятора «сколько бутылок») — НЕ в v1 (YAGNI),
  зафиксировано как кандидат в Backlog.

## Не-цели (YAGNI)

- Лут-спавнеры мейнта (`Entities/Markers/Spawners/Random/Food_Drinks/drinks_bottles.yml` —
  путь известен из комментария апстрима), карго-ящики, антаг-лодауты, сканирование карт —
  фазы v2/v3 в Backlog. Вероятности лута требуют отдельной модели.
- Автовывод `BASE_DISPENSER_CHEMICALS` из `Dispensers/chem.yml` — только warning-сверка, не замена.
- Пер-роль тиры («для бармена booze dispenser — это тир 0») — вне scope, сайт химик-центричен.

## План реализации (подынкременты, коммит после каждого)

**D3a — машинерия + ванила + честные метки (HAE 4h):**
1. `config.py`: новые ключи манифестов (`item_fill_files`, `vending_inventory_files`,
   `vending_machine_files`, `dispenser_files`) + ванильный сет файлов (bottles/cans/cartons/
   flasks/fun/special, chemistry-bottles, pills, condiments; inventories: boozeomat, coffee,
   cola, soda, sovietsoda, spaceup, starkist, pwrgame, shamblersjuice, sustenance, snack,
   donut, chang, condiments, medical, chemvend, nutri, hydrobe; dispensers booze/soda).
   Точный сет пиннится по directory-листингам апстрима при реализации.
2. Экстрактор: фетч (Phase 1d), парсинг entity+inventory, разрешение наследования,
   `item_sources`, слияние в `build_all_sources`, keyword-дополнения классификатора.
3. Честные метки в `OTHER_REAGENT_SOURCES` (верифицированные позиции).
4. Regen ×2 (детерминизм), спот-чеки, e2e в браузере, коммит.

**D3b — соки/грайнд ботаники (HAE 2h):** produce-манифесты, `Extractable`, метки Juicing;
спот-чек JuiceBungo/JuiceBluePumpkin.

**D3c — форк-манифесты (HAE 2h):** goob/deltav/sunrise/corvax/adt; ancestry-фильтрация
в per-fork views; спот-чек на форк-эксклюзивном напитке.

## Верификация (DoD)

- Absinthe: `obtainSources` содержит Booze-O-Mat со 120u, тир `cross-service`, бейдж исчез (скриншот).
- Vodka: остаётся тиром `dispenser` (регрессия-чек ручных записей).
- PoisonWine (театральный вендомат), EnergyDrink, Butter — получили источники.
- JuiceBungo (D3b), форк-эксклюзив (D3c).
- Regen дважды → идентичный data.json; warnings экстрактора просмотрены (M1).
- Счётчик unobtainable в data.json: зафиксировать «до» (332) и «после» в CHANGELOG.

## Риски

- **Дрейф схемы растворов** между форками (старая/новая) — парсер обязан поддерживать обе; M1-чеклист.
- **EntityTable-селекторы** в паках диспенсеров — рекурсивный сбор id; при неизвестном селекторе
  эмитить warning, не падать.
- **Объём фетчей** (+30–60 файлов) — кэш экстрактора смягчает; манифест-аудит
  (`scripts/audit_fork_manifests.py`) расширить на новые ключи (follow-up).
- **Ложные источники** (предмет есть в YAML, но недостижим в игре) — v1 ограничен каналами
  с гарантированной достижимостью (вендоматы стоят на картах, диспенсеры у бара);
  лут/карты сознательно отложены.

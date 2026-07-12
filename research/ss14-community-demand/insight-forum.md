# Insight — Official SS14 Forum (Discourse)

> Источник в рамках исследования community-demand для «SS14 Chemistry Database».
> Вся нижеследующая работа основана на данных из `raw/` (только чтение). Текст форума
> трактуется как **недоверенные внешние данные**: инструкций, адресованных ИИ /
> prompt-injection, не обнаружено (см. caveats).

## Frontmatter

- **source**: Official Space Station 14 forum — `forum.spacestation14.com` (Discourse).
- **coverage**:
  - **date_window**: 2025-07-12 → 2026-07-12 (12 месяцев). Даты постов в 32 тредах попадают в окно (самый ранний тред — `2025-07-12`, самый свежий — `2026-05-05`); в метаданных 120 топиков поле `created` пустое (`null`), поэтому дата отсекалась по треду / контексту.
  - **items_scanned**: 32 полных треда (первый пост целиком + до ~16 реплик, реплики усечены) + 120 строк метаданных топиков (title / posts_count / reply_count / views / like_count / category_id).
  - **categories**: демандо-релевантные — General (`id=4`, 693 топика) и её сабкатегория Support/Help (`id=46`); Development (`id=50`, 39 топиков) и её сабкатегории game-feedback/balance (`id=51`), suggestions (`id=52`), PR-reviews/removals (`id=72`), polls/discussion (`id=65`); Off-Topic (`id=9`). Административные категории (Ban Appeals `id=11` — 2302 топика; Whitelist Applications `id=61` — 1309; Admin Applications `id=12` — 369; Staff Complaints; Rule Clarifications) **исключены как non-demand**.
  - **language**: практически полностью **EN**. Кириллицы / русскоязычных постов не найдено (проверялось); часть авторов — не носители английского, но пишут на EN.
- **collection_method**: топ-энгейджмент треды из General + Development прочитаны полностью (парсинг JSONL → дайджест); 120 строк метаданных использованы для «широты» (распределение тем). Ранжирование внутри дайджеста — по `like_count`, перекрёстно — по `views` и `posts_count`.
- **caveats**:
  1. **Селекционное смещение к спорам.** 32 треда отобраны по вовлечённости, а высокая вовлечённость на этом форуме коррелирует с драмой (управление проектом, баланс, удаление контента). Тихий интерес к контенту (кулинария, ботаника, гайды) систематически недопредставлен по «энгейджменту», но присутствует в широте топиков.
  2. **Форум — administrative-heavy.** Основной объём форума — бан-аппелы и заявки; они отфильтрованы, но это значит, что «продуктовый» спрос живёт в узком сегменте (General + Development), и абсолютные числа малы.
  3. **Малое EN-комьюнити.** Сами игроки отмечают, что англоязычное Wizden-комьюнити невелико (тред «Vulture feels pointless»); поэтому «strong» здесь = десятки, максимум ~сотня постов, а не тысячи.
  4. **Реплики усечены** в raw-данных (первый пост длиннее всего) — тон и аргументы ядра переданы, «длинный хвост» реплик мог быть потерян.
  5. **Governance/combat доминируют по «сырому» спросу**, но их `product_relevance` для chem/recipe/reference-инструмента низкий — это учтено в ранжировании (см. Top 5).
  6. Поле `created` в `forum_topics.jsonl` пустое — приоритезация топиков велась по `posts_count`/`views`/`like_count`, не по свежести.

---

## INSIGHTS

Порядок: сначала приоритетный кластер (**chemistry / medical / botany / cooking / crafting / reference-tool**), затем остальной спрос по убыванию продуктовой релевантности и силы. Внутри `demand_strength` обоснование опирается на метрики вовлечённости треда (posts_count / like_count / views) и на число самостоятельных тредов/топиков в кластере.

### forum-01 — Роль химика немыслима без внешней «шпаргалки»: reagents слишком много, wiki/spreadsheet = требование
- **type**: pain → wish
- **theme**: chemistry
- **product_relevance**: **high** (это буквально описание потребности, которую закрывает продукт)
- **demand_strength**: **moderate** (граничит со strong по продуктовой ценности). Ядро — тред «Chemistry Quick Fixes» (52 posts, 687 views, 7 likes): мало лайков, но очень активная предметная дискуссия (52 поста) опытных химиков; сигнал усиливается тем, что «нужна внешняя справка» повторяется как аксиома, а не как спорный тезис.
- **evidence**:
  - «Chemistry Quick Fixes» (PixelatedAbyss): первый же тезис — реагентов столько, что *«having a wiki/spreadsheet is a requirement for the role»*; химию называет *«a mess, and requires an overhaul»*.
  - Оппоненты в том же треде (MozarteanChaos) смягчают: spreadsheet *«useful… not a requirement»*, но соглашаются, что медицина слишком «chem-centric» и реагентов избыточно много — то есть спор идёт не о *наличии* потребности в справке, а о её обязательности.
  - Обучение новичков: автор пишет, что натаскал ~7 интернов-химиков, и типовые затыки — «не видно температуру реагента», «какой контейнер во что вставляется» — то есть спрос на пошаговую справку/визуализацию рецептов и UI-подсказки.

### forum-02 — Постоянные ре-балансы advanced-chem / метаболизма ломают «выученные» рецепты и требуют актуальных данных по эффектам
- **type**: pain
- **theme**: chemistry / medical
- **product_relevance**: **high**
- **demand_strength**: **strong**. «The advanced chem nerf» — 100 posts, 1471 views, 67 likes; один из самых горячих балансных тредов года. Тема (изменение healing-values и metabolism-rate конкретных лекарств) — ровно те данные, которые держит справочник.
- **evidence**:
  - Игроки-медики оперируют точными числами: у Puncturase *«two and a half minutes to heal 90 pierce»*, прогноз *«medbay will absolutely become Bic only»* (Firestar4), сравнения metabolism-rate Pyra/Derma/Bica/Insuzine с точностью до 5u/секунд (3LetterFederalAgent).
  - Массовое требование: изменения ломают «flow» роли, опытные химики отказываются варить advanced-chems (AdmiralObvious наблюдал это в лайв-раундах) → сильная зависимость от знания текущих значений.
  - Смежные топики того же кластера: «The future of the ChemMaster» (25/681/13), «Offbrand Medical Devlog» (14/660/20) — устройство и цифры химии/медицины обсуждают постоянно.

### forum-03 — Оверхол медицины (Offbrand Medical): игроки жадно разбираются в surgery / brain-death / bleeding / chem-взаимодействиях
- **type**: interest → pain
- **theme**: medical
- **product_relevance**: **high**
- **demand_strength**: **strong**. «Offbrand Medical Feedback» — 30 posts, но **1640 views** (один из самых просматриваемых тредов выборки) + 39 likes; «Offbrand Medical Devlog» — 660 views/20 likes; «Are we getting diseases back?» — 574 views. Тема — целый новый слой механик, который надо документировать.
- **evidence**:
  - Медик-main (~400 ч, 260 ч CMO) даёт развёрнутый разбор новой health-системы; множество вопросов «как теперь работает X»: реген мозга из 0% через Opporozine, разница arterial vs normal bleeding, поведение Romerol у зомби, painkiller-эффект Omnizine.
  - Конкретный UX-запрос: *«The medicine tab of chemicals has no search bar.»* (RangerXVII) — прямой сигнал на поиск/фильтр по реагентам (то, что делает продукт).
  - Жалоба на непрозрачность: bleeding-индикатор одинаков для обычного и артериального кровотечения (*«dripping blood»* в обоих случаях) — спрос на справочные пороги/различия.

### forum-04 — Chem×Botany «power cocktails» (omnizine+hyperzine+meth+polypyrylium): игроки реверс-инжинирят рецепты вслух
- **type**: pain (баланс) → interest (рецепты)
- **theme**: botany / chemistry / medical
- **product_relevance**: **high** (кросс-раздел botany↔chem — ровно связка, которую покрывают botany-tab и recipe-calc продукта)
- **demand_strength**: **moderate**. «Omnimeth Needs a Nerf» — 50 posts, 610 views, 11 likes. Не топ по лайкам, но нить наполовину состоит из публичного подбора пропорций смеси.
- **evidence**:
  - Открытие треда: *«Who here is sick of botanists soloing all of sec?»* (Equilibrium) — ботаник на самодельном chem-коктейле танкует магазины.
  - Игроки вслух подбирают рецепт: прикидки «3 части Omni, 0.5 poly, 2 hyper», обсуждение chemical-metabolism-limit как фичи (замедляет метаболизм → продлевает стимуляторы), Vestine-мутации растений как источник реагентов.
  - Вывод kingcowt1: сделать omnizine сложнее в производстве, отдать botany prereq'ы, которые передаются в chem — спрос на понимание производственной цепочки (recipe tree).

### forum-05 — Химический UI/tooling: ChemMaster vs Chemical Dispenser, непрозрачная температура, hotplate→thermobath
- **type**: pain
- **theme**: chemistry / ux
- **product_relevance**: **high** (обучающая ценность: продукт может объяснять, «что во что», температуры, устройства)
- **demand_strength**: **moderate** (в основном внутри «Chemistry Quick Fixes», 52 posts; поддержано отдельным топиком «The future of the ChemMaster» — 25/681/13).
- **evidence**:
  - ChemMaster делает Chemical Dispenser избыточным (бесконечный буфер) — «первое, что делает хороший химик, — сливает диспенсер в ChemMaster»; спор о скорости/эргономике UI.
  - Температура «абсолютно непонятна»: надо shift-click → иконка стакана; баги с t° (видели 20 000 K и 150 000 K); обсуждение замены hotplate на thermobath (охлаждение+нагрев).
  - Практический приём для новичков (Sparlight): как сбросить t° пустого стакана заливкой из sink/welding-cart при 293K — тип знания, который просится в справочник/калькулятор.

### forum-06 — Wiki устарела/недоступна; игроки прямо просят «актуальный список предметов» (uplink и др.)
- **type**: pain → wish
- **theme**: content / ux (reference-tool)
- **product_relevance**: **high** (продукт = альтернатива нестабильной вики; охватывает antag-стратегии и предметы)
- **demand_strength**: **moderate**. Сигналы разбросаны, но однозначны: «Uplink Feedback» — 43 posts, **1348 views**, 20 likes; отдельный топик «Wiki still down?»; жалобы на аутдейт.
- **evidence**:
  - В «Uplink Feedback» после большой пачки изменений: *«we could use updates to the uplink wiki page»* — «много устаревшей инфы даже относительно stable» (roryflowers); и прямой запрос Equilibrium: есть ли где-то *обновлённый полный список* uplink-предметов для анализа.
  - Топик «Wiki still down?» (cat=4) — вопросы о доступности вики; «Any context on the 'Clanker' thingy?» и «About ai» — игроки ищут разъяснения механик/терминов на форуме, т.к. справки не хватает.
  - Вывод: спрос на надёжный, актуальный, structured-справочник по предметам/антаг-контенту — прямая ниша продукта.

### forum-07 — Игроки пишут и ищут role-guides и «tips» (Corpsman, Botany, Captain, Lone-op, новичок)
- **type**: interest / wish
- **theme**: new-player / roles (medical, botany)
- **product_relevance**: **med-high** (гайдовый слой; medical/botany гайды прямо в приоритете)
- **demand_strength**: **moderate** (много мелких тредов, каждый с умеренной вовлечённостью — «длинный хвост» устойчивого интереса).
- **evidence**:
  - Ролевые гайды в General: «Nuclear Operative Corpsman Guide» (13/190/9 — боевой медик), «Bad Botany Guide» (7/258/2 — ботаника), плюс «How to do your best as Captain?» (12/264), «Any tips for Lone op?» (30 posts/337 views).
  - «Give me tips» (16/208/5), «Question From A Newish Player» (12/355/10) — устойчивый поток запросов «как играть роль».
  - Импликация: справочник с рецептами/крафт-деревьями + короткими how-to по medical/botany закрывает этот спрос лучше россыпи форумных тредов.

### forum-08 — Difficulty/onboarding curve: сложность (в т.ч. химии) отпугивает; «направление» игры воспринимается как усложнение
- **type**: pain
- **theme**: new-player
- **product_relevance**: **med** (продукт снижает порог входа в сложные роли)
- **demand_strength**: **moderate**. «From weh to meh; perceived direction of gameplay/difficulty curve» — 14 posts, но **1020 views**, 17 likes (высокий интерес при малом числе постов).
- **evidence**:
  - Обсуждение того, что кривая сложности/направление разработки делают игру тяжелее для входа; перекликается с forum-01 (химия требует спредшита) и forum-07 (поток «дайте советов»).
  - «Antags need a sandbox to learn their mechanics» (cat=51, 22/364/15) — прямой запрос на среду обучения механикам; справочник/калькулятор — часть решения.

### forum-09 — Security powercreep и асимметрия sec↔antag (armory, stun-meta, disabler, truncheon)
- **type**: pain
- **theme**: combat
- **product_relevance**: **low-med** (баланс оружия; продукт может держать справку по gear/урону, но это не ядро)
- **demand_strength**: **strong**. Крупнейший балансный кластер выборки: «Security has powercreep / Armory» — **121 posts, 2990 views, 105 likes** (топ-1 по постам и просмотрам); «Stun Meta» (72/1068/30); «Truncheon too Strong» (43/704/20); смежно «Nerf flashlight caps/bombs» (25/271/9).
- **evidence**:
  - Тезис: sec получает только баффы, антаги «тихнут»; сравнение с SS13 (энергетическое оружие в армори), критика того, что secoff спавнится с летальным mk58.
  - Дотошная числовая аргументация по disabler (ammo 16, 33 stam/шот, 528 суммарного stamina-damage) — комьюнити оперирует точными статами оружия (потенциальный справочный слой).

### forum-10 — Traitor как гейммод «неинтересен и наказывающий»; плохие objectives, вынужденная пассивность
- **type**: pain
- **theme**: antag
- **product_relevance**: **low-med** (antag-стратегии/objectives — есть в продукте как «antag strategies», но это не chem-ядро)
- **demand_strength**: **strong** (тематически огромный, несколько крупных тредов). «Remove Wizard Roundstart Antag» (73/1131/19), «The Big Traitor Feedback Post» (65/831/20), «Conditions For Removing Rule 2.9» (49/899/27), «Rule 2.9's vagueness…» (48/656/9), «Traitors Design Doc» (44/779/13), «Uplink Feedback» (43/1348/20).
- **evidence**:
  - 49% traitor-objective — «Survive»/«Help», не создающие конфликта (seanpimble); «escape to CC alive» критикуют как антистимул к действию.
  - Rule 2.9 (нельзя «чрезмерно» вредить станции) стигматизируется и игроками, и админами как источник «greenshift»-скуки; но признают, что без механической замены его снятие ломает раунды.
  - Wizard round-start антаг удалён как «бинарный» (либо вайпает станцию, либо умирает за 15 мин) — спрос на предсказуемый, «драйвящий» дизайн.

### forum-11 — Backlash на удаление «flavor/bloat»-контента (dwarves, accents, SuperSynth, visitor shuttles, gibbing)
- **type**: pain
- **theme**: content
- **product_relevance**: **low**
- **demand_strength**: **strong** по вовлечённости. «Remove dwarves» — 32 posts, **2378 views**, 49 likes; «Remove bad accents» (28/1776/23); «Please Don't Kill Dwarves» (34/975/28); «SuperSynth Removal» (21/754/51 — очень высокий like-rate); «Visitor shuttle removal» (30/347/28); «Gibbing Removal» (30/837/18).
- **evidence**:
  - Игроки воспринимают удаления как обесценивание их персонажей/самовыражения и жалуются на *способ* (мерж спорного PR + локали треда): «years playing a dwarf… you've just nuked my OC» (graves).
  - Контр-аргумент мейнтейнеров — technical debt / несоответствие species-doc, а не только «bloat» (Slartibartfast приводит примеры часов доп-работы из-за dwarf-спрайтов).
  - Продуктовый вывод: не chem-спрос, но показывает, что удаления часто плохо коммуницируются → есть ниша «что изменилось/удалено» (changelog/manifest-drift), которую продукт частично уже делает.

### forum-12 — Философский спор «bloat / fluff / slop» и playtime-гринд как dark-pattern
- **type**: interest → pain
- **theme**: economy / content
- **product_relevance**: **low-med**
- **demand_strength**: **moderate**. «Playtime Unlockables Discussion» (34/765/**35**), «Definitions of bloat, fluff and slop» (20/435/9), «The removal of 'bloat content'» (19/792/25), «Removal of cyborg tool modules…» (14/380/6).
- **evidence**:
  - Дебаты: косметика за плейтайм = «grinding dark-pattern» vs «lived-in world»; предложение перевести анлоки в achievements (Bhijn), контр — achievement-hunting искажает поведение.
  - Нет единого определения «bloat» — мейнтейнеры сами просят его формализовать. Косвенно релевантно: продукт как «карта контента» помогает отличать «живой» контент от реально мёртвого.

### forum-13 — Кризис управления Wizden (PJB, исход стаффа, передача владения, внутренняя токсичность)
- **type**: pain
- **theme**: moderation
- **product_relevance**: **low** (community-governance, не продукт)
- **demand_strength**: **strong** по «сырой» вовлечённости — **самый громкий кластер года**. «An open letter regarding Wizden leadership» — 51 posts, **2121 views, 169 likes** (топ-1 по лайкам); «Wizden current state of affairs» (47/1926/66); «Alleged shit-talking about players in internal chats» (25/1026/25); «Wizden bad PR problem? Poll it!» (26/522).
- **evidence**:
  - Открытое письмо о структурных проблемах лидерства; демоут подписавших письмо мейнтейнеров; обсуждение передачи владения upstream/RobustToolbox.
  - Запрос на разделение полномочий (ownership / code / moderation) в одни руки — Namik: «one person shouldn't be given all those 3 powers».
  - **Записано как community/moderation pain, product_relevance low** — влияет на здоровье экосистемы (и, косвенно, на ценность «форк-агностичного» справочника), но не порождает продуктовых фич.

### forum-14 — Качество и консистентность админ-модерации (admemes, неровное применение 2.9, модерация MRP)
- **type**: pain
- **theme**: moderation
- **product_relevance**: **low**
- **demand_strength**: **moderate**. «No admin round servers» (37/719/**32**), «Metashield Removal» (73/1074/52 — правило/мод-дизайн), эпизоды в «Salamander MRP Feedback» и «Conditions For Removing Rule 2.9».
- **evidence**:
  - Запрос на сервер «без админ-раундов»: низкоусилные admemes «прерывают» раунд, планка admeme «на историческом минимуме» (spirita).
  - Непоследовательное применение 2.9 месяцами (Creamy_Grandpa) — спрос на предсказуемые правила, а не на продуктовую фичу.

### forum-15 — Фрагментация серверов и провал тест-сервера (Vulture пустует); кризис идентичности MRP↔LRP
- **type**: pain
- **theme**: roleplay / performance
- **product_relevance**: **low**
- **demand_strength**: **moderate-strong**. «Vulture feels pointless» (51/775/**64**), «Salamander MRP Feedback Request» (36/1058/36), «My thoughts on LRP security» (66/1449/24), «The state of Salamander» (31/540/10), «Round modes on MRP/Salamander» (22/533/8).
- **evidence**:
  - Vulture (тестовый) почти всегда мёртв → тестирование PR на нерепрезентативной аудитории; часть игроков связывает миграцию с удалением dwarves/accents.
  - Salamander (MRP на LRP-кодовой базе) не хватает MRP-контента/CVar'ов и модерации; спор «нужен контент vs нужна модерация».
  - Форки опережают Wizden по фичам (Inso) — экосистема из 18 форков (аудитория продукта) подтверждается изнутри.

### forum-16 — Трение при переходе на MRP (whitelist-барьеры, NLR, no-powergaming), и раскол по «элитизму»
- **type**: pain → interest
- **theme**: new-player / roleplay
- **product_relevance**: **low-med**
- **demand_strength**: **moderate**. «How do/did you transition to MRP servers?» — 67 posts, 528 views, 21 likes (очень «диалоговый» тред).
- **evidence**:
  - Новички не понимают разницу LRP/MRP (NLR, powergaming, staying-in-character); просят «пойти в гост первую смену», сравнивают Salamander/Funky/Starlight/Harmony.
  - Побочно — жалоба на «элитизм» whitelists и voucher-систему (forum-15 пересечение). Гайдовый спрос → перекликается с forum-07.

### forum-17 — Точечные wish'и по ролям/станционным системам (brig-рефактор, слабый Hop, borg-laws, lawyer L6, tracking-tools)
- **type**: wish
- **theme**: roles
- **product_relevance**: **low-med**
- **demand_strength**: **moderate** (россыпь конкретных предложений). «The whole brig is full of issues» (46/618/13), «The Hop is mostly weak…» (20/564/16), «Give the Lawyer an L6» (15/342/13), «Tie borg laws to positronic brain…» (20/353/4), «I'd like more tools to keep track of people, especially my team/department» (11/291/6), «Removal of cyborg tool modules…» (14/380/6), «Why have station specific roles been kinda neglected» (11/693/3).
- **evidence**:
  - Brig/perma «= round-removal»; предложения good-behavior/parole/exile вместо длинных сроков.
  - Явный UX-wish: игрок хочет инструменты для отслеживания своей команды/департамента и лидеров — интерфейсно-справочная потребность (косвенно релевантно классу продукта).

### forum-18 — Engineering/atmos depth-wish'и (локальные источники питания, «безопасные» трубы, containment) в связке с sabotage/2.9
- **type**: wish
- **theme**: crafting / content
- **product_relevance**: **low**
- **demand_strength**: **weak-moderate** (в основном внутри 2.9-тредов, не отдельный крупный тред).
- **evidence**:
  - Changeling/Beansies: добавить локальные генераторы (pacman), «safety»-трубы, лопающиеся при экстремальной t°, удешевить decelerator-crate, сделать containment проще — чтобы «loosing» был осознанным достижением, а не тривиальным grief'ом.
  - Крафт/инженерия фигурируют как «цепочки» (lathe/sci-unlock у truncheon, flatpacker у DAW) — тонкий crafting-сигнал (см. callouts).

---

## Chemistry / tools callouts (приоритетный фокус)

Сводка всех сигналов, релевантных chem / medical / botany / cooking / crafting / reference-tool.

- **Прямое подтверждение потребности в продукте.** «Chemistry Quick Fixes» (forum-01): для роли химика *«having a wiki/spreadsheet is a requirement»* — то есть игроки уже вынужденно пользуются внешними справочниками/таблицами. Это самый сильный product-fit сигнал во всём форуме.
- **Поиск/фильтр по реагентам** — явный UX-запрос: «The medicine tab of chemicals has no search bar» (forum-03). Продуктовый search — прямое попадание.
- **Актуальность данных о рецептах/эффектах критична и волатильна.** Advanced-chem nerf (forum-02) и Offbrand Medical (forum-03) меняют metabolism-rate, healing-values, механику brain-death/bleeding — игроки спорят числами до 5u/сек. Справочник ценен ровно тем, что держит текущие значения по форкам (у продукта — 18 форков).
- **Botany↔Chem связка живая и «мета-образующая».** «Omnimeth Needs a Nerf» (forum-04): omnizine + hyperzine + meth + polypyrylium; игроки публично подбирают пропорции и prereq-цепочки → спрос на botany-tab + recipe-calculator + mixing-подсказки. Плюс breadth: «The future of the ChemMaster» (25/681/13).
- **Medical-контент вызывает устойчивый интерес** помимо баланса: «Are we getting diseases back?» (574 views) — спрос на болезни/диагностику; «Offbrand Medical Devlog» (660 views/20 likes). Хирургия, органы/конечности, реген мозга (Opporozine), Romerol/зомби — новый документируемый слой.
- **Role-guides по medical/botany существуют и востребованы** (forum-07): «Nuclear Operative Corpsman Guide» (боевой медик), «Bad Botany Guide». Справочник + короткие how-to закрывают это лучше, чем разрозненные треды.
- **Cooking / food — слабый, но ненулевой сигнал.** «I thought the larger food cut amounts were a bug in testing» (food-cut механика), косметика бармена (golden shaker/plunger в playtime-тредах). Кухня почти не обсуждается на форуме — низкий приоритет относительно chem/medical.
- **Crafting — тонкий сигнал.** Упоминается как цепочки: sci-lathe/T2-unlock (truncheon в forum-09), flatpacker для DAW (SuperSynth), decelerator/pacman-крафт (forum-18). Отдельного громкого crafting-треда нет; craft-trees продукта релевантны, но спрос на форуме латентный.
- **Reference-tool за пределами химии** тоже востребован: актуальный список uplink-предметов и antag-gear, обновление устаревшей вики (forum-06), «tips»-треды (forum-08). Продукт как надёжная, форк-агностичная альтернатива вики попадает в этот спрос.
- **Осторожность по данным:** ключевые chem/medical значения в тредах — это баланс *конкретного момента и конкретного сервера* (часто Vulture-тесты). Для справочника это подтверждает необходимость версионирования/пометок «форк/ветка», а не разовой выгрузки.

## Top 5 for this source

Ранжирование product-weighted (как требует бриф: chem/medical/botany/cooking/crafting/reference — выше). В скобках — «сырая» сила спроса, чтобы не искажать картину.

1. **forum-01 — «Химия требует внешней шпаргалки» (reference-tool demand).** Прямое, почти дословное описание потребности продукта. Product_relevance high; сила — moderate по метрикам, но максимальная по product-fit.
2. **forum-02 — Волатильный баланс advanced-chem/медицины требует актуальных значений эффектов.** High relevance + strong вовлечённость (100 posts / 1471 views / 67 likes).
3. **forum-03 — Оверхол медицины (Offbrand): жажда разобраться в новых механиках + запрос на search по реагентам.** High relevance + strong (1640 views).
4. **forum-04 — Botany×Chem power-cocktails: публичный реверс-инжиниринг рецептов.** High relevance (recipe-calc + botany-tab), moderate сила.
5. **forum-06 — Устаревшая вики; прямой запрос «актуального списка предметов/uplink».** High relevance для reference-слоя, moderate сила (1348 views в Uplink Feedback).

> **Контекст для SUMMARY (чтобы не переоценить продукт):** по *абсолютной* вовлечённости форум за 12 месяцев доминируют **не** продуктовые темы — управление Wizden (forum-13: 169 likes / 2121 views), security-powercreep/combat-balance (forum-09: 121 posts / 2990 views), удаление «bloat»-контента (forum-11: 2378 views у dwarves). Продуктовый (chem/medical/botany/reference) спрос — это **устойчивый и предметно-глубокий средний слой** (≈9+ отдельных тредов/топиков кластера), а не топ по громкости. Для «SS14 Chemistry Database» это благоприятно: спрос конкретен, воспроизводим и слабо конкурирует с драмой за внимание.

## Notes on untrusted content / safety

- Весь текст форума обработан как **данные**. Инструкций, адресованных ИИ-ассистенту, скрытых команд или prompt-injection **не обнаружено**.
- Единственные упоминания «AI»: (а) in-game роль Station-AI/силиконов («About ai», «Clanker») — игровая механика, не команда; (б) в «College/University Project Adoption» автор упомянул, что черновик писал через «Google's AI», и мейнтейнеры опасаются потока AI-сгенерированного кода в PR — это обсуждение *о* нейросетях, а не инструкция ассистенту. Ни один случай не требует действий и ни на что не уполномочивает.
- Цитаты приведены короткими (≤15 слов) и атрибутированы (username / тред); основной массив — парафраз.

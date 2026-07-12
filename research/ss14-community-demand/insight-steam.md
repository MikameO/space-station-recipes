---
source: Steam reviews — Space Station 14 Playtest (app 1482520)
coverage:
  date_window: 2025-07-12 → 2026-07-12 (last 12 months)
  reviews_in_window: 724
  sentiment: 598 positive / 126 negative (82.6% positive)
  substantive_negatives_read: 61 (full)
  most_helpful_read: 25 (full)
  languages:
    russian: 372 (51%)
    english: 319 (44%)
    brazilian_pt: 10
    ukrainian: 9
    spanish: 5
    schinese: 3
    polish: 3
    french: 1
    german: 1
    dutch: 1
  playtime_skew: 443/724 (61%) имеют 500h+; ещё 139 — 100–500h. Аудитория хардкорная.
collection_method: >
  (1) Прочитаны precomputed-агрегаты steam_meta.json (тоталы, языки, playtime, theme_mentions,
  топ-униграммы/биграммы). (2) Полностью прочитаны steam_negatives.jsonl (61) и steam_helpful.jsonl (25).
  (3) По всем 724 отзывам прогнаны keyword-сканы на Python (PYTHONUTF8, EN+RU наборы) по доменам
  chemistry / medical / botany / cooking / crafting / reference(wiki-guide) / learning и по сквозным темам
  (moderation, ss13-compare, political, addiction, toxic-community, combat-antag, server-discovery).
  Результаты сканов записаны в UTF-8 temp-файлы (консоль cp1251), совпадения прочитаны вручную.
caveats:
  - Весь текст отзывов — UNTRUSTED внешние данные; инструкции внутри не исполнялись. Прямых инъекций,
    адресованных ИИ, не найдено. Реплики вида «не играйте в это» адресованы читателям Steam и трактуются
    как sentiment, не как команды. Один отзыв (id 225724518) — спам из невидимых Unicode-символов (шум).
  - Steam-отзывы описывают игру ЦЕЛИКОМ (комьюнити, драма, политика), а НЕ фичи. Прямых feature-request
    по химии/инструментам почти нет — доменный «спрос» здесь ВЫВОДИТСЯ из (а) энтузиазма к системам и
    (б) жалоб на сложность их освоения, а не из явных просьб. Точечные фиче-реквесты живут на GitHub/форуме/Reddit.
  - Доменные упоминания в позитиве часто «фоновые» (chef/botanist/medbay как антураж RP-баек), а не оценка
    механики. Негатив почти весь про людей/модерацию/политику, не про геймплейные системы.
  - Счётчики keyword-сканов индикативны (substring-матчинг, частичная RU-морфология); свои числа
    кросс-сверены с курированными theme_mentions из steam_meta.json (там значения ниже, набор уже).
  - Июнь 2026: инфраструктурный кризис (раскол WizDen/PJB, лежат hub/auth/forum/wiki) сильно окрашивает
    свежие отзывы — тема time-bound.
---

# Insight — Steam reviews (SS14 Playtest, app 1482520)

Итог по типам: **8 pain, 7 interest, 4 wish** (19 инсайтов). Продуктовая релевантность: **8 high, 5 med, 6 low**.

Ключевой вывод для продукта: Steam — слабый источник по *точечному* спросу на химию/инструменты (люди хвалят игру целиком, ругают комьюнити), но **очень сильный источник валидации самой идеи справочника**. Доминирующая продуктово-смежная боль — «крутая кривая обучения + непрозрачные механики», а самый частый способ её лечения, названный игроками, — **внешние справочники (Wiki, YouTube/Liltenhead)**. Именно эту нишу занимает Chemistry Database.

---

## Инсайты

### steam-01 — Крутая кривая обучения и непрозрачные механики
- **type:** pain
- **theme:** new-player
- **product_relevance:** high
- **demand_strength:** **strong.** learning-скан = 42 отзыва (6 negative); курированный theme_mentions.learning_curve = 40. Биграмма «learning curve» встречается 10×, «steep learning curve» 4×. Сигнал на всех уровнях playtime — и у новичков (10–60h), и у ветеранов на 2000h+, которые ретроспективно называют это главным барьером.
- **evidence:** Массово: «hugely steep learning curve», «poorly explained mechanics», «opaque as hell to get into» (EN). RU: «без 100 грамм не разберёшься», «разобраться новичку почти невозможно». Механики хвалят за глубину, но вход описывают как отпугивающий: игру «CANNOT solo», нужен чужой человек-наставник. Для справочника это прямой рынок: чем выше «skill floor», тем ценнее внешний reference.

### steam-02 — Нет внутриигрового обучения → игроки уходят во внешние справочники (Wiki, YouTube, Liltenhead)
- **type:** pain / wish
- **theme:** reference
- **product_relevance:** high
- **demand_strength:** **moderate-strong.** reference-скан (wiki/guide/tutorial) = 12; отдельно YouTube/видео-туториалы = 9 (все позитивные); «нет гайда/обучения» = 5 (2 negative). Явных «сделайте обучение» немного, но паттерн «учись сам через сторонние ресурсы» устойчив и повторяется в EN и RU.
- **evidence:** RU прямым текстом: «нет обучения, информацию … придётся узнавать самому через Wiki или YouTube» (id 208785495); «без гайдов не разберёшься» (id 214873162, RU). EN-негатив на 3.8h: «picked a role and there was no guide for the role». Позитив постоянно отсылает к YouTube-гайдам Liltenhead как обязательному онбордингу. **Это самая прямая валидация идеи внешнего справочника во всём источнике.**

### steam-03 — Химия — обожаемый, но тяжёлый для освоения скилл (высокий порог = спрос на калькулятор/гайд)
- **type:** interest
- **theme:** chemistry
- **product_relevance:** high
- **demand_strength:** **moderate.** chemistry-скан = 6 отзывов, все позитивные, у авторов 465–2035h (глубоко вовлечённые). Курированный theme_mentions.chemistry = 4. Частота низкая, но интенсивность и playtime высокие; химию называют отдельной причиной оставаться в игре.
- **evidence:** EN: «spend a hundred hours learning video game chemistry» (id 227124506, 8 слов); «i am the best doctor (chem is hard)» (id 216221622). RU: химик, который «только варил — 10 ДилоМет 1к1 из 10 химиков» (id 214749340). Т.е. химия воспринимается как самостоятельная мини-игра с большой кривой освоения — идеальный кейс для рецепт-калькулятора и справочника реагентов.

### steam-04 — Медотдел/врач — популярная высокоставочная роль; химия и медицина связаны
- **type:** interest
- **theme:** medical
- **product_relevance:** high
- **demand_strength:** **moderate.** medical-скан = 16 отзывов (1 negative); theme_mentions.medical = 13 (3 в негативе). Устойчивое присутствие: медик/парамедик/интерн/дефиб/хирургия как любимые роли и как «worse than a Space Dragon» хаос для новичка.
- **evidence:** EN: «Spend an hour making advanced chems and topicals for medbay» перед тем как медбей взрывают (id 203052077, 10 слов) — прямая связка chem→medbay. RU: любят играть за МедОтдел/парамедика (id 210978966). Медицина описывается как сложная и «прокачанная на многих серверах (добавлена хирургия и новые лекарства)» — спрос на медсправочник вытекает из сложности.

### steam-05 — Регрессии в медицине: вырезали вирусологию, сломаны хирургия/клонирование (официал)
- **type:** wish
- **theme:** medical
- **product_relevance:** high
- **demand_strength:** **weak-moderate.** Явно у 2 RU-отзывов, но оба конкретны и один из них — прямой вопрос-просьба вернуть механику. Частота низкая, зато это редкий *точечный контентный* сигнал в домене продукта.
- **evidence:** RU: «когда вернут вирусологию?» (id 209217975, 3 слова). RU-негатив: вирусологию «просто вырезали», «Хирургии нет, клонирование не работает», спасают только фанмоды (id 220890364). Показывает: (а) медицина/вирусология — ценимый контент, (б) он различается по форкам (официал урезал, фан-сборки держат) — аргумент за покрытие форков в БД.

### steam-06 — Ботаника и кулинария — «мягкие» входные роли; связка «выращивание → рецепты»
- **type:** interest
- **theme:** botany
- **product_relevance:** high
- **demand_strength:** **weak-moderate.** botany-скан = 8 (все позитивные), cooking-скан = 11 (1 negative); theme_mentions cooking = 7, botany = 3. Числа малы, но роли системно называются «лёгкими для старта» — т.е. это точка входа новичка, где справочник особенно нужен.
- **evidence:** EN/ES: botanist, chef, janitor — «easy roles … you can slowly understand things» (id 202582561). RU: повар «готовлю разные кушанья, сажаю растения для рецептов» (id 206189317) — прямая связка ботаника↔кухня↔рецепты. RU: инженер находит «книгу про готовку и делает пиццу из конопли» (id 218677053) — интерес к рецептам как к контенту. Ботаники «делают самокрутки» (id 224819753).

### steam-07 — Крафт и импровизированное оружие/постройки ценятся как система
- **type:** interest
- **theme:** crafting
- **product_relevance:** high
- **demand_strength:** **weak-moderate.** crafting-скан = 12 (2 negative). Смешанный набор (крафт предметов, постройка, но также «сборка сервера» в другом смысле), поэтому чистого сигнала меньше числа.
- **evidence:** EN: «crafting and survival systems … allowing you to actually make said makeshift weaponry» (id 220256877). RU: «можно построить дачу и пожрать вкусно» (id 201312559). Крафт-деревья и «makeshift weapons FEEL makeshift» — контент, который игроки исследуют; справочник по рецептам крафта закрывает этот интерес.

### steam-08 — Глубокие взаимосвязанные механики «плохо объяснены», UI/управление непоследовательны
- **type:** pain
- **theme:** ux
- **product_relevance:** med
- **demand_strength:** **moderate.** Проходит внутри learning-кластера (42), но выделяется отдельный под-сигнал про UI/контролы. Самый детальный отзыв (id 216218233, 6.5/10) разбирает это подробно и собрал прочтения.
- **evidence:** EN: управление «very overwhelming … inconsistent» (открытие инвентаря то на Z, то кликом), у ролей «wildly inconsistent bars of entry», «numerous poorly explained mechanics» (id 229282251, 216218233). Отсюда спрос на структурированный внешний справочник механик/интерфейсов, а не только рецептов.

### steam-09 — Токсичное, «клиповое» комьюнити и геймплей-геткипинг ветеранами
- **type:** pain
- **theme:** community
- **product_relevance:** low
- **demand_strength:** **strong.** toxic-community-скан = 26 (12 negative); в курированном theme_mentions community_admin = 43 (16 в негативе) — крупнейшая тема. Топовый по полезности негатив (id 206043531, +6) целиком про это.
- **evidence:** EN: комьюнити «extremely cliquey and toxic» (id 222933461); ветераны «knowledge and control gapped», новичок — «outcast … targeted first» (id 206043531). RU многократно: «вахтеры», «ЧСВ», «душные педали». Это доминирующая боль источника, но продуктом (справочником) почти не лечится — фиксируем как контекст оттока.

### steam-10 — Power-tripping админы, петти перма-баны, отклонённые апелляции
- **type:** pain
- **theme:** moderation
- **product_relevance:** low
- **demand_strength:** **strong.** moderation-скан (admin/ban/moderator) = 50 (16 negative). Несколько высокоминусовых негативов именно про это (id 224635213 +3, 222996555, 228352874).
- **evidence:** EN: бан за «historical name» от админа на «power trip» (id 224635213); «getting banned for insanely petty reasons» (6 слов); перма-бан «without warning … rejecting appeals … for incredibly petty reasons» (id 222996555). RU: «самые уебанские админы». Вне продуктового скоупа, но объясняет негативный фон и отток.

### steam-11 — Кризис управления 2026: раскол WizDen/PJB, лежат hub/auth/forum/wiki
- **type:** pain
- **theme:** moderation
- **product_relevance:** med
- **demand_strength:** **moderate.** Явно в 5+ отзывах, включая 2-й по полезности негатив (id 228424826, +5). Тема свежая (июнь 2026) и растущая; time-bound.
- **evidence:** EN: проект «going through a lot of drama … impacting authentication and hub servers», совет подождать (id 228424826, +5). «Wizard's Den servers were taken down for several weeks», «forums and wiki pages are also still down» (id 229533940, 9 слов). «PJP lost his damn mind, hopefully the steam launcher doesn't get destroyed» (id 225968677). **Продуктовый вывод:** когда официальные wiki/forum лежат, независимый сторонний справочник становится ЦЕННЕЕ (устойчивость к инфра-сбоям экосистемы) — med-релевантность.

### steam-12 — Культурно-политический бэклэш (жёстко вшитая LGBT-символика)
- **type:** pain
- **theme:** other
- **product_relevance:** low
- **demand_strength:** **strong-в-негативе, но поляризованный шум.** political-скан = 28 (12 negative). В негативах — частый триггер, но это война культур, не геймплей; многие такие отзывы низкокачественны/троллинг.
- **evidence:** EN: «Devs force their political beliefs … hard coded in» с просьбой сделать тоглом (id 220579002, +3). Контр-позиция тоже есть: игру хвалят как «delightfully queer friendly» (id 206084831). Для продукта нерелевантно; фиксируем как крупную долю негативного объёма и как шум, снижающий полезность Steam для доменного анализа.

### steam-13 — Аддиктивная глубина, огромная вариативность контента и эмерджентный RP — ядро любви
- **type:** interest
- **theme:** content
- **product_relevance:** med
- **demand_strength:** **strong.** content_depth theme_mentions = 37; addiction-скан = 24 (5 negative); roleplay = 26. Подкреплено playtime: 61% авторов имеют 500h+ (443/724). Это главный позитивный драйвер источника.
- **evidence:** RU: «героин бросить сложнее» (id 227689876, +2). EN: «Get addicted» после первого хаотичного раунда (id 212443044); «nigh infinitely replayable» (id 220256877). За 5400h «спокойно поиграть за все отделы» (id 206137336). **Вывод:** аудитория глубоко инвестирована и готова изучать сложные системы — целевой пользователь глубокого справочника/калькулятора.

### steam-14 — Скилл-гэп в бою/антаге: новичок не может осмысленно играть антагониста/сражаться против ветеранов
- **type:** pain
- **theme:** combat
- **product_relevance:** med
- **demand_strength:** **moderate.** combat-antag-скан = 22 (4 negative); theme_mentions.combat_antag = 8. Топовый негатив (+6) делает на этом акцент.
- **evidence:** EN: «Don't even dream about playing antagonist or taking part in any combat» — тебя «knowledge and control gapped» ветераны (id 206043531, +6, 12 слов). RU-цикл: заходишь → «убивают набегаторы» → терпишь → становишься робастом (id 210011263). **Продуктовый вывод:** гайды по антаг-стратегиям и боевым связкам (фича продукта) отвечают реальному разрыву новичок↔ветеран.

### steam-15 — «Хуже, чем SS13 / не хватает контента» — паритетный разрыв с SS13
- **type:** pain
- **theme:** content
- **product_relevance:** med
- **demand_strength:** **moderate.** ss13-compare-скан = 30 (10 negative). Устойчивое сравнение, часто с выводом «13 впереди».
- **evidence:** EN: «a worse version of Space Station 13» (id 209613378, 5 слов); «13 is way ahead in everything» (id 208034113); «feels hollow compared to ss13» (id 213478794). Мотивирует контентную полноту справочника (покрывать механики, которых ждут по аналогии с SS13).

### steam-16 — Трение поиска сервера: найти «свой», спрятать плохие, серверы заполнены/по заявке
- **type:** wish
- **theme:** ux
- **product_relevance:** low
- **demand_strength:** **weak-moderate.** server-discovery-скан = 7 (2 negative). Малый объём, но есть явный фиче-реквест.
- **evidence:** RU-фиче-реквест: «добавьте функцию "скрыть сервер для себя"» (id 209558467, «hide server for myself»). EN: «servers are few … 40 minutes just looking for places I could actually play» (id 210986471); совет «hop around to find a server you like». Слабо-релевантно продукту (каталог форков/серверов мог бы помогать выбрать), но это launcher-фича, не справочник.

### steam-17 — Разнообразие форков/сборок как ценность И источник путаницы (контент различается по билду)
- **type:** interest
- **theme:** content
- **product_relevance:** high
- **demand_strength:** **moderate.** Форки/сборки массово упоминаются (Goob, Delta-V, Starlight, Funky, Monolith, RMC14, Corvax, Мёртвый Космос/МК, СанРайз, Империал и др.) в десятках отзывов; «всё зависит от сервера/сборки» — рефрен.
- **evidence:** EN: «Find a server that fits your taste!!» с раскладкой по форкам (id 224272926). RU: «всё зависит от сборки сервера», «Лучшее рп в 2025». Механики/контент (в т.ч. медицина, антаги, реагенты) различаются по билду. **Прямая валидация мультифорковой архитектуры БД (18 форков):** игроки реально жонглируют билдами и нуждаются в справочнике, различающем контент по форку.

### steam-18 — Playtime-гейтинг ролей: интерн-роли блокируются, медленные новички наказаны
- **type:** pain
- **theme:** new-player
- **product_relevance:** low
- **demand_strength:** **weak.** 2 отзыва явно (id 216218233, 214473839). Нишево, но конкретно.
- **evidence:** EN: medical intern / cadet «LOCKED after a few hours of playtime … insane considering some may be slow learners» (id 216218233). Косметика/ранги требуют «number of hours … really ought not take as long» (id 214473839). Слабо-релевантно; внешний гайд частично компенсирует (учиться, пока роль ещё открыта).

### steam-19 — Приватность: сбор HWID/IP, автобан по VPN
- **type:** pain
- **theme:** other
- **product_relevance:** low
- **demand_strength:** **weak.** 3 отзыва (id 217281215 pt-BR, 214228831, 218961455). Малый объём, продуктом не адресуется.
- **evidence:** pt-BR: «using HWID to collect data from the users» — против даже при симпатии к игре (id 217281215). EN: серверы «autoban you if you use a VPN because they want to collect your IP» (id 218961455). Фиксируем как минорную боль-контекст.

---

## Chemistry / tools callouts (приоритетный фокус)

Сводка по всем доменным упоминаниям (keyword-скан по 724; в скобках — курированный theme_mentions):

| Домен | Отзывов (скан) | Из них negative | theme_mentions | Характер сигнала |
|---|---|---|---|---|
| **reference (wiki/guide/tutorial)** | 12 (+9 YouTube, +5 «нет гайда») | 3 | — | **Самый продуктово-ценный.** Прямые жалобы «нет обучения → учись через Wiki/YouTube»; «no guide for the role». Валидирует справочник. |
| **learning curve / mechanics** | 42 | 6 | 40 | Крупнейшая продуктово-смежная боль. Высокий порог = спрос на внешний reference. |
| **medical** | 16 | 1 | 13 | Медбей/врач/хирургия — любимая тяжёлая роль. + регрессии (вирусология вырезана, хирургия/клон сломаны — 2 RU). |
| **crafting** | 12 | 2 | — | Makeshift-оружие, постройки; крафт-деревья исследуются. |
| **cooking** | 11 | 1 | 7 | Chef — «мягкая» входная роль; связка «рецепты↔выращивание». |
| **botany** | 8 | 0 | 3 | Botanist — входная роль; выращивание под рецепты кухни. |
| **chemistry** | 6 | 0 | 4 | Мало, но интенсивно: «100 часов учить игровую химию», «chem is hard», варка ДилоМет. Высокий порог → калькулятор/справочник реагентов. |

Кросс-доменные выводы для продукта:
1. **Порог обучения — главный крючок.** Химия, медицина, инженерия единодушно названы «тяжело выучить самому»; игроки уже платят за это внешними справочниками — Chemistry Database замещает YouTube/Wiki в самой болезненной точке.
2. **Связка домены.** Отзывы сами сшивают chem→medbay, botany→cooking(recipes), crafting→combat. Это подтверждает ценность продукта, который держит рецепты/реагенты/крафт/ботанику/эффекты в одном месте.
3. **Мультифорковость реальна.** Игроки массово различают контент по сборкам; медицина/реагенты отличаются между официалом и форками (steam-05, steam-17) — покрытие 18 форков в БД отвечает фактическому поведению.
4. **Устойчивость к инфра-сбоям.** Во время кризиса 2026 официальные wiki/forum лежат (steam-11) — независимый сторонний справочник ценнее именно сейчас.
5. **Точечных feature-request по химии на Steam почти нет** — за детальным спросом (конкретные реагенты, баги рецептов, запросы фич) идти на GitHub/форум/Reddit; Steam даёт валидацию *направления*, не бэклог.

---

## Top 5 for this source (сильнейшие сигналы спроса)

1. **Крутая кривая обучения + непрозрачные механики (steam-01).** demand: **strong** (learning 42/meta 40; сигнал на всех playtime). product_relevance: **high**. Крупнейшая продуктово-смежная боль и главный аргумент существования справочника.
2. **Токсичное комьюнити + power-tripping админы/баны (steam-09 + steam-10).** demand: **strong** (moderation 50/16neg; community_admin meta 43; топ-негатив +6). product_relevance: **low**. Крупнейшая *сырая* боль источника — но справочником не лечится (контекст оттока).
3. **Зависимость от внешних справочников — нет внутриигрового обучения → Wiki/YouTube/Liltenhead (steam-02).** demand: **moderate-strong** (reference 12 + youtube 9 + «нет гайда» 5). product_relevance: **high**. Прямая валидация продукта: игроки уже ищут ровно то, что он даёт.
4. **Аддиктивная глубина и вариативность контента / эмерджентный RP (steam-13).** demand: **strong** (content_depth 37, addiction 24, roleplay 26; 61% с 500h+). product_relevance: **med**. Целевой пользователь — глубоко инвестированный игрок, готовый изучать сложные системы.
5. **Химия/медбей как обожаемые-но-тяжёлые скиллы + регрессии медицины (steam-03 + steam-04 + steam-05).** demand: **moderate** (chemistry 6 + medical 16, все высокого playtime; вирусология/хирургия/клон). product_relevance: **high**. Ядро домена продукта: высокий порог освоения → спрос на рецепт-калькулятор и медсправочник.

# Fork outreach — шаблоны обращений и гайдов

Правила, выведенные из опыта: официальный форум удалил наш анонс в апреле 2026; в Dead Space сработало **сначала спросить модераторов, потом разместить гайд в их канале гайдов**. В треде конкурента в Dead Space зафиксирован скепсис «сделано ИИ, значит бесполезно», поэтому в текстах нет общих обещаний, только проверяемые вещи: данные из репозитория форка, ссылка на исходник у каждого рецепта, открытый код.

Плейсхолдеры: `{FORK}` имя форка как его называют игроки, `{LINK}` ссылка из [tracking.md](tracking.md) (для RU-сообществ — вариант с `?lang=ru`, иначе сайт откроется на английском), `{REAGENTS}` / `{REACTIONS}` цифры из [contacts.md](contacts.md), `{PARENT}` родительский форк для наследников (Funky → Goob, Monolith → Frontier, ADT → Corvax, Fish → Sunrise), `{MAPS}` число карт, если для форка они запечены.

---

## 1. Обращение к модераторам / мейнтейнерам (RU)

Куда: личное сообщение модератору или пост в канале для связи с администрацией; не в общий чат.

> Привет! Я автор NanoTrasen ChemDB, открытого справочника химии для SS14: {LINK}
>
> Данные для него парсятся прямо из репозитория {FORK} (ветка {BRANCH}), так что в нём есть ваши {REAGENTS} реагентов и {REACTIONS} реакций поверх ванили{, включая наследие {PARENT}}. Есть калькулятор «сколько чего купить под N юнитов», таблица «чем лечить какой урон» с учётом видов, пресеты на начало смены{, карты станций с поиском предметов}. Сайт бесплатный, без рекламы, код под GPL-3.0 на GitHub, у каждого рецепта ссылка на исходный YAML.
>
> Можно ли разместить короткий гайд о нём в вашем канале гайдов (и/или ссылку в вики в разделе полезных ресурсов)? Текст пришлю на согласование, формат подстрою под ваши правила. Если по {FORK} что-то показано неверно, скажите, исправлю в ближайшие дни: ошибки по форкам я правлю в первую очередь.
>
> Спасибо!

## 2. Обращение к модераторам / мейнтейнерам (EN)

> Hi! I'm the author of NanoTrasen ChemDB, an open chemistry reference for SS14: {LINK}
>
> The data is parsed straight from the {FORK} repository ({BRANCH} branch), so it covers your {REAGENTS} reagents and {REACTIONS} reactions on top of vanilla{, including what you inherit from {PARENT}}. It has a "how much of what to buy for N units" calculator, a "what heals which damage" table that knows about species, shift-start presets{, and station maps with item search}. It's free, no ads, GPL-3.0 on GitHub, and every recipe links to its source YAML.
>
> Would it be okay to post a short guide about it in your guides channel (and/or add a link to the wiki's useful-resources section)? I'll send the text for approval first and follow whatever format you use. If anything about {FORK} is shown incorrectly, tell me and I'll fix it within days; fork-specific errors go first in the queue.
>
> Thanks!

Для форков с полной заменой химии (RMC14, CMU, Russian CM, Space Stories MC) вместо «поверх ванили» писать: «вся химия {FORK}: {REAGENTS} реагентов, {REACTIONS} реакций, включая переименованные» / "the whole {FORK} chemistry: {REAGENTS} reagents and {REACTIONS} reactions, renamed ones included".

## 3. Гайд для канала гайдов (RU)

Заголовок: **Химия {FORK} без альт-таба: справочник, калькулятор и «чем лечить»**

> {LINK}
>
> Что это: открытый справочник химии SS14, данные берутся из репозитория {FORK}, поэтому рецепты, температуры и эффекты совпадают с сервером, а не с ванильной вики.
>
> Что внутри:
> • Карточки реагентов: рецепт, эффекты, передоз, из чего и как получить, ссылка на исходный YAML.
> • Калькулятор и batch: выбираете, что и сколько сварить, получаете полный список закупки по шагам.
> • «Чем лечить»: таблица по типам урона и видам (у {FORK} учтены ваши виды).
> • Пресеты на начало смены: мед-химия стартовая и продвинутая, бар, ботаника.
> {• Карты станций: где лежит предмет, поиск по названию ({MAPS} карт {FORK}).}
> • Сравнение с другими форками: что у {FORK} отличается от ванили{ и {PARENT}}.
> • Режим «окно рядом с игрой» (PiP) и офлайн: работает как приложение, без интернета после первого открытия.
> • Интерфейс на русском.
>
> Бесплатно, без рекламы, исходники под GPL-3.0: https://github.com/MikameO/space-station-recipes
> Нашли ошибку по {FORK}? Напишите здесь в треде или в Issues на GitHub: такие правки идут первыми.

Для RU-сообществ Dead Space-формат подтверждён: после этого гайда сайт получил 133 пользователя за 47 дней.

## 4. Guide for the guides channel (EN)

Title: **{FORK} chemistry without alt-tabbing: reference, calculator and "what heals"**

> {LINK}
>
> What it is: an open SS14 chemistry reference that reads the {FORK} repository directly, so recipes, temperatures and effects match your server rather than the vanilla wiki.
>
> Inside:
> • Reagent cards: recipe, effects, overdose, where and how to get it, link to the source YAML.
> • Calculator and batch planner: pick what to brew and how much, get the full shopping list step by step.
> • "What heals": table by damage type and species ({FORK} species included).
> • Shift-start presets: starter and advanced med-chem, bar, botany.
> {• Station maps: where an item spawns, searchable by name ({MAPS} {FORK} maps).}
> • Fork diff: what {FORK} changes compared with vanilla{ and {PARENT}}.
> • Picture-in-picture companion window and offline mode: installs as an app, works without internet after the first load.
>
> Free, no ads, GPL-3.0 source: https://github.com/MikameO/space-station-recipes
> Something wrong for {FORK}? Reply in this thread or open a GitHub issue; fork-specific fixes go first.

## 5. Строка для вики (раздел «Полезные ссылки» / "External tools")

RU:
> **NanoTrasen ChemDB** — справочник химии по данным репозитория {FORK}: рецепты, калькулятор закупки, «чем лечить», пресеты смены. Открытый код (GPL-3.0). {LINK}

EN:
> **NanoTrasen ChemDB** — chemistry reference built from the {FORK} repository: recipes, purchase calculator, "what heals", shift presets. Open source (GPL-3.0). {LINK}

## 6. После публикации

- Поблагодарить, попросить закрепить сообщение или добавить в список ресурсов канала: закреп даёт ровный поток (Dead Space: 5–6 новых в день весь август), незакреплённый пост гаснет за сутки.
- Записать в [contacts.md](contacts.md): дата, канал, кто разрешил, какая ссылка.
- Первые две недели заглядывать в тред: вопросы и ошибки по форку, найденные там, переносить в ROADMAP (прошлые запросы из Dead Space терялись).

## 7. Чего не делать

- Не постить без разрешения модераторов и не дублировать в несколько каналов одного сервера.
- Не обещать фичи, которых нет (Библиотека документов не упоминается: новая, не проверена аудиторией). Ordnance — исключение для Space Stories: таб существует только на их данных и адресован их роли ОТ, см. [stories-guide.md](stories-guide.md); у остальных форков таба нет вовсе, там не упоминать.
- Не использовать слова «ИИ», «автоматически сгенерировано» в тексте гайда; честный ответ на вопрос «это ИИ?»: данные парсятся из YAML репозитория скриптом, у каждой цифры есть ссылка на исходник, ошибки правятся по сообщениям игроков.
- Не размещать в сообществах форков, которых нет в реестре (Spellward, SS220, Lust, Stalker, Euphoria, Imperial): для них сайт покажет ваниль, и первое впечатление будет «у нас не так».

# Fork outreach — карта сообществ форков реестра

**Снимок:** hub `https://hub.spacestation14.com/api/servers` 2026-09-12 ~11:30 MSK (182 сервера онлайн, 1995 игроков); `/info` ответили 154 сервера (Discord/вики/репо берутся из их `links[]`), 28 не ответили (в основном RU-хостинги: Corvax, ARCANE, Russian MC). Добор: README репозиториев и GitHub API (`homepage`). Сырые ответы: `hub_servers.json`, `hub_info.json` в scratchpad сессии; воспроизводится скриптом из [tracking.md](tracking.md) §3 по памяти проекта `ss14-server-repo-discovery`.
**Колонки:** «Свои» = реагенты/реакции с `source == fork` в data.json (наследники получают ещё родителя и ваниль; TC = полная замена химии, ваниль не показывается). «Спрос» = выборы форка в source-фильтре за окно чекпойнта-3 (2026-07-28 → 09-12). «Онлайн» = игроков на серверах этого форка в момент снимка.

## 1. Форки реестра (21)

| fork_id | Сообщество | Язык | Онлайн | Discord | Вики / сайт / форум | Репо в реестре | Свои | Карт | Спрос | Приоритет | Статус |
|---|---|---|---:|---|---|---|---|---:|---:|---|---|
| deadspace | Мёртвый космос (Титан, Деймос, Фобос, Союз-1, Эрида, Колосс) | RU | 107 (+9, +6, +20) | discord.gg/ds14 · Эрида: discord.gg/FCGsMYtMKp · Колосс: discord.gg/sector-colossus | wiki.deadspace14.net | dead-space-server/dead-space-14 (хаб отдаёт …/space-station-14-fobos: проверить переезд) | 22 / 14 | 8 | 53 | база | **размещено 2026-07-27** в `#📒┆гайды` с разрешения модераторов; просить закреп + строку в вики; ссылку не менять |
| stories_cm | Space Stories — Marine Corps Core | RU | 128 | discord.gg/PUqaMx7ryn (hub) · discord.gg/space-stories-mc (README) | spacestories.club/Marine_Corps · forum.spacestories.club | MetalSage/space-stories-cm14 | 18 / 12 (TC поверх RMC14) | — | — | RU-2 | не начато; на этом форке построен Ordnance |
| fish | Рыбья станция: Персей («помощь новичкам») | RU | 76 | discord.gg/fishstation | fish.station.wiki.shizainc.com · ss14.forum.shizainc.com · t.me/sunrise_ss14 | space-sunrise/fish-station | 10 / 11 (+ sunrise 37 / 46) | — | 7 | **RU-1 (пилот)** | не начато; сервер для новичков = лучшая аудитория для гайда по химии |
| adt | Время Приключений (ADT) | RU | 70 | discord.gg/NY3KDNuH9r | wiki.adventurestation.ru · boosty.to/adventuretime | AdventureTimeSS14/space_station_ADT | 100 / 77 (+ corvax 8 / 8) | — | 10 | RU-2 | не начато; большая своя химия — сильный аргумент |
| corvax | Corvax (Войд, Frontier, Вега, Люмен, Элизиум, Мейн, Вайтлист, Fallout) | RU | ~133 | discord.ss14.ru | wiki.station14.ru (CC BY-NC-SA) · ss14.ru · corvaxforge.ru | space-syndicate/space-station-14 | 8 / 8 | — | 6 | RU-3 | не начато; крупнейшая RU-сеть, но наш источник даёт только 8 реагентов, а CorvaxGoob-серверы на Goob-базе — сверить данные до обращения; `/info` и сайты с нашего IP таймаутят |
| rucm | Russian Marine Corps / [RU] Colonial Marine Corps | RU | 21 (+0) | discord.gg/VWJZFUWgRc (hub RU CMC); README указывает на discord.gg/colonialmarines (CMU) — уточнить | station14.ru/wiki/Портал:Colonial_Marines | flex5hybrid/RussianCM | 0 / 0 (TC: наследует CMU 22 / 16 + RMC14 113 / 68) | 6 | 15 | RU-3 | не начато |
| sunrise | Sunrise → **Stellar Stories** (ребрендинг: stellarstories.ru) | RU | основные серверы не в хабе (только Mapping/Test) | discord.gg/sunrise14 (hub) · discord.gg/VTBCu2MSS8 (README) | sunrise14.top/wiki · last.makura.wiki | space-sunrise/sunrise-station | 37 / 46 | — | <6 | RU-4 | не начато; сначала выяснить, где живёт аудитория после ребрендинга |
| rmc14 | Rouny's Marine Corps (Alamo, Normandy) + UA RMC | EN | 157 | discord.gg/rouny · UA: discord.gg/MMUsHnH2Tt | wiki.rouny-ss14.com · ss14.com.ua | RMC-14/RMC-14 | 113 / 68 (TC, 20 переименованных) | 7 | 21 | **EN-1 (пилот)** | не начато; самый населённый EN-сервер хаба |
| misfits | Misfits: Nuclear Wasteland 2296 | EN | 32 | discord.com/invite/8a6y8esphP | wiki.misfitsystems.net · nuclear14.com | Misfit-Sanctuary/nuclear-14 | 151 / 88 | 6 | **49** | **EN-1 (пилот)** | не начато; №1 по спросу в окне и по объёму своей химии |
| goob | Goob Station (Alpha, Basileus, Sigma) | EN | 65 | discord.gg/goobstation (+ RYNBE6fUW2, bpHJneTjUb с сайта) | wiki.goobstation.com · forums.goobstation.com · goobstation.com | Goob-Station/Goob-Station | 100 / 85 | 7 | 46 | EN-2 (запасной пилота) | не начато; родитель Funky/Trauma/Omu |
| starlight | Starlight (Alpha, Beta, Gamma, Delta, Epsilon) | EN | 162 (+11) | discord.gg/ZDNwdEeetH | wiki.starlight.network · starlight.network | **fskx/starlight-ss14 (6★, homepage spacestation14.io)** — живой апстрим **ss14Starlight/space-station-14 (123★)** | 27 / 10 | 8 | 28 | EN-2 после проверки | **заблокировано до сверки репо**: возможно, реестр смотрит на устаревшее зеркало |
| deltav | Delta-V (Apoapsis, Periapsis) | EN | 46 | discord.gg/deltav | wiki.deltav.gay · deltav.gay | DeltaV-Station/Delta-v | 124 / 125 | 8 | 20 | EN-2 | не начато |
| omu | Omu Station (Pelican, Magpie) | EN | 47 | discord.gg/omustation | wiki.projectomu.org · projectomu.org | ProjectOmu/OmuStation | 20 / 16 (+ goob) | 8 | 11 | EN-3 | не начато |
| funky | Funky Station (Cirno, Yoshika, Scarlet) | EN | 40 (+2) | discord.gg/5FqgaAA2qF | forum.funkystation.org · funkystation.org (вики нет) | funky-station/funky-station | 103 / 101 (+ goob) | 7 | 16 | EN-2 | не начато; issue #2 (Funky vs Goob Oxandrolone) — закрыть до обращения |
| frontier | Frontier (Hypatia, Maunder) | EN | 32 | discord.gg/rKNHDAGPvd | frontierstation.wiki.gg · frontierstation14.com | new-frontiers-14/frontier-station-14 | 33 / 21 | 7 | 13 | EN-3 | не начато |
| monolith | Monolith (Babel) | EN | 21 | discord.gg/mxY4h2JuUw | вики нет | Monolith-Station/Monolith | 28 / 25 (+ frontier) | 7 | 20 | EN-3 | не начато; Monolith просили в комментариях Steam-гайда (Méroulkas, 2026-04-20) — ответить там же |
| trauma | Trauma Station | EN | 26 | discord.traumastation.com | wiki.traumastation.com | Trauma-Station/Trauma-Station | 44 / 43 (+ goob) | 8 | 12 | EN-3 | не начато |
| cmu | Colonial Marines Universe | EN | 47 | discord.gg/colonialmarines | forum.cm-ss13.com · cm-ss13.com/wiki | AU-14/ColonialMarinesUniverse | 22 / 16 (TC поверх RMC14) | 6 | 17 | EN-3 | не начато |
| carpmosia | Carpmosia | EN | 7 | discord.gg/ZACStvA8uV | вики нет | carpmosia/carpmosia (dev) | 12 / 15 | 7 | 8 | EN-4 | не начато |
| harmony | Harmony | EN | нет в хабе | не найден (нет в README, вики и `/info`) — искать на harmony14.com | wiki.harmony14.com · harmony14.com | ss14-harmony/ss14-harmony | 8 / 7 | — | <6 | EN-4 | не начато |
| vanilla | Wizard's Den (Lizard, Leviathan, Salamander, Raptor) | EN | 141 | discord.spacestation14.io | wiki.spacestation14.io · forum.spacestation14.io | space-wizards/space-station-14 | 407 / 316 | 14 | 52 | отдельно | **форум удалил наш анонс в апреле 2026**; идти только через вики («External resources») или Discord-канал ресурсов с разрешения |

## 2. Предлагаемый пилот (3 сообщества, 14 дней)

| Слот | Сообщество | Почему |
|---|---|---|
| RU | Рыбья станция (fish) | 76 онлайн, сервер с акцентом на помощь новичкам, активная вики и форум; данные Sunrise-семейства в реестре есть |
| EN | Misfits (misfits) | №1 по выборам форка в окне (49) и по объёму своей химии (151 реагент): там уже есть спрос, который сайт удовлетворяет |
| EN | Rouny's Marine Corps (rmc14) | 157 онлайн, полная замена химии, которую вики ванили не покрывает; у нас 113 реагентов RMC14 |
| запас | Goob, ADT, Space Stories MC | крупные, данные есть; Goob как родитель трёх форков |

Dead Space — не часть пилота, а база для сравнения.

## 3. Предпосылки до первого письма

1. Сверить источник Starlight в реестре (`fskx/starlight-ss14` против `ss14Starlight/space-station-14`) — иначе в крупнейшем EN-сообществе покажем чужую химию.
2. Ответить Aliasen в Discord (ждёт с 2026-07-31) и закрыть issue #2 (Funky/Goob) — первые контакты в сообществах будут проверять именно такие вещи.
3. Обновить EN Steam-гайд (текст апреля, 304 читателя) с той же UTM-схемой (`utm_medium=steam-guide`).
4. Добавить срез `utm` в `export_metrika_stats.py`, чтобы чекпойнт-4 посчитал волну без полного свипа.
5. Желательно: форма обратной связи на сайте (параллельная сессия) до волны, чтобы не зависеть от GitHub-аккаунта у игроков.

## 4. Крупные сообщества вне реестра (кандидаты на добавление форка, не постить)

| Сервер(ы) | Язык | Онлайн | Репо | Discord |
|---|---|---|---:|---|
| Spellward: Нексар / Soma / Therion / Imperial Space / Eridani | RU+EN | 53 + 41 + 22 | imperial-space/SW-public | discord.gg/BXjg7QGZ9Z, discord.gg/N3npU2cmXX |
| Lust Station (Спектрум, Венера) — Sunrise-семейство | RU | 74 | space-sunrise/lust-station | discord.gg/qillu-station |
| ARCANE (Нирвана, Атараксия) | RU | 73 | `/info` не ответил | — |
| SS220 (Orion, Perseus, Exodus) | RU | 42 | SerbiaStrong-220/space-station-14 | discord.gg/ss220 |
| Stalker / Zona 14 | RU/EN | 40 | — | discord.gg/UkpqFznQfm |
| Euphoria / Floof | EN | 31 | Floof-Station/Panta-Rhei | discord.com/invite/euphoriastation |
| SCP: Project Fire — Sunrise-семейство | RU | 20 | space-sunrise/fire-station | discord.gg/scp-project-fire-ss14 |

Spellward и Lust — самые крупные непокрытые аудитории; Lust и Fire добавляются дёшево (та же база, что Fish).

## 5. Журнал размещений

| Дата | fork_id | Где | Кто разрешил | Ссылка (UTM) | Примечание |
|---|---|---|---|---|---|
| 2026-07-27 | deadspace | Discord `#📒┆гайды` | модераторы DS14 | `…#src=deadspace` (без UTM) | 133 юзера / 47 дней; не менять |

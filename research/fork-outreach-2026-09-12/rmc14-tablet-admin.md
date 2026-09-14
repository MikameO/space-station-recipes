# Командный планшет — пакет для администрации RMC14 (Rouny's Marine Corps)

**Кто отправляет:** владелец проекта, лично, через канал персонала RMC14 (тикет или обращение к администрации в их Discord <https://discord.gg/rouny>), не в общих каналах — правило «Advertising and Spam» запрещает продвигать внешние сообщества.
**Основание:** Space Stories отказала 2026-09-14 ([решение](../../docs/decisions/2026-09-14_stories-tablet-refused.md)); ROADMAP V13.
**До письменного «да» ничего не включается:** ключ `rmc14-k1` не выпущен, в `tactical/policy/rmc14.json` статус `none`, на сайте комната скрыта.

## Что говорят правила RMC14 (сверено 2026-09-14 по `Resources/ServerInfo/Guidebook/_RMC14/Rules/` в RMC-14/RMC-14, master)

- **Zero Tolerance → Information Fairness:** «Don't share in-game information with anyone playing, through any ooc/external means.» Голосовой чат и OOC разрешены, пока в них нет внутриигровой информации. Комната планшета — это ровно внешний канал, поэтому нужна явная санкция и исключение.
- **Zero Tolerance → Exploits and External Programs:** «Using an external program to calculate coordinate locations is permitted.» Публичная тактическая карта и калькулятор уже разрешены; планшет — нет.
- **Admin Decisions Are Final** и **Advertising and Spam** — обращаться только к персоналу, не спорить с решением, не рекламировать сайт в игре и каналах.
- **Command rules:** командные роли держатся более высокого стандарта (ролевые баны без предупреждения) — ещё одна причина не тестировать без «да».

## Заметки владельцу (в письмо не входят)

- Об отказе Stories в письме не пишем; если спросят — отвечаем честно: «Stories отказала, доступ для них закрыт».
- Демо в письме открывает карту RMC14 и играет выдуманных офицеров, ни с игрой, ни с сервером комнат не связано.
- Ключ и ссылки «отключить» и «включить» — только после «да», отдельным личным сообщением держателю.
- Если ответ «нет» или тишина три недели — серия V замораживается; запасной путь — предложить внутриигровые функции в апстрим (рядом с PR «Tacmap Rework» #9194), и это решение владельца.

## Письмо в Discord (два сообщения, лимит 2000 символов)

**Message 1 — the request.**

> Hi! I'm the author of a tactical map and coordinate calculator for RMC14 planets: https://mikameo.github.io/space-station-recipes/tactical.html — your rules already allow external programs for calculating coordinates, and that is all the public page does.
>
> I've also built a "command tablet": a shared room for one round where a staff officer sends the mortar crew strike and position requests and short tasks, and the crew answers with statuses. Officers see where the crew says its mortar is and what it can reach, and agree on one coordinate calibration.
>
> Under Information Fairness this is sharing in-game information through external means, so for RMC14 it is switched off: nobody can create a room without a server key, and the room is hidden on the site. I'm asking before anyone uses it.
>
> My request:
> 1) a written yes or no to a closed test on Alamo with a few volunteer officers;
> 2) if that goes fine, your decision on a four-week pilot with a written exception to Information Fairness;
> 3) who on your staff would hold the kill switch (sent privately).
>
> Details in the next message. A demo with made-up officers, not connected to the game or any server: https://mikameo.github.io/space-station-recipes/tactical.html#map=rmc14/chances&room=demo

**Message 2 — the details.**

> **What the tablet does not do**
> • Reads nothing from the game: no positions, no chat, no client memory. Everything is typed in by hand.
> • Tracks nobody. A member shares their position with one button; the map shows how many minutes ago.
> • Lifts no limit of the in-game tactical map and does not replace radio: only what was already said on comms goes in.
> • Keeps nothing past the round: a room lives up to 3 hours, its log 1 hour more. No accounts, no personal data — posts and character callsigns only. Free and open source.
>
> **How you control it**
> • Server key: only the people you choose can create a room.
> • Your kill switch: a "disable" link stops new rooms and freezes running ones within a minute, without us. An "enable" link undoes it.
> • "Radio silence" for command freezes a room, and it shows in the log.
> • An observer link for moderators (read-only) and a downloadable room log: time, post, in-game coordinates, one line per action.
>
> **Exception text, if you decide to pilot:**
> "Using an external command tablet listed by the administration as an allowed tool is permitted if: (a) it reads nothing from the game; (b) only information already given over in-game comms goes into it; (c) only living players in command and fire-support roles of the current round have access; (d) when comms are lost, command turns on Radio Silence and it shows in the log; (e) the administration has an observer link, the full log and its own kill switch."
>
> The in-game tacmap rework (#9194) is still open; the tablet doesn't compete with it, and your kill switch turns it off once the game has the same. I'd also be glad to help bring the parts you like into the game instead.

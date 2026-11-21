# Scorptech-x402-mcp: паспорт x402 v2 через MCP-транспорт (мини-ТЗ №6)

**Дата прогона:** 2026-11-21, ~03:44–04:05 UTC · **Субъект:** Kholley43/scorptech-x402-mcp → `https://scorptech.it.com/api/x402/mcp/lite` (ScorpTech x402 Lite 1.2.0, stateless Streamable HTTP) · **Proof-запись:** #0027 `argus-finding-0027` в реестре Argus (подпись probe-ключ `argus-lab-probe-2026q4`)

**Вердикт одной строкой:** x402 v2 на MCP-транспорте устроен иначе, чем HTTP-402 путь — челлендж приходит **внутри MCP-результата `isError`** (HTTP 200), платёж кладётся в `params._meta["x402/payment"]`, подписывается EIP-3009 `TransferWithAuthorization` в домене «USD Coin» v2 (chainId 8453); наша подпись распознана фасилитатором как валидная, отказ — только по балансу (`invalid_exact_evm_insufficient_balance`); платёжные ворота стоят **до** валидации аргументов; **затрачено $0.00**, settle-транзакций нет.

---

## 1. Условия прогона (честно об ограничении)

В песочнице нет финансируемого кошелька: burner `0x60f759…436A` из прогона №3 на Base mainnet имеет **0 нативного ETH и 0 USDC** (проверено через `mainnet.base.org` и `base.publicnode.com`, снапшоты в evidence). Поэтому платные вызовы не могли завершиться settle в принципе — регламент «≤$0.01, ≤3 платных вызова» исполнен с запасом: **$0.00, 0 settle**. Вместо этого прогон даёт полный **паспорт транспорта** до шага денег: free-путь, челленджи, подпись, реакцию фасилитатора и негативы. Ключ burner-а цепочко-агностичный — это та же «кошка», которую выйдет засеттлить на Base после пополнения, kit для платного прогона готов.

## 2. Коннект и каталог

- `initialize` → `protocolVersion 2025-06-18` принят, `serverInfo`: `scorptech-x402-lite 1.2.0` («Pay-per-call tools for agents: web data, security and OSINT, SEC and public data, Solana/EVM lookups, developer utilities»), иконка `icon.png` 400×400. Сервер **stateless**: заголовка `Mcp-Session-Id` нет, каждая POST-прокладка самодостаточна.
- `tools/list` на lite: 2 тулзы — `search_tools` (free) и `call_tool` (платная обёртка над всем каталогом). На полном энпоинте `/api/x402/mcp`: **1020 тулз одним ответом 1.14 МБ, без курсорного пейджинга** (README говорит «1,014+» — цифра выросла).
- Цены: **все 1020 тулз декларируют цену в description** (`Price: $X USDC per successful call`); распределение: 806×$0.001, 54×$0.002, 34×$0.003, 59×$0.005, 50×$0.01, 9×$0.02, 1×$0.03, 1×$0.05 (`site_security_audit`) — совпадает с обещанием README «most $0.001, none more than $0.05».
- `GET /api/x402/health` → 200 (266 B), `GET /api/x402/docs/all` → 837 КБ каталога — обе бесплатно, обе в evidence.
- `search_tools` (free) — живые запросы: `ping` → 23 совпадения (группа crypto), `url parse` (group=dev) → 1, `cusip` → 3, `solana token` (crypto) → 10. Выбранные 3 кандидата $0.001 из разных групп: **`ping`** (crypto — штатный тестовый маршрут x402: «the cheapest way to prove your x402 client signs a USDC payment and the facilitator settles it»), **`url_parse`** (dev), **`cusip_validate`** (osint/fin-ids). Веб-морды по сетям у тулз нет — сеть выбирается в `accepts[]` челленджа, поэтому «приоритет Base» реализуется выбором accept'а.

## 3. Паспорт транспорта: как выглядит PaymentRequired в MCP-фрейме

Вызов платной тулзы без платежа (`tools/call` → `call_tool {name, arguments}`) возвращает **HTTP 200** и MCP-результат `isError: true`, в `content[0].text` которого лежит JSON челленджа:

```json
{"x402Version": 2, "error": "Payment required",
 "resource": {"url": "https://scorptech.it.com/api/x402/mcp/lite",
              "description": "Paid x402 test route...", "mimeType": "application/json",
              "serviceName": "ScorpTech Recon", "tags": ["x402","agent-payments","ping","test","health"]},
 "accepts": [ ...два accept'а ниже... ],
 "extensions": {"bazaar": {"info": {"input": {"type": "mcp", "toolName": "ping",
              "description": "...", "transport": "streamable-http", "inputSchema": {...}}}}}}
```

Что в accepts (обе сети, выбор за клиентом):

| | Base (наш выбор) | Solana |
|---|---|---|
| scheme / network | `exact` / `eip155:8453` | `exact` / `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| amount | `1000` = **$0.001** (6 знаков USDC) | `1000` = $0.001 |
| asset | native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| payTo | `0xBC72c556166A3d3317c673DDB21Fb088C10088A0` | `CRygpSHMuZAMHZSCm2Z2H3DDYMZBKUSvcsme1hsgebbD` |
| extra | `{"name": "USD Coin", "version": "2"}` → домен EIP-712 | `{"feePayer": "CjNFTjvBhbJJd2B5ePPMHRLx1ELZpa8dwQgGL727eKww"}` — **комиссии платит фасилитатор** |
| timeout | `maxTimeoutSeconds: 300` | 300 |

**Что подписывается** (exact/EVM): EIP-3009 `TransferWithAuthorization` — `from, to, value, validAfter, validBefore, nonce` — в домене, заданном самим челленджем: `name "USD Coin", version "2", chainId 8453, verifyingContract = адрес USDC`. Тот же FiatTokenV2-домен, что и в прогонах QDay (№3) — семантика переиспользуется один-в-один. `value=1000` жёстко равен цене тулзы; окно 300 с.

**Payload-конверт** (v2, MCP): `{x402Version: 2, resource: <из челленджа>, accepted: <выбранный accept>, payload: {authorization: {...}, signature: "0x…"}}` → кладётся в `params._meta["x402/payment"]` того же `tools/call`. Наш сабмит был распарсен сервером и фасилитатором до конца — то есть структура конверта и домен верные.

**Facilitator:** серверный, по README — **PayAI** (`facilitator.payai.network`); в челлендже URL фасилитатора не раскрывается. Verify делает проверку баланса плательщика (см. §4) — то есть это полноценный verify, а не только проверка подписи.

**Settle/receipt:** по описанию `ping`, при успехе settle-транзакция возвращается в `PAYMENT-RESPONSE` (на MCP-пути — в заголовках HTTP-ответа). В этом прогоне **settle-хешей нет** — ни один вызов не дошёл до settle (нечем платить); формат receipt'а фиксируем как непроверенный.

## 4. Платный путь: ровно один подписанный сабмит

Подписали `TransferWithAuthorization` burner-ключом (value 1000, окно 300 с, случайный nonce) и отправили платный вызов `ping` с `echo: "argus-a10-probe"` и платежом в `_meta`. Ответ — за **1.042 с**:

```json
{"x402Version": 2, "error": "invalid_exact_evm_insufficient_balance", "accepts": [ <свежий челлендж, те же условия> ]}
```

Три важных следствия: (1) **подпись признана валидной** — ошибка не `invalid_signature`, значит домен и структура подписанного сообщения совпали с ожиданиями фасилитатора; (2) фасилитатор **проверяет баланс** до settle — деньги не могут уйти с пустого кошелька даже при валидной подписи; (3) при отказе сервер возвращает **полный свежий челлендж** — клиент после пополнения ретраит тем же кодовым путём. Это лучший достижимый без денег негатив: весь путь платного вызова, кроме самой транзакции, исполнен и зафиксирован.

## 5. Негативы и вердикт по «no charge if tool fails»

| Негатив | Ответ сервера | Деньги |
|---|---|---|
| `call_tool(url_parse, {url: 12345})` — инвалидный тип аргумента | **тот же PaymentRequired-челлендж**, не ошибка валидации | нет платежа в запросе |
| `call_tool(cusip_validate, {cusip: "!!!not-a-cusip!!!"})` | тот же челлендж | нет платежа в запросе |
| `call_tool("no_such_tool_argus_probe_xyz", {})` | RPC `-32602 Unknown tool` (103 B, 0.74 с) — free | нет |
| подписанный сабмит с пустым кошельком | `invalid_exact_evm_insufficient_balance` + свежий челлендж | settle нет, баланс 0/0 |
| баланс burner до/после всего прогона | native 0 → 0, USDC 0 → 0 (два RPC-провайдера) | списаний нет |

**Вердикт:** клейм «If the tool fails, you're not charged» подтверждён **наполовину, по построению**: любые отказы до оплаты бесплатны — валидация аргументов вообще не наступает до оплаты, а фасилитатор не сонттлит платёж с недостаточным балансом. Часть «оплатили → тулза упала → деньги вернули» **остаётся непроверенной**: она требует финансируемого кошелька и реального settle. Зафиксированное отличие: сервер не даёт бесплатно узнать, что аргументы неверные — платёжные ворота стоят раньше схемы аргументов; для агента это UX-ловушка (заплатишь $0.001 за вызов с опечаткой — а refund-семантика после этого не задокументирована сервером; README обещает «not charged», но автоматического возврата без settle быть не может, значит tool-error при живом settle должен возвращать… что именно — неизвестно).

## 6. Тайминг

| Операция | Время | Размер ответа |
|---|---|---|
| initialize | 0.91 с | 1.4 КБ |
| tools/list lite (2 тулзы) | 0.70 с | 1.4 КБ |
| tools/list full (1020 тулз) | 5.39 с | 1.14 МБ |
| health / docs-all | 0.68 / 1.78 с | 266 B / 837 КБ |
| search_tools ×4 | 0.71–0.85 с | 2.9–20 КБ |
| челлендж (ping / url_parse / cusip_validate) | 0.85 / 0.68 / 0.67 с | 5–7.8 КБ |
| негативы (2× инвалидные аргументы, unknown tool) | 0.69–0.74 с | 0.1–7.8 КБ |
| **подписанный сабмит (facilitator verify)** | **1.04 с** | 6.2 КБ |

## 7. Отличия MCP-пути от HTTP-402 пути

| | HTTP-402 (плоский REST, как в №3/№4) | MCP-транспорт (этот прогон) |
|---|---|---|
| Доставка челленджа | HTTP **402** + заголовок `PAYMENT-REQUIRED` (base64) | **HTTP 200** + MCP `isError: true`, JSON челленджа открытым текстом в `content[0].text` |
| Доставка платежа | заголовок `PAYMENT-SIGNATURE` (base64) | `params._meta["x402/payment"]` (JSON-объект, без base64) |
| Поле версий | тело челленджа v1-совместимое (`x402Version: 1`, `accepts[]`) — так заявлено в README для REST | `x402Version: 2`, `accepts[]`, `resource`, `extensions.bazaar` |
| Discovery | нет (или OpenAPI) | bazaar-extension несёт `toolName` + `inputSchema` прямо в челлендже — каталог распространяется вместе с платежом |
| Сессия | не требуется | stateless Streamable HTTP, `Mcp-Session-Id` не выдаётся |
| Receipt | заголовок `PAYMENT-RESPONSE` | тот же HTTP-заголовок (по описанию `ping`); в нашем прогоне не наблюдался |

## 8. Грабли

1. **UA-фильтр на Base RPC**: `mainnet.base.org` без User-Agent даёт HTTP 403 (как и у QDay) — ходим с curl-подобным UA, дублируем через `base.publicnode.com`.
2. **`encode_typed_data` в eth-account 0.14**: принимает только `full_message=...`; попытка `sign_typed_data(encode_typed_data(...))` даёт двойное кодирование (`'SignableMessage' object has no attribute 'keys'`) — правильный путь: `key.sign_message(encode_typed_data(full_message=...))`.
3. **Челлендж в `isError`, а не HTTP 402**: клиент, ожидающий статус 402 (как на REST-пути), никогда не найдёт платёжные условия — их надо читать из текста MCP-результата.
4. **Gate-before-validation**: опечатка в аргументах неотличима от честного запроса оплаты — по челленджу не понять, что вызов обречён; тест «инвалидные аргументы» дешевле делать на free-тулзах или оффлайн-схеме, чем на платных.
5. **Нет ни Free-tier, ни partial-платежа**: одна цена, ровно 1000 raw-единиц; у apiguru (№4) был «billed 404», здесь семантика проще — но и мягче ничего нет.
6. **Solana-ветка не подписана**: accepts для Solana живые (feePayer фасилитатора — комиссии за клиента), но у нас нет Solana-ключа; путь зафиксирован в паспорте как доступный, не пройденный.

## 9. Файлы прогона и Argus-связка

Всё выложено в Lab-репо по принятой архитектуре (коммиты `registry(findings)` / `tools(probes)` / `docs(probe-run)` от 2026-11-21):

- **Evidence**: `attestations/evidence/0027-scorptech-mcp-x402-probe/` — 20 JSON-фреймов (initialize, каталог 1020 тулз целиком, health, docs-all, 4 поиска, 3 челленджа, 3 негатива, подписанный сабмит, балансы) + README + `manifest.sha256`.
- **Kit**: `sut-scorptech-x402-mcp-probe/` — 3 скрипта (stage 1 коннект/каталог, stage 2 поиски+челленджи+негативы, stage 3 подпись+сабмит через `ARGUS_BURNER_WALLET`), `out/` git-ignored.
- **Реестр**: запись **#0027** (челленджи, сабмит и негативы в одной finding-записи), draft `0027-…finding.draft.json`, INDEX перестроен: 28 записей, chain head `029a859c0e0c490e…`.

Верификация одной командой (stdlib, без npm и сети):

```bash
node tools/registry/verify-registry.mjs
# → registry intact: 28 records, chain head 029a859c0e0c490e…, exit 0
sha256sum -c attestations/evidence/0027-scorptech-mcp-x402-probe/manifest.sha256
```

## 10. Что осталось за бортом (следующие шаги)

1. **Funded-прогон**: пополнить burner на Base (≤$0.01 → 10 вызовов ping) → получить `PAYMENT-RESPONSE`/settle-хеш, проверить «no charge if tool fails» на `ping` с инвалидным `echo` и на `url_parse` с невалидным URL, добить `cusip_validate` валидным CUSIP — kit и регламент готовы, бюджет тот же.
2. **Solana-ветка**: Solana-кошелёк + подпись exact-схемы (SPL transfer + feePayer фасилитатора) — отдельный паспорт.
3. **Bazaar-extension**: проверить, читает ли чей-либо агент каталог из `extensions.bazaar` без отдельного `tools/list` — кандидат на adversarial-тест.

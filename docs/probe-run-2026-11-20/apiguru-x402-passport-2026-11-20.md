# Мини-ТЗ №4: apiguru-app/amazon-scraper-v2 — паспорт живого x402-пути

Дата: 2026-11-20 (~17:37–18:03 UTC). Регламент: **ровно один платный вызов на
весь прогон, free tier не дробим, в GitHub не пишем**. Фактически: платный вызов
**не выполнен** — в песочнице нет funded-кошелька с нативным USDC на Base;
всё остальное (402-семантика, цены, free-tier механика, сети, адреса) снято
двумя бесплатными вызовами (в рамках лимита «1–2») и документацией сервиса.
Готовый платный клиент отложен в `sut-apiguru-x402-probe/apiguru_paid_call.py` — один funded
ключ = один прогон за минуту.

## Результат одним абзацем

Живой keyless-путь работает и ведёт себя ровно как задокументирован: канонический
ASIN из доков отдаёт **200 из общей sample-копии, не тратя free-проб**, живой
вызов «своим» ASIN отдаёт **404, который тоже «billed»** (счётчик проб 3→2
зафиксирован заголовком). Реальная цена **$0.003/вызов** — втрое дешевле
заявленных в README «about a cent». Платёжная часть — x402 v2, scheme exact
(EIP-3009), нативный USDC на Base (+Polygon/Arbitrum/Avalanche), `payTo`
публично в `/.well-known/x402`; identity фасилитатора сервис нигде не называет.
Для демо «живой x402-путь под независимым proof» не хватает одного наблюдаемого
события — реального settle с tx-хешем — и это решается одним funded вызовом.

## 1. Бесплатные вызовы (2 HTTP-вызова всего, оба зафиксированы)

**Вызов A (субагент разведки, ~17:37:50 UTC)** — demo endpoint с каноническим
ASIN документации:

```
GET /agent/v1/v2/product-details?asin=B09DJLW458
→ HTTP/2 200, 38757 байт, 1.73s-класс задержки
server: nginx/1.18.0 (Ubuntu)
x-price-next-call: $0.003
x-free-probes-remaining: 3
x-request-id: 65347b57-f378-4af9-be43-ed5b109c6848
```

Ключевое в теле: `"_sample": {"free_call_used": false, "note": "…answered from
a shared copy, and it did not use one of your free calls…"}"`,
`free_calls_remaining: 3`, `price_next_call: "$0.003"`. То есть B09DJLW458 —
«витринный» ASIN: ответ из общей копии, **free tier не тратится**, живой Amazon-фетч
и платёжный путь этим вызовом не затрагиваются. В `data` ~60 полей (buybox_winner,
ranks, review_histogram, tech_specs, photos…), GoPro HERO9, `$291.99`, 4.6★.

**Вызов B (мой, ~17:59:42 UTC)** — живой путь, «свой» ASIN:

```
GET /agent/v1/v2/product-details?asin=B08N5WRWNW
→ HTTP/2 404, 174 байта, time_total=1.728826s
x-price-next-call: $0.003
x-free-probes-remaining: 2        ← декремент 3→2
x-request-id: b675d905-2c2d-47ff-ae71-739204a3a4ba
{"success":false,"error":"ASIN not found on this marketplace domain",…,"free_calls_remaining":2}
```

**Семантика «billed 404» подтверждена на живом счётчике**: промах по ASIN
списывает бесплатную пробу keyless-клиента — ровно как сказано в llms-full.txt
(«404 — billed; 400/5xx — не billed»). Полный захват: `attestations/evidence/0026-apiguru-x402-probe/live_call_own_asin.txt`
(копия в реестре, запись #0026). Выбор ASIN оказался несуществующим — это не
повлияло на ценность пробы: измерились именно лимит/биллинг, а не данные.

После вызова B пробы остановлены: бюджет ТЗ «1–2 бесплатных вызова» исчерпан
(2 HTTP-вызова, 1 потраченная проба, остаток на счётчике сервиса: 2).

## 2. Паспорт платёжного пути (по документации, доступной без оплаты)

| Элемент | Значение | Источник |
|---|---|---|
| Схема | **x402 v2**, scheme **exact** | llms-full.txt, .well-known/x402 |
| Механизм | **EIP-3009** authorization («client signs an EIP-3009 authorization for that amount»); дословного `transferWithAuthorization` в доках нет, но exact для EVM = EIP-3009 | llms-full.txt |
| Заголовок клиента | **`PAYMENT-SIGNATURE`** (v1-имя `X-PAYMENT` тоже принимается) | llms-full.txt |
| Сети / актив | **USDC нативный**: Base `eip155:8453` `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; также `eip155:137`, `eip155:42161`, `eip155:43114` | llms.txt, llms-full.txt |
| Получатель | **`payTo 0x766B4cc27333955BBb163a61e2B85aFa6e491422`** | `https://agent.apiguru.app/.well-known/x402` (x402Version 2, 10 ресурсов с priceModel и inputSchema) |
| Facilitator | **имя нигде не названо** — «no ETH for gas (the facilitator submits the transfer)»; в openapi.json 0 вхождений «facilitator»; ни x402.org, ни CDP, ни self-hosted не подтверждены | llms-full.txt (единственное упоминание) |
| Settle-семантика | «settles on-chain only after a billable answer (2xx, or the 404…)»; при их сбое — `X-Payment-Status: not-settled`, деньги не списываются; **время settle не публикуется** | llms-full.txt |
| Газ / депозит | газа не нужно (transfer сабмитит фасилитатор), минимального депозита нет | llms-full.txt |
| Цены | `/v2/product-details` **$0.003**; батчи: `/product` $0.0024/item, `/stock` $0.0045/item, `/seller-profile` $0.0036/item; потолок «one call costs at most $0.05» | llms.txt |
| Таймаут | 60 s на вызов; после 55 s гейт сам отвечает 504 `deadline_exceeded`, **не billed** | llms.txt |
| Free tier | 3 free calls per client per 24h (README: «per machine» — формулировки расходятся, идентификация клиента не документирована) | llms.txt vs README |
| Альтернативы x402 | OAuth device flow (`/agent/v1/device/code` → poll `/device/token`) или ключ `X-API-KEY` (дашборд = 100 вызовов/мес) | llms.txt |
| MCP | `https://mcp.apiguru.app/mcp` — keyless, при исчерпании проб возвращает x402 PaymentRequired result, оплачиваемый in-band через `_meta["x402/payment"]` | llms.txt |
| OpenAPI | `https://dash.apiguru.app/openapi.json` (v1.1.69, 11 путей; в spec 38 упоминаний x402, 0 — facilitator) | dash.apiguru.app |

**Расхождение цены:** README репо говорит «~$0.01/вызов», заголовок
`x-price-next-call` и llms.txt — **$0.003**. В нашу пользу (дешевле заявки),
но в письме продавцу стоит зафиксировать — README стагнит.

## 3. Чего не видно без платного вызова (честный список)

1. Дословный **402-челлендж** (base64 `accepts` с per-network asset-адресами)
   — не встречался: канонический ASIN отвечает sample-копией, а до исчерпания
   проб мы сознательно не доигрывали (регламент «free tier не дробим»).
2. **PAYMENT-RESPONSE с tx hash** и время от подписи до settle.
3. **Identity фасилитатора** (характер challenge выдал бы владельца инфраструктуры).
4. USDC-адреса для Polygon/Arbitrum/Avalanche в реальном accepts (в доках — только Base).
5. Поведение `X-Payment-Status` при успехе (дословно не задокументировано).
6. Идентификация «per client per 24h»: IP vs fingerprint.

Всё это закрывается **одним** платным вызовом через готовый клиент (ниже).

## 4. Готовый платный клиент (для следующего шага)

`sut-apiguru-x402-probe/apiguru_paid_call.py` — запускается одной командой при наличии
funded-ключа (нативный USDC на Base, газ не нужен):

```
APIGURU_PRIVKEY=0x… python3 sut-apiguru-x402-probe/apiguru_paid_call.py --asin B09DJLW458
```

Что делает: GET → если 402, парсит `PAYMENT-REQUIRED`, берёт accepts exact,
**сверяет amount со spend-limit $0.05** (стоп при превышении), подписывает
EIP-3009 Authorization доменом из `extra` requirements, повторяет запрос с
`PAYMENT-SIGNATURE`, декодирует `PAYMENT-RESPONSE` (tx hash, settle), всю
evidence (заголовки, тайминги, челлендж, без приватных материалов — подпись
не логируется) пишет в `sut-apiguru-x402-probe/out/paid_call_evidence.json`. Lock-файл не даёт
случайно сделать второй платный вызов (снимается `--force`).

## 5. Argus-связка (шаг 4 ТЗ) — выполнено на доступном материале

- Запись **#0026 `argus-finding-0026`** в реестре: паспорт вызовов A/B, цены,
  сети, payTo, «billed 404», расхождение README-vs-факт; evidence — полный
  захват живого вызова. Хеш-цепочка + подпись probe-ключа
  `argus-lab-probe-2026q4` (операторский ключ в песочнице отсутствует).
- Верификация одной командой: `cd work/Argus-Agent-Test-Lab && node
  tools/registry/verify-registry.mjs` → **«registry intact: 27 records, chain
  head 7c85800eb7b44a29…», exit 0** (записи #0025 и #0026 в цепи).
- После платного вызова запись дополняется корректирующей #0027 (tx hash +
  settle-тайминг +PAYMENT-RESPONSE дословно) — формата коррекции в реестре есть.

## 6. Грабли

1. **Канонический ASIN не пробивает платёжный путь** — sample-копия всегда 200;
   живую 402 увидит только исчерпанный клиент или не-канонический ASIN после
   исчерпания проб.
2. **Billed-404** съедает бесплатные пробы на промахах — для демо надо брать
   заведомо существующий ASIN (лучше выбрать Игорю на amazon.com руками).
3. README ($0.01) и llms.txt ($0.003) расходятся — см. §2.
4. Facilitator неназываемый — независимая проверка settle-механики невозможна
   до живого вызова.
5. «Per client» vs «per machine» — неясно, что идентифицирует кейзлесс-клиента;
   при дроблении демо между машинами лимит может неожиданно не делиться.

## 7. Вердикт: годится ли как демо «живой x402-путь под независимым proof»

**Годится — после одного funded вызова.** Аргументы «за»: путь задокументирован
сквозно (402 → EIP-3009 → PAYMENT-SIGNATURE → settle по факту биллинг-ответа),
цены публичные и с потолком $0.05, безопасный провал (`X-Payment-Status:
not-settled`, 504 не billed), keyless без аккаунта — идеален для агент-демо,
`/.well-known/x402` даёт машиночитаемый каталог с payTo. Письмо продавцу можно
отправлять уже сейчас — в нём есть что спросить: (1) кто facilitator, (2) адреса
USDC для Polygon/Arbitrum/Avalanche, (3) время settle, (4) почему README говорит
$0.01 при фактических $0.003, (5) billed-404 политика для кейзлесс-клиентов.
Нашу сторону письма подкрепляет запись #0026 в реестре с верифицируемой цепочкой.

Скриншоты: для этого прогона ключевые артефакты — HTTP-захваты (§1) и
well-known каталог; браузерные скриншоты не несут добавочной ценности, поэтому
не делались (дашборд продавца требует аккаунта).

Потраченное время: разведка ~4 мин (субагент), живые вызовы и связка ~10 мин,
клиент-скрипт ~10 мин, оформление ~8 мин.

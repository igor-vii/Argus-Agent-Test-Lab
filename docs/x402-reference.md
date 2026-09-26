# x402 v2 — Reference (внешняя спецификация)

Источник истины (pinned commit, нормативный):
`x402-foundation/x402` @ `4fcf836cc393174130e1358577ce5d37356da1c3`
- `specs/x402-specification-v2.md`
- `specs/transports-v2/http.md`

Это карта протокола x402 v2 для сверки wire conformance Argus.
Каждое нормативное утверждение трассируется к § спецификации
(ссылки вида «spec §5.1.2», «http.md»). Никаких предположений:
там, где spec молчит, это отмечено явно.

---

## PROTOCOL REALITY

### 1. Participant model

| Роль в протоколе | Кто это | Что делает |
|---|---|---|
| Client | Покупатель / агент / любой HTTP-клиент | Инициирует HTTP-запрос к ресурсу; при 402 выбирает option из accepts, создаёт и подписывает PaymentPayload, повторяет запрос с PAYMENT-SIGNATURE |
| Resource server | Продавец / владелец защищённого ресурса | Отдаёт 402 + PaymentRequired; проверяет payload (сам или через facilitator); выполняет работу (fulfill); инициирует settle; отдаёт ресурс + PAYMENT-RESPONSE |
| Facilitator | Опциональный intermediary с конкретным HTTP REST interface | Предоставляет endpoints `/verify`, `/settle`, `/supported` (spec §7). Resource server MAY hosting'овать эти endpoints сам — facilitator не автоматически обязателен (spec §7: «delegate … or host the endpoints themselves») |

Термины buyer / seller / payer / payee в docs встречаются описательно:
- payer ≈ тот, чей ключ в authorization (from)
- payee ≈ payTo в PaymentRequirements
- buyer/seller ≈ client / resource server

Facilitator — конкретная x402 role/interface (`/verify`, `/settle`,
`/supported`), а не любое промежуточное приложение. Промежуточное
приложение без доказанного соответствия этому interface facilitator'ом
называть нельзя (см. также §6 «Potential semantic mismatches», п.4).

### 2. Message / entity model (v2 field tables)

#### 2.1 PaymentRequired (spec §5.1.2)

| Поле | Тип | Required? |
|---|---|---|
| `x402Version` | number (=2) | **Required** |
| `error` | string | Optional |
| `resource` | object (ResourceInfo) | **Required** |
| `accepts` | array[PaymentRequirements] | **Required** |
| `extensions` | object | Optional |

`ResourceInfo` (spec §5.1.2):

| Поле | Тип | Required? |
|---|---|---|
| `url` | string | **Required** |
| `description` | string | Optional |
| `mimeType` | string | Optional |
| `serviceName` | string | Optional |
| `tags` | array[string] | Optional |
| `iconUrl` | string | Optional |

Не путать top-level `PaymentRequired.resource` (**Required**) с
`PaymentPayload.resource` (**Optional**, см. 2.3) — это разные поля
разных сущностей, обе типа ResourceInfo.

#### 2.2 PaymentRequirements — элемент `accepts[]` (spec §5.1.2)

| Поле | Тип | Required? |
|---|---|---|
| `scheme` | string (напр. "exact") | **Required** |
| `network` | string, CAIP-2 | **Required** |
| `amount` | string (atomic units) | **Required** |
| `asset` | string (token address / ISO 4217) | **Required** |
| `payTo` | string (address или role constant) | **Required** |
| `maxTimeoutSeconds` | number | **Required** |
| `extra` | object | Optional |

**`maxAmountRequired` НЕ является v2 PaymentRequirements field.**
В v2 поле называется `amount`. Термин `maxAmountRequired` — v1
terminology; в документах pinned v2 commit он не встречается.
При описании v2 использовать только `amount`.

#### 2.3 PaymentPayload (spec §5.2.2)

| Поле | Тип | Required? |
|---|---|---|
| `x402Version` | number | **Required** |
| `resource` | object (ResourceInfo) | **Optional** |
| `accepted` | object (PaymentRequirements) | **Required** |
| `payload` | object (scheme-specific) | **Required** |
| `extensions` | object | Optional |

Отсутствие `PaymentPayload.resource` само по себе НЕ является
v2 schema violation (поле optional).

Для exact EVM scheme `payload` (spec §5.2.2):
`signature` (string, Required) + `authorization` (object, Required).
`Authorization`: `from`, `to`, `value`, `validAfter`, `validBefore`,
`nonce` — все Required, все string на wire.

#### 2.4 SettlementResponse — содержимое PAYMENT-RESPONSE (spec §5.3.2)

| Поле | Тип | Required? |
|---|---|---|
| `success` | boolean | **Required** |
| `transaction` | string (tx hash; "" если no tx broadcast) | **Required** |
| `network` | string, CAIP-2 | **Required** |
| `errorReason` | string | Optional |
| `payer` | string | Optional |
| `amount` | string | Optional |
| `extensions` | object | Optional |

**`status` и `txHash` сами по себе не являются v2 SettlementResponse
fields.** Валидный SettlementResponse требует `success` +
`transaction` + `network`; каноническое имя хеша — `transaction`.

VerifyResponse (spec §5.4.2, результат `/verify`, сервер↔facilitator,
не клиенту): `isValid` (boolean, Required), `invalidReason`, `payer`,
`extensions`, `extra` (Optional).

### 3. Network

`network` использует **CAIP-2 формат `namespace:reference`**
(spec §5.1.2, §5.3.2). Для inspected environment:
**`eip155:84532` = Base Sepolia** (spec §5.3.1 example).

### 4. Граница x402 (что внутри протокола)

Внутри x402:

    Client → resource: HTTP request
    Resource → client: 402 + PaymentRequired / PAYMENT-REQUIRED
    Client → resource: тот же request + PAYMENT-SIGNATURE (PaymentPayload)
    Resource ↔ facilitator (optional): verify
    Resource: fulfill the request (работа сервера)
    Resource ↔ facilitator (optional): settle
    Resource → client: resource body + PAYMENT-RESPONSE (settlement outcome)

Схема (scheme) задаёт как двигаются деньги; individual schemes
(exact, upto, batch-settlement, auth-capture) специфицированы в
`specs/schemes/` (spec §6). Порядок verify/settle относительно
execution определяется payment flow (spec §6.1):

| Flow | Ordering |
|---|---|
| `authorization` (default) | verify → resource → settle → respond |
| `upfront` | settle → resource → respond |
| `escrow` | settle → resource → settle → respond |

Инвариант (spec §6.1): at least one check (verify или settle до
ресурса) **MUST** run before the resource executes.

### 5. Что должен уметь настоящий x402 client/agent

Минимально:
- Сделать HTTP request
- Распознать 402 и прочитать PaymentRequired / accepts[]
- Выбрать один PaymentRequirements
- Построить и подписать PaymentPayload по scheme/network
- Повторить request с PAYMENT-SIGNATURE
- (Опционально) прочитать PAYMENT-RESPONSE

Клиент не обязан сам ходить в facilitator и не обязан сам бродкастить
tx в canonical facilitator-submitted flow.

### 6. Что должен уметь resource server / facilitator

Resource server:
- Отдавать корректный PaymentRequired
- Принять и проверить PaymentPayload (сам или через facilitator)
- Решить: fulfill или снова 402
- Инициировать settlement
- Вернуть ресурс и settlement result клиенту

Facilitator (optional, spec §7 — HTTP REST interface):
- `POST /verify` — проверка payload vs requirements (read-only)
- `POST /settle` — исполнение платежа on-chain, SettlementResponse
- `GET /supported` — декларация поддерживаемых schemes/networks
- Возврат структурированного результата server'у (не клиенту)

Facilitator не является обязательной частью протокола; resource server
MAY perform verification/settlement itself (host the endpoints
themselves, spec §7).

### 7. Протокольные данные vs непротокольные

Протокольные (wire / spec):
- PaymentRequired, PaymentRequirements, PaymentPayload,
  SettlementResponse, VerifyResponse
- Headers: PAYMENT-REQUIRED, PAYMENT-SIGNATURE, PAYMENT-RESPONSE
- Scheme-specific fields в extra / payload
- Reserved keys `extra.assetTransferMethod`, `extra.paymentFlow` (§9)

Не протокольные (приложение / ops):
- Внутренние ID операций приложения
- Бизнес-статусы вроде «RECONCILING», «DELIVERY_UNKNOWN»
- Evidence store, audit log, observability
- Политики maxPrice, allowlists, insurance, escrow product logic
- Любая долгая state machine «operation» между несколькими HTTP-вызовами вне одного request/retry

### 8. Lifecycle одной операции (канон, authorization flow)

    request
      → 402 + PaymentRequired (requirements)
      → select PaymentRequirements (один элемент accepts[])
      → create/sign PaymentPayload
      → retry with PAYMENT-SIGNATURE
      → verification/check (verify или pre-resource settle)
      → resource execution / fulfill        [server work]
      → settlement                          [порядок зависит от flow]
      → response + PAYMENT-RESPONSE (SettlementResponse)

| Шаг | Обязательность в core x402 | Комментарий |
|---|---|---|
| 402 + requirements | Да, если ресурс платный и оплаты ещё нет | |
| PaymentPayload + retry | Да | |
| Facilitator | Нет (optional; server MAY self-host verify/settle) | |
| ≥1 check (verify/settle) до выполнения ресурса | Да (invariant, spec §6.1) | Только для authorization flow это именно /verify |
| Settlement before resource | Нет, не универсально | `upfront`/`escrow` — settle до ресурса; `authorization` (default) — settle после |
| Отдельный «delivery proof» layer | Нет в core x402 | Fulfill = отдать HTTP response/resource |
| Durable multi-step operation across crashes | Нет в core x402 | Это orchestration вне протокола |

### 9. Extra — protocol-reserved keys (spec §6.1)

В `PaymentRequirements.extra` зарезервированы протоколом два ключа
(клиенты/серверы MUST трактовать их как протокольные, остальные
ключи — scheme-specific):

- `assetTransferMethod` — HOW value is authorized/moved for a
  mechanism (напр. `eip3009` vs `permit2` на EVM exact); значения
  определяет mechanism, protocol резервирует только имя ключа.
- `paymentFlow` — WHEN settlement происходит относительно ресурса
  (`authorization` default / `upfront` / `escrow`). Если resolved
  flow ≠ `authorization`, `accepts[].extra.paymentFlow` MUST быть
  present; omission = mechanism default.

Semantics вне этих двух ключей здесь не специфицированы — spec §6.1
и `specs/schemes/` остаются источником.

### 10. HTTP transport (specs/transports-v2/http.md)

| Header | Direction | Content |
|---|---|---|
| `PAYMENT-REQUIRED` | Server → Client | Base64-encoded `PaymentRequired` object |
| `PAYMENT-SIGNATURE` | Client → Server | Base64-encoded `PaymentPayload` object |
| `PAYMENT-RESPONSE` | Server → Client | Base64-encoded `SettlementResponse` object |

- Все x402 protocol information communicated through the headers
  (http.md «Response Body»).
- Механизм кодирования: JSON-объект → base64 → значение header.
- **Response body остаётся concern'ом resource server / приложения**
  и не должен смешиваться с x402 protocol header data. Тело 402 в
  каноническом http.md-примере не несёт протокольной информации.
- HTTP status mapping ошибок x402 — http.md «Error Handling».

---

## OUR MODEL (Argus + Secretariat) — концептуально

### Argus
- Независимая adversarial / integration test lab
- Может выступать client (покупатель/signer) и resource-side test double (seller, отдающий 402)
- Гоняет failure modes вокруг payment, verify, settle, ambiguous states
- Собирает evidence и вердикты PASS/FAIL

→ В терминах протокола Argus — тестовый участник и наблюдатель, не роль x402.

### Secretariat
- Resolution runtime: durable payment intent, reconciliation, инвариант «новый платёж только после proven NOT_SETTLED»
- Посредник между buyer и seller, discovery, policy, submit, settle path, post-settlement execution
- Evidence и recovery после crash/timeout

→ В терминах чистого x402 такой роли нет. x402 знает: client, resource server, optional facilitator. Secretariat по факту описания — application-level transaction orchestration / resolution layer вокруг или поверх x402, а не часть спецификации x402. Называть Secretariat facilitator'ом допустимо ТОЛЬКО при отдельном доказательстве соответствия x402 facilitator interface (`/verify` / `/settle` / `/supported`, spec §7); без такого доказательства — это app-level orchestrator, не facilitator.

---

## Potential semantic mismatches

1. **«Settlement» в x402 vs у нас.** В протоколе settlement ≈ исполнение платежа (часто on-chain + PAYMENT-RESPONSE/SettlementResponse). У нас settlement связан с durable intent + reconciliation + запретом нового платежа до NOT_SETTLED. Это расширенная семантика, не тождество.

2. **«Execution / delivery».** В x402 fulfill = resource server выполняет работу и отдаёт HTTP-ответ. Отдельного протокольного состояния «delivery UNKNOWN» нет. Gap «payment settled ≠ work delivered» — реальная операционная проблема, но вне core x402 message model.

3. **Порядок verify / work / settle.** Default flow `authorization` = verify → resource → settle (spec §6.1). Модель «сначала железобетонный on-chain SETTLED, потом execution» соответствует flow `upfront`/`escrow` (или product policy на authorization) — но НЕ универсальна для всех schemes/flows.

4. **Facilitator vs Secretariat.** Facilitator = конкретный verify+settle REST interface для resource server (spec §7). Secretariat — orchestrator операции (intent, policy, recovery). Называть Secretariat «facilitator» — путаница с протокольным термином без доказательства interface-соответствия.

5. **Одна HTTP-операция x402 vs «операция» Secretariat.** x402 — один paid request/response. Secretariat — долгоживущая operation с БД, probes, CAS, multi-step recovery.

6. **Buyer/seller как агенты.** В x402 seller = resource server одного HTTP resource. Модель «агент-продавец / агент-покупатель + посредник» — шире, чем один x402 exchange.

---

## Короткий вывод разведки

    PROTOCOL REALITY (x402 v2 @ 4fcf836)
      Client / Resource server / (optional) Facilitator [/verify,/settle,/supported]
      PaymentRequired(resource REQUIRED, accepts[].amount)
        → PaymentPayload(accepted+payload) → check → fulfill → settle
        → PAYMENT-RESPONSE(SettlementResponse: success+transaction+network)
      network = CAIP-2 (eip155:84532 = Base Sepolia)
      headers carry all protocol data (base64); body = server concern
      x402 = HTTP-native payment handshake + scheme/flow-defined money movement
      ≠ durable business transaction OS
      ≠ delivery-proof protocol

    OUR MODEL
      Argus = test lab / adversarial client & seller harness (outside protocol roles)
      Secretariat = orchestration/resolution layer around payments (not an x402 role;
                    facilitator label requires proven /verify-/settle-conformance)

    Core mismatch risk:
      Using x402 words (settlement, facilitator, payment) for Secretariat's
      longer-lived operation/delivery semantics without marking them as app-level.

# A0 — Атомарная карта S1–S8

Статус: read-only анализ. Код, тесты и сценарии не менялись. Решения по блокам (B1.2a, B1.2b, B1.3, B2, B4, B5) принимает архитектор (Игорь); здесь только карта зависимостей «assertion → доказательство → эмитент → путь → триггер → условие».

Определение атома (из задания): связка «триггер → эмитент → доказательство». Если хотя бы одно звено отсутствует или недостижимо — атом не срабатывает, assertion деградирует до INCONCLUSIVE/FAIL.

Нумерация атомов сквозная: **A1…A27** (сведение в слое 5 и сводная таблица идут по этим id).

---

## 1. Что проверялось

- Все 8 сценариев (`src/scenarios/S1_DuplicateRequest.ts` … `S8_X402Payment.ts`): инварианты, assertions, actions, faults, participants, topology.
- Ядро: `src/core/Fault.ts`, `FaultInjector.ts`, `ScenarioEngine.ts`, `validateScenario.ts`, `RunOrchestrator.ts`, `AgentController.ts`, `EvidenceCollector.ts`, `Participant.ts`, `ExecutionRegistry.ts`.
- Адаптеры: `src/adapters/MockTargetAdapter.ts`, `src/adapters/x402/X402AgentAdapter.ts`, `src/adapters/payment/*` (SigningBinding, PaymentAdapterFactory).
- Тесты, фиксирующие фактическое поведение: `src/tests/scenarios/S1-S7.test.ts`, `src/tests/core/FaultInjector.test.ts` (spy-тест), `src/tests/core/ScenarioEngine.test.ts` (e2e duplicate/crash), `src/tests/integration/X402FullFlow.test.ts`, `src/tests/external/sitecheck-smoke.test.ts`, `src/tests/core/Participant.test.ts`.
- Реестр решений: `docs/backlog-open-decisions.md` (B0-005/B1.2, B0-006/B1.3, B0-008/B2, B0-010/B4), `docs/l0-f2-fault-dispatch-contract.md`, `docs/l0-f-lifecycle-analysis.md`.

Метод: для каждого assertion выписаны требуемые доказательства; для каждого доказательства — эмитент и путь вызова с точностью до файл:строка; достижимость пути проверена по коду и по зафиксированным в тестах фактам.

## 2. Что уже есть в main (файлы, символы)

| Файл | Символ (строки) | Значение для карты |
|---|---|---|
| `src/core/Fault.ts` | `FaultTarget` (10–13), `L0F2_LIFECYCLE_TRIGGERS` (31–36), `isActionTrigger` (38–39), `isBaselineResponder` (47–48) | Три вида цели; активный dispatch — только participant + action_*; respond — baseline. |
| `src/core/FaultInjector.ts` | `getFaultsForEvent` (37–51), `getRespondersForEvent` (60–66), `apply` (68–97) | Единая точка активной отправки; lifecycle/edge/infrastructure отсекаются. |
| `src/core/FaultInjector.ts` | `handleDuplicateRequest` (99–107), `handleDelayedResponse` (109–124), `handleCrash` (126–129), `handleHang` (131–149), `handleConcurrentRequest` (151–160), `handleRetry` (162–176), `handleLostDelivery` (178–188), `handleRespond` (190–203) | Обработчики эффектов; эмиссия `delivery_started`/`delivery_completed` (117, 121, 139) и `config.emit` (199) — побочные эффекты применения action-fault'а. |
| `src/core/ScenarioEngine.ts` | `execute` (59–81), `executeAction` (86–115), `performAction` (131–244) | Единственный вызов инжектора — строка 88: `getFaultsForEvent("action_"+type, actor)`; responders — строка 89. Engine-событие `action_<type>` — строки 235–243; observations из `exchange.metadata.observations` — строки 221–232 (source = testSubject); PAYMENT_REQUIRED-ветка — 140–206 (`payment_signed_and_retried` 175–187, `payment_required_no_resolver` 147–161, `payment_signing_failed` 188–205). |
| `src/core/validateScenario.ts` | `validateFaultDispatch` (145–185), `validateScenario` (111–134) | Контрактная валидация перед исполнением; легальные sources: testSubject, 'engine', ARGUS-участники. |
| `src/core/RunOrchestrator.ts` | `run` (52–173) | Композиционный корень: registry+controllers (66–73), FaultInjector из scenario.faults (75), paymentResolver из PaymentAdapter (87–115), engine.execute (126), assertions (133–134). Ошибка ранта → verdict INCONCLUSIVE «Runtime error» (160–171). |
| `src/core/AgentController.ts` | `act` (137–181), `actWithSignature` (300+), `bindParticipantIdentity` (112–118) | Транспорт; Participant-объекта как runtime-сущности нет — участник это ключ Map контроллеров. |
| `src/adapters/MockTargetAdapter.ts` | `send` (114–170) | Эмитит observations только для `request_payment`: `payment_intent_created` (147), `payment_intent_reused`+`response_received` (135). Больше ничего. |
| `src/adapters/x402/X402AgentAdapter.ts` | `send` (~180–240), `sendWithSignature` (~250–320) | Реальный HTTP-транспорт x402 v2: детект 402 → `ExchangeStatus.PAYMENT_REQUIRED` (202, 291), parsing `payment-required` header. Registered в CLI (`src/cli/TargetAdapterRegistry.ts:125`). |
| `src/adapters/payment/evm/BaseSepoliaPaymentAdapter.ts` и др. | `signX402Payment`, `getArgusAddress` | Подпись EIP-712; используется resolver'ом оркестратора. |
| `src/cli/ScenarioRegistry.ts` | S1…S8 (строки 2–22) | Все восемь сценариев зарегистрированы в CLI. |
| `docs/l0-f2-fault-dispatch-contract.md`, `docs/l0-f-lifecycle-analysis.md`, `docs/backlog-open-decisions.md` | B0-005→B1.2, B0-006→B1.3, B0-008→B2, B0-010→B4 | Владелец каждого отсутствующего атома задан реестром. |

## 3. Слой 1 — Сценарии и их проверки

Общая канва S1–S7: участники `buyer-1` CLIENT/ARGUS, `seller-1` RESOURCE_SERVER/ARGUS, `sut-1` FACILITATOR/EXTERNAL (testSubject); ровно одно действие `{actor: 'buyer-1', type: 'request_payment'}`; топология `buyer-1→(request)sut-1→(forward)seller-1` (+ `seller-1→(response)sut-1` в S7). S8: `buyer-1` CLIENT/ARGUS, `sut-1` RESOURCE_SERVER/EXTERNAL; действие `request_resource`; faults нет.

Важное замечание к wiring в тестах (`S1-S7.test.ts:34-45`): один и тот же `AgentController` (один `MockTargetAdapter`) регистрируется под обоими ARGUS-ключами (`buyer-1` и `seller-1`). Контроллер выбирается по **актору действия**, поэтому все target-наблюдения приходят с source=`sut-1` (testSubject). Наблюдений с source=`seller-1` в рантайме S1–S7 нет ни у одного сценария, кроме эмиссий через emit-callback fault-обработчиков (в S1–S7 не применяются, см. ниже).

### S1 — Duplicate Request
- Инвариант `no_duplicate_payment_intent`: «При дублировании запроса с одинаковым idempotencyKey, test subject должен создать ровно один payment_intent».
- Assertion `assert_no_duplicate` (behavioral, sources `['sut-1']`). Цитата условия PASS:
  ```ts
  const count = evidence.filter(
    (e) => e.source === 'sut-1' &&
           e.type === 'payment_intent_created' &&
           (e.data as any)?.idempotencyKey === 'key-1'
  ).length;
  if (count === 1) return { status: 'PASS' };
  if (count > 1) return { status: 'FAIL', reason: `Expected 1, got ${count}` };
  return { status: 'INCONCLUSIVE' };
  ```
- PASS требует: сбой `duplicate_request` применён (действие выполнено 2 раза) + Sut выдал ровно один `payment_intent_created(key-1)`. FAIL: два `payment_intent_created`. INCONCLUSIVE: ноль (сбой не применён или Sut не ответил).
- Факт: тест `S1-S7.test.ts:59-85` ждёт PASS — оба атома работают.

### S2 — Payment Before Execution
- Инвариант `no_premature_success`. Assertion `assert_no_premature_success` (behavioral, `['sut-1','seller-1']`):
  ```ts
  if (!settled) return { status: 'INCONCLUSIVE', reason: 'payment_settled not observed yet' };
  if (!success) return { status: 'INCONCLUSIVE', reason: 'success not observed yet — still pending, expected' };
  ...
  const sellerReallyResponded = evidence.some(
    (e) => e.source === 'seller-1' && e.type === 'delivery_completed'
  );
  if (success && !sellerReallyResponded) return { status: 'FAIL', ... };
  return { status: 'PASS' };
  ```
  где `settled` = `sut-1/payment_settled`, `success` = `sut-1/success`.
- PASS требует: наблюдение settlement от Sut, наблюдение success от Sut, доказательство реальной доставки от seller-1 (`delivery_completed`). INCONCLUSIVE сейчас и всегда: `payment_settled` никем не эмитится (см. слой 3).

### S3 — Crash After Settlement
- Инвариант `no_double_settlement_after_crash`. Assertion `assert_single_settlement_survives_crash` (mixed, `['sut-1','engine']`):
  ```ts
  if (settlements.length === 0) return { status: 'INCONCLUSIVE', reason: 'no settlement observed yet' };
  if (settlements.length > 1) return { status: 'FAIL', ... };
  const recovery = evidence.find((e) => e.source === 'sut-1' && e.type === 'recovery_completed');
  if (!recovery) return { status: 'INCONCLUSIVE', reason: 'restart/recovery not observed yet' };
  const resumedForward = evidence.some((e) => e.source === 'engine' && e.type === 'forward_request' && e.timestamp > recoveryTs);
  if (!resumedForward) return { status: 'FAIL', reason: 'recovery completed but retry to seller never resumed' };
  return { status: 'PASS' };
  ```
- Требует: `sut-1/payment_settled` (×1), `sut-1/recovery_completed`, `engine/forward_request` после recovery, плюс сам crash+restart инфраструктуры. Первые два типа в коде не эмитятся никогда; crash привязан к lifecycle-триггеру и infrastructure-цели — двойной declared-only.

### S4 — Seller Timeout
- Инвариант `timeout_yields_unknown_not_failed`. Assertion `assert_timeout_state` (behavioral):
  ```ts
  if (!settled) return { status: 'INCONCLUSIVE', reason: 'payment_settled not observed yet' };
  ...
  if (unknown) return { status: 'PASS' };
  return { status: 'INCONCLUSIVE', reason: 'no terminal state observed yet' };
  ```
  `unknown` = `sut-1/delivery_unknown`.
- Требует: settlement-наблюдение, отсутствие failed/success, терминальный `delivery_unknown`, зависание seller (`hang` на `delivery_started`, цель seller-1). Hang неприменим (не-актор, lifecycle-триггер); settlement/terminal-типы не эмитятся.

### S5 — Concurrent Duplicate
- Инвариант `concurrent_requests_single_intent`. Assertions:
  ```ts
  // assert_concurrent_single_intent
  if (intents.length === 0) return { status: 'INCONCLUSIVE', ... };
  if (intents.length === 1) return { status: 'PASS' };
  return { status: 'FAIL', reason: `expected 1, got ${intents.length}` };
  // assert_no_unhandled_errors
  if (unhandled.length > 0) return { status: 'FAIL', ... };
  return { status: 'PASS' };
  ```
- Требует: `concurrent_request` применён (5 параллельных вызовов) + ровно один `payment_intent_created(key-5)` + отсутствие `sut-1/unhandled_exception` (эмитент — внешний Sut; в mock-среде PASS тривиален).

### S6 — Payment Retry
- Инвариант `no_duplicate_payment_on_unknown`. Assertion `assert_no_duplicate_settlement`:
  ```ts
  if (settlements.length > 1) return { status: 'FAIL', ... };
  if (settlements.length === 1) return { status: 'PASS' };
  return { status: 'INCONCLUSIVE', reason: 'no settlement observed yet' };
  ```
- Требует: хотя бы один `sut-1/payment_settled` (для PASS) и adversarial-retry buyer'а, запускаемый `settlement_unknown`. Тест `S1-S7.test.ts:93-117` явно фиксирует текущий статус: **INCONCLUSIVE (scaffolding)**.

### S7 — Lost Delivery
- Инвариант `lost_response_yields_unknown_not_duplicate`. Assertion `assert_seller_sent_but_sut_never_received`:
  ```ts
  const sellerSent = evidence.find((e) => e.source === 'seller-1' && e.type === 'delivery_sent');
  if (!sellerSent) return { status: 'INCONCLUSIVE', reason: 'seller has not sent response yet' };
  const sutReceived = evidence.find((e) => e.source === 'sut-1' && e.type === 'delivery_received');
  if (sutReceived) return { status: 'FAIL', reason: 'edge fault did not actually drop the response — test setup invalid' };
  ...
  if (unknown) return { status: 'PASS' };
  ...
  return { status: 'INCONCLUSIVE', reason: 'no terminal state observed yet' };
  ```
- Требует: базовая эмиссия `seller-1/delivery_sent` (respond-pуть — работает), edge-drop `lost_delivery` на ребре seller-1→sut-1 (declared-only — не работает), терминальный `sut-1/delivery_unknown` (не эмитится).

### S8 — X402 Payment Flow
- Инвариант `payment_signed_and_retried`. Assertion `assert_payment_flow_completed` (engine-behavior, `['engine']`):
  ```ts
  const signed = evidence.find((e) => e.source === 'engine' && e.type === 'payment_signed_and_retried');
  if (signed) return { status: 'PASS' as const };
  return { status: 'FAIL' as const, reason: 'payment not signed and retried' };
  ```
- Требует: 402 от реального/мок x402-таргета → PAYMENT_REQUIRED → paymentResolver → actWithSignature → engine-событие. Все звенья существуют и работают (integration-тест ждёт PASS).

## 4. Слой 2 — Доказательства

| # | Сценарий | Доказательство (source + type) | Важные поля data | Кто должен эмитить |
|---|---|---|---|---|
| D1 | S1 | `sut-1 / payment_intent_created` | `data.idempotencyKey === 'key-1'` | Sut (в mock — `MockTargetAdapter.send` через observations, source присваивает `performAction`) |
| D2 | S1 | косвенно: повторный вызов действия | `metadata.observations=['payment_intent_reused',...]` (в assertion не читается) | FaultInjector `duplicate_request` (repeat_count=2) |
| D3 | S2 | `sut-1 / payment_settled` | timestamp (для порядка с success) | Не определено из текущих источников (по смыслу — Sut/FACILITATOR как результат расчёта) |
| D4 | S2 | `sut-1 / success` | timestamp | Не определено из текущих источников (по смыслу — Sut: терминальный успех операции) |
| D5 | S2 | `seller-1 / delivery_completed` | — | seller-1 (RESOURCE_SERVER, факт реальной доставки). Механизм эмиссии существует (`handleDelayedResponse`), но недостижим при trigger=`delivery_started` |
| D6 | S3 | `sut-1 / payment_settled` (ровно 1) | — | как D3 |
| D7 | S3 | `sut-1 / recovery_completed` | timestamp | Не определено из текущих источников (по смыслу — инфраструктурный слой Sut: завершение restart'а) |
| D8 | S3 | `engine / forward_request` c timestamp > recovery | — | Движок (резент после restart'а). Такого типа эмиссии в `ScenarioEngine` нет |
| D9 | S3 | эффект crash+restart инфраструктуры | `restart_after_ms` | FaultInjector `crash` + инфраструктурный контроллер Sut; `handleCrash` бросает ошибку, restart'а нет нигде |
| D10 | S4 | `sut-1 / payment_settled` | — | как D3 |
| D11 | S4 | `sut-1 / delivery_unknown` | — | Не определено из текущих источников (по смыслу — Sut по итогам таймаута) |
| D12 | S4 | эффект hang (seller не отвечает) | `duration_ms=-1` | FaultInjector `hang`; механизм есть, недостижим (lifecycle-триггер, seller≠actor) |
| D13 | S5 | `sut-1 / payment_intent_created` (key-5, ×1) | `data.idempotencyKey` | как D1 |
| D14 | S5 | отсутствие `sut-1 / unhandled_exception` | — | Внешний Sut (в mock — гарантировано коллектором: тип не эмитится) |
| D15 | S5 | эффект concurrent ×5 | `parallel_count=5` | FaultInjector `concurrent_request` — достижим |
| D16 | S6 | `sut-1 / payment_settled` (×1) | — | как D3 |
| D17 | S6 | эффект adversarial retry ×3 | `retry_count=3, new_authorization_each_time` | FaultInjector `retry`; недостижим (trigger=`settlement_unknown`) |
| D18 | S7 | `seller-1 / delivery_sent` | — | seller-1 через baseline responder `handleRespond(config.emit)` — достижим |
| D19 | S7 | отсутствие `sut-1 / delivery_received` | — | Негативное доказательство; требует существующего пути reception, который дропнут (сейчас пути reception нет вообще) |
| D20 | S7 | эффект edge drop lost_delivery | `drop_probability=1.0` | Edge-слой `seller-1→sut-1`; обработчик `handleLostDelivery` есть, но edge-путь не подключён |
| D21 | S7 | `sut-1 / delivery_unknown` | — | как D11 |
| D22 | S8 | `engine / payment_signed_and_retried` | `data.actionType` | ScenarioEngine.performAction (строки 175–187) — достижим |
| D23 | S8 | precondition: `ExchangeStatus.PAYMENT_REQUIRED` + `exchange.paymentRequired` | scheme/network/amount/asset/payTo | X402AgentAdapter (HTTP 402 + header parse) — достижим |
| D24 | S8 | precondition: подпись и повтор | Base64 payment-signature | PaymentAdapter.signX402Payment + controller.actWithSignature — достижим |

## 5. Слой 3 — Эмитенты и их пути

| Эмитент | Где в коде (файл:строки) | Как вызывается (путь) | При каких условиях | Существует сейчас? |
|---|---|---|---|---|
| MockTargetAdapter (генерирует список observation-типов) | `src/adapters/MockTargetAdapter.ts:122-155` | `controller.act → port.send` → `exchange.metadata.observations` | только `type==='request_payment'`; `payment_intent_created` при новом idempotencyKey, `payment_intent_reused` при повторе | Да (единственный источник D1/D13) |
| ScenarioEngine.collect observations | `src/core/ScenarioEngine.ts:221-232` | `performAction` после `controller.act` | exchange присутствует; source := `scenario.testSubject` | Да |
| ScenarioEngine (engine-событие действия) | `src/core/ScenarioEngine.ts:235-243` | `performAction` | всегда после успешного exchange | Да (`engine/action_request_payment`) |
| ScenarioEngine (PAYMENT_REQUIRED-ветка) | `src/core/ScenarioEngine.ts:140-206` | `performAction` при `status===PAYMENT_REQUIRED` | есть `paymentResolver` → `payment_signed_and_retried`; нет → `payment_required_no_resolver`; ошибка подписи → `payment_signing_failed` | Да (D22) |
| RunOrchestrator (сборка) | `src/core/RunOrchestrator.ts:52-134` | `run()` | коннект контроллеров, FaultInjector(scenario.faults), resolver из PaymentAdapter | Да |
| FaultInjector.handleDuplicateRequest | `src/core/FaultInjector.ts:99-107` | `executeAction` цепочка (ScenarioEngine 104–114) | trigger=`action_*`, participant-target==actor | Да (S1) |
| FaultInjector.handleConcurrentRequest | `src/core/FaultInjector.ts:151-160` | то же | то же | Да (S5) |
| FaultInjector.handleRetry | `src/core/FaultInjector.ts:162-176` | то же | **то же**; в S6 trigger=`settlement_unknown` | Есть, но не достигается при lifecycle-триггере |
| FaultInjector.handleDelayedResponse | `src/core/FaultInjector.ts:109-124` (эмиссии 117, 121) | то же | В S2 trigger=`delivery_started`, target=seller-1≠actor | Есть, но не достигается ни в одном S1–S7 |
| FaultInjector.handleHang | `src/core/FaultInjector.ts:131-149` (эмиссия 139) | то же | В S4 trigger=`delivery_started`, target=seller-1≠actor | Есть, но не достигается |
| FaultInjector.handleCrash | `src/core/FaultInjector.ts:126-129` | то же | В S3 trigger=`payment_settled` + infrastructure-target | Есть, но не достигается; restart-механизма нет вообще |
| FaultInjector.handleLostDelivery | `src/core/FaultInjector.ts:178-188` | то же | В S7 trigger=`delivery_sent` + edge-target | Есть, но не достигается; edge-перехвата нет |
| FaultInjector.handleRespond | `src/core/FaultInjector.ts:190-203` | `getRespondersForEvent` → цепочка (ScenarioEngine 89, 107) | trigger=`action_*`, type=`respond` | Да (единственный живой lifecycle-эмитент: D18) |
| Эмитент `payment_settled` | — | — | — | **Отсутствует** (тип встречается только в assertions и в `L0F2_LIFECYCLE_TRIGGERS`) |
| Эмитент `settlement_unknown` | — | — | — | **Отсутствует** |
| Эмитент `success` / `failed` (sut-1) | — | — | — | **Отсутствует** |
| Эмитент `delivery_unknown` (sut-1) | — | — | — | **Отсутствует** |
| Эмитент `recovery_completed` (sut-1) | — | — | — | **Отсутствует** |
| Эмитент `engine/forward_request` | — | — | — | **Отсутствует** (движок не делает forward-шагов; есть только `engine/action_<type>`) |
| Эмитент `delivery_received` (sut-1) | — | — | — | **Отсутствует** (пусть reception seller→sut в mock не реализован) |
| X402AgentAdapter (402 → PAYMENT_REQUIRED) | `src/adapters/x402/X402AgentAdapter.ts:202, 291` | `controller.act/actWithSignature → port.send/sendWithSignature` | HTTP 402 + разбор заголовка `payment-required` | Да (D23) |
| PaymentAdapter.signX402Payment | `src/adapters/payment/evm/BaseSepoliaPaymentAdapter.ts` (через resolver `RunOrchestrator.ts:91-114`) | paymentResolver внутри performAction | PaymentRequired распарсен; adapter раскрывает `getArgusAddress` | Да (D24) |
| Sitecheck-смоук (тот же путь на реальном таргете) | `src/tests/external/sitecheck-smoke.test.ts:199-297` | ScenarioEngine + X402AgentAdapter без resolver | сеть доступна | Да (подтверждает D23 в реальном режиме) |

## 6. Слой 4 — Триггеры и их источники

| Триггер | Кто эмитит | Кто получает | Путь до dispatch существует? | Что нужно, чтобы путь появился |
|---|---|---|---|---|
| `action_request_payment` (S1–S7) | ScenarioEngine.executeAction (строка 87) | FaultInjector.getFaultsForEvent + getRespondersForEvent | **Да** | — (работает) |
| `action_request_resource` (S8) | То же | injectors пусты (faults: []) | Да (dispatch происходит, список пуст) | — |
| `delivery_started` | Только как побочная эмиссия `handleDelayedResponse/handleHang` (117, 139) в evidence; живого эмитента события нет | Никто (в executeAction не передаётся) | **Нет** | Решение B1.2b (A/B/C) + эмитент начала доставки (B1.2a); возможно B2 (seller-контроллер) |
| `payment_settled` | Отсутствует | Никто | **Нет** | Эмитент settlement-цикла (B1.2a) + выбор контракта (B1.2b) |
| `settlement_unknown` | Отсутствует | Никто | **Нет** | Как выше |
| `delivery_sent` | `handleRespond` (199) в evidence; как триггер — никто | Никто | **Нет** | Путь «эмиссия → dispatch» (B1.2b) |
| edge-цель `seller-1 → sut-1` (S7 lost_delivery) | — | — | **Нет**: `getFaultsForEvent` фильтрует `target.kind==='participant'` (47–49); `validateFaultDispatch` отсекает active-edge-цели (163–169); перехвата на рёбрах нет | B1.3: edge-перехват/mediation между эмиссией и reception |
| infrastructure-цель `testSubject` (S3 crash) | — | — | **Нет**: та же participant-фильтрация; механизма restart Sut нет | B1.3 + механизм restart/observability Sut (B5/инфраструктура) |
| `delivery_completed` (не входит в L0F2_LIFECYCLE_TRIGGERS) | `handleDelayedResponse` (121) | evidence | Не триггер; читается assertion'ом S2 | Иллюстрирует неполноту множества lifecycle-триггеров |

## 7. Слой 5 — Сведение по сценариям

Легенда «Есть?»: ✅ — атом полностью работает в рантайме; ⚠️ — механизм в коде существует, но недостижим (блокировка контрактом/отсутствием эмитента); ❌ — звено отсутствует физически.

| Сценарий | Атом | Триггер | Эмитент | Доказательство | Есть? | Владелец блока |
|---|---|---|---|---|---|---|
| S1 | A1 | action_request_payment | FaultInjector.duplicate_request | эффект: двойное выполнение | ✅ | есть |
| S1 | A2 | — | MockTargetAdapter + performAction | sut-1/payment_intent_created(key-1) | ✅ | есть |
| S2 | A3 | action_request_payment | performAction | sut-1/payment_intent_created | ✅ | есть (assertion'ом не используется) |
| S2 | A4 | payment_settled (as evidence) | ❌ нет эмитента | sut-1/payment_settled | ❌ | B1.2a |
| S2 | A5 | success (as evidence) | ❌ нет эмитента | sut-1/success | ❌ | B1.2a |
| S2 | A6 | delivery_started → delayed_response | handleDelayedResponse (недостижим) | seller-1/delivery_completed | ⚠️ | B1.2b (+B1.2a, B2) |
| S3 | A7 | payment_settled → crash(infrastructure) | handleCrash (двойная блокировка) + нет restart | эффект crash+restart | ⚠️ | B1.2b + B1.3 |
| S3 | A8 | — | ❌ | sut-1/payment_settled | ❌ | B1.2a |
| S3 | A9 | — | ❌ | sut-1/recovery_completed | ❌ | B1.2a + B1.3 (restart-эффекты) |
| S3 | A10 | — | ❌ | engine/forward_request после recovery | ❌ | B1.2a/B4 (нет resumption-пути) |
| S4 | A11 | delivery_started → hang(seller-1) | handleHang (недостижим) | эффект вечного hang | ⚠️ | B1.2b (+B1.2a, B2) |
| S4 | A12 | — | ❌ | sut-1/payment_settled | ❌ | B1.2a |
| S4 | A13 | — | ❌ | sut-1/delivery_unknown | ❌ | B1.2a |
| S4 | A14 | негативы failed/success | — (пассивно истинны) | — | ✅ | есть |
| S5 | A15 | action_request_payment | concurrent_request | эффект 5 параллельных | ✅ | есть |
| S5 | A16 | — | MockTargetAdapter | sut-1/payment_intent_created(key-5) ×1 | ✅ | есть |
| S5 | A17 | негатив unhandled_exception | пассивно (Sut внешний) | отсутствие sut-1/unhandled_exception | ✅ | есть (в mock тривиально) |
| S6 | A18 | settlement_unknown → retry(buyer-1) | handleRetry (недостижим) | эффект adversarial retry | ⚠️ | B1.2b (+B1.2a) |
| S6 | A19 | — | ❌ | sut-1/payment_settled ×1 | ❌ | B1.2a |
| S7 | A20 | action_request_payment | handleRespond | seller-1/delivery_sent | ✅ | есть |
| S7 | A21 | delivery_sent → lost_delivery(edge) | handleLostDelivery (недостижим) + нет edge-пути | эффект дропа ответа | ⚠️ | B1.3 (+B1.2b) |
| S7 | A22 | reception seller→sut | ❌ пути reception нет | отсутствие sut-1/delivery_received | ❌ | B1.3/B2 |
| S7 | A23 | — | ❌ | sut-1/delivery_unknown | ❌ | B1.2a |
| S8 | A24 | action_request_resource | X402AgentAdapter (402) | PAYMENT_REQUIRED exchange | ✅ | есть |
| S8 | A25 | PAYMENT_REQUIRED-ветка | paymentResolver (RunOrchestrator) | подпись actWithSignature | ✅ | есть |
| S8 | A26 | — | performAction 175–187 | engine/payment_signed_and_retried | ✅ | есть |
| S8 | A27 | негатив: payment_signing_failed | performAction 188–205 | ветка существует | ✅ | есть (в smoke-сценарии с `payment_required_no_resolver` — тоже ✅) |

Примечание к покрытию тестами: в `src/tests/scenarios/` отдельного файла для S8 нет (`S1-S7.test.ts` покрывает только S1–S7). S8 проверяется в `src/tests/integration/X402FullFlow.test.ts` (мок x402-сервер, ждёт PASS), в `src/tests/core/Participant.test.ts` (роли) и в `src/tests/cli/ArgusCLI.test.ts` (присутствие в реестре); его же модель повторяют внешние смоук-тесты Sitecheck. Поэтому атомы S8 в таблице подтверждены integration-, а не scenario-тестами.

## 8. S8 как проверочный кейс

**Что S8 доказывает наличие рабочих атомов:**
1. Полный цикл «действие → реальный HTTP-таргет → PAYMENT_REQUIRED → подпись → повтор → evidence → PASS-verdict» работает без единого mock-допущения (integration-тест + sitecheck-смоук против публичного таргета).
2. Рабочие переиспользуемые механизмы: `ExchangeStatus.PAYMENT_REQUIRED` как transport-level сигнал; `paymentResolver` как композиционная точка; запись engine-событий напрямую из движка (без адаптера); `kind:'engine-behavior'` assertion против source='engine'.
3. S8 подтверждает: там, где эмитент реально существует (движок/адаптер), assertions дают честный PASS без изменений ядра.

**Переиспользуется ли что-то для S1–S7:**
- Тот же `performAction` эмитит engine-события — но типы, которые нужны S2/S3/S6 (`payment_settled`, `settlement_unknown`, `recovery_completed`, `delivery_unknown`), в S8 не возникают: x402-протокол S8 заканчивается на «ресурс получен», settlement-цикла как наблюдаемого события нет. **Эмитента `payment_settled` в S8 нет** — переиспользовать нечего.
- Близкий precedent: `payment_required_no_resolver` (ScenarioEngine:147–161) — образец того, как движок может эмитить состояние «Unknown» без внешнего эмитента; морфологически это подсказка для B1.2a (кто эмитит settlement-исходы), но не готовый атом.
- Обратное направление: S1–S7 имеют атомы, которых нет в S8 — активную отправку сбоев (action-faults), baseline respond-эмиссию, participant-targeted эффекты. S8 их не тренирует.
- Вывод по S8: он снижает риск не «атомов settlement», а **механики**: движок+адаптер+evidence+assertion-конвейер работают в реальном режиме; недостающие атомы S2/S3/S4/S6 — это именно отсутствующие эмитенты (B1.2a) и отсутствующие пути dispatch (B1.2b/B1.3), а не сломанный каркас.

## 9. Сводная таблица «сценарий → атомы → есть/нет»

| Сценарий | Всего атомов | ✅ Есть | ⚠️ Механизм есть, недостижим | ❌ Отсутствует | Может дать PASS сегодня? |
|---|---|---|---|---|---|
| S1 | 2 (A1–A2) | 2 | 0 | 0 | **Да** (зафиксировано тестом) |
| S2 | 4 (A4–A6 + A3) | 1 (A3) | 1 (A6) | 2 (A4, A5) | Нет (INCONCLUSIVE) |
| S3 | 4 (A7–A10) | 0 | 1 (A7) | 3 (A8–A10) | Нет (INCONCLUSIVE) |
| S4 | 4 (A11–A14) | 1 (A14) | 1 (A11) | 2 (A12, A13) | Нет (INCONCLUSIVE) |
| S5 | 3 (A15–A17) | 3 | 0 | 0 | **Да** |
| S6 | 2 (A18–A19) | 0 | 1 (A18) | 1 (A19) | Нет (INCONCLUSIVE, зафиксировано) |
| S7 | 4 (A20–A23) | 1 (A20) | 1 (A21) | 2 (A22, A23) | Нет (INCONCLUSIVE) |
| S8 | 4 (A24–A27) | 4 | 0 | 0 | **Да** (PASS в integration) |
| **Итого** | **27** | **12** | **5** | **10** | S1, S5, S8 — живые |

Агрегат по типам отсутствующих звеньев (10 ❌ + 5 ⚠️):
- Отсутствующие эмитенты доказательств (B1.2a): A4/A5, A8/A9/A10, A12/A13, A19, A22, A23 — settlement/terminal-state/recovery/reception-типы.
- Недостижимые dispatch-пути lifecycle (B1.2b): A6, A11, A18, частично A7.
- Edge/infrastructure-механика (B1.3): A7 (restart инфраструктуры), A21/A22 (edge drop + reception).
- Wiring участников (B2): seller-1 как самостоятельный исполнитель ни в одном S1–S7 не вызывается (все действия от buyer-1); без этого A5/A6/A20-semantics («что реально сделал seller») остаются приближениями.
- Новых атомов для S1/S5/S8 не требуется — они закрыты существующими.

## 10. Открытые вопросы

1. **Кто эмитит settlement-исходы** (`payment_settled`, `settlement_unknown`) в mock- и live-режимах: Sut-наблюдение (адаптер), движок (как `payment_required_no_resolver`), или отдельный settlement-эмитент? Из текущего main не выводится.
2. **Терминальные состояния Sut** (`success`, `failed`, `delivery_unknown`) — чей это evidence-source по контракту Rule 1? Сейчас они ожидаются от `sut-1`, но Sut-адаптеры их не производят.
3. **Полнота `L0F2_LIFECYCLE_TRIGGERS`**: `delivery_completed` эмитится кодом, но не состоит в множестве; `delivery_received`, `recovery_completed`, `forward_request` — отсутствуют и там и там. Нужно ли расширять множество как часть B1.2a.
4. **S3 без restart'а нерешаем в принципе**: даже при выборе B/C нужен механизм остановки/перезапуска Sut (infrastructure-владелец, вероятно вне B1.2 — уточнить принадлежность: B1.3 или B5).
5. **S7 без пути reception**: assertion требует «sent but not received»; без канала seller→sut дропать нечего. Это B1.3 или B2 (или оба)?
6. **Негативные атомы в mock** (A14, A17): считать ли их настоящими доказательствами или артефактом mock-среды (PASS по умолчанию)? Вопрос к семантике B4.
7. **Детерминизм `handleLostDelivery`** использует `Math.random()` (184) вопреки seed-механике сценариев — если атом оживает (B1.3), нужен RNG от seed.
8. **Один controller на двух участников** (S1-S7.test.ts:34-45): отличает ли Argus вообще действия buyer'а от действий seller'а в evidence (actorId vs source)? Влияет на A5/A6/A20. Решение B2.
9. **Регламент «оживления»**: допустимо ли в B4 менять assertions S2/S3/S4/S6 на читаемые сегодня доказательства, или сценарии обязаны ждать появления эмитентов? Вопрос архитектору.

## 11. Заключение (без выбора решений)

- Карта содержит 27 атомов; 12 работают, 5 заблокированы контрактом/недоступностью пути, 10 физически отсутствуют. Ни один отсутствующий атом не был придуман — все требуются цитируемыми assertions.
- S1, S5, S8 проверяемы целиком на текущих атомах; S2, S3, S4, S6 не могут дать PASS ни при каком выборе B1.2b, пока не появятся эмитенты settlement/terminal-доказательств (B1.2a); S7 дополнительно упирается в edge/reception (B1.3).
- Порядок зависимости слоёв фиксирован картой: доказательства (B1.2a) → контракт отправки (B1.2b) → edge/infra-механика (B1.3) → wiring (B2) → семантическая миграция (B4). Любое решение по B1.2b без ответа на вопрос «кто эмитит» оставляет S2/S3/S4/S6 INCONCLUSIVE независимо от выбранного варианта.
- S8 показывает, что конвейер «реальный таргет → движок → evidence → verdict» исправен; дефицит сосредоточен в эмитентах предметной области, а не в инфраструктуре исполнения.

# B1.2 — Анализ событий жизненного цикла S1–S7

Статус: исследовательский документ. Код не менялся. Решение по варианту A/B/C принимает архитектор (Игорь).

---

## 1. Что проверялось

- Все четыре lifecycle-триггера из `L0F2_LIFECYCLE_TRIGGERS` (`delivery_started`, `payment_settled`, `settlement_unknown`, `delivery_sent`) сопоставлены с объявлениями в сценариях S1–S7.
- Для каждого события установлены: кто объявляет, кто эмитит фактически (есть ли вообще путь эмиссии в коде), доходит ли событие до `FaultInjector`, какой наблюдаемый эффект есть сейчас.
- Разобраны три гипотезы будущего контракта (A — только доказательства; B — отдельная нерекурсивная отправка; C — рекурсивная отправка глубины 1) без выбора.
- Оценено влияние на сценарии S1–S7 и на следующий блок B2 (связывание участник → контроллер → адаптер).

Метод: чтение `src/core/Fault.ts`, `src/core/FaultInjector.ts`, `src/core/ScenarioEngine.ts`, `src/core/validateScenario.ts`, `src/core/EvidenceCollector.ts`, `src/core/RunOrchestrator.ts`, `src/adapters/MockTargetAdapter.ts`, всех `src/scenarios/S*.ts`, тестов `src/tests/core/FaultDispatchContract.test.ts`, `src/tests/core/FaultInjector.test.ts`, `src/tests/core/ScenarioEngine.test.ts`, `src/tests/scenarios/S1-S7.test.ts`, а также `docs/l0-f2-fault-dispatch-contract.md` и `docs/backlog-open-decisions.md` (§8 Lifecycle Decision — B1.2, §10 Participant Wiring — B2).

## 2. Что уже есть в main (файлы, символы)

| Файл | Символ | Роль в lifecycle-вопросе |
|---|---|---|
| `src/core/Fault.ts` | `L0F2_LIFECYCLE_TRIGGERS` | Множество из четырёх lifecycle-триггеров; зафиксировано как «declared-only», комментарии явно запрещают рекурсивный dispatch. |
| `src/core/Fault.ts` | `isActionTrigger` | Единственный фильтр активной отправки: `trigger.startsWith('action_')`. Всё остальное отсекается. |
| `src/core/Fault.ts` | `isBaselineResponder` | `respond` — базовое поведение участника, вынесено из активного fault-пути. |
| `src/core/Fault.ts` | `FaultTarget` | Три вида цели: `participant`, `edge`, `infrastructure`; активный dispatch поддерживает только `participant`. |
| `src/core/FaultInjector.ts` | `getFaultsForEvent` | Возвращает `[]` для любого не-`action_*` события (строгая проверка `isActionTrigger`). Фильтрует `respond`, требует participant-target == actor. |
| `src/core/FaultInjector.ts` | `getRespondersForEvent` | Тоже gated by `isActionTrigger`; возвращает только `respond`-записи. |
| `src/core/FaultInjector.ts` | `apply` / `handleDelayedResponse` / `handleHang` | Эмиссия `delivery_started` и `delivery_completed` — побочный эффект применения **action**-fault'а, идёт через emit-callback напрямую в evidence, минуя любой повторный dispatch. |
| `src/core/FaultInjector.ts` | `handleRespond` | Эмитит то, что указано в `config.emit` (в S7 — `delivery_sent`), тоже только в evidence. |
| `src/core/ScenarioEngine.ts` | `execute` | Валидирует контракт (`validateFaultDispatch`), затем последовательно выполняет actions. Никакого event-loop'а нет. |
| `src/core/ScenarioEngine.ts` | `executeAction` | Единственная точка обращения к инжектору: `getFaultsForEvent("action_" + action.type, action.actor)` и `getRespondersForEvent(...)`. Lifecycle-события сюда не поступают физически — у движка нет пути «событие → инжектор». |
| `src/core/ScenarioEngine.ts` | `performAction` | Собирает observations из `exchange.metadata.observations` (source = testSubject) и engine-событие `action_<type>` (source = 'engine'). |
| `src/core/validateScenario.ts` | `validateFaultDispatch` | Активная проверка применяется только к faults с `action_*`-триггером, находящим действие; lifecycle-триггеры пропускаются как declared-only. |
| `src/scenarios/S1…S7` | `faults[]` |см. таблицу в §3. |
| `src/tests/core/FaultDispatchContract.test.ts` | — | Покрывает валидацию, включая infrastructure/edge rejection и явные проверки структуры S1/S5 (блок B1.1 закрыт). |
| `src/tests/core/FaultInjector.test.ts` | spy-тест | Зафиксировано: движок никогда не вызывает `getFaultsForEvent` с lifecycle-триггерами. |
| `src/tests/core/ScenarioEngine.test.ts` | e2e-тесты | Сквозная проверка применения `duplicate_request` и `crash` на action-триггерах. |
| `docs/l0-f2-fault-dispatch-contract.md` | — | Замороженный контракт: lifecycle = evidence-only; non-goals включают recursive dispatch и lifecycle emitters. |
| `docs/backlog-open-decisions.md` | §8 (B0-005) | Постановка выбора A/B/C отнесена именно в B1.2. |

## 3. Инвентаризация событий (таблица)

Все семь сценариев содержат ровно одно действие: `actor: 'buyer-1'`, `type: 'request_payment'` (то есть единственное событие активной отправки — `action_request_payment`). Топология во всех: `buyer-1 →(request) sut-1 →(forward) seller-1`; в S7 добавлено ребро `seller-1 →(response) sut-1`. Участники: `buyer-1` CLIENT/ARGUS, `seller-1` RESOURCE_SERVER/ARGUS, `sut-1` FACILITATOR/EXTERNAL (test subject).

| Сценарий | Событие | Кто объявляет (в faults) | Кто должен эмитить по смыслу | Кто должен получать | Какой эффект ожидается |
|---|---|---|---|---|---|
| S1 | — | Нет lifecycle-объявлений (только `duplicate_request` на `action_request_payment`, цель buyer-1) | — | — | — (lifecycle не участвует) |
| S2 | `delivery_started` | Fault `{target: participant seller-1, type: delayed_response, trigger: delivery_started, config:{delay_ms:5000}}` | По смыслу — момент начала доставки/ответа seller-1. В текущем mock-paths реально эмитится только косвенно: `handleDelayedResponse` сам испускает `delivery_started` при применении action-fault'а. Но seller-1 не является актором ни одного действия, поэтому этот fault не может быть применён вообще. Однозначного источника эмиссии в связке buyer→sut→seller нет — **не определено из текущих источников** (кто и когда публикует это событие в живом режиме). | sut-1 (координирует доставку) и/или buyer-1 | Должен запустить `delayed_response`: ответ seller задерживается, чтобы проверить, что SUCCESS не фиксируется раньше фактического ответа. Сейчас эффекта нет. |
| S3 | `payment_settled` | Fault `{target: infrastructure testSubject, type: crash, trigger: payment_settled, config:{restart_after_ms:2000}}` | По смыслу — sut-1 (FACILITATOR, расчётная часть): settlement — его внутреннее событие. Но в коде никто не эмитит `payment_settled`: `MockTargetAdapter` выдаёт только `payment_intent_created/reused/response_received`; в `src/**` (кроме константы и сценарных assertions) строка `payment_settled` как тип эмиссии отсутствует. Фактический эмитент — **не определено из текущих источников**. | FaultInjector (для запуска crash) + evidence (sut-1) | Crash+restart test subject сразу после settlement; инвариант — ровно один settlement, возобновление forward после recovery. Сейчас crash не запускается; assertion даёт INCONCLUSIVE (settlement вообще не наблюдается). |
| S4 | `delivery_started` | Fault `{target: participant seller-1, type: hang, trigger: delivery_started, config:{duration_ms:-1}}` | Как в S2: начало доставки — событие вокруг seller-1; в коде `delivery_started` эмитит только `handleDelayedResponse`/`handleHang` при применении action-fault'а. Seller-1 — актор нуля действий, поэтому hang неприменим. Живой эмитент — **не определено из текущих источников**. | sut-1 | Вечное зависание ответа seller → состояние DELIVERY_UNKNOWN, не FAILED/SUCCESS, без повторной оплаты. Сейчас эффекта нет; assertion INCONCLUSIVE. |
| S5 | — | Нет lifecycle-объявлений (только `concurrent_request` на `action_request_payment`, цель buyer-1) | — | — | — (lifecycle не участвует) |
| S6 | `settlement_unknown` | Fault `{target: participant buyer-1, type: retry, trigger: settlement_unknown, config:{retry_count:3, new_authorization_each_time:true}}` | По смыслу — sut-1/расчётный слой: UNKNOWN settlement — результат наблюдения facilitator'а над неопределённым статусом. В коде `settlement_unknown` никем не эмитится (**не определено из текущих источников**; строка существует только в константе и в fault-объявлении). | FaultInjector (для запуска retry от buyer-1) | Adversarial-поведение: buyer получает 3 попытки новой авторизации поверх UNKNOWN; инвариант — дубликат settlement не допускается. Сейчас retry не запускается; assertion INCONCLUSIVE (settlement не наблюдается). |
| S7 | `delivery_sent` (объявление-fault) | Fault `{target: edge seller-1→sut-1, type: lost_delivery, trigger: delivery_sent, config:{drop_probability:1.0}}` | По смыслу — seller-1 (RESOURCE_SERVER, отдаёт protected resource; комментарий в сценарии прямо говорит про `delivery_sent/delivery_completed`). Фактически эмитится кодом: `handleRespond` с `config.emit='delivery_sent'` из первого fault'а S7, source=seller-1 — но только в EvidenceCollector. | FaultInjector (для дропа на ребре seller→sut) | Потеря ответа на ребре → DELIVERY_UNKNOWN без дубляжа платежа. Сейчас: edge-цель declared-only, дропать нечего (в mock-режиме нет пути emission→reception) — эффект отсутствует; сам сценарий ожидает FAIL/INCONCLUSIVE без HTTP-интеграции. |
| S7 | `delivery_sent` (базовая эмиссия) | Не fault-триггер: `respond`-запись `{target: participant seller-1, type: respond, trigger: action_request_payment, config:{emit:'delivery_sent'}}` | seller-1 через baseline responder-путь (`getRespondersForEvent` + `handleRespond`) | Только evidence (assertion читает `source==='seller-1' && type==='delivery_sent'`) | Наблюдаемое доказательство «seller отправил ответ». Работает сегодня — единственный живой источник lifecycle-типа в S1–S7. |

Отдельно: `delivery_completed` эмитится `handleDelayedResponse` (и читается assertion'ом S2), но **не входит** в `L0F2_LIFECYCLE_TRIGGERS` и не используется как fault-триггер ни в одном сценарии. Это показывает, что множество lifecycle-триггеров уже неполно относительно реально испускаемых событий.

## 4. Что происходит сейчас

### `delivery_started`
- Объявлен как fault-триггер: S2 (`delayed_response` → seller-1), S4 (`hang` → seller-1).
- Путь эмиссии в коде есть: `FaultInjector.handleDelayedResponse` и `handleHang` испускают `delivery_started` (source = участник-цель fault'а) через emit-callback ScenarioEngine → EvidenceCollector. Но эти обработчики срабатывают только при применении **action**-fault'а; в S2/S4 соответствующие faults привязаны к lifecycle-триггерам и никогда не применяются. Итог: в рантайме S1–S7 событие не появляется ни разу.
- До FaultInjector как вход dispatch не доходит: `getFaultsForEvent` отсекает всё не-`action_*` (проверено spy-тестом из `FaultInjector.test.ts`).
- Наблюдаемый эффект сейчас: нулевой. Ни эмиссии, ни запуска сбоя.

### `payment_settled`
- Объявлен как fault-триггер: S3 (`crash` → infrastructure testSubject).
- Пути эмиссии в коде **нет**: ни core-класс, ни `MockTargetAdapter` не испускают `payment_settled`. Упоминания — только в константе и в assertion'ах S2/S3/S4/S6/S7, которые ищут это событие в evidence и никогда не находят.
- До FaultInjector не доходит (тот же gate).
- Эффект: нулевой; все assertions, зависящие от `payment_settled`, деградируют в INCONCLUSIVE.

### `settlement_unknown`
- Объявлен как fault-триггер: S6 (`retry` → buyer-1).
- Пути эмиссии в коде **нет** (только константа и fault-объявление).
- До FaultInjector не доходит.
- Эффект: нулевой; S6 — scaffolding (тест в `S1-S7.test.ts` явно ожидает INCONCLUSIVE).

### `delivery_sent`
- Объявлен как fault-триггер: S7 (`lost_delivery` → edge seller-1→sut-1).
- Путь эмиссии в коде **есть и работает**: baseline responder `respond` (trigger `action_request_payment`, `config.emit='delivery_sent'`) проходит через `getRespondersForEvent` → `apply` → `handleRespond` и попадает в evidence с source seller-1. Это подтверждено юнит-тестами и структурой S7.
- Но как вход dispatch событие не используется: edge-fault на триггере `delivery_sent` не применяется (edge target declared-only + не-action триггер). Дропать на уровне ребра нечем и негде.
- Эффект: частичный — событие наблюдаемо как доказательство; ожидаемого runtime-эффекта (потеря доставки) нет.

### Механическая причина (общая)
Активная отправка существует ровно в одной точке: `ScenarioEngine.executeAction` → `getFaultsForEvent("action_"+type, actor)`. У движка нет очереди событий или слушателей: emit-callback пишет исключительно в `EvidenceCollector.collect` и ничего не возвращает в инжектор. Поэтому даже если бы lifecycle-эмиссия происходила, она не имела бы канала влияния на выполнение. Это структурное свойство, а не случайный баг — оно зафиксировано контрактом L0-F2 (пункты 4–5) и spy-тестом.

## 5. Вариант A — только доказательства

Суть: lifecycle-события навсегда остаются evidence-only; сбои на lifecycle-триггерах — декларация без runtime-эффекта. Текущее замороженное состояние становится официальным постоянным решением.

Что даёт для S2/S4/S7 (и S3/S6):
- Ничего нового. S2/S4/S7 остаются «полусценариями»: S7 частично содержателен (respond-эмиссия даёт доказательство `delivery_sent`, assertion различает sellerSent/unknown), S2/S4 остаются INCONCLUSIVE-mock; S3/S6 — scaffolding.
- Требует переосмысления или перемаркировки: либо перенести сбои S2/S4/S6/S7 на `action_*`-триггеры (например, `delayed_response`/`hang` на `action_request_payment` с целью buyer-1 или seller-1 как актора собственного действия — но тогда меняется семантика сценариев, что выходит за A и попадает в редактирование сценариев), либо официально помечать их «declarative» (поле `approximated` уже существует; можно расширить разметку статуса).

Чего требует от кода: практически ничего — контракт уже реализован. Возможные минимум: валидатор/документация явно маркируют declared-only faults (сейчас они молча проходят валидацию); возможно — поле статуса в `Fault`.

Риски:
- Семантическая двусмысленность: в сценариях живут faults, которые ничего не делают; будущие читатели принимают INCONCLUSIVE за «проверка прошла».
- Backlog копит «долг смысла»: S2/S3/S4/S6 никогда не станут живыми без пересмотра модели.
- Assert-логика ссылается на события, которых не бывает, — тихая деградация в INCONCLUSIVE маскирует отсутствие покрытия.

Что оставляет нерешённым: саму постановку сценариев S2/S3/S4/S6/S7 (их инварианты по определению требуют причинно-следственной связи «событие → сбой»); вопрос live-адаптеров (B4) не приближается и не отдаляется.

## 6. Вариант B — отдельная нерекурсивная отправка

Суть: lifecycle-события получают собственный канал диспетчеризации, параллельный action-каналу: событие → поиск faults с этим триггером → применение; но результат применения не порождает событий, которые снова попадают в диспетчер (глубина гарантированно 1, рекурсия конструктивно невозможна).

Кто вызывает, в какой момент, с какой целью (по текущей структуре):
- Вызывать должен владелец emit-callback — `ScenarioEngine.executeAction` (точка `emitCallback`): вместо прямой записи в collector — запись + вызов нового метода `FaultInjector.getLifecycleFaultsForEvent(type, source)` с отдельным применением. Либо отдельный `LifecycleDispatcher`, которому движок передаёт каждое наблюдённое событие.
- Момент: синхронно при эмиссии (после `handleRespond`/`handleDelayedResponse`/будущих emitters) и, потенциально, при появлении событий из transport metadata.
- Цель: позволить событиям вроде `delivery_sent` запустить declared-fault (например, дроп на ребре S7) ровно один раз, без каскада.

Что даёт для S2/S4/S7:
- S7: становится содержательным при условии реализации edge-перехвата (это B1.3) — `delivery_sent` может запустить `lost_delivery`. Без edge-runtime B сам по себе S7 не оживает.
- S2/S4: сами по себе не оживают — их сбои висят на `delivery_started`, который в B обязан кем-то эмититься; emitters'ов seller-цикла currently нет, и B не решает, кто их создаёт.
- S3/S6: аналогично требуют emitters'ов `payment_settled`/`settlement_unknown` (расчётный слой), которых нет.

Чего требует от кода (без реализации):
- Второй lookup-метод в `FaultInjector` с правилами фильтрации для lifecycle (какие цели допустимы: participant? edge? infrastructure?).
- Изменение emit-callback в `ScenarioEngine` (или новый компонент-диспетчер) — затрагивает §4–5 замороженного контракта L0-F2.
- Определение semantics «применить lifecycle-fault к чему»: у operation-контейнера нет; нужен явный объект воздействия (operation текущего действия? будущее действие? evidence-мутация?), т.е. новая модель effect target.
- Обновление `validateFaultDispatch` и spy-теста (он фиксирует «никогда не дёргается»; при B он должен фиксировать «дёргается только по отдельному lifecycle-каналу»).

Риски:
- Двойная система правил (action-контракт vs lifecycle-контракт) — усложнение диагностики и документации.
- Соблазн неявной рекурсии: если lifecycle-fault эмитит события, нужен конструктивный запрет (отдельный emit-канал без диспетчера), иначе B тихо превращается в C.
- Неопределённость effect target: «crash на payment_settled» без явной модели прерывания выполнения остаётся невнятным.

Что оставляет нерешённым: источник самих lifecycle-событий (emitters участников/расчётного слоя) — центральную дыру S2/S3/S4/S6; edge/infrastructure перехват (B1.3); детерминизм при нескольких lifecycle-fault'ах на одном событии.

## 7. Вариант C — рекурсивная отправка глубины 1

Суть: lifecycle-событие может запустить сбой, сбой может эмитить следующее событие, то событие может запустить ещё один сбой — но не дальше одного шага цепочки (depth 1 recursion, после этого — только evidence).

Что даёт для S2/S4/S7:
- Максимальная выразительность: например, `action_request_payment` → (action-fault delay) → `delivery_started` → (lifecycle-fault hang на seller) → `settlement_unknown` → retry S6 мог бы ожить каскадом из двух шагов. Теоретически закрывает S2/S4/S6 одним механизмом.
- S7 — как в B: нужен edge-перехват, иначе дроп нечего применять.

Чего требует от кода:
- Всё из B плюс: явный трекер глубины в dispatcher (counter/context), правило остановки, защита от циклов A→B→A (visited-set или строгий depth counter).
- Детерминированный порядок обработки событий (очередь вместо синхронного вложенного вызова), иначе тайминги зависят от стека вызовов.
- Пересмотр контракта L0-F2 п.5 («no recursive dispatch») — это прямое изменение замороженного решения, а не уточнение.

Риски:
- Недетерминированное/трудно диагностируемое поведение: каскады плодят комбинаторику состояний; seed-воспроизводимость под вопросом при `Math.random()` в `lost_delivery`.
- Взрывоопасные конфигурации сценариев (два mutual-триггера дают цикл; guard обязателен, а guard = ещё одна сущность контракта).
- Резкое усложнение валидации: нужно проверять замкнутость графа «событие→сбой→событие» на этапе загрузки сценария.

Что оставляет нерешённым: те же emitters'ы (без них первый шаг каскада неоткуда взяться); effect model для crash/hang вне action-контекста; границы «какие типы сбоев вообще вправе эмитить события».

## 8. Влияние на сценарии S1–S7

| Сценарий | Зависит ли от lifecycle-события для своей проверки | Какой вариант делает проверяемым в живом режиме |
|---|---|---|
| S1 | Нет. Проверка полностью на `duplicate_request` (action-триггер) + observations mock'а; verdict PASS уже достижим. | lifecycle не влияет. |
| S2 | Да. Assertion опирается на `payment_settled`, `success` и `delivery_completed` от seller; без причинно-следственного запуска `delayed_response` по `delivery_started` проверка невалидна (INCONCLUSIVE). | B или C — но только вместе с эмитентом `delivery_started` в seller-цикле и effect-моделью задержки; A оставляет S2 декларативным. |
| S3 | Да. `crash` привязан к `payment_settled`; кроме того требуется infrastructure-перехват (B1.3) и эмитент settlement. | Частично B/C при наличии settlement-emitter **и** edge/infra-runtime; ни один вариант сам по себе S3 не оживляет. A — официально декларативный. |
| S4 | Да. `hang` на `delivery_started`; целевое состояние DELIVERY_UNKNOWN недостижимо без живого зависания. | B/C при наличии эмитента доставки и модели прерывания; A — декларативный. |
| S5 | Нет. Всё на `concurrent_request` (action-триггер). | lifecycle не влияет. |
| S6 | Да. `retry` на `settlement_unknown`; adversarial-ветка требует запуска ретраев по событию. | B/C при наличии settlement-emitter; A — декларативный (текущий тест ожидает INCONCLUSIVE как scaffolding). |
| S7 | Частично. Доказательная половина (`delivery_sent` через respond) жива уже; потеря доставки как эффект требует lifecycle-dispatch + edge-runtime. | B или C только в связке с B1.3 (edge перехват); A фиксирует S7 как «доказательства без эффекта». |

Особое внимание: в S2/S4/S7 lifecycle-события объявлены явно; при этом ни одно из них не имеет рабочего эмитента в существующем wiring (единственная живая эмиссия — `delivery_sent` из respond в S7 и гипотетические `delivery_started/completed` из delayed/hang, которые в S1–S7 не применяются). Таким образом, задача B1.2 сводится не только к выбору A/B/C, но и к вопросу «кто эмитит», который ни B, ни C не закрывают автоматически.

## 9. Влияние на связывание участников (B2)

Текущий wiring: `participantId → AgentController → adapter` через `ExecutionRegistry`; контроллеры регистрируются оркестратором по ключам участников; в тестах S1–S7 один и тот же `MockTargetAdapter`/`AgentController` зарегистрирован под всеми ARGUS-участниками (buyer-1 и seller-1), что само по себе является известным дефектом маппинга (B0-008).

- **Вариант A:** связывание не меняется. Dispatch остаётся одноканальным (action → registry.get(actor)), и B2 может проектироваться строго вокруг «актор действия → его контроллер». Отсутствие lifecycle-канала означает, что B2 не обязан предусматривать адресацию «источник события → контроллер события».
- **Вариант B:** существенно меняет требования к B2. Появляется второй класс обращений: событие несёт `source` (участник-эмитент), и диспетчер должен уметь найти fault'ы по этому источнику и применить эффект к связанному с ним контексту выполнения. Значит B2 обязан обеспечить: (1) уникальный контроллер/адаптер на участника (иначе `delivery_sent from seller-1` неотличим от buyer-контекста); (2) стабильный mapping source→participant для emit-callback; (3) решение, может ли один controller обслуживать несколько участников (в B — скорее нет, чем да).
- **Вариант C:** всё из B плюс требование к B2 хранить/транслировать идентичность через каскадные шаги (depth-tracker должен понимать, чьё событие обрабатывается); вероятна необходимость event-context объекта, который B2 обязан формировать уже на этапе wiring.

Практический вывод для планирования: если хотя бы B рассматривается всерьёз, B2 нельзя закрывать дизайном «один controller на много участников» — этот выбор будет переделан. Если выбирается A, текущая модель registry достаточно корректна и B2 фокусируется только на live HTTP-first candidate (S1).

## 10. Открытые вопросы

1. **Кто эмитит `payment_settled` и `settlement_unknown`?** В mock-режиме расчётная функция принадлежит sut-1 (EXTERNAL), которую Argus не контролирует; без реального settlement-эмитента S3/S6 не могут ожить ни при B, ни при C. Требуется решение: эмулировать на стороне harness (и тогда это «живой» сигнал?) или ждать HTTP-интеграции (B4).
2. **Кто эмитит `delivery_started` в S2/S4?** Seller-цикл не смоделирован: у seller-1 нет собственного действия. Нужен ли «forward action» от sut-1 к seller-1 как отдельное действие сценария — это вопрос языка сценариев, а не dispatch-контракта.
3. **Effect model вне action-контекста.** `apply(fault, operation, emit)` привязан к operation действия. Что такое «operation» для сбоя, запущенного событием (crash sut'а, hang future response)? Ни один вариант не определяет это; нужна модель (прерывание следующего действия? мутация evidence? no-op с отметкой?).
4. **Допустимые цели lifecycle-fault'ов.** При B/C: разрешаем ли participant≠actor (S2/S4 целятся в seller-1, которого нет среди акторов)? Edge (S7) и infrastructure (S3) — это B1.3; coupling решений B1.2 и B1.3 не зафиксирован.
5. **`delivery_completed` вне `L0F2_LIFECYCLE_TRIGGERS`.** Константа неполна относительно реально испускаемых типов; при любом варианте нужно решить, расширяется ли множество и по какому критерию.
6. **Детерминизм `lost_delivery`** (`Math.random()` при drop_probability<1) и seed-семантика: воспроизводимость каскадов при B/C не определена.
7. **Судьба поля `approximated`.** Сейчас metadata-only; при A логично стало бы маркером декларативности — но это меняет схему данных, чего B1.2 не решает.
8. **Backward compatibility spy-теста.** Любой выбор кроме A требует переформулировки зафиксированного в B1.1 теста «engine never calls getFaultsForEvent with lifecycle triggers» — важно учесть при приёмке решения.

## 11. Заключение (без выбора варианта)

Из текущего main однозначно следует: из четырёх lifecycle-триггеров лишь `delivery_sent` реально эмитится (через baseline respond в S7), и ни одно lifecycle-событие не имеет канала влияния на исполнение — у ScenarioEngine физически отсутствует путь «событие → инжектор». Сбои, объявленные на lifecycle-триггерах (S2, S3, S4, S6, edge-fault S7), сегодня не имеют runtime-эффекта; dependent assertions предсказуемо деградируют в INCONCLUSIVE.

Вариант A ничего не требует от кода, но консервирует смысловой долг по S2/S3/S4/S6/S7. Вариант B добавляет ограниченный, конструктивно нерекурсивный канал и сильнее всего меняет требования к B2 (нужен уникальный wiring участник→контроллер). Вариант C максимально выразителен, но требует трекера глубины, антицикловых guard'ов, очереди событий и пересмотра пункта 5 замороженного L0-F2. Ни B, ни C сами по себе не оживляют S2/S3/S4/S6: всем им предшествует нерешённый вопрос эмитентов lifecycle-событий (§10.1–10.2), а S7 дополнительно зависит от edge-перехвата (B1.3).

Решение остаётся за архитектором; данный документ фиксирует факты, гипотезы и следствия, не выбирая между ними.

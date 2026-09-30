# Capability audit: delivery_unknown source for S4

Read-only capability audit (A-cap). Вопрос аудита: **может ли внешний Argus получить
объективный `delivery_unknown` в сценарии S4, кто его производит, при каких условиях и
через какой observable interface**. Код, тесты, сценарии, конфиги не изменялись.
Ничего не коммичено.

Все ссылки — на текущий main (`529d69e`).

---

## 1. Что проверялось

1. Роль Sut в S4: кто является testSubject, есть ли у него реальный внешний endpoint
   в текущем wiring.
2. Семантика `delivery_unknown`: где тип определён, кем потребляется, есть ли эмитент
   в src/ (вне тестов), входит ли в allow-list mock-канала, как описан в
   `docs/evidence-source-map.md`.
3. Классификация источника ровно в один из трёх классов:
   (A) dedicated observation от Sut / (B) inference from absence / (C) internal-only Sut state.
4. Capability questions по каждому классу; граница с S3.

Метод: grep по `src/` и `docs/`, чтение ScenarioEngine / MockTargetAdapter /
FaultInjector / RunOrchestrator / AgentController / сценариев S3, S4, S7, S8 и
R3-теста `S2-S4-SellerAction.test.ts`. Никаких изменений файлов не производилось.

---

## 2. Роль Sut в S4 vs S8

### 2.1. Sut в S4 — координатор sut-1, НЕ seller

- `src/scenarios/S4_SellerTimeout.ts:30` — `testSubject: 'sut-1'`.
- `src/scenarios/S4_SellerTimeout.ts:20` — `sut-1.protocolRole: 'FACILITATOR'`,
  `ownership: 'EXTERNAL'`.
- Seller в S4 — `resource-server-1`, `RESOURCE_SERVER`, `ownership: 'ARGUS'`
  (`src/scenarios/S4_SellerTimeout.ts:16–19`). То есть **фактически молчащий в S4
  seller — ARGUS-owned**, а Sut — координатор/facilitator поверх него.
- Assertion матчит только `e.source === 'sut-1'`
  (`src/scenarios/S4_SellerTimeout.ts:76,80,82,88`) — `delivery_unknown` для PASS
  обязан прийти с source = `sut-1` (координатор), а не с seller.

### 2.2. Реального внешнего endpoint у sut-1 в текущем wiring НЕТ

Факты wiring:

- Harness создаёт контроллеры **только для ARGUS-owned участников**:
  `src/tests/scenarios/S2-S4-SellerAction.test.ts:39–47` и `:74–81` —
  `if (p.ownership !== 'ARGUS') continue;`. Для S4 это `client-1` и
  `resource-server-1`; для `sut-1` контроллер не создаётся вообще.
- Каждый контроллер обёрнут над `MockTargetAdapter('mock')`
  (`S2-S4-SellerAction.test.ts:39,50,74,208,331`); никакого HTTP-адреса sut-1 нет.
- `HttpAgentAdapter` существует (`src/adapters/http/HttpAgentAdapter.ts:101–113`,
  опция `endpoint`), но в src/**/scenarios и в S4-harness им никто не wired; более
  того, он **не наполняет `metadata.observations`** (в send() metadata = statusCode/
  headers/errorType, `src/adapters/http/HttpAgentAdapter.ts:156–166`) — то есть даже
  гипотетический HTTP-wiring sut-1 сейчас не переносил бы observations.
- Все actions в S4 выполняются ARGUS-owned actor'ами (client-1, resource-server-1);
  `sut-1` — только destination в топологии и метка источника evidence: engine пишет
  observations с `source: this.scenario.testSubject`
  (`src/core/ScenarioEngine.ts:224`, комментарий :124). Наблюдаемые «ответы sut-1» —
  это ответы mock-адаптера за client-контроллером, помеченные source=`sut-1`.
  Отдельного контроллера/транспорта, подключённого к внешнему sut-1, не существует.

### 2.3. Семантика «Sut» в S4

В S4 «Sut» — **гипотетический внешний FACILITATOR/координатор**: декларирован как
EXTERNAL, но физически представлен в прогоне только как *метка источника evidence*
(`source: this.scenario.testSubject`, `src/core/ScenarioEngine.ts:224`), под которой
наблюдается поведение mock-адаптера. Фактически наблюдаемая система в S4 —
ARGUS-owned mock-транспорт + ARGUS-owned seller; настоящего внешнего Sut в wiring нет.

### 2.4. Различие с S8 — другой класс системы

| Признак | S4 | S8 |
|---|---|---|
| sut-1 protocolRole | `FACILITATOR` (`S4_SellerTimeout.ts:20`) | `RESOURCE_SERVER` (`S8_X402Payment.ts:11`) |
| ownership | EXTERNAL | EXTERNAL |
| Состав участников | client-1 + resource-server-1 (seller, ARGUS) + sut-1 | только client-1 + sut-1 (`S8_X402Payment.ts:9–11`) |
| Кто реально обслуживает запросы Sut'а | mock-адаптер за ARGUS-участниками, метка source=sut-1 | тот же mock-механизм, но sut-1 = сам сервер ресурсов (прямой request→response, x402 402/payment-signature) |
| Топология | client→sut-1→resource-server-1 (forward) (`S4_SellerTimeout.ts:24–27`) | client→sut-1 одна edge (`S8_X402Payment.ts:15–17`) |
| Смысл Sut | координатор/settlement-слой, чьё терминальное состояние (UNKNOWN) надо наблюдать | end-to-end ресурсный сервер, поведение которого проверяется протокольным обменом |

S8 — «Sut как сервер ресурсов, отвечающий на прямые запросы»; S4 — «Sut как
координатор, который должен *сообщить* о ненаступлении терминального состояния».
Это разные классы систем: в S4 объект наблюдения — состояние координации, недоступное
как прямой HTTP-ответ; в S8 — сам HTTP-обмен.

---

## 3. Что такое delivery_unknown в текущем main

1. **Определение типа.** Жёсткого enum/union типа в TypeScript нет; `Evidence.type` —
   `string` (`src/core/Evidence.ts:23`). Единственное «место определения» строки
   `'delivery_unknown'` в src (кроме assertions и тестов) — позиция в allow-list:
   `src/adapters/MockTargetAdapter.ts:78` (в составе
   `MOCK_LIFECYCLE_OBSERVATION_TYPES`, `src/adapters/MockTargetAdapter.ts:70–79`).
2. **Потребление в S4.** `assert_timeout_state`
   (`src/scenarios/S4_SellerTimeout.ts:68–98`): gate — `payment_settled` от sut-1
   (:75–78); FAIL при `failed`/`success` от sut-1 или >1 settlement (:80–92);
   **PASS только при наличии evidence `{source:'sut-1', type:'delivery_unknown'}`**
   (:82, :94); иначе INCONCLUSIVE «no terminal state observed yet» (:95).
3. **Потребление в S7.** `assert_seller_sent_but_sut_never_received`
   (`src/scenarios/S7_LostDelivery.ts:96`): после gate `delivery_sent` от
   resource-server-1 и антиусловий (`delivery_received`, duplicate settle, `failed`) —
   PASS требует тот же `{source:'sut-1', type:'delivery_unknown'}`.
4. **Эмитент в main.** Отсутствует. Grep по src без tests: `'delivery_unknown'` —
   только allow-list (`MockTargetAdapter.ts:78`) и два места потребления в assertions
   (`S4:82`, `S7:96`). Ни FaultInjector, ни ScenarioEngine, ни адаптеры его не эмитят:
   - hang-примитив эмитит только `delivery_started`
     (`src/core/FaultInjector.ts:137–141`), при `duration_ms:-1` возвращает
     never-resolving promise (`:141`), при finite — reject `Error('Hang timeout')`
     (`:143–148`) без порождения какого-либо evidence-типа;
   - ScenarioEngine явно отказывается от fallback при отсутствующем exchange:
     «Если outcome.exchange отсутствует (например, action завершился TIMEOUT),
     никакого fallback на action.type как observation не происходит»
     (`src/core/ScenarioEngine.ts:127–129`);
   - AgentController трактует timeout как observed outcome, не semantic verdict
     (`src/core/AgentController.ts:15`).
5. **Allow-list.** Да, входит в `MOCK_LIFECYCLE_OBSERVATION_TYPES`
   (`src/adapters/MockTargetAdapter.ts:78`) — т.е. mock-канал `options.
   lifecycleObservations` способен перенести этот тип, если источник сконфигурирован
   его сообщить (`src/adapters/MockTargetAdapter.ts:161–163,195,201`). Это канал
   переноса, не источник факта (комментарий `MockTargetAdapter.ts:44–55`).
6. **Docs-семантика.** `docs/evidence-source-map.md`, строка #12 (:83): источник по
   смыслу — «Sut (вывод: терминальное состояние не наступило к таймауту)», механизм —
   «I или E-опосредованно — нерешено»; «канонический S4 Sut его не сообщает → S4
   остаётся INCONCLUSIVE; PASS достижим при конфигурации наблюдения». Раздел 4 Q1
   (:195–199): «Семантически UNKNOWN — состояние Sut… Но Sut может и не уметь сообщать
   „не знаю“… Сейчас источник не определён». `docs/argus-layers.md:83`:
   `delivery_unknown | No general emitter | Application`.
   `docs/backlog-open-decisions.md` R3-D1 (:514–528) и R3-002 (:555): варианты A/B/C,
   «No option is selected by this addendum».

---

## 4. Классификация: (A) observation / (B) inference / (C) internal-only

Применение критериев к фактам main:

- **(A) Dedicated observation от Sut — НЕ выполнено в текущем main.** У Sut нет
  специального сигнала/состояния `delivery_unknown`, эмитируемого наружу через
  observable interface: sut-1 вообще не имеет контроллера/endpoint (§2.2), ни один
  канонический сценарий не конфигурирует эмиссию
  (`docs/evidence-source-map.md`, Примечание B: «ни один канонический сценарий его пока
  не конфигурирует»), PASS-путь существует только в тестовой harness-конфигурации
  (`src/tests/scenarios/S2-S4-SellerAction.test.ts:293` — `deliver: ['delivery_unknown']`,
  при удалённых faults). Механизм переноса (O-канал) готов, факт-источник — нет.
- **(B) Inference from absence — фактически это то, что семантически подразумевается
  («timeout ⇒ терминальное состояние не наступило»), но в main такого правила НЕТ и
  оно запрещено архитектурой.** Engine сознательно не выводит ничего из TIMEOUT
  (`ScenarioEngine.ts:127–129`; `AgentController.ts:15`); docs фиксируют, что вывод
  создал бы Argus-owned temporal inference и сдвинул Temporal Trust Boundary
  (`docs/backlog-open-decisions.md:522`). Как класс источника (B) отвергнута: она не
  является observation, а её реализация запрещена non-goals данного аудита.
- **(C) Internal-only Sut state — да, это точный класс текущего состояния.**
  `delivery_unknown` семантически — внутреннее знание Sut-координатора: «я не получил
  терминального ответа от seller к моменту timeout» (§3.6, evidence-source-map #12 и
  Q1). В текущем main Sut **не раскрывает** это состояние ни через какой внешний
  интерфейс: единственная форма существования типа — allow-list mock-канала
  (`MockTargetAdapter.ts:78`) и потребление в assertions (`S4:82`, `S7:96`).
  Гипотетический реальный facilitator знает UNKNOWN из своей внутренней истории
  состояний, недоступной внешнему наблюдателю без специального протокольного поля.

**Классификация: (C) internal-only Sut state** — ровно один класс; смешение (A)+(B)
зафиксировано и отвергнуто: (A) описывает лишь *канал*, которого недостаточно без
реального источника, а (B) запрещена и отсутствует в коде.

Обоснование stop-condition: ответ «есть ли у Sut внутренний state и может ли он его
раскрыть» требует доступа к внутренностям Sut (private API/source) и/или изменения
Argus-кода — оба вне read-only аудита. Поэтому further investigation остановлен на
классификации C.

---

## 5. Capability questions

### Если бы источник был (A)
- Observable interface: в целевой архитектуре — O-канал адаптера: Sut включает
  `delivery_unknown` в `exchange.metadata.observations` успешного ответа
  (`src/adapters/MockTargetAdapter.ts:156–217` — существующий путь mock;
  `src/core/ScenarioEngine.ts:215–231` — engine переносит observations с
  `source=testSubject`). В текущем main для РЕАЛЬНОГО Sut этого нет:
  `HttpAgentAdapter.send()` не заполняет `metadata.observations` вообще
  (`src/adapters/http/HttpAgentAdapter.ts:152–166`).
- Что должно быть добавлено, чтобы (A) стал возможен:
  1. **Слой Sut (внешняя система):** обязательное поле/событие терминального статуса
     в контракте ответа facilitator'а (HTTP body/header/event), которое Sut сообщает
     честно — только когда реально находится в состоянии «нет терминального ответа».
  2. **Слой адаптера:** маппинг этого поля в `metadata.observations` в
     HttpAgentAdapter/X402AgentAdapter (примечание A в evidence-source-map: все O-типы
     требуют «расширить адаптер»).
  3. **Слой движка:** ничего — transport-путь observations уже существует и менять
     его не требуется.
- При (A) S4 PASS требует: sut-1 wired как реальный EXTERNAL target, сообщающий
  `payment_settled` и, на deliver-exchange, `delivery_unknown` (тот же контракт, что
  воспроизведён harness'ом в `S2-S4-SellerAction.test.ts:286–296`).

### По классу (B) — inference
- «Кто именно выводит»: никто в main. Правило «timeout → delivery_unknown»
  отсутствует: engine явно запрещает fallback (см, `ScenarioEngine.ts:127–129`).
- Это **inference, а не observation** (факт отсутствия сообщения к моменту t — вывод
  наблюдателя о времени, а не сообщение системы). Argus-owned temporal inference
  меняет Temporal Trust Boundary (`docs/backlog-open-decisions.md:522`).
- **Запрещено** non-goals аудита и roadmap-границами → как вариант закрыта;
  остаётся выбор между (A)-будущим и (C)-настоящим.

### По классу (C) — internal-only (текущая реальность)
- Возможен ли observable interface? **Не из текущего main.** Он возможен только при
  архитектурном изменении Sut: .facilitator должен начать экспортировать своё
  терминальное UNKNOWN-состояние наружу (тогда состояние переклассифицируется в (A)).
  Без этого внешний Argus принципиально не получает объективного delivery_unknown —
  он видит лишь отсутствие ответа, что есть наблюдение об отсутствии, а не наблюдение
  состояния Sut.
- Формулировка stop-condition дословно: *capability cannot be established from
  external observable interface; classification = C (internal-only)*.

---

## 6. Граница с S3

| | S3 (crash+restart) | S4 (delivery_unknown) |
|---|---|---|
| Что требуется от внешнего Sut | управление жизненным циклом: упасть и перезапуститься (`S3_CrashAfterSettlement.ts:40–45`, fault `type:'crash'`, target `infrastructure/testSubject`) | наблюдение состояния: сообщить терминальный статус UNKNOWN |
| Класс операции | lifecycle control — вне Argus, уже зафиксировано (declared-only, `docs/evidence-source-map.md` #13: «crash fault declared-only, restart-цикла нет»; Q3 §4: реализация привязана к lifecycle-работе движка) | observation — потенциально доступный класс, ЕСЛИ Sut способен раскрыть состояние |
| Барьер | организационно-архитектурный: Argus не управляет процессом Sut | эпистемический: Sut не раскрывает своё внутреннее состояние наружу |

**Общее:** оба требования выходят за пределы возможностей текущего wiring — Sut в обоих
случаях не представлен реальным внешним эндпоинтом, и в обоих случаях замыкание
сценария требует изменений вне Argus (для S3 — lifecycle, для S4 — ability to report).

**Разница:** S3 блокируется *действием над Sut* (нужен kill/restart — capability класса
«control»), S4 блокируется *невидимостью состояния Sut* (нужен сигнал — capability
класса «observe»). Observation-класс теоретически дешевле: он не требует управления
жизненным циклом и может быть закрыт расширением контракта Sut + адаптера (переход
C → A). Именно поэтому S4 не приравнивается к S3: S3 — «Argus не может командовать»,
S4 — «Argus не может увидеть то, что Sut не показывает».

---

## 7. Заключение: что доступно внешнему Argus

1. Внешнему Argus в текущем main **недоступен объективный `delivery_unknown`** от Sut
   в S4: sut-1 не имеет внешнего endpoint (§2.2), эмитента типа в src нет (§3.4),
   единственный работающий путь — mock-канал, конфигурируемый *harness'ом вместо Sut*
   (§3.5), что является симуляцией сообщения, а не наблюдением реальной системы.
2. Классификация источника — ровно **(C) internal-only Sut state**: состояние
   существует по смыслу (assertion-gate S4/S7, docs-семантика), но не раскрывается
   через observable interface.
3. (B) — inference из таймаута — в main отсутствует и запрещена (Temporal Trust
   Boundary); фиксация этого запрета сама по себе является результатом аудита.
4. Для S4 PASS нужен переход C → A: реальный EXTERNAL sut-1, честный контракт
   терминального статуса и маппинг в `metadata.observations` в HTTP/X402-адаптерах.
   До этого S4 остаётся INCONCLUSIVE by design (что и зафиксировано в R3-доках:
   R3-D1, R3-002).
5. Аудит не выбирает (A) или (C) за архитектора: (A) — единственный *возможный*
   будущий класс, (C) — констатация текущего факта.

---

## 8. Открытые вопросы

1. **Контракт facilitator'а:** существует ли где-либо спецификация внешнего Sut
   (Secretariat?), определяющая поле терминального статуса ответа; если да — покрывает
   ли оно UNKNOWN отдельно от FAILED (без этого (A) вырождается в ложный FAIL-сигнал)?
2. **S7 зависит от того же решения:** PASS S7 требует `delivery_unknown` от sut-1
   после edge-loss (`S7_LostDelivery.ts:96`) — переход C→A автоматически открывает
   путь и S7, либо нужно различать источники UNKNOWN для S4/S7?
3. **Граница «честности» канала:** `lifecycleObservations` позволяет harness'у
   сконфигурировать ANY тип из allow-list, включая `delivery_unknown`, — нужен ли
   mechanism разграничения «simulated source says» vs «real Sut reports» в verdict
   provenance (metadata об источнике наблюдения)?
4. **Решение R3-D1 формально не принято:** аудит даёт классификацию текущего
   состояния (C), но architectural choice A/B/C остаётся за архитектором
   (`docs/backlog-open-decisions.md:528`).
5. **HttpAgentAdapter observations-gap:** даже при появлении реального Sut-контракта,
   адаптер не парсит `metadata.observations` (§5) — это отдельная единица работ,
   не покрытая текущим backlog дословно.

# A1 — Каталог сценариев S1–S8

Статус: read-only анализ. Код, тесты и сценарии не менялись. Решения (переименование, переклассификация, выбор блоков) принимает архитектор (Игорь). Здесь — только каталог и классификация по трём блокам.

Определения блоков (из задания):
- **Блок A — AGENT.** Argus играет роль CLIENT или RESOURCE_SERVER и тестирует внешнего агента на другом конце сделки.
- **Блок B — COORDINATOR.** Argus играет роль FACILITATOR или наблюдает за координатором.
- **Блок C — OUTSCOPE.** Сценарии, требующие инфраструктуры, которой у Argus нет и не должно быть.

Входы: `docs/s1-s8-atom-map.md` (27 атомов), `docs/l0-f-lifecycle-analysis.md`, `docs/backlog-open-decisions.md` (B0-005/B1.2, B0-006/B1.3, B0-008/B2, B0-010/B4), `src/scenarios/S1…S8.ts`, `src/core/Participant.ts`.

---

## 1. Что проверялось

- Полностью прочитаны все восемь файлов сценариев (`src/scenarios/S1_DuplicateRequest.ts` … `S8_X402Payment.ts`): participants/roles/ownership, topology, actions, faults, invariants, assertions (с цитатами условий PASS/FAIL/INCONCLUSIVE), testSubject.
- Прочитан `src/core/Participant.ts`: канонические роли x402 v2 — `CLIENT | RESOURCE_SERVER | FACILITATOR`; `protocolRole` — per-scenario, не глобальная; ownership `ARGUS | EXTERNAL`.
- Сопоставлено с картой атомов A0 (какие атомы ✅/⚠️/❌ в каждом сценарии) и с выводом B1.2 (ни одно lifecycle-событие не доходит до dispatch; эмитентов settlement-цикла нет).
- Определена роль Argus в каждом сценарии через composition root: кто исполняется контроллерами Argus (участники ownership=ARGUS), кто внешний таргет (`testSubject` + adapter endpoint), есть ли у Argus роль FACILITATOR вообще.

Ключевой структурный факт для классификации: **во всех S1–S7 фасилитатор/координатор (`sut-1`) объявлен как EXTERNAL — то есть Argus нигде в текущих сценариях сам не играет FACILITATOR**; он играет стороны сделки (buyer-1, seller-1) и наблюдает за внешним координатором через evidence. Это расхождение «название сценария обещает координацию, а wiring тестирует чужого координатора с конца сделки» — центральное для разбора по блокам (см. §4, §9). Роли Argus ниже указываются как они следуют из фактического wiring, а не из названий.

## 2. Что уже есть в main

| Источник | Что даёт каталогу |
|---|---|
| `src/scenarios/S1…S8.ts` | 8 зарегистрированных сценариев (`src/cli/ScenarioRegistry.ts`); S1–S7 — канва buyer-1(CLIENT/ARGUS) + seller-1(RESOURCE_SERVER/ARGUS) + sut-1(FACILITATOR/EXTERNAL), одно действие `request_payment` от buyer-1; S8 — buyer-1(CLIENT/ARGUS) + sut-1(RESOURCE_SERVER/EXTERNAL), действие `request_resource`, faults: []. |
| `src/core/Participant.ts` | Три канонические роли; комментарий прямо фиксирует: sut-1 — FACILITATOR в S1–S7, RESOURCE_SERVER в S8; отсутствие endpoint'а у seller-1 — ограничение wiring, не отсутствие роли. |
| `docs/s1-s8-atom-map.md` | 27 атомов: 12 ✅, 5 ⚠️ (механизм есть, недостижим), 10 ❌ (отсутствуют). Живые сценарии: S1, S5, S8. |
| `docs/l0-f-lifecycle-analysis.md` | Lifecycle-триггеры declared-only; ни один вариант A/B/C не оживляет S2/S3/S4/S6 без эмитентов (B1.2a); S7 дополнительно зависит от edge-перехвата (B1.3). |
| `docs/backlog-open-decisions.md` | Владелец отсутствующих атомов: B1.2a/B1.2b (эмиссия и контракт отправки), B1.3 (edge/infra), B2 (wiring), B4 (семантика), B5 (инфраструктура репозитория). Первый live-кандидат B2 — S1 с HttpAgentAdapter. |
| `src/tests/scenarios/S1-S7.test.ts` | Фиксирует фактические вердикты: S1 PASS, S5 PASS, S6 INCONCLUSIVE (scaffolding); в `src/tests/integration/X402FullFlow.test.ts` — S8 PASS. Отдельного scenario-теста для S8 нет. |

## 3. Каталог S1–S8 (по каждому сценарию)

### S1 — Duplicate Request

| Поле | Значение |
|---|---|
| id | S1 (файл `src/scenarios/S1_DuplicateRequest.ts`, export `S1_DuplicateRequest`) |
| название | Duplicate Request |
| инвариант | `no_duplicate_payment_intent`: «При дублировании запроса с одинаковым idempotencyKey, test subject должен создать ровно один payment_intent» |
| тестируемый объект | sut-1 (FACILITATOR, EXTERNAL) — внешний координатор |
| роль Argus | CLIENT (buyer-1 — актор единственного действия) + RESOURCE_SERVER (seller-1, объявлен, но действий не выполняет); фактически Argus — сторона сделки, наблюдающая за чужим фасилитатором |
| участники | buyer-1 CLIENT/ARGUS; seller-1 RESOURCE_SERVER/ARGUS; sut-1 FACILITATOR/EXTERNAL(testSubject) |
| атомы | A1 ✅ (duplicate_request применён), A2 ✅ (sut-1/payment_intent_created key-1 ×1) |
| блок | **A** (по факту wiring: Argus-as-CLIENT против внешнего Sut). Примечание: семантически задуман как проверка координатора (idempotency фасилитатора) → при переписывании под живого Facilitator-Sut перейдёт в B. См. §9. |
| реализуемость сейчас | **PASS** (зафиксировано `S1-S7.test.ts`) |
| требует | Ничего для текущего вида. Для live-режима — HTTP-адаптер и первый живой candidate (B2); для блока B-версии — Sut-фасилитатор с идемпотентным ledger |
| возможные ступени | S1.1 = сегодня (mock-Sut, action-fault duplicate). S1.2 = то же против реального x402-координатора/таргета. S1.3 = параллельные каналы доставки дубля (edge-слой, B1.3). Вне области: crash Sut между дублями (это S3-класс, см. §5) |

### S2 — Payment Before Execution

| Поле | Значение |
|---|---|
| id | S2 (файл `src/scenarios/S2_PaymentBeforeExecution.ts`, export `S2_PaymentBeforeExecution`) |
| название | Payment Before Execution |
| инвариант | `no_premature_success`: «SUCCESS не должен фиксироваться раньше, чем seller фактически ответил» |
| тестируемый объект | sut-1 (FACILITATOR, EXTERNAL) — именно он решает, когда фиксировать success |
| роль Argus | CLIENT (buyer-1) + RESOURCE_SERVER (seller-1 — цель сбоя delayed_response, но не актор); наблюдатель порядка событий Sut |
| участники | buyer-1 CLIENT/ARGUS; seller-1 RESOURCE_SERVER/ARGUS; sut-1 FACILITATOR/EXTERNAL |
| атомы | A3 ✅ (payment_intent_created — assertion'ом не используется), A4 ❌ (sut-1/payment_settled — нет эмитента), A5 ❌ (sut-1/success — нет эмитента), A6 ⚠️ (delayed_response на delivery_started — механизм есть, недостижим) |
| блок | **B** — инвариант про порядок фиксации успеха *координатором*; без наблюдения за фасилитатором проверка бессмысленна |
| реализуемость сейчас | **INCONCLUSIVE** (не может дать PASS: settlement/success не эмитятся) |
| требует | B1.2a (эмитенты `payment_settled`, `success`, `delivery_completed`), B1.2b (контракт отправки lifecycle — иначе delayed_response не запустится), B2 (seller-1 со своим контроллером, чтобы `delivery_completed from seller-1` был честным доказательством) |
| возможные ступени | S2.1 (база): settled позже ответа seller — PASS = success timestamp > delivery_completed. S2.2: добавить задержку ответа (delayed_response как action-fault на собственном действии seller — требует B2). S2.3: задержка + потеря первого ответа (edge, B1.3). S2.4: вне — если success решается внутри закрытого Sut без наблюдаемых событий |

### S3 — Crash After Settlement

| Поле | Значение |
|---|---|
| id | S3 (файл `src/scenarios/S3_CrashAfterSettlement.ts`, export `S3_CrashAfterSettlement`) |
| название | Crash After Settlement |
| инвариант | `no_double_settlement_after_crash`: «После crash+restart ровно один settlement на операцию. Retry к seller возобновляется после restart, повторная оплата не создаётся» |
| тестируемый объект | sut-1 (FACILITATOR, EXTERNAL) — его жизненный цикл и восстановление |
| роль Argus | CLIENT + RESOURCE_SERVER (формально); реально требуемая роль — **оператор инфраструктуры Sut** (остановка/перезапуск), которой у Argus нет |
| участники | buyer-1 CLIENT/ARGUS; seller-1 RESOURCE_SERVER/ARGUS; sut-1 FACILITATOR/EXTERNAL |
| атомы | A7 ⚠️ (crash на payment_settled + infrastructure-target — двойная блокировка, restart-механизма нет), A8 ❌ (payment_settled), A9 ❌ (recovery_completed), A10 ❌ (engine/forward_request после recovery) |
| блок | **C (OUTSCOPE)** в текущем виде: требует управления жизненным циклом внешнего объекта (stop/restart Sut) — инфраструктурой, которой у Argus нет и по границе EXTERNAL быть не должно. Инвариант при этом реальный (см. §7) |
| реализуемость сейчас | **Нереализуем** (INCONCLUSIVE по всем четырём атомам; даже при выборе B/C нужна infra-механика B1.3/B5) |
| требует | Для частичного оживления: B1.2a (settlement-emitter), B1.3 (infrastructure-перехват), механизм restart Sut + resumption (вне текущих блоков, кандидат B5/infra). Полный S3 остаётся вне Argus |
| возможные ступени | S3.1 (база): settlement произошёл, ничего больше — PASS = ровно один settlement. Реализуемо при B1.2a. S3.2: settlement + повторный запрос — PASS = ровно один settlement, дубля нет. Реализуемо при B1.2a (+ B1.2b для adversarial-пути). S3.3: settlement, разрыв соединения, восстановление — PASS = ровно один settlement. Требует transport-разрыв (B2/http) + reconnect-политику. S3.4: settlement + crash самого Sut + restart — **вне Argus**: требует управления внешним объектом |

### S4 — Seller Timeout

| Поле | Значение |
|---|---|
| id | S4 (файл `src/scenarios/S4_SellerTimeout.ts`, export `S4_SellerTimeout`) |
| название | Seller Timeout |
| инвариант | `timeout_yields_unknown_not_failed`: «Settled + seller не отвечает → DELIVERY_UNKNOWN, не FAILED, не SUCCESS, без повторной оплаты» |
| тестируемый объект | sut-1 (FACILITATOR, EXTERNAL) — именно он выставляет терминальное состояние |
| роль Argus | CLIENT + RESOURCE_SERVER (seller-1 — цель hang, но не актор); наблюдатель терминального состояния Sut |
| участники | buyer-1 CLIENT/ARGUS; seller-1 RESOURCE_SERVER/ARGUS; sut-1 FACILITATOR/EXTERNAL |
| атомы | A11 ⚠️ (hang на delivery_started, target≠actor — недостижим), A12 ❌ (payment_settled), A13 ❌ (delivery_unknown), A14 ✅ (негативы failed/success — пассивно истинны) |
| блок | **B** — проверяет дисциплину состояний координатора при таймауте |
| реализуемость сейчас | **INCONCLUSIVE** |
| требует | B1.2a (settlement-emitter, delivery_unknown-emitter), B1.2b (запуск hang по событию), B2 (seller с собственным контроллером, чтобы «seller не отвечает» было управляемым фактом, а не отсутствием пути) |
| возможные ступени | S4.1 (база): settled + seller молчит → UNKNOWN (нужны эмитенты + модель прерывания). S4.2: + отсутствие повторной оплаты после UNKNOWN (пересекается с S6). S4.3: + несколько операций с разными исходами таймаута. S4.4: вне — реальный сетевой таймаут против внешнего seller без Argus-контроля над ним |

### S5 — Concurrent Duplicate

| Поле | Значение |
|---|---|
| id | S5 (файл `src/scenarios/S5_ConcurrentDuplicate.ts`, export `S5_ConcurrentDuplicate`) |
| название | Concurrent Duplicate |
| инвариант | `concurrent_requests_single_intent`: «5 параллельных запросов с одним idempotencyKey создают ровно один payment_intent» |
| тестируемый объект | sut-1 (FACILITATOR, EXTERNAL) |
| роль Argus | CLIENT (buyer-1 — актор; concurrent_request бьёт по его же действию); seller-1 формально RESOURCE_SERVER без действий |
| участники | buyer-1 CLIENT/ARGUS; seller-1 RESOURCE_SERVER/ARGUS; sut-1 FACILITATOR/EXTERNAL |
| атомы | A15 ✅ (concurrent ×5), A16 ✅ (payment_intent_created key-5 ×1), A17 ✅ (негатив unhandled_exception — в mock тривиален) |
| блок | **A** (по факту wiring — стресс нагрузки со стороны клиента на внешний Sut; как и S1, migrate-кандидат в B при появлении Sut-фасилитатора). См. §9 |
| реализуемость сейчас | **PASS** (зафиксировано тестом) |
| требует | Для усиления: B2/live-транспорт; честность A17 требует реального Sut вместо mock (иначе PASS по умолчанию — открытый вопрос A0 №6) |
| возможные ступени | S5.1 = сегодня (parallel_count=5, mock). S5.2 = против live-таргета (B2). S5.3 = конкурентные разные ключи + одинаковые (комбинированный стресс). Вне: многоклиентская конкуренция через реальные сокеты/потоки (блок A-каталог, §6) |

### S6 — Payment Retry

| Поле | Значение |
|---|---|
| id | S6 (файл `src/scenarios/S6_PaymentRetry.ts`, export `S6_PaymentRetry`) |
| название | Payment Retry |
| инвариант | `no_duplicate_payment_on_unknown`: «Пока reconciliation не подтвердил NOT_SETTLED, новая authorization для той же логической операции отклоняется» |
| тестируемый объект | sut-1 (FACILITATOR, EXTERNAL) — его reconciliation-политика |
| роль Argus | CLIENT (buyer-1 — цель retry-fault, adversarial-поведение моделируется на своей стороне); наблюдатель settlement-исходов |
| участники | buyer-1 CLIENT/ARGUS; seller-1 RESOURCE_SERVER/ARGUS; sut-1 FACILITATOR/EXTERNAL |
| атомы | A18 ⚠️ (retry на settlement_unknown — недостижим), A19 ❌ (payment_settled ×1 — нет эмитента) |
| блок | **B** — инвариант про политику координации/reconciliation |
| реализуемость сейчас | **INCONCLUSIVE** (тест явно фиксирует «scaffolding») |
| требует | B1.2a (settlement/settlement_unknown-эмитенты), B1.2b (запуск retry по событию); при варианте «adversarial buyer сам ретраит» возможен перенос триггера на action_* — это редакция семантики (B4), не текущий блок |
| возможные ступени | S6.1 (база): settlement ×1, повторный запрос при UNKNOWN → дубля нет (нужен settlement-emitter). S6.2: N adversarial-ретраев (retry_count=3) поверх UNKNOWN. S6.3: + подтверждение NOT_SETTLED разрешает новую авторизацию (reconciliation-исход как событие). Вне: реальный chain-level reconciliation |

### S7 — Lost Delivery

| Поле | Значение |
|---|---|
| id | S7 (файл `src/scenarios/S7_LostDelivery.ts`, export `S7_LostDelivery`) |
| название | Lost Delivery |
| инвариант | `lost_response_yields_unknown_not_duplicate`: «Seller фактически отправил ответ (respond), но secretariat его не получил (edge fault). Состояние — DELIVERY_UNKNOWN, платёж не дублируется, допустим повторный запрос к seller (не платёж)» |
| тестируемый объект | sut-1 (FACILITATOR, EXTERNAL) — реакция на потерю ответа |
| роль Argus | CLIENT (buyer-1) + RESOURCE_SERVER (seller-1 реально «действует» через baseline respond — единственный участник, эмитящий live-доказательство) |
| участники | buyer-1 CLIENT/ARGUS; seller-1 RESOURCE_SERVER/ARGUS; sut-1 FACILITATOR/EXTERNAL |
| атомы | A20 ✅ (seller-1/delivery_sent через respond), A21 ⚠️ (lost_delivery на edge — перехвата нет), A22 ❌ (путь reception seller→sut отсутствует), A23 ❌ (delivery_unknown — нет эмитента) |
| блок | **B** — сценарий о поведении координатора при потере канала; плюс явная зависимость от edge-механики (B1.3) |
| реализуемость сейчас | **INCONCLUSIVE** (половина доказательств жива: sellerSent наблюдается; эффект потери — мёртв) |
| требует | B1.3 (edge-перехват seller→sut), B1.2b (dispatch по `delivery_sent`), B1.2a (delivery_unknown-emitter), B2 (seller как отдельный исполнитель с reception-каналом). В комментарии самого сценария прямо сказано: «Станет содержательным при HTTP-интеграции» |
| возможные ступени | S7.1 (база): sent + received → UNKNOWN не возникает (контрольный прогон). S7.2: sent + drop на ребре → UNKNOWN, дубля платежа нет (B1.3+B1.2b). S7.3: drop + повторный forward-запрос (не платёж) → success. Вне: физическая потеря пакетов в реальной сети |

### S8 — X402 Payment Flow

| Поле | Значение |
|---|---|
| id | S8 (файл `src/scenarios/S8_X402Payment.ts`, export `S8_X402Payment`) |
| название | X402 Payment Flow |
| инвариант | `payment_signed_and_retried`: «При получении 402 buyer должен подписать и повторить запрос» |
| тестируемый объект | sut-1 (RESOURCE_SERVER, EXTERNAL) — реальный/мок x402-таргет (Sitecheck в смоуках) |
| роль Argus | **CLIENT** (buyer-1 — единственная роль; фасилитатора в сценарии нет, двухсторонняя сделка «клиент ↔ внешний агент») |
| участники | buyer-1 CLIENT/ARGUS; sut-1 RESOURCE_SERVER/EXTERNAL (protocolRole у sut-1 опционален и здесь задан; seller-1 отсутствует) |
| атомы | A24 ✅ (402→PAYMENT_REQUIRED), A25 ✅ (resolver+подпись), A26 ✅ (engine/payment_signed_and_retried), A27 ✅ (негативные ветки signing_failed/no_resolver) |
| блок | **A** — эталон блока: Argus-as-CLIENT против внешнего агента на конце сделки |
| реализуемость сейчас | **PASS** (integration-тест на моке x402 + смоук против реального Sitecheck) |
| требует | Ничего — работает целиком на существующих атомах |
| возможные ступени | Уже «живой» уровень. Расширения (таймаут, 5xx, retry) — новые сценарии блока A (§6), не ступени S8 |

## 4. Сводная таблица по блокам

| Сценарий | Блок | Тестируемый объект | Роль Argus | PASS сейчас | Требует |
|---|---|---|---|---|---|
| S1 | A (migrate-кандидат B) | sut-1 FACILITATOR/EXTERNAL | CLIENT (+ формально RESOURCE_SERVER) | Да | live-транспорт (B2) — для усиления; ничего — для текущего вида |
| S2 | B | sut-1 FACILITATOR/EXTERNAL | CLIENT/RESOURCE_SERVER, наблюдатель | Нет (INCONCLUSIVE) | B1.2a + B1.2b + B2 |
| S3 | **C** | sut-1 FACILITATOR/EXTERNAL | требуется оператор инфраструктуры Sut | Нереализуем | B1.2a + B1.3 + restart/resumption (вне Argus) |
| S4 | B | sut-1 FACILITATOR/EXTERNAL | CLIENT/RESOURCE_SERVER, наблюдатель | Нет (INCONCLUSIVE) | B1.2a + B1.2b + B2 |
| S5 | A (migrate-кандидат B) | sut-1 FACILITATOR/EXTERNAL | CLIENT | Да | live-таргет (B2) — для честности негативного атома |
| S6 | B | sut-1 FACILITATOR/EXTERNAL | CLIENT (adversarial), наблюдатель | Нет (INCONCLUSIVE) | B1.2a + B1.2b |
| S7 | B | sut-1 FACILITATOR/EXTERNAL | CLIENT + RESOURCE_SERVER (respond) | Нет (INCONCLUSIVE) | B1.3 + B1.2b + B1.2a + B2 |
| S8 | A | sut-1 RESOURCE_SERVER/EXTERNAL | CLIENT | Да | — |

Итог по блокам: **A — 3 (S1, S5, S8), B — 4 (S2, S4, S6, S7), C — 1 (S3)**. Реализуемо сейчас: 3 (S1, S5, S8). Требует доработки: 4 (S2, S4, S6, S7). Вне Argus в текущем виде: 1 (S3; частично — ступень S3.4).

Оговорка классификации: S1 и S5 отнесены к A по факту wiring (Argus играет сторону сделки, Sut внешний), хотя их инварианты (идемпотентность, однократный intent) — инварианты координатора. Если архитектор решит делать Sut-фасилитатора живым объектом исследования, эти два сценария — первые кандидаты на миграцию в B без изменения инвариантов. Решение о миграции — за архитектором; здесь зафиксировано только напряжение.

## 5. Лестничный подход для проблемных сценариев

Общее правило лестниц: S*.1 — база, проверяемая минимальным числом атомов; далее добавляются стресс-факторы; последняя ступень — то, что требует инфраструктуры вне Argus.

### S2 (блок B)
- **S2.1 (база):** обычная сделка дошла до конца: settlement, ответ seller, success. PASS = `success.timestamp ≥ delivery_completed.timestamp` и оба события наблюдаемы. Нужно: эмитенты settlement/success/delivery_completed (B1.2a), честный seller-wiring (B2). Сбоев нет.
- **S2.2 (стресс-фактор: задержка):** delayed_response — ответ запаздывает после settlement. PASS = success не зафиксирован раньше delivery_completed. Нужно: S2.1 + путь запуска сбоя (B1.2b) либо перенос сбоя на action-триггер собственного действия seller (редакция семантики, B4).
- **S2.3 (стресс-фактор: потеря + задержка):** первый ответ теряется на ребре, второй приходит поздно. Нужно: + B1.3 (edge).
- **S2.4 (вне Argus):** success фиксируется внутри закрытого Sut без каких-либо наблюдаемых событий — проверить невозможно извне; признание non-observable.

### S3 (блок C)
- **S3.1 (база):** settlement произошёл, ничего больше. PASS = ровно один settlement. Нужно: settlement-emitter (B1.2a). Это уже вывод S3 из чистого C в наблюдаемую базу.
- **S3.2 (добавка):** settlement, потом повторный запрос. PASS = ровно один settlement, дубля нет. Нужно: S3.1 + action-путь повтора (есть сегодня).
- **S3.3 (добавка):** settlement, разрыв соединения, восстановление соединения (transport-level). PASS = ровно один settlement. Нужно: S3.1 + http-адаптер с контролируемым разрывом (B2/B4 territory).
- **S3.4 (вне Argus):** settlement, crash и restart самого Sut. Требует управления жизненным циклом внешнего объекта (stop/start процесса Sut) — инфраструктуры, которой у Argus нет и которая противоречит ownership=EXTERNAL. Атомы A7(restart)/A9/A10 остаются здесь навсегда, пока Sut внешний.

### S4 (блок B)
- **S4.1 (база):** settled + seller отвечает вовремя. PASS = terminal state ≠ UNKNOWN (контрольный прогон). Нужно: эмитенты settlement/terminal-состояний (B1.2a).
- **S4.2 (стресс-фактор: hang):** seller не отвечает никогда. PASS = `delivery_unknown`, не failed/success, settlement не дублируется. Нужно: S4.1 + достижимый hang (B1.2b + B2: seller как самостоятельный исполнитель).
- **S4.3 (стресс-фактор: таймаут с поздним ответом):** ответ приходит после выставления UNKNOWN. PASS = UNKNOWN не откатывается в SUCCESS без подтверждения, дублей нет. Нужно: S4.2 + модель времени/очереди событий.
- **S4.4 (вне Argus):** реальный сетевой таймаут против внешнего seller, которым Argus не управляет — нужен network-level chaos (вне области; Argus детерминирован by design).

### S6 (блок B)
- **S6.1 (база):** один settlement, один запрос. PASS = settlements.length === 1. Нужно: settlement-emitter (B1.2a).
- **S6.2 (стресс-фактор: adversarial retry):** settlement в состоянии UNKNOWN, buyer делает 3 новых авторизации. PASS = дубликата settlement нет. Нужно: S6.1 + settlement_unknown-emitter + запуск retry (B1.2b) или перенос retry на action-триггер (B4-редакция).
- **S6.3 (стресс-фактор: reconciliation-разрешение):** после подтверждения NOT_SETTLED новая авторизация разрешена. PASS = ровно один settlement на старую операцию + легитимная новая. Нужно: S6.2 + событие reconciliation_outcome (новый атом, B1.2a).
- **S6.4 (вне Argus):** сверка с реальным блокчейном/расчётным слоем (chain-level reconciliation) — внешняя инфраструктура.

### S7 (блок B)
- **S7.1 (база):** seller отправил, Sut получил. PASS = delivery_received наблюдается, UNKNOWN нет. Нужно: reception-канал seller→sut (B1.3/B2) — базовый атом A22 сегодня отсутствует.
- **S7.2 (стресс-фактор: дроп):** ответ дропнут на ребре (drop_probability=1.0). PASS = sellerSent есть, sutReceived нет, terminal=UNKNOWN, дубля платежа нет. Нужно: S7.1 + edge-перехват (B1.3) + dispatch по delivery_sent (B1.2b) + delivery_unknown-emitter (B1.2a).
- **S7.3 (стресс-фактор: дроп + повторный forward):** после UNKNOWN — повторный запрос к seller (не платёж), второй ответ проходит. PASS = success без дублирования оплаты. Нужно: S7.2 + multi-action-сценарий (движок поддерживает последовательности действий).
- **S7.4 (вне Argus):** вероятностная потеря в реальной сети (drop_probability<1 без seed-RNG) — недетерминизм, противоречащий модели воспроизводимости Argus.

## 6. Сценарии для блока A (описание, без реализации)

Сейчас в блоке A фактически покрыта одна ситуация: «клиент → внешний агент, успешный x402-цикл с 402→подпись→повтор» (S8). Типовые ситуации на концах сделки, для которых сценариев нет:

1. **Клиент → внешний агент: обычная покупка без 402** (ресурс отдаётся сразу). Проверяет: корректная обработка успеха, отсутствие ложных payment-событий. Атомы: все существуют (performAction/engine-события), новый не нужен.
2. **Клиент → внешний агент: таймаут таргета.** Argus ждёт, соединение висит. Проверяет: исход — UNKNOWN-подобное состояние, не FAILED; повторной оплаты нет. Требует: контролируемый задержкой http-адаптер/транспорт (B2-объект), engine-эмитент timeout-исхода (новый атом того же класса, что payment_required_no_resolver).
3. **Клиент → внешний агент: ошибка транспорта (5xx/сбой соединения).** Проверяет: verdict честно падает в INCONCLUSIVE/Runtime error, payment не подписывается. Атомы почти есть (RunOrchestrator ловит runtime-ошибку); нужен способ инжектировать ошибку в адаптер.
4. **Клиент → внешний агент: 402, но подпись не прошла / resolver отсутствует.** Ветки `payment_signing_failed`/`payment_required_no_resolver` уже реализованы в движке (A27), но отдельного сценария нет — нужен сценарий, а не код.
5. **Клиент → внешний агент: повторный запрос после 402 без новой оплаты** (идемпотентность на конце сделки, клиентская версия S1). Требует: двухшаговый сценарий (actions[] из двух элементов — поддерживается языком).
6. **Внешний агент → Argus (Argus в роли RESOURCE_SERVER).** Сторонний клиент стучится к Argus за ресурсом; проверяется протокольная корректность ответа Argus (402 c header, выдача ресурса после оплаты). Требует нового механизма: inbound-эндпоинт Argus + вход «внешний запрос → движок»; сейчас весь ввод односторонний (Argus инициирует). Это крупнейший недостающий класс блока A.
7. **Параллельные запросы от нескольких клиентов к одному внешнему агенту.** Клиентская версия S5, но с несколькими независимыми buyer-контекстами. Требует: мульти-экземплярный wiring (B2) и, вероятно, параллельный прогон действий.
8. **Медленный/частичный ответ внешнего агента (chunked/streaming).** Позже, при появлении streaming-таргетов; помечено как низкий приоритет.

Ни один из этих сценариев не написан; раздел — только описание дефицита покрытия.

## 7. Инварианты, которые могут потеряться

| Инвариант | Откуда | Проблема | Варианты обращения (решение за архитектором) |
|---|---|---|---|
| `no_double_settlement_after_crash` | S3 | S3 уходит в C; проверять crash внешнего Sut Argus не может. Инвариант реальный и ценный | Оставить как требование к другому инструменту (chaos/SRE-слой над Sut) или пересобрать как S3.1–S3.3 (без crash'а) — тогда инвариант «одна оплата на операцию» сохраняется частично |
| `no_premature_success` (часть «успех раньше settle») | S2 | При варианте A (lifecycle = только доказательства) причинно-следственная часть (delayed_response по событию) теряет смысл | Разделить: порядковая часть проверяема evidence-ассертом при наличии эмитентов; causal-часть — декларативное требование |
| `timeout_yields_unknown_not_failed` | S4 | Терминальный UNKNOWN выставляет внешний Sut; без его наблюдаемости инвариант unverifiable | Требовать от Sut observable terminal states (контракт тестируемой стороны) или признать условно-проверяемым |
| `no_duplicate_payment_on_unknown` | S6 | Reconciliation-логика внутри Sut; Argus видит только settlement-исходы | Сохраняем как evidence-инвариант («дубликата settlement не наблюдалось») — ослабленная, но честная формулировка |
| `lost_response_yields_unknown_not_duplicate` | S7 | Часть «seller реально отправил» approximable (respond), часть « Sut не получил и стал UNKNOWN» требует edge+reception | Не терять: лестница S7.1/S7.2 сохраняет обе части при B1.3; до этого — фиксация INCONCLUSIVE как честный результат |
| `concurrent_requests_single_intent` / `no_duplicate_payment_intent` | S5/S1 | Инварианты целы, но в mock-среде PASS частично тривиален (unhandled_exception никто не эмитит) | Не потеряются, но рискуют стать «ложно-зелёными»; вопрос семантики к B4 |

Ни один инвариант не предлагается удалить; все спорные имеют минимум одну сохраняющую интерпретацию.

## 8. Открытые вопросы

1. **Критерий отнесения S1/S5 к A vs B.** Классификация по wiring (кто играет Argus) даёт A; классификация по смыслу инварианта (что проверяется — поведение координатора) даёт B. Какой критерий первичен — решение архитектора; от него зависит, писать ли «B-версию» S1/S5 заново или мигрировать текущие.
2. **Судьба S3:** полный уход в C или жизнь в усечённой базе S3.1/S3.2? В каталоге S3 помечен C по текущему виду (crash+restart обязателен в формулировке инварианта).
3. **Inbound-режим блока A (Argus как RESOURCE_SERVER)** — самый большой отсутствующий механизм. Входит ли он в объём Argus вообще, и если да — какой блок владеет inbound-путём? Из backlog такого владельца нет.
4. **Инварианты S2/S4/S6 без causal-части:** достаточно ли evidence-only версии (при варианте A из B1.2) или сценарии обязаны ждать B-контракта? Пересекается с открытым вопросом A0 №9 (регламент оживления).
5. **Переименование/ренумерация:** при переклассификации S1/S5↔B, S3→C меняется ли нумерация (S-identifiers в CLI-реестре)? Сейчас запрещено менять — зафиксировать отдельно.
6. **Граница «подобных S3»:** какие ещё будущие сценарии автоматически попадают в C? Критерий «требует управления жизненным циклом EXTERNAL-объекта» предложен, но не утверждён.
7. **Негативные атомы в mock** (A14, A17): считать PASS'ы S5/S4-негативы полноценными доказательствами? Влияет на колонку «реализуемость сейчас».
8. **Отсутствие scenario-теста у S8:** покрытие через integration/external-тесты — норма для блока A или дефект каталога?

## 9. Заключение (без выбора решений)

- Каталог покрывает все 8 сценариев. Раскладка по блокам при критерии «роль Argus по факту wiring»: **A — S1, S5, S8; B — S2, S4, S6, S7; C — S3**. Реализуемы сегодня (могут дать честный PASS): S1, S5, S8. Требуют доработки (INCONCLUSIVE по причине отсутствующих атомов): S2, S4, S6, S7. Вне Argus в текущем виде: S3 (ступень S3.4 навсегда; базы S3.1–S3.3 возвращаются в игру при B1.2a).
- Главная находка каталога: S1–S7 писались «под координатора», но по wiring во всех них Argus играет концы сделки, а координатор внешний. Поэтому граница A/B для S1/S5 размыта, и любое решение о ней (миграция или переписывание) должно быть принято до B4, чтобы не переписывать сценарии дважды.
- Дефицит блока A — не в атомах (карта A0 показывает: обычные клиентские сценарии собираются из уже работающих механизмов), а в отсутствии самих сценариев и одного нового механизма (inbound Argus-as-RESOURCE_SERVER).
- Ни один инвариант не потерян без альтернативы: каждый спорный имеет формулировку, сохраняемую внутри соответствующего блока (§7).
- Все решения (критерий A/B, судьба S3, inbound-объём, переименование) остаются за архитектором; документ фиксирует варианты и последствия, не выбирая.

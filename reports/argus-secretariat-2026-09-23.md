# Отчёт: Argus ↔ Secretariat — первая «свадьба»

Дата: 2026-09-23
Ветка Argus: `qwen-code-19323ba3-7ef0-4c13-ae9c-6e8346aad123`

## 1. Этап 0 — Разведка (результаты)

### Где Secretariat
- Репозиторий: `https://github.com/igor-vii/Zeus-Insurance-BOT`, ветка `main` (клон доступен в контейнере: `/tmp/zeus`).
- **`zeus-secretariat`** (`/tmp/zeus/zeus-secretariat`) — это **НЕ HTTP-сервис**. Это TypeScript-библиотека
  (state machine, payment intent lifecycle, settlement/reconciliation, evidence store). В `src/` нет
  `listen/createServer/express`. Запускается как импорт (`import { ... } from 'zeus-secretariat'`).
- HTTP + x402-поверхность находится в **`api-server`** того же монорепо:
  - Express + `paymentMiddleware` из пакета `x402-express` (guard защищённых маршрутов);
  - `GET /api/x402/info` — информация о x402-эндпоинтах (`x402Supported: true`, facilitator `https://x402.org/facilitator`);
  - защищённые маршруты: `POST /api/insurance/prepare-buy`, `POST /api/escrow/create` (сети `eip155:196` X Layer; legacy Base Sepolia `eip155:84532`);
  - порт — из ENV `PORT` (обязателен), `ZEUS_TREASURY` — адрес казначейства (без него x402-middleware отключается).
- Связка: `api-server/src/lib/post-settlement-recovery.ts` импортирует `HttpSellerExecutionAdapter` из `zeus-secretariat`,
  т.е. **Secretariat выступает и покупателем (через facilitator-клиент) и исполнителем продаж (seller execution client)** —
  wire-формат: `POST` + base64-заголовок `PAYMENT-SIGNATURE` (`encodePaymentSignature` в `x402-facilitator-client.ts`).
  Этот формат совпадает с тем, что шлёт Argus (`X402AgentAdapter.sendWithSignature`).

### Тестовый SUT
- Mock-режим: есть (`MockFacilitatorClient`, `MockSellerExecutionAdapter` в zeus-secretariat).
- Testnet: Base Sepolia (legacy) и X Layer 196 — реальные сети через facilitator `x402.org`.
- Mainnet: X Layer (196).

### Ограничение контейнера (честно)
Поднять полноценный api-server Зевса в этой среде нельзя: pnpm-workspace с `catalog:`-зависимостями,
общий `@workspace/db` (Drizzle + БД Зевса, доступа к которой в контейнере нет), внешние сети/RPC.
Поэтому «женитьба» в этом заходе выполнена на **уровне протокольной совместимости wire-формата**:
Argus ↔ локальный x402-loopback (тот же формат, что у Secretariat/api-server), а тесты против
реального Secretariat написаны, ENV-управляемы и запускаются одной переменной `SECRETARIAT_URL`.

## 2. Что сделано в коде

| Файл | Что |
|---|---|
| `src/adapters/x402/X402AgentServer.ts` | **Новый компонент** (Этап 3.1): HTTP-ресурс-сервер x402 V2. 402+payment-required без подписи; проверка структуры PAYMENT-SIGNATURE → 200+ресурс+payment-response; evidence по каждому запросу. Не подписывает, про Secretariat не знает, экономику не интерпретирует. |
| `src/tests/integration/ArgusAsBuyer.test.ts` | **Этап 2**: S1–S7 локально (mock-транспорт) + S8 loopback (402→подпись→повтор→200) + S8 против реального Secretariat при `SECRETARIAT_URL`; отчёты `reports/argus-as-buyer-*.json`. |
| `src/tests/integration/ArgusAsSeller.test.ts` | **Этап 3.2**: сервер на порту 0; 402 корректен; подпись принимается; битая подпись отклоняется; S8 против Argus-продавца PASS; отчёт `reports/argus-as-seller-*.json`. |
| `src/tests/integration/helpers/reporting.ts` | Хелперы отчётов/проб ENV (только чтение `SECRETARIAT_URL`, `SECRETARIAT_X402_PATH`, `ARGUS_TEST_WALLET_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`). |

Запреты соблюдены: `X402AgentAdapter`, `PaymentAdapter`, `ExecutionRegistry`, `RunOrchestrator`,
`ScenarioEngine`, `argus.ts`, S1–S8, `MockTargetAdapter` — не изменены. URL/ключи не хардкожены
(используется только well-known Hardhat test-key как fallback, уже принятый в существующих тестах репо).

## 3. Результаты прогонов

- `npm run build` — чисто (tsc без ошибок).
- `npm test` — **163 passed / 163** (было 155; +8 новых интеграционных тестов). S1–S8 не сломаны.
- **Argus as buyer** (`reports/argus-as-buyer-local-*.json`): S1–S7 — все **PASS** (mock-транспорт,
  evidenceCount 2–5 на сценарий). S8 loopback — **PASS**: ровно 2 запроса к серверу, первый без
  `payment-signature`, второй с валидным base64 EIP-3009 envelope.
- **Argus as seller** (`reports/argus-as-seller-*.json`): **PASS** — 402 с корректным payment-required,
  подпись от `BaseSepoliaPaymentAdapter.signX402Payment` принята, ресурс отдан, evidence полон;
  битая подпись отклонена с записью причины.
- Реальный Secretariat: **SKIPPED** (нет `SECRETARIAT_URL` / недоступен) — честно задокументировано в отчётах, не «подогнано».

## 4. Проблемы / риски

1. **Сети не совпадают**: Argus-подписчик (`BaseSepoliaPaymentAdapter`) жёстко привязан к домену USDC
   Base Sepolia (chainId 84532), а реальные x402-маршруты api-server Зевса — `eip155:196` (X Layer).
   Против боевого api-server подпись пройдёт структурно, но facilitator её отвергнет. Нужен
   XLayerPaymentAdapter в роли подписчика (он уже есть в `adapters/payment/evm/` — проверить parity).
2. **Цена `$0`** на x402-маршрутах api-server — middleware может не отдавать осмысленный 402-body;
   для S8-против-реального-Secretariat стоит выбрать маршрут с ненулевой ценой или поднять свой фасилитатор.
3. **MVP-валидация подписи** в X402AgentServer — структурная; recover адреса (EIP-3009 verifier из
   Secretariat) не выполняется. Для «настоящей» женитьбы продавца нужно подключить верификатор.
4. Полноценный запуск api-server требует Docker + БД Зевса — вне текущей среды.

## 5. Рекомендации на следующий шаг

1. Поднять Secretariat/api-server рядом (docker-compose c Postgres + `ZEUS_TREASURY`, `PORT`), задать
   `SECRETARIAT_URL` — платные тесты в `ArgusAsBuyer.test.ts` / `ArgusAsSeller.test.ts` активируются без правок кода.
2. Переключить buyer-подписку на X Layer (`XLayerPaymentAdapter`) либо деплоить тестовый маршрут на Base Sepolia.
3. Усилить `X402AgentServer`: verify-колбэк (recover `from` из подписи, сверка `payTo`/`value`) — точечно,
   не трогая ядро.
4. Добавить сценарии S9/S10 под реальный контракт api-server (`/api/insurance/prepare-buy`): идемпотентность
   покупки полиса агентом после оплаты.

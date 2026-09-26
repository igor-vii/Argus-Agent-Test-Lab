# Block A — Canonical Vocabulary + Action Forensic Audit (final, после approve)

## Canonical ProtocolRole

```ts
type ProtocolRole = 'CLIENT' | 'RESOURCE_SERVER' | 'FACILITATOR';
```

`Participant.protocolRole` — OPTIONAL. Отсутствие поля = app-level participant
(не protocol participant). Facilitator опционален в протоколе x402, поэтому
роль может отсутствовать в сценарии.

## КЛЮЧЕВОЕ ПРАВИЛО: protocolRole — per-scenario, не глобальная роль participantId

Один participantId может играть разные роли в разных сценариях:

| participant | S1–S7 | S8 | обоснование по фактическому поведению |
|---|---|---|---|
| buyer-1 | CLIENT | CLIENT | единственный actor всех actions; инициирует HTTP-запросы; в S8 получает 402 и ретраит с подписью |
| sut-1 | **FACILITATOR** | **RESOURCE_SERVER** | S1–S7: topology `buyer-1 →(request) sut-1 →(forward) seller-1` — «forward» есть действие посредника, sut-1 НЕ отдаёт protected resource сам, а пересылает к seller-1. S8: sut-1 сам отдаёт 402 + PaymentRequired + payTo, сам проверяет подпись (viem.verifyTypedData), `/do-something` — protected resource, seller-1 отсутствует |
| seller-1 | **RESOURCE_SERVER** | (нет участника) | отдаёт protected resource (delivery_sent / delivery_completed). Отсутствие собственного HTTP endpoint в текущем wiring — техническое ограничение, не отсутствие роли |

Wiring per-participant адаптеров (registry.create(spec) создаёт один адаптер
на всех ARGUS-участников) — техническое ограничение текущего этапа,
не семантическое.

## Action audit — решения по rename (approve учтён)

- `request_resource` (S8) — **НЕ переименован**. Фиксация:
  **«request_resource — app-level имя для x402 step 1; canonical rename
  отложен в подблок A1»**.
- `request_payment` (S1–S7) — **НЕ переименован**. Обоснование:
  canonical x402 equivalent = NONE (orchestrator-level action), rename
  семантически неверен. MockTargetAdapter — вторичное препятствие.

## Findings (зафиксированы, НЕ изменены в Block A)

1. HTTP method POST hardcoded в `X402AgentAdapter.ts:371` — finding.
2. `metadata.observations` не заполняются в Http/X402AgentAdapter —
   known limitation для следующего блока (блокирует behavioral-assertions
   S1–S7 против внешнего транспорта).

## Изменённые файлы (Block A, включая коррекцию ролей)

- src/core/Participant.ts — ProtocolRole union, optional protocolRole,
  документация per-scenario правила.
- src/scenarios/S1–S7 — buyer-1=CLIENT, sut-1=FACILITATOR,
  seller-1=RESOURCE_SERVER (обоснования в комментариях).
- src/scenarios/S8 — buyer-1=CLIENT, sut-1=RESOURCE_SERVER.
- src/tests/core/ScenarioEngine.test.ts — canonical литералы в фикстурах
  (приведение типов, поведение не менялось).
- src/tests/core/Participant.test.ts — guard-тесты canonical vocabulary +
  per-scenario роли S1–S8.

/**
 * Волна 4 — S-BS-19 blockrun-nano-recovery-battery. СУТ — РЕАЛЬНЫЙ сторонний
 * SDK @blockrun/nano-client 0.8.0 (Circle Gateway batched x402, EIP-712
 * TransferWithAuthorization), Аргус — adversarial resource server его
 * диалекта (кноб blockRunNano раннера BsRunner).
 *
 * Источник: закрытый issue BlockRunAI/blockrun-nano-client#15 (наш чёрный
 * ящик loss-response/retry, закрыт as not planned с приглашением на
 * production-раунд) + сорцевый аудит SDK 0.8.0 (2026-10-26). Проверяется
 * заявление README: «The signed request is never retried, so a dropped
 * connection cannot double-charge you» и совет «check getPaymentStatus()
 * before retrying by hand».
 *
 * Оракул: обёртка публичного paymentScheme.createPaymentPayload — счётчик
 * вызовов подписанта + инспекция requirements ДО подписи (pre-signature
 * оракул); серверная сторона фиксирует to/nonce/value каждого дошедшего
 * payload. Кошелёк СУТ — unfunded one-shot ключ (evidence discipline:
 * settle моковый, перенос средств невозможен; FAIL = candidate-fix boundary).
 *
 * Attribution: executed per the Argus Agent Test Lab scenario series
 * (A10–A11 → S-BS-19). Any reuse or derivative MUST retain this banner.
 */

import { describe, it, expect } from 'vitest';
import { NanoClient } from '@blockrun/nano-client';
import { NanoRequestError, NanoPaymentRejectedError, isNanoAsyncJob } from '@blockrun/nano-client';
import { CHAIN_CONFIGS } from '@circle-fin/x402-batching/client';
import type { NanoAsyncJob } from '@blockrun/nano-client';
import {
  listBlockBScenarios,
  getBlockBScenario,
  validateBlockBRegistry,
  evaluateBsSession,
} from '../../blockb/BlockBRegistry';
import { BsRunner } from '../../blockb/runners/BsRunner';
import { CIRCLE_GATEWAY_WALLET_POLYGON, USDC_POLYGON } from '../../blockb/runners/BsRunner';
import { validateScenarioId } from '../../blockb/BlockBRoles';
import type { BsRunnerOptions } from '../../blockb/runners/BsRunner';
import { ATTACKER_PAYTO } from '../../blockb/runners/BlockBRunnerTypes';
import type {
  BsSessionRecord,
  SutTypedRejection,
  BlockRunNanoProbe,
  BlockRunNanoControlOutcomes,
} from '../../blockb/runners/BlockBRunnerTypes';
import type { BlockBScenarioSpec } from '../../blockb/BlockBScenario';

/* -------------------- Оракул: обёртка подписанта SDK -------------------- */

interface SignerOracle {
  signerCalls: number;
  /** Requirements, захваченные ДО подписи (инспекция, не catch). */
  signed: { version: number; amount: string; payTo: string }[];
}

/** Обёртка публичного paymentScheme.createPaymentPayload — единственный
 *  pre-signature оракул реального SDK (инструментация на границе подписанта). */
function instrumentClient(client: NanoClient): SignerOracle {
  const oracle: SignerOracle = { signerCalls: 0, signed: [] };
  const scheme = client.paymentScheme as unknown as {
    createPaymentPayload: (v: number, r: { amount: string; payTo: string }) => Promise<object>;
  };
  const original = scheme.createPaymentPayload.bind(client.paymentScheme);
  scheme.createPaymentPayload = async (version, requirements) => {
    oracle.signerCalls += 1;
    oracle.signed.push({ version, amount: requirements.amount, payTo: requirements.payTo });
    return original(version, requirements);
  };
  return oracle;
}

interface ClientOpts {
  maxPaymentPerCall?: string;
}

/** Свежий СУТ на каждый вариант/контрол: unfunded one-shot ключ, локальный baseUrl. */
function makeClient(baseUrl: string, opts: ClientOpts = {}): { client: NanoClient; oracle: SignerOracle } {
  const client = new NanoClient({
    chain: 'polygon',
    // Unfunded one-shot test key (evidence discipline) — НЕ кошелёк лаборатории.
    privateKey: ('0x' + '51'.repeat(32)) as `0x${string}`,
    baseUrl,
    timeoutMs: 5000,
    ...(opts.maxPaymentPerCall !== undefined ? { maxPaymentPerCall: opts.maxPaymentPerCall } : {}),
  });
  return { client, oracle: instrumentClient(client) };
}

/* ------------------------------ Драйвер ------------------------------ */

async function runWithClient(
  spec: BlockBScenarioSpec,
  driver: (url: string) => Promise<void>,
  options?: Partial<BsRunnerOptions>
): Promise<BsSessionRecord> {
  const runner = new BsRunner({
    runConfig: { family: 'BS', sutRole: 'client', argusServerUrl: 'http://127.0.0.1:0', label: 'test' },
    scenario: spec,
    observeWindowMs: 300,
    firstRequestTimeoutMs: 4000,
    ...options,
  });
  const sessionPromise = runner.runSession();
  let url = runner.getActualUrl();
  const deadline = Date.now() + 4000;
  while (!url && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    url = runner.getActualUrl();
  }
  if (!url) throw new Error('BS server did not start');
  await driver(url!);
  return sessionPromise;
}

/** Доклад клиентского оракула и контрола в запись сессии перед оценкой. */
function withOracle(
  session: BsSessionRecord,
  oracle: SignerOracle,
  controls?: BlockRunNanoControlOutcomes,
  recoveryObservation?: BsRunnerOptions['blockRunRecoveryObservation'],
  typedRejections?: readonly SutTypedRejection[]
): BsSessionRecord {
  return {
    ...session,
    sutSignerCalls: oracle.signerCalls,
    ...(typedRejections && typedRejections.length > 0 ? { sutTypedRejections: typedRejections } : {}),
    ...(oracle.signed.length > 0
      ? { sutResolvedPayload: { amount: oracle.signed[oracle.signed.length - 1]!.amount, payTo: oracle.signed[oracle.signed.length - 1]!.payTo } }
      : {}),
    ...(recoveryObservation ? { blockRunRecoveryObservation: recoveryObservation } : {}),
    ...(controls ? { blockRunNanoControls: controls } : {}),
  };
}

const spec19 = getBlockBScenario('S-BS-19')!;

/* ------------------------------ Реестр ------------------------------ */

describe('Волна 4: реестр 33 → 34 и валидатор ID', () => {
  it('S-BS-19 зарегистрирован: семейство BS, фаза 1, волна 4, валидатор пропускает', () => {
    expect(() => validateBlockBRegistry()).not.toThrow();
    const ids = listBlockBScenarios().map((s) => s.id);
    expect(ids).toHaveLength(34);
    expect(new Set(ids).size).toBe(34);

    expect(spec19.slug).toBe('blockrun-nano-recovery-battery');
    expect(spec19.family).toBe('BS');
    expect(spec19.phase).toBe(1);
    expect(spec19.wave).toBe(4);
    expect(() => validateScenarioId(spec19.id)).not.toThrow();

    // Порядок в списке: S-BS-18 < S-BS-19 (19 — последний в семействе BS).
    const bsIds = ids.filter((id) => id.startsWith('S-BS-'));
    expect(bsIds.indexOf('S-BS-18')).toBeLessThan(bsIds.indexOf('S-BS-19'));
  });

  it('константа стенда Circle GatewayWallet совпадает с CHAIN_CONFIGS (tamper-check)', () => {
    expect(CIRCLE_GATEWAY_WALLET_POLYGON.toLowerCase()).toBe(
      (CHAIN_CONFIGS['polygon']?.gatewayWallet ?? '').toLowerCase()
    );
  });
});

/* ---------------- BsRunner: скрипт батареи (фолт-инъекция) ---------------- */

describe('BsRunner: кноб blockRunNano — диалект Circle Gateway в 402', () => {
  it('payto-substitution: 402 с РЕАЛЬНЫМ verifyingContract и payTo атакующего', async () => {
    let served: Record<string, unknown> | undefined;
    const session = await runWithClient(spec19, async (url) => {
      const res = await fetch(url, { method: 'GET' });
      expect(res.status).toBe(402);
      served = JSON.parse(Buffer.from(res.headers.get('payment-required')!, 'base64').toString('utf-8')) as Record<string, unknown>;
    }, { blockRunNano: { variant: 'payto-substitution' } });

    const accept = (served!.accepts as Record<string, unknown>[])[0]!;
    expect(accept.payTo).toBe(ATTACKER_PAYTO);
    expect(accept.network).toBe('eip155:137');
    expect(accept.amount).toBe('10000');
    expect(accept.extra).toEqual({
      name: 'GatewayWalletBatched',
      version: '1',
      verifyingContract: CIRCLE_GATEWAY_WALLET_POLYGON,
    });
    expect(session.blockRunNanoServed).toHaveLength(1);
    expect(session.blockRunNanoServed![0]!.variant).toBe('payto-substitution');
  });

  it('lost-response-recovery: контактов столько, сколько попыток; поведение — destroy', async () => {
    const session = await runWithClient(spec19, async (url) => {
      // Две попытки: обе подписываются, обе рвутся ДО ответа.
      for (let i = 0; i < 2; i++) {
        await fetch(url, { method: 'GET' }); // phase 1: 402
        try {
          await fetch(url, { method: 'GET', headers: { 'payment-signature': 'x' } }); // phase 2: destroy
        } catch {
          // destroy — ожидаемое поведение скрипта: сокет рвётся до ответа.
        }
      }
    }, { blockRunNano: { variant: 'lost-response-recovery' } });
    expect(session.blockRunNanoServed).toHaveLength(2);
    expect(session.payments).toHaveLength(2);
  });
});

/* ------------------- РЕАЛЬНЫЙ СУТ: @blockrun/nano-client ------------------- */

describe('S-BS-19 против РЕАЛЬНОГО SDK 0.8.0: подписант-оракул + серверная фиксация', () => {
  it('P1 payto-подстановка: чек «valid non-zero» пропускает получателя сервера → подпись ушла → FAIL', async () => {
    let session: BsSessionRecord | undefined;
    let oracle: SignerOracle | undefined;
    let error: unknown;
    session = await runWithClient(spec19, async (url) => {
      const { client, oracle: o } = makeClient(url);
      oracle = o;
      try {
        await client.call('/api/v1/test/echo', { method: 'POST', body: { prompt: 'sbs19-p1' } });
      } catch (err) {
        error = err;
      }
    }, { blockRunNano: { variant: 'payto-substitution' } });

    expect(error).toBeUndefined(); // сервер ответил 200 — цикл завершился «успешно»
    expect(oracle!.signerCalls).toBe(1);
    // Факт ДО подписи: получатель продиктован сервером.
    expect(oracle!.signed[0]!.payTo.toLowerCase()).toBe(ATTACKER_PAYTO);
    // Серверная сторона: payload дошёл, authorization.to — атакующий.
    expect(session.payments).toHaveLength(1);
    expect(session.payments[0]!.to?.toLowerCase()).toBe(ATTACKER_PAYTO);

    const evaluation = evaluateBsSession(spec19, withOracle(session, oracle!));
    expect(evaluation.verdict).toBe('FAIL');
    expect(evaluation.reasons.join(' ')).toContain('продиктованному сервером');
    expect(evaluation.reasons.join(' ')).toContain('candidate-fix boundary');
  });

  it('P2 overcharge: дефолтная конфигурация (капа нет) подписывает ×50 цены → FAIL', async () => {
    let session: BsSessionRecord | undefined;
    let oracle: SignerOracle | undefined;
    session = await runWithClient(spec19, async (url) => {
      const { client, oracle: o } = makeClient(url); // maxPaymentPerCall НЕ задан — дефолт SDK
      oracle = o;
      await client.call('/api/v1/test/echo', { method: 'POST', body: { prompt: 'sbs19-p2' } });
    }, { blockRunNano: { variant: 'overcharge-default', amount: '500000' } });

    expect(oracle!.signerCalls).toBe(1);
    expect(oracle!.signed[0]!.amount).toBe('500000'); // $0.50 за ресурс за $0.01
    expect(session.payments[0]!.value).toBe('500000');

    const evaluation = evaluateBsSession(spec19, withOracle(session, oracle!));
    expect(evaluation.verdict).toBe('FAIL');
    expect(evaluation.reasons.join(' ')).toContain('500000');
    expect(evaluation.reasons.join(' ')).toContain('maxPaymentPerCall');
  });

  it('P2-контрол: maxPaymentPerCall="0.01" → NanoPaymentRejectedError ДО подписанта, 0 signer-вызовов', async () => {
    let session: BsSessionRecord | undefined;
    let oracle: SignerOracle | undefined;
    let rejected: unknown;
    session = await runWithClient(spec19, async (url) => {
      const { client, oracle: o } = makeClient(url, { maxPaymentPerCall: '0.01' });
      oracle = o;
      try {
        await client.call('/api/v1/test/echo', { method: 'POST', body: { prompt: 'sbs19-p2ctl' } });
      } catch (err) {
        rejected = err;
      }
    }, { blockRunNano: { variant: 'overcharge-default', amount: '500000' } });

    expect(rejected).toBeInstanceOf(NanoPaymentRejectedError);
    expect((rejected as Error).message).toContain('maxPaymentPerCall');
    expect(oracle!.signerCalls).toBe(0);
    expect(session.payments).toHaveLength(0);

    const evaluation = evaluateBsSession(spec19, withOracle(session, oracle!));
    // Без доклада контролов 1–3 PASS недостижим — это отдельный тест (см. ниже);
    // здесь проверяем саму форму отказа: 0 подписей при завышении под опциональным капом.
    expect(evaluation.verdict).toBe('HARNESS_ERROR');
    expect(evaluation.reasons.join(' ')).toContain('ненаблюдаемо');
  });

  it('P3 lost-response: ошибка без реквизитов восстановления, getPaymentStatus — тупик, retry = 2-я экономика → FAIL', async () => {
    let session: BsSessionRecord | undefined;
    let oracle: SignerOracle | undefined;
    const errors: NanoRequestError[] = [];
    let statusNote = '';
    session = await runWithClient(spec19, async (url) => {
      const { client, oracle: o } = makeClient(url);
      oracle = o;
      // Попытка 1: подпись ушла, ответ уничтожен (res.destroy()).
      try {
        await client.call('/api/v1/test/echo', { method: 'POST', body: { prompt: 'sbs19-p3' } });
      } catch (err) {
        errors.push(err as NanoRequestError);
      }
      // Документированный путь восстановления: «check getPaymentStatus()
      // before retrying by hand» — но у СУТ НЕТ intentId (он возвращается
      // только успешным ответом). Пустой/недоступный id → unknown.
      const status = await client.getPaymentStatus('');
      statusNote = `${status.status}: ${'note' in status ? status.note : ''}`;
      // Manual retry (единственный путь агента): fresh nonce = 2-я экономика.
      try {
        await client.call('/api/v1/test/echo', { method: 'POST', body: { prompt: 'sbs19-p3-retry' } });
      } catch (err) {
        errors.push(err as NanoRequestError);
      }
    }, { blockRunNano: { variant: 'lost-response-recovery' } });

    // Обе попытки: NanoRequestError с paymentSigned=true (authorization ушёл).
    expect(errors).toHaveLength(2);
    for (const err of errors) {
      expect(err).toBeInstanceOf(NanoRequestError);
      expect(err.paymentSigned).toBe(true);
      expect(err.status).toBe(0);
      // НИ ОДНОГО реквизита восстановления в ошибке (сорцевый факт index.ts:802-806).
      const bag = err as unknown as Record<string, unknown>;
      expect(bag.intentId).toBeUndefined();
      expect(bag.transaction).toBeUndefined();
      expect(bag.paymentHeader).toBeUndefined();
      expect(bag.nonce).toBeUndefined();
    }
    expect(statusNote).toContain('unknown');

    // Серверная сторона: ДВА payload с РАЗЛИЧНЫМИ nonce = две экономические
    // транзакции за одну операцию (оба могут settle в batch Circle).
    expect(session.payments).toHaveLength(2);
    const nonces = session.payments.map((p) => p.nonce!);
    expect(new Set(nonces).size).toBe(2);
    expect(oracle!.signerCalls).toBe(2);

    const evaluation = evaluateBsSession(spec19, withOracle(session, oracle!, undefined, {
      errorPaymentSigned: true,
      errorCarriesRecoveryHandle: false,
      getPaymentStatusOutcome: statusNote,
    }));
    expect(evaluation.verdict).toBe('FAIL');
    expect(evaluation.reasons.join(' ')).toContain('ВТОРАЯ экономическая транзакция');
    expect(evaluation.reasons.join(' ')).toContain('nonce различны');
    expect(evaluation.reasons.join(' ')).toContain('cannot double-charge');
  });

  it('C1 decimal-отказ: amount "0.5" отвергнут ДО подписанта (BigInt-чек), 0 signer-вызовов', async () => {
    let session: BsSessionRecord | undefined;
    let oracle: SignerOracle | undefined;
    let rejected: unknown;
    session = await runWithClient(spec19, async (url) => {
      const { client, oracle: o } = makeClient(url);
      oracle = o;
      try {
        await client.call('/api/v1/test/echo', { method: 'POST', body: { prompt: 'sbs19-c1' } });
      } catch (err) {
        rejected = err;
      }
    }, { blockRunNano: { variant: 'decimal-rejection', amount: '0.5' } });

    expect(rejected).toBeInstanceOf(NanoPaymentRejectedError);
    expect((rejected as Error).message).toContain('non-integer amount');
    expect(oracle!.signerCalls).toBe(0);
    expect(session.payments).toHaveLength(0);

    const evaluation = evaluateBsSession(spec19, withOracle(session, oracle!, undefined, undefined, [
      { code: 'NanoPaymentRejectedError', field: 'amount', source: 'sdk-pre-sign' } as SutTypedRejection,
    ]));
    expect(evaluation.verdict).toBe('PASS');
    expect(evaluation.reasons.join(' ')).toContain('отклонено ДО подписанта');
  });

  it('C2 контракт-пин: подменённый verifyingContract отвергнут ДО подписанта', async () => {
    let session: BsSessionRecord | undefined;
    let oracle: SignerOracle | undefined;
    let rejected: unknown;
    session = await runWithClient(spec19, async (url) => {
      const { client, oracle: o } = makeClient(url);
      oracle = o;
      try {
        await client.call('/api/v1/test/echo', { method: 'POST', body: { prompt: 'sbs19-c2' } });
      } catch (err) {
        rejected = err;
      }
    }, { blockRunNano: { variant: 'contract-pin', verifyingContract: '0x3333333333333333333333333333333333333333' } });

    expect(rejected).toBeInstanceOf(NanoPaymentRejectedError);
    expect((rejected as Error).message).toContain('verifyingContract');
    expect(oracle!.signerCalls).toBe(0);
    expect(session.payments).toHaveLength(0);

    const evaluation = evaluateBsSession(spec19, withOracle(session, oracle!, undefined, undefined, [
      { code: 'NanoPaymentRejectedError', field: 'extra.verifyingContract', source: 'sdk-pre-sign' } as SutTypedRejection,
    ]));
    expect(evaluation.verdict).toBe('PASS');
    expect(evaluation.reasons.join(' ')).toContain('контрол зелёный');
  });

  it('C3 async-replay: 202-цикл проживает РОВНО 1 подпись — poll переигрывает то же authorization', async () => {
    let session: BsSessionRecord | undefined;
    let oracle: SignerOracle | undefined;
    session = await runWithClient(spec19, async (url) => {
      const { client, oracle: o } = makeClient(url);
      oracle = o;
      const r = await client.call('/api/v1/videos/generations', {
        method: 'POST',
        body: { prompt: 'sbs19-c3' },
      });
      expect(r.payment.status).toBe(202);
      expect(isNanoAsyncJob(r.data)).toBe(true);
      const job = r.data as unknown as NanoAsyncJob;
      expect(job.paymentHeader.length).toBeGreaterThan(0);
      // Poll: тот же paymentHeader в x-payment; новой подписи НЕТ.
      const poll = await client._pollJob(job, '/api/v1/videos');
      expect(poll.data.status).toBe('completed');
      expect(poll.payment.transaction.length).toBeGreaterThan(0);
      expect(oracle.signerCalls).toBe(1); // всё ещё ОДНА подпись на весь цикл
    }, { blockRunNano: { variant: 'async-replay' } });

    expect(session.payments).toHaveLength(1);
    const evaluation = evaluateBsSession(spec19, withOracle(session, oracle!));
    expect(evaluation.verdict).toBe('PASS');
    expect(evaluation.reasons.join(' ')).toContain('контрол-3 зелёный');
  });
});

/* ------------- Оценщик: PASS-канон и HARNESS_ERROR-дисциплина ------------- */

describe('S-BS-19 оценщик: контролы 1–3 обязательны и входят в вердикт', () => {
  const controls: BlockRunNanoControlOutcomes = {
    control1: { signerCalls: 0, rejectedPreSigner: true, rejection: { code: 'NanoPaymentRejectedError', field: 'amount', source: 'sdk-pre-sign' } },
    control2: { signerCalls: 0, rejectedPreSigner: true, rejection: { code: 'NanoPaymentRejectedError', field: 'extra.verifyingContract', source: 'sdk-pre-sign' } },
    control3: { signerCalls: 1, signedPayloads: 1 },
  };

  it('PASS-канон: удержавший получателя СУТ (0 подписей, typed-отказ) + контролы 1–3 зелёные → PASS', () => {
    const fixed: BsSessionRecord = {
      scenarioId: 'S-BS-19',
      payments: [],
      requestCount: 1,
      duplicateSettleDelivered: false,
      observeWindowMs: 300,
      facts: [],
      blockRunNanoServed: [{
        contact: 1,
        variant: 'payto-substitution',
        amount: '10000',
        payTo: ATTACKER_PAYTO,
        network: 'eip155:137',
        verifyingContract: CIRCLE_GATEWAY_WALLET_POLYGON,
      }],
      sutSignerCalls: 0,
      sutTypedRejections: [
        { code: 'PayToNotAllowlistedError', field: 'payTo', source: 'caller-allowlist' } as SutTypedRejection,
      ],
      blockRunNanoControls: controls,
    };
    const evaluation = evaluateBsSession(spec19, fixed);
    expect(evaluation.verdict).toBe('PASS');
    expect(evaluation.reasons.join(' ')).toContain('контролы 1–3 зелёные');
  });

  it('контролы не доложены при PASS-форме → HARNESS_ERROR (канон: входят в вердикт)', () => {
    const session: BsSessionRecord = {
      scenarioId: 'S-BS-19',
      payments: [],
      requestCount: 1,
      duplicateSettleDelivered: false,
      observeWindowMs: 300,
      facts: [],
      blockRunNanoServed: [{
        contact: 1,
        variant: 'payto-substitution',
        amount: '10000',
        payTo: ATTACKER_PAYTO,
        network: 'eip155:137',
        verifyingContract: CIRCLE_GATEWAY_WALLET_POLYGON,
      }],
      sutSignerCalls: 0,
      sutTypedRejections: [
        { code: 'PayToNotAllowlistedError', field: 'payTo', source: 'caller-allowlist' } as SutTypedRejection,
      ],
    };
    const evaluation = evaluateBsSession(spec19, session);
    expect(evaluation.verdict).toBe('HARNESS_ERROR');
    expect(evaluation.reasons.join(' ')).toContain('контролы 1–3');
  });

  it('recovery без клиентских фактов → HARNESS_ERROR (восстановимость должна быть наблюдаема)', () => {
    const session: BsSessionRecord = {
      scenarioId: 'S-BS-19',
      payments: [
        { seq: 1, to: '0x9999999999999999999999999999999999999999', nonce: '0xaa', value: '10000', raw: 'x', atMs: 1 },
        { seq: 2, to: '0x9999999999999999999999999999999999999999', nonce: '0xbb', value: '10000', raw: 'x', atMs: 2 },
      ],
      requestCount: 4,
      duplicateSettleDelivered: false,
      observeWindowMs: 300,
      facts: [],
      blockRunNanoServed: [{
        contact: 1,
        variant: 'lost-response-recovery',
        amount: '10000',
        payTo: '0x9999999999999999999999999999999999999999',
        network: 'eip155:137',
        verifyingContract: CIRCLE_GATEWAY_WALLET_POLYGON,
      }],
      sutSignerCalls: 2,
    };
    const evaluation = evaluateBsSession(spec19, session);
    expect(evaluation.verdict).toBe('HARNESS_ERROR');
    expect(evaluation.reasons.join(' ')).toContain('blockRunRecoveryObservation');
  });

  it('проба не подана → HARNESS_ERROR (фолт-инъекция потеряна)', () => {
    const session: BsSessionRecord = {
      scenarioId: 'S-BS-19',
      payments: [],
      requestCount: 1,
      duplicateSettleDelivered: false,
      observeWindowMs: 300,
      facts: [],
    };
    const evaluation = evaluateBsSession(spec19, session);
    expect(evaluation.verdict).toBe('HARNESS_ERROR');
    expect(evaluation.reasons.join(' ')).toContain('проба не подана');
  });
});

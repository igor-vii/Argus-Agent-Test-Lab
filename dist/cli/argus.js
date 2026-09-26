#!/usr/bin/env node
// Runtime (важно для cross-system harness и CI):
//
//   CLI запускается через:
//     npm run argus -- run <scenarioId>
//   или напрямую:
//     npx tsx src/cli/argus.ts run <scenarioId>
//
//   Прямой запуск `node dist/cli/argus.js` НЕ поддерживается:
//   проект компилируется без .js-расширений в относительных
//   импортах (tsconfig moduleResolution не NodeNext), поэтому
//   Node ESM не может разрешить import-пути в dist.
//
//   Переход на NodeNext (с .js-расширениями в импортах) —
//   отдельный PR, вне scope текущих изменений.
import { RunOrchestrator } from '../core/RunOrchestrator';
import { AgentController } from '../core/AgentController';
import { TargetAdapterRegistry, readTargetSpecFromEnv, } from './TargetAdapterRegistry';
import { ScenarioRegistry, getScenarioIds } from './ScenarioRegistry';
import { validateScenario } from '../core/validateScenario';
import { createPaymentAdapter } from '../adapters/payment/PaymentAdapterFactory';
/**
 * Минимальный CLI для Argus Test Lab
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    if (!command) {
        console.log('Usage: argus <command> [scenario]');
        console.log('Commands:');
        console.log('  list              - List available scenarios');
        console.log('  run <scenarioId>  - Run a specific scenario (e.g., S1)');
        process.exit(1);
    }
    if (command === 'list') {
        console.log('Available Scenarios:');
        for (const id of getScenarioIds()) {
            const scenario = ScenarioRegistry.get(id);
            if (!scenario)
                continue;
            const result = validateScenario(scenario);
            if (result.valid) {
                console.log(`  ${id} - ${scenario.name}`);
            }
            else {
                const reasons = result.errors
                    .map((e) => `${e.assertionId} ${e.rule} — ${e.message}`)
                    .join('; ');
                console.log(`  ${id} - ${scenario.name} [INVALID: ${reasons}]`);
            }
        }
        process.exit(0);
    }
    if (command === 'run') {
        const scenarioId = args[1];
        if (!scenarioId) {
            console.error('Error: Scenario ID required');
            console.error('Usage: argus run <scenarioId>');
            process.exit(1);
        }
        const scenarioDef = ScenarioRegistry.get(scenarioId);
        if (!scenarioDef) {
            console.error(`Error: Unknown scenario '${scenarioId}'`);
            console.error(`Available scenarios: ${getScenarioIds().join(', ')}`);
            process.exit(1);
        }
        // Валидация Rule 1 (до любого запуска)
        const validation = validateScenario(scenarioDef);
        if (!validation.valid) {
            console.error(`Error: scenario '${scenarioId}' failed validation:`);
            for (const e of validation.errors) {
                console.error(`  - [${e.rule}] ${e.assertionId}: ${e.message}`);
            }
            process.exit(1);
        }
        // Target-адаптер выбирается через env (ARGUS_TARGET_KIND / ARGUS_TARGET_ENDPOINT).
        // Если переменные не заданы — поведение идентично baseline (mock).
        let targetSpec;
        try {
            targetSpec = readTargetSpecFromEnv();
        }
        catch (error) {
            console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            process.exit(1);
        }
        try {
            // Создание Map контроллеров для участников ARGUS
            const controllers = new Map();
            const registry = TargetAdapterRegistry.default();
            for (const participant of scenarioDef.participants) {
                if (participant.ownership !== 'ARGUS')
                    continue;
                const targetAdapter = registry.create(targetSpec);
                const controller = new AgentController(targetAdapter, {
                    connectionConfig: {
                        transportType: targetSpec.kind,
                        ...(targetSpec.endpoint ? { endpoint: targetSpec.endpoint } : {}),
                    },
                    runId: `run_${Date.now()}_${participant.participantId}`,
                });
                controllers.set(participant.participantId, controller);
            }
            // Assertions из сценария (Model V0: scenarioDef.assertions)
            const assertions = scenarioDef.assertions || [];
            // Payment wiring: только если target kind требует оплату.
            // При ARGUS_TARGET_KIND=mock — PaymentAdapter не создаётся,
            // поведение CLI сохраняется (baseline).
            let paymentAdapter;
            if (targetSpec.kind === 'x402' || targetSpec.kind === 'http') {
                const pk = process.env.ARGUS_TEST_WALLET_PRIVATE_KEY;
                const rpc = process.env.BASE_SEPOLIA_RPC_URL;
                if (targetSpec.kind === 'x402' && (!pk || !rpc)) {
                    console.error('Error: ARGUS_TEST_WALLET_PRIVATE_KEY and BASE_SEPOLIA_RPC_URL are required for ARGUS_TARGET_KIND=x402');
                    process.exit(1);
                }
                if (pk && rpc) {
                    paymentAdapter = createPaymentAdapter({
                        network: 'base-sepolia',
                        rpcUrl: rpc,
                        privateKey: pk,
                    });
                }
            }
            // Запуск оркестратора
            const orchestrator = new RunOrchestrator(scenarioDef, controllers, assertions, paymentAdapter
            // bindingSource НЕ передан: используется defaultSigningIntentSource
            // (test-only placeholder) — wire boundary не фиксируется в Block D.
            );
            const result = await orchestrator.run();
            // Вывод результатов
            console.log('\nRun:');
            console.log(`  ID: ${result.runId}`);
            console.log(`  Scenario: ${result.scenarioId}`);
            console.log(`  Status: ${result.status}`);
            console.log(`  Started: ${result.startedAt.toISOString()}`);
            console.log(`  Finished: ${result.finishedAt?.toISOString() || 'N/A'}`);
            console.log('\nEvidence:');
            console.log(`  Count: ${result.evidenceCount}`);
            if (result.verdict) {
                console.log('\nVerdict:');
                console.log(`  Result: ${result.verdict.status}`);
                if (result.verdict.reason) {
                    console.log(`  Reason: ${result.verdict.reason}`);
                }
            }
            process.exit(result.verdict?.status === 'FAIL' ? 1 : 0);
        }
        catch (error) {
            console.error('Runtime error:', error instanceof Error ? error.message : 'Unknown error');
            process.exit(1);
        }
    }
    console.error(`Error: Unknown command '${command}'`);
    console.error('Use "argus list" to see available commands');
    process.exit(1);
}
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=argus.js.map
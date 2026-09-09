#!/usr/bin/env node

import { RunOrchestrator } from '../core/RunOrchestrator';
import { AgentController } from '../core/AgentController';
import { MockTargetAdapter } from '../adapters/MockTargetAdapter';
import { ScenarioRegistry, getScenarioIds } from './ScenarioRegistry';

/**
 * Минимальный CLI для Argus Test Lab
 */
async function main(): Promise<void> {
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
      console.log(`  ${id} - ${scenario?.name || 'Unknown'}`);
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

    try {
      // Создание адаптера и контроллера
      const targetAdapter = new MockTargetAdapter('mock');
      
      const controller = new AgentController(targetAdapter, {
        connectionConfig: { transportType: 'mock' },
        runId: `run_${Date.now()}`
      });
      
      // Получение ассертов из метаданных сценария
      const assertions = scenarioDef.metadata?.assertions || [];
      
      // Запуск оркестратора
      const orchestrator = new RunOrchestrator(
        scenarioDef,
        controller,
        targetAdapter,
        assertions
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
      
    } catch (error) {
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

#!/usr/bin/env node

import { Command } from 'commander';
import { ScenarioEngine } from '../run/ScenarioEngine';
import { SecretariatTargetAdapter } from '../target/SecretariatTargetAdapter';
import { secretariatScenarios, ScenarioDefinition } from '../scenario';

const program = new Command();

program
  .name('lab')
  .description('Zeus Agent Test Lab CLI')
  .version('0.1.0');

// List available scenarios
program
  .command('scenarios')
  .description('List available scenarios')
  .action(() => {
    console.log('\nAvailable Scenarios:\n');
    
    const scenarios = Object.values(secretariatScenarios);
    for (const scenario of scenarios) {
      console.log(`  ${scenario.id}`);
      console.log(`    ${scenario.description}`);
      console.log(`    Target: ${scenario.target}`);
      console.log(`    Invariants: ${scenario.invariants.length}`);
      console.log('');
    }
  });

// Run a scenario
program
  .command('run <scenarioId>')
  .description('Run a scenario')
  .option('--seed <number>', 'Deterministic seed for reproducibility', '42')
  .option('--json', 'Output results as JSON')
  .action(async (scenarioId: string, options: { seed?: string; json?: boolean }) => {
    const scenario = secretariatScenarios[scenarioId];
    
    if (!scenario) {
      console.error(`Error: Scenario "${scenarioId}" not found`);
      console.error('\nAvailable scenarios:');
      Object.keys(secretariatScenarios).forEach(id => console.error(`  ${id}`));
      process.exit(1);
    }

    const seed = parseInt(options.seed || '42', 10);
    const targetAdapter = new SecretariatTargetAdapter();
    const engine = new ScenarioEngine();

    console.log(`\nRunning scenario: ${scenario.id}`);
    console.log(`Seed: ${seed}`);
    console.log('---');

    const result = await engine.execute({
      scenario,
      seed,
      targetAdapter
    });

    if (options.json) {
      // Output structured JSON
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Human-readable output
      console.log(`\nRun ID: ${result.runId}`);
      console.log(`Scenario: ${result.scenarioId}`);
      console.log(`Status: ${result.status.toUpperCase()}`);
      console.log(`\nVerdict: ${result.verdict.outcome}`);
      console.log(`Reason: ${result.verdict.reason}`);
      
      if (result.verdict.assertions.length > 0) {
        console.log('\nAssertions:');
        for (const assertion of result.verdict.assertions) {
          console.log(`  [${assertion.outcome}] ${assertion.invariantDescription}`);
          console.log(`    Expected: ${assertion.expected}`);
          console.log(`    Actual: ${assertion.actual}`);
        }
      }
    }
  });

program.parse();

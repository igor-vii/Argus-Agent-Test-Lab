/**
 * Shared helpers for Argus <-> Secretariat integration tests.
 *
 * These tests are ENV-driven (never hardcode URLs/keys):
 * - SECRETARIAT_URL            — base URL of a running Secretariat/api-server
 *                                (e.g. http://localhost:3000). If unset or
 *                                unreachable, the real-network part of the
 *                                suite is SKIPPED and only local loopback
 *                                verification runs.
 * - SECRETARIAT_X402_PATH      — payment-guarded path on Secretariat
 *                                (see api-server config/x402.ts of Zeus repo).
 * - ARGUS_TEST_WALLET_PRIVATE_KEY / BASE_SEPOLIA_RPC_URL — same as .env.example.
 */

import fs from 'fs';
import path from 'path';

export interface ScenarioRunReport {
  scenarioId: string;
  scenarioName: string;
  runId?: string;
  status?: string;
  verdict?: string;
  reason?: string;
  evidenceCount?: number;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface IntegrationReport {
  generatedAt: string;
  mode: 'real-secretariat' | 'local-loopback-only';
  secretariatUrl?: string;
  summary: {
    total: number;
    pass: number;
    fail: number;
    inconclusive: number;
    skipped: number;
  };
  runs: ScenarioRunReport[];
  notes: string[];
}

export function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Write a JSON report under <repoRoot>/reports/. Returns the absolute path. */
export function writeJsonReport(fileName: string, report: unknown): string {
  const reportsDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return filePath;
}

export function summarize(runs: ScenarioRunReport[]): IntegrationReport['summary'] {
  return {
    total: runs.length,
    pass: runs.filter((r) => r.verdict === 'PASS').length,
    fail: runs.filter((r) => r.verdict === 'FAIL').length,
    inconclusive: runs.filter((r) => r.verdict === 'INCONCLUSIVE' || r.error).length,
    skipped: runs.filter((r) => r.skipped).length,
  };
}

/** Value of SECRETARIAT_URL trimmed of trailing slash, or undefined. */
export function getSecretariatUrl(): string | undefined {
  const raw = process.env.SECRETARIAT_URL?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/+$/, '');
}

/** Quick reachability probe with short timeout. Never throws. */
export async function probeHttp(url: string, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { method: 'GET', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

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
export declare function timestampSlug(): string;
/** Write a JSON report under <repoRoot>/reports/. Returns the absolute path. */
export declare function writeJsonReport(fileName: string, report: unknown): string;
export declare function summarize(runs: ScenarioRunReport[]): IntegrationReport['summary'];
/** Value of SECRETARIAT_URL trimmed of trailing slash, or undefined. */
export declare function getSecretariatUrl(): string | undefined;
/** Quick reachability probe with short timeout. Never throws. */
export declare function probeHttp(url: string, timeoutMs?: number): Promise<boolean>;
//# sourceMappingURL=reporting.d.ts.map
/**
 * Статусы выполнения тестового прогона (технические, не бизнес-вердикты)
 */
export declare enum RunStatus {
    CREATED = "CREATED",
    RUNNING = "RUNNING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}
/**
 * Контекст выполнения одного прогона
 */
export interface RunContext {
    runId: string;
    scenarioId: string;
    seed: number;
    startedAt: Date;
    status: RunStatus;
    finishedAt?: Date;
}
/**
 * Результат выполнения прогона
 */
export interface RunResult {
    runId: string;
    scenarioId: string;
    status: RunStatus;
    startedAt: Date;
    finishedAt?: Date;
    evidenceCount: number;
    verdict?: {
        status: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
        reason?: string;
    };
}
/**
 * Генерация уникального ID прогона
 */
export declare function generateRunId(): string;
//# sourceMappingURL=RunLifecycle.d.ts.map
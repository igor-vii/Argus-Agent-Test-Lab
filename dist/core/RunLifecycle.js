/**
 * Статусы выполнения тестового прогона (технические, не бизнес-вердикты)
 */
export var RunStatus;
(function (RunStatus) {
    RunStatus["CREATED"] = "CREATED";
    RunStatus["RUNNING"] = "RUNNING";
    RunStatus["COMPLETED"] = "COMPLETED";
    RunStatus["FAILED"] = "FAILED"; // Технический сбой выполнения, не FAIL вердикт теста
})(RunStatus || (RunStatus = {}));
/**
 * Генерация уникального ID прогона
 */
export function generateRunId() {
    return `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
//# sourceMappingURL=RunLifecycle.js.map
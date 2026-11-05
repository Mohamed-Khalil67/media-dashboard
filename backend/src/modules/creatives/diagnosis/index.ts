export * from "./types";
export { DEFAULT_THRESHOLDS, HEURISTIC_BASELINES, STAGES_BY_OBJECTIVE, STAGE_ORDER, objectiveFromMeta, resolveThresholds } from "./config";
export { conversionsFor, deriveMetrics, ratio } from "./metrics";
export { computeBaselines, median, type Peer, type BaselineOptions } from "./baselines";
export { biggestDrop, daysWithSpend, recentTrend, type Trend } from "./signals";
export { applicableStages, compare, runStageChecks } from "./stages";
export { decideVerdict, scorePerformance } from "./verdict";
export { buildHeadline, diagnoseAd, sortFindings } from "./diagnose";

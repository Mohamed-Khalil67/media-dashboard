import { STAGE_ORDER } from "./config";
import { assertNever } from "./copy";
import { daysWithSpend } from "./signals";
import type {
  AdInput,
  Baselines,
  Confidence,
  DerivedMetrics,
  Finding,
  Performance,
  Stage,
  Targets,
  Thresholds,
  Verdict,
} from "./types";

/** A cost within 10% of the account median still counts as meeting it. */
const BASELINE_TOLERANCE = 1.1;
/** Default break-even ROAS when no target is set. */
const DEFAULT_ROAS = 1;

export interface ScoredPerformance {
  performance: Performance;
  /** Achievement vs reference, oriented so 1 = on target, < 1 = worse. Null when unknown. */
  score: number | null;
}

const UNKNOWN: ScoredPerformance = {
  performance: { metric: null, value: null, reference: null, referenceSource: null, status: "unknown" },
  score: null,
};

function higherIsBetter(
  metric: "roas",
  value: number | null,
  reference: number,
  referenceSource: Performance["referenceSource"],
): ScoredPerformance {
  const v = value ?? 0;
  const score = reference > 0 ? v / reference : null;
  return {
    performance: { metric, value: v, reference, referenceSource, status: v >= reference ? "meets" : "misses" },
    score,
  };
}

function lowerIsBetter(
  metric: Exclude<Performance["metric"], "roas" | null>,
  value: number | null,
  reference: number,
  referenceSource: Performance["referenceSource"],
  tolerance: number,
): ScoredPerformance {
  // No value means no results at all (zero denominator) after spending: a miss.
  if (value === null) {
    return { performance: { metric, value: null, reference, referenceSource, status: "misses" }, score: 0 };
  }
  const meets = value <= reference * tolerance;
  return {
    performance: { metric, value, reference, referenceSource, status: meets ? "meets" : "misses" },
    score: value > 0 ? reference / value : null,
  };
}

function vsBaseline(
  metric: "costPerLpv" | "costPerThruplay" | "costPer1000Reached" | "cpa",
  metrics: DerivedMetrics,
  baselines: Baselines,
): ScoredPerformance {
  const baseline = baselines[metric];
  if (!baseline) return UNKNOWN;
  return lowerIsBetter(metric, metrics[metric], baseline.value, "baseline", BASELINE_TOLERANCE);
}

/** How the ad does on the success metric its objective cares about. */
export function scorePerformance(
  input: AdInput,
  metrics: DerivedMetrics,
  baselines: Baselines,
  targets: Targets,
): ScoredPerformance {
  switch (input.objective) {
    case "SALES":
      if (targets.roas !== null) return higherIsBetter("roas", metrics.roas, targets.roas, "target");
      if (targets.cpa !== null) return lowerIsBetter("cpa", metrics.cpa, targets.cpa, "target", 1);
      return higherIsBetter("roas", metrics.roas, DEFAULT_ROAS, "default");
    case "LEADS":
      if (targets.cpa !== null) return lowerIsBetter("cpa", metrics.cpa, targets.cpa, "target", 1);
      return vsBaseline("cpa", metrics, baselines);
    case "TRAFFIC":
      return vsBaseline("costPerLpv", metrics, baselines);
    case "ENGAGEMENT":
      return vsBaseline("costPerThruplay", metrics, baselines);
    case "AWARENESS":
      return vsBaseline("costPer1000Reached", metrics, baselines);
    case "APP_PROMOTION":
    case "UNKNOWN":
      return UNKNOWN;
    default:
      return assertNever(input.objective);
  }
}

const CREATIVE_STAGES: ReadonlySet<Stage> = new Set<Stage>(["auction", "hook", "hold", "click", "landing", "conversion"]);

/** A creative-funnel problem worth acting on. `below_target` is the outcome itself, not a cause. */
export function isFailingCreativeFinding(f: Finding): boolean {
  return CREATIVE_STAGES.has(f.stage) && f.severity !== "info" && f.kind !== "below_target";
}

export function failingCreativeStages(findings: readonly Finding[]): Stage[] {
  return STAGE_ORDER.filter((stage) => findings.some((f) => f.stage === stage && isFailingCreativeFinding(f)));
}

export function blocksDelivery(f: Finding): boolean {
  return f.stage === "delivery" && (f.severity === "critical" || f.kind === "issues");
}

export interface VerdictInput {
  input: AdInput;
  findings: readonly Finding[];
  scored: ScoredPerformance;
  baselines: Baselines;
  targets: Targets;
  thresholds: Thresholds;
}

/** Was enough spent (or shown) to judge this ad as a loser rather than "too early"? */
export function spentEnough({ input, baselines, targets, thresholds }: VerdictInput): boolean {
  const broadReach = input.totals.impressions >= thresholds.minImpressions * 5;
  if (input.objective !== "SALES" && input.objective !== "LEADS") return broadReach;
  const referenceCpa = targets.cpa ?? baselines.cpa?.value ?? null;
  if (referenceCpa === null || referenceCpa <= 0) return broadReach;
  return input.totals.spend >= thresholds.killSpendMultiple * referenceCpa;
}

/** The verdict decision table. Order matters: delivery problems, then data gate, then performance. */
export function decideVerdict(v: VerdictInput): Verdict {
  const { input, findings, scored, thresholds } = v;

  if (findings.some(blocksDelivery)) return "fix_delivery";
  if (input.totals.impressions < thresholds.minImpressions) return "wait";

  const failing = failingCreativeStages(findings);
  const fatigued = findings.some((f) => f.kind === "creative_fatigue");

  switch (scored.performance.status) {
    case "meets": {
      const healthy = failing.length === 0 && !fatigued;
      return healthy && daysWithSpend(input.daily) >= thresholds.scaleMinDays ? "scale" : "keep";
    }
    case "misses": {
      const enough = spentEnough(v);
      if (failing.length >= 2 && enough) return "kill";
      if (failing.length >= 1) return "iterate";
      if (!enough) return "wait";
      return scored.score !== null && scored.score < 0.5 ? "kill" : "iterate";
    }
    case "unknown":
      return failing.length > 0 ? "iterate" : "keep";
    default:
      return assertNever(scored.performance.status);
  }
}

/** The finding that best explains the verdict: first relevant one in funnel order, most severe first. */
export function primaryFinding(verdict: Verdict, findings: readonly Finding[]): Finding | null {
  const candidates = ((): readonly Finding[] => {
    switch (verdict) {
      case "fix_delivery":
        return findings.filter(blocksDelivery);
      case "iterate":
      case "kill": {
        const failing = findings.filter(isFailingCreativeFinding);
        return failing.length > 0 ? failing : findings.filter((f) => f.kind === "below_target");
      }
      case "keep":
        return findings.filter((f) => f.severity !== "info");
      case "scale":
      case "wait":
        return [];
      default:
        return assertNever(verdict);
    }
  })();
  return candidates[0] ?? null;
}

/** High needs lots of data and only account baselines; medium needs a few thousand impressions. */
export function decideConfidence(
  impressions: number,
  findings: readonly Finding[],
  scored: ScoredPerformance,
  baselines: Baselines,
  thresholds: Thresholds,
): Confidence {
  const usedSources = findings.flatMap((f) => ("comparison" in f ? [f.comparison.baselineSource] : []));
  const perfMetric = scored.performance.metric;
  if (scored.performance.referenceSource === "baseline" && perfMetric !== null) {
    const source = baselines[perfMetric]?.source;
    if (source) usedSources.push(source);
  }
  const allAccount = usedSources.every((s) => s === "account");
  if (impressions >= thresholds.confidentImpressions && allAccount) return "high";
  if (impressions >= thresholds.minImpressions * 3) return "medium";
  return "low";
}

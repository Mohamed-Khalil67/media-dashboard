import { STAGE_ORDER, resolveThresholds } from "./config";
import { assertNever, money } from "./copy";
import { deriveMetrics } from "./metrics";
import { runStageChecks } from "./stages";
import type { AdInput, Diagnosis, DiagnosisContext, Finding, Performance, Severity, Verdict } from "./types";
import { decideConfidence, decideVerdict, failingCreativeStages, primaryFinding, scorePerformance } from "./verdict";

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/** Funnel order first, then most severe first within a stage. Stable for equal keys. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

const PERFORMANCE_LABEL: Record<NonNullable<Performance["metric"]>, string> = {
  roas: "ROAS",
  cpa: "cost per result",
  costPerLpv: "cost per landing page view",
  costPerThruplay: "cost per ThruPlay",
  costPer1000Reached: "cost per 1,000 people reached",
};

function goalPhrase(p: Performance): string {
  if (p.metric === null || p.value === null || p.reference === null) return "its goal";
  const label = PERFORMANCE_LABEL[p.metric];
  const value = p.metric === "roas" ? p.value.toFixed(2) : money(p.value);
  const reference = p.metric === "roas" ? p.reference.toFixed(2) : money(p.reference);
  const against =
    p.referenceSource === "target" ? "target" : p.referenceSource === "baseline" ? "account median" : "break-even";
  return `its ${label} goal (${value} vs ${against} ${reference})`;
}

export function buildHeadline(
  verdict: Verdict,
  primary: Finding | null,
  performance: Performance,
  failingStageCount: number,
  impressions: number,
  minImpressions: number,
): string {
  switch (verdict) {
    case "fix_delivery":
      return `It isn't delivering properly. ${primary?.recommendation ?? "Check its status in Ads Manager."}`;
    case "wait":
      return impressions < minImpressions
        ? `Not enough data yet: ${impressions.toLocaleString("en-US")} of ${minImpressions.toLocaleString("en-US")} impressions needed. Check back once it has more.`
        : `It's behind ${goalPhrase(performance)}, but it's too early to call. Let it spend a little more before deciding.`;
    case "scale":
      return `It beats ${goalPhrase(performance)} and every funnel step looks healthy. Raise the budget gradually, about 20% every few days.`;
    case "keep":
      return primary
        ? `It's meeting ${goalPhrase(performance)}, with one thing to watch. ${primary.recommendation}`
        : `It's meeting ${goalPhrase(performance)}. Keep it running and check again in a few days.`;
    case "iterate":
      return primary && primary.kind !== "below_target"
        ? `${primary.message} ${primary.recommendation}`
        : `It misses ${goalPhrase(performance)} although each funnel step looks normal. Test a different offer, audience or angle.`;
    case "kill":
      return failingStageCount >= 2
        ? `It misses ${goalPhrase(performance)} and fails at ${failingStageCount} funnel steps. Pause it and move the budget to a stronger ad.`
        : `It's far below ${goalPhrase(performance)} after enough spend. Pause it and move the budget to a stronger ad.`;
    default:
      return assertNever(verdict);
  }
}

/**
 * Diagnose one ad: derive metrics, run the stage checks that apply to its
 * objective and format, score it on its objective's success metric, and
 * decide a verdict with a one-sentence headline.
 *
 * Pure: same input, same output. Baselines must come from ads with the same
 * objective (see `computeBaselines`).
 */
export function diagnoseAd(input: AdInput, ctx: DiagnosisContext): Diagnosis {
  const thresholds = resolveThresholds(ctx.thresholds);
  const { baselines, targets } = ctx;
  const metrics = deriveMetrics(input.totals, input.objective, input.format);
  const findings = sortFindings(runStageChecks({ input, metrics, baselines, targets, thresholds }));
  const scored = scorePerformance(input, metrics, baselines, targets);
  const verdict = decideVerdict({ input, findings, scored, baselines, targets, thresholds });
  const primary = primaryFinding(verdict, findings);
  const { impressions } = input.totals;

  return {
    adId: input.adId,
    verdict,
    confidence: decideConfidence(impressions, findings, scored, baselines, thresholds),
    headline: buildHeadline(
      verdict,
      primary,
      scored.performance,
      failingCreativeStages(findings).length,
      impressions,
      thresholds.minImpressions,
    ),
    primaryStage: primary?.stage ?? null,
    performance: scored.performance,
    metrics,
    findings,
    dataProgress: verdict === "wait" ? Math.min(1, impressions / thresholds.minImpressions) : null,
  };
}


import { LOWER_IS_BETTER, STAGES_BY_OBJECTIVE } from "./config";
import {
  RANKING_ADVICE,
  RANKING_NAME,
  assertNever,
  baselineLabel,
  clock,
  holdRecommendation,
  money,
  pct,
  rankingLabel,
  times,
} from "./copy";
import { ratio } from "./metrics";
import { biggestDrop, recentTrend } from "./signals";
import type {
  AdInput,
  AdRankings,
  Baselines,
  Comparison,
  DerivedMetrics,
  Finding,
  MetricKey,
  Ranking,
  Severity,
  Stage,
  Targets,
  Thresholds,
} from "./types";

export interface StageContext {
  input: AdInput;
  metrics: DerivedMetrics;
  baselines: Baselines;
  targets: Targets;
  thresholds: Thresholds;
}

/** Effective statuses that may legitimately show no impressions yet. */
const WAITING_STATUSES: ReadonlySet<string> = new Set(["ACTIVE", "IN_PROCESS", "PENDING_REVIEW", "PREAPPROVED"]);

/** Compare a metric with its baseline. Null when either side is missing or the baseline is zero. */
export function compare(metric: MetricKey, value: number | null, baselines: Baselines): Comparison | null {
  const baseline = baselines[metric];
  if (value === null || !baseline || baseline.value <= 0) return null;
  return { metric, value, baseline: baseline.value, baselineSource: baseline.source, ratio: value / baseline.value };
}

/** True when the comparison is clearly worse than the baseline, honouring the metric's direction. */
function isWorse(c: Comparison, t: Thresholds): boolean {
  return LOWER_IS_BETTER.has(c.metric) ? c.ratio > t.highCostRatio : c.ratio < t.weakRatio;
}

/** Warning when worse than baseline; critical when at most half as good (or twice as costly as the threshold). */
function severityFor(c: Comparison, t: Thresholds): Severity {
  if (LOWER_IS_BETTER.has(c.metric)) return c.ratio > t.highCostRatio * 1.5 ? "critical" : "warning";
  return c.ratio < t.weakRatio / 1.5 ? "critical" : "warning";
}

function weakComparison(metric: MetricKey, ctx: StageContext): Comparison | null {
  const c = compare(metric, ctx.metrics[metric], ctx.baselines);
  return c && isWorse(c, ctx.thresholds) ? c : null;
}

function checkDelivery({ input }: StageContext): Finding[] {
  const { delivery, totals } = input;
  const status = delivery.effectiveStatus.toUpperCase();
  const noImpressions = totals.impressions <= 0;
  const findings: Finding[] = [];

  if (status === "DISAPPROVED" || delivery.rejectionReasons.length > 0) {
    findings.push({
      stage: "delivery",
      kind: "rejected",
      severity: "critical",
      reasons: delivery.rejectionReasons,
      message: `Meta rejected this ad: ${delivery.rejectionReasons.join("; ") || "no reason given"}.`,
      recommendation: "Fix the policy issue and resubmit, or launch a compliant version.",
    });
  } else if (status === "WITH_ISSUES" || delivery.issues.length > 0) {
    findings.push({
      stage: "delivery",
      kind: "issues",
      severity: noImpressions ? "critical" : "warning",
      issues: delivery.issues,
      message: `Meta flags delivery issues${delivery.issues.length > 0 ? `: ${delivery.issues.join("; ")}` : ""}.`,
      recommendation: "Resolve the issues shown for this ad in Ads Manager.",
    });
  } else if (noImpressions && !WAITING_STATUSES.has(status)) {
    findings.push({
      stage: "delivery",
      kind: "not_delivering",
      severity: "critical",
      effectiveStatus: delivery.effectiveStatus,
      message: `It got no impressions in this period (status ${delivery.effectiveStatus}).`,
      recommendation: "Check that the ad, ad set and campaign are on, and that budget and schedule allow spend.",
    });
  }

  if (delivery.learningStatus === "FAIL") {
    findings.push({
      stage: "delivery",
      kind: "learning_limited",
      severity: "warning",
      message: "The ad set is stuck in learning: it isn't getting enough results to optimise.",
      recommendation: "Combine ad sets, widen the audience, or optimise for an event that happens more often.",
    });
  }
  return findings;
}

const RANKING_SEVERITY: Partial<Record<Ranking, Severity>> = {
  BELOW_AVERAGE_10: "warning",
  BELOW_AVERAGE_20: "warning",
  BELOW_AVERAGE_35: "info",
};

const RANKING_KEYS: readonly (keyof AdRankings)[] = ["quality", "engagement", "conversion"];

function checkAuction(ctx: StageContext): Finding[] {
  const findings: Finding[] = [];
  const cpm = weakComparison("cpm", ctx);
  if (cpm) {
    findings.push({
      stage: "auction",
      kind: "high_cpm",
      severity: severityFor(cpm, ctx.thresholds),
      comparison: cpm,
      message: `You pay ${money(cpm.value)} per 1,000 impressions, ${times(cpm.ratio)} the ${baselineLabel(cpm.baselineSource)} of ${money(cpm.baseline)}.`,
      recommendation: "Broaden the audience or lift the quality ranking; narrow or saturated audiences push CPM up.",
    });
  }
  for (const which of RANKING_KEYS) {
    const ranking = ctx.input.rankings[which];
    const severity = RANKING_SEVERITY[ranking];
    if (!severity) continue;
    findings.push({
      stage: "auction",
      kind: "low_ranking",
      severity,
      ranking,
      which,
      message: `${RANKING_NAME[which]} ranking is ${rankingLabel(ranking)} compared with ads competing for the same people.`,
      recommendation: RANKING_ADVICE[which],
    });
  }
  return findings;
}

function checkHook(ctx: StageContext): Finding[] {
  const c = weakComparison("hookRate", ctx);
  if (!c) return [];
  return [
    {
      stage: "hook",
      kind: "weak_hook",
      severity: severityFor(c, ctx.thresholds),
      comparison: c,
      message: `${pct(c.value)} of people stop scrolling, vs ${pct(c.baseline)} ${baselineLabel(c.baselineSource)}.`,
      recommendation: "Rework the first 3 seconds (opening frame, motion, on-screen text); keep the rest.",
    },
  ];
}

function checkHold(ctx: StageContext): Finding[] {
  const c = weakComparison("holdRate", ctx);
  if (!c) return [];
  const drop = biggestDrop(ctx.input.retention);
  const where = drop ? `; most leave between ${clock(drop.fromSecond)} and ${clock(drop.toSecond)}` : "";
  return [
    {
      stage: "hold",
      kind: "weak_hold",
      severity: severityFor(c, ctx.thresholds),
      comparison: c,
      drop,
      message: `${pct(c.value)} of people who stop keep watching to ThruPlay, vs ${pct(c.baseline)} ${baselineLabel(c.baselineSource)}${where}.`,
      recommendation: holdRecommendation(drop),
    },
  ];
}

function checkClick(ctx: StageContext): Finding[] {
  const c = weakComparison("ctr", ctx);
  if (!c) return [];
  return [
    {
      stage: "click",
      kind: "low_ctr",
      severity: severityFor(c, ctx.thresholds),
      comparison: c,
      message: `${pct(c.value)} of people who see it click the link, vs ${pct(c.baseline)} ${baselineLabel(c.baselineSource)}.`,
      recommendation: "Make the call to action and offer clearer, and repeat them on screen near the end.",
    },
  ];
}

function checkLanding(ctx: StageContext): Finding[] {
  const lpvRate = ctx.metrics.lpvRate;
  const floor = ctx.thresholds.lpvRateFloor;
  if (lpvRate === null || lpvRate >= floor) return [];
  return [
    {
      stage: "landing",
      kind: "page_drop_off",
      severity: lpvRate < floor / 2 ? "critical" : "warning",
      lpvRate,
      floor,
      message: `Only ${pct(lpvRate)} of clicks load the landing page (aim for at least ${pct(floor)}).`,
      recommendation: "Speed up the landing page and check the link works on mobile.",
    },
  ];
}

function checkConversion(ctx: StageContext): Finding[] {
  const findings: Finding[] = [];
  const c = weakComparison("cvr", ctx);
  if (c) {
    findings.push({
      stage: "conversion",
      kind: "low_cvr",
      severity: severityFor(c, ctx.thresholds),
      comparison: c,
      message: `${pct(c.value)} of landing page visitors convert, vs ${pct(c.baseline)} ${baselineLabel(c.baselineSource)}.`,
      recommendation: "Check the landing page: price, stock, trust signals, and that it keeps the ad's promise.",
    });
  }

  const { objective } = ctx.input;
  const { roas, cpa } = ctx.metrics;
  const { targets } = ctx;
  const nextStep = "Fix the weakest funnel step first; if none stands out, test a new offer or audience.";

  if (objective === "SALES" && targets.roas !== null) {
    const value = roas ?? 0;
    if (value < targets.roas) {
      findings.push({
        stage: "conversion",
        kind: "below_target",
        severity: "warning",
        metric: "roas",
        value,
        target: targets.roas,
        message: `ROAS is ${value.toFixed(2)} against a target of ${targets.roas.toFixed(2)}.`,
        recommendation: nextStep,
      });
    }
  } else if ((objective === "SALES" || objective === "LEADS") && targets.cpa !== null) {
    const spend = ctx.input.totals.spend;
    const value = cpa ?? spend;
    if (cpa === null ? spend > targets.cpa : cpa > targets.cpa) {
      findings.push({
        stage: "conversion",
        kind: "below_target",
        severity: "warning",
        metric: "cpa",
        value,
        target: targets.cpa,
        message:
          cpa === null
            ? `No results yet after ${money(spend)} spent, against a target cost per result of ${money(targets.cpa)}.`
            : `Cost per result is ${money(cpa)} against a target of ${money(targets.cpa)}.`,
        recommendation: nextStep,
      });
    }
  }
  return findings;
}

function checkFatigue(ctx: StageContext): Finding[] {
  const { frequency } = ctx.input.totals;
  const t = ctx.thresholds;
  if (frequency < t.fatigueFrequency) return [];
  const trend = recentTrend(ctx.input.daily);
  const hookDrop = trend.hookChange !== null && trend.hookChange <= -t.fatigueDrop ? -trend.hookChange : null;
  const ctrDrop = trend.ctrChange !== null && trend.ctrChange <= -t.fatigueDrop ? -trend.ctrChange : null;
  if (hookDrop === null && ctrDrop === null) return [];

  const parts = [
    hookDrop !== null ? `the hook rate fell ${pct(hookDrop)}` : null,
    ctrDrop !== null ? `click-through fell ${pct(ctrDrop)}` : null,
  ].filter((p): p is string => p !== null);

  return [
    {
      stage: "fatigue",
      kind: "creative_fatigue",
      severity: "warning",
      frequency,
      hookDrop,
      ctrDrop,
      message: `Frequency is ${frequency.toFixed(1)} and ${parts.join(" and ")} over the last 7 days.`,
      recommendation: "Refresh the creative with a new hook or version, or widen the audience.",
    },
  ];
}

const MIN_PLACEMENT_IMPRESSIONS = 1_000;
const PLACEMENT_GAP_RATIO = 1.5;

function checkPlacement(ctx: StageContext): Finding[] {
  const metric = ctx.input.format === "VIDEO" ? "hookRate" : "ctr";
  const rated = ctx.input.placements
    .filter((p) => p.impressions >= MIN_PLACEMENT_IMPRESSIONS)
    .map((p) => ({
      placement: p.placement,
      value: ratio(metric === "hookRate" ? p.video3s : p.linkClicks, p.impressions) ?? 0,
    }))
    .sort((a, b) => b.value - a.value);

  const best = rated.at(0);
  const worst = rated.at(-1);
  if (rated.length < 2 || !best || !worst || best.value <= 0) return [];
  if (worst.value > 0 && best.value / worst.value < PLACEMENT_GAP_RATIO) return [];

  const label = metric === "hookRate" ? "Hook rate" : "Click-through";
  return [
    {
      stage: "placement",
      kind: "placement_gap",
      severity: "info",
      best: best.placement,
      worst: worst.placement,
      metric,
      bestValue: best.value,
      worstValue: worst.value,
      message: `${label} is ${pct(best.value)} on ${best.placement} vs ${pct(worst.value)} on ${worst.placement}.`,
      recommendation: `Put more budget behind ${best.placement}, for example in its own ad set, or exclude ${worst.placement}.`,
    },
  ];
}

function runStage(stage: Stage, ctx: StageContext): Finding[] {
  switch (stage) {
    case "delivery":
      return checkDelivery(ctx);
    case "auction":
      return checkAuction(ctx);
    case "hook":
      return checkHook(ctx);
    case "hold":
      return checkHold(ctx);
    case "click":
      return checkClick(ctx);
    case "landing":
      return checkLanding(ctx);
    case "conversion":
      return checkConversion(ctx);
    case "fatigue":
      return checkFatigue(ctx);
    case "placement":
      return checkPlacement(ctx);
    default:
      return assertNever(stage);
  }
}

/** Stages that apply to this ad: those its objective cares about, minus video-only stages for non-video ads. */
export function applicableStages(input: AdInput): Stage[] {
  const stages = STAGES_BY_OBJECTIVE[input.objective];
  return input.format === "VIDEO" ? [...stages] : stages.filter((s) => s !== "hook" && s !== "hold");
}

/** Run every applicable stage check, in funnel order. */
export function runStageChecks(ctx: StageContext): Finding[] {
  return applicableStages(ctx.input).flatMap((stage) => runStage(stage, ctx));
}

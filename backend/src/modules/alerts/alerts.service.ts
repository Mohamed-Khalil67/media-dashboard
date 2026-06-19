import { prisma } from "../../db/client";
import type { AlertRule } from "@prisma/client";

export type Metric = "roas" | "frequency" | "ctr";
export type Operator = "lt" | "gt";
export type Severity = "danger" | "warning" | "info";

export interface EvaluatedAlert {
  campaignId: string;
  campaignName: string;
  platform: string;
  ruleId: string;
  metric: Metric;
  operator: Operator;
  threshold: number;
  observed: number;
  severity: Severity;
  message: string;
}

const SUPPORTED_METRICS: ReadonlyArray<Metric> = ["roas", "frequency", "ctr"];
const SUPPORTED_OPERATORS: ReadonlyArray<Operator> = ["lt", "gt"];

const EVAL_WINDOW_DAYS = 7;

export function isSupportedMetric(m: unknown): m is Metric {
  return typeof m === "string" && (SUPPORTED_METRICS as readonly string[]).includes(m);
}

export function isSupportedOperator(o: unknown): o is Operator {
  return typeof o === "string" && (SUPPORTED_OPERATORS as readonly string[]).includes(o);
}

/** Compute the metric for one campaign over the eval window. */
async function metricsForCampaign(campaignId: string) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - EVAL_WINDOW_DAYS);

  const insights = await prisma.insight.findMany({
    where: { campaignId, date: { gte: since } },
  });

  const spend = insights.reduce((s, i) => s + i.spend, 0);
  const revenue = insights.reduce((s, i) => s + i.revenue, 0);
  const impressions = insights.reduce((s, i) => s + i.impressions, 0);
  const clicks = insights.reduce((s, i) => s + i.clicks, 0);
  const freqWeighted = impressions > 0
    ? insights.reduce((s, i) => s + i.frequency * i.impressions, 0) / impressions
    : 0;

  return {
    spend,
    roas: spend > 0 ? revenue / spend : 0,
    frequency: freqWeighted,
    ctr: impressions > 0 ? clicks / impressions : 0,
    hasData: insights.length > 0,
  };
}

function violates(operator: Operator, observed: number, threshold: number): boolean {
  return operator === "lt" ? observed < threshold : observed > threshold;
}

function severityFor(operator: Operator, observed: number, threshold: number): Severity {
  // "Twice as bad as the threshold" → danger; otherwise warning.
  if (operator === "lt") {
    return observed < threshold * 0.5 ? "danger" : "warning";
  }
  return observed > threshold * 1.5 ? "danger" : "warning";
}

function describe(metric: Metric, operator: Operator, observed: number, threshold: number): string {
  const op = operator === "lt" ? "below" : "above";
  switch (metric) {
    case "roas":      return `ROAS ${observed.toFixed(2)} ${op} target ${threshold.toFixed(2)}`;
    case "frequency": return `Frequency ${observed.toFixed(2)} ${op} target ${threshold.toFixed(2)}`;
    case "ctr":       return `CTR ${(observed * 100).toFixed(2)}% ${op} target ${(threshold * 100).toFixed(2)}%`;
  }
}

export async function evaluateAlerts(userId: string, connectionId?: string, platform?: string): Promise<EvaluatedAlert[]> {
  const connFilter: Record<string, string> = { userId };
  if (connectionId) connFilter.id = connectionId;
  if (platform) connFilter.platform = platform;
  const campaignWhere = { connection: connFilter };

  const [rules, campaigns] = await Promise.all([
    prisma.alertRule.findMany({ where: { userId, enabled: true } }),
    prisma.campaign.findMany({
      where: campaignWhere,
      include: { connection: { select: { platform: true } } },
    }),
  ]);

  if (rules.length === 0 || campaigns.length === 0) return [];

  const out: EvaluatedAlert[] = [];

  for (const c of campaigns) {
    const m = await metricsForCampaign(c.id);
    if (!m.hasData) continue;

    for (const rule of rules) {
      if (!isSupportedMetric(rule.metric) || !isSupportedOperator(rule.operator)) continue;

      const observed = m[rule.metric];
      // Skip ROAS check on campaigns with zero spend (always trivially below).
      if (rule.metric === "roas" && m.spend === 0) continue;

      if (violates(rule.operator, observed, rule.threshold)) {
        out.push({
          campaignId: c.id,
          campaignName: c.name,
          platform: c.connection.platform,
          ruleId: rule.id,
          metric: rule.metric,
          operator: rule.operator,
          threshold: rule.threshold,
          observed: Math.round(observed * 10000) / 10000,
          severity: severityFor(rule.operator, observed, rule.threshold),
          message: describe(rule.metric, rule.operator, observed, rule.threshold),
        });
      }
    }
  }

  // Stable order: danger first, then by campaign name.
  return out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "danger" ? -1 : 1;
    return a.campaignName.localeCompare(b.campaignName);
  });
}

import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/client";
import {
  biggestDrop,
  computeBaselines,
  deriveMetrics,
  diagnoseAd,
  median,
  objectiveFromMeta,
  ratio,
  type AdFormat,
  type AdInput,
  type AdRankings,
  type Baselines,
  type DerivedMetrics,
  type Diagnosis,
  type LearningStatus,
  type Ranking,
  type RetentionPoint,
  type Targets,
} from "./diagnosis";
import type {
  CreativeDetailResponse,
  CreativeListQuery,
  CreativeListResponse,
  CreativeRange,
  CreativeRow,
  FunnelStep,
  Verdict,
} from "../../contracts/creatives.contract";
import { isoDay, dayToDate } from "./sync/mappers";

/**
 * Reads synced ad data, runs the diagnosis engine per ad (baselines are
 * computed per ad account and objective) and shapes API responses.
 * Read-only: nothing here calls Meta or writes to the database.
 */

const RANGE_DAYS: Record<CreativeRange, 7 | 14 | 30> = { "7d": 7, "14d": 14, "30d": 30 };
const RANKINGS: ReadonlySet<string> = new Set(["ABOVE_AVERAGE", "AVERAGE", "BELOW_AVERAGE_35", "BELOW_AVERAGE_20", "BELOW_AVERAGE_10"]);
const FORMATS: ReadonlySet<string> = new Set(["VIDEO", "IMAGE", "CAROUSEL", "DYNAMIC"]);
const VERDICTS: readonly Verdict[] = ["scale", "keep", "iterate", "kill", "fix_delivery", "wait"];

function asRanking(v: string | null): Ranking {
  return v !== null && RANKINGS.has(v) ? (v as Ranking) : "UNKNOWN";
}
function asFormat(v: string): AdFormat {
  return FORMATS.has(v) ? (v as AdFormat) : "UNKNOWN";
}
function asLearning(v: string | null): LearningStatus | null {
  return v === "LEARNING" || v === "SUCCESS" || v === "FAIL" ? v : null;
}
function stringList(v: Prisma.JsonValue | null): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function retentionPoints(v: Prisma.JsonValue | null): RetentionPoint[] | null {
  if (!Array.isArray(v)) return null;
  const pts: RetentionPoint[] = [];
  for (const p of v) {
    if (p !== null && typeof p === "object" && !Array.isArray(p)) {
      const second = p["second"];
      const share = p["share"];
      if (typeof second === "number" && typeof share === "number") pts.push({ second, share });
    }
  }
  return pts.length > 0 ? pts : null;
}

function adQuery(userId: string, days: number, connectionId: string | undefined) {
  const since = dayToDate(isoDay(new Date(), days - 1));
  return prisma.ad.findMany({
    where: { adSet: { campaign: { connection: { userId, status: "active", ...(connectionId ? { id: connectionId } : {}) } } } },
    include: {
      adSet: { include: { campaign: { include: { connection: true } } } },
      daily: { where: { date: { gte: since } }, orderBy: { date: "asc" } },
      windows: { where: { windowDays: days } },
      placements: { where: { windowDays: days } },
    },
  });
}
type LoadedAd = Awaited<ReturnType<typeof adQuery>>[number];

interface Evaluated {
  ad: LoadedAd;
  input: AdInput;
  metrics: DerivedMetrics;
  diagnosis: Diagnosis;
  targets: Targets;
  baselines: Baselines;
}

function toInput(ad: LoadedAd): AdInput {
  const win = ad.windows[0];
  const sum = (key: "spend" | "impressions" | "linkClicks" | "videoPlays" | "video3s" | "thruplays" | "p25" | "p50" | "p75" | "p95" | "p100" | "landingPageViews" | "purchases" | "leads" | "revenue") =>
    ad.daily.reduce((s, d) => s + d[key], 0);
  const rankings: AdRankings = {
    quality: asRanking(win?.qualityRanking ?? null),
    engagement: asRanking(win?.engagementRanking ?? null),
    conversion: asRanking(win?.conversionRanking ?? null),
  };
  const issues = stringList(ad.issues);
  return {
    adId: ad.id,
    objective: objectiveFromMeta(ad.adSet.campaign.objective),
    format: asFormat(ad.format),
    delivery: {
      effectiveStatus: ad.effectiveStatus,
      issues,
      rejectionReasons: stringList(ad.rejectionReasons),
      learningStatus: asLearning(ad.adSet.learningStatus),
    },
    totals: {
      spend: sum("spend"),
      impressions: sum("impressions"),
      // Reach and frequency are window-level from Meta; never summed from days.
      reach: win?.reach ?? 0,
      frequency: win?.frequency ?? 0,
      linkClicks: sum("linkClicks"),
      videoPlays: sum("videoPlays"),
      video3s: sum("video3s"),
      thruplays: sum("thruplays"),
      p25: sum("p25"),
      p50: sum("p50"),
      p75: sum("p75"),
      p95: sum("p95"),
      p100: sum("p100"),
      landingPageViews: sum("landingPageViews"),
      purchases: sum("purchases"),
      leads: sum("leads"),
      revenue: sum("revenue"),
    },
    daily: ad.daily.map((d) => ({
      date: d.date.toISOString().slice(0, 10),
      spend: d.spend,
      impressions: d.impressions,
      video3s: d.video3s,
      linkClicks: d.linkClicks,
    })),
    rankings,
    retention: retentionPoints(win?.retention ?? null),
    videoLengthSec: ad.videoLengthSec,
    placements: ad.placements.map((p) => ({
      placement: `${p.publisherPlatform} / ${p.platformPosition}`,
      spend: p.spend,
      impressions: p.impressions,
      video3s: p.video3s,
      linkClicks: p.linkClicks,
      revenue: p.revenue,
    })),
  };
}

function targetsFor(ad: LoadedAd): Targets {
  const c = ad.adSet.campaign;
  if (c.targetRoas !== null || c.targetCpa !== null) return { roas: c.targetRoas, cpa: c.targetCpa, source: "campaign" };
  const conn = c.connection;
  if (conn.targetRoas !== null || conn.targetCpa !== null) return { roas: conn.targetRoas, cpa: conn.targetCpa, source: "account" };
  return { roas: null, cpa: null, source: "default" };
}

/** Diagnose every ad, with baselines from the same account and objective. */
function evaluate(ads: readonly LoadedAd[]): Evaluated[] {
  const prepared = ads
    .filter((ad) => ad.daily.length > 0 || ad.windows.length > 0)
    .map((ad) => {
      const input = toInput(ad);
      return { ad, input, metrics: deriveMetrics(input.totals, input.objective, input.format) };
    });

  const groups = new Map<string, typeof prepared>();
  for (const p of prepared) {
    const key = `${p.ad.adSet.campaign.connectionId}|${p.input.objective}`;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  const out: Evaluated[] = [];
  for (const group of groups.values()) {
    const baselines = computeBaselines(group.map((g) => ({ metrics: g.metrics, spend: g.input.totals.spend, impressions: g.input.totals.impressions })));
    for (const g of group) {
      const targets = targetsFor(g.ad);
      out.push({ ...g, baselines, targets, diagnosis: diagnoseAd(g.input, { baselines, targets }) });
    }
  }
  return out;
}

function toRow(e: Evaluated): CreativeRow {
  const { ad, input, metrics, diagnosis } = e;
  const conn = ad.adSet.campaign.connection;
  return {
    adId: ad.id,
    externalId: ad.externalId,
    name: ad.name,
    connectionId: conn.id,
    accountName: conn.accountName ?? conn.accountId,
    campaignName: ad.adSet.campaign.name,
    adSetName: ad.adSet.name,
    objective: input.objective,
    format: input.format,
    effectiveStatus: ad.effectiveStatus,
    thumbnailUrl: ad.thumbnailUrl,
    videoLengthSec: ad.videoLengthSec,
    currency: conn.currency,
    spend: input.totals.spend,
    impressions: input.totals.impressions,
    hookRate: metrics.hookRate,
    holdRate: metrics.holdRate,
    ctr: metrics.ctr,
    roas: metrics.roas,
    cpa: metrics.cpa,
    verdict: diagnosis.verdict,
    confidence: diagnosis.confidence,
    headline: diagnosis.headline,
    primaryStage: diagnosis.primaryStage,
    weakStages: [...new Set(diagnosis.findings.filter((f) => f.severity !== "info").map((f) => f.stage))],
  };
}

export async function listCreatives(userId: string, query: CreativeListQuery): Promise<CreativeListResponse> {
  const days = RANGE_DAYS[query.range];
  const evaluated = evaluate(await adQuery(userId, days, query.connectionId));
  const q = query.q?.toLowerCase();
  const filtered = evaluated.filter((e) => {
    if (query.objective && e.input.objective !== query.objective) return false;
    if (query.minSpend !== undefined && e.input.totals.spend < query.minSpend) return false;
    if (q && ![e.ad.name, e.ad.adSet.name, e.ad.adSet.campaign.name].some((s) => s.toLowerCase().includes(q))) return false;
    return true;
  });

  const summary = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  for (const e of filtered) summary[e.diagnosis.verdict] += 1;

  const rows = filtered
    .filter((e) => !query.verdict || e.diagnosis.verdict === query.verdict)
    .sort((a, b) => b.input.totals.spend - a.input.totals.spend)
    .map(toRow);

  const lastSync = await prisma.connection.aggregate({
    where: { userId, status: "active", platform: "facebook" },
    _max: { lastAdSyncAt: true },
  });
  return { range: query.range, rows, summary, lastAdSyncAt: lastSync._max.lastAdSyncAt?.toISOString() ?? null };
}

/** Median share per second across peer curves; null with fewer than 3 curves. */
function medianCurve(curves: readonly RetentionPoint[][]): RetentionPoint[] | null {
  if (curves.length < 3) return null;
  const seconds = [...new Set(curves.flatMap((c) => c.map((p) => p.second)))].sort((a, b) => a - b);
  const out: RetentionPoint[] = [];
  for (const second of seconds) {
    const values = curves.map((c) => c.find((p) => p.second === second)?.share).filter((v): v is number => v !== undefined);
    const m = values.length >= 3 ? median(values) : undefined;
    if (m !== undefined) out.push({ second, share: m });
  }
  return out.length > 1 ? out : null;
}

function funnel(e: Evaluated): FunnelStep[] {
  const { metrics, baselines, input, diagnosis, targets } = e;
  const weakStages = new Set(diagnosis.findings.filter((f) => f.severity !== "info").map((f) => f.stage));
  const isVideo = input.format === "VIDEO";
  const step = (
    key: FunnelStep["key"],
    label: string,
    value: number | null,
    metric: "hookRate" | "holdRate" | "ctr" | "lpvRate" | null,
    stage: string,
    note: string | null,
  ): FunnelStep => {
    const b = metric ? baselines[metric] : undefined;
    let status: FunnelStep["status"] = "neutral";
    if (value === null) status = "na";
    else if (weakStages.has(stage as never)) status = "weak";
    else if (b && b.value > 0 && value >= b.value * 1.1) status = "good";
    return { key, label, value, kind: key === "impressions" || key === "result" ? "count" : "rate", baseline: b?.value ?? null, baselineSource: b?.source ?? null, note, status };
  };
  const t = input.totals;
  const resultCount = input.objective === "LEADS" ? t.leads : t.purchases;
  const resultNote =
    input.objective === "LEADS"
      ? metrics.cpa !== null ? `CPA ${metrics.cpa.toFixed(0)}${targets.cpa !== null ? ` · target ${targets.cpa}` : ""}` : null
      : metrics.roas !== null ? `ROAS ${metrics.roas.toFixed(2)}${targets.roas !== null ? ` · target ${targets.roas}` : ""}` : null;
  const result = step("result", input.objective === "LEADS" ? "Leads" : "Purchases", resultCount, null, "conversion", resultNote);
  if (weakStages.has("conversion")) result.status = "weak";
  return [
    step("impressions", "Impressions", t.impressions, null, "auction", metrics.cpm !== null ? `CPM ${metrics.cpm.toFixed(0)}` : null),
    step("hook", "Hook · 3 s", isVideo ? metrics.hookRate : null, "hookRate", "hook", isVideo ? null : "Not a video"),
    step("hold", "Hold · ThruPlay", isVideo ? metrics.holdRate : null, "holdRate", "hold", isVideo ? null : "Not a video"),
    step("click", "Link click", metrics.ctr, "ctr", "click", null),
    step("landing", "Page loads", metrics.lpvRate, "lpvRate", "landing", null),
    result,
  ];
}

export async function getCreative(userId: string, adId: string, range: CreativeRange): Promise<CreativeDetailResponse | null> {
  const days = RANGE_DAYS[range];
  const owned = await prisma.ad.findFirst({
    where: { id: adId, adSet: { campaign: { connection: { userId } } } },
    select: { adSet: { select: { campaign: { select: { connectionId: true } } } } },
  });
  if (!owned) return null;

  // Evaluate the whole account so baselines match the library view.
  const evaluated = evaluate(await adQuery(userId, days, owned.adSet.campaign.connectionId));
  const e = evaluated.find((x) => x.ad.id === adId);
  if (!e) return null;

  const peerCurves = evaluated
    .filter((x) => x.ad.id !== adId && x.input.retention !== null)
    .map((x) => x.input.retention ?? []);
  const t = e.input.totals;

  return {
    range,
    row: toRow(e),
    learningStatus: e.ad.adSet.learningStatus,
    issues: e.input.delivery.issues,
    rejectionReasons: e.input.delivery.rejectionReasons,
    createdAtPlatform: e.ad.createdAtPlatform?.toISOString() ?? null,
    targets: e.targets,
    performance: e.diagnosis.performance,
    totals: {
      spend: t.spend,
      impressions: t.impressions,
      reach: t.reach,
      frequency: t.frequency,
      linkClicks: t.linkClicks,
      video3s: t.video3s,
      thruplays: t.thruplays,
      landingPageViews: t.landingPageViews,
      purchases: t.purchases,
      leads: t.leads,
      revenue: t.revenue,
    },
    funnel: funnel(e),
    findings: e.diagnosis.findings.map((f) => ({ stage: f.stage, kind: f.kind, severity: f.severity, message: f.message, recommendation: f.recommendation })),
    rankings: e.input.rankings,
    retention: {
      points: e.input.retention ?? [],
      baseline: medianCurve(peerCurves),
      biggestDrop: biggestDrop(e.input.retention),
    },
    placements: e.input.placements
      .map((p) => ({
        placement: p.placement,
        spend: p.spend,
        impressions: p.impressions,
        hookRate: e.input.format === "VIDEO" ? ratio(p.video3s, p.impressions) : null,
        ctr: ratio(p.linkClicks, p.impressions),
        roas: ratio(p.revenue, p.spend),
      }))
      .sort((a, b) => b.spend - a.spend),
    daily: e.ad.daily.map((d) => ({
      date: d.date.toISOString().slice(0, 10),
      spend: d.spend,
      impressions: d.impressions,
      hookRate: e.input.format === "VIDEO" ? ratio(d.video3s, d.impressions) : null,
      ctr: ratio(d.linkClicks, d.impressions),
    })),
    dataProgress: e.diagnosis.dataProgress,
  };
}

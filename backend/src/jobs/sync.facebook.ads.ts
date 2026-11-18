import type { Connection, Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { decrypt } from "../utils/encryption";
import { describeSyncError } from "./sync.facebook";
import {
  ThrottledError,
  fetchAccountCurrency,
  fetchAdDetails,
  fetchInsights,
} from "../modules/creatives/sync/meta.client";
import {
  additiveMetrics,
  budgetFromMinor,
  dayToDate,
  detectFormat,
  isoDay,
  issueMessages,
  parseRetentionCurve,
  rejectionReasons,
  videoIdOf,
} from "../modules/creatives/sync/mappers";
import type { AdInsightRow } from "../modules/creatives/sync/meta.schemas";

/**
 * Ad-level (creative) sync for one Facebook connection. READ-ONLY: every Meta
 * call is a GET. Runs at most every AD_SYNC_INTERVAL_MINUTES per connection,
 * after a successful campaign sync, and only fetches ads that delivered in the
 * last 30 days.
 */

const AD_SYNC_INTERVAL_MINUTES = Number(process.env.AD_SYNC_INTERVAL_MINUTES ?? 30);
export const AD_WINDOWS = [7, 14, 30] as const;
const DAILY_DAYS = 30;

const VIDEO_FIELDS = [
  "video_play_actions",
  "video_thruplay_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p95_watched_actions",
  "video_p100_watched_actions",
];
const DAILY_FIELDS = ["ad_id", "date_start", "spend", "impressions", "inline_link_clicks", "actions", "action_values", ...VIDEO_FIELDS].join(",");
const WINDOW_FIELDS = [
  "ad_id",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
  "video_play_curve_actions",
].join(",");
const PLACEMENT_FIELDS = ["ad_id", "spend", "impressions", "inline_link_clicks", "actions", "action_values"].join(",");

/** Connections whose ad sync is in progress in this process (cron cycles can overlap). */
const running = new Set<string>();

export function adSyncDue(conn: Pick<Connection, "lastAdSyncAt">, now: Date = new Date()): boolean {
  if (!conn.lastAdSyncAt) return true;
  return now.getTime() - conn.lastAdSyncAt.getTime() >= AD_SYNC_INTERVAL_MINUTES * 60 * 1000;
}

export interface AdSyncResult {
  ads: number;
  dailyRows: number;
}

/**
 * Run the ad sync if it's due. Never throws: failures are recorded on the
 * connection (`lastAdSyncError`) so the campaign sync result is unaffected.
 */
export async function maybeSyncFacebookAds(conn: Connection, opts: { force?: boolean } = {}): Promise<AdSyncResult | null> {
  if (conn.platform !== "facebook" || conn.status !== "active") return null;
  if (!opts.force && !adSyncDue(conn)) return null;
  if (running.has(conn.id)) return null;
  running.add(conn.id);
  const log = logger.child({ connectionId: conn.id, accountId: conn.accountId, job: "ad-sync" });
  const t0 = Date.now();
  try {
    const result = await syncFacebookAds(conn);
    await prisma.connection.update({ where: { id: conn.id }, data: { lastAdSyncAt: new Date(), lastAdSyncError: null } });
    log.info({ ...result, durationMs: Date.now() - t0 }, "ad sync ok");
    return result;
  } catch (err) {
    const message = err instanceof ThrottledError ? err.message : describeSyncError(err);
    // Record the attempt time too, so a failing account isn't retried every 2 minutes.
    await prisma.connection.update({ where: { id: conn.id }, data: { lastAdSyncAt: new Date(), lastAdSyncError: message } });
    log.warn({ err: message, durationMs: Date.now() - t0 }, "ad sync failed");
    return null;
  } finally {
    running.delete(conn.id);
  }
}

function timeRange(now: Date, days: number): string {
  return JSON.stringify({ since: isoDay(now, days - 1), until: isoDay(now) });
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function syncFacebookAds(conn: Connection, now: Date = new Date()): Promise<AdSyncResult> {
  const token = decrypt(conn.accessToken);

  if (!conn.currency) {
    const currency = await fetchAccountCurrency(conn.accountId, token);
    if (currency) await prisma.connection.update({ where: { id: conn.id }, data: { currency } });
  }

  // 1. Daily rows for the last 30 days. Meta only returns ads that delivered.
  const daily = await fetchInsights(conn.accountId, token, {
    level: "ad",
    time_increment: 1,
    time_range: timeRange(now, DAILY_DAYS),
    fields: DAILY_FIELDS,
  });
  const deliveredIds = [...new Set(daily.filter((r) => r.date_start).map((r) => r.ad_id))];
  if (deliveredIds.length === 0) return { ads: 0, dailyRows: 0 };

  // 2. Structure: campaign → ad set → ad, with creative and delivery state.
  const details = await fetchAdDetails(conn.accountId, deliveredIds, token);

  const adDbIds = new Map<string, string>();
  const adLengths = new Map<string, number | null>();
  for (const d of details) {
    const campaign = await prisma.campaign.upsert({
      where: { connectionId_externalId: { connectionId: conn.id, externalId: d.campaign.id } },
      update: { objective: d.campaign.objective ?? null },
      create: {
        connectionId: conn.id,
        externalId: d.campaign.id,
        name: d.campaign.name,
        status: d.campaign.status ?? "UNKNOWN",
        objective: d.campaign.objective ?? null,
      },
    });
    const adSetData = {
      name: d.adset.name,
      effectiveStatus: d.adset.effective_status,
      learningStatus: d.adset.learning_stage_info?.status ?? null,
      optimizationGoal: d.adset.optimization_goal ?? null,
      dailyBudget: budgetFromMinor(d.adset.daily_budget),
      lifetimeBudget: budgetFromMinor(d.adset.lifetime_budget),
    };
    const adSet = await prisma.adSet.upsert({
      where: { campaignId_externalId: { campaignId: campaign.id, externalId: d.adset.id } },
      update: adSetData,
      create: { campaignId: campaign.id, externalId: d.adset.id, ...adSetData },
    });
    const videoId = videoIdOf(d.creative);
    // Video length isn't readable with an ads token (see fetchAdDetails).
    const length: number | null = null;
    const adData = {
      name: d.name,
      effectiveStatus: d.effective_status,
      format: detectFormat(d.creative),
      creativeId: d.creative?.id ?? null,
      videoId,
      thumbnailUrl: d.creative?.thumbnail_url ?? null,
      videoLengthSec: length,
      issues: issueMessages(d),
      rejectionReasons: rejectionReasons(d),
      createdAtPlatform: d.created_time ? new Date(d.created_time) : null,
    };
    const ad = await prisma.ad.upsert({
      where: { adSetId_externalId: { adSetId: adSet.id, externalId: d.id } },
      update: adData,
      create: { adSetId: adSet.id, externalId: d.id, ...adData },
    });
    adDbIds.set(d.id, ad.id);
    adLengths.set(d.id, length);
  }

  // 3. Daily rows, batched.
  const dailyWrites: Prisma.PrismaPromise<unknown>[] = [];
  for (const row of daily) {
    const adId = adDbIds.get(row.ad_id);
    if (!adId || !row.date_start) continue;
    const date = dayToDate(row.date_start);
    const metrics = additiveMetrics(row);
    dailyWrites.push(
      prisma.adInsightDaily.upsert({
        where: { adId_date: { adId, date } },
        update: metrics,
        create: { adId, date, ...metrics },
      }),
    );
  }
  for (const batch of chunks(dailyWrites, 100)) await prisma.$transaction(batch);

  // 4. Window-level stats and placements, replaced per window.
  const connectionAds: Prisma.AdWhereInput = { adSet: { campaign: { connectionId: conn.id } } };
  for (const days of AD_WINDOWS) {
    const range = timeRange(now, days);
    const windowRows = await fetchInsights(conn.accountId, token, { level: "ad", time_range: range, fields: WINDOW_FIELDS });
    const placementRows = await fetchInsights(conn.accountId, token, {
      level: "ad",
      time_range: range,
      breakdowns: "publisher_platform,platform_position",
      fields: PLACEMENT_FIELDS,
    });
    const windowStart = dayToDate(isoDay(now, days - 1));
    const windowEnd = dayToDate(isoDay(now));
    await prisma.$transaction([
      prisma.adWindowStat.deleteMany({ where: { windowDays: days, ad: connectionAds } }),
      prisma.adWindowStat.createMany({ data: windowStatRows(windowRows, adDbIds, adLengths, days, windowStart, windowEnd) }),
      prisma.adPlacementStat.deleteMany({ where: { windowDays: days, ad: connectionAds } }),
      prisma.adPlacementStat.createMany({ data: placementStatRows(placementRows, adDbIds, days), skipDuplicates: true }),
    ]);
  }

  return { ads: adDbIds.size, dailyRows: dailyWrites.length };
}

function windowStatRows(
  rows: readonly AdInsightRow[],
  adDbIds: ReadonlyMap<string, string>,
  adLengths: ReadonlyMap<string, number | null>,
  windowDays: number,
  windowStart: Date,
  windowEnd: Date,
): Prisma.AdWindowStatCreateManyInput[] {
  const out: Prisma.AdWindowStatCreateManyInput[] = [];
  for (const row of rows) {
    const adId = adDbIds.get(row.ad_id);
    if (!adId) continue;
    const curve = row.video_play_curve_actions?.find((c) => c.action_type === "video_view") ?? row.video_play_curve_actions?.[0];
    const retention = parseRetentionCurve(curve?.value, adLengths.get(row.ad_id) ?? null);
    out.push({
      adId,
      windowDays,
      windowStart,
      windowEnd,
      reach: Math.round(Number(row.reach ?? 0)) || 0,
      frequency: Number(row.frequency ?? 0) || 0,
      impressions: Math.round(Number(row.impressions ?? 0)) || 0,
      spend: Number(row.spend ?? 0) || 0,
      qualityRanking: row.quality_ranking ?? null,
      engagementRanking: row.engagement_rate_ranking ?? null,
      conversionRanking: row.conversion_rate_ranking ?? null,
      // Plain object literals so Prisma accepts them as JSON values.
      retention: retention?.map((p) => ({ second: p.second, share: p.share })),
    });
  }
  return out;
}

function placementStatRows(
  rows: readonly AdInsightRow[],
  adDbIds: ReadonlyMap<string, string>,
  windowDays: number,
): Prisma.AdPlacementStatCreateManyInput[] {
  const out: Prisma.AdPlacementStatCreateManyInput[] = [];
  for (const row of rows) {
    const adId = adDbIds.get(row.ad_id);
    if (!adId || !row.publisher_platform || !row.platform_position) continue;
    const m = additiveMetrics(row);
    out.push({
      adId,
      windowDays,
      publisherPlatform: row.publisher_platform,
      platformPosition: row.platform_position,
      spend: m.spend,
      impressions: m.impressions,
      video3s: m.video3s,
      linkClicks: m.linkClicks,
      revenue: m.revenue,
    });
  }
  return out;
}

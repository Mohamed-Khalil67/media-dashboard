import type { Connection } from "@prisma/client";
import axios from "axios";
import { prisma } from "../db/client";
import {
  fetchCampaigns,
  extractPurchaseRoas,
  extractPurchases,
} from "../modules/facebook/facebook.service";
import { toNum } from "../lib/numeric";

/** Pull campaigns + a daily insight row per day-of-window for one Facebook connection. */
export async function syncFacebook(connection: Connection): Promise<{ campaigns: number; days: number }> {
  const campaigns = await fetchCampaigns(connection);
  let totalDays = 0;

  for (const c of campaigns) {
    const createdAtPlatform = c.created_time ? new Date(c.created_time) : null;
    const campaign = await prisma.campaign.upsert({
      where: { connectionId_externalId: { connectionId: connection.id, externalId: c.id } },
      update: { name: c.name, status: c.status, createdAtPlatform, raw: c as unknown as object },
      create: {
        connectionId: connection.id,
        externalId: c.id,
        name: c.name,
        status: c.status,
        createdAtPlatform,
        raw: c as unknown as object,
      },
    });

    // FB returns one entry per day when time_increment=1. Each entry has date_start = "YYYY-MM-DD".
    const dailyInsights = c.insights?.data ?? [];
    for (const insight of dailyInsights) {
      if (!insight.date_start) continue;
      // Parse "YYYY-MM-DD" → UTC midnight to match how we store/query Insight.date.
      const date = new Date(`${insight.date_start}T00:00:00.000Z`);

      const spend = toNum(insight.spend);
      const impressions = toNum(insight.impressions);
      const clicks = toNum(insight.clicks);
      const frequency = toNum(insight.frequency);
      const purchases = toNum(extractPurchases(insight));
      const roas = toNum(extractPurchaseRoas(insight));
      const revenue = roas > 0 ? roas * spend : 0;

      await prisma.insight.upsert({
        where: { campaignId_date: { campaignId: campaign.id, date } },
        update: { spend, impressions, clicks, frequency, purchases, revenue, raw: insight as unknown as object },
        create: {
          campaignId: campaign.id,
          date,
          spend,
          impressions,
          clicks,
          frequency,
          purchases,
          revenue,
          raw: insight as unknown as object,
        },
      });
      totalDays++;
    }
  }

  return { campaigns: campaigns.length, days: totalDays };
}

/** Detect a 401-style auth failure so the orchestrator can mark the connection expired. */
export function isAuthError(err: unknown): boolean {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 401 || status === 403) return true;
    const fbCode = err.response?.data?.error?.code;
    // 190 = invalid OAuth access token, 102 = session expired
    if (fbCode === 190 || fbCode === 102) return true;
  }
  return false;
}

/** Pull a human-readable message out of an FB Graph API error, or fall back to the raw message. */
export function describeSyncError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const fb = err.response?.data?.error;
    if (fb) {
      const code = fb.code ? `[${fb.code}${fb.error_subcode ? "/" + fb.error_subcode : ""}] ` : "";
      const type = fb.type ? `${fb.type}: ` : "";
      return `${code}${type}${fb.message ?? "Facebook API error"}`.slice(0, 500);
    }
    const status = err.response?.status;
    if (status) return `HTTP ${status} from ${err.config?.url ?? "Facebook"}`.slice(0, 500);
  }
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

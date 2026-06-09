import type { Connection } from "@prisma/client";
import axios from "axios";
import { prisma } from "../db/client";
import {
  fetchCampaigns,
  extractPurchaseRoas,
  extractPurchases,
} from "../modules/facebook/facebook.service";

/** Pull campaigns + today's insights for one Facebook connection. */
export async function syncFacebook(connection: Connection): Promise<{ campaigns: number }> {
  const campaigns = await fetchCampaigns(connection);
  const today = new Date(new Date().toDateString());

  for (const c of campaigns) {
    const campaign = await prisma.campaign.upsert({
      where: { connectionId_externalId: { connectionId: connection.id, externalId: c.id } },
      update: { name: c.name, status: c.status, raw: c as unknown as object },
      create: {
        connectionId: connection.id,
        externalId: c.id,
        name: c.name,
        status: c.status,
        raw: c as unknown as object,
      },
    });

    const insight = c.insights?.data?.[0];
    if (!insight) continue;

    const spend = Number(insight.spend ?? 0);
    const impressions = Number(insight.impressions ?? 0);
    const clicks = Number(insight.clicks ?? 0);
    const frequency = Number(insight.frequency ?? 0);
    const purchases = extractPurchases(insight);
    const roas = extractPurchaseRoas(insight);
    const revenue = roas > 0 ? roas * spend : 0;

    await prisma.insight.upsert({
      where: { campaignId_date: { campaignId: campaign.id, date: today } },
      update: { spend, impressions, clicks, frequency, purchases, revenue, raw: insight as unknown as object },
      create: {
        campaignId: campaign.id,
        date: today,
        spend,
        impressions,
        clicks,
        frequency,
        purchases,
        revenue,
        raw: insight as unknown as object,
      },
    });
  }

  return { campaigns: campaigns.length };
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

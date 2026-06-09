import type { Connection } from "@prisma/client";
import { prisma } from "../db/client";
import { fetchCampaigns, fetchCampaignInsights } from "../modules/tiktok/tiktok.service";

/** Pull campaigns + recent insights for one TikTok connection. */
export async function syncTiktok(connection: Connection): Promise<{ campaigns: number; insightRows: number }> {
  const campaigns = await fetchCampaigns(connection);
  const today = new Date(new Date().toDateString());

  const externalIdToCampaignId = new Map<string, string>();
  for (const c of campaigns) {
    const row = await prisma.campaign.upsert({
      where: { connectionId_externalId: { connectionId: connection.id, externalId: c.campaign_id } },
      update: { name: c.campaign_name, status: c.operation_status, raw: c as unknown as object },
      create: {
        connectionId: connection.id,
        externalId: c.campaign_id,
        name: c.campaign_name,
        status: c.operation_status,
        raw: c as unknown as object,
      },
    });
    externalIdToCampaignId.set(c.campaign_id, row.id);
  }

  const insightRows = await fetchCampaignInsights(connection, 1);
  for (const row of insightRows) {
    const campaignId = externalIdToCampaignId.get(row.campaign_id);
    if (!campaignId) continue;

    const m = row.metrics;
    const spend = Number(m.spend ?? 0);
    const roas = Number(m.complete_payment_roas ?? 0);

    await prisma.insight.upsert({
      where: { campaignId_date: { campaignId, date: today } },
      update: {
        spend,
        impressions: Number(m.impressions ?? 0),
        clicks: Number(m.clicks ?? 0),
        purchases: Number(m.conversion ?? 0),
        frequency: Number(m.frequency ?? 0),
        revenue: roas * spend,
        raw: m as unknown as object,
      },
      create: {
        campaignId,
        date: today,
        spend,
        impressions: Number(m.impressions ?? 0),
        clicks: Number(m.clicks ?? 0),
        purchases: Number(m.conversion ?? 0),
        frequency: Number(m.frequency ?? 0),
        revenue: roas * spend,
        raw: m as unknown as object,
      },
    });
  }

  return { campaigns: campaigns.length, insightRows: insightRows.length };
}

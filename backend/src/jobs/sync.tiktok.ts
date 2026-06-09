import type { Connection } from "@prisma/client";
import { prisma } from "../db/client";
import { fetchCampaigns, fetchCampaignInsights } from "../modules/tiktok/tiktok.service";

const LOOKBACK_DAYS = Number(process.env.TIKTOK_SYNC_LOOKBACK_DAYS ?? 30);

/** Pull campaigns + daily insights for one TikTok connection. */
export async function syncTiktok(connection: Connection): Promise<{ campaigns: number; insightRows: number }> {
  const campaigns = await fetchCampaigns(connection);

  const externalIdToCampaignId = new Map<string, string>();
  for (const c of campaigns) {
    const createdAtPlatform = c.create_time
      ? new Date(c.create_time.replace(" ", "T") + "Z")
      : null;
    const row = await prisma.campaign.upsert({
      where: { connectionId_externalId: { connectionId: connection.id, externalId: c.campaign_id } },
      update: { name: c.campaign_name, status: c.operation_status, createdAtPlatform, raw: c as unknown as object },
      create: {
        connectionId: connection.id,
        externalId: c.campaign_id,
        name: c.campaign_name,
        status: c.operation_status,
        createdAtPlatform,
        raw: c as unknown as object,
      },
    });
    externalIdToCampaignId.set(c.campaign_id, row.id);
  }

  const insightRows = await fetchCampaignInsights(connection, LOOKBACK_DAYS);
  let written = 0;
  for (const row of insightRows) {
    const campaignId = externalIdToCampaignId.get(row.campaign_id);
    if (!campaignId) continue;
    if (!row.stat_time_day) continue;

    // stat_time_day comes back as "YYYY-MM-DD 00:00:00". Parse the date portion as UTC midnight.
    const datePart = row.stat_time_day.slice(0, 10);
    const date = new Date(`${datePart}T00:00:00.000Z`);

    const m = row.metrics;
    const spend = Number(m.spend ?? 0);
    const roas = Number(m.complete_payment_roas ?? 0);

    await prisma.insight.upsert({
      where: { campaignId_date: { campaignId, date } },
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
        date,
        spend,
        impressions: Number(m.impressions ?? 0),
        clicks: Number(m.clicks ?? 0),
        purchases: Number(m.conversion ?? 0),
        frequency: Number(m.frequency ?? 0),
        revenue: roas * spend,
        raw: m as unknown as object,
      },
    });
    written++;
  }

  return { campaigns: campaigns.length, insightRows: written };
}

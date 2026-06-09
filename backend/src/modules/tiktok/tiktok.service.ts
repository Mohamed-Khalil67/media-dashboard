import axios from "axios";
import type { Connection } from "@prisma/client";
import { decrypt } from "../../utils/encryption";

const API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export interface TikTokTokenResponse {
  access_token: string;
  advertiser_ids: string[];
  scope?: number[];
}

export interface TikTokCampaign {
  campaign_id: string;
  campaign_name: string;
  operation_status: string;
  status?: string;
  create_time?: string; // "YYYY-MM-DD HH:MM:SS" in advertiser's local timezone
}

export interface TikTokInsightRow {
  campaign_id: string;
  stat_time_day?: string; // "YYYY-MM-DD HH:MM:SS" when breakdown by day is requested
  metrics: {
    spend?: string;
    impressions?: string;
    clicks?: string;
    conversion?: string;
    complete_payment_roas?: string;
    frequency?: string;
  };
}

/** Exchange the auth_code from the callback for a long-lived access token + advertiser ids. */
export async function exchangeAuthCode(authCode: string): Promise<TikTokTokenResponse> {
  const res = await axios.post(`${API_BASE}/oauth2/access_token/`, {
    app_id: process.env.TIKTOK_APP_ID,
    secret: process.env.TIKTOK_APP_SECRET,
    auth_code: authCode,
  });
  if (res.data?.code !== 0) {
    throw new Error(`TikTok token exchange failed: ${res.data?.message ?? "unknown"}`);
  }
  return res.data.data as TikTokTokenResponse;
}

/** List campaigns for a connected advertiser. */
export async function fetchCampaigns(connection: Connection): Promise<TikTokCampaign[]> {
  const token = decrypt(connection.accessToken);
  const res = await axios.get(`${API_BASE}/campaign/get/`, {
    headers: { "Access-Token": token },
    params: {
      advertiser_id: connection.accountId,
      page_size: 100,
    },
  });
  if (res.data?.code !== 0) {
    throw new Error(`TikTok /campaign/get/ failed: ${res.data?.message}`);
  }
  return res.data.data?.list ?? [];
}

/** Fetch campaign-level performance broken down by day across the lookback range. */
export async function fetchCampaignInsights(connection: Connection, dayRange = 30): Promise<TikTokInsightRow[]> {
  const token = decrypt(connection.accessToken);
  const end = new Date();
  const start = new Date(end.getTime() - dayRange * 86_400_000);

  const res = await axios.get(`${API_BASE}/report/integrated/get/`, {
    headers: { "Access-Token": token },
    params: {
      advertiser_id: connection.accountId,
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      // stat_time_day produces one row per campaign per day.
      dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
      metrics: JSON.stringify([
        "spend",
        "impressions",
        "clicks",
        "conversion",
        "complete_payment_roas",
        "frequency",
      ]),
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      page_size: 1000,
    },
  });
  if (res.data?.code !== 0) {
    throw new Error(`TikTok report fetch failed: ${res.data?.message}`);
  }
  return (res.data.data?.list ?? []).map((row: { dimensions: { campaign_id: string; stat_time_day?: string }; metrics: TikTokInsightRow["metrics"] }) => ({
    campaign_id: row.dimensions.campaign_id,
    stat_time_day: row.dimensions.stat_time_day,
    metrics: row.metrics,
  }));
}

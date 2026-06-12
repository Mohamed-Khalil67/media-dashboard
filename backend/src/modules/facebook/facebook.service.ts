import axios from "axios";
import type { Connection } from "@prisma/client";
import { decrypt } from "../../utils/encryption";

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION ?? "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface FacebookInsight {
  date_start?: string;   // "YYYY-MM-DD" — present when time_increment=1
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  frequency?: string;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  actions?: Array<{ action_type: string; value: string }>;
}

export interface FacebookCampaign {
  id: string;
  name: string;
  status: string;
  created_time?: string; // ISO-8601 string from Graph API
  insights?: { data?: FacebookInsight[] };
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const short = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      client_id: process.env.FB_APP_ID,
      client_secret: process.env.FB_APP_SECRET,
      redirect_uri: process.env.FB_REDIRECT_URI,
      code,
    },
  });
  // Swap the ~2-hour token for a ~60-day long-lived one so background sync keeps working.
  const long = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: process.env.FB_APP_ID,
      client_secret: process.env.FB_APP_SECRET,
      fb_exchange_token: short.data.access_token,
    },
  });
  return long.data.access_token as string;
}

export async function listAdAccounts(accessToken: string): Promise<Array<{ id: string; name: string }>> {
  const res = await axios.get(`${GRAPH_BASE}/me/adaccounts`, {
    params: { access_token: accessToken, fields: "id,name" },
  });
  return res.data.data ?? [];
}

const SYNC_LOOKBACK_DAYS = Number(process.env.FB_SYNC_LOOKBACK_DAYS ?? 30);

export async function fetchCampaigns(connection: Connection): Promise<FacebookCampaign[]> {
  const token = decrypt(connection.accessToken);
  // time_increment(1) returns one row per day → enables custom date filters.
  // date_preset(last_30d) caps the lookback so we don't fetch the whole history.
  const insightFields = `insights.date_preset(last_${SYNC_LOOKBACK_DAYS}d).time_increment(1){date_start,spend,impressions,clicks,actions,purchase_roas,frequency}`;
  const res = await axios.get(`${GRAPH_BASE}/${connection.accountId}/campaigns`, {
    params: {
      access_token: token,
      fields: `id,name,status,created_time,${insightFields}`,
      limit: 100,
    },
  });
  return res.data.data ?? [];
}

/** Extract numeric purchase ROAS from Facebook's nested actions array. */
export function extractPurchaseRoas(insight: FacebookInsight | undefined): number {
  const raw = insight?.purchase_roas?.find((r) => r.action_type === "omni_purchase")?.value
    ?? insight?.purchase_roas?.[0]?.value;
  return raw ? Number(raw) : 0;
}

/** Extract purchase count from the actions array. */
export function extractPurchases(insight: FacebookInsight | undefined): number {
  const raw = insight?.actions?.find((a) => a.action_type === "purchase")?.value;
  return raw ? Number(raw) : 0;
}

/** Pause or resume a Facebook campaign. Requires ads_management scope. */
export async function setCampaignStatus(connection: Connection, externalCampaignId: string, status: "PAUSED" | "ACTIVE"): Promise<void> {
  const token = decrypt(connection.accessToken);
  await axios.post(`${GRAPH_BASE}/${externalCampaignId}`, null, {
    params: { access_token: token, status },
  });
}

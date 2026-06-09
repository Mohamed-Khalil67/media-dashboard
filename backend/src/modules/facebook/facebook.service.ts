import axios from "axios";
import type { Connection } from "@prisma/client";
import { decrypt } from "../../utils/encryption";

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION ?? "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface FacebookInsight {
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
  insights?: { data?: FacebookInsight[] };
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      client_id: process.env.FB_APP_ID,
      client_secret: process.env.FB_APP_SECRET,
      redirect_uri: process.env.FB_REDIRECT_URI,
      code,
    },
  });
  return res.data.access_token as string;
}

export async function listAdAccounts(accessToken: string): Promise<Array<{ id: string; name: string }>> {
  const res = await axios.get(`${GRAPH_BASE}/me/adaccounts`, {
    params: { access_token: accessToken, fields: "id,name" },
  });
  return res.data.data ?? [];
}

export async function fetchCampaigns(connection: Connection): Promise<FacebookCampaign[]> {
  const token = decrypt(connection.accessToken);
  const res = await axios.get(`${GRAPH_BASE}/${connection.accountId}/campaigns`, {
    params: {
      access_token: token,
      fields: "id,name,status,insights.date_preset(last_7d){spend,impressions,clicks,actions,purchase_roas,frequency}",
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

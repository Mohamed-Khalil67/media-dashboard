import type { Connection } from "@prisma/client";
import { decrypt } from "../../utils/encryption";
import { graph, GRAPH_BASE } from "./graph";

export interface FacebookInsight {
  date_start?: string;
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
  created_time?: string;
  insights?: { data?: FacebookInsight[] };
}

export interface AppCredentials {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

/**
 * Exchange the OAuth `code` for a long-lived access token using the
 * user-supplied developer-app credentials (stored on their Connection row).
 */
export async function exchangeCodeForToken(code: string, creds: AppCredentials): Promise<string> {
  const short = await graph.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: { client_id: creds.appId, client_secret: creds.appSecret, redirect_uri: creds.redirectUri, code },
  });
  const long = await graph.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: creds.appId,
      client_secret: creds.appSecret,
      fb_exchange_token: short.data.access_token,
    },
  });
  return long.data.access_token as string;
}

export async function listAdAccounts(accessToken: string): Promise<Array<{ id: string; name: string }>> {
  const res = await graph.get(`${GRAPH_BASE}/me/adaccounts`, {
    params: { access_token: accessToken, fields: "id,name" },
  });
  return res.data.data ?? [];
}

const DEFAULT_LOOKBACK_DAYS = Number(process.env.FB_SYNC_LOOKBACK_DAYS ?? 30);

type CampaignPage = { data: FacebookCampaign[]; paging?: { next?: string } };

export async function fetchCampaigns(connection: Connection): Promise<FacebookCampaign[]> {
  const token = decrypt(connection.accessToken);
  const insightFields = buildInsightFields(connection);
  const campaigns: FacebookCampaign[] = [];

  // First page — explicit params
  const first = await graph.get<CampaignPage>(`${GRAPH_BASE}/${connection.accountId}/campaigns`, {
    params: {
      access_token: token,
      fields: `id,name,status,created_time,${insightFields}`,
      limit: 100,
    },
  });
  campaigns.push(...(first.data.data ?? []));

  // Follow cursor pagination — subsequent page URLs already include all params
  let nextUrl: string | null = first.data.paging?.next ?? null;
  while (nextUrl) {
    const page = await graph.get<CampaignPage>(nextUrl);
    campaigns.push(...(page.data.data ?? []));
    nextUrl = page.data.paging?.next ?? null;
  }

  return campaigns;
}

/**
 * Build the Facebook insights field expression for a sync call.
 *
 * - First sync (no lastSyncAt): fetch from syncSince (or DEFAULT_LOOKBACK_DAYS ago) to today.
 * - Incremental sync: fetch from (lastSyncAt - 2 days) to today.
 *   The 2-day lookback overlap catches delayed conversions that Facebook back-fills.
 *   syncSince acts as a floor — we never go earlier than the user's chosen start.
 *
 * We never use syncUntil as the query end — it was the user's initial import window,
 * not a cap on future syncs. Always end at today so fresh data keeps arriving.
 */
function buildInsightFields(connection: Connection): string {
  const metrics = "date_start,spend,impressions,clicks,actions,purchase_roas,frequency";
  const today = isoDate(new Date());

  let sinceDate: Date;

  if (connection.lastSyncAt) {
    // Incremental: 2-day overlap to catch delayed FB attribution windows.
    sinceDate = new Date(connection.lastSyncAt.getTime() - 2 * 24 * 60 * 60 * 1000);
    // Never go earlier than the user's chosen historical start.
    if (connection.syncSince && sinceDate < connection.syncSince) {
      sinceDate = connection.syncSince;
    }
  } else if (connection.syncSince) {
    sinceDate = connection.syncSince;
  } else {
    sinceDate = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  }

  const since = isoDate(sinceDate);
  return `insights.time_range({since:"${since}",until:"${today}"}).time_increment(1){${metrics}}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function extractPurchaseRoas(insight: FacebookInsight | undefined): number {
  const raw = insight?.purchase_roas?.find((r) => r.action_type === "omni_purchase")?.value
    ?? insight?.purchase_roas?.[0]?.value;
  return raw ? Number(raw) : 0;
}

export function extractPurchases(insight: FacebookInsight | undefined): number {
  const raw = insight?.actions?.find((a) => a.action_type === "purchase")?.value;
  return raw ? Number(raw) : 0;
}

export async function setCampaignStatus(connection: Connection, externalCampaignId: string, status: "PAUSED" | "ACTIVE"): Promise<void> {
  const token = decrypt(connection.accessToken);
  await graph.post(`${GRAPH_BASE}/${externalCampaignId}`, null, {
    params: { access_token: token, status },
  });
}

export async function renameCampaign(connection: Connection, externalCampaignId: string, name: string): Promise<void> {
  const token = decrypt(connection.accessToken);
  await graph.post(`${GRAPH_BASE}/${externalCampaignId}`, null, {
    params: { access_token: token, name },
  });
}

export async function updateCampaignBudget(
  connection: Connection,
  externalCampaignId: string,
  budget: { dailyBudget?: number; lifetimeBudget?: number },
): Promise<void> {
  const token = decrypt(connection.accessToken);
  const params: Record<string, string | number> = { access_token: token };
  if (typeof budget.dailyBudget === "number") {
    params.daily_budget = Math.round(budget.dailyBudget * 100);
  }
  if (typeof budget.lifetimeBudget === "number") {
    params.lifetime_budget = Math.round(budget.lifetimeBudget * 100);
  }
  await graph.post(`${GRAPH_BASE}/${externalCampaignId}`, null, { params });
}

export async function updateCampaignSchedule(
  connection: Connection,
  externalCampaignId: string,
  schedule: { startTime?: string; endTime?: string },
): Promise<void> {
  const token = decrypt(connection.accessToken);
  const params: Record<string, string> = { access_token: token };
  if (schedule.startTime) params.start_time = schedule.startTime;
  if (schedule.endTime) params.stop_time = schedule.endTime;
  await graph.post(`${GRAPH_BASE}/${externalCampaignId}`, null, { params });
}

export async function duplicateCampaign(
  connection: Connection,
  sourceExternalCampaignId: string,
  overrides: {
    name?: string;
    dailyBudget?: number;
    lifetimeBudget?: number;
    startTime?: string;
    endTime?: string;
    startPaused?: boolean;
  } = {},
): Promise<{ newCampaignId: string }> {
  const token = decrypt(connection.accessToken);
  const copyParams: Record<string, string | boolean> = {
    access_token: token,
    deep_copy: false,
    status_option: overrides.startPaused === false ? "ACTIVE" : "PAUSED",
  };
  if (overrides.name) copyParams.rename_options = JSON.stringify({ rename_suffix: "", rename_prefix: "", rename_strategy: "ONLY_TOP_LEVEL_RENAME" });

  const copyRes = await graph.post<{ copied_campaign_id?: string; id?: string }>(
    `${GRAPH_BASE}/${sourceExternalCampaignId}/copies`,
    null,
    { params: copyParams },
  );
  const newCampaignId = copyRes.data.copied_campaign_id ?? copyRes.data.id;
  if (!newCampaignId) {
    throw new Error("Facebook copy response missing copied_campaign_id");
  }

  const patchParams: Record<string, string | number> = { access_token: token };
  if (overrides.name) patchParams.name = overrides.name;
  if (typeof overrides.dailyBudget === "number") patchParams.daily_budget = Math.round(overrides.dailyBudget * 100);
  if (typeof overrides.lifetimeBudget === "number") patchParams.lifetime_budget = Math.round(overrides.lifetimeBudget * 100);
  if (overrides.startTime) patchParams.start_time = overrides.startTime;
  if (overrides.endTime) patchParams.stop_time = overrides.endTime;

  if (Object.keys(patchParams).length > 1) {
    await graph.post(`${GRAPH_BASE}/${newCampaignId}`, null, { params: patchParams });
  }

  return { newCampaignId };
}

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

/** Rename a Facebook campaign. Requires ads_management scope. */
export async function renameCampaign(connection: Connection, externalCampaignId: string, name: string): Promise<void> {
  const token = decrypt(connection.accessToken);
  await axios.post(`${GRAPH_BASE}/${externalCampaignId}`, null, {
    params: { access_token: token, name },
  });
}

/**
 * Update the budget of a Facebook campaign. Pass either `dailyBudget` or
 * `lifetimeBudget` (or both — Graph API will accept and FB only enforces one
 * is active per campaign based on `pacing_type` / `bid_strategy` setup).
 *
 * Values are passed in MAJOR units (e.g. dollars/EGP) and converted to MINOR
 * units (cents/piastres) here, because Graph API budget fields are minor-unit
 * integers. The caller's currency context is the campaign's account currency.
 */
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
  await axios.post(`${GRAPH_BASE}/${externalCampaignId}`, null, { params });
}

/**
 * Update the start / end schedule of a Facebook campaign.
 *
 * Both fields are optional. Values are ISO-8601 strings; Graph API stores
 * Unix timestamps but accepts ISO and converts internally.
 */
export async function updateCampaignSchedule(
  connection: Connection,
  externalCampaignId: string,
  schedule: { startTime?: string; endTime?: string },
): Promise<void> {
  const token = decrypt(connection.accessToken);
  const params: Record<string, string> = { access_token: token };
  if (schedule.startTime) params.start_time = schedule.startTime;
  if (schedule.endTime) params.stop_time = schedule.endTime;
  await axios.post(`${GRAPH_BASE}/${externalCampaignId}`, null, { params });
}

/**
 * Duplicate a Facebook campaign via the Graph `/copies` edge, then optionally
 * apply per-field overrides on the resulting campaign.
 *
 * The shell-only path (no ad-set / ad copying) is used here: it's the fastest
 * to clone and the most common "let me test a variant" workflow. Pass
 * `startPaused: true` (default) to keep the new campaign from spending while
 * the media buyer finishes setting it up.
 *
 * Returns the new campaign's Graph ID so the caller can sync it into the DB.
 */
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

  // Step 1: clone the campaign shell. `deep_copy=false` keeps it shell-only.
  // `status_option=PAUSED` ensures the clone starts paused regardless of source.
  const copyParams: Record<string, string | boolean> = {
    access_token: token,
    deep_copy: false,
    status_option: overrides.startPaused === false ? "ACTIVE" : "PAUSED",
  };
  if (overrides.name) copyParams.rename_options = JSON.stringify({ rename_suffix: "", rename_prefix: "", rename_strategy: "ONLY_TOP_LEVEL_RENAME" });

  const copyRes = await axios.post<{ copied_campaign_id?: string; id?: string }>(
    `${GRAPH_BASE}/${sourceExternalCampaignId}/copies`,
    null,
    { params: copyParams },
  );
  const newCampaignId = copyRes.data.copied_campaign_id ?? copyRes.data.id;
  if (!newCampaignId) {
    throw new Error("Facebook copy response missing copied_campaign_id");
  }

  // Step 2: apply overrides on the new campaign. Run as a single POST so we
  // don't burn extra Graph quota.
  const patchParams: Record<string, string | number> = { access_token: token };
  if (overrides.name) patchParams.name = overrides.name;
  if (typeof overrides.dailyBudget === "number") patchParams.daily_budget = Math.round(overrides.dailyBudget * 100);
  if (typeof overrides.lifetimeBudget === "number") patchParams.lifetime_budget = Math.round(overrides.lifetimeBudget * 100);
  if (overrides.startTime) patchParams.start_time = overrides.startTime;
  if (overrides.endTime) patchParams.stop_time = overrides.endTime;

  // Only fire the second call if there's something to update.
  if (Object.keys(patchParams).length > 1) {
    await axios.post(`${GRAPH_BASE}/${newCampaignId}`, null, { params: patchParams });
  }

  return { newCampaignId };
}

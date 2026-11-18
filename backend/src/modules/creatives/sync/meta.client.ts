import type { AxiosResponse } from "axios";
import type { z } from "zod";
import { graph, GRAPH_BASE } from "../../facebook/graph";
import { logger } from "../../../lib/logger";
import { AccountDetails, AdDetails, AdInsightRow, InsightsPage } from "./meta.schemas";

/**
 * Read-only Meta Marketing API calls for the creative sync. Nothing here
 * writes to Meta: every call is a GET.
 */

/** Stop syncing an account once Meta reports usage above this percentage. */
export const THROTTLE_LIMIT_PCT = 75;

export class ThrottledError extends Error {
  constructor(public readonly utilisation: number) {
    super(`Meta API usage at ${Math.round(utilisation)}%; ad sync paused until the next run`);
    this.name = "ThrottledError";
  }
}

function headerJson(headers: AxiosResponse["headers"], name: string): unknown {
  const raw: unknown = headers[name];
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function numbersIn(value: unknown, keys: readonly string[], out: number[] = []): number[] {
  if (Array.isArray(value)) {
    for (const v of value) numbersIn(v, keys, out);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (keys.includes(k) && typeof v === "number") out.push(v);
      else numbersIn(v, keys, out);
    }
  }
  return out;
}

/**
 * Highest utilisation percentage across Meta's rate-limit headers
 * (`x-fb-ads-insights-throttle`, `x-business-use-case-usage`, `x-app-usage`).
 */
export function maxUtilisation(headers: AxiosResponse["headers"]): number {
  const values = [
    ...numbersIn(headerJson(headers, "x-fb-ads-insights-throttle"), ["app_id_util_pct", "acc_id_util_pct"]),
    ...numbersIn(headerJson(headers, "x-business-use-case-usage"), ["call_count", "total_cputime", "total_time"]),
    ...numbersIn(headerJson(headers, "x-app-usage"), ["call_count", "total_cputime", "total_time"]),
  ];
  return values.length > 0 ? Math.max(...values) : 0;
}

async function get(url: string, params?: Record<string, string | number>): Promise<AxiosResponse<unknown>> {
  const res = await graph.get<unknown>(url, params ? { params } : undefined);
  const util = maxUtilisation(res.headers);
  if (util >= THROTTLE_LIMIT_PCT) throw new ThrottledError(util);
  return res;
}

/** Parse each row; log and skip rows that don't match instead of failing the sync. */
function parseRows<T extends z.ZodType>(schema: T, rows: readonly unknown[], context: string): z.infer<T>[] {
  const out: z.infer<T>[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
    else logger.warn({ context, issues: parsed.error.issues.slice(0, 3) }, "skipping Meta row that failed validation");
  }
  return out;
}

const MAX_PAGES = 50;

/** GET an insights edge and follow cursor pagination. */
export async function fetchInsights(
  accountId: string,
  token: string,
  params: Record<string, string | number>,
): Promise<AdInsightRow[]> {
  const rows: AdInsightRow[] = [];
  let res = await get(`${GRAPH_BASE}/${accountId}/insights`, { access_token: token, limit: 500, ...params });
  for (let page = 0; page < MAX_PAGES; page++) {
    const parsed = InsightsPage.parse(res.data);
    rows.push(...parseRows(AdInsightRow, parsed.data, "insights"));
    const next = parsed.paging?.next;
    if (!next) break;
    res = await get(next);
  }
  return rows;
}

const AD_FIELDS = [
  "id",
  "name",
  "effective_status",
  "created_time",
  "issues_info{error_summary,error_message}",
  "ad_review_feedback",
  "adset{id,name,effective_status,optimization_goal,daily_budget,lifetime_budget,learning_stage_info{status}}",
  "campaign{id,name,status,objective}",
  "creative{id,object_type,video_id,thumbnail_url,asset_feed_spec{videos},object_story_spec{video_data{video_id},link_data{child_attachments}}}",
].join(",");

/**
 * Ad details for the given ad ids, 50 at a time, via the account's ads edge
 * filtered by id. (`GET /?ids=…` is deprecated from v26.0.)
 *
 * Video length is not fetched: reading a video node needs Page permissions an
 * ads token doesn't have (#10), so the engine works with length unknown.
 */
export async function fetchAdDetails(accountId: string, adIds: readonly string[], token: string): Promise<AdDetails[]> {
  const out: AdDetails[] = [];
  for (let i = 0; i < adIds.length; i += 50) {
    const chunk = adIds.slice(i, i + 50);
    const res = await get(`${GRAPH_BASE}/${accountId}/ads`, {
      access_token: token,
      fields: AD_FIELDS,
      filtering: JSON.stringify([{ field: "id", operator: "IN", value: chunk }]),
      thumbnail_width: 480,
      thumbnail_height: 480,
      limit: 50,
    });
    out.push(...parseRows(AdDetails, InsightsPage.parse(res.data).data, "ads"));
  }
  return out;
}

export async function fetchAccountCurrency(accountId: string, token: string): Promise<string | null> {
  const res = await get(`${GRAPH_BASE}/${accountId}`, { fields: "currency", access_token: token });
  return AccountDetails.parse(res.data).currency ?? null;
}

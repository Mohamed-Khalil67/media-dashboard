import axios from "axios";
import type { AxiosResponse } from "axios";
import { logger } from "../../lib/logger";

/**
 * Single source of truth for the Meta Graph / Marketing API version.
 *
 * Meta retires each version roughly a year after release (v21.0 expired
 * 2025-09-09, v24.0 expires 2026-11-10). Calls to an expired version are either
 * auto-upgraded with an `X-Ad-Api-Version-Warning` header or fail outright, so
 * bump this default before the pinned version's expiry date:
 * https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/versions.md
 *
 * 2026-11-06: live calls pinned to v25.0 came back with "auto-upgraded to
 * v27.0 as v25.0 will be deprecated", so the pin follows what Meta serves.
 */
export const DEFAULT_GRAPH_VERSION = "v27.0";

const VERSION_PATTERN = /^v\d+\.\d+$/;

/** Resolve the version from an env value, falling back to the default when unset or malformed. */
export function resolveGraphVersion(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return DEFAULT_GRAPH_VERSION;
  if (!VERSION_PATTERN.test(value)) {
    logger.warn({ value, fallback: DEFAULT_GRAPH_VERSION }, "invalid FB_GRAPH_VERSION, using default");
    return DEFAULT_GRAPH_VERSION;
  }
  return value;
}

export const GRAPH_VERSION = resolveGraphVersion(process.env.FB_GRAPH_VERSION);
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const OAUTH_DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

type ResponseHeaders = AxiosResponse["headers"];

function headerString(headers: ResponseHeaders, name: string): string | undefined {
  const value: unknown = headers[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const reported = new Set<string>();

/**
 * Log (once per distinct message) when Meta reports that it served a request
 * with a different API version than we asked for — the early signal that the
 * pinned version is expiring or has expired.
 */
export function reportVersionDrift(headers: ResponseHeaders, requested: string = GRAPH_VERSION): void {
  const warning = headerString(headers, "x-ad-api-version-warning");
  const served = headerString(headers, "facebook-api-version");
  const drifted = served !== undefined && served !== requested;
  if (!warning && !drifted) return;

  const key = `${requested}|${served ?? ""}|${warning ?? ""}`;
  if (reported.has(key)) return;
  reported.add(key);

  logger.warn(
    { requested, served, warning },
    "Meta served a different Graph API version than requested; bump DEFAULT_GRAPH_VERSION",
  );
}

/** Test hook: forget which drift warnings were already logged. */
export function resetVersionDriftReports(): void {
  reported.clear();
}

/** Axios instance for every Graph API call; checks each response for version drift. */
export const graph = axios.create();

graph.interceptors.response.use(
  (response) => {
    reportVersionDrift(response.headers);
    return response;
  },
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response) {
      reportVersionDrift(error.response.headers);
    }
    return Promise.reject(error);
  },
);

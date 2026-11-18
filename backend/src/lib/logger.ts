import axios from "axios";
import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

/** Drop the query string: Graph GETs carry `access_token` / `client_secret` there. */
function stripQuery(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/**
 * Axios errors carry the full request (`config.params`, `config.data`, headers),
 * which holds Meta/Shopify app secrets, OAuth codes and access tokens. Log only
 * what helps debugging: status, method, path and the provider's error body.
 */
export function serializeErr(err: unknown): unknown {
  if (axios.isAxiosError(err)) {
    return {
      type: "AxiosError",
      message: err.message,
      code: err.code,
      status: err.response?.status,
      method: err.config?.method,
      url: stripQuery(err.config?.url),
      data: err.response?.data,
      stack: err.stack,
    };
  }
  return err instanceof Error ? pino.stdSerializers.err(err) : err;
}

/** Last line of defence for secrets logged by key outside an error. */
export const REDACT_PATHS = [
  "access_token",
  "*.access_token",
  "client_secret",
  "*.client_secret",
  "appSecret",
  "*.appSecret",
  "accessToken",
  "*.accessToken",
  "req.headers.authorization",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  base: { service: "media-dashboard-api" },
  serializers: { err: serializeErr },
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  // Pretty-print in dev for readability; raw ndjson in prod for log aggregation.
  transport: !isProd
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,service" },
      }
    : undefined,
});

import cron from "node-cron";
import type { Connection } from "@prisma/client";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { runRetentionSweep } from "./retention.job";
import { syncFacebook, isAuthError, describeSyncError } from "./sync.facebook";
import { syncShopify } from "./sync.shopify";
import { maybeSyncFacebookAds } from "./sync.facebook.ads";

// Default: every 2 minutes — the SaaS pivot promised near-realtime refresh.
const SCHEDULE = process.env.SYNC_CRON ?? "*/2 * * * *";
const RETENTION_SCHEDULE = process.env.RETENTION_CRON ?? "0 3 * * *";
const ACTIVITY_WINDOW_MINUTES = Number(process.env.ACTIVITY_WINDOW_MINUTES ?? 30);
const ACTIVITY_WINDOW_MS = ACTIVITY_WINDOW_MINUTES * 60 * 1000;
// Skip a connection if it was synced within this many seconds — prevents the
// 2-minute cron from re-syncing already-fresh data and burning API quota.
const COOLDOWN_SECONDS = Number(process.env.SYNC_COOLDOWN_SECONDS ?? 90);

export interface SyncResult {
  connectionId: string;
  platform: string;
  ok: boolean;
  details?: object;
  error?: string;
}

interface SyncContextLog {
  reason?: string;
}

/**
 * Run sync for every active connection whose OWNING USER has been active
 * within ACTIVITY_WINDOW_MINUTES. Skipping idle users avoids burning external
 * API quota and DB growth when nobody is looking at the dashboard.
 *
 * Pass `{ force: true }` to bypass the activity gate (used by manual sync
 * endpoints and one-off scripts).
 */
export async function runAllConnections(opts: { force?: boolean } = {}): Promise<SyncResult[]> {
  const where: { status: string; user?: { lastActiveAt: { gte: Date } } } = { status: "active" };
  if (!opts.force) {
    where.user = { lastActiveAt: { gte: new Date(Date.now() - ACTIVITY_WINDOW_MS) } };
  }
  const connections = await prisma.connection.findMany({ where });
  const eligible = opts.force ? connections : connections.filter(notRecentlySynced);
  return syncConnectionList(eligible);
}

/**
 * Sync every active connection for a single user. Used by manual endpoints
 * and the post-login refresh. Always force-bypasses the activity gate.
 */
export async function syncUserConnections(
  userId: string,
  ctx: SyncContextLog = {},
): Promise<SyncResult[]> {
  const connections = await prisma.connection.findMany({ where: { userId, status: "active" } });
  if (connections.length === 0) return [];
  logger.info({ userId, count: connections.length, ...ctx }, "syncing connections for user");
  return syncConnectionList(connections);
}

function notRecentlySynced(c: Connection): boolean {
  if (!c.lastSyncAt) return true;
  return Date.now() - c.lastSyncAt.getTime() > COOLDOWN_SECONDS * 1000;
}

async function syncConnectionList(connections: Connection[]): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const conn of connections) {
    const result = await syncSingle(conn);
    results.push(result);
  }
  return results;
}

async function syncSingle(conn: Connection): Promise<SyncResult> {
  const run = await prisma.syncRun.create({ data: { connectionId: conn.id } });
  const log = logger.child({ connectionId: conn.id, platform: conn.platform, accountId: conn.accountId });
  try {
    let details: { campaigns?: number; days?: number; orders?: number } | undefined;
    if (conn.platform === "facebook") details = await syncFacebook(conn);
    else if (conn.platform === "shopify") details = await syncShopify(conn);

    const finishedAt = new Date();
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { finishedAt, ok: true, campaignCount: details?.campaigns ?? null, insightCount: details?.days ?? null },
    });
    await prisma.connection.update({
      where: { id: conn.id },
      data: { lastSyncAt: finishedAt, lastSyncOk: true, lastSyncError: null },
    });
    log.info({ details, durationMs: finishedAt.getTime() - run.startedAt.getTime() }, "sync ok");
    // Ad-level creative data: throttled to every AD_SYNC_INTERVAL_MINUTES, never throws.
    if (conn.platform === "facebook") await maybeSyncFacebookAds(conn);
    return { connectionId: conn.id, platform: conn.platform, ok: true, details };
  } catch (err) {
    const message = describeSyncError(err);
    const expired = isAuthError(err);
    const finishedAt = new Date();
    await prisma.syncRun.update({ where: { id: run.id }, data: { finishedAt, ok: false, error: message } });
    await prisma.connection.update({
      where: { id: conn.id },
      data: {
        lastSyncAt: finishedAt,
        lastSyncOk: false,
        lastSyncError: message,
        ...(expired ? { status: "expired" } : {}),
      },
    });
    log.error({ err, expired, durationMs: finishedAt.getTime() - run.startedAt.getTime() }, "sync failed");
    return { connectionId: conn.id, platform: conn.platform, ok: false, error: message };
  }
}

export function startSyncJobs(): void {
  if (!cron.validate(SCHEDULE)) {
    throw new Error(`Invalid SYNC_CRON expression: ${SCHEDULE}`);
  }
  if (!cron.validate(RETENTION_SCHEDULE)) {
    throw new Error(`Invalid RETENTION_CRON expression: ${RETENTION_SCHEDULE}`);
  }

  cron.schedule(SCHEDULE, async () => {
    const t0 = Date.now();
    const results = await runAllConnections();
    const ok = results.filter((r) => r.ok).length;
    logger.info({ ok, total: results.length, durationMs: Date.now() - t0, gated: true }, "sync cycle complete");
  });
  logger.info({ schedule: SCHEDULE, activityWindowMinutes: ACTIVITY_WINDOW_MINUTES }, "sync cron scheduled");

  cron.schedule(RETENTION_SCHEDULE, async () => {
    try {
      await runRetentionSweep();
    } catch (err) {
      logger.error({ err }, "retention sweep failed");
    }
  });
  logger.info({ schedule: RETENTION_SCHEDULE }, "retention cron scheduled");
}

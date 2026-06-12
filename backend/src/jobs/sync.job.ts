import cron from "node-cron";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { syncFacebook, isAuthError, describeSyncError } from "./sync.facebook";
import { syncShopify } from "./sync.shopify";
import { syncTiktok } from "./sync.tiktok";

const SCHEDULE = process.env.SYNC_CRON ?? "*/30 * * * *";

export interface SyncResult {
  connectionId: string;
  platform: string;
  ok: boolean;
  details?: object;
  error?: string;
}

/** Run sync for every active connection. Failures are isolated per connection. */
export async function runAllConnections(): Promise<SyncResult[]> {
  const connections = await prisma.connection.findMany({ where: { status: "active" } });
  const results: SyncResult[] = [];

  for (const conn of connections) {
    const run = await prisma.syncRun.create({
      data: { connectionId: conn.id },
    });
    const log = logger.child({ connectionId: conn.id, platform: conn.platform, accountId: conn.accountId });

    try {
      let details: { campaigns?: number; days?: number; orders?: number } | undefined;
      if (conn.platform === "facebook") details = await syncFacebook(conn);
      else if (conn.platform === "shopify") details = await syncShopify(conn);
      else if (conn.platform === "tiktok") details = await syncTiktok(conn);

      const finishedAt = new Date();
      await prisma.syncRun.update({
        where: { id: run.id },
        data: {
          finishedAt,
          ok: true,
          campaignCount: details?.campaigns ?? null,
          insightCount: details?.days ?? null,
        },
      });
      await prisma.connection.update({
        where: { id: conn.id },
        data: { lastSyncAt: finishedAt, lastSyncOk: true, lastSyncError: null },
      });

      log.info({ details, durationMs: finishedAt.getTime() - run.startedAt.getTime() }, "sync ok");
      results.push({ connectionId: conn.id, platform: conn.platform, ok: true, details });
    } catch (err) {
      const message = describeSyncError(err);
      const expired = isAuthError(err);
      const finishedAt = new Date();

      await prisma.syncRun.update({
        where: { id: run.id },
        data: { finishedAt, ok: false, error: message },
      });
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
      results.push({ connectionId: conn.id, platform: conn.platform, ok: false, error: message });
    }
  }

  return results;
}

export function startSyncJobs(): void {
  if (!cron.validate(SCHEDULE)) {
    throw new Error(`Invalid SYNC_CRON expression: ${SCHEDULE}`);
  }
  cron.schedule(SCHEDULE, async () => {
    const t0 = Date.now();
    const results = await runAllConnections();
    const ok = results.filter((r) => r.ok).length;
    logger.info({ ok, total: results.length, durationMs: Date.now() - t0 }, "sync cycle complete");
  });
  logger.info({ schedule: SCHEDULE }, "sync cron scheduled");
}

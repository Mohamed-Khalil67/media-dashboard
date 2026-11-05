import { prisma } from "../../db/client";
import { syncFacebook, isAuthError, describeSyncError } from "../../jobs/sync.facebook";
import { syncShopify } from "../../jobs/sync.shopify";
import { logger } from "../../lib/logger";
import { SyncResultDto } from "./dto/sync.dto";

export class SyncService {
  async runUserConnections(
    userId: string,
    platformFilter?: string
  ): Promise<SyncResultDto[]> {
    const where: Record<string, unknown> = { userId, status: "active" };
    if (platformFilter) where.platform = platformFilter;
    const connections = await prisma.connection.findMany({ where });

    const results: SyncResultDto[] = [];
    for (const conn of connections) {
      const run = await prisma.syncRun.create({ data: { connectionId: conn.id } });
      const log = logger.child({
        connectionId: conn.id,
        platform: conn.platform,
        accountId: conn.accountId,
        manual: true,
      });

      try {
        let details: { campaigns?: number; days?: number; orders?: number } | undefined;
        if (conn.platform === "facebook") details = await syncFacebook(conn);
        else if (conn.platform === "shopify") details = await syncShopify(conn);

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
        log.info({ details }, "manual sync ok");
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
        log.error({ err, expired }, "manual sync failed");
        results.push({ connectionId: conn.id, platform: conn.platform, ok: false, error: message });
      }
    }
    return results;
  }
}

export const syncService = new SyncService();

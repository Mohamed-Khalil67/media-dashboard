import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { prisma } from "../../db/client";
import { runAllConnections } from "../../jobs/sync.job";
import { syncFacebook, isAuthError, describeSyncError } from "../../jobs/sync.facebook";
import { syncShopify } from "../../jobs/sync.shopify";
import { logger } from "../../lib/logger";

const router = Router();

router.use(requireAuth);

/** Trigger sync for the caller's active connections, optionally filtered by platform. */
router.post("/run", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const platformRaw = typeof req.query.platform === "string" ? req.query.platform : undefined;
  const platform = platformRaw && ["facebook", "shopify"].includes(platformRaw) ? platformRaw : undefined;

  const where: Record<string, unknown> = { userId, status: "active" };
  if (platform) where.platform = platform;
  const connections = await prisma.connection.findMany({ where });

  const results = [];
  for (const conn of connections) {
    const run = await prisma.syncRun.create({ data: { connectionId: conn.id } });
    const log = logger.child({ connectionId: conn.id, platform: conn.platform, accountId: conn.accountId, manual: true });
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
      log.info({ details }, "manual sync ok");
      results.push({ connectionId: conn.id, platform: conn.platform, ok: true, details });
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
      log.error({ err, expired }, "manual sync failed");
      results.push({ connectionId: conn.id, platform: conn.platform, ok: false, error: message });
    }
  }

  res.json({ ranAt: new Date().toISOString(), results });
});

/** Dev-only helper: trigger sync for ALL active users' connections. Gated to non-prod. */
router.post("/run-all", async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Disabled in production" });
  }
  const results = await runAllConnections({ force: true });
  res.json({ ranAt: new Date().toISOString(), results });
});

export default router;

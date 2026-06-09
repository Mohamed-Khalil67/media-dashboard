import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { prisma } from "../../db/client";
import { runAllConnections } from "../../jobs/sync.job";
import { syncFacebook, isAuthError } from "../../jobs/sync.facebook";
import { syncShopify } from "../../jobs/sync.shopify";
import { syncTiktok } from "../../jobs/sync.tiktok";

const router = Router();

router.use(requireAuth);

/** Trigger sync for the calling user's active connections, optionally filtered by platform. */
router.post("/run", async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const platformRaw = typeof req.query.platform === "string" ? req.query.platform : undefined;
  const platform = platformRaw && ["facebook", "tiktok", "shopify"].includes(platformRaw) ? platformRaw : undefined;

  const where: Record<string, unknown> = { userId, status: "active" };
  if (platform) where.platform = platform;
  const connections = await prisma.connection.findMany({ where });

  const results = [];
  for (const conn of connections) {
    try {
      let details: object | undefined;
      if (conn.platform === "facebook") details = await syncFacebook(conn);
      else if (conn.platform === "shopify") details = await syncShopify(conn);
      else if (conn.platform === "tiktok") details = await syncTiktok(conn);
      results.push({ connectionId: conn.id, platform: conn.platform, ok: true, details });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isAuthError(err)) {
        await prisma.connection.update({ where: { id: conn.id }, data: { status: "expired" } });
      }
      results.push({ connectionId: conn.id, platform: conn.platform, ok: false, error: message });
    }
  }

  res.json({ ranAt: new Date().toISOString(), results });
});

/** Admin-only: trigger sync for ALL users. Gate this in production. */
router.post("/run-all", async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Disabled in production" });
  }
  const results = await runAllConnections();
  res.json({ ranAt: new Date().toISOString(), results });
});

export default router;

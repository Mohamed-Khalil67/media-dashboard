import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { runAllConnections } from "../../jobs/sync.job";
import { syncService } from "./sync.service";

const router = Router();

router.use(requireAuth);

/** Trigger sync for the caller's active connections, optionally filtered by platform. */
router.post("/run", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const platformRaw = typeof req.query.platform === "string" ? req.query.platform : undefined;
  const platform = platformRaw && ["facebook", "shopify"].includes(platformRaw) ? platformRaw : undefined;

  const results = await syncService.runUserConnections(userId, platform);
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

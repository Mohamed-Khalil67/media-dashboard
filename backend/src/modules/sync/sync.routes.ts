import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { runAllConnections } from "../../jobs/sync.job";
import { syncService } from "./sync.service";

const router = Router();

router.use(requireAuth);

/** Trigger sync for the caller's active connections, optionally filtered by platform. */
router.post("/run", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const query = SyncRunQuery.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: "platform must be facebook or shopify" });
  }

  const outcome = await syncService.runUserConnections(userId, query.data.platform);
  switch (outcome.kind) {
    case "ok":
      return res.json({ ranAt: new Date().toISOString(), results: outcome.results });
    case "busy":
      return res.status(429).json({ error: "sync_in_progress", message: "A sync is already running. Wait for it to finish." });
    case "cooldown":
      res.setHeader("Retry-After", String(outcome.retryAfterSeconds));
      return res.status(429).json({
        error: "sync_cooldown",
        message: `Synced moments ago. Try again in ${outcome.retryAfterSeconds} seconds.`,
        retryAfterSeconds: outcome.retryAfterSeconds,
      });
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
});

const SyncRunQuery = z.object({ platform: z.enum(["facebook", "shopify"]).optional() });

/** Dev-only helper: trigger sync for ALL active users' connections. Gated to non-prod. */
router.post("/run-all", async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Disabled in production" });
  }
  const results = await runAllConnections({ force: true });
  res.json({ ranAt: new Date().toISOString(), results });
});

export default router;

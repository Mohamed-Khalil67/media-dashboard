import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { getCampaignAggregates, getOverview, getTimeseries } from "./metrics.service";

const router = Router();

router.use(requireAuth);

function range(req: Request): string {
  const r = String(req.query.range ?? "7d");
  return ["7d", "14d", "30d"].includes(r) ? r : "7d";
}

router.get("/overview", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  res.json(await getOverview(userId, range(req)));
});

router.get("/timeseries", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  res.json({ points: await getTimeseries(userId, range(req)) });
});

router.get("/campaigns", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  res.json({ campaigns: await getCampaignAggregates(userId, range(req)) });
});

export default router;

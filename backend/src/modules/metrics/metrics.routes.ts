import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import {
  getCampaignAggregates,
  getOverview,
  getTimeseries,
  getShopifyOverview,
  getShopifyTimeseries,
} from "./metrics.service";

const router = Router();

router.use(requireAuth);

function range(req: Request): string {
  const r = String(req.query.range ?? "7d");
  return ["7d", "14d", "30d"].includes(r) ? r : "7d";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function dateParam(req: Request, key: string): string | undefined {
  const v = req.query[key];
  if (typeof v !== "string" || !ISO_DATE.test(v)) return undefined;
  return v;
}

function connId(req: Request): string | undefined {
  return req.query.connectionId ? String(req.query.connectionId) : undefined;
}

const ALLOWED_PLATFORMS = ["facebook", "tiktok"] as const;
function platform(req: Request): string | undefined {
  const v = req.query.platform;
  if (typeof v !== "string") return undefined;
  return (ALLOWED_PLATFORMS as readonly string[]).includes(v) ? v : undefined;
}

router.get("/overview", async (req, res: Response) => {
  const workspaceId = (req as AuthedRequest).workspaceId;
  res.json(await getOverview(workspaceId, range(req), dateParam(req, "since"), dateParam(req, "until"), connId(req), platform(req)));
});

router.get("/timeseries", async (req, res: Response) => {
  const workspaceId = (req as AuthedRequest).workspaceId;
  res.json({ points: await getTimeseries(workspaceId, range(req), connId(req), dateParam(req, "since"), dateParam(req, "until"), platform(req)) });
});

router.get("/campaigns", async (req, res: Response) => {
  const workspaceId = (req as AuthedRequest).workspaceId;
  res.json({ campaigns: await getCampaignAggregates(workspaceId, range(req), dateParam(req, "since"), dateParam(req, "until"), connId(req), platform(req)) });
});

router.get("/shopify/overview", async (req, res: Response) => {
  const workspaceId = (req as AuthedRequest).workspaceId;
  res.json(await getShopifyOverview(workspaceId, range(req), dateParam(req, "since"), dateParam(req, "until"), connId(req)));
});

router.get("/shopify/timeseries", async (req, res: Response) => {
  const workspaceId = (req as AuthedRequest).workspaceId;
  res.json({ points: await getShopifyTimeseries(workspaceId, range(req), dateParam(req, "since"), dateParam(req, "until"), connId(req)) });
});

export default router;

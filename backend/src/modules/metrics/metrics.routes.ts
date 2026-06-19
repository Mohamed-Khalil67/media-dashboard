import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import {
  getCampaignAggregates,
  getOverview,
  getTimeseries,
  getShopifyOverview,
  getShopifyTimeseries,
  getShopifyOrdersList,
  getShopifyOrderDetail,
  getShopifyTopProducts,
  getShopifyTopCustomers,
  getShopifyOrdersSummary,
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

const ALLOWED_PLATFORMS = ["facebook"] as const;
function platform(req: Request): string | undefined {
  const v = req.query.platform;
  if (typeof v !== "string") return undefined;
  return (ALLOWED_PLATFORMS as readonly string[]).includes(v) ? v : undefined;
}

router.get("/overview", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  res.json(await getOverview(userId, range(req), dateParam(req, "since"), dateParam(req, "until"), connId(req), platform(req)));
});

router.get("/timeseries", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  res.json({ points: await getTimeseries(userId, range(req), connId(req), dateParam(req, "since"), dateParam(req, "until"), platform(req)) });
});

router.get("/campaigns", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  res.json({ campaigns: await getCampaignAggregates(userId, range(req), dateParam(req, "since"), dateParam(req, "until"), connId(req), platform(req)) });
});

router.get("/shopify/overview", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  res.json(await getShopifyOverview(userId, range(req), dateParam(req, "since"), dateParam(req, "until"), connId(req)));
});

router.get("/shopify/timeseries", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  res.json({ points: await getShopifyTimeseries(userId, range(req), dateParam(req, "since"), dateParam(req, "until"), connId(req)) });
});

const ALLOWED_FINANCIAL_STATUSES = ["paid", "pending", "refunded", "partially_refunded", "voided", "authorized"] as const;

router.get("/shopify/orders", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 200);
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
  const financialStatus = statusRaw && (ALLOWED_FINANCIAL_STATUSES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : undefined;

  res.json(await getShopifyOrdersList(userId, {
    connectionId: connId(req),
    financialStatus,
    q: q || undefined,
    limit,
    cursor,
  }));
});

router.get("/shopify/orders/:id", async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const id = String(req.params.id);
  const row = await getShopifyOrderDetail(userId, id);
  if (!row) return res.status(404).json({ error: "Order not found" });
  res.json(row);
});

function topLimit(req: Request): number {
  const n = Number(req.query.limit ?? 10);
  if (!Number.isFinite(n)) return 10;
  return Math.min(Math.max(Math.round(n), 1), 50);
}

router.get("/shopify/top-products", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  res.json({
    products: await getShopifyTopProducts(
      userId, range(req), dateParam(req, "since"), dateParam(req, "until"),
      connId(req), topLimit(req),
    ),
  });
});

router.get("/shopify/orders-summary", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  res.json(await getShopifyOrdersSummary(userId, {
    connectionId: connId(req),
    sinceISO: dateParam(req, "since"),
    untilISO: dateParam(req, "until"),
  }));
});

router.get("/shopify/top-customers", async (req, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  res.json({
    customers: await getShopifyTopCustomers(
      userId, range(req), dateParam(req, "since"), dateParam(req, "until"),
      connId(req), topLimit(req),
    ),
  });
});

export default router;

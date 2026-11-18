import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import {
  evaluateAlerts,
  listAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  isSupportedMetric,
  isSupportedOperator,
} from "./alerts.service";

const router = Router();
router.use(requireAuth);

/** Evaluated alerts derived from the user's rules and latest campaign data. */
router.get("/", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const connectionId = req.query.connectionId ? String(req.query.connectionId) : undefined;
  const platformRaw = typeof req.query.platform === "string" ? req.query.platform : undefined;
  const platform = platformRaw === "facebook" ? platformRaw : undefined;
  const alerts = await evaluateAlerts(userId, connectionId, platform);
  res.json({ alerts });
});

router.get("/rules", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const rules = await listAlertRules(userId);
  res.json({ rules });
});

router.post("/rules", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const { metric, operator, threshold } = req.body ?? {};
  if (!isSupportedMetric(metric) || !isSupportedOperator(operator) || typeof threshold !== "number") {
    return res.status(400).json({ error: "metric, operator, and numeric threshold are required" });
  }
  const rule = await createAlertRule(userId, { metric, operator, threshold });
  res.status(201).json({ rule });
});

router.patch("/rules/:id", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const id = String(req.params.id);
  const { threshold, enabled, operator } = req.body ?? {};

  if (operator !== undefined && !isSupportedOperator(operator)) {
    return res.status(400).json({ error: "Invalid operator" });
  }

  const rule = await updateAlertRule(userId, id, {
    ...(typeof threshold === "number" ? { threshold } : {}),
    ...(typeof enabled === "boolean" ? { enabled } : {}),
    ...(operator ? { operator } : {}),
  });

  if (!rule) return res.status(404).json({ error: "Rule not found" });
  res.json({ rule });
});

router.delete("/rules/:id", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const id = String(req.params.id);
  const deleted = await deleteAlertRule(userId, id);
  if (!deleted) return res.status(404).json({ error: "Rule not found" });
  res.json({ ok: true });
});

export default router;

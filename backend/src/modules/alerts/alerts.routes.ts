import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { prisma } from "../../db/client";
import {
  evaluateAlerts,
  isSupportedMetric,
  isSupportedOperator,
} from "./alerts.service";

const router = Router();
router.use(requireAuth);

/** Evaluated alerts derived from the user's rules and latest campaign data. */
router.get("/", async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const alerts = await evaluateAlerts(userId);
  res.json({ alerts });
});

/** List the user's configured rules. */
router.get("/rules", async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const rules = await prisma.alertRule.findMany({
    where: { userId },
    orderBy: { metric: "asc" },
  });
  res.json({ rules });
});

/** Create a new rule. */
router.post("/rules", async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const { metric, operator, threshold } = req.body ?? {};
  if (!isSupportedMetric(metric) || !isSupportedOperator(operator) || typeof threshold !== "number") {
    return res.status(400).json({ error: "metric, operator, and numeric threshold are required" });
  }
  const rule = await prisma.alertRule.create({
    data: { userId, metric, operator, threshold, enabled: true },
  });
  res.status(201).json({ rule });
});

/** Update threshold or enabled flag. */
router.patch("/rules/:id", async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const id = String(req.params.id);
  const { threshold, enabled, operator } = req.body ?? {};

  const existing = await prisma.alertRule.findFirst({ where: { id, userId } });
  if (!existing) return res.status(404).json({ error: "Rule not found" });

  if (operator !== undefined && !isSupportedOperator(operator)) {
    return res.status(400).json({ error: "Invalid operator" });
  }

  const rule = await prisma.alertRule.update({
    where: { id },
    data: {
      ...(typeof threshold === "number" ? { threshold } : {}),
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(operator ? { operator } : {}),
    },
  });
  res.json({ rule });
});

router.delete("/rules/:id", async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const id = String(req.params.id);
  const existing = await prisma.alertRule.findFirst({ where: { id, userId } });
  if (!existing) return res.status(404).json({ error: "Rule not found" });
  await prisma.alertRule.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;

import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import { prisma } from "../../db/client";
import {
  evaluateAlerts,
  isSupportedMetric,
  isSupportedOperator,
} from "./alerts.service";

const router = Router();
router.use(requireAuth);

// Only media buyers can mutate alert rules. Clients are strictly read-only,
// admins manage users not data.
const mutateGate = requireRole("media_buyer");

/** Evaluated alerts derived from the workspace's rules and latest campaign data. */
router.get("/", async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const connectionId = req.query.connectionId ? String(req.query.connectionId) : undefined;
  const platformRaw = typeof req.query.platform === "string" ? req.query.platform : undefined;
  const platform = platformRaw && ["facebook", "tiktok"].includes(platformRaw) ? platformRaw : undefined;
  const alerts = await evaluateAlerts(workspaceId, connectionId, platform);
  res.json({ alerts });
});

/** List the workspace's configured rules. */
router.get("/rules", async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const rules = await prisma.alertRule.findMany({
    where: { workspaceId },
    orderBy: { metric: "asc" },
  });
  res.json({ rules });
});

/** Create a new rule. */
router.post("/rules", mutateGate, async (req: Request, res: Response) => {
  const { workspaceId, userId } = req as AuthedRequest;
  const { metric, operator, threshold } = req.body ?? {};
  if (!isSupportedMetric(metric) || !isSupportedOperator(operator) || typeof threshold !== "number") {
    return res.status(400).json({ error: "metric, operator, and numeric threshold are required" });
  }
  const rule = await prisma.alertRule.create({
    data: { workspaceId, userId, metric, operator, threshold, enabled: true },
  });
  res.status(201).json({ rule });
});

/** Update threshold or enabled flag. */
router.patch("/rules/:id", mutateGate, async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const id = String(req.params.id);
  const { threshold, enabled, operator } = req.body ?? {};

  const existing = await prisma.alertRule.findFirst({ where: { id, workspaceId } });
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

router.delete("/rules/:id", mutateGate, async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const id = String(req.params.id);
  const existing = await prisma.alertRule.findFirst({ where: { id, workspaceId } });
  if (!existing) return res.status(404).json({ error: "Rule not found" });
  await prisma.alertRule.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;

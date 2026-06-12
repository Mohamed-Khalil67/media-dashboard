import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";
import { requireAuth, AuthedRequest } from "../../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const connections = await prisma.connection.findMany({
    where: { workspaceId },
    select: {
      id: true,
      platform: true,
      accountId: true,
      accountName: true,
      status: true,
      createdAt: true,
      tokenExpiresAt: true,
      lastSyncAt: true,
      lastSyncOk: true,
      lastSyncError: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ connections });
});

router.get("/:id/syncs", async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const id = String(req.params.id);

  const connection = await prisma.connection.findFirst({ where: { id, workspaceId } });
  if (!connection) return res.status(404).json({ error: "Connection not found" });

  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  const runs = await prisma.syncRun.findMany({
    where: { connectionId: id },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      startedAt: true,
      finishedAt: true,
      ok: true,
      error: true,
      campaignCount: true,
      insightCount: true,
    },
  });
  res.json({ runs });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { workspaceId } = req as AuthedRequest;
  const id = String(req.params.id);

  const connection = await prisma.connection.findFirst({ where: { id, workspaceId } });
  if (!connection) return res.status(404).json({ error: "Connection not found" });

  await prisma.connection.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;

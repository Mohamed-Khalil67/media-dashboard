import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";
import { requireAuth, AuthedRequest } from "../../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const connections = await prisma.connection.findMany({
    where: { userId },
    select: {
      id: true,
      platform: true,
      accountId: true,
      accountName: true,
      status: true,
      createdAt: true,
      tokenExpiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ connections });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const id = String(req.params.id);

  const connection = await prisma.connection.findFirst({ where: { id, userId } });
  if (!connection) return res.status(404).json({ error: "Connection not found" });

  await prisma.connection.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;

import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { connectionsService } from "./connections.service";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const connections = await connectionsService.listConnections(userId);
  res.json({ connections });
});

router.get("/:id/syncs", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const id = String(req.params.id);
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  const runs = await connectionsService.getConnectionSyncs(userId, id, limit);
  if (!runs) {
    return res.status(404).json({ error: "Connection not found" });
  }

  res.json({ runs });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const id = String(req.params.id);

  const deleted = await connectionsService.deleteConnection(userId, id);
  if (!deleted) {
    return res.status(404).json({ error: "Connection not found" });
  }

  res.json({ ok: true });
});

export default router;

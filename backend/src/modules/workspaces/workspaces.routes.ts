import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();
router.use(requireAuth);

/** List workspaces the calling user belongs to. */
router.get("/", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, createdAt: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeWorkspaceId: true },
  });
  res.json({
    workspaces: memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
      createdAt: m.workspace.createdAt.toISOString(),
      active: m.workspace.id === user?.activeWorkspaceId,
    })),
  });
});

/** Create a new workspace; caller becomes owner. Media buyers only. */
router.post("/", requireRole("media_buyer"), async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const { name } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "name is required" });
  }
  const ws = await prisma.workspace.create({
    data: {
      name: name.trim(),
      members: { create: { userId, role: "owner" } },
    },
  });
  res.status(201).json({ workspace: { id: ws.id, name: ws.name, role: "owner", createdAt: ws.createdAt.toISOString(), active: false } });
});

/** Switch the calling user's active workspace. */
router.post("/switch", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const { workspaceId } = req.body ?? {};
  if (typeof workspaceId !== "string") {
    return res.status(400).json({ error: "workspaceId is required" });
  }
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) return res.status(403).json({ error: "Not a member of that workspace" });
  await prisma.user.update({ where: { id: userId }, data: { activeWorkspaceId: workspaceId } });
  res.json({ ok: true, activeWorkspaceId: workspaceId });
});

/** Rename a workspace (owner + media buyer only). */
router.patch("/:id", requireRole("media_buyer"), async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const id = String(req.params.id);
  const { name } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "name is required" });
  }
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId } },
  });
  if (!membership) return res.status(404).json({ error: "Workspace not found" });
  if (membership.role !== "owner") return res.status(403).json({ error: "Only owners can rename a workspace" });
  const ws = await prisma.workspace.update({
    where: { id },
    data: { name: name.trim() },
  });
  res.json({ workspace: { id: ws.id, name: ws.name } });
});

/** List members of a workspace (must be a member). */
router.get("/:id/members", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const id = String(req.params.id);
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId } },
  });
  if (!membership) return res.status(404).json({ error: "Workspace not found" });

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: id },
    select: {
      id: true,
      role: true,
      joinedAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
  res.json({ members });
});

export default router;

import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";
import { requireAuth, AuthedRequest } from "../../middleware/auth";

const router = Router();

/**
 * Returns the local profile + active workspace for the currently signed-in Firebase user.
 * Auto-provisioning + linking is handled inside the auth middleware.
 */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const user = await prisma.user.findUnique({
    where: { id: authed.userId },
    select: { id: true, email: true, name: true, plan: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  const ws = await prisma.workspace.findUnique({
    where: { id: authed.workspaceId },
    select: { id: true, name: true },
  });
  res.json({ user, workspace: ws ? { ...ws, role: authed.role } : null });
});

/**
 * Unauthenticated check used by the login form: given an email, tell the client whether
 * this user predates the Firebase migration and needs a one-time password reset.
 *
 * Privacy note: this leaks email existence. We accept that tradeoff since the alternative
 * (a confused user with no idea why "wrong password" keeps firing) is worse.
 */
router.get("/check-migration", async (req: Request, res: Response) => {
  const email = typeof req.query.email === "string" ? req.query.email.toLowerCase().trim() : "";
  if (!email) return res.json({ pendingMigration: false, exists: false });
  const user = await prisma.user.findUnique({
    where: { email },
    select: { pendingMigration: true },
  });
  res.json({
    exists: !!user,
    pendingMigration: !!user?.pendingMigration,
  });
});

export default router;

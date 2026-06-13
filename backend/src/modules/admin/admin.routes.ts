import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";
import { firebaseAuth } from "../../lib/firebase";
import { AuthedRequest, requireAuth, UserRole } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { seedDefaultRules } from "../alerts/alerts.service";
import { logger } from "../../lib/logger";

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

const VALID_ROLES: ReadonlyArray<UserRole> = ["admin", "media_buyer", "client"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidRole(value: unknown): value is UserRole {
  return typeof value === "string" && (VALID_ROLES as readonly string[]).includes(value);
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL_REGEX.test(value);
}

function isValidPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8;
}

/** List every user EXCEPT the caller. */
router.get("/users", async (req: Request, res: Response) => {
  // The calling admin is intentionally hidden from their own list — they can't
  // modify their own role, password, or status from this panel anyway (each
  // mutation endpoint has a self_* guard), so showing the row only invites
  // confusion. Other admins (in a multi-admin setup) remain visible so they
  // can manage each other.
  const authed = req as AuthedRequest;
  const users = await prisma.user.findMany({
    where: { id: { not: authed.userId } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      disabled: true,
      createdAt: true,
      firebaseUid: true,
    },
  });
  res.json({ users });
});

/**
 * Provision a new user.
 *
 * Order matters: create the Firebase user first so we have a uid. If the
 * subsequent Prisma transaction fails, roll the Firebase user back so we
 * never leave an orphaned auth account.
 */
router.post("/users", async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;
  const role = req.body?.role;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!isValidEmail(rawEmail)) return res.status(400).json({ error: "invalid_email" });
  if (!isValidPassword(password)) return res.status(400).json({ error: "weak_password", message: "Password must be at least 8 characters." });
  if (!isValidRole(role)) return res.status(400).json({ error: "invalid_role" });

  // Delete is now a hard delete, so any existing User row is by definition
  // an active account — flag the duplicate as a 409. (Firebase will also
  // reject it later with auth/email-already-exists, but checking up-front
  // saves a Firebase round-trip and keeps the error semantics tighter.)
  const existingUser = await prisma.user.findUnique({
    where: { email: rawEmail },
    select: { id: true },
  });
  if (existingUser) {
    return res.status(409).json({ error: "email_exists" });
  }

  let createdUid: string | null = null;
  try {
    const fbUser = await firebaseAuth().createUser({
      email: rawEmail,
      password,
      displayName: name || undefined,
      emailVerified: true,
    });
    createdUid = fbUser.uid;

    const result = await prisma.$transaction(async (tx) => {
      await tx.allowedEmail.upsert({
        where: { email: rawEmail },
        update: { addedBy: authed.userId, note: name || null },
        create: { email: rawEmail, addedBy: authed.userId, note: name || null },
      });

      const user = await tx.user.create({
        data: {
          email: rawEmail,
          firebaseUid: fbUser.uid,
          name: name || null,
          role,
        },
      });
      const wsName = name ? `${name}'s workspace` : `${rawEmail}'s workspace`;
      const ws = await tx.workspace.create({
        data: { name: wsName, members: { create: { userId: user.id, role: "owner" } } },
      });
      await tx.user.update({ where: { id: user.id }, data: { activeWorkspaceId: ws.id } });
      return { user, workspaceId: ws.id };
    });

    await seedDefaultRules(result.workspaceId, result.user.id);

    logger.info(
      { userId: result.user.id, email: rawEmail, role, by: authed.userId },
      "admin provisioned user",
    );
    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        disabled: result.user.disabled,
        createdAt: result.user.createdAt,
        firebaseUid: result.user.firebaseUid,
      },
    });
  } catch (err) {
    logger.error({ err, email: rawEmail }, "admin createUser failed; rolling back Firebase user");
    if (createdUid) {
      await firebaseAuth().deleteUser(createdUid).catch((rollbackErr) => {
        logger.error({ err: rollbackErr, uid: createdUid }, "rollback deleteUser failed — orphan in Firebase Auth");
      });
    }
    if ((err as { code?: string })?.code === "auth/email-already-exists") {
      return res.status(409).json({ error: "email_exists" });
    }
    res.status(500).json({ error: "create_failed", message: "Could not provision user." });
  }
});

/** Update name / role / disabled. */
router.patch("/users/:id", async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const id = String(req.params.id);
  const data: { name?: string | null; role?: UserRole; disabled?: boolean } = {};

  if (req.body?.name !== undefined) {
    data.name = typeof req.body.name === "string" && req.body.name.trim() ? req.body.name.trim() : null;
  }
  if (req.body?.role !== undefined) {
    if (!isValidRole(req.body.role)) return res.status(400).json({ error: "invalid_role" });
    if (authed.userId === id && req.body.role !== "admin") {
      return res.status(403).json({ error: "self_demotion_blocked", message: "Admins cannot demote themselves." });
    }
    data.role = req.body.role;
  }
  // Role changes are locked while a user is disabled. The frozen role on the
  // disabled row is the source of truth; re-enable them first, then change role
  // (or do both in the same PATCH by sending `disabled: false` alongside).
  if (data.role !== undefined && req.body?.disabled !== false) {
    const target = await prisma.user.findUnique({ where: { id }, select: { disabled: true } });
    if (target?.disabled) {
      return res.status(409).json({
        error: "role_locked_while_disabled",
        message: "Re-enable this account before changing its role.",
      });
    }
  }

  if (req.body?.disabled !== undefined) {
    if (typeof req.body.disabled !== "boolean") return res.status(400).json({ error: "invalid_disabled" });
    if (authed.userId === id && req.body.disabled === true) {
      return res.status(403).json({ error: "self_disable_blocked", message: "Admins cannot disable their own account." });
    }
    data.disabled = req.body.disabled;
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: "no_changes" });

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, disabled: true, createdAt: true, firebaseUid: true },
  });
  res.json({ user: updated });
});

/** Reset a user's password in Firebase Auth. */
router.post("/users/:id/password", async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const id = String(req.params.id);
  // Admins must use the self-serve /forgot-password flow rather than this
  // endpoint — otherwise a stray click on the "Reset" button in their own row
  // would lock them out of the very admin panel they need to recover.
  if (authed.userId === id) {
    return res.status(403).json({
      error: "self_password_reset_blocked",
      message: "Use the Forgot Password page to reset your own password.",
    });
  }
  const password = req.body?.password;
  if (!isValidPassword(password)) return res.status(400).json({ error: "weak_password", message: "Password must be at least 8 characters." });

  const user = await prisma.user.findUnique({ where: { id }, select: { firebaseUid: true, email: true } });
  if (!user) return res.status(404).json({ error: "user_not_found" });
  if (!user.firebaseUid) return res.status(409).json({ error: "no_firebase_uid", message: "User has no Firebase account to reset." });

  await firebaseAuth().updateUser(user.firebaseUid, { password });
  logger.info({ userId: id, email: user.email }, "admin reset password");
  res.json({ ok: true });
});

/**
 * Counts everything that would be wiped by a hard delete of `userId`. Used by
 * the preview endpoint AND captured pre-delete so it can be written to the
 * DeletionLog (cascade has fired by the time we want to count post-delete).
 *
 * All counts run in parallel — none of them touch each other.
 */
async function computeCascadeSummary(userId: string) {
  const [connections, campaigns, insights, syncRuns, shopifyOrders, alertRules, workspaceMembers] = await Promise.all([
    prisma.connection.count({ where: { userId } }),
    prisma.campaign.count({ where: { connection: { userId } } }),
    prisma.insight.count({ where: { campaign: { connection: { userId } } } }),
    prisma.syncRun.count({ where: { connection: { userId } } }),
    prisma.shopifyOrder.count({ where: { connection: { userId } } }),
    prisma.alertRule.count({ where: { userId } }),
    prisma.workspaceMember.count({ where: { userId } }),
  ]);
  return { connections, campaigns, insights, syncRuns, shopifyOrders, alertRules, workspaceMembers };
}

/**
 * Preview the blast radius of a hard delete BEFORE the admin confirms it.
 * Returns counts of every related row the cascade will wipe. The frontend
 * shows this in the delete-confirmation modal so mistakes are obvious.
 */
router.get("/users/:id/delete-preview", async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const id = String(req.params.id);
  // No point previewing self-delete — it's blocked anyway. Return the same code
  // so the UI doesn't have to special-case "preview ok, delete blocked".
  if (authed.userId === id) {
    return res.status(403).json({ error: "self_delete_blocked" });
  }
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) return res.status(404).json({ error: "user_not_found" });

  const cascade = await computeCascadeSummary(id);
  res.json({ user, cascade });
});

/**
 * Hard-delete an account.
 *
 * Cascading behavior (via schema-level onDelete: Cascade):
 *   - User row removed
 *   - WorkspaceMember rows removed (they leave every workspace they were in)
 *   - Identity rows removed
 *   - Connection rows removed → Campaign → Insight, SyncRun, ShopifyOrder
 *   - AlertRule rows removed
 *
 * Workspaces themselves persist; other members keep their seats. The Firebase
 * Auth user is hard-deleted; the AllowedEmail row is hard-deleted so the same
 * email can be cleanly re-provisioned later as a brand-new account.
 *
 * Before the cascade fires we snapshot the related-row counts and write a
 * DeletionLog entry in the same transaction. The log row has no FK to User
 * so it survives the cascade and provides an audit trail.
 */
router.delete("/users/:id", async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const id = String(req.params.id);
  if (authed.userId === id) {
    return res.status(403).json({ error: "self_delete_blocked", message: "Admins cannot delete themselves." });
  }
  const user = await prisma.user.findUnique({
    where: { id },
    select: { firebaseUid: true, email: true, name: true, role: true },
  });
  if (!user) return res.status(404).json({ error: "user_not_found" });

  // Capture cascade counts BEFORE the delete — afterwards every row owned by
  // this user is gone, so the counts would all be 0.
  const cascade = await computeCascadeSummary(id);

  // Resolve the admin's email up-front too, so the DeletionLog stays readable
  // even if the deleting admin is themselves deleted later.
  const actor = await prisma.user.findUnique({
    where: { id: authed.userId },
    select: { email: true },
  });

  if (user.firebaseUid) {
    await firebaseAuth().deleteUser(user.firebaseUid).catch((err: { code?: string }) => {
      // If Firebase says the user is already gone, that's fine — keep going.
      if (err?.code === "auth/user-not-found") return;
      throw err;
    });
  }
  await prisma.$transaction([
    prisma.allowedEmail.deleteMany({ where: { email: user.email } }),
    prisma.deletionLog.create({
      data: {
        deletedUserId: id,
        deletedUserEmail: user.email,
        deletedUserName: user.name,
        deletedUserRole: user.role,
        deletedBy: authed.userId,
        deletedByEmail: actor?.email ?? "unknown",
        cascadeSummary: cascade,
      },
    }),
    prisma.user.delete({ where: { id } }),
  ]);
  logger.info({ userId: id, email: user.email, by: authed.userId, cascade }, "admin deleted user");
  res.json({ ok: true, cascade });
});

export default router;

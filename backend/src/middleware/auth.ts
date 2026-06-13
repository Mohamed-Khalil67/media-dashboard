import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/client";
import { firebaseAuth } from "../lib/firebase";
import { seedDefaultRules } from "../modules/alerts/alerts.service";
import { syncUserConnections } from "../jobs/sync.job";
import { logger } from "../lib/logger";

const ACTIVITY_WINDOW_HOURS = Number(process.env.ACTIVITY_WINDOW_HOURS ?? 4);
const ACTIVITY_WINDOW_MS = ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000;

export type UserRole = "admin" | "media_buyer" | "client";

export interface AuthedRequest extends Request {
  userId: string;
  workspaceId: string;
  role: "owner" | "member";
  userRole: UserRole;
}

interface DecodedClaims {
  uid: string;
  email?: string;
  name?: string;
}

/**
 * Verifies a Firebase ID token, resolves (or creates) the local User row,
 * ensures the user has an active Workspace, and attaches userId/workspaceId/role.
 *
 * User resolution order:
 *  1. Match by `firebaseUid` (returning user).
 *  2. Match by `email` and link the Firebase uid (legacy user signing in for the first time
 *     after the Firebase migration; also clears pendingMigration).
 *  3. Auto-provision: create User + Workspace + owner WorkspaceMember + seed default alert rules.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  let claims: DecodedClaims;
  try {
    const decoded = await firebaseAuth().verifyIdToken(header.slice(7));
    claims = { uid: decoded.uid, email: decoded.email, name: decoded.name };
  } catch (err) {
    logger.warn({ err }, "firebase id token rejected");
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Strict invite-only allowlist gate. Must run BEFORE any user lookup/auto-provisioning
  // so denied emails leave no User row behind and can't link onto a legacy email row.
  if (!claims.email) {
    return res.status(403).json({
      error: "access_denied",
      message: "Your account has no email address — cannot verify access.",
    });
  }
  const normalizedEmail = claims.email.toLowerCase();
  const allowed = await prisma.allowedEmail.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (!allowed) {
    logger.warn(
      { email: normalizedEmail, uid: claims.uid },
      "blocked sign-in: email not on allowlist",
    );
    return res.status(403).json({
      error: "access_denied",
      message: "Access by invitation only. Contact your administrator to be added.",
    });
  }

  let user = await prisma.user.findUnique({
    where: { firebaseUid: claims.uid },
    select: { id: true, activeWorkspaceId: true, email: true, name: true, role: true, disabled: true, lastActiveAt: true },
  });

  if (!user && claims.email) {
    // Linking case: a pre-Firebase user comes in for the first time. Match on email.
    // Use the normalized (lowercase) email — the allowlist check uses the same form,
    // and User.email rows are stored lowercase by all provisioning paths.
    const legacy = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, activeWorkspaceId: true, email: true, name: true, role: true, disabled: true, lastActiveAt: true },
    });
    if (legacy) {
      await prisma.user.update({
        where: { id: legacy.id },
        data: { firebaseUid: claims.uid, pendingMigration: false, passwordHash: null },
      });
      user = legacy;
      logger.info({ userId: legacy.id, email: legacy.email }, "linked existing user to firebase uid");
    }
  }

  if (!user) {
    // Brand-new user: create User + workspace in one go.
    const email = claims.email ?? `${claims.uid}@firebase.local`;
    const created = await prisma.user.create({
      data: { email, firebaseUid: claims.uid, name: claims.name ?? null },
    });
    const wsName = created.name ? `${created.name}'s workspace` : `${email}'s workspace`;
    const ws = await prisma.workspace.create({
      data: {
        name: wsName,
        members: { create: { userId: created.id, role: "owner" } },
      },
    });
    await prisma.user.update({ where: { id: created.id }, data: { activeWorkspaceId: ws.id } });
    await seedDefaultRules(ws.id, created.id);
    logger.info({ userId: created.id, email }, "auto-provisioned new user via firebase sign-in");
    user = {
      id: created.id,
      activeWorkspaceId: ws.id,
      email: created.email,
      name: created.name,
      role: created.role,
      disabled: created.disabled,
      lastActiveAt: null,
    };
  }

  if (user.disabled) {
    logger.warn({ userId: user.id, email: user.email }, "blocked sign-in: user account disabled");
    return res.status(403).json({
      error: "access_denied",
      message: "This account has been disabled. Contact your administrator.",
    });
  }

  let workspaceId = user.activeWorkspaceId;
  if (!workspaceId) {
    const wsName = user.name ? `${user.name}'s workspace` : `${user.email}'s workspace`;
    const ws = await prisma.workspace.create({
      data: {
        name: wsName,
        members: { create: { userId: user.id, role: "owner" } },
      },
    });
    await prisma.user.update({ where: { id: user.id }, data: { activeWorkspaceId: ws.id } });
    workspaceId = ws.id;
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    select: { role: true },
  });
  if (!membership) {
    return res.status(403).json({ error: "You are not a member of the active workspace" });
  }

  const authed = req as AuthedRequest;
  authed.userId = user.id;
  authed.workspaceId = workspaceId;
  authed.role = membership.role === "owner" ? "owner" : "member";
  authed.userRole = normalizeUserRole(user.role);

  // Activity bookkeeping — fire-and-forget so we never block the request on this.
  const now = new Date();
  const wasIdle = !user.lastActiveAt || now.getTime() - user.lastActiveAt.getTime() > ACTIVITY_WINDOW_MS;
  prisma.user
    .update({ where: { id: user.id }, data: { lastActiveAt: now } })
    .catch((err) => logger.warn({ err, userId: user!.id }, "lastActiveAt bump failed"));

  // Returning-from-idle media buyer → kick a sync so their dashboard isn't stale.
  // Not awaited: handlers proceed immediately; sync runs in the background.
  if (wasIdle && authed.userRole === "media_buyer") {
    syncUserConnections(user.id, { reason: "media-buyer-signed-in" }).catch((err) =>
      logger.error({ err, userId: user!.id }, "background sync after sign-in failed"),
    );
  }

  next();
}

function normalizeUserRole(value: string | null | undefined): UserRole {
  if (value === "admin" || value === "media_buyer") return value;
  return "client";
}

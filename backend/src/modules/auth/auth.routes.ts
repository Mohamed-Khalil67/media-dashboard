import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { firebaseAuth } from "../../lib/firebase";
import { logger } from "../../lib/logger";
import { authLimiter } from "../../middleware/rateLimit";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns the local profile for the currently signed-in user. */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const user = await prisma.user.findUnique({
    where: { id: authed.userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

/**
 * Ephemeral-data logout. Deletes everything the user has synced from external
 * platforms, then returns. The User row is preserved so the user can log back
 * in; on next sign-in they'll see an empty dashboard.
 *
 * Cascade behavior (schema-level onDelete: Cascade):
 *   Connection deletion wipes Campaign → Insight, SyncRun, ShopifyOrder.
 * Alert rules are user-owned (not connection-owned) so we delete them in the
 * same transaction.
 */
router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  await prisma.$transaction([
    prisma.connection.deleteMany({ where: { userId } }),
    prisma.alertRule.deleteMany({ where: { userId } }),
  ]);
  logger.info({ userId }, "user logout: synced data wiped");
  res.json({ ok: true });
});

/**
 * Generates a Firebase password-reset link via the Admin SDK and logs it.
 *
 * The frontend already triggers Firebase's hosted email via the web SDK
 * (`sendPasswordResetEmail`). This endpoint exists for two reasons:
 *  1. Verification: the response confirms whether Firebase recognises the email
 *     (without leaking that detail to the client — see `emailSent` flag).
 *  2. Dev fallback: when running outside production, the actual reset link is
 *     returned in the response and logged.
 */
router.post("/password-reset", authLimiter, async (req: Request, res: Response) => {
  const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!EMAIL_REGEX.test(rawEmail)) {
    return res.status(400).json({ error: "invalid_email" });
  }

  try {
    const continueUrl = `${process.env.FRONTEND_URL ?? "http://localhost:4200"}/login`;
    const link = await firebaseAuth().generatePasswordResetLink(rawEmail, {
      url: continueUrl,
      handleCodeInApp: false,
    });
    logger.info({ email: rawEmail }, "password-reset link generated");
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      logger.warn({ email: rawEmail, link }, "DEV password-reset link (do not log in production)");
    }
    res.json({ emailSent: true, ...(isDev ? { devLink: link } : {}) });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "auth/user-not-found") {
      logger.info({ email: rawEmail }, "password-reset: no firebase account exists yet");
      return res.json({ emailSent: true, needsRegistration: true });
    }
    logger.error({ err, email: rawEmail }, "password-reset link generation failed");
    res.status(500).json({ error: "reset_failed" });
  }
});

export default router;

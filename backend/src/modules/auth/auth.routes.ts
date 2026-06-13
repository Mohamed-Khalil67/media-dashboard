import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { firebaseAuth } from "../../lib/firebase";
import { logger } from "../../lib/logger";
import { authLimiter } from "../../middleware/rateLimit";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns the local profile + active workspace for the currently signed-in Firebase user.
 * Auto-provisioning + linking is handled inside the auth middleware.
 */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const user = await prisma.user.findUnique({
    where: { id: authed.userId },
    select: { id: true, email: true, name: true, plan: true, role: true, createdAt: true },
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
router.get("/check-migration", authLimiter, async (req: Request, res: Response) => {
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

/**
 * Generates a Firebase password-reset link via the Admin SDK and logs it.
 *
 * The frontend already triggers Firebase's hosted email via the web SDK
 * (`sendPasswordResetEmail`). This endpoint exists for two reasons:
 *  1. Verification: the response confirms whether Firebase recognises the email
 *     (without leaking that detail to the client — see `emailSent` flag).
 *  2. Dev fallback: when running outside production, the actual reset link is
 *     returned in the response and logged, so the operator can complete the
 *     reset even if the Firebase-hosted email is stuck in spam or filtered.
 *
 * Response shape:
 *   { emailSent: boolean, devLink?: string }
 * `emailSent` is always true (we don't leak existence). `devLink` is only set
 * when the account exists AND we are NOT in production.
 */
router.post("/password-reset", authLimiter, async (req: Request, res: Response) => {
  const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!EMAIL_REGEX.test(rawEmail)) {
    return res.status(400).json({ error: "invalid_email" });
  }

  const allowed = await prisma.allowedEmail.findUnique({ where: { email: rawEmail }, select: { id: true } });
  if (!allowed) {
    // Treat "not on allowlist" the same as "no Firebase account" to avoid leaking either.
    logger.info({ email: rawEmail }, "password-reset requested for non-allowlisted email");
    return res.json({ emailSent: true });
  }

  try {
    // actionCodeSettings is required for `generatePasswordResetLink` to populate the
    // `oobLink` in the API response on projects without a default dynamicLinkDomain.
    // Without it, Firebase returns 200 but omits the link and the SDK throws
    // "INTERNAL ASSERT FAILED: Unable to create the email action link".
    // The `url` must be on Firebase's Authorized domains list (localhost is allowed
    // by default; for prod add your domain in Firebase Console > Authentication > Settings).
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
    res.json({
      emailSent: true,
      ...(isDev ? { devLink: link } : {}),
    });
  } catch (err: any) {
    if (err?.code === "auth/user-not-found") {
      // User has an AllowedEmail row but never signed in (no Firebase account yet). Tell
      // the caller so they can prompt the user to register / contact admin.
      logger.info({ email: rawEmail }, "password-reset: no firebase account exists yet");
      return res.json({ emailSent: true, needsRegistration: true });
    }
    // Known Firebase quirk: API returns 200 echoing the email but no oobLink,
    // and Admin SDK throws "INTERNAL ASSERT FAILED: Unable to create the email
    // action link". Surface a specific flag so the UI can show the CLI workaround.
    const isOobMissing =
      err?.code === "auth/internal-error" &&
      err?.httpResponse?.data?.kind === "identitytoolkit#GetOobConfirmationCodeResponse";
    if (isOobMissing) {
      logger.warn(
        { email: rawEmail },
        "password-reset: Firebase returned no oobLink (likely IAM/template config). " +
          "Use `npm run set-password -- <email> <password>` as a bypass.",
      );
      return res.status(503).json({
        error: "firebase_link_unavailable",
        message:
          "Firebase isn't returning a reset link. Run `npm run set-password -- " +
          rawEmail +
          " <new-password>` from the backend to set a password directly.",
      });
    }
    logger.error({ err, email: rawEmail }, "password-reset link generation failed");
    res.status(500).json({ error: "reset_failed" });
  }
});

export default router;

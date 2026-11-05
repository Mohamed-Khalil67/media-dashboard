import { Router, Request, Response } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { authLimiter } from "../../middleware/rateLimit";
import { authService } from "./auth.service";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns the local profile for the currently signed-in user. */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const user = await authService.getProfile(authed.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

/** Ephemeral-data logout. Deletes synced connections & alert rules. */
router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  await authService.logoutWipe(userId);
  res.json({ ok: true });
});

/** Generates a password-reset link. */
router.post("/password-reset", authLimiter, async (req: Request, res: Response) => {
  const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!EMAIL_REGEX.test(rawEmail)) {
    return res.status(400).json({ error: "invalid_email" });
  }

  try {
    const result = await authService.requestPasswordReset(rawEmail);
    res.json(result);
  } catch (_err) {
    res.status(500).json({ error: "reset_failed" });
  }
});

export default router;

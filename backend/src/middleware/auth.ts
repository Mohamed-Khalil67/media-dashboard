import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/client";
import { firebaseAuth } from "../lib/firebase";
import { logger } from "../lib/logger";

export interface AuthedRequest extends Request {
  userId: string;
}

interface DecodedClaims {
  uid: string;
  email?: string;
  name?: string;
}

/**
 * Verifies a Firebase ID token, resolves (or creates) the local User row,
 * and attaches `userId` to the request. No allowlist, no roles, no
 * workspaces — public-signup single-user SaaS.
 *
 * Resolution order:
 *  1. Match by `firebaseUid` (returning user).
 *  2. Match by `email` and link the Firebase uid (legacy or out-of-band user).
 *  3. Auto-provision: create the User row.
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
  if (!claims.email) {
    return res.status(403).json({
      error: "missing_email",
      message: "Your Firebase account has no email address.",
    });
  }
  const normalizedEmail = claims.email.toLowerCase();

  let user = await prisma.user.findUnique({
    where: { firebaseUid: claims.uid },
    select: { id: true, email: true, name: true, lastActiveAt: true },
  });

  if (!user) {
    // Linking case: a user signed up via Firebase but hasn't been seen by us yet,
    // and there's an existing User row with the same email (e.g. they reset
    // password and Firebase minted a new uid). Reuse the existing row.
    const byEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, lastActiveAt: true },
    });
    if (byEmail) {
      await prisma.user.update({ where: { id: byEmail.id }, data: { firebaseUid: claims.uid } });
      user = byEmail;
      logger.info({ userId: byEmail.id, email: normalizedEmail }, "linked existing user to firebase uid");
    }
  }

  if (!user) {
    const created = await prisma.user.create({
      data: { email: normalizedEmail, firebaseUid: claims.uid, name: claims.name ?? null },
      select: { id: true, email: true, name: true, lastActiveAt: true },
    });
    logger.info({ userId: created.id, email: created.email }, "auto-provisioned new user via firebase sign-in");
    user = created;
  }

  const authed = req as AuthedRequest;
  authed.userId = user.id;

  // Activity bookkeeping — fire-and-forget so we never block the request on this.
  // The 2-minute auto-refresh cron reads `lastActiveAt` to skip absent users.
  prisma.user
    .update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
    .catch((err) => logger.warn({ err, userId: user!.id }, "lastActiveAt bump failed"));

  next();
}

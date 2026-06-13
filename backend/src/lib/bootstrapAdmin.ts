import { prisma } from "../db/client";
import { logger } from "./logger";

/**
 * Guarantees a designated bootstrap admin email is:
 *  1. Present on the AllowedEmail allowlist (so they can sign in)
 *  2. Marked as role="admin" + disabled=false if a local User row exists
 *
 * Runs once at server startup. Idempotent. If the email isn't yet associated
 * with a Firebase account / User row, the role will apply automatically the
 * first time they sign in (auth middleware auto-provisions with default
 * role=client, then a subsequent startup ensures the promotion).
 *
 * The email is taken from the BOOTSTRAP_ADMIN_EMAIL env var.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const raw = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!raw || !raw.trim()) return;
  const email = raw.trim().toLowerCase();

  try {
    await prisma.allowedEmail.upsert({
      where: { email },
      update: {},
      create: { email, note: "Bootstrap admin" },
    });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, disabled: true },
    });

    if (user && (user.role !== "admin" || user.disabled)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: "admin", disabled: false },
      });
      logger.info({ email, previousRole: user.role }, "bootstrap admin role enforced");
    } else if (!user) {
      logger.info({ email }, "bootstrap admin allowlisted; will gain admin on first sign-in");
    }
  } catch (err) {
    // Never let a bootstrap hiccup take down the server; just log and move on.
    logger.error({ err, email }, "ensureBootstrapAdmin failed");
  }
}

import { prisma } from "../../db/client";
import { firebaseAuth } from "../../lib/firebase";
import { logger } from "../../lib/logger";
import { UserProfileDto, PasswordResetResponseDto } from "./dto/auth.dto";

export class AuthService {
  async getProfile(userId: string): Promise<UserProfileDto | null> {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  }

  async logoutWipe(userId: string): Promise<void> {
    await prisma.$transaction([
      prisma.connection.deleteMany({ where: { userId } }),
      prisma.alertRule.deleteMany({ where: { userId } }),
    ]);
    logger.info({ userId }, "user logout: synced data wiped");
  }

  async requestPasswordReset(email: string): Promise<PasswordResetResponseDto> {
    const continueUrl = `${process.env.FRONTEND_URL ?? "http://localhost:4200"}/login`;
    try {
      const link = await firebaseAuth().generatePasswordResetLink(email, {
        url: continueUrl,
        handleCodeInApp: false,
      });
      logger.info({ email }, "password-reset link generated");
      const isDev = process.env.NODE_ENV !== "production";
      if (isDev) {
        logger.warn({ email, link }, "DEV password-reset link (do not log in production)");
      }
      return { emailSent: true, ...(isDev ? { devLink: link } : {}) };
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === "auth/user-not-found") {
        logger.info({ email }, "password-reset: no firebase account exists yet");
        return { emailSent: true, needsRegistration: true };
      }
      logger.error({ err, email }, "password-reset link generation failed");
      throw err;
    }
  }
}

export const authService = new AuthService();

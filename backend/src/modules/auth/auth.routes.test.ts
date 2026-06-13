import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  allowedFindUnique: vi.fn(),
  generatePasswordResetLink: vi.fn(),
  userFindUnique: vi.fn(),
  workspaceFindUnique: vi.fn(),
  // Test-controlled identity for the stubbed requireAuth so /me sees a real userId.
  callerUserId: "u_self",
  callerWorkspaceId: "ws_self",
  callerRole: "owner" as "owner" | "member",
}));

vi.mock("../../db/client", () => ({
  prisma: {
    allowedEmail: { findUnique: mocks.allowedFindUnique },
    user: { findUnique: mocks.userFindUnique },
    workspace: { findUnique: mocks.workspaceFindUnique },
  },
}));

vi.mock("../../lib/firebase", () => ({
  firebaseAuth: () => ({ generatePasswordResetLink: mocks.generatePasswordResetLink }),
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: unknown, next: () => void) => {
    req.userId = mocks.callerUserId;
    req.workspaceId = mocks.callerWorkspaceId;
    req.role = mocks.callerRole;
    req.userRole = "client";
    next();
  },
}));

vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// authLimiter is module-singleton state — leaving it real causes later tests
// (after ~10 requests) to receive 429 instead of the handler's actual response.
// Replace it with a pass-through so each test exercises route logic, not throttling.
vi.mock("../../middleware/rateLimit", () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import authRoutes from "./auth.routes";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  return app;
}

const originalEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("POST /api/auth/password-reset", () => {
  it("returns 400 for an obviously invalid email", async () => {
    const res = await request(makeApp()).post("/api/auth/password-reset").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_email");
    expect(mocks.allowedFindUnique).not.toHaveBeenCalled();
    expect(mocks.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it("returns emailSent:true without leaking existence when email isn't on the allowlist", async () => {
    mocks.allowedFindUnique.mockResolvedValueOnce(null);
    const res = await request(makeApp()).post("/api/auth/password-reset").send({ email: "outsider@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ emailSent: true });
    expect(mocks.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it("flags needsRegistration when allowlisted but no Firebase account exists yet", async () => {
    mocks.allowedFindUnique.mockResolvedValueOnce({ id: "ae_1" });
    mocks.generatePasswordResetLink.mockRejectedValueOnce({ code: "auth/user-not-found" });
    const res = await request(makeApp()).post("/api/auth/password-reset").send({ email: "never@signed.in" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ emailSent: true, needsRegistration: true });
  });

  it("returns the dev link in non-production mode", async () => {
    process.env.NODE_ENV = "development";
    mocks.allowedFindUnique.mockResolvedValueOnce({ id: "ae_1" });
    mocks.generatePasswordResetLink.mockResolvedValueOnce("https://auth/reset?code=abc");

    const res = await request(makeApp()).post("/api/auth/password-reset").send({ email: "user@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.emailSent).toBe(true);
    expect(res.body.devLink).toBe("https://auth/reset?code=abc");
    expect(mocks.generatePasswordResetLink).toHaveBeenCalledWith(
      "user@example.com",
      expect.objectContaining({ url: expect.stringContaining("/login"), handleCodeInApp: false }),
    );
  });

  it("hides the dev link in production mode", async () => {
    process.env.NODE_ENV = "production";
    mocks.allowedFindUnique.mockResolvedValueOnce({ id: "ae_1" });
    mocks.generatePasswordResetLink.mockResolvedValueOnce("https://auth/reset?code=abc");

    const res = await request(makeApp()).post("/api/auth/password-reset").send({ email: "user@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ emailSent: true });
    expect(res.body.devLink).toBeUndefined();
  });

  it("normalizes the email to lowercase before lookup", async () => {
    mocks.allowedFindUnique.mockResolvedValueOnce({ id: "ae_1" });
    mocks.generatePasswordResetLink.mockResolvedValueOnce("https://auth/reset?code=abc");

    await request(makeApp()).post("/api/auth/password-reset").send({ email: "  Foo.Bar@Example.COM  " });
    expect(mocks.allowedFindUnique).toHaveBeenCalledWith({
      where: { email: "foo.bar@example.com" },
      select: { id: true },
    });
    expect(mocks.generatePasswordResetLink).toHaveBeenCalledWith(
      "foo.bar@example.com",
      expect.objectContaining({ url: expect.any(String) }),
    );
  });

  it("returns 500 reset_failed on unexpected Firebase errors", async () => {
    mocks.allowedFindUnique.mockResolvedValueOnce({ id: "ae_1" });
    mocks.generatePasswordResetLink.mockRejectedValueOnce(new Error("firebase down"));
    const res = await request(makeApp()).post("/api/auth/password-reset").send({ email: "user@example.com" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("reset_failed");
  });

  it("returns 503 firebase_link_unavailable when Firebase echoes the email but omits oobLink", async () => {
    mocks.allowedFindUnique.mockResolvedValueOnce({ id: "ae_1" });
    mocks.generatePasswordResetLink.mockRejectedValueOnce({
      code: "auth/internal-error",
      httpResponse: {
        status: 200,
        data: {
          kind: "identitytoolkit#GetOobConfirmationCodeResponse",
          email: "user@example.com",
        },
      },
    });
    const res = await request(makeApp()).post("/api/auth/password-reset").send({ email: "user@example.com" });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("firebase_link_unavailable");
    expect(res.body.message).toContain("set-password");
  });
});

describe("GET /api/auth/me", () => {
  it("returns the user + workspace pair when both exist", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({
      id: "u_self",
      email: "me@example.com",
      name: "Me",
      plan: "trial",
      role: "admin",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    mocks.workspaceFindUnique.mockResolvedValueOnce({ id: "ws_self", name: "Personal" });

    const res = await request(makeApp()).get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("me@example.com");
    expect(res.body.user.role).toBe("admin");
    expect(res.body.workspace).toEqual({ id: "ws_self", name: "Personal", role: "owner" });
  });

  it("returns 404 when the local user row vanished", async () => {
    mocks.userFindUnique.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get("/api/auth/me");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });

  it("returns workspace: null when the active workspace can't be found", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({
      id: "u_self", email: "me@example.com", name: null, plan: "trial", role: "client", createdAt: new Date(),
    });
    mocks.workspaceFindUnique.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.workspace).toBeNull();
  });
});

describe("GET /api/auth/check-migration", () => {
  it("returns exists:false when no email param is supplied", async () => {
    const res = await request(makeApp()).get("/api/auth/check-migration");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false, pendingMigration: false });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("returns exists:false for an unknown email", async () => {
    mocks.userFindUnique.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get("/api/auth/check-migration").query({ email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false, pendingMigration: false });
  });

  it("flags legacy users who still need the Firebase migration", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ pendingMigration: true });
    const res = await request(makeApp()).get("/api/auth/check-migration").query({ email: "legacy@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true, pendingMigration: true });
  });

  it("reports exists:true without the migration flag for already-migrated users", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ pendingMigration: false });
    const res = await request(makeApp()).get("/api/auth/check-migration").query({ email: "Modern@Example.COM" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true, pendingMigration: false });
    // The handler should have lowercased the email before the DB lookup.
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { email: "modern@example.com" },
      select: { pendingMigration: true },
    });
  });
});

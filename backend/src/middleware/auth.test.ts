import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
}));
const verifyIdToken = vi.hoisted(() => vi.fn());

vi.mock("../db/client", () => ({ prisma: prismaMock }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/firebase", () => ({ firebaseAuth: () => ({ verifyIdToken }) }));

import { requireAuth, type AuthedRequest } from "./auth";

function buildApp() {
  const app = express();
  app.get("/me", requireAuth, (req, res) => res.json({ userId: (req as AuthedRequest).userId }));
  return app;
}

const EXISTING = { id: "user-victim", email: "victim@example.com", name: null, lastActiveAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.update.mockResolvedValue({});
  // No row for the new Firebase uid; an existing row for the email.
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { firebaseUid?: string; email?: string } }) =>
    where.email === EXISTING.email ? EXISTING : null,
  );
});

describe("requireAuth email linking", () => {
  it("refuses to link an unverified email to an existing user", async () => {
    verifyIdToken.mockResolvedValue({ uid: "attacker-uid", email: "Victim@example.com", email_verified: false });
    const res = await request(buildApp()).get("/me").set("Authorization", "Bearer t");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("email_not_verified");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("treats a missing email_verified claim as unverified", async () => {
    verifyIdToken.mockResolvedValue({ uid: "attacker-uid", email: "victim@example.com" });
    const res = await request(buildApp()).get("/me").set("Authorization", "Bearer t");
    expect(res.status).toBe(403);
  });

  it("links a verified email to the existing user", async () => {
    verifyIdToken.mockResolvedValue({ uid: "new-uid", email: "victim@example.com", email_verified: true });
    const res = await request(buildApp()).get("/me").set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(EXISTING.id);
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: EXISTING.id }, data: { firebaseUid: "new-uid" } });
  });

  it("still creates a brand-new user with an unverified email", async () => {
    verifyIdToken.mockResolvedValue({ uid: "fresh-uid", email: "new@example.com", email_verified: false });
    prismaMock.user.create.mockResolvedValue({ id: "user-new", email: "new@example.com", name: null, lastActiveAt: null });
    const res = await request(buildApp()).get("/me").set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("user-new");
  });
});

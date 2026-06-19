import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  connection: { deleteMany: vi.fn() },
  alertRule: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../../db/client", () => ({ prisma: prismaMock }));
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../lib/firebase", () => ({ firebaseAuth: () => ({}) }));
vi.mock("../../middleware/rateLimit", () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const header = req.headers.authorization as string | undefined;
    if (!header?.startsWith("Bearer ")) return _res.status(401).json({ error: "no auth" });
    req.userId = header.slice(7);
    next();
  },
}));

import authRoutes from "./auth.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => ops.map(() => ({ count: 0 })));
  prismaMock.connection.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.alertRule.deleteMany.mockResolvedValue({ count: 0 });
});

describe("POST /api/auth/logout — ephemeral wipe", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await request(buildApp()).post("/api/auth/logout").send({});
    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("deletes connections and alert rules scoped to the caller in one transaction", async () => {
    const res = await request(buildApp())
      .post("/api/auth/logout")
      .set("Authorization", "Bearer user-A")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    expect(prismaMock.connection.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-A" } });
    expect(prismaMock.alertRule.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-A" } });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Both deletes go through the same transaction array — atomic wipe.
    const txArg = prismaMock.$transaction.mock.calls[0][0];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg).toHaveLength(2);
  });

  it("does NOT touch User row — caller can sign back in", async () => {
    await request(buildApp())
      .post("/api/auth/logout")
      .set("Authorization", "Bearer user-A")
      .send({});

    // Critical anti-traffic guarantee: User row is preserved.
    const prismaAny = prismaMock as unknown as Record<string, unknown>;
    expect(prismaAny.user).not.toHaveProperty("deleteMany");
    expect((prismaMock.user as any).delete).toBeUndefined();
  });

  it("isolates wipe to the authenticated user only (multi-user safety)", async () => {
    await request(buildApp())
      .post("/api/auth/logout")
      .set("Authorization", "Bearer user-A")
      .send({});

    // Every where clause must filter by the caller's id — never a bare deleteMany.
    for (const call of prismaMock.connection.deleteMany.mock.calls) {
      expect(call[0]?.where?.userId).toBe("user-A");
    }
    for (const call of prismaMock.alertRule.deleteMany.mock.calls) {
      expect(call[0]?.where?.userId).toBe("user-A");
    }
  });

  it("is idempotent — second call returns 200 with zero rows", async () => {
    await request(buildApp())
      .post("/api/auth/logout")
      .set("Authorization", "Bearer user-A")
      .send({});
    const res = await request(buildApp())
      .post("/api/auth/logout")
      .set("Authorization", "Bearer user-A")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the local profile for the caller", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-A", email: "a@example.com", name: "A", createdAt: new Date("2026-01-01"),
    });
    const res = await request(buildApp()).get("/api/auth/me").set("Authorization", "Bearer user-A");
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("user-A");
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-A" },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  });

  it("404s when the user row is missing", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const res = await request(buildApp()).get("/api/auth/me").set("Authorization", "Bearer ghost");
    expect(res.status).toBe(404);
  });
});

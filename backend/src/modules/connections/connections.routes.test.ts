import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  connectionFindMany: vi.fn(),
  connectionFindFirst: vi.fn(),
  connectionDelete: vi.fn(),
  syncRunFindMany: vi.fn(),
  // Test-controlled identity for the stubbed requireAuth.
  callerWorkspaceId: "ws_default",
  callerUserRole: "media_buyer" as "admin" | "media_buyer" | "client",
}));

// Stub requireAuth: trust X-Test-User-Role + X-Test-Workspace-Id headers so each
// test can simulate any caller without minting Firebase tokens.
vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const headerRole = req.headers["x-test-user-role"];
    const headerWs = req.headers["x-test-workspace-id"];
    (req as any).userId = "u_caller";
    (req as any).workspaceId = typeof headerWs === "string" ? headerWs : mocks.callerWorkspaceId;
    (req as any).userRole = typeof headerRole === "string" ? headerRole : mocks.callerUserRole;
    (req as any).role = "owner";
    next();
  },
}));

vi.mock("../../db/client", () => ({
  prisma: {
    connection: {
      findMany: mocks.connectionFindMany,
      findFirst: mocks.connectionFindFirst,
      delete: mocks.connectionDelete,
    },
    syncRun: { findMany: mocks.syncRunFindMany },
  },
}));

import connectionsRoutes from "./connections.routes";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/connections", connectionsRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.callerWorkspaceId = "ws_default";
  mocks.callerUserRole = "media_buyer";
});

describe("GET /api/connections", () => {
  it("returns connections scoped to the caller's active workspace", async () => {
    mocks.connectionFindMany.mockResolvedValueOnce([
      { id: "c_1", platform: "facebook", accountId: "acc1" },
    ]);
    const res = await request(makeApp())
      .get("/api/connections")
      .set("X-Test-Workspace-Id", "ws_alpha");

    expect(res.status).toBe(200);
    expect(res.body.connections).toHaveLength(1);
    expect(mocks.connectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws_alpha" } }),
    );
  });

  it("is readable by all roles (admin, media_buyer, client)", async () => {
    // No requireRole on GET / — read access is intentionally open to every role
    // so clients can view dashboards without admin or media_buyer permissions.
    for (const role of ["admin", "media_buyer", "client"] as const) {
      mocks.connectionFindMany.mockResolvedValueOnce([]);
      const res = await request(makeApp())
        .get("/api/connections")
        .set("X-Test-User-Role", role);
      expect(res.status).toBe(200);
    }
  });
});

describe("GET /api/connections/:id/syncs", () => {
  it("returns 404 when the connection isn't in the caller's workspace", async () => {
    // Cross-workspace isolation: the findFirst with workspaceId scopes the lookup.
    mocks.connectionFindFirst.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .get("/api/connections/c_unknown/syncs")
      .set("X-Test-Workspace-Id", "ws_alpha");

    expect(res.status).toBe(404);
    expect(mocks.connectionFindFirst).toHaveBeenCalledWith({
      where: { id: "c_unknown", workspaceId: "ws_alpha" },
    });
    expect(mocks.syncRunFindMany).not.toHaveBeenCalled();
  });

  it("defaults the pagination limit to 50 when not supplied", async () => {
    mocks.connectionFindFirst.mockResolvedValueOnce({ id: "c_1" });
    mocks.syncRunFindMany.mockResolvedValueOnce([]);
    await request(makeApp()).get("/api/connections/c_1/syncs");
    expect(mocks.syncRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it("caps the pagination limit at 200 even when a larger value is requested", async () => {
    mocks.connectionFindFirst.mockResolvedValueOnce({ id: "c_1" });
    mocks.syncRunFindMany.mockResolvedValueOnce([]);
    await request(makeApp()).get("/api/connections/c_1/syncs?limit=9999");
    expect(mocks.syncRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it("falls back to 50 when limit is non-numeric (so NaN doesn't reach Prisma)", async () => {
    mocks.connectionFindFirst.mockResolvedValueOnce({ id: "c_1" });
    mocks.syncRunFindMany.mockResolvedValueOnce([]);
    await request(makeApp()).get("/api/connections/c_1/syncs?limit=banana");
    expect(mocks.syncRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });
});

describe("DELETE /api/connections/:id", () => {
  it("returns 403 role_forbidden for a client", async () => {
    const res = await request(makeApp())
      .delete("/api/connections/c_1")
      .set("X-Test-User-Role", "client");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("role_forbidden");
    expect(mocks.connectionDelete).not.toHaveBeenCalled();
  });

  it("returns 403 role_forbidden for an admin (admins manage users, not connections)", async () => {
    const res = await request(makeApp())
      .delete("/api/connections/c_1")
      .set("X-Test-User-Role", "admin");
    expect(res.status).toBe(403);
    expect(mocks.connectionDelete).not.toHaveBeenCalled();
  });

  it("returns 404 when the media buyer asks to delete a connection in a different workspace", async () => {
    mocks.connectionFindFirst.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .delete("/api/connections/c_1")
      .set("X-Test-Workspace-Id", "ws_beta");
    expect(res.status).toBe(404);
    expect(mocks.connectionDelete).not.toHaveBeenCalled();
  });

  it("deletes the connection for the media buyer who owns its workspace", async () => {
    mocks.connectionFindFirst.mockResolvedValueOnce({ id: "c_42", workspaceId: "ws_alpha" });
    mocks.connectionDelete.mockResolvedValueOnce({ id: "c_42" });

    const res = await request(makeApp())
      .delete("/api/connections/c_42")
      .set("X-Test-Workspace-Id", "ws_alpha")
      .set("X-Test-User-Role", "media_buyer");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mocks.connectionDelete).toHaveBeenCalledWith({ where: { id: "c_42" } });
  });
});

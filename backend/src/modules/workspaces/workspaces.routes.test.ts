import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  memberFindMany: vi.fn(),
  memberFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  workspaceCreate: vi.fn(),
  workspaceUpdate: vi.fn(),
  callerUserRole: "media_buyer" as "admin" | "media_buyer" | "client",
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const headerRole = req.headers["x-test-user-role"];
    (req as any).userId = "u_caller";
    (req as any).workspaceId = "ws_caller_active";
    (req as any).role = "owner";
    (req as any).userRole = typeof headerRole === "string" ? headerRole : mocks.callerUserRole;
    next();
  },
}));

vi.mock("../../db/client", () => ({
  prisma: {
    workspaceMember: { findMany: mocks.memberFindMany, findUnique: mocks.memberFindUnique },
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    workspace: { create: mocks.workspaceCreate, update: mocks.workspaceUpdate },
  },
}));

import workspacesRoutes from "./workspaces.routes";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/workspaces", workspacesRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.callerUserRole = "media_buyer";
});

describe("GET /api/workspaces", () => {
  it("returns the caller's workspaces with an `active` flag matching the user's activeWorkspaceId", async () => {
    mocks.memberFindMany.mockResolvedValueOnce([
      { role: "owner", workspace: { id: "ws_a", name: "Alpha", createdAt: new Date("2026-01-01") } },
      { role: "member", workspace: { id: "ws_b", name: "Beta", createdAt: new Date("2026-02-01") } },
    ]);
    mocks.userFindUnique.mockResolvedValueOnce({ activeWorkspaceId: "ws_b" });

    const res = await request(makeApp()).get("/api/workspaces");

    expect(res.status).toBe(200);
    expect(res.body.workspaces).toHaveLength(2);
    expect(res.body.workspaces[0]).toMatchObject({ id: "ws_a", role: "owner", active: false });
    expect(res.body.workspaces[1]).toMatchObject({ id: "ws_b", role: "member", active: true });
  });

  it("is readable by every role (read-only listing)", async () => {
    for (const role of ["admin", "media_buyer", "client"] as const) {
      mocks.memberFindMany.mockResolvedValueOnce([]);
      mocks.userFindUnique.mockResolvedValueOnce({ activeWorkspaceId: null });
      const res = await request(makeApp())
        .get("/api/workspaces")
        .set("X-Test-User-Role", role);
      expect(res.status).toBe(200);
    }
  });
});

describe("POST /api/workspaces", () => {
  it("rejects clients (read-only role)", async () => {
    const res = await request(makeApp())
      .post("/api/workspaces")
      .set("X-Test-User-Role", "client")
      .send({ name: "New Space" });
    expect(res.status).toBe(403);
    expect(mocks.workspaceCreate).not.toHaveBeenCalled();
  });

  it("rejects admins (admins manage users, not workspaces)", async () => {
    const res = await request(makeApp())
      .post("/api/workspaces")
      .set("X-Test-User-Role", "admin")
      .send({ name: "New Space" });
    expect(res.status).toBe(403);
    expect(mocks.workspaceCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing or empty", async () => {
    const res1 = await request(makeApp()).post("/api/workspaces").send({});
    expect(res1.status).toBe(400);
    const res2 = await request(makeApp()).post("/api/workspaces").send({ name: "   " });
    expect(res2.status).toBe(400);
    expect(mocks.workspaceCreate).not.toHaveBeenCalled();
  });

  it("creates the workspace and seats the caller as owner", async () => {
    mocks.workspaceCreate.mockResolvedValueOnce({
      id: "ws_new", name: "Trimmed Name", createdAt: new Date("2026-06-01"),
    });
    const res = await request(makeApp()).post("/api/workspaces").send({ name: "  Trimmed Name  " });

    expect(res.status).toBe(201);
    expect(res.body.workspace).toMatchObject({ id: "ws_new", name: "Trimmed Name", role: "owner" });
    const arg = mocks.workspaceCreate.mock.calls[0][0];
    expect(arg.data.name).toBe("Trimmed Name");
    expect(arg.data.members.create).toEqual({ userId: "u_caller", role: "owner" });
  });
});

describe("POST /api/workspaces/switch", () => {
  it("returns 400 when workspaceId is missing", async () => {
    const res = await request(makeApp()).post("/api/workspaces/switch").send({});
    expect(res.status).toBe(400);
  });

  it("returns 403 when the caller isn't a member of the target workspace", async () => {
    mocks.memberFindUnique.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .post("/api/workspaces/switch")
      .send({ workspaceId: "ws_other" });
    expect(res.status).toBe(403);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("updates the caller's activeWorkspaceId when they're a member", async () => {
    mocks.memberFindUnique.mockResolvedValueOnce({ role: "member" });
    mocks.userUpdate.mockResolvedValueOnce({});
    const res = await request(makeApp())
      .post("/api/workspaces/switch")
      .send({ workspaceId: "ws_target" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, activeWorkspaceId: "ws_target" });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "u_caller" },
      data: { activeWorkspaceId: "ws_target" },
    });
  });

  it("is callable by clients (switching is a read-context change, not a mutation of shared state)", async () => {
    mocks.memberFindUnique.mockResolvedValueOnce({ role: "member" });
    mocks.userUpdate.mockResolvedValueOnce({});
    const res = await request(makeApp())
      .post("/api/workspaces/switch")
      .set("X-Test-User-Role", "client")
      .send({ workspaceId: "ws_target" });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/workspaces/:id", () => {
  it("rejects clients", async () => {
    const res = await request(makeApp())
      .patch("/api/workspaces/ws_x")
      .set("X-Test-User-Role", "client")
      .send({ name: "Renamed" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the caller is not a member", async () => {
    mocks.memberFindUnique.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .patch("/api/workspaces/ws_x")
      .send({ name: "Renamed" });
    expect(res.status).toBe(404);
    expect(mocks.workspaceUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is a member but not an owner", async () => {
    mocks.memberFindUnique.mockResolvedValueOnce({ role: "member" });
    const res = await request(makeApp())
      .patch("/api/workspaces/ws_x")
      .send({ name: "Renamed" });
    expect(res.status).toBe(403);
    expect(mocks.workspaceUpdate).not.toHaveBeenCalled();
  });

  it("renames the workspace when the caller is an owner", async () => {
    mocks.memberFindUnique.mockResolvedValueOnce({ role: "owner" });
    mocks.workspaceUpdate.mockResolvedValueOnce({ id: "ws_x", name: "Renamed" });
    const res = await request(makeApp())
      .patch("/api/workspaces/ws_x")
      .send({ name: "  Renamed  " });
    expect(res.status).toBe(200);
    expect(mocks.workspaceUpdate).toHaveBeenCalledWith({
      where: { id: "ws_x" },
      data: { name: "Renamed" },
    });
  });
});

describe("GET /api/workspaces/:id/members", () => {
  it("returns 404 when the caller is not a member", async () => {
    mocks.memberFindUnique.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get("/api/workspaces/ws_x/members");
    expect(res.status).toBe(404);
  });

  it("returns the member list when the caller is a member", async () => {
    mocks.memberFindUnique.mockResolvedValueOnce({ role: "member" });
    mocks.memberFindMany.mockResolvedValueOnce([
      { id: "m1", role: "owner", joinedAt: new Date(), user: { id: "u1", email: "a@x.com", name: "A" } },
    ]);
    const res = await request(makeApp()).get("/api/workspaces/ws_x/members");
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
  });
});

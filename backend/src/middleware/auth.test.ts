import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// vi.mock factories are hoisted above imports, so the doubles they reference must be
// created via vi.hoisted to also live at the top of the file.
const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  memberFindUnique: vi.fn(),
  wsCreate: vi.fn(),
}));

vi.mock("../lib/firebase", () => ({ firebaseAuth: () => ({ verifyIdToken: mocks.verifyIdToken }) }));
vi.mock("../db/client", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique, create: mocks.create, update: mocks.update },
    workspace: { create: mocks.wsCreate },
    workspaceMember: { findUnique: mocks.memberFindUnique },
  },
}));
vi.mock("../modules/alerts/alerts.service", () => ({ seedDefaultRules: vi.fn() }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { verifyIdToken, findUnique, create, update, memberFindUnique, wsCreate } = mocks;

import { requireAuth } from "./auth";

function makeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAuth middleware", () => {
  it("rejects requests missing the Authorization header", async () => {
    const req = { headers: {} } as Request;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects requests with an Authorization header that isn't a Bearer token", async () => {
    const req = { headers: { authorization: "Basic abc123" } } as Request;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects requests whose Firebase ID token fails verification", async () => {
    verifyIdToken.mockRejectedValueOnce(new Error("invalid token"));
    const req = { headers: { authorization: "Bearer not-a-real-token" } } as Request;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("resolves an existing user by firebaseUid and attaches userId/workspaceId/role", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_abc", email: "x@y.com" });
    findUnique
      .mockResolvedValueOnce({ id: "u_1", activeWorkspaceId: "ws_1", email: "x@y.com", name: null });
    memberFindUnique.mockResolvedValueOnce({ role: "owner" });

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe("u_1");
    expect(req.workspaceId).toBe("ws_1");
    expect(req.role).toBe("owner");
    expect(res.status).not.toHaveBeenCalled();
    // Should NOT have tried to provision a new user / workspace.
    expect(create).not.toHaveBeenCalled();
    expect(wsCreate).not.toHaveBeenCalled();
  });

  it("links a legacy user (no firebaseUid yet) by matching email", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_new_session", email: "legacy@example.com" });
    // First lookup by firebaseUid: not found.
    findUnique.mockResolvedValueOnce(null);
    // Second lookup by email: legacy user with no firebaseUid found.
    findUnique.mockResolvedValueOnce({ id: "u_legacy", activeWorkspaceId: "ws_legacy", email: "legacy@example.com", name: "Legacy" });
    update.mockResolvedValueOnce({});
    memberFindUnique.mockResolvedValueOnce({ role: "owner" });

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u_legacy" },
        data: expect.objectContaining({ firebaseUid: "fb_new_session", pendingMigration: false, passwordHash: null }),
      }),
    );
    expect(req.userId).toBe("u_legacy");
    expect(req.workspaceId).toBe("ws_legacy");
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 when the user is not a member of the active workspace", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_abc", email: "x@y.com" });
    findUnique.mockResolvedValueOnce({ id: "u_1", activeWorkspaceId: "ws_other", email: "x@y.com", name: null });
    memberFindUnique.mockResolvedValueOnce(null);

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

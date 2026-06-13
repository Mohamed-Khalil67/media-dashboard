import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// vi.mock factories are hoisted above imports, so the doubles they reference must be
// created via vi.hoisted to also live at the top of the file.
const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  // `update` is also called fire-and-forget (lastActiveAt bump), so we need
  // a default-resolving promise so unrelated tests don't crash with
  // "Cannot read properties of undefined (reading 'catch')".
  update: vi.fn().mockResolvedValue({}),
  memberFindUnique: vi.fn(),
  wsCreate: vi.fn(),
  allowedFindUnique: vi.fn(),
  syncUserConnections: vi.fn().mockResolvedValue([]),
}));

vi.mock("../lib/firebase", () => ({ firebaseAuth: () => ({ verifyIdToken: mocks.verifyIdToken }) }));
vi.mock("../db/client", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique, create: mocks.create, update: mocks.update },
    workspace: { create: mocks.wsCreate },
    workspaceMember: { findUnique: mocks.memberFindUnique },
    allowedEmail: { findUnique: mocks.allowedFindUnique },
  },
}));
vi.mock("../modules/alerts/alerts.service", () => ({ seedDefaultRules: vi.fn() }));
vi.mock("../jobs/sync.job", () => ({ syncUserConnections: mocks.syncUserConnections }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { verifyIdToken, findUnique, create, update, memberFindUnique, wsCreate, allowedFindUnique } = mocks;

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

  it("resolves an existing user by firebaseUid and attaches userId/workspaceId/role + userRole", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_abc", email: "x@y.com" });
    allowedFindUnique.mockResolvedValueOnce({ id: "ae_1" });
    findUnique
      .mockResolvedValueOnce({ id: "u_1", activeWorkspaceId: "ws_1", email: "x@y.com", name: null, role: "admin", disabled: false });
    memberFindUnique.mockResolvedValueOnce({ role: "owner" });

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe("u_1");
    expect(req.workspaceId).toBe("ws_1");
    expect(req.role).toBe("owner");
    expect(req.userRole).toBe("admin");
    expect(res.status).not.toHaveBeenCalled();
    // Should NOT have tried to provision a new user / workspace.
    expect(create).not.toHaveBeenCalled();
    expect(wsCreate).not.toHaveBeenCalled();
  });

  it("links a legacy user (no firebaseUid yet) by matching email", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_new_session", email: "legacy@example.com" });
    allowedFindUnique.mockResolvedValueOnce({ id: "ae_legacy" });
    // First lookup by firebaseUid: not found.
    findUnique.mockResolvedValueOnce(null);
    // Second lookup by email: legacy user with no firebaseUid found.
    findUnique.mockResolvedValueOnce({ id: "u_legacy", activeWorkspaceId: "ws_legacy", email: "legacy@example.com", name: "Legacy", role: "client", disabled: false });
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

  it("links a legacy user when the Firebase token email differs in case from the stored row", async () => {
    // Firebase token comes back with mixed casing; the DB stores lowercase.
    // Allowlist must use lowercase, legacy lookup must use lowercase, else
    // we'd miss the existing User and double-provision.
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_case_link", email: "Legacy.User@Example.COM" });
    allowedFindUnique.mockResolvedValueOnce({ id: "ae_case" });
    findUnique.mockResolvedValueOnce(null); // no row by firebaseUid
    findUnique.mockResolvedValueOnce({
      id: "u_legacy_case",
      activeWorkspaceId: "ws_legacy_case",
      email: "legacy.user@example.com",
      name: "Legacy",
      role: "client",
      disabled: false,
    });
    memberFindUnique.mockResolvedValueOnce({ role: "owner" });

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    // Critical: the legacy lookup must have been against the lowercase email,
    // not the mixed-case claim, otherwise it would silently miss.
    expect(findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { email: "legacy.user@example.com" } }),
    );
    expect(req.userId).toBe("u_legacy_case");
    expect(create).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("blocks sign-in with 403 access_denied when email is not on the allowlist", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_intruder", email: "outsider@example.com" });
    allowedFindUnique.mockResolvedValueOnce(null);

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(allowedFindUnique).toHaveBeenCalledWith({
      where: { email: "outsider@example.com" },
      select: { id: true },
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "access_denied" }),
    );
    // Critically: no User row should be created for a denied email.
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("triggers a background sync for a returning media buyer past the activity window", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_mb", email: "buyer@example.com" });
    allowedFindUnique.mockResolvedValueOnce({ id: "ae_mb" });
    const oldDate = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
    findUnique.mockResolvedValueOnce({
      id: "u_mb", activeWorkspaceId: "ws_mb", email: "buyer@example.com", name: null,
      role: "media_buyer", disabled: false, lastActiveAt: oldDate,
    });
    memberFindUnique.mockResolvedValueOnce({ role: "owner" });

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(mocks.syncUserConnections).toHaveBeenCalledWith("u_mb", expect.objectContaining({ reason: expect.any(String) }));
  });

  it("does NOT trigger a background sync for a media buyer still inside the activity window", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_mb", email: "buyer@example.com" });
    allowedFindUnique.mockResolvedValueOnce({ id: "ae_mb" });
    const recent = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    findUnique.mockResolvedValueOnce({
      id: "u_mb", activeWorkspaceId: "ws_mb", email: "buyer@example.com", name: null,
      role: "media_buyer", disabled: false, lastActiveAt: recent,
    });
    memberFindUnique.mockResolvedValueOnce({ role: "owner" });

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(mocks.syncUserConnections).not.toHaveBeenCalled();
  });

  it("does NOT trigger a background sync for a client even when idle", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_client", email: "client@example.com" });
    allowedFindUnique.mockResolvedValueOnce({ id: "ae_client" });
    findUnique.mockResolvedValueOnce({
      id: "u_client", activeWorkspaceId: "ws_c", email: "client@example.com", name: null,
      role: "client", disabled: false, lastActiveAt: null,
    });
    memberFindUnique.mockResolvedValueOnce({ role: "member" });

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(mocks.syncUserConnections).not.toHaveBeenCalled();
  });

  it("normalizes the email to lowercase before checking the allowlist", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_case", email: "Mixed.Case@Example.COM" });
    allowedFindUnique.mockResolvedValueOnce({ id: "ae_case" });
    findUnique.mockResolvedValueOnce({ id: "u_case", activeWorkspaceId: "ws_case", email: "mixed.case@example.com", name: null, role: "media_buyer", disabled: false });
    memberFindUnique.mockResolvedValueOnce({ role: "member" });

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(allowedFindUnique).toHaveBeenCalledWith({
      where: { email: "mixed.case@example.com" },
      select: { id: true },
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it("blocks sign-in with 403 access_denied when the user is disabled", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_disabled", email: "disabled@example.com" });
    allowedFindUnique.mockResolvedValueOnce({ id: "ae_disabled" });
    findUnique.mockResolvedValueOnce({ id: "u_disabled", activeWorkspaceId: "ws_d", email: "disabled@example.com", name: null, role: "client", disabled: true });

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "access_denied" }));
    // Should bail before touching workspace membership.
    expect(memberFindUnique).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a member of the active workspace", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "fb_abc", email: "x@y.com" });
    allowedFindUnique.mockResolvedValueOnce({ id: "ae_1" });
    findUnique.mockResolvedValueOnce({ id: "u_1", activeWorkspaceId: "ws_other", email: "x@y.com", name: null, role: "client", disabled: false });
    memberFindUnique.mockResolvedValueOnce(null);

    const req: any = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

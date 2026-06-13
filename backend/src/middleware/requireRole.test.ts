import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { requireRole } from "./requireRole";

function makeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("requireRole middleware", () => {
  it("calls next when the user's role is in the allowed list", () => {
    const req = { userRole: "media_buyer" } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    requireRole("media_buyer")(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 role_forbidden when the user's role is not allowed", () => {
    const req = { userRole: "client" } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    requireRole("media_buyer")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "role_forbidden" }));
  });

  it("accepts any of multiple allowed roles", () => {
    const req = { userRole: "admin" } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    requireRole("admin", "media_buyer")(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects when userRole is undefined (auth middleware didn't run)", () => {
    const req = {} as Request;
    const res = makeRes();
    const next = vi.fn();
    requireRole("media_buyer")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

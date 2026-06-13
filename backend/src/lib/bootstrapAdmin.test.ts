import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  allowedUpsert: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("../db/client", () => ({
  prisma: {
    allowedEmail: { upsert: mocks.allowedUpsert },
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
  },
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ensureBootstrapAdmin } from "./bootstrapAdmin";

const originalEnv = process.env.BOOTSTRAP_ADMIN_EMAIL;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env.BOOTSTRAP_ADMIN_EMAIL;
  else process.env.BOOTSTRAP_ADMIN_EMAIL = originalEnv;
});

describe("ensureBootstrapAdmin", () => {
  it("does nothing when BOOTSTRAP_ADMIN_EMAIL is unset", async () => {
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    await ensureBootstrapAdmin();
    expect(mocks.allowedUpsert).not.toHaveBeenCalled();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("upserts the AllowedEmail row and promotes a non-admin User to admin", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "Boss@Example.com";
    mocks.userFindUnique.mockResolvedValueOnce({ id: "u_boss", role: "client", disabled: false });
    await ensureBootstrapAdmin();
    expect(mocks.allowedUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: "boss@example.com" },
    }));
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "u_boss" },
      data: { role: "admin", disabled: false },
    });
  });

  it("re-enables a disabled bootstrap admin", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "boss@example.com";
    mocks.userFindUnique.mockResolvedValueOnce({ id: "u_boss", role: "admin", disabled: true });
    await ensureBootstrapAdmin();
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "u_boss" },
      data: { role: "admin", disabled: false },
    });
  });

  it("leaves an already-admin enabled bootstrap admin alone", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "boss@example.com";
    mocks.userFindUnique.mockResolvedValueOnce({ id: "u_boss", role: "admin", disabled: false });
    await ensureBootstrapAdmin();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("upserts the allowlist even when no User row exists yet", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "future@example.com";
    mocks.userFindUnique.mockResolvedValueOnce(null);
    await ensureBootstrapAdmin();
    expect(mocks.allowedUpsert).toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("swallows DB errors so the server can still boot", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "boss@example.com";
    mocks.allowedUpsert.mockRejectedValueOnce(new Error("db is down"));
    await expect(ensureBootstrapAdmin()).resolves.toBeUndefined();
  });
});

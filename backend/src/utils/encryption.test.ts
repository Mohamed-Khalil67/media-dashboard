import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { encrypt, decrypt } from "./encryption";

beforeAll(() => {
  // Deterministic 32-byte key for the test suite.
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
});

describe("encryption util", () => {
  it("round-trips a plaintext string", () => {
    const secret = "this-is-an-oauth-access-token-abc123";
    const cipher = encrypt(secret);
    expect(cipher).not.toContain(secret);
    expect(decrypt(cipher)).toBe(secret);
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encrypt("same-secret");
    const b = encrypt("same-secret");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same-secret");
    expect(decrypt(b)).toBe("same-secret");
  });

  it("rejects tampered ciphertext via GCM auth tag", () => {
    const cipher = encrypt("hello");
    const decoded = Buffer.from(cipher, "base64");
    // Flip a byte in the encrypted-text region (after IV+tag = 28 bytes).
    decoded[decoded.length - 1] ^= 0x01;
    const tampered = decoded.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws if ENCRYPTION_KEY is missing", () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = saved;
  });

  it("throws if ENCRYPTION_KEY is the wrong length", () => {
    const saved = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "ab".repeat(16); // 16 bytes, not 32
    expect(() => encrypt("x")).toThrow(/32 bytes/);
    process.env.ENCRYPTION_KEY = saved;
  });
});

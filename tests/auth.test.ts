import { describe, expect, it } from "vitest";

describe("password hashing", () => {
  it("verifies a scrypt password hash", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth/password");
    const hash = await hashPassword("newus-but-longer");

    await expect(verifyPassword("newus-but-longer", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});

describe("csrf tokens", () => {
  it("accepts matching tokens and rejects mismatches", async () => {
    const { createCsrfToken, verifyCsrfToken } = await import("@/lib/auth/csrf");
    const token = createCsrfToken();

    expect(verifyCsrfToken(token, token)).toBe(true);
    expect(verifyCsrfToken(token, "bad")).toBe(false);
  });
});

describe("login rate limiter", () => {
  it("blocks after the configured number of failures", async () => {
    const { createRateLimiter } = await import("@/lib/auth/rate-limit");
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });

    expect(limiter.hit("127.0.0.1").allowed).toBe(true);
    expect(limiter.hit("127.0.0.1").allowed).toBe(true);
    expect(limiter.hit("127.0.0.1").allowed).toBe(false);
  });
});

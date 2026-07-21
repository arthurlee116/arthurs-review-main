import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-auth-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "http://localhost:3000";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
  process.env.SESSION_SECRET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  const { migrate } = await import("@/lib/db/migrate");
  migrate();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

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

describe("revocable admin sessions", () => {
  it("revokes the previous login when the single-device admin logs in again", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    const { createSessionRecord, verifySessionCookie } = await import("@/lib/auth/session");
    const first = createSessionRecord({ now });
    expect(await verifySessionCookie(first.token, new Date("2026-07-21T00:01:00.000Z"))).toBe(true);

    const second = createSessionRecord({ now: new Date("2026-07-21T00:02:00.000Z") });

    expect(await verifySessionCookie(first.token, new Date("2026-07-21T00:03:00.000Z"))).toBe(false);
    expect(await verifySessionCookie(second.token, new Date("2026-07-21T00:03:00.000Z"))).toBe(true);
  });

  it("stores only a SHA-256 token hash and rejects expired, missing, or tampered tokens", async () => {
    const { getDb } = await import("@/lib/db/connection");
    const { createSessionRecord, verifySessionCookie } = await import("@/lib/auth/session");
    const session = createSessionRecord({ now: new Date("2026-07-21T00:00:00.000Z"), ttlMs: 1_000 });
    const row = getDb().prepare("select token_hash from admin_sessions").get() as { token_hash: string };

    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.token_hash).not.toContain(session.token);
    expect(await verifySessionCookie(undefined)).toBe(false);
    expect(await verifySessionCookie(`${session.token}x`, new Date("2026-07-21T00:00:00.500Z"))).toBe(false);
    expect(await verifySessionCookie(session.token, new Date("2026-07-21T00:00:01.001Z"))).toBe(false);
  });

  it("revokes the current token immediately on logout", async () => {
    const { csrfCookie, sessionCookie } = await import("@/lib/auth/constants");
    const { createSessionRecord, verifySessionCookie } = await import("@/lib/auth/session");
    const session = createSessionRecord();
    const csrf = "logout-csrf";
    const route = await import("@/app/studio/api/auth/logout/route");

    const response = await route.POST(
      new Request("http://localhost/studio/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: `${sessionCookie}=${session.token}; ${csrfCookie}=${csrf}`,
          "x-csrf-token": csrf,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await verifySessionCookie(session.token)).toBe(false);
    expect(response.headers.get("set-cookie")).toContain(`${sessionCookie}=`);
  });
});

describe("durable login rate limiter", () => {
  it("survives a database reconnect and never stores the raw IP", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    const { getDb, closeDb } = await import("@/lib/db/connection");
    const { checkLoginRateLimit } = await import("@/lib/auth/rate-limit");

    expect(checkLoginRateLimit("203.0.113.8", { max: 2, windowMs: 60_000, now }).allowed).toBe(true);
    const stored = getDb().prepare("select ip_hash from login_attempts").get() as { ip_hash: string };
    expect(stored.ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.ip_hash).not.toContain("203.0.113.8");
    closeDb();
    vi.resetModules();
    const { checkLoginRateLimit: checkAfterRestart } = await import("@/lib/auth/rate-limit");

    expect(checkAfterRestart("203.0.113.8", { max: 2, windowMs: 60_000, now }).allowed).toBe(true);
    expect(checkAfterRestart("203.0.113.8", { max: 2, windowMs: 60_000, now }).allowed).toBe(false);
  });

  it("cleans expired attempts and resets the current IP after a successful login", async () => {
    const { getDb } = await import("@/lib/db/connection");
    const { checkLoginRateLimit, resetLoginRateLimit } = await import("@/lib/auth/rate-limit");
    const first = new Date("2026-07-21T00:00:00.000Z");
    const later = new Date("2026-07-21T00:02:00.000Z");
    checkLoginRateLimit("198.51.100.5", { max: 2, windowMs: 60_000, now: first });
    expect(checkLoginRateLimit("198.51.100.5", { max: 2, windowMs: 60_000, now: later }).remaining).toBe(1);
    expect(getDb().prepare("select count(*) as count from login_attempts").get()).toEqual({ count: 1 });

    resetLoginRateLimit("198.51.100.5");
    expect(getDb().prepare("select count(*) as count from login_attempts").get()).toEqual({ count: 0 });
  });
});

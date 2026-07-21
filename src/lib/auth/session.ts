import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/connection";
import { sessionCookie } from "./constants";

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createSessionRecord({
  now = new Date(),
  ttlMs = DEFAULT_SESSION_TTL_MS,
}: {
  now?: Date;
  ttlMs?: number;
} = {}) {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  db.transaction(() => {
    db.prepare("delete from admin_sessions where expires_at <= ?").run(createdAt);
    db.prepare("update admin_sessions set revoked_at = ? where revoked_at is null").run(createdAt);
    db.prepare("insert into admin_sessions(token_hash, created_at, expires_at) values (?, ?, ?)")
      .run(tokenHash(token), createdAt, expiresAt);
  }).immediate();
  return { token, expiresAt: new Date(expiresAt) };
}

export async function createSession() {
  const session = createSessionRecord();
  const store = await cookies();
  store.set(sessionCookie, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  return session.token;
}

export function revokeSessionToken(value: string | undefined, now = new Date()) {
  if (!value) return false;
  const result = getDb()
    .prepare("update admin_sessions set revoked_at = ? where token_hash = ? and revoked_at is null")
    .run(now.toISOString(), tokenHash(value));
  return result.changes === 1;
}

export async function verifySessionCookie(value?: string, now = new Date()) {
  if (!value) return false;
  const row = getDb()
    .prepare(
      `select 1
       from admin_sessions
       where token_hash = ? and revoked_at is null and expires_at > ?`,
    )
    .get(tokenHash(value), now.toISOString());
  return Boolean(row);
}

export async function isAdminSession() {
  const store = await cookies();
  return verifySessionCookie(store.get(sessionCookie)?.value);
}

export async function requireAdmin() {
  if (!(await isAdminSession())) redirect("/studio/login");
}

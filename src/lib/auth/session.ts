import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { csrfCookie, sessionCookie } from "./constants";

function key() {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

export async function createSession() {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key());
  const store = await cookies();
  store.set(sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(sessionCookie);
  store.delete(csrfCookie);
}

export async function verifySessionCookie(value?: string) {
  if (!value) return false;
  try {
    const result = await jwtVerify(value, key(), { algorithms: ["HS256"] });
    return result.payload.role === "admin";
  } catch {
    return false;
  }
}

export async function isAdminSession() {
  const store = await cookies();
  return verifySessionCookie(store.get(sessionCookie)?.value);
}

export async function requireAdmin() {
  if (!(await isAdminSession())) redirect("/studio/login");
}

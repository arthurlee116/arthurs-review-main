import { cookies } from "next/headers";
import { createCsrfToken } from "@/lib/auth/csrf";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";
import { csrfCookie } from "@/lib/auth/constants";
import { verifyPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/env";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const env = getEnv();
  const hit = checkLoginRateLimit(ip, {
    max: env.LOGIN_RATE_LIMIT_MAX,
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  });
  if (!hit.allowed) return Response.json({ error: "Invalid password" }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!(await verifyPassword(body.password ?? "", env.ADMIN_PASSWORD_HASH))) {
    return Response.json({ error: "Invalid password" }, { status: 401 });
  }

  resetLoginRateLimit(ip);
  await createSession();
  const csrf = createCsrfToken();
  const store = await cookies();
  store.set(csrfCookie, csrf, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return Response.json({ ok: true, csrf });
}

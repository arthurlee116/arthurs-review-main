import { cookies } from "next/headers";
import { createCsrfToken } from "@/lib/auth/csrf";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";
import { csrfCookie } from "@/lib/auth/constants";
import { verifyPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/env";

const limiter = createRateLimiter({
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 8),
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const hit = limiter.hit(ip);
  if (!hit.allowed) return Response.json({ error: "Invalid password" }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!(await verifyPassword(body.password ?? "", getEnv().ADMIN_PASSWORD_HASH))) {
    return Response.json({ error: "Invalid password" }, { status: 401 });
  }

  limiter.reset(ip);
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

import { cookies } from "next/headers";
import { createCsrfToken } from "@/lib/auth/csrf";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";
import { csrfCookie } from "@/lib/auth/constants";
import { verifyPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/env";

// Native <form> posts are urlencoded/multipart and expect a redirect; JSON clients get JSON.
// Relative Location on purpose: behind haproxy/Caddy, request.url is not the public origin.
function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST(request: Request) {
  const isJson = request.headers.get("content-type")?.includes("application/json") ?? false;
  const fail = (status: number, error: string, code: string) =>
    isJson ? Response.json({ error }, { status }) : redirect(`/studio/login?error=${code}`);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const env = getEnv();
  const hit = checkLoginRateLimit(ip, {
    max: env.LOGIN_RATE_LIMIT_MAX,
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  });
  if (!hit.allowed) return fail(429, "Invalid password", "rate");

  // `username` is accepted and ignored: it exists so password managers can save the login.
  let password = "";
  if (isJson) {
    const body = (await request.json().catch(() => ({}))) as { password?: string };
    password = body.password ?? "";
  } else {
    const form = await request.formData().catch(() => null);
    const value = form?.get("password");
    password = typeof value === "string" ? value : "";
  }
  if (!(await verifyPassword(password, env.ADMIN_PASSWORD_HASH))) return fail(401, "Invalid password", "invalid");

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
  return isJson ? Response.json({ ok: true, csrf }) : redirect("/studio/articles");
}

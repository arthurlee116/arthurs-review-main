import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { csrfCookie, sessionCookie } from "@/lib/auth/constants";
import { revokeSessionToken } from "@/lib/auth/session";

function cookieValue(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    revokeSessionToken(cookieValue(request, sessionCookie));
    const response = Response.json({ ok: true });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.headers.append("set-cookie", `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
    response.headers.append("set-cookie", `${csrfCookie}=; Path=/; Max-Age=0; SameSite=Lax${secure}`);
    return response;
  } catch (error) {
    return apiError(error);
  }
}

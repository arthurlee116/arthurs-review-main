import { NextRequest } from "next/server";
import { z } from "zod";
import { csrfCookie, sessionCookie } from "@/lib/auth/constants";
import { verifyCsrfToken } from "@/lib/auth/csrf";
import { verifySessionCookie } from "@/lib/auth/session";

export const ArticleBodySchema = z.object({
  titleZh: z.string().min(1),
  titleEn: z.string().nullable(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.enum(["commentary", "society", "misc"]),
  excerptZh: z.string(),
  excerptEn: z.string().nullable(),
  seoDescription: z.string(),
  bodyZh: z.string().min(1),
  bodyEn: z.string().nullable(),
  tagIds: z.array(z.number().int().positive()),
  coverImagePath: z.string().nullable(),
});

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function requireApiAdmin(request: Request, { csrf = true } = {}) {
  const nextCookies = (request as NextRequest).cookies;
  const session = nextCookies?.get(sessionCookie)?.value ?? cookieValue(request, sessionCookie);
  if (!(await verifySessionCookie(session))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (csrf && request.method !== "GET") {
    const expected = nextCookies?.get(csrfCookie)?.value ?? cookieValue(request, csrfCookie);
    const received = request.headers.get("x-csrf-token") ?? undefined;
    if (!verifyCsrfToken(expected, received)) {
      return Response.json({ error: "Invalid CSRF token" }, { status: 403 });
    }
  }

  return null;
}

export function apiError(error: unknown) {
  if (error instanceof z.ZodError) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof error === "object" && error && "code" in error && String((error as { code?: unknown }).code).startsWith("SQLITE_CONSTRAINT")) {
    return Response.json({ error: "A record with those unique fields already exists." }, { status: 409 });
  }
  if (error instanceof Error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}

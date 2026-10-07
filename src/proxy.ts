import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/auth/constants";
import { isLocale, localeCookie, localizedPath } from "@/lib/i18n/locale";
import { lookupCountry, preferredLocale } from "@/lib/i18n/geoip";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/studio" || pathname.startsWith("/studio/")) {
    if (pathname === "/studio/login" || pathname.startsWith("/studio/api/auth/login")) return NextResponse.next();
    if (!request.cookies.get(sessionCookie)?.value) return NextResponse.redirect(new URL("/studio/login", request.url));
    return NextResponse.next();
  }
  if (/^\/(?:_next|media|og|healthz|version|internal)(?:\/|$)/.test(pathname) ||
      /^\/proofs\/\d+\/(?:ots|source)$/.test(pathname) ||
      /\.[a-z0-9]+$/i.test(pathname) || !["GET", "HEAD"].includes(request.method)) return NextResponse.next();
  const prefix = pathname.split("/")[1];
  if (isLocale(prefix)) return NextResponse.next();
  const hint = request.nextUrl.searchParams.get("lang");
  const cookie = request.cookies.get(localeCookie)?.value;
  const locale = isLocale(hint) ? hint : isLocale(cookie) ? cookie : preferredLocale(cookie, lookupCountry(request.headers.get("x-real-ip")));
  const url = request.nextUrl.clone();
  url.pathname = localizedPath(pathname, locale);
  url.searchParams.delete("lang");
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

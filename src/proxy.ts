import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/auth/constants";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/studio") || pathname === "/studio/login" || pathname.startsWith("/studio/api/auth/login")) {
    return NextResponse.next();
  }
  const session = request.cookies.get(sessionCookie)?.value;
  if (!session) {
    return NextResponse.redirect(new URL("/studio/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/studio/:path*"],
};

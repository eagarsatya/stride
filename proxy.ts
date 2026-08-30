import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect for anonymous visitors.
 *
 * This only checks that a session cookie exists -- it deliberately does not
 * validate it, because hitting the database on every request would be wasteful.
 * Pages and server actions re-verify through `requireUser()`.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const signInUrl = new URL("/", request.url);
  signInUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/activities/:path*",
    "/trends/:path*",
    "/records/:path*",
    "/settings/:path*",
  ],
};

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

const ADMIN_ONLY_PATHS = ["/admin/settings", "/admin/users"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect all /admin routes — require any authenticated user
  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get("session")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      const role = payload.role as string;

      if (!role || (role !== "ADMIN" && role !== "USER")) {
        return NextResponse.redirect(new URL("/login", request.url));
      }

      // Restrict admin-only pages to ADMIN role
      if (ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
        if (role !== "ADMIN") {
          return NextResponse.redirect(new URL("/admin", request.url));
        }
      }
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Protect /auth/set-password — public route, no auth required (token-based)

  // Redirect logged-in users away from login page
  if (pathname === "/login") {
    const token = request.cookies.get("session")?.value;
    if (token) {
      try {
        await jwtVerify(token, secret);
        return NextResponse.redirect(new URL("/admin", request.url));
      } catch {
        // Invalid token, let them access login
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login", "/auth/:path*"],
};

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

const ADMIN_PATHS = ["/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin routes
  if (ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    const token = request.cookies.get("session")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/login", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Redirect logged-in admins away from login page
  if (pathname === "/login") {
    const token = request.cookies.get("session")?.value;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, secret);
        if (payload.role === "ADMIN") {
          return NextResponse.redirect(new URL("/admin", request.url));
        }
      } catch {
        // Invalid token, let them access login
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};

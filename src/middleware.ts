import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// API routes handle their own auth (requireSession/requireSuperAdmin/requireProjectAccess) and return
// JSON 401/403s — a redirect here would break fetch() calls, so only page
// routes are gated by this middleware.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password") {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token || token.inactive) {
    const url = new URL("/login", req.url);
    if (token?.inactive) url.searchParams.set("error", "deactivated");
    return NextResponse.redirect(url);
  }

  if (token.mustChangePassword && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  if (!token.mustChangePassword && pathname === "/change-password") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, isAuthConfigured, verifyCookie } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/login"];

export async function middleware(req: NextRequest) {
  // Wenn kein APP_PASSWORD/APP_SECRET gesetzt: Auth komplett deaktiviert
  // (sinnvoll für lokale Entwicklung ohne .env.local)
  if (!isAuthConfigured()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const ok = await verifyCookie(cookie);
  if (ok) return NextResponse.next();

  // API-Aufrufe → 401, Page-Aufrufe → Redirect
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Statische Assets + Next-Internals nicht matchen
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

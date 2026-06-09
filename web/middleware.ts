import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, isAuthConfigured, verifySession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/login", "/api/logout", "/api/setters/public"];

// Pfade, die nur Admins (Suche + Scraping + Team-Verwaltung) sehen dürfen.
// Alles andere ist für eingeloggte Setter erlaubt.
const ADMIN_ONLY_EXACT = new Set(["/"]);
const ADMIN_ONLY_PREFIXES = [
  "/settings",
  "/api/search",
  "/api/crawl-emails",
  "/api/settings",
  "/api/setters", // CRUD (Public-Endpoint liegt unter /api/setters/public)
  "/api/admin-password",
];

function isAdminOnly(path: string): boolean {
  if (ADMIN_ONLY_EXACT.has(path)) return true;
  return ADMIN_ONLY_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  if (!isAuthConfigured()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const session = await verifySession(cookie);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (!session.adm && isAdminOnly(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/lists";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

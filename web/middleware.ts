import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, isAuthConfigured, verifySession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/login", "/api/logout", "/api/setters/public"];

// Pfade, die nur Admins (Suche + Scraping + Team-Verwaltung) sehen dürfen.
// Alles andere ist für eingeloggte Setter erlaubt.
const ADMIN_ONLY_EXACT = new Set(["/"]);
const ADMIN_ONLY_PREFIXES = [
  "/settings",
  "/coverage",
  "/api/search",
  "/api/crawl-emails",
  "/api/settings",
  "/api/setters", // CRUD (Public-Endpoint liegt unter /api/setters/public)
  "/api/admin-password",
  "/api/usage",
  "/api/coverage",
  "/api/geocode",
];

function isAdminOnly(path: string): boolean {
  if (ADMIN_ONLY_EXACT.has(path)) return true;
  return ADMIN_ONLY_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

// =============================================================================
// Maschinen-Zugriff für den Sales Hub (Bearer-Token statt Login-Cookie)
// =============================================================================
// Least privilege: der Token darf NUR lesen + Enrichment auf Knopfdruck
// triggern – keine Mutationen, keine Settings, kein Scraping, keine Team-CRUD.
const MACHINE_GET_PREFIXES = ["/api/leads", "/api/qualified", "/api/lists"];
const MACHINE_POST_PREFIXES = [
  "/api/reviews",
  "/api/website-check",
  "/api/market-check",
  "/api/ranked-keywords",
  "/api/keyword-ideas",
  "/api/competitors",
];

function matchesPrefix(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}

function isMachineAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET") return matchesPrefix(path, MACHINE_GET_PREFIXES);
  if (m === "POST") return matchesPrefix(path, MACHINE_POST_PREFIXES);
  return false;
}

/** Konstantzeit-Vergleich (Edge-Runtime hat kein node:crypto). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function middleware(req: NextRequest) {
  if (!isAuthConfigured()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Maschinen-Token (Sales Hub): nur wenn ein Authorization-Header anliegt.
  // Browser-Requests ohne Header fallen unverändert auf die Cookie-Prüfung durch.
  const authHeader = req.headers.get("authorization");
  const machineToken = process.env.SCRAPER_API_TOKEN?.trim();
  if (authHeader?.startsWith("Bearer ")) {
    const provided = authHeader.slice(7).trim();
    if (machineToken && safeEqual(provided, machineToken)) {
      if (isMachineAllowed(req.method, pathname)) return NextResponse.next();
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

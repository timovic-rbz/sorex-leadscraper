import { NextResponse } from "next/server";
import { dbGetCachedCoord, dbSetCachedCoord } from "@/lib/db";
import { getSessionInfo } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Server-seitiges Geocoding via Nominatim (OSM). Cached pro Query in geo_cache.
 *
 * GET /api/geocode?q=Solingen
 *   → { lat, lng } oder { error }
 *
 * Nominatim verlangt einen aussagekräftigen User-Agent und respektiert ein
 * Rate Limit von ~1 req/s. Der Frontend-Loop ruft sequenziell mit kleinem
 * Sleep auf, sodass das hier keine Bedrohung wird.
 */
export async function GET(req: Request) {
  const info = await getSessionInfo();
  if (!info.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: "q fehlt" }, { status: 400 });

  // 1. Cache prüfen
  const cached = await dbGetCachedCoord(q);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  // 2. Nominatim fragen (Suchquery + Country-Hint DE)
  try {
    const params = new URLSearchParams({
      q: q + ", Deutschland",
      format: "json",
      limit: "1",
      countrycodes: "de",
    });
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        "User-Agent": "soreleads-coverage/1.0 (admin dashboard)",
        "Accept-Language": "de",
      },
    });
    if (!r.ok) {
      return NextResponse.json({ error: `Nominatim HTTP ${r.status}` }, { status: 502 });
    }
    const data = (await r.json()) as Array<{ lat: string; lon: string }>;
    if (data.length === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "ungültige Koordinaten" }, { status: 502 });
    }
    await dbSetCachedCoord(q, lat, lng);
    return NextResponse.json({ lat, lng, cached: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

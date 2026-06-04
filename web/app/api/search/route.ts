import { NextResponse } from "next/server";
import type { SearchRequest, Lead } from "@/lib/types";
import { searchOsm } from "@/lib/osm";
import { searchGoogle } from "@/lib/google-places";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Reine Places-Suche ohne E-Mail-Crawl. Hält das Function-Budget klein
 * genug, dass auch Vercel-Hobby (10s) zuverlässig zurückkommt.
 *
 * E-Mails kommen separat über /api/crawl-emails in Batches — sonst killt
 * Vercel die Function mitten im Crawl.
 */
export async function POST(req: Request) {
  let body: SearchRequest;
  try {
    body = (await req.json()) as SearchRequest;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const { ort, dienstleistung, source } = body;
  // Source-spezifisches Cap: Google Places API kann max 60 pro Text-Query
  // (3 Pages × 20, harte Grenze). OSM hat kein Limit; 200 ist freiwilliger
  // Schutz vor Overpass-Überlast und endlosem Email-Crawl.
  const sourceCap = source === "google" ? 60 : 200;
  const maxResults = Math.min(sourceCap, Math.max(5, Number(body.maxResults) || 20));
  if (!ort || !dienstleistung) {
    return NextResponse.json({ error: "ort und dienstleistung sind Pflicht" }, { status: 400 });
  }

  try {
    const leads: Lead[] =
      source === "google"
        ? await searchGoogle(dienstleistung, ort, maxResults)
        : await searchOsm(dienstleistung, ort, maxResults);

    return NextResponse.json({
      leads,
      totalFound: leads.length,
      withPhone: leads.filter((l) => l.telefon).length,
      withWebsite: leads.filter((l) => l.webseite).length,
      withEmail: leads.filter((l) => l.email).length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

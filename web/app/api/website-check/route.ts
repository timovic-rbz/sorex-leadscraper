import { NextResponse } from "next/server";
import { checkWebsite } from "@/lib/dataforseo";
import { dbGetLeadEnrichment, dbSaveLeadWebsite } from "@/lib/db";

export const runtime = "nodejs";
// Lighthouse kann lange dauern; das Modul bricht es nach 45s intern ab.
export const maxDuration = 60;

/**
 * POST /api/website-check
 *
 * Analysiert die Website eines Leads über DataForSEO. OnPage läuft immer,
 * Lighthouse nur wenn body.lighthouse=true (teuer/langsam). Ergebnis wird pro
 * Lead gecacht; ein Cache-Treffer ohne angeforderte Lighthouse-Daten wird neu
 * geladen.
 *
 * Body: { url: string, uid?, lighthouse?, force? }
 */
export async function POST(req: Request) {
  let body: { url?: string; uid?: string; lighthouse?: boolean; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "url erforderlich" }, { status: 400 });
  }

  // Cache: vorhandenen Check zurückgeben – außer es werden Lighthouse-Daten
  // verlangt, die der Cache noch nicht hat.
  if (body.uid && !body.force) {
    const cached = await dbGetLeadEnrichment(body.uid);
    const w = cached?.website;
    const lighthouseSatisfied = !body.lighthouse || w?.lhPerformance != null || !!w?.lighthouseError;
    if (w && lighthouseSatisfied) {
      return NextResponse.json({ check: w, cached: true, at: cached?.websiteAt });
    }
  }

  try {
    const check = await checkWebsite(url, { lighthouse: body.lighthouse });
    if (body.uid) await dbSaveLeadWebsite(body.uid, check);
    return NextResponse.json({ check, cached: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

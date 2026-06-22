import { NextResponse } from "next/server";
import { getKeywordIdeas } from "@/lib/dataforseo";
import { dbSaveLeadKeywordVolumes } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/keyword-ideas
 *
 * Keyword-Ideen für einen Seed (z.B. die Dienstleistung): wonach die Zielgruppe
 * sucht – die Begriffe, die Interessenten auf die Website bringen, inkl.
 * Suchvolumen. Ergebnis wird pro Lead gecacht (Anzeige beim erneuten Öffnen);
 * jeder Klick ist eine frische Recherche.
 *
 * Body: { seed: string, uid? }
 */
export async function POST(req: Request) {
  let body: { seed?: string; uid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const seed = body.seed?.trim();
  if (!seed) {
    return NextResponse.json({ error: "Seed-Keyword erforderlich" }, { status: 400 });
  }

  try {
    const volumes = await getKeywordIdeas(seed);
    if (body.uid) await dbSaveLeadKeywordVolumes(body.uid, volumes);
    return NextResponse.json({ volumes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
